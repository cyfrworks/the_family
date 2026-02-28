import { useCallback, useEffect, useState } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { SitDown } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

export function useSitDowns() {
  const { user } = useAuth();
  const [sitDowns, setSitDowns] = useState<SitDown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSitDowns = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SIT_DOWN_REF,
        input: { action: 'list', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      setSitDowns((res?.sit_downs as SitDown[]) || []);
    } catch (err) {
      console.error('[useSitDowns] Failed to fetch sit-downs:', err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSitDowns();
  }, [fetchSitDowns]);

  async function createSitDown(name: string, description?: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'create', access_token: accessToken, name, description: description ?? null },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    const created = res?.sit_down as SitDown;
    setSitDowns((prev) => [created, ...prev]);
    return created;
  }

  async function deleteSitDown(id: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'delete', access_token: accessToken, sit_down_id: id },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    setSitDowns((prev) => prev.filter((s) => s.id !== id));
  }

  return { sitDowns, loading, createSitDown, deleteSitDown, refetch: fetchSitDowns };
}
