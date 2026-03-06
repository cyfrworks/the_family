import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { getSupabase } from '../lib/realtime';
import { getUserFriendlyError, type FriendlyError } from '../lib/error-messages';
import type { SitDown, SitDownParticipant, Member, Message, Profile } from '../lib/types';
import type { RemoteTypingIndicator } from './useMessages';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { notifyMembershipChange } from './useSitDowns';

export interface MembersByOwner {
  profile: Profile;
  members: Member[];
}

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

// ---------------------------------------------------------------------------
// Global typing indicator cache + subscription
// ---------------------------------------------------------------------------

const TYPING_STALE_MS = 120_000;

const typingCache = new Map<string, Map<string, RemoteTypingIndicator>>();
const typingListeners = new Map<string, Set<() => void>>();
let globalTypingChannel: RealtimeChannel | null = null;

function ensureGlobalTypingSubscription() {
  if (globalTypingChannel) return;
  globalTypingChannel = supabase
    .channel('global-typing')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'typing_indicators' },
      (payload) => {
        const row = payload.new as RemoteTypingIndicator;
        const roomId = row.sit_down_id;
        if (!typingCache.has(roomId)) typingCache.set(roomId, new Map());
        typingCache.get(roomId)!.set(row.member_id, row);
        typingListeners.get(roomId)?.forEach((fn) => fn());
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'typing_indicators' },
      (payload) => {
        const old = payload.old as { sit_down_id?: string; member_id?: string; id?: string };
        if (old.sit_down_id && old.member_id) {
          typingCache.get(old.sit_down_id)?.delete(old.member_id);
          typingListeners.get(old.sit_down_id)?.forEach((fn) => fn());
        }
      },
    )
    .subscribe();
}

function getCachedIndicators(roomId: string): RemoteTypingIndicator[] {
  const room = typingCache.get(roomId);
  if (!room) return [];
  const now = Date.now();
  const active: RemoteTypingIndicator[] = [];
  for (const [memberId, t] of room) {
    if (now - new Date(t.started_at).getTime() < TYPING_STALE_MS) {
      active.push(t);
    } else {
      room.delete(memberId);
    }
  }
  return active;
}

// ---------------------------------------------------------------------------
// Types for query data
// ---------------------------------------------------------------------------

interface EnterSitDownData {
  sit_down: SitDown | null;
  participants: SitDownParticipant[];
  commission_members: Member[];
  last_read_at: string | null;
  is_commission: boolean;
  messages: Message[];
  has_more_messages: boolean;
}

interface OlderMessagesPage {
  messages: Message[];
  has_more: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSitDownData(sitDownId: string | undefined) {
  const queryClient = useQueryClient();
  const [typingIndicators, setTypingIndicators] = useState<RemoteTypingIndicator[]>([]);
  const [enteredAt, setEnteredAt] = useState<string | null>(null);

  // ---- Combined enter query: sit-down + participants + messages + read receipt ----
  const enterQuery = useQuery<EnterSitDownData, Error>({
    queryKey: ['sitDown', 'enter', sitDownId],
    queryFn: async () => {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SIT_DOWN_REF,
        input: { action: 'enter', access_token: accessToken, sit_down_id: sitDownId },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      return {
        sit_down: (res?.sit_down as SitDown) ?? null,
        participants: (res?.participants as SitDownParticipant[]) ?? [],
        commission_members: (res?.commission_members as Member[]) ?? [],
        last_read_at: (res?.last_read_at as string) ?? null,
        is_commission: (res?.is_commission as boolean) ?? false,
        messages: (res?.messages as Message[]) ?? [],
        has_more_messages: (res?.has_more_messages as boolean) ?? false,
      };
    },
    staleTime: 10_000,
    enabled: !!sitDownId,
  });

  // ---- Older messages: cursor-based pagination (load-more on scroll-up) ----
  // Track the cursor for the first page (earliest message from the enter query)
  const oldestEnterTimestamp = enterQuery.data?.messages?.[0]?.created_at;

  const olderMessagesQuery = useInfiniteQuery<OlderMessagesPage, Error, { pages: OlderMessagesPage[] }, string[], string>({
    queryKey: ['messages', 'older', sitDownId ?? ''],
    queryFn: async ({ pageParam }) => {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SIT_DOWN_REF,
        input: {
          action: 'list_messages',
          access_token: accessToken,
          sit_down_id: sitDownId,
          before: pageParam,
          limit: 50,
        },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      return {
        messages: (res?.messages as Message[]) ?? [],
        has_more: (res?.has_more as boolean) ?? false,
      };
    },
    initialPageParam: oldestEnterTimestamp ?? '',
    getNextPageParam: (lastPage) =>
      lastPage.has_more && lastPage.messages.length > 0
        ? lastPage.messages[0].created_at
        : undefined,
    enabled: false, // triggered manually on scroll-up
  });

  // Set enteredAt and typing indicators when data loads
  useEffect(() => {
    if (sitDownId && enterQuery.data) {
      setEnteredAt(new Date().toISOString());
      setTypingIndicators(getCachedIndicators(sitDownId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitDownId, !!enterQuery.data]);

  // ---- Mark read: done by the enter RPC, but update sidebar cache ----
  useEffect(() => {
    if (sitDownId && enterQuery.data) {
      queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) =>
        old?.map((sd) => (sd.id === sitDownId ? { ...sd, unread_count: 0 } : sd)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitDownId, !!enterQuery.data]);

  // ---- Realtime: append messages from payload ----
  useEffect(() => {
    if (!sitDownId) return;

    const channel: RealtimeChannel = supabase
      .channel(`sit-down:${sitDownId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sit_down_id=eq.${sitDownId}` },
        (payload) => {
          const newMsg = payload.new as Message;

          // Hydrate sender info from cached participants
          const cachedData = queryClient.getQueryData<EnterSitDownData>(['sitDown', 'enter', sitDownId]);
          if (cachedData?.participants) {
            const sender = cachedData.participants.find((p) =>
              newMsg.sender_type === 'don'
                ? p.user_id === newMsg.sender_user_id
                : p.member_id === newMsg.sender_member_id,
            );
            if (sender) {
              newMsg.profile = sender.profile;
              newMsg.member = sender.member;
            }
          }

          queryClient.setQueryData<EnterSitDownData>(['sitDown', 'enter', sitDownId], (old) => {
            if (!old) return old;
            // Deduplicate
            if (old.messages.some((m) => m.id === newMsg.id)) return old;
            return { ...old, messages: [...old.messages, newMsg] };
          });
        },
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [sitDownId, queryClient]);

  // ---- Global typing indicator subscription + per-room listener ----
  useEffect(() => {
    if (!sitDownId) return;

    ensureGlobalTypingSubscription();

    const listener = () => {
      setTypingIndicators(getCachedIndicators(sitDownId));
    };

    if (!typingListeners.has(sitDownId)) typingListeners.set(sitDownId, new Set());
    typingListeners.get(sitDownId)!.add(listener);

    return () => {
      typingListeners.get(sitDownId)?.delete(listener);
    };
  }, [sitDownId]);

  // ---- Participant realtime: smart refresh ----
  useEffect(() => {
    if (!sitDownId) return;

    const channel = supabase
      .channel(`participants:${sitDownId}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'sit_down_participants', filter: `sit_down_id=eq.${sitDownId}` },
        (payload) => {
          const deleted = payload.old as { id?: string };
          if (deleted.id) {
            queryClient.setQueryData<EnterSitDownData>(['sitDown', 'enter', sitDownId], (old) => {
              if (!old) return old;
              return {
                ...old,
                participants: old.participants.filter((p) => p.id !== deleted.id),
              };
            });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sit_down_participants', filter: `sit_down_id=eq.${sitDownId}` },
        () => {
          // INSERT needs joined data (profile/member) — invalidate to trigger refetch
          queryClient.invalidateQueries({ queryKey: ['sitDown', 'enter', sitDownId] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sit_down_participants', filter: `sit_down_id=eq.${sitDownId}` },
        () => {
          // UPDATE (e.g. is_admin toggle) — invalidate to get fresh data
          queryClient.invalidateQueries({ queryKey: ['sitDown', 'enter', sitDownId] });
        },
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [sitDownId, queryClient]);

  // ---- Mutation helpers ----

  const refreshParticipants = useCallback(async () => {
    if (!sitDownId) return;

    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SIT_DOWN_REF,
        input: { action: 'list_participants', access_token: accessToken, sit_down_id: sitDownId },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      queryClient.setQueryData<EnterSitDownData>(['sitDown', 'enter', sitDownId], (old) => {
        if (!old) return old;
        return {
          ...old,
          participants: (res?.participants as SitDownParticipant[]) ?? [],
          commission_members: (res?.commission_members as Member[]) ?? [],
          is_commission: (res?.is_commission as boolean) ?? old.is_commission,
        };
      });
    } catch (err) {
      console.error('[useSitDownData] Failed to refresh participants:', err);
    }
  }, [sitDownId, queryClient]);

  async function addMember(memberId: string) {
    if (!sitDownId) throw new Error('Missing context');
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'add_member', access_token: accessToken, sit_down_id: sitDownId, member_id: memberId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);
    await refreshParticipants();
  }

  async function addDon(userId: string) {
    if (!sitDownId) throw new Error('Missing context');
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'add_don', access_token: accessToken, sit_down_id: sitDownId, user_id: userId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);
    notifyMembershipChange(userId);
    await refreshParticipants();
  }

  async function toggleAdmin(userId: string) {
    if (!sitDownId) throw new Error('Missing context');
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'toggle_admin', access_token: accessToken, sit_down_id: sitDownId, user_id: userId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);
    await refreshParticipants();
  }

  async function removeParticipant(participantId: string) {
    if (!sitDownId) throw new Error('Missing context');
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'remove_participant', access_token: accessToken, sit_down_id: sitDownId, participant_id: participantId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);
    // Notify removed Don so their sidebar updates
    const removed = enterQuery.data?.participants.find((p) => p.id === participantId);
    if (removed?.user_id) {
      notifyMembershipChange(removed.user_id);
    }
    // Invalidate sidebar lists so removed sit-downs disappear
    queryClient.invalidateQueries({ queryKey: ['sitDowns'] });
    queryClient.invalidateQueries({ queryKey: ['commission', 'state'] });
    await refreshParticipants();
  }

  // ---- Derived state ----
  const enterData = enterQuery.data;
  const sitDown = enterData?.sit_down ?? null;
  const participants = enterData?.participants ?? [];
  const commissionMembers = enterData?.commission_members ?? [];
  const lastReadAt = enterData?.last_read_at ?? null;

  // Combine older pages (prepended) + enter messages + realtime appended
  const olderMessages = useMemo(() => {
    const pages = olderMessagesQuery.data?.pages ?? [];
    return pages.flatMap((p) => p.messages);
  }, [olderMessagesQuery.data]);

  const messages = useMemo(() => {
    const enterMessages = enterData?.messages ?? [];
    if (olderMessages.length === 0) return enterMessages;
    // Deduplicate: older messages come before enter messages
    const enterIds = new Set(enterMessages.map((m) => m.id));
    const uniqueOlder = olderMessages.filter((m) => !enterIds.has(m.id));
    return [...uniqueOlder, ...enterMessages];
  }, [enterData?.messages, olderMessages]);

  const hasMoreMessages = enterData?.has_more_messages ?? false;
  const canLoadMore = hasMoreMessages || olderMessagesQuery.hasNextPage;

  const sitDownError: FriendlyError | null = enterQuery.error
    ? getUserFriendlyError(enterQuery.error)
    : null;
  const messagesError: FriendlyError | null = null; // Messages are part of enter now

  const donParticipants = participants.filter((p) => p.user_id != null);
  const memberParticipants = participants.filter((p) => p.member_id != null);
  const participantMembers = memberParticipants
    .map((p) => p.member)
    .filter((m): m is Member => m !== undefined);

  const membersByOwner = useMemo(() => {
    const map = new Map<string, MembersByOwner>();
    if (sitDown?.is_commission) {
      for (const don of donParticipants) {
        if (don.user_id && don.profile) {
          map.set(don.user_id, {
            profile: don.profile,
            members: commissionMembers.filter((m) => m.owner_id === don.user_id),
          });
        }
      }
    }
    return map;
  }, [sitDown?.is_commission, donParticipants, commissionMembers]);

  const loading = enterQuery.isLoading;

  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sitDown', 'enter', sitDownId] });
  }, [sitDownId, queryClient]);

  const refetchMessages = useCallback(async () => {
    // Invalidate the enter query which includes messages
    await queryClient.invalidateQueries({ queryKey: ['sitDown', 'enter', sitDownId] });
  }, [sitDownId, queryClient]);

  const loadOlderMessages = useCallback(() => {
    if (!canLoadMore || olderMessagesQuery.isFetchingNextPage) return;
    olderMessagesQuery.fetchNextPage();
  }, [canLoadMore, olderMessagesQuery]);

  return {
    sitDown,
    participants,
    donParticipants,
    memberParticipants,
    participantMembers,
    commissionMembers,
    membersByOwner,
    messages,
    typingIndicators,
    lastReadAt,
    enteredAt,
    loading,
    sitDownError,
    messagesError,
    clearSitDownError: () => {},
    clearMessagesError: () => {},
    refetchAll,
    refetchMessages,
    refreshParticipants,
    addMember,
    addDon,
    removeParticipant,
    toggleAdmin,
    // Pagination
    loadOlderMessages,
    canLoadMore,
    isLoadingOlder: olderMessagesQuery.isFetchingNextPage,
  };
}
