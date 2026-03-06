import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Send, Users, X } from 'lucide-react-native';
import { useMention } from '../../hooks/useMention';
import { getMentionText } from '../../lib/mention-parser';
import { MentionPopover } from './MentionPopover';
import type { Message, Member } from '../../lib/types';

interface MessageComposerProps {
  members: Member[];
  onSend: (content: string) => void;
  disabled?: boolean;
  onToggleMembers?: () => void;
  showMembers?: boolean;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  memberOwnerMap?: Map<string, string>;
}

const MIN_INPUT_HEIGHT = 36;
const MAX_INPUT_HEIGHT = 160;

export function MessageComposer({
  members,
  onSend,
  disabled,
  onToggleMembers,
  showMembers,
  replyTo,
  onCancelReply,
  memberOwnerMap,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const inputRef = useRef<TextInput>(null);
  const cursorPositionRef = useRef(0);
  const mention = useMention(members, memberOwnerMap);

  // When replying to a member message, pre-fill @mention and focus
  useEffect(() => {
    if (!replyTo) return;
    if (replyTo.sender_type === 'member' && replyTo.member) {
      const prefill = `@${getMentionText(replyTo.member, memberOwnerMap)} `;
      setText(prefill);
      cursorPositionRef.current = prefill.length;
    }
    inputRef.current?.focus();
  }, [replyTo, memberOwnerMap]);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    mention.close();
    setInputHeight(MIN_INPUT_HEIGHT);
  }

  function handleContentSizeChange(
    e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ) {
    const contentHeight = e.nativeEvent.contentSize.height;
    setInputHeight(Math.min(Math.max(contentHeight, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT));
  }

  function handleSelectionChange(
    e: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) {
    cursorPositionRef.current = e.nativeEvent.selection.end;
  }

  function handleChangeText(value: string) {
    setText(value);
    // On text change, cursor position may not have updated yet via onSelectionChange.
    // Use end of text as cursor position since typing always appends at cursor.
    // For mid-text edits, onSelectionChange will have fired before the next keystroke.
    const cursor = value.length;
    mention.handleInput(value, cursor);
  }

  function handleSelectMention(index: number) {
    const newText = mention.selectCandidate(index, text);
    setText(newText);
    cursorPositionRef.current = newText.length;
    inputRef.current?.focus();
  }

  // On web, Enter sends (Shift+Enter for newline)
  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (Platform.OS !== 'web') return;

    const key = e.nativeEvent.key;

    if (mention.isOpen) {
      if (key === 'ArrowDown') {
        e.preventDefault?.();
        mention.moveSelection('down');
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault?.();
        mention.moveSelection('up');
        return;
      }
      if (key === 'Enter' || key === 'Tab') {
        e.preventDefault?.();
        const newText = mention.selectCandidate(mention.selectedIndex, text);
        setText(newText);
        cursorPositionRef.current = newText.length;
        return;
      }
      if (key === 'Escape') {
        e.preventDefault?.();
        mention.close();
        return;
      }
    }

    // Web: Enter to send, Shift+Enter for newline
    // We check the raw DOM event for shiftKey since React Native's key press event does not expose it
    if (key === 'Enter') {
      const nativeEvent = (e as unknown as { nativeEvent: { shiftKey?: boolean } }).nativeEvent;
      if (!nativeEvent.shiftKey) {
        e.preventDefault?.();
        handleSend();
      }
    }
  }

  return (
    <View className="border-t border-stone-800 bg-stone-900 px-4 py-3">
      {/* Reply-to preview */}
      {replyTo && (
        <View className="mb-2 flex-row items-center gap-2 rounded border-l-2 border-yellow-600 bg-stone-800/50 px-2 py-1.5">
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] font-semibold text-stone-400">
              Replying to{' '}
              {replyTo.sender_type === 'don'
                ? replyTo.profile?.display_name ?? 'Don'
                : replyTo.member?.name ?? 'Unknown'}
            </Text>
            <Text className="text-[11px] text-stone-500" numberOfLines={1}>
              {replyTo.content.length > 100
                ? replyTo.content.slice(0, 100) + '...'
                : replyTo.content}
            </Text>
          </View>
          <Pressable
            onPress={onCancelReply}
            className="shrink-0 rounded p-0.5"
            hitSlop={8}
          >
            <X size={14} color="#78716c" />
          </Pressable>
        </View>
      )}

      {/* Mention popover — rendered in normal flow above the input row */}
      {mention.isOpen && mention.candidates.length > 0 && (
        <MentionPopover
          candidates={mention.candidates}
          selectedIndex={mention.selectedIndex}
          memberOwnerMap={memberOwnerMap}
          onSelect={handleSelectMention}
        />
      )}

      {/* Input row */}
      <View className="flex-row items-end gap-2">
        {onToggleMembers && (
          <Pressable
            onPress={onToggleMembers}
            className={`h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              showMembers ? 'bg-stone-700' : 'bg-transparent'
            }`}
          >
            <Users size={18} color={showMembers ? '#eab308' : '#78716c'} />
          </Pressable>
        )}

        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={handleChangeText}
          onContentSizeChange={handleContentSizeChange}
          onSelectionChange={handleSelectionChange}
          onKeyPress={handleKeyPress}
          editable={!disabled}
          multiline
          placeholder={
            members.length > 0
              ? 'Type a message... Use @member to mention an AI'
              : 'Type a message...'
          }
          placeholderTextColor="#78716c"
          className="flex-1 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100"
          style={{ height: inputHeight, maxHeight: MAX_INPUT_HEIGHT }}
          textAlignVertical="top"
          blurOnSubmit={false}
          returnKeyType={Platform.OS === 'web' ? undefined : 'default'}
        />

        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || disabled}
          className={`h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            text.trim() && !disabled ? 'bg-yellow-600' : 'bg-yellow-600 opacity-30'
          }`}
        >
          <Send size={16} color="#1c1917" />
        </Pressable>
      </View>
    </View>
  );
}
