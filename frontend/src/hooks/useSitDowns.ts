import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import type { SitDown } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

export function useSitDowns() {
  const { user } = useAuth();
  const [sitDowns, setSitDowns] = useState<SitDown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSitDowns = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await db.select<SitDown>('sit_downs', {
        select: '*',
        filters: [{ column: 'is_commission', op: 'eq', value: 'false' }],
        order: [{ column: 'created_at', direction: 'desc' }],
      });
      setSitDowns(data);
    } catch (err) {
      console.error('[useSitDowns] Failed to fetch sit-downs:', err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSitDowns();
  }, [fetchSitDowns]);

  async function createSitDown(name: string, description?: string) {
    const data = await db.rpc<SitDown>('create_sit_down', {
      p_name: name,
      p_description: description ?? null,
    });
    setSitDowns((prev) => [data, ...prev]);
    return data;
  }

  async function deleteSitDown(id: string) {
    await db.delete('sit_downs', [{ column: 'id', op: 'eq', value: id }]);
    setSitDowns((prev) => prev.filter((s) => s.id !== id));
  }

  return { sitDowns, loading, createSitDown, deleteSitDown, refetch: fetchSitDowns };
}
