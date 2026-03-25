import { CsvAdapter, TransformedProduct } from '../adapters/CsvAdapter';
import { prisma } from '../db/prisma';
import type { Prisma } from '@prisma/client';

const csv = new CsvAdapter();

export class ImportService {
  async createSession(filename: string, csvContent: string) {
    const rows = csv.parseAll(csvContent);
    return prisma.importSession.create({
      data: { filename, csvContent, rowCount: rows.length },
    });
  }

  async previewWithMapping(sessionId: string, mapping: Record<string, string>, limit = 10) {
    const session = await prisma.importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    const rows = csv.parsePreview(session.csvContent, limit);
    const sourceName = session.filename.replace(/\.csv$/i, '');
    return csv.transform(rows, mapping, sourceName);
  }

  async executeImport(
    sessionId: string,
    mapping: Record<string, string>,
    presetId?: string,
  ): Promise<{ created: number; updated: number; errors: unknown[]; total: number }> {
    const session = await prisma.importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    await prisma.importSession.update({
      where: { id: sessionId },
      data: { status: 'EXECUTING', mapping, presetId },
    });

    const rows = csv.parseAll(session.csvContent);
    const sourceName = session.filename.replace(/\.csv$/i, '');
    const transformed = csv.transform(rows, mapping, sourceName);

    const errors: { index: number; sku: string; error: string }[] = [];
    let created = 0;
    let updated = 0;

    for (let i = 0; i < transformed.length; i++) {
      const p = transformed[i];
      try {
        const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
        if (existing) {
          await prisma.product.update({
            where: { sku: p.sku },
            data: this.toUpdateInput(p),
          });
          updated++;
        } else {
          await prisma.product.create({ data: this.toCreateInput(p) });
          created++;
        }
      } catch (err) {
        errors.push({ index: i, sku: p.sku, error: String(err) });
      }
    }

    const finalStatus = errors.length === transformed.length ? 'ERROR' : 'DONE';
    await prisma.importSession.update({
      where: { id: sessionId },
      data: { status: finalStatus, productsCreated: created, errors },
    });

    return { created, updated, errors, total: transformed.length };
  }

  private toCreateInput(p: TransformedProduct): Prisma.ProductCreateInput {
    return {
      sku: p.sku,
      name: p.name,
      slug: `${p.slug}-${Date.now()}`,
      status: 'DRAFT',
      description: p.description,
      description_html: p.description_html,
      short_description: p.short_description,
      price: p.price ?? 0,
      compare_at_price: p.compare_at_price ?? null,
      currency: p.currency,
      stock_quantity: p.stock_quantity,
      stock_status: p.stock_status,
      weight_grams: p.weight_grams ?? null,
      length_cm: p.length_cm ?? null,
      width_cm: p.width_cm ?? null,
      height_cm: p.height_cm ?? null,
      meta_title: p.meta_title ?? null,
      meta_description: p.meta_description ?? null,
      attributes: p.attributes,
      tags: p.tags,
      source_name: p.source_name,
    };
  }

  private toUpdateInput(p: TransformedProduct): Prisma.ProductUpdateInput {
    return {
      name: p.name,
      description: p.description,
      description_html: p.description_html,
      short_description: p.short_description,
      price: p.price ?? 0,
      compare_at_price: p.compare_at_price ?? null,
      currency: p.currency,
      stock_quantity: p.stock_quantity,
      stock_status: p.stock_status,
      weight_grams: p.weight_grams ?? null,
      length_cm: p.length_cm ?? null,
      width_cm: p.width_cm ?? null,
      height_cm: p.height_cm ?? null,
      meta_title: p.meta_title ?? null,
      meta_description: p.meta_description ?? null,
      attributes: p.attributes,
      tags: p.tags,
      source_name: p.source_name,
    };
  }
}
