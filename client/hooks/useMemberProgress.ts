import { useEffect, useMemo, useState } from 'react';
import { onMemberProgress } from '../lib/realtime-hub';

export interface ProgressEvent {
  kind: string;
  text?: string;
  turn?: number;
  content?: string;
  inputTokens?: number;
  outputTokens?: number;
  tool?: string;
  toolCallId?: string;
  input?: string;
  preview?: string;
  timestamp: number;
}

export interface MemberProgress {
  executionId: string;
  memberId: string;
  memberName: string;
  statusText: string;
  events: ProgressEvent[];
  streamedContent: string;
  currentTurn: number;
  completed: boolean;
  toolsUsed: string[];
  totalTokens: number;
  startedAt: number;
  messageId?: string;
}

const STALE_TIMEOUT_MS = 120_000;

// Key for the progress map: combines execution_id + member_id so that
// concurrent requests for the same member get separate entries, AND
// multiple members in the same execution (e.g. @all) also get separate entries.
function progressKey(data: { execution_id?: string; member_id?: string }): string {
  const execId = data.execution_id as string;
  const memId = data.member_id as string;
  return execId ? `${execId}:${memId}` : memId || '';
}

export function useMemberProgress(sitDownId: string | undefined) {
  const [entries, setEntries] = useState<Map<string, MemberProgress>>(new Map());

  useEffect(() => {
    if (!sitDownId) return;

    const unsubscribe = onMemberProgress(sitDownId, (data) => {
      const kind = data.kind as string;
      const memberId = data.member_id as string;
      const memberName = data.member_name as string;
      const key = progressKey(data);

      if (!memberId || !key) return;

      if (kind === 'message_inserted') {
        const messageId = data.message_id as string;
        setEntries((prev) => {
          const existing = prev.get(key);
          if (!existing) return prev;
          const next = new Map(prev);
          const tokenStr = existing.totalTokens > 0
            ? `${existing.totalTokens >= 1000 ? `${(existing.totalTokens / 1000).toFixed(1)}k` : existing.totalTokens} tokens`
            : null;
          const toolStr = existing.toolsUsed.length > 0
            ? `Tools: ${existing.toolsUsed.join(', ')}`
            : null;
          const parts = ['Finished', tokenStr, toolStr].filter(Boolean);
          next.set(key, { ...existing, completed: true, statusText: parts.join(' | '), messageId });
          return next;
        });
        // Keep entry alive so it can be shown inline with the message
        setTimeout(() => {
          setEntries((prev) => {
            const existing = prev.get(key);
            if (!existing || !existing.completed) return prev;
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }, 60_000);
        return;
      }

      const now = Date.now();

      setEntries((prev) => {
        const next = new Map(prev);
        const existing = next.get(key) || {
          executionId: key,
          memberId,
          memberName,
          statusText: '',
          events: [],
          streamedContent: '',
          currentTurn: 0,
          completed: false,
          toolsUsed: [],
          totalTokens: 0,
          startedAt: Date.now(),
        };

        let updated = { ...existing };

        if (kind === 'status') {
          const text = data.text as string;
          updated.statusText = text;
          updated.events = [...updated.events, { kind, text, timestamp: now }];
        } else if (kind === 'turn_start') {
          const turn = data.turn as number;
          updated.currentTurn = turn;
          updated.statusText = turn > 1 ? `Turn ${turn}` : updated.statusText || 'Thinking...';
          updated.events = [...updated.events, { kind, turn, timestamp: now }];
        } else if (kind === 'tool_use') {
          const tool = data.tool as string;
          const turn = data.turn as number | undefined;
          updated.statusText = turn ? `Turn ${turn}: calling ${tool}...` : `Calling ${tool}...`;
          if (!updated.toolsUsed.includes(tool)) {
            updated.toolsUsed = [...updated.toolsUsed, tool];
          }
          updated.events = [...updated.events, {
            kind, turn, tool, toolCallId: data.tool_call_id as string,
            input: data.input as string, timestamp: now,
          }];
        } else if (kind === 'tool_result') {
          const tool = data.tool as string;
          const turn = data.turn as number | undefined;
          updated.statusText = turn ? `Turn ${turn}: ${tool} returned` : `${tool} returned`;
          updated.events = [...updated.events, {
            kind, turn, tool, toolCallId: data.tool_call_id as string,
            preview: data.preview as string, timestamp: now,
          }];
        } else if (kind === 'text_delta') {
          const content = data.content as string;
          updated.streamedContent += content;
          updated.statusText = `Writing response... (${updated.streamedContent.length} chars)`;
          updated.events = [...updated.events, {
            kind, turn: data.turn as number, content, timestamp: now,
          }];
        } else if (kind === 'usage') {
          const inputTokens = data.input_tokens as number;
          const outputTokens = data.output_tokens as number;
          const tokens = (inputTokens || 0) + (outputTokens || 0);
          updated.totalTokens += tokens;
          updated.statusText = `Done (${updated.totalTokens.toLocaleString()} tokens)`;
          updated.events = [...updated.events, {
            kind, turn: data.turn as number,
            inputTokens, outputTokens,
            timestamp: now,
          }];
        }

        next.set(key, updated);
        return next;
      });
    });

    return () => {
      unsubscribe();
      setEntries(new Map());
    };
  }, [sitDownId]);

  // Auto-cleanup stale entries (120s timeout)
  const hasEntries = entries.size > 0;
  useEffect(() => {
    if (!hasEntries) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setEntries((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, m] of next) {
          const lastEvent = m.events[m.events.length - 1];
          if (lastEvent && now - lastEvent.timestamp > STALE_TIMEOUT_MS) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 30_000);

    return () => clearInterval(interval);
  }, [hasEntries]);

  return useMemo(() => Array.from(entries.values()), [entries]);
}
