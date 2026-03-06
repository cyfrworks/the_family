import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { Profile, UserTier } from '../lib/types';

const ADMIN_API_REF = 'formula:local.admin-api:0.1.0';

export function useAdminUsers() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading: loading } = useQuery<Profile[]>({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) return [];

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: ADMIN_API_REF,
        input: { action: 'list_users', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      return (res?.users as Profile[]) || [];
    },
    staleTime: 60_000,
  });

  async function updateTier(userId: string, tier: UserTier) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: ADMIN_API_REF,
      input: { action: 'update_tier', access_token: accessToken, user_id: userId, tier },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    queryClient.setQueryData<Profile[]>(['adminUsers'], (old) =>
      old?.map((u) => (u.id === userId ? { ...u, tier } : u)),
    );
  }

  return { users, loading, updateTier, refetch: () => queryClient.invalidateQueries({ queryKey: ['adminUsers'] }) };
}
