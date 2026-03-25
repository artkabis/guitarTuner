import { parse } from 'csv-parse/sync';

// Maps canonical product fields to common CSV column name variants
const FIELD_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'ref', 'reference', 'code', 'id', 'product_id', 'article', 'codearticle', 'code_article'],
  name: ['name', 'title', 'nom', 'designation', 'libelle', 'product_name', 'titre', 'intitule'],
  slug: ['slug', 'handle', 'url', 'permalink'],
  description: ['description', 'desc', 'details', 'body', 'content', 'texte', 'body_html'],
  description_html: ['description_html', 'html_description', 'desc_html'],
  short_description: ['short_description', 'resume', 'extrait', 'accroche', 'short_desc', 'excerpt'],
  price: ['price', 'prix', 'regular_price', 'tarif', 'cout', 'prix_ht', 'price_ht', 'pvht'],
  compare_at_price: ['compare_at_price', 'prix_barre', 'prix_original', 'old_price', 'compare_price'],
  stock_quantity: ['stock', 'quantity', 'qty', 'quantite', 'qte', 'stock_quantity', 'inventory', 'qt'],
  weight_grams: ['weight', 'poids', 'weight_grams', 'masse', 'weight_g'],
  length_cm: ['length', 'longueur', 'length_cm', 'long'],
  width_cm: ['width', 'largeur', 'width_cm', 'larg'],
  height_cm: ['height', 'hauteur', 'height_cm', 'haut'],
  meta_title: ['meta_title', 'seo_title', 'titre_seo', 'page_title'],
  meta_description: ['meta_description', 'seo_description', 'desc_seo', 'meta_desc'],
  tags: ['tags', 'etiquettes', 'mots_cles', 'keywords', 'labels'],
  images: ['image', 'images', 'photo', 'photos', 'image_url', 'image_src', 'picture'],
};

const CORE_FIELDS = new Set([
  'sku', 'name', 'slug', 'description', 'description_html', 'short_description',
  'price', 'compare_at_price', 'currency', 'stock_quantity', 'stock_status',
  'weight_grams', 'length_cm', 'width_cm', 'height_cm',
  'meta_title', 'meta_description', 'tags', 'images',
]);

export interface TransformedProduct {
  sku: string;
  name: string;
  slug: string;
  status: 'DRAFT';
  description?: string;
  description_html?: string;
  short_description?: string;
  price: number;
  compare_at_price?: number;
  currency: string;
  stock_quantity: number;
  stock_status: 'INSTOCK' | 'OUTOFSTOCK' | 'ONBACKORDER';
  weight_grams?: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  meta_title?: string;
  meta_description?: string;
  attributes: Record<string, unknown>;
  tags: string[];
  source_name: string;
}

export class CsvAdapter {
  parseHeaders(csvContent: string): string[] {
    const records = parse(csvContent, { columns: false, skip_empty_lines: true, to: 1 }) as string[][];
    return records[0] ?? [];
  }

  parsePreview(csvContent: string, limit = 5): Record<string, string>[] {
    return parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      to: limit,
      cast: false,
      trim: true,
    }) as Record<string, string>[];
  }

  parseAll(csvContent: string): Record<string, string>[] {
    return parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      cast: false,
      trim: true,
    }) as Record<string, string>[];
  }

  suggestMapping(headers: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    const usedFields = new Set<string>();

    for (const header of headers) {
      const normalized = header
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s\-]/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (usedFields.has(field)) continue;
        if (aliases.some(a => normalized === a || normalized.endsWith(`_${a}`) || normalized.startsWith(`${a}_`))) {
          result[header] = field;
          usedFields.add(field);
          break;
        }
      }
      // Unmapped columns go to attributes by default (user can change)
      if (!result[header]) {
        result[header] = `__attr__${normalized}`;
      }
    }
    return result;
  }

  transform(
    rows: Record<string, string>[],
    mapping: Record<string, string>,
    sourceName: string,
  ): TransformedProduct[] {
    return rows.map((row, index) => {
      const attrs: Record<string, unknown> = {};
      const product: Partial<TransformedProduct> & { attributes: Record<string, unknown> } = {
        status: 'DRAFT',
        source_name: sourceName,
        attributes: attrs,
        tags: [],
        currency: 'EUR',
        stock_quantity: 0,
        stock_status: 'INSTOCK',
        price: 0,
      };

      for (const [csvCol, productField] of Object.entries(mapping)) {
        if (productField === '__ignore__') continue;
        const value = row[csvCol];
        if (value === undefined || value === '') continue;

        if (productField.startsWith('__attr__')) {
          attrs[productField.replace('__attr__', '')] = value;
          continue;
        }

        switch (productField) {
          case 'tags':
            product.tags = value.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
            break;
          case 'price':
          case 'compare_at_price': {
            const num = parseFloat(value.replace(',', '.').replace(/[^0-9.]/g, ''));
            if (!isNaN(num)) (product as Record<string, unknown>)[productField] = num;
            break;
          }
          case 'stock_quantity': {
            const qty = parseInt(value, 10);
            product.stock_quantity = isNaN(qty) ? 0 : qty;
            break;
          }
          case 'weight_grams':
          case 'length_cm':
          case 'width_cm':
          case 'height_cm': {
            const dim = parseFloat(value.replace(',', '.'));
            if (!isNaN(dim)) (product as Record<string, unknown>)[productField] = dim;
            break;
          }
          default:
            if (CORE_FIELDS.has(productField)) {
              (product as Record<string, unknown>)[productField] = value;
            } else {
              attrs[productField] = value;
            }
        }
      }

      if (!product.slug && product.name) {
        product.slug = slugify(product.name);
      }
      if (!product.sku) {
        product.sku = `IMPORT-${Date.now()}-${index + 1}`;
      }
      if (!product.name) {
        product.name = product.sku;
      }
      if (product.stock_quantity === 0) {
        product.stock_status = 'OUTOFSTOCK';
      }

      return product as TransformedProduct;
    });
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
