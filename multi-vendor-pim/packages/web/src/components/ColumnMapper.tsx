import { useState } from 'react';

const PRODUCT_FIELDS = [
  { value: '__ignore__', label: '— Ignorer —' },
  { value: 'sku', label: 'SKU' },
  { value: 'name', label: 'Nom' },
  { value: 'slug', label: 'Slug URL' },
  { value: 'description', label: 'Description' },
  { value: 'description_html', label: 'Description HTML' },
  { value: 'short_description', label: 'Description courte' },
  { value: 'price', label: 'Prix' },
  { value: 'compare_at_price', label: 'Prix barré' },
  { value: 'currency', label: 'Devise' },
  { value: 'stock_quantity', label: 'Stock (quantité)' },
  { value: 'stock_status', label: 'Statut stock' },
  { value: 'weight_grams', label: 'Poids (grammes)' },
  { value: 'length_cm', label: 'Longueur (cm)' },
  { value: 'width_cm', label: 'Largeur (cm)' },
  { value: 'height_cm', label: 'Hauteur (cm)' },
  { value: 'meta_title', label: 'Titre SEO' },
  { value: 'meta_description', label: 'Description SEO' },
  { value: 'tags', label: 'Tags (séparés par virgule)' },
];

interface Props {
  headers: string[];
  initialMapping: Record<string, string>;
  preview: Record<string, string>[];
  onChange: (mapping: Record<string, string>) => void;
}

export function ColumnMapper({ headers, initialMapping, preview, onChange }: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);

  const update = (csvCol: string, field: string) => {
    const next = { ...mapping, [csvCol]: field };
    setMapping(next);
    onChange(next);
  };

  const isAttr = (field: string) =>
    field.startsWith('__attr__') || (!PRODUCT_FIELDS.find(f => f.value === field) && field !== '__ignore__');

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-3 gap-3 text-xs font-medium text-gray-500 uppercase tracking-wide px-1 mb-2">
        <span>Colonne CSV</span>
        <span>Champ produit</span>
        <span>Exemple</span>
      </div>
      {headers.map(header => {
        const currentField = mapping[header] ?? '__ignore__';
        const example = preview[0]?.[header] ?? '';
        const isAttribute = isAttr(currentField);

        return (
          <div
            key={header}
            className="grid grid-cols-3 gap-3 items-center bg-white rounded-lg border border-gray-200 px-3 py-2"
          >
            <span className="text-sm font-mono text-gray-700 truncate" title={header}>
              {header}
            </span>
            <div className="flex items-center gap-2">
              <select
                value={PRODUCT_FIELDS.find(f => f.value === currentField) ? currentField : '__attr__'}
                onChange={e => {
                  if (e.target.value === '__attr__') {
                    update(header, `__attr__${header.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
                  } else {
                    update(header, e.target.value);
                  }
                }}
                className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {PRODUCT_FIELDS.map(f => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
                <option value="__attr__">Attribut personnalisé</option>
              </select>
              {isAttribute && currentField !== '__ignore__' && (
                <span className="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 whitespace-nowrap">
                  attribut
                </span>
              )}
            </div>
            <span className="text-sm text-gray-400 truncate font-mono" title={example}>
              {example}
            </span>
          </div>
        );
      })}
    </div>
  );
}
