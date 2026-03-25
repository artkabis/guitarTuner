import { api } from './client';
import type { WooCommerceConnection } from '../types';

export const getConnections = () =>
  api.get<WooCommerceConnection[]>('/api/connections');

export const createConnection = (data: {
  name: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
}) => api.post<WooCommerceConnection>('/api/connections', data);

export const deleteConnection = (id: string) =>
  api.delete<{ deleted: boolean }>(`/api/connections/${id}`);
