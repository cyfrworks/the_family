import { useCallback, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { invokeAgent, CyfrError } from '../lib/cyfr';
import { useAuth } from '../contexts/AuthContext';
import type { Message, Role } from '../lib/types';
import { AI_RATE_LIMIT_MS, MAX_CONTEXT_MESSAGES } from '../config/constants';

interface PendingResponse {
  roleId: string;
  roleName: string;
}

export interface SitDownContext {
  isCommission: boolean;
  dons: Array<{ userId: string; displayName: string }>;
  allRoles: Role[];
}

function buildSystemPrompt(role: Role, context?: SitDownContext): string {
  let preamble = `Your name is "${role.name}". Respond only as yourself — do not write dialogue or responses for other participants. When multiple roles are addressed in the same message, focus on the instructions directed at you.`;

  if (context && context.isCommission) {
    // Commission sit-down: ownership + who's at the table
    const ownerDon = context.dons.find((d) => d.userId === role.owner_id);
    const donName = ownerDon?.displayName ?? 'your owner';

    preamble += `\n\nYou were created by ${donName}. You report to ${donName}.`;

    const familyLines: string[] = [];
    for (const don of context.dons) {
      const donRoles = context.allRoles
        .filter((r) => r.owner_id === don.userId)
        .map((r) => r.name);
      if (donRoles.length > 0) {
        familyLines.push(`- ${don.displayName}'s team: ${donRoles.join(', ')}`);
      } else {
        familyLines.push(`- ${don.displayName} (no members at the table)`);
      }
    }

    preamble += `\n\nThis is a group sit-down. The people and roles present are:\n${familyLines.join('\n')}`;
    preamble += `\n\nBe helpful to everyone, but if there's a conflict of interest, defer to ${donName}.`;
  } else if (context && context.dons.length > 0) {
    // Personal sit-down: simple ownership line
    preamble += ` You report to ${context.dons[0].displayName}.`;
  }

  return `${preamble}\n\n${role.system_prompt}`;
}

export function useAIResponse(sitDownId: string | undefined, sitDownContext?: SitDownContext) {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastCallRef = useRef(0);

  const triggerAIResponse = useCallback(
    async (role: Role, messages: Message[], replyToId?: string) => {
      if (!sitDownId) return;

      // Rate limiting
      const now = Date.now();
      const timeSinceLast = now - lastCallRef.current;
      if (timeSinceLast < AI_RATE_LIMIT_MS) {
        await new Promise((r) => setTimeout(r, AI_RATE_LIMIT_MS - timeSinceLast));
      }
      lastCallRef.current = Date.now();

      setPending((prev) => [...prev, { roleId: role.id, roleName: role.name }]);
      setError(null);

      // Broadcast typing state so other clients can see the indicator
      if (user) {
        await db.delete('typing_indicators', [
          { column: 'sit_down_id', op: 'eq', value: sitDownId },
          { column: 'role_id', op: 'eq', value: role.id },
        ]).catch(() => {});
        await db.insert('typing_indicators', {
          sit_down_id: sitDownId,
          role_id: role.id,
          role_name: role.name,
          started_by: user.id,
        }).catch(() => {});
      }

      try {
        // Build conversation history for the AI
        // Only THIS role's previous messages are "assistant"; everything else
        // (dons + other roles) is "user" context so the model doesn't try to
        // generate dialogue on behalf of other participants.
        const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
        const conversationHistory = recentMessages.map((msg) => {
          if (msg.sender_type === 'role' && msg.sender_role_id === role.id) {
            return { role: 'assistant' as const, content: msg.content };
          } else if (msg.sender_type === 'don') {
            const name = msg.profile?.display_name ?? 'Don';
            return { role: 'user' as const, content: `[${name}]: ${msg.content}` };
          } else {
            const roleName = msg.role?.name ?? 'Unknown';
            return { role: 'user' as const, content: `[${roleName}]: ${msg.content}` };
          }
        });

        // The API needs the last message to be "user" to generate a response.
        // If it's our own previous message, flip it.
        if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'assistant') {
          const lastMsg = conversationHistory[conversationHistory.length - 1];
          conversationHistory[conversationHistory.length - 1] = {
            role: 'user',
            content: lastMsg.content,
          };
        }

        const result = await invokeAgent({
          provider: role.provider,
          model: role.model,
          system: buildSystemPrompt(role, sitDownContext),
          messages: conversationHistory,
        });

        // Insert AI response via RPC (through CYFR Supabase catalyst)
        await db.rpc('insert_ai_message', {
          p_sit_down_id: sitDownId,
          p_sender_role_id: role.id,
          p_content: result.content,
          p_metadata: { provider: result.provider, model: result.model, ...(replyToId && { reply_to_id: replyToId }) },
        });
      } catch (aiErr) {
        // Insert the error as a visible message so all participants can see it
        const errorContent = aiErr instanceof CyfrError
          ? `_Couldn't respond: ${aiErr.message}_`
          : `_Encountered an error and couldn't respond._`;
        try {
          await db.rpc('insert_ai_message', {
            p_sit_down_id: sitDownId,
            p_sender_role_id: role.id,
            p_content: errorContent,
            p_metadata: { error: true, ...(replyToId && { reply_to_id: replyToId }) },
          });
        } catch {
          // DB insert also failed — fall back to local-only error
          setError(
            aiErr instanceof CyfrError
              ? `${role.name} couldn't respond: ${aiErr.message}`
              : `${role.name} encountered an error`
          );
        }
      } finally {
        setPending((prev) => prev.filter((p) => p.roleId !== role.id));
        db.delete('typing_indicators', [
          { column: 'sit_down_id', op: 'eq', value: sitDownId },
          { column: 'role_id', op: 'eq', value: role.id },
        ]).catch(() => {});
      }
    },
    [sitDownId, sitDownContext]
  );

  async function triggerMultipleResponses(
    roleIds: string[],
    messages: Message[],
    allRoles: Role[],
    replyToId?: string
  ) {
    setError(null);

    const roles = roleIds
      .map((id) => allRoles.find((r) => r.id === id))
      .filter((r): r is Role => r !== undefined);

    const results = await Promise.allSettled(
      roles.map((role) => triggerAIResponse(role, messages, replyToId))
    );

    const errors: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const err = result.reason;
        errors.push(
          err instanceof CyfrError
            ? `${roles[i].name}: ${err.message}`
            : `${roles[i].name} encountered an error`
        );
      }
    });

    if (errors.length > 0) {
      setError(errors.join('. '));
    }
  }

  return {
    pending,
    error,
    clearError: () => setError(null),
    triggerAIResponse,
    triggerMultipleResponses,
    isProcessing: pending.length > 0,
  };
}
