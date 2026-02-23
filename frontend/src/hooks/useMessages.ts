import { useCallback, useEffect, useRef, useState } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { Message } from '../lib/types';

export interface RemoteTypingIndicator {
  sit_down_id: string;
  member_id: string;
  member_name: string;
  started_by: string;
  started_at: string;
}

const POLL_FOCUSED_MS = 3000;
const POLL_BACKGROUND_MS = 15000;
const MESSAGES_API_REF = 'formula:local.messages-api:0.1.0';

export function useMessages(sitDownId: string | undefined, onPoll?: () => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingIndicators, setTypingIndicators] = useState<RemoteTypingIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  const fetchMessages = useCallback(async (): Promise<Message[]> => {
    if (!sitDownId) return [];
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return [];

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: { registry: MESSAGES_API_REF },
        input: { action: 'list', access_token: accessToken, sit_down_id: sitDownId },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      const data = (res?.messages as Message[]) || [];
      setMessages(data);
      return data;
    } catch (err) {
      console.error('[useMessages] Failed to fetch messages:', err);
      return [];
    }
  }, [sitDownId]);

  const fetchTypingIndicators = useCallback(async () => {
    if (!sitDownId) return;
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: { registry: MESSAGES_API_REF },
        input: { action: 'typing_indicators', access_token: accessToken, sit_down_id: sitDownId },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) return;

      setTypingIndicators((res?.typing_indicators as RemoteTypingIndicator[]) || []);
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

  // Adaptive polling: fast when tab is focused, slow when backgrounded
  useEffect(() => {
    if (!sitDownId) return;

    function poll() {
      fetchMessages();
      fetchTypingIndicators();
      onPollRef.current?.();
    }

    function scheduleNext() {
      const interval = document.visibilityState === 'visible' ? POLL_FOCUSED_MS : POLL_BACKGROUND_MS;
      pollRef.current = setInterval(() => {
        poll();
      }, interval);
    }

    scheduleNext();

    function handleVisibilityChange() {
      if (pollRef.current) clearInterval(pollRef.current);
      // Poll immediately when tab regains focus
      if (document.visibilityState === 'visible') poll();
      scheduleNext();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sitDownId, fetchMessages, fetchTypingIndicators]);

  return { messages, typingIndicators, loading, refetch: fetchMessages };
}
