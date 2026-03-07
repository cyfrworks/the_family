import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { Member } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

const MEMBERS_API_REF = 'formula:local.members-api:0.1.0';

export function useInformants() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: informants = [], isLoading: loading } = useQuery<Member[]>({
    queryKey: ['informants'],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) return [];

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: MEMBERS_API_REF,
        input: { action: 'list_informants', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      return (res?.informants as Member[]) || [];
    },
    staleTime: 30_000,
    enabled: !!user,
  });

  async function createInformant(name: string, avatar_url?: string): Promise<{ informant: Member; token: string }> {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: MEMBERS_API_REF,
      input: { action: 'create_informant', access_token: accessToken, name, avatar_url },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await queryClient.invalidateQueries({ queryKey: ['informants'] });
    return { informant: res?.informant as Member, token: res?.token as string };
  }

  async function deleteInformant(id: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: MEMBERS_API_REF,
      input: { action: 'delete_informant', access_token: accessToken, member_id: id },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    queryClient.setQueryData<Member[]>(['informants'], (old) => old?.filter((m) => m.id !== id));
  }

  async function regenerateToken(id: string): Promise<string> {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: MEMBERS_API_REF,
      input: { action: 'regenerate_token', access_token: accessToken, member_id: id },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await queryClient.invalidateQueries({ queryKey: ['informants'] });
    return res?.token as string;
  }

  return { informants, loading, createInformant, deleteInformant, regenerateToken };
}
