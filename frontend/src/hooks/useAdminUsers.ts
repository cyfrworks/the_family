import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import type { Profile, UserTier } from '../lib/types';

export function useAdminUsers() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await db.select<Profile>('profiles', {
        select: '*',
        order: [{ column: 'created_at', direction: 'asc' }],
      });
      setUsers(data);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function updateTier(userId: string, tier: UserTier) {
    await db.update<Profile>('profiles', { tier } as Record<string, unknown>, [
      { column: 'id', op: 'eq', value: userId },
    ]);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, tier } : u)));
  }

  return { users, loading, updateTier, refetch: fetchUsers };
}
