import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import type { Member } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

export function useMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await db.select<Member>('members', {
        select: '*, catalog_model:model_catalog(*)',
        filters: [{ column: 'owner_id', op: 'eq', value: user.id }],
        order: [{ column: 'created_at', direction: 'desc' }],
      });
      setMembers(data);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function createMember(member: {
    name: string;
    catalog_model_id: string;
    system_prompt: string;
    avatar_url?: string;
  }) {
    if (!user) throw new Error('Not authenticated');
    const data = await db.insert<Member>('members', { ...member, owner_id: user.id });
    const created = data[0];
    // Refetch to get the joined catalog_model data
    await fetchMembers();
    return created;
  }

  async function updateMember(id: string, updates: Partial<Pick<Member, 'name' | 'catalog_model_id' | 'system_prompt' | 'avatar_url'>>) {
    await db.update<Member>('members', updates as Record<string, unknown>, [
      { column: 'id', op: 'eq', value: id },
    ]);
    // Refetch to get the joined catalog_model data
    await fetchMembers();
  }

  async function deleteMember(id: string) {
    await db.delete('members', [{ column: 'id', op: 'eq', value: id }]);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  return { members, loading, createMember, updateMember, deleteMember, refetch: fetchMembers };
}
