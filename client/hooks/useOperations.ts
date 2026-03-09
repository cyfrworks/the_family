import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../lib/supabase';
import { getSupabase } from '../lib/realtime';
import type { Operation, BookkeeperEntry } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

export function useOperations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: operations = [], isLoading: loadingOps } = useQuery<Operation[]>({
    queryKey: ['operations'],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) return [];

      const { data, error } = await getSupabase()
        .from('operations')
        .select('*,member:members(id,name,avatar_url,catalog_model:model_catalog(provider,alias))')
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data as Operation[]) || [];
    },
    staleTime: 10_000,
    enabled: !!user,
  });

  const { data: bookkeeperEntries = [], isLoading: loadingEntries } = useQuery<(BookkeeperEntry & { member?: { id: string; name: string; avatar_url: string | null } })[]>({
    queryKey: ['bookkeeper_entries'],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) return [];

      const { data, error } = await getSupabase()
        .from('bookkeeper_entries')
        .select('*, member:members!bookkeeper_entries_bookkeeper_id_fkey(id,name,avatar_url)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    staleTime: 10_000,
    enabled: !!user,
  });

  // Realtime subscription for live updates
  useEffect(() => {
    if (!user) return;

    const sb = getSupabase();
    const channel = sb
      .channel('operations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'operations' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['operations'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookkeeper_entries' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['bookkeeper_entries'] });
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [user, queryClient]);

  return {
    operations,
    bookkeeperEntries,
    loading: loadingOps || loadingEntries,
    loadingOps,
    loadingEntries,
  };
}
