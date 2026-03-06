import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { CatalogModel, Provider } from '../lib/types';

const ADMIN_API_REF = 'formula:local.admin-api:0.1.0';

interface CatalogData {
  catalog: CatalogModel[];
  byProvider: Record<string, CatalogModel[]>;
}

export function useModelCatalog() {
  const queryClient = useQueryClient();
  const { data, isLoading: loading, error } = useQuery<CatalogData>({
    queryKey: ['modelCatalog'],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: ADMIN_API_REF,
        input: { action: 'catalog_list', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      return {
        catalog: (res?.catalog as CatalogModel[]) || [],
        byProvider: (res?.by_provider as Record<string, CatalogModel[]>) || {},
      };
    },
    staleTime: 60_000,
  });

  const catalogModels = data?.catalog ?? [];
  const modelsByProvider = (data?.byProvider ?? {}) as Record<Provider, CatalogModel[]>;

  const availableProviders = useMemo(
    () => (Object.keys(modelsByProvider) as Provider[]).filter(
      (p) => (modelsByProvider[p]?.length ?? 0) > 0
    ),
    [modelsByProvider]
  );

  return {
    catalogModels,
    modelsByProvider,
    availableProviders,
    loading,
    error: error ? 'Failed to load model catalog' : null,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['modelCatalog'] }),
  };
}
