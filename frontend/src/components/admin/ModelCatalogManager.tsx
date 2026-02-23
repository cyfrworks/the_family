import { useState } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { cyfrCall } from '../../lib/cyfr';
import { getAccessToken } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { useModels } from '../../hooks/useModels';
import { PROVIDER_LABELS, PROVIDER_COLORS } from '../../config/constants';
import { AddModelModal } from './AddModelModal';
import type { CatalogModel, Provider } from '../../lib/types';
import { toast } from 'sonner';

const ADMIN_API_REF = 'formula:local.admin-api:0.1.0';

function EditRow({ entry, onSaved }: { entry: CatalogModel; onSaved: () => void }) {
  const { models, loading: modelsLoading } = useModels();
  const [alias, setAlias] = useState(entry.alias);
  const [model, setModel] = useState(entry.model);
  const [minTier, setMinTier] = useState(entry.min_tier);
  const [sortOrder, setSortOrder] = useState(entry.sort_order);
  const [saving, setSaving] = useState(false);

  const providerModels = models[entry.provider as Provider] ?? [];
  // Include the current model even if it's not in the discovered list
  const modelOptions = providerModels.includes(entry.model)
    ? providerModels
    : [entry.model, ...providerModels];

  async function save() {
    setSaving(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: { registry: ADMIN_API_REF },
        input: {
          action: 'catalog_update',
          access_token: accessToken,
          catalog_id: entry.id,
          catalog_updates: { alias, model, min_tier: minTier, sort_order: sortOrder },
        },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      toast.success('Catalog entry updated.');
      onSaved();
    } catch {
      toast.error('Failed to update entry.');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-gold-600/50 bg-stone-800/50 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-stone-400 mb-1">Alias</label>
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="w-full rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100 focus:border-gold-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">Model ID</label>
          {modelsLoading ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-stone-500">
              <Loader2 size={12} className="animate-spin" />
              Loading...
            </div>
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100 focus:border-gold-600 focus:outline-none"
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">Min Tier</label>
          <select
            value={minTier}
            onChange={(e) => setMinTier(e.target.value as 'boss' | 'associate')}
            className="w-full rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100 focus:border-gold-600 focus:outline-none"
          >
            <option value="associate">Associate (everyone)</option>
            <option value="boss">Boss+</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">Sort Order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
            className="w-full rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100 focus:border-gold-600 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-gold-600 px-3 py-1.5 text-xs font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function ModelCatalogManager() {
  const { user } = useAuth();
  const { catalogModels, loading, refetch } = useModelCatalog();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleAdd(data: { provider: Provider; alias: string; model: string; min_tier: 'boss' | 'associate'; sort_order: number }) {
    if (!user) return;

    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: { registry: ADMIN_API_REF },
      input: {
        action: 'catalog_add',
        access_token: accessToken,
        catalog_entry: data,
      },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    toast.success(`${PROVIDER_LABELS[data.provider]} / ${data.alias} added to catalog.`);
    setShowAdd(false);
    refetch();
  }

  async function toggleActive(entry: CatalogModel) {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: { registry: ADMIN_API_REF },
      input: {
        action: 'catalog_toggle',
        access_token: accessToken,
        catalog_id: entry.id,
      },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) return;

    refetch();
  }

  async function deleteEntry(entry: CatalogModel) {
    if (!confirm(`Delete "${PROVIDER_LABELS[entry.provider]} / ${entry.alias}"? Members using this model will break.`)) return;
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: { registry: ADMIN_API_REF },
        input: {
          action: 'catalog_delete',
          access_token: accessToken,
          catalog_id: entry.id,
        },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      toast.success('Catalog entry deleted.');
      refetch();
    } catch {
      toast.error('Cannot delete — members are still using this model.');
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-stone-500">Loading catalog...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-400">
          {catalogModels.length} model{catalogModels.length !== 1 ? 's' : ''} in catalog
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-gold-600 px-3 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 transition-colors"
        >
          <Plus size={16} />
          Add Model
        </button>
      </div>

      {catalogModels.length === 0 ? (
        <div className="py-8 text-center text-stone-500">
          No models in catalog. Add some for your Family.
        </div>
      ) : (
        <div className="space-y-2">
          {catalogModels.map((entry) => (
            <div key={entry.id}>
              {editingId === entry.id ? (
                <EditRow
                  entry={entry}
                  onSaved={() => {
                    setEditingId(null);
                    refetch();
                  }}
                />
              ) : (
                <div
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    entry.is_active ? 'border-stone-800 bg-stone-900' : 'border-stone-800/50 bg-stone-900/50 opacity-60'
                  }`}
                >
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${PROVIDER_COLORS[entry.provider]}`}
                  >
                    {PROVIDER_LABELS[entry.provider]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-stone-100">{entry.alias}</span>
                    <span className="ml-2 text-xs text-stone-500 font-mono">{entry.model}</span>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    entry.min_tier === 'boss' ? 'bg-stone-400 text-stone-950' : 'bg-stone-700 text-stone-300'
                  }`}>
                    {entry.min_tier === 'boss' ? 'Boss+' : 'All'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleActive(entry)}
                      className="rounded p-1.5 text-stone-500 hover:bg-stone-800 hover:text-stone-300 transition-colors"
                      title={entry.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {entry.is_active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      onClick={() => setEditingId(entry.id)}
                      className="rounded p-1.5 text-stone-500 hover:bg-stone-800 hover:text-stone-300 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteEntry(entry)}
                      className="rounded p-1.5 text-stone-500 hover:bg-stone-800 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddModelModal
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
