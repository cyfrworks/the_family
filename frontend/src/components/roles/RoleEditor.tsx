import { useState, type FormEvent } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Provider, Role } from '../../lib/types';
import { PROVIDER_LABELS } from '../../config/constants';
import { useModels } from '../../hooks/useModels';

interface RoleEditorProps {
  role: Role | null;
  onSave: (data: { name: string; provider: Provider; model: string; system_prompt: string }) => Promise<void>;
  onClose: () => void;
}

export function RoleEditor({ role, onSave, onClose }: RoleEditorProps) {
  const { models, availableProviders, loading: modelsLoading, error: modelsError } = useModels();
  const [name, setName] = useState(role?.name ?? '');
  const [provider, setProvider] = useState<Provider>(role?.provider ?? 'claude');
  const [model, setModel] = useState(role?.model ?? '');
  const [systemPrompt, setSystemPrompt] = useState(role?.system_prompt ?? '');
  const [saving, setSaving] = useState(false);

  // Once models load, set default model if none selected
  const providerModels = models[provider] ?? [];
  const effectiveModel = model && (providerModels.includes(model) || role?.model === model)
    ? model
    : providerModels[0] ?? '';

  if (effectiveModel !== model && effectiveModel) {
    setModel(effectiveModel);
  }

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(models[p]?.[0] ?? '');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, provider, model, system_prompt: systemPrompt });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-stone-800 bg-stone-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
          <h3 className="font-serif text-lg font-bold text-stone-100">
            {role ? 'Edit Role' : 'Create Role'}
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
              placeholder="The Consigliere"
            />
          </div>

          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-stone-400 py-2">
              <Loader2 size={16} className="animate-spin" />
              Loading models...
            </div>
          ) : modelsError || availableProviders.length === 0 ? (
            <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-sm text-red-300">
              {modelsError ?? 'No AI providers configured. Please add API keys to use AI models.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as Provider)}
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                >
                  {availableProviders.map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-1">Model</label>
                <select
                  value={effectiveModel}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                >
                  {role?.model && !providerModels.includes(role.model) && provider === role.provider && (
                    <option value={role.model}>
                      {role.model} (unavailable)
                    </option>
                  )}
                  {providerModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              required
              rows={6}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600 resize-none"
              placeholder="Describe this role's personality, speaking style, and expertise..."
            />
          </div>

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
              disabled={saving || modelsLoading || availableProviders.length === 0}
              className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : role ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
