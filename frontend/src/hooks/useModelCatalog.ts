import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import type { CatalogModel, Provider } from '../lib/types';

export function useModelCatalog() {
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.select<CatalogModel>('model_catalog', {
        select: '*',
        order: [{ column: 'sort_order', direction: 'asc' }, { column: 'created_at', direction: 'asc' }],
      });
      setCatalogModels(data);
    } catch {
      setError('Failed to load model catalog');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const modelsByProvider: Record<Provider, CatalogModel[]> = { claude: [], openai: [], gemini: [] };
  for (const m of catalogModels) {
    modelsByProvider[m.provider].push(m);
  }

  const availableProviders = (Object.keys(modelsByProvider) as Provider[]).filter(
    (p) => modelsByProvider[p].length > 0
  );

  return { catalogModels, modelsByProvider, availableProviders, loading, error, refetch: fetchCatalog };
}
