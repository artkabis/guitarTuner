import { api } from './client';
import type { CsvMappingPreset } from '../types';

export const getMappings = () =>
  api.get<CsvMappingPreset[]>('/api/mappings');

export const createMapping = (name: string, mapping: Record<string, string>) =>
  api.post<CsvMappingPreset>('/api/mappings', { name, mapping });

export const deleteMapping = (id: string) =>
  api.delete<{ deleted: boolean }>(`/api/mappings/${id}`);
