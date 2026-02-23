import { useCallback, useEffect, useState } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { Profile, UserTier } from '../lib/types';

const ADMIN_API_REF = 'formula:local.admin-api:0.1.0';

export function useAdminUsers() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: { registry: ADMIN_API_REF },
        input: { action: 'list_users', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      setUsers((res?.users as Profile[]) || []);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function updateTier(userId: string, tier: UserTier) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: { registry: ADMIN_API_REF },
      input: { action: 'update_tier', access_token: accessToken, user_id: userId, tier },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, tier } : u)));
  }

  return { users, loading, updateTier, refetch: fetchUsers };
}
