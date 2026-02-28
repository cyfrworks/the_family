import { useCallback, useEffect, useState } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { CatalogModel, Provider } from '../lib/types';

const ADMIN_API_REF = 'formula:local.admin-api:0.1.0';

export function useModelCatalog() {
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, CatalogModel[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: ADMIN_API_REF,
        input: { action: 'catalog_list', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      setCatalogModels((res?.catalog as CatalogModel[]) || []);
      setModelsByProvider((res?.by_provider as Record<string, CatalogModel[]>) || {});
    } catch {
      setError('Failed to load model catalog');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const availableProviders = (Object.keys(modelsByProvider) as Provider[]).filter(
    (p) => (modelsByProvider[p]?.length ?? 0) > 0
  );

  return { catalogModels, modelsByProvider: modelsByProvider as Record<Provider, CatalogModel[]>, availableProviders, loading, error, refetch: fetchCatalog };
}
