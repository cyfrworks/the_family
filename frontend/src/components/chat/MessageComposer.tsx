import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send, Users, X } from 'lucide-react';
import type { Message, Role } from '../../lib/types';
import { useMention } from '../../hooks/useMention';
import { MentionPopover } from './MentionPopover';

interface MessageComposerProps {
  roles: Role[];
  onSend: (content: string) => void;
  disabled?: boolean;
  onToggleMembers?: () => void;
  showMembers?: boolean;
  replyTo?: Message | null;
  onCancelReply?: () => void;
}

export function MessageComposer({ roles, onSend, disabled, onToggleMembers, showMembers, replyTo, onCancelReply }: MessageComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMention(roles);

  // When replying to a role message, pre-fill @mention and focus
  useEffect(() => {
    if (!replyTo) return;
    if (replyTo.sender_type === 'role' && replyTo.role) {
      setText(`@${replyTo.role.name} `);
    }
    textareaRef.current?.focus();
  }, [replyTo]);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    mention.close();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (mention.isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mention.moveSelection('down');
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mention.moveSelection('up');
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const newText = mention.selectCandidate(mention.selectedIndex, text);
        setText(newText);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        mention.close();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleChange(value: string) {
    setText(value);
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
    // Mention detection
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    mention.handleInput(value, cursor);
  }

  return (
    <div className="relative border-t border-stone-800 bg-stone-900 px-4 py-3">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded border-l-2 border-gold-600 bg-stone-800/50 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-stone-400">
              Replying to {replyTo.sender_type === 'don' ? replyTo.profile?.display_name ?? 'Don' : replyTo.role?.name ?? 'Unknown'}
            </span>
            <p className="truncate text-[11px] text-stone-500">
              {replyTo.content.length > 100 ? replyTo.content.slice(0, 100) + '...' : replyTo.content}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="shrink-0 rounded p-0.5 text-stone-500 hover:text-stone-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {mention.isOpen && (
        <MentionPopover
          candidates={mention.candidates}
          selectedIndex={mention.selectedIndex}
          onSelect={(i) => {
            const newText = mention.selectCandidate(i, text);
            setText(newText);
            textareaRef.current?.focus();
          }}
        />
      )}

      <div className="flex items-end gap-2">
        {onToggleMembers && (
          <button
            onClick={onToggleMembers}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              showMembers
                ? 'bg-stone-700 text-gold-500'
                : 'text-stone-500 hover:bg-stone-800 hover:text-stone-300'
            }`}
            title="Members"
          >
            <Users size={18} />
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600 disabled:opacity-50"
          placeholder={
            roles.length > 0
              ? 'Type a message... Use @role to mention an AI'
              : 'Type a message...'
          }
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-600 text-stone-950 hover:bg-gold-500 disabled:opacity-30 transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
