import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cyfrCallStream, CyfrError } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { broadcastMemberProgress } from '../lib/realtime-hub';

interface SendMessageResult {
  message_id: string;
  mentioned_member_ids: string[];
}

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

export function useSendMessage(sitDownId: string | undefined) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string, replyToId?: string): Promise<SendMessageResult | null> => {
      if (!sitDownId) return null;

      const accessToken = getAccessToken();
      if (!accessToken) return null;

      setError(null);

      // Read cached sit-down data to skip redundant server-side DB fetches
      const cachedData = queryClient.getQueryData<{ participants: unknown[]; messages: unknown[] }>(['sitDown', 'enter', sitDownId]);

      // Only send the most recent messages to avoid bloating the payload
      const MAX_CONTEXT_MESSAGES = 25;
      const recentMessages = cachedData?.messages
        ? cachedData.messages.slice(-MAX_CONTEXT_MESSAGES)
        : undefined;

      const input = {
        action: 'send_message',
        sit_down_id: sitDownId,
        content,
        access_token: accessToken,
        ...(replyToId && { reply_to_id: replyToId }),
        ...(cachedData && {
          participants: cachedData.participants,
          messages: recentMessages,
        }),
      };

      try {
        // Unique ID per execution so concurrent requests for the same member don't collide
        const executionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        const result = await new Promise<Record<string, unknown> | null>((resolve, reject) => {
          cyfrCallStream(
            'execution',
            {
              action: 'run',
              reference: SIT_DOWN_REF,
              input,
              type: 'formula',
              timeout: 600000,
            },
            {
              onEmit: (data) => {
                // Relay progress events to other participants via WebSocket
                broadcastMemberProgress({ ...data, execution_id: executionId });
              },
              onComplete: (data) => {
                if (data.status === 'error' || data.type === 'execution_failed') {
                  const errPayload = data.message ?? data.error;
                  const errMsg = typeof errPayload === 'string'
                    ? errPayload
                    : (errPayload as Record<string, string>)?.message ?? 'Execution failed';
                  reject(new CyfrError(-33100, errMsg));
                  return;
                }
                const res = (data.status === 'completed' && data.result
                  ? data.result
                  : data) as Record<string, unknown>;
                resolve(res);
              },
              onError: (err) => {
                reject(err);
              },
            },
          ).catch(reject);
        });

        if (result?.error) {
          const errObj = result.error as Record<string, string>;
          setError(errObj.message || 'Something went wrong.');
          return null;
        }

        return {
          message_id: (result?.message_id as string) || '',
          mentioned_member_ids: (result?.mentioned_member_ids as string[]) || [],
        };
      } catch (err) {
        setError(
          err instanceof CyfrError
            ? `Message couldn't be sent: ${err.message}`
            : "The message didn't get through.",
        );
        return null;
      }
    },
    [sitDownId, queryClient],
  );

  return {
    sendMessage,
    error,
    clearError: () => setError(null),
  };
}
