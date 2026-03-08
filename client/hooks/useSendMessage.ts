import { useCallback, useState } from 'react';
import { cyfrCall, CyfrError } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';

interface SendMessageResult {
  message_id: string;
  mentioned_member_ids: string[];
}

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

export function useSendMessage(sitDownId: string | undefined) {
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string, replyToId?: string): Promise<SendMessageResult | null> => {
      if (!sitDownId) return null;

      const accessToken = getAccessToken();
      if (!accessToken) return null;

      setError(null);

      try {
        const result = await cyfrCall('execution', {
          action: 'run',
          reference: SIT_DOWN_REF,
          input: {
            action: 'send_message',
            sit_down_id: sitDownId,
            content,
            access_token: accessToken,
            ...(replyToId && { reply_to_id: replyToId }),
          },
          type: 'formula',
          timeout: 600000,
        });

        const res = result as Record<string, unknown> | null;

        if (res?.error) {
          const errObj = res.error as Record<string, string>;
          const msg = errObj.message || 'Something went wrong.';
          setError(msg);
          return null;
        }

        const sendResult: SendMessageResult = {
          message_id: (res?.message_id as string) || '',
          mentioned_member_ids: (res?.mentioned_member_ids as string[]) || [],
        };

        return sendResult;
      } catch (err) {
        setError(
          err instanceof CyfrError
            ? `Message couldn't be sent: ${err.message}`
            : "The message didn't get through."
        );
        return null;
      }
    },
    [sitDownId]
  );

  return {
    sendMessage,
    error,
    clearError: () => setError(null),
  };
}
