import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProductTable } from '../components/ProductTable';
import { getProducts, updateProduct, bulkUpdateStatus, deleteProduct } from '../api/products';
import type { Product, ProductStatus } from '../types';

const STATUS_OPTIONS: { value: ProductStatus | ''; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'REVIEW', label: 'À réviser' },
  { value: 'PUBLISHED', label: 'Publié' },
];

export function ReviewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<ProductStatus | ''>('DRAFT');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set<string>());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['products', statusFilter, search, page],
    queryFn: () => getProducts({ status: statusFilter || undefined, search: search || undefined, page }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) => updateProduct(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditingId(null);
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: ProductStatus }) =>
      bulkUpdateStatus(ids, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setSelected(new Set());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const handleSelect = (id: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set(data?.products.map(p => p.id) ?? []) : new Set());
  };

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / (data?.limit ?? 50));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Révision des produits</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} produit{total !== 1 ? 's' : ''} — corrigez les champs incomplets avant publication.
          </p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => navigate('/publish')}
            className="bg-indigo-600 text-white rounded-lg px-5 py-2.5 font-medium hover:bg-indigo-700"
          >
            Publier la sélection ({selected.size}) →
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value as ProductStatus | ''); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Rechercher par nom ou SKU…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-indigo-50 rounded-lg px-4 py-2.5">
          <span className="text-sm text-indigo-700 font-medium">{selected.size} sélectionné(s)</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => bulkMutation.mutate({ ids: [...selected], status: 'REVIEW' })}
              className="text-sm border border-amber-300 bg-amber-50 text-amber-700 rounded-lg px-3 py-1.5 hover:bg-amber-100"
            >
              Marquer À réviser
            </button>
            <button
              onClick={() => bulkMutation.mutate({ ids: [...selected], status: 'DRAFT' })}
              className="text-sm border border-gray-200 bg-white text-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50"
            >
              Remettre en Brouillon
            </button>
            <button
              onClick={() => {
                if (confirm(`Supprimer ${selected.size} produit(s) ?`)) {
                  [...selected].forEach(id => deleteMutation.mutate(id));
                  setSelected(new Set());
                }
              }}
              className="text-sm border border-red-200 bg-red-50 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-100"
            >
              Supprimer
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <ProductTable
          products={products}
          selectable
          selected={selected}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onEdit={p => setEditingId(p.id)}
          editingId={editingId}
          onSave={(id, data) => editMutation.mutate({ id, data })}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="border border-gray-200 rounded-lg px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            ← Précédent
          </button>
          <span className="text-sm text-gray-500">
            Page {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="border border-gray-200 rounded-lg px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}
