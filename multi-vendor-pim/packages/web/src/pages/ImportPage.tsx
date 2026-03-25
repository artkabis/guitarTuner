import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ColumnMapper } from '../components/ColumnMapper';
import { getMappings, createMapping } from '../api/mappings';
import { uploadCsv, previewImport, executeImport } from '../api/imports';
import type { UploadResponse } from '../types';

type Step = 'upload' | 'mapping' | 'done';

export function ImportPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [session, setSession] = useState<UploadResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [savePresetName, setSavePresetName] = useState('');
  const [result, setResult] = useState<{ created: number; updated: number; errors: unknown[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: presets } = useQuery({ queryKey: ['mappings'], queryFn: getMappings });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadCsv(file),
    onSuccess: (data) => {
      setSession(data);
      setMapping(data.suggestions);
      setStep('mapping');
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const executeMutation = useMutation({
    mutationFn: () => executeImport(session!.sessionId, mapping),
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const savePresetMutation = useMutation({
    mutationFn: () => createMapping(savePresetName, mapping),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mappings'] });
      setSavePresetName('');
    },
  });

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Le fichier doit être au format CSV.');
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Import CSV</h1>
        <p className="text-gray-500 text-sm mt-1">Importez vos produits depuis un fichier CSV fournisseur.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── STEP 1: Upload ─────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-4">
          {presets && presets.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Utiliser un mapping sauvegardé</p>
              <div className="flex flex-wrap gap-2">
                {presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      fileRef.current?.click();
                    }}
                    className="text-sm border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg px-3 py-1.5 hover:bg-indigo-100"
                    title="Sélectionner ce preset puis choisir un fichier"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <div className="text-4xl mb-3">📄</div>
            <p className="text-gray-700 font-medium">
              {uploadMutation.isPending ? 'Chargement…' : 'Glissez un fichier CSV ou cliquez pour parcourir'}
            </p>
            <p className="text-gray-400 text-sm mt-1">Taille max. 10 Mo</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {/* ── STEP 2: Mapping ────────────────────────────────────────────────── */}
      {step === 'mapping' && session && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{session.rowCount} lignes détectées</p>
              <p className="text-sm text-gray-500">Vérifiez le mapping des colonnes ci-dessous.</p>
            </div>
            <button
              onClick={() => { setStep('upload'); setSession(null); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Changer de fichier
            </button>
          </div>

          <ColumnMapper
            headers={session.headers}
            initialMapping={session.suggestions}
            preview={session.preview}
            onChange={setMapping}
          />

          <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4">
            <input
              type="text"
              placeholder="Nom du preset (optionnel)"
              value={savePresetName}
              onChange={e => setSavePresetName(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              disabled={!savePresetName.trim() || savePresetMutation.isPending}
              onClick={() => savePresetMutation.mutate()}
              className="text-sm border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-40"
            >
              Sauvegarder le mapping
            </button>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending}
              className="bg-indigo-600 text-white rounded-lg px-6 py-2.5 font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {executeMutation.isPending ? 'Import en cours…' : `Importer ${session.rowCount} produits`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Done ───────────────────────────────────────────────────── */}
      {step === 'done' && result && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-semibold text-gray-900">Import terminé</h2>
          <p className="text-gray-600">
            <span className="font-medium text-green-700">{result.created}</span> créés,{' '}
            <span className="font-medium text-blue-700">{result.updated}</span> mis à jour
            {result.errors.length > 0 && (
              <span className="text-red-600">, {result.errors.length} erreur(s)</span>
            )}
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => { setStep('upload'); setSession(null); setResult(null); }}
              className="border border-gray-200 rounded-lg px-5 py-2 text-sm hover:bg-gray-50"
            >
              Nouvel import
            </button>
            <button
              onClick={() => navigate('/review')}
              className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-indigo-700"
            >
              Réviser les produits →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
