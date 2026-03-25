import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConnections, createConnection, deleteConnection } from '../api/connections';
import { getMappings, deleteMapping } from '../api/mappings';

function ConnectionSection() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', url: '', consumerKey: '', consumerSecret: '' });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const { data: connections } = useQuery({ queryKey: ['connections'], queryFn: getConnections });

  const createMutation = useMutation({
    mutationFn: () => createConnection(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setForm({ name: '', url: '', consumerKey: '', consumerSecret: '' });
      setOpen(false);
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Connexions WooCommerce</h2>
        <button
          onClick={() => setOpen(o => !o)}
          className="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700"
        >
          {open ? 'Annuler' : '+ Ajouter'}
        </button>
      </div>

      {open && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-700">Nouvelle connexion</h3>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {[
            { key: 'name', label: 'Nom affiché', placeholder: 'Mon site WooCommerce', type: 'text' },
            { key: 'url', label: 'URL du site', placeholder: 'https://monsite.com', type: 'url' },
            { key: 'consumerKey', label: 'Consumer Key', placeholder: 'ck_…', type: 'text' },
            { key: 'consumerSecret', label: 'Consumer Secret', placeholder: 'cs_…', type: 'password' },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <input
                type={type}
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          ))}
          <p className="text-xs text-gray-400">
            Générez vos clés dans WooCommerce → Réglages → Avancé → REST API.
          </p>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}

      {connections && connections.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {connections.map(c => (
            <div key={c.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400">{c.url}</p>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Supprimer la connexion "${c.name}" ?`)) {
                    deleteMutation.mutate(c.id);
                  }
                }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Aucune connexion configurée.</p>
      )}
    </section>
  );
}

function MappingPresetsSection() {
  const qc = useQueryClient();
  const { data: presets } = useQuery({ queryKey: ['mappings'], queryFn: getMappings });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMapping(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mappings'] }),
  });

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-gray-900">Presets de mapping CSV</h2>
      {presets && presets.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {presets.map(p => (
            <div key={p.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {Object.keys(p.mapping).length} colonne(s) mappée(s)
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Supprimer le preset "${p.name}" ?`)) {
                    deleteMutation.mutate(p.id);
                  }
                }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">
          Aucun preset sauvegardé. Créez-en un lors d'un import.
        </p>
      )}
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-10">
      <h1 className="text-2xl font-semibold text-gray-900">Paramètres</h1>
      <ConnectionSection />
      <MappingPresetsSection />
    </div>
  );
}
