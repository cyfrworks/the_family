import { useEffect, useMemo, useRef, useState } from 'react';
import { useMessages } from '../../hooks/useMessages';
import { useSendMessage } from '../../hooks/useSendMessage';
import type { Message, Member } from '../../lib/types';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { TypingIndicator } from './TypingIndicator';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface ChatViewProps {
  sitDownId: string;
  members: Member[];
  memberOwnerMap?: Map<string, string>;
  onToggleMembers?: () => void;
  showMembers?: boolean;
}

export function ChatView({ sitDownId, members, memberOwnerMap, onToggleMembers, showMembers }: ChatViewProps) {
  const { messages, typingIndicators, loading, refetch } = useMessages(sitDownId);
  const send = useSendMessage(sitDownId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const hasInitialScrolled = useRef(false);

  const displayError = send.error;
  const clearError = () => { send.clearError(); };

  // Remote typing indicators from the server (inserted by sit-down formula).
  // Drop stale indicators for members that already have a newer message.
  const allTyping = useMemo(() => {
    const latestMsgByMember = new Map<string, string>();
    for (const msg of messages) {
      if (msg.sender_member_id) latestMsgByMember.set(msg.sender_member_id, msg.created_at);
    }

    return typingIndicators
      .filter((t) => {
        const latest = latestMsgByMember.get(t.member_id);
        return !latest || new Date(latest) < new Date(t.started_at);
      })
      .filter((t) => Date.now() - new Date(t.started_at).getTime() < 120_000)
      .map((t) => ({ memberId: t.member_id, memberName: t.member_name }));
  }, [typingIndicators, messages]);

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

  async function handleSend(content: string) {
    const replyId = replyTo?.id;
    setReplyTo(null);

    // Fire-and-forget: formula saves message to DB, realtime updates UI
    send.sendMessage(content, replyId)
      .then((result) => {
        if (!result && send.error) {
          toast.error(send.error);
        }
        // Fallback refetch when formula finishes (covers non-working realtime)
        refetch();
      })
      .catch(() => {
        toast.error("The message didn't get through.");
      });

    // Realtime INSERT subscription handles near-instant UI updates.
    // Formula-completion refetch (line 90) is a sufficient fallback.
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
                Start the conversation. Use @member to bring someone in.
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
                  onReply={setReplyTo}
                />
              );
            })}
          </div>
        )}

        {/* Typing indicators */}
        {allTyping.map((p) => (
          <TypingIndicator key={p.memberId} memberName={p.memberName} />
        ))}

        {/* Error */}
        {displayError && (
          <div className="mx-4 mb-2 rounded-lg bg-red-900/20 border border-red-800/50 px-3 py-2 text-xs text-red-300">
            {displayError}
            <button
              onClick={clearError}
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
        members={members}
        onSend={handleSend}
        onToggleMembers={onToggleMembers}
        showMembers={showMembers}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        memberOwnerMap={memberOwnerMap}
      />
    </div>
  );
}
