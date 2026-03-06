import { useQuery } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import type { Provider } from '../lib/types';
import { PROVIDERS } from '../config/constants';

interface ModelsState {
  models: Record<Provider, string[]>;
  availableProviders: Provider[];
  loading: boolean;
  error: string | null;
}

const EMPTY_MODELS: Record<Provider, string[]> = {
  claude: [],
  openai: [],
  gemini: [],
  grok: [],
  openrouter: [],
};

function normalizeModels(result: Record<string, unknown>): {
  models: Record<Provider, string[]>;
  availableProviders: Provider[];
} {
  const errors = (result.errors ?? {}) as Record<string, unknown>;
  const modelsMap = (result.models ?? {}) as Record<string, unknown>;

  const models: Record<Provider, string[]> = { ...EMPTY_MODELS };
  const available: Provider[] = [];

  for (const p of PROVIDERS) {
    if (errors[p]) continue;

    const providerData = modelsMap[p] as Record<string, unknown> | undefined;
    if (!providerData) continue;

    let ids: string[] = [];

    if (p === 'gemini') {
      const geminiModels = providerData.models as Array<{ name: string }> | undefined;
      if (geminiModels) {
        ids = geminiModels.map((m) => m.name.replace(/^models\//, ''));
      }
    } else {
      const data = providerData.data as Array<{ id: string }> | undefined;
      if (data) {
        ids = data.map((m) => m.id);
      }
    }

    if (ids.length > 0) {
      models[p] = ids.sort((a, b) => a.localeCompare(b));
      available.push(p);
    }
  }

  return { models, availableProviders: available };
}

export function useModels(): ModelsState {
  const { data, isLoading, error } = useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const result = await cyfrCall('execution', {
        action: 'run',
        reference: 'formula:local.list-models:0.5.0',
        input: {},
        type: 'formula',
      });
      return normalizeModels(result as Record<string, unknown>);
    },
    staleTime: Infinity,
  });

  return {
    models: data?.models ?? EMPTY_MODELS,
    availableProviders: data?.availableProviders ?? [],
    loading: isLoading,
    error: error ? 'Failed to load models from providers' : null,
  };
}
