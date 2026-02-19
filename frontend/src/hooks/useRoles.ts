import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import type { Role } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

export function useRoles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await db.select<Role>('roles', {
        select: '*',
        filters: [
          {
            or: [
              { column: 'owner_id', op: 'eq', value: user.id },
              { column: 'is_template', op: 'eq', value: 'true' },
            ],
          },
        ],
        order: [{ column: 'created_at', direction: 'desc' }],
      });
      setRoles(data);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  async function createRole(role: {
    name: string;
    provider: string;
    model: string;
    system_prompt: string;
    avatar_url?: string;
  }) {
    if (!user) throw new Error('Not authenticated');
    const data = await db.insert<Role>('roles', { ...role, owner_id: user.id });
    const created = data[0];
    setRoles((prev) => [created, ...prev]);
    return created;
  }

  async function updateRole(id: string, updates: Partial<Pick<Role, 'name' | 'provider' | 'model' | 'system_prompt' | 'avatar_url'>>) {
    const data = await db.update<Role>('roles', updates as Record<string, unknown>, [
      { column: 'id', op: 'eq', value: id },
    ]);
    const updated = data[0];
    setRoles((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }

  async function deleteRole(id: string) {
    await db.delete('roles', [{ column: 'id', op: 'eq', value: id }]);
    setRoles((prev) => prev.filter((r) => r.id !== id));
  }

  const myRoles = roles.filter((r) => !r.is_template && r.owner_id === user?.id);
  const templates = roles.filter((r) => r.is_template);

  return { roles, myRoles, templates, loading, createRole, updateRole, deleteRole, refetch: fetchRoles };
}
