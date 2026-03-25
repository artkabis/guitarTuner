import type { Product, Image } from '@prisma/client';
import { EncryptionService } from '../services/EncryptionService';
import { prisma } from '../db/prisma';

interface WCProductPayload {
  name: string;
  slug: string;
  status: 'publish';
  description: string;
  short_description: string;
  sku: string;
  regular_price: string;
  sale_price: string;
  manage_stock: boolean;
  stock_quantity: number;
  stock_status: string;
  weight: string;
  dimensions: { length: string; width: string; height: string };
  meta_data: { key: string; value: string }[];
  tags: { name: string }[];
  images: { src: string; alt: string }[];
}

export interface ExportResult {
  productId: string;
  wcId?: number;
  success: boolean;
  error?: string;
}

export class WooCommerceExporter {
  private enc = new EncryptionService();

  async exportProducts(
    products: (Product & { images: Image[] })[],
    connectionId: string,
    jobId: string,
  ): Promise<ExportResult[]> {
    const connection = await prisma.wooCommerceConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });

    const consumerKey = this.enc.decrypt(connection.consumerKey);
    const consumerSecret = this.enc.decrypt(connection.consumerSecret);
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = connection.url.replace(/\/$/, '');

    const results: ExportResult[] = [];

    for (const product of products) {
      try {
        const payload = this.toWCPayload(product);
        const response = await fetch(`${baseUrl}/wp-json/wc/v3/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          results.push({
            productId: product.id,
            success: false,
            error: `WC ${response.status}: ${errorBody}`,
          });
        } else {
          const data = (await response.json()) as { id: number };
          results.push({ productId: product.id, wcId: data.id, success: true });
        }
      } catch (err) {
        results.push({ productId: product.id, success: false, error: String(err) });
      }

      await prisma.exportJob.update({
        where: { id: jobId },
        data: {
          exported: results.filter(r => r.success).length,
          errors: results.filter(r => !r.success),
        },
      });
    }

    return results;
  }

  private toWCPayload(product: Product & { images: Image[] }): WCProductPayload {
    const attrs = (product.attributes ?? {}) as Record<string, unknown>;

    return {
      name: product.name,
      slug: product.slug,
      status: 'publish',
      description: product.description_html ?? product.description ?? '',
      short_description: product.short_description ?? '',
      sku: product.sku,
      regular_price: product.price?.toString() ?? '0',
      sale_price: product.compare_at_price?.toString() ?? '',
      manage_stock: true,
      stock_quantity: product.stock_quantity,
      stock_status: product.stock_status.toLowerCase(),
      weight: product.weight_grams ? (product.weight_grams / 1000).toFixed(3) : '',
      dimensions: {
        length: product.length_cm?.toString() ?? '',
        width: product.width_cm?.toString() ?? '',
        height: product.height_cm?.toString() ?? '',
      },
      // Vendor-specific fields → WooCommerce meta_data
      meta_data: Object.entries(attrs).map(([key, value]) => ({
        key,
        value: String(value),
      })),
      tags: product.tags.map(name => ({ name })),
      images: product.images
        .sort((a, b) => a.position - b.position)
        .map(img => ({ src: img.url, alt: img.alt ?? '' })),
    };
  }
}
