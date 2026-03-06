import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { supabase } from '../lib/realtime';
import { useAuth } from './AuthContext';
import type { CommissionContact, SitDown } from '../lib/types';

const COMMISSION_API_REF = 'formula:local.commission-api:0.1.0';

interface CommissionData {
  contacts: CommissionContact[];
  pendingInvites: CommissionContact[];
  sentInvites: CommissionContact[];
  commissionSitDowns: SitDown[];
}

interface CommissionState extends CommissionData {
  loading: boolean;
  refetch: () => Promise<void>;
  markSitDownAsRead: (id: string) => void;
}

const CommissionContext = createContext<CommissionState | null>(null);

export function CommissionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<CommissionData>({
    queryKey: ['commission', 'state'],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: COMMISSION_API_REF,
        input: { action: 'state', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      return {
        contacts: (res?.contacts as CommissionContact[]) || [],
        pendingInvites: (res?.pending_invites as CommissionContact[]) || [],
        sentInvites: (res?.sent_invites as CommissionContact[]) || [],
        commissionSitDowns: (res?.commission_sit_downs as SitDown[]) || [],
      };
    },
    staleTime: 60_000,
    enabled: !!user,
  });

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['commission', 'state'] });
  }, [queryClient]);

  // Realtime: commission_contacts changes (rare) — invalidate
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`commission:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commission_contacts', filter: `user_id=eq.${user.id}` },
        () => { refetch(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commission_contacts', filter: `contact_user_id=eq.${user.id}` },
        () => { refetch(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, refetch]);

  // Realtime: local unread increment for commission sit-downs on new messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('commission-sit-down-unread')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as { sit_down_id: string; sender_user_id: string | null };
          if (msg.sender_user_id === user.id) return;
          queryClient.setQueryData<CommissionData>(['commission', 'state'], (old) => {
            if (!old) return old;
            const idx = old.commissionSitDowns.findIndex((sd) => sd.id === msg.sit_down_id);
            if (idx === -1) return old;
            const updated = [...old.commissionSitDowns];
            updated[idx] = { ...updated[idx], unread_count: (updated[idx].unread_count ?? 0) + 1 };
            return { ...old, commissionSitDowns: updated };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  function markSitDownAsRead(id: string) {
    queryClient.setQueryData<CommissionData>(['commission', 'state'], (old) => {
      if (!old) return old;
      return {
        ...old,
        commissionSitDowns: old.commissionSitDowns.map((sd) =>
          sd.id === id ? { ...sd, unread_count: 0 } : sd,
        ),
      };
    });
  }

  const value: CommissionState = {
    contacts: data?.contacts ?? [],
    pendingInvites: data?.pendingInvites ?? [],
    sentInvites: data?.sentInvites ?? [],
    commissionSitDowns: data?.commissionSitDowns ?? [],
    loading: isLoading,
    refetch,
    markSitDownAsRead,
  };

  return (
    <CommissionContext.Provider value={value}>
      {children}
    </CommissionContext.Provider>
  );
}

export function useCommissionContext() {
  const ctx = useContext(CommissionContext);
  if (!ctx) throw new Error('useCommissionContext must be used within CommissionProvider');
  return ctx;
}
