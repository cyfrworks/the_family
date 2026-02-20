import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Message } from '../lib/types';

export interface RemoteTypingIndicator {
  sit_down_id: string;
  member_id: string;
  member_name: string;
  started_by: string;
  started_at: string;
}

const POLL_INTERVAL_MS = 3000;

export function useMessages(sitDownId: string | undefined, onPoll?: () => void) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingIndicators, setTypingIndicators] = useState<RemoteTypingIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  const fetchMessages = useCallback(async (): Promise<Message[]> => {
    if (!sitDownId) return [];
    try {
      const data = await db.select<Message>('messages', {
        select: '*, profile:profiles!messages_profile_fk(*), member:members(*, catalog_model:model_catalog(*))',
        filters: [{ column: 'sit_down_id', op: 'eq', value: sitDownId }],
        order: [{ column: 'created_at', direction: 'asc' }],
      });
      // Deduplicate by ID (joins can occasionally produce dupes)
      const deduped = Array.from(new Map(data.map((m) => [m.id, m])).values());
      setMessages(deduped);
      return deduped;
    } catch {
      // ignore poll errors
      return [];
    }
  }, [sitDownId]);

  const fetchTypingIndicators = useCallback(async () => {
    if (!sitDownId) return;
    try {
      const data = await db.select<RemoteTypingIndicator>('typing_indicators', {
        select: '*',
        filters: [{ column: 'sit_down_id', op: 'eq', value: sitDownId }],
      });
      setTypingIndicators(data);
    } catch {
      // ignore poll errors
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

  // Single poll: messages + optional piggyback (participants, etc.)
  useEffect(() => {
    if (!sitDownId) return;

    pollRef.current = setInterval(() => {
      fetchMessages();
      fetchTypingIndicators();
      onPollRef.current?.();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sitDownId, fetchMessages, fetchTypingIndicators]);

  async function sendMessage(content: string, mentions: string[] = [], metadata: Record<string, unknown> = {}): Promise<Message[]> {
    if (!sitDownId) throw new Error('No sit-down selected');
    if (!user) throw new Error('Not authenticated');

    await db.insert('messages', {
      sit_down_id: sitDownId,
      sender_type: 'don',
      sender_user_id: user.id,
      content,
      mentions,
      ...(Object.keys(metadata).length > 0 && { metadata }),
    });

    // Immediately fetch to show the new message and return fresh list
    return await fetchMessages();
  }

  return { messages, typingIndicators, loading, sendMessage, refetch: fetchMessages };
}
