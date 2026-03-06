import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { getSupabase } from '../lib/realtime';
import type { SitDown } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

// ---------------------------------------------------------------------------
// Broadcast-based membership notifications (bypasses RLS)
// ---------------------------------------------------------------------------
let membershipChannel: RealtimeChannel | null = null;
let membershipUserId: string | null = null;

function ensureMembershipChannel(userId: string, queryClient: QueryClient) {
  if (membershipChannel && membershipUserId === userId) return;
  if (membershipChannel) getSupabase().removeChannel(membershipChannel);

  membershipUserId = userId;
  membershipChannel = supabase
    .channel('sit-down-membership')
    .on('broadcast', { event: 'membership-changed' }, ({ payload }) => {
      if (payload?.target_user_id === userId) {
        queryClient.invalidateQueries({ queryKey: ['sitDowns'] });
        queryClient.invalidateQueries({ queryKey: ['commission', 'state'] });
      }
    })
    .subscribe();
}

/** Notify a user that their sit-down membership changed (invite/removal). */
export function notifyMembershipChange(targetUserId: string) {
  membershipChannel?.send({
    type: 'broadcast',
    event: 'membership-changed',
    payload: { target_user_id: targetUserId },
  });
}

export function useSitDowns() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sitDowns = [], isLoading: loading, refetch } = useQuery<SitDown[]>({
    queryKey: ['sitDowns'],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) return [];

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SIT_DOWN_REF,
        input: { action: 'list', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      return (res?.sit_downs as SitDown[]) || [];
    },
    staleTime: 30_000,
    enabled: !!user,
  });

  // Realtime: local unread increment + membership broadcast listener
  useEffect(() => {
    if (!user) return;

    // Subscribe to broadcast channel for invite/removal notifications
    ensureMembershipChannel(user.id, queryClient);

    const channel = supabase
      .channel('sit-down-unread')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as { sit_down_id: string; sender_user_id: string | null };
          if (msg.sender_user_id === user.id) return;
          queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) =>
            old?.map((sd) =>
              sd.id === msg.sit_down_id
                ? { ...sd, unread_count: (sd.unread_count ?? 0) + 1 }
                : sd,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [user, queryClient]);

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
    queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) => [created, ...(old || [])]);
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

    queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) => old?.filter((s) => s.id !== id));
  }

  function markAsRead(id: string) {
    queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) =>
      old?.map((sd) => (sd.id === id ? { ...sd, unread_count: 0 } : sd)),
    );
  }

  return { sitDowns, loading, createSitDown, deleteSitDown, markAsRead, refetch: () => { refetch(); } };
}
