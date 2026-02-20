import { formatDistanceToNow } from 'date-fns';
import { Reply } from 'lucide-react';
import type { Message } from '../../lib/types';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../config/constants';
import { MessageContent } from './MessageContent';
import { TypewriterText } from './TypewriterText';

interface MessageBubbleProps {
  message: Message;
  replyTo?: Message;
  animate?: boolean;
  queued?: boolean;
  onAnimationComplete?: () => void;
  onReply?: (message: Message) => void;
}

export function MessageBubble({ message, replyTo, animate, queued, onAnimationComplete, onReply }: MessageBubbleProps) {
  const isDon = message.sender_type === 'don';
  const time = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });

  function scrollToReply() {
    if (!replyTo) return;
    const el = document.getElementById(`msg-${replyTo.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-stone-700/40');
      setTimeout(() => el.classList.remove('bg-stone-700/40'), 1500);
    }
  }

  const replySnippet = replyTo
    ? replyTo.content.length > 120
      ? replyTo.content.slice(0, 120) + '...'
      : replyTo.content
    : null;
  const replySender = replyTo
    ? replyTo.sender_type === 'don'
      ? replyTo.profile?.display_name ?? 'Don'
      : replyTo.member?.name ?? 'Unknown'
    : null;

  const replyQuote = replySnippet && (
    <button
      onClick={scrollToReply}
      className="mt-1 mb-0.5 w-full cursor-pointer rounded border-l-2 border-stone-600 bg-stone-800/50 px-2 py-1 text-left hover:bg-stone-700/50 transition-colors"
    >
      <span className="text-[11px] font-semibold text-stone-400">{replySender}</span>
      <p className="truncate text-[11px] text-stone-500">{replySnippet}</p>
    </button>
  );

  const replyButton = onReply && (
    <button
      onClick={() => onReply(message)}
      className="ml-1.5 inline-flex align-text-bottom rounded p-0.5 text-stone-700 transition-colors hover:text-stone-400"
      title="Reply"
    >
      <Reply size={14} />
    </button>
  );

  if (isDon) {
    return (
      <div id={`msg-${message.id}`} className="flex gap-3 px-4 py-2 transition-colors duration-700 hover:bg-stone-900/50">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-600 text-sm font-bold text-stone-950">
          {message.profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-gold-500">
              {message.profile?.display_name ?? 'Don'}
            </span>
            <span className="text-[10px] text-stone-600">{time}</span>
          </div>
          {replyQuote}
          <div className="mt-0.5 text-sm text-stone-300 [&>.prose]:contents [&>.prose>*:last-child]:inline">
            <MessageContent content={message.content} />
            {replyButton}
          </div>
        </div>
      </div>
    );
  }

  // Member message
  const provider = message.member?.catalog_model?.provider;

  return (
    <div id={`msg-${message.id}`} className="flex gap-3 px-4 py-2 transition-colors duration-700 hover:bg-stone-900/50">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${provider ? PROVIDER_COLORS[provider] : 'bg-stone-600'}`}
      >
        {message.member?.name?.[0]?.toUpperCase() ?? 'M'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-stone-200">
            {message.member?.name ?? 'Unknown Member'}
          </span>
          {provider && (
            <span
              className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold text-white ${PROVIDER_COLORS[provider]}`}
            >
              {PROVIDER_LABELS[provider]}
            </span>
          )}
          <span className="text-[10px] text-stone-600">{time}</span>
        </div>
        {replyQuote}
        <div className="mt-0.5 text-sm text-stone-300 [&>.prose]:contents [&>.prose>*:last-child]:inline">
          {queued ? (
            <span className="italic text-stone-500">...</span>
          ) : animate ? (
            <TypewriterText content={message.content} onComplete={onAnimationComplete} />
          ) : (
            <MessageContent content={message.content} />
          )}
          {!queued && !animate && replyButton}
        </div>
      </div>
    </div>
  );
}
