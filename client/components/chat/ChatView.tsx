import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View, Text } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useSendMessage } from '../../hooks/useSendMessage';
import { useMemberProgress, type MemberProgress } from '../../hooks/useMemberProgress';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { MemberProgressCard } from './MemberProgressCard';
import { toast } from '../../lib/toast';
import type { Message, Member } from '../../lib/types';
import type { FriendlyError } from '../../lib/error-messages';

// Persistent progress that stays with messages even after the realtime entry is cleaned up
interface CompletedProgress {
  statusText: string;
  toolsUsed: string[];
  totalTokens: number;
  events: MemberProgress['events'];
  streamedContent: string;
  isError?: boolean;
}

interface ChatViewProps {
  sitDownId: string;
  userId?: string;
  members: Member[];
  memberOwnerMap?: Map<string, string>;
  onToggleMembers?: () => void;
  showMembers?: boolean;
  messages: Message[];
  lastReadAt?: string | null;
  enteredAt?: string | null;
  messagesError: FriendlyError | null;
  onClearMessagesError: () => void;
  onRetryMessages: () => void;
}

export function ChatView({
  sitDownId,
  userId,
  members,
  memberOwnerMap,
  onToggleMembers,
  showMembers,
  messages,
  lastReadAt,
  enteredAt,
  messagesError,
  onClearMessagesError,
  onRetryMessages,
}: ChatViewProps) {
  const send = useSendMessage(sitDownId);
  const memberProgress = useMemberProgress(sitDownId);
  const flatListRef = useRef<FlatList<Message>>(null);

  // Persist completed progress so it survives the 60s cleanup in useMemberProgress
  const completedProgressRef = useRef<Map<string, CompletedProgress>>(new Map());

  // Split progress: active (in-progress, shown at bottom) vs completed (matched to a message, shown inline)
  const { activeProgress, messageProgressMap } = useMemo(() => {
    const active: MemberProgress[] = [];
    const map = new Map<string, CompletedProgress>(completedProgressRef.current);

    for (const p of memberProgress) {
      if (p.completed && p.messageId) {
        const entry: CompletedProgress = {
          statusText: p.statusText,
          toolsUsed: p.toolsUsed,
          totalTokens: p.totalTokens,
          events: p.events,
          streamedContent: p.streamedContent,
          isError: p.isError,
        };
        map.set(p.messageId, entry);
        completedProgressRef.current.set(p.messageId, entry);
      } else {
        active.push(p);
      }
    }

    return { activeProgress: active, messageProgressMap: map };
  }, [memberProgress]);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const displayError = send.error;
  const clearError = () => {
    send.clearError();
  };

  // Build message ID -> index map for reply-to navigation
  const messageIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach((msg, index) => {
      map.set(msg.id, index);
    });
    return map;
  }, [messages]);


  // Find the first unread message from someone else (in original order) for the "New messages" divider.
  // Only consider messages between lastReadAt and enteredAt — messages arriving via realtime
  // while the user is actively viewing are not "unread".
  const [hideDivider, setHideDivider] = useState(false);
  const initialMsgCount = useRef<number | null>(null);

  // Reset divider state and completed progress when switching sitdowns
  useEffect(() => {
    setHideDivider(false);
    initialMsgCount.current = null;
    completedProgressRef.current = new Map();
  }, [sitDownId]);

  const firstUnreadIndex = useMemo(() => {
    if (hideDivider) return -1;
    if (!lastReadAt || !userId) return -1;
    const threshold = new Date(lastReadAt).getTime();
    const cap = enteredAt ? new Date(enteredAt).getTime() : Infinity;
    return messages.findIndex(
      (m) => {
        const t = new Date(m.created_at).getTime();
        return t > threshold && t <= cap && m.sender_user_id !== userId;
      },
    );
  }, [messages, lastReadAt, enteredAt, userId, hideDivider]);

  // Hide the divider after 10s or when new messages arrive / user sends
  useEffect(() => {
    if (firstUnreadIndex < 0) return;
    if (initialMsgCount.current === null) {
      initialMsgCount.current = messages.length;
    } else if (messages.length !== initialMsgCount.current) {
      setHideDivider(true);
      return;
    }
    const timer = setTimeout(() => setHideDivider(true), 10_000);
    return () => clearTimeout(timer);
  }, [firstUnreadIndex, messages.length]);

  // For FlatList inverted, reverse so newest is first; inverted flips visually
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const scrollToMessage = useCallback(
    (messageId: string) => {
      // In inverted list, index is reversed
      const originalIndex = messageIndexMap.get(messageId);
      if (originalIndex === undefined) return;
      const invertedIndex = messages.length - 1 - originalIndex;
      flatListRef.current?.scrollToIndex({
        index: invertedIndex,
        animated: true,
        viewPosition: 0.5,
      });
    },
    [messageIndexMap, messages.length],
  );

  function scrollToBottom() {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }

  // On initial load, scroll to the "new messages" divider if there is one.
  // In an inverted FlatList, viewPosition 0 = visual bottom, 1 = visual top.
  // We want the divider near the top of the viewport so unread messages are below it.
  const hasScrolledToUnread = useRef(false);
  useEffect(() => {
    if (hasScrolledToUnread.current || firstUnreadIndex < 0 || messages.length === 0) return;
    hasScrolledToUnread.current = true;
    const invertedIndex = messages.length - 1 - firstUnreadIndex;
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({
        index: invertedIndex,
        animated: false,
        viewPosition: 1,
      });
    }, 300);
  }, [firstUnreadIndex, messages.length]);

  // Auto-scroll to bottom when new messages arrive (if already near bottom)
  const isNearBottom = useRef(true);
  useEffect(() => {
    if (isNearBottom.current && messages.length > 0) {
      // Small delay to let FlatList render new items
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    }
  }, [messages.length, activeProgress.length]);

  function handleScroll(event: { nativeEvent: { contentOffset: { y: number } } }) {
    const offsetY = event.nativeEvent.contentOffset.y;
    // In inverted list, offset 0 = bottom. Show button when scrolled away from bottom
    const nearBottom = offsetY < 100;
    isNearBottom.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }

  async function handleSend(content: string) {
    const replyId = replyTo?.id;
    setReplyTo(null);

    // Fire-and-forget: formula saves message to DB, realtime delivers it to UI.
    // No refetch — it races with realtime and causes messages to disappear/reappear.
    send
      .sendMessage(content, replyId)
      .then((result) => {
        if (!result && send.error) {
          toast.error(send.error);
        }
      })
      .catch(() => {
        toast.error("The message didn't get through.");
      });
  }

  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const msgReplyToId = (item.metadata as Record<string, unknown>)?.reply_to_id as
        | string
        | undefined;
      const msgReplyTo = msgReplyToId ? messages.find((m) => m.id === msgReplyToId) : undefined;

      // In original (non-inverted) order, check if this message is the first unread
      const originalIndex = messageIndexMap.get(item.id);
      const showDivider = firstUnreadIndex >= 0 && originalIndex === firstUnreadIndex;

      const progress = messageProgressMap.get(item.id);

      return (
        <View>
          {showDivider && (
            <View className="flex-row items-center mx-4 my-3">
              <View className="flex-1 h-px bg-stone-700" />
              <Text className="mx-3 text-xs text-stone-500">New messages</Text>
              <View className="flex-1 h-px bg-stone-700" />
            </View>
          )}
          <MessageBubble
            message={item}
            replyTo={msgReplyTo}
            onReply={setReplyTo}
            onScrollToMessage={scrollToMessage}
            progress={progress}
          />
        </View>
      );
    },
    [messages, scrollToMessage, firstUnreadIndex, messageIndexMap, messageProgressMap],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  // Render as a component (not element) so FlatList properly re-renders on changes
  const renderListHeader = useCallback(() => {
    // In inverted list, "header" renders at the bottom (visually)
    return (
      <View>
        {/* In-progress member cards only — completed progress is shown inline with messages */}
        {activeProgress.map((p: MemberProgress) => (
          <MemberProgressCard key={p.executionId} progress={p} />
        ))}

        {/* Send error */}
        {displayError && (
          <View className="mx-4 mb-2 rounded-lg bg-red-900/20 border border-red-800/50 px-3 py-2">
            <Text className="text-xs text-red-300">{displayError}</Text>
            <Pressable onPress={clearError}>
              <Text className="ml-2 text-xs text-red-400 underline">Dismiss</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }, [activeProgress, displayError]);

  const ListFooterComponent = useMemo(() => {
    // In inverted list, "footer" renders at the top (visually)
    return (
      <View>
        {/* Messages error */}
        {messagesError && (
          <View className="mx-4 mt-4 mb-2 rounded-lg bg-red-900/20 border border-red-800/50 px-3 py-2">
            <Text className="text-xs text-red-300">{messagesError.message}</Text>
            <View className="flex-row mt-1">
              {messagesError.retryable && (
                <Pressable onPress={onRetryMessages}>
                  <Text className="text-xs text-red-400 underline mr-2">Retry</Text>
                </Pressable>
              )}
              <Pressable onPress={onClearMessagesError}>
                <Text className="text-xs text-red-400 underline">Dismiss</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }, [messagesError, onRetryMessages, onClearMessagesError]);

  const ListEmptyComponent = useMemo(() => {
    if (messagesError) return null;
    return (
      <View className="flex-1 items-center justify-center py-20">
        <Text className="font-serif text-lg text-stone-400">The table is set.</Text>
        <Text className="mt-1 text-sm text-stone-600">
          Start the conversation. Use @member to bring someone in.
        </Text>
      </View>
    );
  }, [messagesError]);

  return (
    <View className="flex-1">
      {/* Messages */}
      <View className="relative flex-1">
        <FlatList
          ref={flatListRef}
          data={invertedMessages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          extraData={[activeProgress, messageProgressMap, firstUnreadIndex]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={renderListHeader}
          ListFooterComponent={ListFooterComponent}
          ListEmptyComponent={ListEmptyComponent}
          contentContainerStyle={messages.length === 0 ? { flexGrow: 1 } : { paddingVertical: 16 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={(info) => {
            // Fallback: scroll to approximate offset
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }}
        />

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <Pressable
            onPress={scrollToBottom}
            className="absolute bottom-3 right-3 h-8 w-8 items-center justify-center rounded-full border border-stone-700 bg-stone-800 shadow-lg"
          >
            <ChevronDown size={16} color="#a8a29e" />
          </Pressable>
        )}
      </View>

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
    </View>
  );
}
