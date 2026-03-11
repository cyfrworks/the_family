import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type { SitDown } from '../lib/types';

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

interface FamilySitDownState {
  sitDowns: SitDown[];
  loading: boolean;
  refetch: () => Promise<void>;
  createSitDown: (name: string, description?: string) => Promise<SitDown>;
  leaveSitDown: (id: string) => Promise<void>;
  markSitDownAsRead: (id: string) => void;
}

const FamilySitDownContext = createContext<FamilySitDownState | null>(null);

export function FamilySitDownProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sitDowns = [], isLoading, error: sitDownsError } = useQuery<SitDown[]>({
    queryKey: ['sitDowns'],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('No access token');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SIT_DOWN_REF,
        input: { action: 'list', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      return (res?.sit_downs as SitDown[]) ?? [];
    },
    staleTime: 30_000,
    enabled: !!user,
  });

  if (sitDownsError) console.error('[SitDowns]', sitDownsError);

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['sitDowns'] });
  }, [queryClient]);

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

  async function leaveSitDown(id: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'leave', access_token: accessToken, sit_down_id: id },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) => old?.filter((s) => s.id !== id));
  }

  function markSitDownAsRead(id: string) {
    queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) =>
      old?.map((sd) => (sd.id === id ? { ...sd, unread_count: 0 } : sd)),
    );
  }

  const value: FamilySitDownState = {
    sitDowns,
    loading: isLoading,
    refetch,
    createSitDown,
    leaveSitDown,
    markSitDownAsRead,
  };

  return (
    <FamilySitDownContext.Provider value={value}>
      {children}
    </FamilySitDownContext.Provider>
  );
}

export function useFamilySitDownContext() {
  const ctx = useContext(FamilySitDownContext);
  if (!ctx) throw new Error('useFamilySitDownContext must be used within FamilySitDownProvider');
  return ctx;
}
