import { useCallback, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { invokeAgent, CyfrError } from '../lib/cyfr';
import { useAuth } from '../contexts/AuthContext';
import type { Message, Member } from '../lib/types';
import { AI_RATE_LIMIT_MS, MAX_CONTEXT_MESSAGES } from '../config/constants';

interface PendingResponse {
  memberId: string;
  memberName: string;
}

export interface SitDownContext {
  isCommission: boolean;
  dons: Array<{ userId: string; displayName: string }>;
  allMembers: Member[];
}

function buildSystemPrompt(member: Member, context?: SitDownContext): string {
  let preamble = `Your name is "${member.name}". Never prefix your responses with your name or a label like "[${member.name}]:" — just respond directly with your message. Respond only as yourself — do not write dialogue or responses for other participants. When multiple roles are addressed in the same message, focus on the instructions directed at you.`;

  if (context && context.isCommission) {
    // Commission sit-down: ownership + who's at the table
    const ownerDon = context.dons.find((d) => d.userId === member.owner_id);
    const donName = ownerDon ? `Don ${ownerDon.displayName}` : 'your Don';

    preamble += `\n\nYou were created by ${donName}. You report to ${donName}.`;

    const familyLines: string[] = [];
    for (const don of context.dons) {
      const donMembers = context.allMembers
        .filter((m) => m.owner_id === don.userId)
        .map((m) => m.name);
      if (donMembers.length > 0) {
        familyLines.push(`- Don ${don.displayName}'s team: ${donMembers.join(', ')}`);
      } else {
        familyLines.push(`- Don ${don.displayName} (no members at the table)`);
      }
    }

    preamble += `\n\nThis is a group sit-down. The people and roles present are:\n${familyLines.join('\n')}`;
    preamble += `\n\nAlways address Dons as "Don [Name]". Be helpful to everyone, but if there's a conflict of interest, defer to ${donName}.`;
  } else if (context && context.dons.length > 0) {
    // Personal sit-down: simple ownership line
    preamble += ` You report to Don ${context.dons[0].displayName}. Always address them as "Don ${context.dons[0].displayName}".`;
  }

  return `${preamble}\n\n${member.system_prompt}`;
}

export function useAIResponse(sitDownId: string | undefined, sitDownContext?: SitDownContext) {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastCallRef = useRef(0);

  const triggerAIResponse = useCallback(
    async (member: Member, messages: Message[], replyToId?: string) => {
      if (!sitDownId) return;

      // Rate limiting
      const now = Date.now();
      const timeSinceLast = now - lastCallRef.current;
      if (timeSinceLast < AI_RATE_LIMIT_MS) {
        await new Promise((r) => setTimeout(r, AI_RATE_LIMIT_MS - timeSinceLast));
      }
      lastCallRef.current = Date.now();

      setPending((prev) => [...prev, { memberId: member.id, memberName: member.name }]);
      setError(null);

      // Broadcast typing state so other clients can see the indicator
      if (user) {
        await db.delete('typing_indicators', [
          { column: 'sit_down_id', op: 'eq', value: sitDownId },
          { column: 'member_id', op: 'eq', value: member.id },
        ]).catch(() => {});
        await db.insert('typing_indicators', {
          sit_down_id: sitDownId,
          member_id: member.id,
          member_name: member.name,
          started_by: user.id,
        }).catch(() => {});
      }

      try {
        // Build conversation history for the AI
        // Only THIS member's previous messages are "assistant"; everything else
        // (dons + other members) is "user" context so the model doesn't try to
        // generate dialogue on behalf of other participants.
        const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);

        // Detect duplicate member names so we can disambiguate in the history
        const duplicateMemberNames = new Set<string>();
        if (sitDownContext) {
          const nameCounts = new Map<string, number>();
          for (const m of sitDownContext.allMembers) {
            nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
          }
          for (const [name, count] of nameCounts) {
            if (count > 1) duplicateMemberNames.add(name);
          }
        }

        const conversationHistory = recentMessages.map((msg) => {
          if (msg.sender_type === 'member' && msg.sender_member_id === member.id) {
            return { role: 'assistant' as const, content: msg.content };
          } else if (msg.sender_type === 'don') {
            const name = msg.profile?.display_name ?? 'Don';
            return { role: 'user' as const, content: `[Don ${name}]: ${msg.content}` };
          } else {
            const memberName = msg.member?.name ?? 'Unknown';
            // If duplicate member name, append owner Don to disambiguate
            if (duplicateMemberNames.has(memberName) && msg.member?.owner_id && sitDownContext) {
              const owner = sitDownContext.dons.find((d) => d.userId === msg.member?.owner_id);
              if (owner) {
                return { role: 'user' as const, content: `[${memberName} (Don ${owner.displayName}'s)]: ${msg.content}` };
              }
            }
            return { role: 'user' as const, content: `[${memberName}]: ${msg.content}` };
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
          provider: member.provider,
          model: member.model,
          system: buildSystemPrompt(member, sitDownContext),
          messages: conversationHistory,
        });

        // Insert AI response via RPC (through CYFR Supabase catalyst)
        await db.rpc('insert_ai_message', {
          p_sit_down_id: sitDownId,
          p_sender_member_id: member.id,
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
            p_sender_member_id: member.id,
            p_content: errorContent,
            p_metadata: { error: true, ...(replyToId && { reply_to_id: replyToId }) },
          });
        } catch {
          // DB insert also failed — fall back to local-only error
          setError(
            aiErr instanceof CyfrError
              ? `${member.name} couldn't respond: ${aiErr.message}`
              : `${member.name} encountered an error`
          );
        }
      } finally {
        setPending((prev) => prev.filter((p) => p.memberId !== member.id));
        db.delete('typing_indicators', [
          { column: 'sit_down_id', op: 'eq', value: sitDownId },
          { column: 'member_id', op: 'eq', value: member.id },
        ]).catch(() => {});
      }
    },
    [sitDownId, sitDownContext]
  );

  async function triggerMultipleResponses(
    memberIds: string[],
    messages: Message[],
    allMembers: Member[],
    replyToId?: string
  ) {
    setError(null);

    const members = memberIds
      .map((id) => allMembers.find((m) => m.id === id))
      .filter((m): m is Member => m !== undefined);

    const results = await Promise.allSettled(
      members.map((member) => triggerAIResponse(member, messages, replyToId))
    );

    const errors: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const err = result.reason;
        errors.push(
          err instanceof CyfrError
            ? `${members[i].name}: ${err.message}`
            : `${members[i].name} encountered an error`
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
