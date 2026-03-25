import { api } from './client';
import type { Product, ProductsResponse, ProductStatus } from '../types';

export const getProducts = (params: {
  status?: ProductStatus;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  return api.get<ProductsResponse>(`/api/products?${qs}`);
};

export const updateProduct = (id: string, data: Partial<Product>) =>
  api.patch<Product>(`/api/products/${id}`, data);

export const bulkUpdateStatus = (ids: string[], status: ProductStatus) =>
  api.post<{ updated: number }>('/api/products/bulk-status', { ids, status });

export const deleteProduct = (id: string) =>
  api.delete<{ deleted: boolean }>(`/api/products/${id}`);
