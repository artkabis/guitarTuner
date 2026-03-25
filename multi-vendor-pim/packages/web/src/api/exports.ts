import { api } from './client';
import type { ExportJob } from '../types';

export const startExport = (productIds: string[], connectionId: string) =>
  api.post<{ jobId: string; status: string }>('/api/exports', { productIds, connectionId });

export const getExportJob = (jobId: string) =>
  api.get<ExportJob>(`/api/exports/${jobId}`);
