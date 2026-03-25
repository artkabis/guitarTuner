import type { UploadResponse, ImportResult } from '../types';

export async function uploadCsv(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/imports/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<UploadResponse>;
}

export async function previewImport(
  sessionId: string,
  mapping: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/imports/${sessionId}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapping }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json() as Promise<Record<string, unknown>[]>;
}

export async function executeImport(
  sessionId: string,
  mapping: Record<string, string>,
  presetId?: string,
): Promise<ImportResult> {
  const res = await fetch(`/api/imports/${sessionId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapping, presetId }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json() as Promise<ImportResult>;
}
