import { useEffect, useState } from 'react';
import { cyfrCall } from '../lib/cyfr';
import type { Provider } from '../lib/types';

interface ModelsState {
  models: Record<Provider, string[]>;
  availableProviders: Provider[];
  loading: boolean;
  error: string | null;
}

// Module-level cache so we only fetch once per session
let cachedModels: Record<Provider, string[]> | null = null;
let cachedProviders: Provider[] | null = null;
let fetchPromise: Promise<void> | null = null;

function normalizeModels(result: Record<string, unknown>): {
  models: Record<Provider, string[]>;
  availableProviders: Provider[];
} {
  const errors = (result.errors ?? {}) as Record<string, unknown>;
  const modelsMap = (result.models ?? {}) as Record<string, unknown>;

  const providers: Provider[] = ['claude', 'openai', 'gemini'];
  const models: Record<Provider, string[]> = { claude: [], openai: [], gemini: [] };
  const available: Provider[] = [];

  for (const p of providers) {
    // Skip providers that errored (no API key)
    if (errors[p]) continue;

    const providerData = modelsMap[p] as Record<string, unknown> | undefined;
    if (!providerData) continue;

    let ids: string[] = [];

    if (p === 'gemini') {
      // Gemini: { models: [{ name: "models/gemini-..." }, ...] }
      const geminiModels = providerData.models as Array<{ name: string }> | undefined;
      if (geminiModels) {
        ids = geminiModels.map((m) => m.name.replace(/^models\//, ''));
      }
    } else {
      // Claude & OpenAI: { data: [{ id: "..." }, ...] }
      const data = providerData.data as Array<{ id: string }> | undefined;
      if (data) {
        ids = data.map((m) => m.id);
      }
    }

    if (ids.length > 0) {
      models[p] = ids;
      available.push(p);
    }
  }

  return { models, availableProviders: available };
}

export function useModels(): ModelsState {
  const [state, setState] = useState<ModelsState>({
    models: cachedModels ?? { claude: [], openai: [], gemini: [] },
    availableProviders: cachedProviders ?? [],
    loading: !cachedModels,
    error: null,
  });

  useEffect(() => {
    if (cachedModels && cachedProviders) return;

    if (!fetchPromise) {
      fetchPromise = cyfrCall('execution', {
        action: 'run',
        reference: { registry: 'formula:local.list-models:0.1.0' },
        input: {},
        type: 'formula',
      })
        .then((result) => {
          const { models, availableProviders } = normalizeModels(result as Record<string, unknown>);
          cachedModels = models;
          cachedProviders = availableProviders;
        })
        .catch(() => {
          // fetchPromise failed — allow retry on next mount
          fetchPromise = null;
        });
    }

    let cancelled = false;

    fetchPromise
      .then(() => {
        if (cancelled) return;
        if (cachedModels && cachedProviders) {
          setState({
            models: cachedModels,
            availableProviders: cachedProviders,
            loading: false,
            error: null,
          });
        } else {
          setState((s) => ({
            ...s,
            loading: false,
            error: 'Failed to load models from providers',
          }));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: 'Failed to load models from providers',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
