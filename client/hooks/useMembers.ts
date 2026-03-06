import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { Member } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

const MEMBERS_API_REF = 'formula:local.members-api:0.1.0';

export function useMembers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading: loading } = useQuery<Member[]>({
    queryKey: ['members'],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) return [];

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: MEMBERS_API_REF,
        input: { action: 'list', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      return (res?.members as Member[]) || [];
    },
    staleTime: 30_000,
    enabled: !!user,
  });

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
      reference: MEMBERS_API_REF,
      input: { action: 'create', access_token: accessToken, member },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    const created = res?.member as Member;
    await queryClient.invalidateQueries({ queryKey: ['members'] });
    // Also refresh sit-down enter data (commission_members depends on this)
    queryClient.invalidateQueries({ queryKey: ['sitDown', 'enter'] });
    return created;
  }

  async function updateMember(id: string, updates: Partial<Pick<Member, 'name' | 'catalog_model_id' | 'system_prompt' | 'avatar_url'>>) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: MEMBERS_API_REF,
      input: { action: 'update', access_token: accessToken, member_id: id, updates },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await queryClient.invalidateQueries({ queryKey: ['members'] });
    queryClient.invalidateQueries({ queryKey: ['sitDown', 'enter'] });
  }

  async function deleteMember(id: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: MEMBERS_API_REF,
      input: { action: 'delete', access_token: accessToken, member_id: id },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    queryClient.setQueryData<Member[]>(['members'], (old) => old?.filter((m) => m.id !== id));
    queryClient.invalidateQueries({ queryKey: ['sitDown', 'enter'] });
  }

  return { members, loading, createMember, updateMember, deleteMember, refetch: () => queryClient.invalidateQueries({ queryKey: ['members'] }) };
}
