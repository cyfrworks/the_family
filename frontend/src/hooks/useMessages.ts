import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { CatalogModel, Member, Message, Profile } from '../lib/types';

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
        select: '*',
        filters: [{ column: 'sit_down_id', op: 'eq', value: sitDownId }],
        order: [{ column: 'created_at', direction: 'asc' }],
      });

      // Fetch profiles for don senders
      const userIds = [...new Set(data.filter((m) => m.sender_user_id).map((m) => m.sender_user_id as string))];
      if (userIds.length > 0) {
        const profiles = await db.select<Profile>('profiles', {
          select: '*',
          filters: [{ column: 'id', op: 'in', value: `(${userIds.join(',')})` }],
        });
        const profileMap = new Map(profiles.map((p) => [p.id, p]));
        for (const msg of data) {
          if (msg.sender_user_id) msg.profile = profileMap.get(msg.sender_user_id);
        }
      }

      // Fetch members for member senders
      const memberIds = [...new Set(data.filter((m) => m.sender_member_id).map((m) => m.sender_member_id as string))];
      if (memberIds.length > 0) {
        const members = await db.select<Member>('members', {
          select: '*',
          filters: [{ column: 'id', op: 'in', value: `(${memberIds.join(',')})` }],
        });

        // Enrich members with catalog model data
        const modelIds = [...new Set(members.map((m) => m.catalog_model_id))];
        if (modelIds.length > 0) {
          const models = await db.select<CatalogModel>('model_catalog', {
            select: '*',
            filters: [{ column: 'id', op: 'in', value: `(${modelIds.join(',')})` }],
          });
          const modelMap = new Map(models.map((m) => [m.id, m]));
          for (const member of members) {
            member.catalog_model = modelMap.get(member.catalog_model_id);
          }
        }

        const memberMap = new Map(members.map((m) => [m.id, m]));
        for (const msg of data) {
          if (msg.sender_member_id) msg.member = memberMap.get(msg.sender_member_id);
        }
      }

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
