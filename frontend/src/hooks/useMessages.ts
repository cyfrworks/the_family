import { useCallback, useEffect, useRef, useState } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { supabase } from '../lib/realtime';
import type { Message } from '../lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface RemoteTypingIndicator {
  sit_down_id: string;
  member_id: string;
  member_name: string;
  started_by: string;
  started_at: string;
}

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

export function useMessages(sitDownId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingIndicators, setTypingIndicators] = useState<RemoteTypingIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);

  const fetchMessages = useCallback(async (): Promise<Message[]> => {
    if (!sitDownId) return [];
    const id = ++fetchIdRef.current;
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return [];

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SIT_DOWN_REF,
        input: { action: 'list_messages', access_token: accessToken, sit_down_id: sitDownId },
        type: 'formula',
        timeout: 30000,
      });

      // Ignore stale responses from concurrent fetches
      if (id !== fetchIdRef.current) return [];

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      const data = (res?.messages as Message[]) || [];
      setMessages(data);
      return data;
    } catch (err) {
      if (id !== fetchIdRef.current) return [];
      console.error('[useMessages] Failed to fetch messages:', err);
      return [];
    }
  }, [sitDownId]);

  // Initial fetch
  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchMessages();
      setLoading(false);
    }
    init();
  }, [fetchMessages]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!sitDownId) return;

    const channel: RealtimeChannel = supabase
      .channel(`sit-down:${sitDownId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sit_down_id=eq.${sitDownId}` },
        () => {
          // Debounce: batch AI responses may trigger multiple INSERTs in quick succession
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            fetchMessages();
          }, 150);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'typing_indicators', filter: `sit_down_id=eq.${sitDownId}` },
        (payload) => {
          const row = payload.new as RemoteTypingIndicator;
          setTypingIndicators((prev) => {
            // Replace existing entry for same member_id, or add new
            const filtered = prev.filter((t) => t.member_id !== row.member_id);
            return [...filtered, row];
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'typing_indicators', filter: `sit_down_id=eq.${sitDownId}` },
        (payload) => {
          const old = payload.old as { member_id?: string; id?: string };
          if (old.member_id) {
            setTypingIndicators((prev) => prev.filter((t) => t.member_id !== old.member_id));
          } else if (old.id) {
            setTypingIndicators((prev) => prev.filter((t) => (t as unknown as { id: string }).id !== old.id));
          }
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [sitDownId, fetchMessages]);

  return { messages, typingIndicators, loading, refetch: fetchMessages };
}
