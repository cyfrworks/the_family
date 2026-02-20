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
    provider: string;
    model: string;
    system_prompt: string;
    avatar_url?: string;
  }) {
    if (!user) throw new Error('Not authenticated');
    const data = await db.insert<Member>('members', { ...member, owner_id: user.id });
    const created = data[0];
    setMembers((prev) => [created, ...prev]);
    return created;
  }

  async function updateMember(id: string, updates: Partial<Pick<Member, 'name' | 'provider' | 'model' | 'system_prompt' | 'avatar_url'>>) {
    const data = await db.update<Member>('members', updates as Record<string, unknown>, [
      { column: 'id', op: 'eq', value: id },
    ]);
    const updated = data[0];
    setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
    return updated;
  }

  async function deleteMember(id: string) {
    await db.delete('members', [{ column: 'id', op: 'eq', value: id }]);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  const myMembers = members.filter((m) => !m.is_template && m.owner_id === user?.id);
  const templates = members.filter((m) => m.is_template);

  return { members, myMembers, templates, loading, createMember, updateMember, deleteMember, refetch: fetchMembers };
}
