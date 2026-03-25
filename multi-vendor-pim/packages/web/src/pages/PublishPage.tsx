import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProductTable } from '../components/ProductTable';
import { getProducts } from '../api/products';
import { getConnections } from '../api/connections';
import { startExport, getExportJob } from '../api/exports';
import type { ExportJob } from '../types';

export function PublishPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set<string>());
  const [connectionId, setConnectionId] = useState('');
  const [job, setJob] = useState<ExportJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: productData, isLoading } = useQuery({
    queryKey: ['products', 'REVIEW'],
    queryFn: () => getProducts({ status: 'REVIEW', limit: 200 }),
  });

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: getConnections,
  });

  const exportMutation = useMutation({
    mutationFn: () => startExport([...selected], connectionId),
    onSuccess: async ({ jobId }) => {
      const initial = await getExportJob(jobId);
      setJob(initial);
      // Poll for progress every 2 seconds
      pollRef.current = setInterval(async () => {
        const updated = await getExportJob(jobId);
        setJob(updated);
        if (updated.status === 'DONE' || updated.status === 'ERROR') {
          clearInterval(pollRef.current!);
          qc.invalidateQueries({ queryKey: ['products'] });
          setSelected(new Set());
        }
      }, 2000);
    },
  });

  // Clean up polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const products = productData?.products ?? [];
  const total = productData?.total ?? 0;

  const handleSelect = (id: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set(products.map(p => p.id)) : new Set());
  };

  const canExport = selected.size > 0 && connectionId && !exportMutation.isPending && job?.status !== 'RUNNING';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Publication WooCommerce</h1>
        <p className="text-gray-500 text-sm mt-1">
          {total} produit{total !== 1 ? 's' : ''} prêt{total !== 1 ? 's' : ''} à publier (statut "À réviser").
        </p>
      </div>

      {/* Connection selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
          Site WooCommerce
        </label>
        {!connections || connections.length === 0 ? (
          <span className="text-sm text-gray-400">
            Aucune connexion configurée —{' '}
            <a href="/settings" className="text-indigo-600 hover:underline">
              Ajouter dans Paramètres
            </a>
          </span>
        ) : (
          <select
            value={connectionId}
            onChange={e => setConnectionId(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">— Choisir un site —</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.url})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Export job progress */}
      {job && (
        <div
          className={`rounded-xl border p-4 ${
            job.status === 'DONE'
              ? 'bg-green-50 border-green-200'
              : job.status === 'ERROR'
                ? 'bg-red-50 border-red-200'
                : 'bg-blue-50 border-blue-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {job.status === 'DONE' && '✅ Export terminé'}
              {job.status === 'ERROR' && '❌ Export échoué'}
              {job.status === 'RUNNING' && '⏳ Export en cours…'}
              {job.status === 'PENDING' && '🕐 En attente…'}
            </span>
            <span className="text-sm text-gray-600">
              {job.exported} / {job.total}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                job.status === 'ERROR' ? 'bg-red-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${job.total > 0 ? (job.exported / job.total) * 100 : 0}%` }}
            />
          </div>
          {job.errors.length > 0 && (
            <details className="mt-3">
              <summary className="text-sm text-red-600 cursor-pointer">
                {job.errors.length} erreur(s)
              </summary>
              <ul className="mt-2 space-y-1">
                {job.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-600 font-mono">
                    {JSON.stringify(e)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Product table */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <ProductTable
          products={products}
          selectable
          selected={selected}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
        />
      )}

      {/* Export button */}
      {products.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {selected.size > 0 ? `${selected.size} produit(s) sélectionné(s)` : 'Sélectionnez des produits'}
          </span>
          <button
            onClick={() => exportMutation.mutate()}
            disabled={!canExport}
            className="bg-indigo-600 text-white rounded-lg px-6 py-2.5 font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            Publier sur WooCommerce
          </button>
        </div>
      )}
    </div>
  );
}
