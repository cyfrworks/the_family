import type { RealtimeChannel } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';
import type { SitDown, CommissionContact } from './types';
import { getSupabase } from './realtime';

// ---------------------------------------------------------------------------
// Active sit-down tracking
// ---------------------------------------------------------------------------

let activeSitDownId: string | null = null;

export function setActiveSitDown(id: string | null) {
  activeSitDownId = id;
}

export function getActiveSitDown() {
  return activeSitDownId;
}

// ---------------------------------------------------------------------------
// Commission data shape (matches CommissionContext cache)
// ---------------------------------------------------------------------------

interface CommissionData {
  contacts: CommissionContact[];
  pendingInvites: CommissionContact[];
  sentInvites: CommissionContact[];
  commissionSitDowns: SitDown[];
}

// ---------------------------------------------------------------------------
// Debounced invalidation — for rare fallback cases
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 500;

let pendingKeys = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let boundQueryClient: QueryClient | null = null;

function scheduleInvalidation(queryClient: QueryClient, key: 'sitDowns' | 'commission') {
  boundQueryClient = queryClient;
  pendingKeys.add(key);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushInvalidations, DEBOUNCE_MS);
}

function flushInvalidations() {
  debounceTimer = null;
  if (!boundQueryClient) return;
  const qc = boundQueryClient;
  const keys = pendingKeys;
  pendingKeys = new Set();
  if (keys.has('sitDowns')) qc.invalidateQueries({ queryKey: ['sitDowns'] });
  if (keys.has('commission')) qc.invalidateQueries({ queryKey: ['commission', 'state'] });
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function insertSitDownIntoCache(queryClient: QueryClient, sitDown: SitDown) {
  if (sitDown.is_commission) {
    queryClient.setQueryData<CommissionData>(['commission', 'state'], (old) => {
      if (!old) return old;
      if (old.commissionSitDowns.some((sd) => sd.id === sitDown.id)) return old;
      return { ...old, commissionSitDowns: [sitDown, ...old.commissionSitDowns] };
    });
  } else {
    queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) => {
      if (!old) return undefined;
      if (old.some((sd) => sd.id === sitDown.id)) return old;
      return [sitDown, ...old];
    });
  }
}

function removeSitDownFromCache(queryClient: QueryClient, sitDownId: string) {
  queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) =>
    old?.filter((sd) => sd.id !== sitDownId),
  );
  queryClient.setQueryData<CommissionData>(['commission', 'state'], (old) => {
    if (!old) return old;
    if (!old.commissionSitDowns.some((sd) => sd.id === sitDownId)) return old;
    return { ...old, commissionSitDowns: old.commissionSitDowns.filter((sd) => sd.id !== sitDownId) };
  });
  // Disable & clear the conversation-level cache so the screen detects removal
  // Using setQueryData(null) instead of removeQueries to avoid triggering a refetch
  queryClient.setQueryData(['sitDown', 'enter', sitDownId], null);
}

// ---------------------------------------------------------------------------
// Global channel
// ---------------------------------------------------------------------------

let globalChannel: RealtimeChannel | null = null;

export function startGlobalChannel(userId: string, queryClient: QueryClient) {
  if (globalChannel) return;

  globalChannel = getSupabase()
    .channel('family:global', { config: { broadcast: { self: false } } })
    // --- messages INSERT (all) — local unread increment ---
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const msg = payload.new as { sit_down_id: string; sender_user_id: string | null };
        if (msg.sender_user_id === userId) return;
        if (msg.sit_down_id === activeSitDownId) return;

        // Try family list
        const familyList = queryClient.getQueryData<SitDown[]>(['sitDowns']);
        if (familyList?.some((sd) => sd.id === msg.sit_down_id)) {
          queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) =>
            old?.map((sd) =>
              sd.id === msg.sit_down_id
                ? { ...sd, unread_count: (sd.unread_count ?? 0) + 1 }
                : sd,
            ),
          );
          return;
        }

        // Try commission list
        const commData = queryClient.getQueryData<CommissionData>(['commission', 'state']);
        if (commData) {
          const idx = commData.commissionSitDowns.findIndex((sd) => sd.id === msg.sit_down_id);
          if (idx !== -1) {
            queryClient.setQueryData<CommissionData>(['commission', 'state'], (old) => {
              if (!old) return old;
              const updated = [...old.commissionSitDowns];
              updated[idx] = { ...updated[idx], unread_count: (updated[idx].unread_count ?? 0) + 1 };
              return { ...old, commissionSitDowns: updated };
            });
            return;
          }
        }

        // Unknown sit-down — fallback refetch
        scheduleInvalidation(queryClient, 'sitDowns');
        scheduleInvalidation(queryClient, 'commission');
      },
    )
    // --- sit_downs INSERT — RLS ensures only participants receive this ---
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sit_downs' },
      (payload) => {
        const row = payload.new as SitDown;
        insertSitDownIntoCache(queryClient, { ...row, unread_count: 0 });
      },
    )
    // --- sit_downs DELETE — remove from cache directly ---
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'sit_downs' },
      (payload) => {
        const row = payload.old as { id?: string };
        if (row?.id) removeSitDownFromCache(queryClient, row.id);
      },
    )
    // --- sit_down_participants INSERT — user added to a sit-down ---
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sit_down_participants' },
      (payload) => {
        const row = payload.new as { user_id?: string; sit_down_id?: string };
        if (row?.user_id !== userId) return;
        scheduleInvalidation(queryClient, 'sitDowns');
        scheduleInvalidation(queryClient, 'commission');
      },
    )
    // --- sit_down_participants DELETE — user removed from a sit-down ---
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'sit_down_participants' },
      (payload) => {
        const row = payload.old as { user_id?: string; sit_down_id?: string };
        if (row?.user_id !== userId) return;
        if (row.sit_down_id) removeSitDownFromCache(queryClient, row.sit_down_id);
      },
    )
    // --- broadcast: participant_left — syncs leave across devices ---
    .on('broadcast', { event: 'participant_left' }, (payload) => {
      const { user_id, sit_down_id } = payload.payload as { user_id?: string; sit_down_id?: string };
      if (user_id !== userId) return;
      if (sit_down_id) removeSitDownFromCache(queryClient, sit_down_id);
    })
    // --- broadcast: member_progress — rich progress events from member formulas ---
    .on('broadcast', { event: 'member_progress' }, (payload) => {
      const data = payload.payload as {
        sit_down_id: string;
        member_id: string;
        member_name: string;
        kind: string;
        text?: string;
        turn?: number;
        message_id?: string;
        tool?: string;
        tool_call_id?: string;
        input?: string;
        preview?: string;
        content?: string;
        input_tokens?: number;
        output_tokens?: number;
      };
      memberProgressListeners.get(data.sit_down_id)?.forEach((fn) => fn(data));
    })
    // --- commission_contacts * (filtered by user_id) ---
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'commission_contacts', filter: `user_id=eq.${userId}` },
      () => {
        scheduleInvalidation(queryClient, 'commission');
      },
    )
    // --- commission_contacts * (filtered by contact_user_id) ---
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'commission_contacts', filter: `contact_user_id=eq.${userId}` },
      () => {
        scheduleInvalidation(queryClient, 'commission');
      },
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Member progress listener registry
// ---------------------------------------------------------------------------

const memberProgressListeners = new Map<string, Set<(data: any) => void>>();

export function onMemberProgress(sitDownId: string, handler: (data: any) => void): () => void {
  if (!memberProgressListeners.has(sitDownId)) {
    memberProgressListeners.set(sitDownId, new Set());
  }
  memberProgressListeners.get(sitDownId)!.add(handler);
  return () => {
    memberProgressListeners.get(sitDownId)?.delete(handler);
    if (memberProgressListeners.get(sitDownId)?.size === 0) {
      memberProgressListeners.delete(sitDownId);
    }
  };
}

export function broadcastMemberProgress(payload: Record<string, unknown>) {
  // Local dispatch — sender sees events instantly without Supabase round-trip
  const sitDownId = payload.sit_down_id as string;
  if (sitDownId) {
    memberProgressListeners.get(sitDownId)?.forEach((fn) => fn(payload));
  }

  // Broadcast to other participants via Supabase (self: false prevents duplicates)
  if (!globalChannel) return;
  globalChannel.send({
    type: 'broadcast',
    event: 'member_progress',
    payload,
  });
}

export function stopGlobalChannel() {
  if (globalChannel) {
    getSupabase().removeChannel(globalChannel);
    globalChannel = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingKeys.clear();
}
