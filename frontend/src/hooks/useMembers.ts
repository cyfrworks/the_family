import { useCallback, useEffect, useState } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { Member } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

const MEMBERS_API_REF = 'formula:local.members-api:0.1.0';

export function useMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: { registry: MEMBERS_API_REF },
        input: { action: 'list', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      setMembers((res?.members as Member[]) || []);
    } catch (err) {
      console.error('[useMembers] Failed to fetch members:', err);
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
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: { registry: MEMBERS_API_REF },
      input: { action: 'create', access_token: accessToken, member },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    const created = res?.member as Member;
    await fetchMembers();
    return created;
  }

  async function updateMember(id: string, updates: Partial<Pick<Member, 'name' | 'catalog_model_id' | 'system_prompt' | 'avatar_url'>>) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: { registry: MEMBERS_API_REF },
      input: { action: 'update', access_token: accessToken, member_id: id, updates },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await fetchMembers();
  }

  async function deleteMember(id: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: { registry: MEMBERS_API_REF },
      input: { action: 'delete', access_token: accessToken, member_id: id },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  return { members, loading, createMember, updateMember, deleteMember, refetch: fetchMembers };
}
