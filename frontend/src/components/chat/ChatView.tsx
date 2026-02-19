import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMessages } from '../../hooks/useMessages';
import { useAIResponse, type SitDownContext } from '../../hooks/useAIResponse';
import { extractMentionedRoleIds, hasAllMention } from '../../lib/mention-parser';
import { MAX_ALL_MENTIONS } from '../../config/constants';
import type { Message, Role } from '../../lib/types';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { TypingIndicator } from './TypingIndicator';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface ChatViewProps {
  sitDownId: string;
  roles: Role[];
  sitDownContext?: SitDownContext;
  onToggleMembers?: () => void;
  showMembers?: boolean;
  onPoll?: () => void;
}

export function ChatView({ sitDownId, roles, sitDownContext, onToggleMembers, showMembers, onPoll }: ChatViewProps) {
  const { messages, typingIndicators, loading, sendMessage } = useMessages(sitDownId, onPoll);
  const ai = useAIResponse(sitDownId, sitDownContext);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [animationQueue, setAnimationQueue] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);
  const hasInitialScrolled = useRef(false);

  // Merge local pending (immediate on triggering client) with remote typing
  // indicators (visible to other clients via polling). Dedup by roleId and
  // drop indicators for roles that already have a message newer than the indicator.
  const allTyping = useMemo(() => {
    const localRoleIds = new Set(ai.pending.map((p) => p.roleId));

    const latestMsgByRole = new Map<string, string>();
    for (const msg of messages) {
      if (msg.sender_role_id) latestMsgByRole.set(msg.sender_role_id, msg.created_at);
    }

    const remote = typingIndicators
      .filter((t) => !localRoleIds.has(t.role_id))
      .filter((t) => {
        const latest = latestMsgByRole.get(t.role_id);
        return !latest || new Date(latest) < new Date(t.started_at);
      })
      .filter((t) => Date.now() - new Date(t.started_at).getTime() < 120_000)
      .map((t) => ({ roleId: t.role_id, roleName: t.role_name }));

    return [...ai.pending, ...remote];
  }, [ai.pending, typingIndicators, messages]);

  // Snap to bottom on initial load, then only auto-scroll when near bottom
  useEffect(() => {
    if (loading) {
      hasInitialScrolled.current = false;
      return;
    }
    if (!hasInitialScrolled.current && messages.length > 0) {
      hasInitialScrolled.current = true;
      bottomRef.current?.scrollIntoView();
      return;
    }
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, allTyping]);

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollButton(!nearBottom);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  // Keep scrolling to bottom during typewriter animation
  useEffect(() => {
    if (animationQueue.length === 0) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const interval = setInterval(() => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (nearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }, 200);
    return () => clearInterval(interval);
  }, [animationQueue]);

  // Queue new role messages for typewriter animation (skip initial load)
  useEffect(() => {
    if (loading) {
      lastSeenIdRef.current = null;
      setAnimationQueue([]);
      return;
    }

    if (messages.length === 0) return;

    const prevId = lastSeenIdRef.current;
    lastSeenIdRef.current = messages[messages.length - 1].id;

    // Initial load — don't animate
    if (prevId === null) return;

    // Find where the new messages start
    const prevIndex = messages.findIndex((m) => m.id === prevId);
    if (prevIndex === -1) return;

    const newRoleIds = messages
      .slice(prevIndex + 1)
      .filter((m) => m.sender_type === 'role')
      .map((m) => m.id);

    if (newRoleIds.length > 0) {
      setAnimationQueue((prev) => [...prev, ...newRoleIds]);
    }
  }, [messages, loading]);

  const handleAnimationComplete = useCallback(() => {
    setAnimationQueue((prev) => prev.slice(1));
  }, []);

  async function handleSend(content: string) {
    try {
      // Extract mentioned role IDs
      const mentionedIds = extractMentionedRoleIds(content, roles);

      // @all confirmation
      if (hasAllMention(content) && roles.length > MAX_ALL_MENTIONS) {
        toast.error(`You can only summon ${MAX_ALL_MENTIONS} at once. You've got ${roles.length} at the table.`);
        return;
      }

      const metadata = replyTo ? { reply_to_id: replyTo.id } : {};
      const freshMessages = await sendMessage(content, mentionedIds, metadata);
      setReplyTo(null);

      // Trigger AI responses for mentioned roles
      if (mentionedIds.length > 0) {
        // Find the user's message that triggered these responses
        const triggerMsg = [...freshMessages].reverse().find((m) => m.sender_type === 'don');
        ai.triggerMultipleResponses(mentionedIds, freshMessages, roles, triggerMsg?.id);
      }
    } catch {
      toast.error('The message didn\'t get through.');
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-stone-500">Loading conversation...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="relative flex-1 min-h-0">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="h-full overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="font-serif text-lg text-stone-400">The table is set.</p>
              <p className="mt-1 text-sm text-stone-600">
                Start the conversation. Use @role to bring someone in.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-4">
            {messages.map((msg) => {
              const msgReplyToId = (msg.metadata as Record<string, unknown>)?.reply_to_id as string | undefined;
              const msgReplyTo = msgReplyToId ? messages.find((m) => m.id === msgReplyToId) : undefined;
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  replyTo={msgReplyTo}
                  animate={animationQueue[0] === msg.id && msg.sender_type === 'role'}
                  queued={animationQueue.indexOf(msg.id) > 0}
                  onAnimationComplete={handleAnimationComplete}
                  onReply={setReplyTo}
                />
              );
            })}
          </div>
        )}

        {/* Typing indicators */}
        {allTyping.map((p) => (
          <TypingIndicator key={p.roleId} roleName={p.roleName} />
        ))}

        {/* Error */}
        {ai.error && (
          <div className="mx-4 mb-2 rounded-lg bg-red-900/20 border border-red-800/50 px-3 py-2 text-xs text-red-300">
            {ai.error}
            <button
              onClick={ai.clearError}
              className="ml-2 text-red-400 hover:text-red-300 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-stone-700 bg-stone-800 text-stone-400 shadow-lg hover:bg-stone-700 hover:text-stone-200 transition-colors"
        >
          <ChevronDown size={16} />
        </button>
      )}
      </div>

      {/* Composer */}
      <MessageComposer
        roles={roles}
        onSend={handleSend}
        onToggleMembers={onToggleMembers}
        showMembers={showMembers}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
