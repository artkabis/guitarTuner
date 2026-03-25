export type ProductStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED';
export type StockStatus = 'INSTOCK' | 'OUTOFSTOCK' | 'ONBACKORDER';

export interface Image {
  id: string;
  url: string;
  alt?: string;
  position: number;
  productId: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  status: ProductStatus;
  description?: string;
  description_html?: string;
  short_description?: string;
  price: number;
  compare_at_price?: number;
  currency: string;
  stock_quantity: number;
  stock_status: StockStatus;
  weight_grams?: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  meta_title?: string;
  meta_description?: string;
  attributes: Record<string, unknown>;
  tags: string[];
  source_name?: string;
  images: Image[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
}

export interface WooCommerceConnection {
  id: string;
  name: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  createdAt: string;
}

export interface CsvMappingPreset {
  id: string;
  name: string;
  mapping: Record<string, string>;
  createdAt: string;
}

export interface UploadResponse {
  sessionId: string;
  headers: string[];
  preview: Record<string, string>[];
  suggestions: Record<string, string>;
  rowCount: number;
}

export interface ImportSession {
  id: string;
  filename: string;
  rowCount: number;
  status: 'PENDING' | 'EXECUTING' | 'DONE' | 'ERROR';
  productsCreated: number;
  errors: { index: number; sku: string; error: string }[];
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: { index: number; sku: string; error: string }[];
  total: number;
}

export interface ExportJob {
  id: string;
  connectionId: string;
  productIds: string[];
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR';
  total: number;
  exported: number;
  errors: { productId: string; error: string }[];
}
