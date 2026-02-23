import { useCallback, useState } from 'react';
import { cyfrCall, CyfrError } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';

interface SendMessageResult {
  message_id: string;
  mentioned_member_ids: string[];
}

const SEND_MESSAGE_REF = 'formula:local.send-message:0.1.0';
const RESPONSE_BATCH_REF = 'formula:local.sit-down-response-batch:0.1.0';

/**
 * Send a message via the send-message formula, then trigger AI responses
 * for mentioned members via the sit-down-response-batch formula.
 *
 * Both operations are server-side: mention parsing, business-rule validation,
 * message insertion, and AI response fan-out.
 */
export function useSendMessage(sitDownId: string | undefined) {
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);

  const sendMessage = useCallback(
    async (content: string, replyToId?: string): Promise<SendMessageResult | null> => {
      if (!sitDownId) return null;

      const accessToken = getAccessToken();
      if (!accessToken) return null;

      setError(null);

      try {
        const result = await cyfrCall('execution', {
          action: 'run',
          reference: { registry: SEND_MESSAGE_REF },
          input: {
            sit_down_id: sitDownId,
            content,
            access_token: accessToken,
            ...(replyToId && { reply_to_id: replyToId }),
          },
          type: 'formula',
          timeout: 30000,
        });

        const res = result as Record<string, unknown> | null;

        // Check for formula-level errors (e.g., @all too many mentions, not a participant)
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

        // Trigger AI responses server-side (fire-and-forget)
        if (sendResult.mentioned_member_ids.length > 0) {
          triggerBatchResponses(
            sitDownId,
            sendResult.mentioned_member_ids,
            sendResult.message_id,
            accessToken,
          );
        }

        return sendResult;
      } catch (err) {
        setError(
          err instanceof CyfrError
            ? `Message couldn't be sent: ${err.message}`
            : 'The message didn\'t get through.'
        );
        return null;
      }
    },
    [sitDownId]
  );

  // Fire-and-forget: the batch formula handles typing indicators and
  // response insertion. The frontend polls for new messages.
  function triggerBatchResponses(
    sdId: string,
    memberIds: string[],
    replyToId: string,
    accessToken: string,
  ) {
    setResponding(true);
    cyfrCall('execution', {
      action: 'run',
      reference: { registry: RESPONSE_BATCH_REF },
      input: {
        sit_down_id: sdId,
        member_ids: memberIds,
        reply_to_id: replyToId,
        access_token: accessToken,
      },
      type: 'formula',
      timeout: 600000,
    })
      .catch(() => {
        // Errors are handled per-member inside the batch formula.
        // Only network-level failures reach here.
      })
      .finally(() => setResponding(false));
  }

  return {
    sendMessage,
    responding,
    error,
    clearError: () => setError(null),
  };
}
