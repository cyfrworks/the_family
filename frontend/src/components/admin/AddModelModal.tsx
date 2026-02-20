import { useState, type FormEvent } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Provider } from '../../lib/types';
import { PROVIDER_LABELS } from '../../config/constants';
import { useModels } from '../../hooks/useModels';

interface AddModelModalProps {
  onAdd: (data: { provider: Provider; alias: string; model: string; min_tier: 'boss' | 'associate'; sort_order: number }) => Promise<void>;
  onClose: () => void;
}

export function AddModelModal({ onAdd, onClose }: AddModelModalProps) {
  const { models, availableProviders, loading: modelsLoading, error: modelsError } = useModels();
  const [provider, setProvider] = useState<Provider>(availableProviders[0] ?? 'claude');
  const [model, setModel] = useState('');
  const [alias, setAlias] = useState('');
  const [minTier, setMinTier] = useState<'boss' | 'associate'>('associate');
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const providerModels = models[provider] ?? [];
  const effectiveModel = model && providerModels.includes(model) ? model : providerModels[0] ?? '';

  if (effectiveModel !== model && effectiveModel) {
    setModel(effectiveModel);
  }

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(models[p]?.[0] ?? '');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!alias.trim() || !effectiveModel) return;
    setSaving(true);
    try {
      await onAdd({ provider, alias: alias.trim(), model: effectiveModel, min_tier: minTier, sort_order: sortOrder });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-stone-800 bg-stone-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
          <h3 className="font-serif text-lg font-bold text-stone-100">Add Model to Catalog</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-stone-400 py-2">
              <Loader2 size={16} className="animate-spin" />
              Discovering models from API keys...
            </div>
          ) : modelsError || availableProviders.length === 0 ? (
            <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-sm text-red-300">
              {modelsError ?? 'No AI providers configured. Add API keys first.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-300 mb-1">Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value as Provider)}
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                  >
                    {availableProviders.map((p) => (
                      <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-300 mb-1">Model ID</label>
                  <select
                    value={effectiveModel}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                  >
                    {providerModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-300 mb-1">
                  Alias <span className="text-stone-500">(what users see)</span>
                </label>
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  required
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                  placeholder='e.g. "Sonnet", "Pro", "Fast"'
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-300 mb-1">Min Tier</label>
                  <select
                    value={minTier}
                    onChange={(e) => setMinTier(e.target.value as 'boss' | 'associate')}
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                  >
                    <option value="associate">Associate (everyone)</option>
                    <option value="boss">Boss (Boss + Godfather)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-300 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 hover:bg-stone-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || modelsLoading || availableProviders.length === 0 || !alias.trim()}
              className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding...' : 'Add to Catalog'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
