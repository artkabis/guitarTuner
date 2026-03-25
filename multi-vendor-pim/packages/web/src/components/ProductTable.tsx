import { useState } from 'react';
import type { Product, ProductStatus } from '../types';

const STATUS_BADGE: Record<ProductStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEW: 'bg-amber-100 text-amber-700',
  PUBLISHED: 'bg-green-100 text-green-700',
};

const STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: 'Brouillon',
  REVIEW: 'À réviser',
  PUBLISHED: 'Publié',
};

interface Props {
  products: Product[];
  selectable?: boolean;
  selected?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
  onEdit?: (product: Product) => void;
  editingId?: string | null;
  onSave?: (id: string, data: Partial<Product>) => void;
}

export function ProductTable({
  products,
  selectable,
  selected,
  onSelect,
  onSelectAll,
  onEdit,
  editingId,
  onSave,
}: Props) {
  const [editValues, setEditValues] = useState<Partial<Product>>({});

  const startEdit = (p: Product) => {
    setEditValues({ name: p.name, price: p.price, stock_quantity: p.stock_quantity });
    onEdit?.(p);
  };

  const saveEdit = (id: string) => {
    onSave?.(id, editValues);
    setEditValues({});
  };

  const allSelected = products.length > 0 && products.every(p => selected?.has(p.id));

  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
        Aucun produit trouvé.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
        <thead className="bg-gray-50">
          <tr>
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={e => onSelectAll?.(e.target.checked)}
                  className="rounded"
                />
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prix</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
            {onEdit && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {products.map(p => {
            const isEditing = editingId === p.id;
            return (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                {selectable && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected?.has(p.id) ?? false}
                      onChange={e => onSelect?.(p.id, e.target.checked)}
                      className="rounded"
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-mono text-gray-500">{p.sku}</td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {isEditing ? (
                    <input
                      value={editValues.name ?? ''}
                      onChange={e => setEditValues(v => ({ ...v, name: e.target.value }))}
                      className="border border-indigo-300 rounded px-2 py-0.5 text-sm w-full focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  ) : (
                    p.name
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {isEditing ? (
                    <input
                      type="number"
                      value={editValues.price ?? ''}
                      onChange={e => setEditValues(v => ({ ...v, price: parseFloat(e.target.value) }))}
                      className="border border-indigo-300 rounded px-2 py-0.5 text-sm w-24 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  ) : (
                    `${p.price} ${p.currency}`
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {isEditing ? (
                    <input
                      type="number"
                      value={editValues.stock_quantity ?? ''}
                      onChange={e =>
                        setEditValues(v => ({ ...v, stock_quantity: parseInt(e.target.value, 10) }))
                      }
                      className="border border-indigo-300 rounded px-2 py-0.5 text-sm w-20 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  ) : (
                    p.stock_quantity
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{p.source_name ?? '—'}</td>
                {onEdit && (
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <button
                        onClick={() => saveEdit(p.id)}
                        className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                      >
                        Sauver
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(p)}
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        Modifier
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
