import { useCallback, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Reply } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';
import { MessageContent } from './MessageContent';
import { UserAvatar } from '../common/UserAvatar';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../config/constants';
import type { Message } from '../../lib/types';

interface CompletedProgress {
  statusText: string;
  toolsUsed: string[];
  totalTokens: number;
}

interface MessageBubbleProps {
  message: Message;
  replyTo?: Message;
  onReply?: (message: Message) => void;
  onScrollToMessage?: (messageId: string) => void;
  progress?: CompletedProgress;
}

export function MessageBubble({ message, replyTo, onReply, onScrollToMessage, progress }: MessageBubbleProps) {
  const isDon = message.sender_type === 'don';
  const time = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });
  const highlightOpacity = useRef(new Animated.Value(0)).current;

  const flashHighlight = useCallback(() => {
    Animated.sequence([
      Animated.timing(highlightOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(highlightOpacity, {
        toValue: 0,
        duration: 1300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [highlightOpacity]);

  function handleReplyTap() {
    if (!replyTo) return;
    onScrollToMessage?.(replyTo.id);
  }

  function handleLongPress() {
    onReply?.(message);
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
    <Pressable
      onPress={handleReplyTap}
      className="mt-1 mb-0.5 rounded border-l-2 border-stone-600 bg-stone-800/50 px-2 py-1"
    >
      <Text className="text-[11px] font-semibold text-stone-400">{replySender}</Text>
      <Text className="text-[11px] text-stone-500" numberOfLines={1}>
        {replySnippet}
      </Text>
    </Pressable>
  );

  const replyButton = onReply && (
    <Pressable
      onPress={() => onReply(message)}
      className="ml-1.5 rounded p-0.5"
      hitSlop={8}
    >
      <Reply size={14} color="#44403c" />
    </Pressable>
  );

  const provider = message.member?.catalog_model?.provider;

  if (isDon) {
    return (
      <Pressable onLongPress={handleLongPress} delayLongPress={400}>
        <View className="flex-row gap-3 px-4 py-2">
          {/* Highlight overlay */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(68, 64, 60, 0.4)',
              opacity: highlightOpacity,
              borderRadius: 4,
            }}
          />
          <UserAvatar profile={message.profile} size={32} />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-baseline gap-2">
              <Text className="text-sm font-semibold text-yellow-500">
                {message.profile?.display_name ?? 'Don'}
              </Text>
              <Text className="text-[10px] text-stone-600">{time}</Text>
            </View>
            {replyQuote}
            <View className="mt-0.5 flex-row items-end">
              <View className="flex-1">
                <MessageContent content={message.content} />
              </View>
              {replyButton}
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  // Member message
  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={400}>
      <View className="flex-row gap-3 px-4 py-2">
        {/* Highlight overlay */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(68, 64, 60, 0.4)',
            opacity: highlightOpacity,
            borderRadius: 4,
          }}
        />
        <View
          className="h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-700"
        >
          <Text className="text-base">
            {message.member?.avatar_url || '\u{1F3AD}'}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline gap-2 flex-wrap">
            <Text className="text-sm font-semibold text-stone-200">
              {message.member?.name ?? 'Unknown Member'}
            </Text>
            {provider && (
              <View
                className={`rounded px-1 py-0.5 ${PROVIDER_COLORS[provider]}`}
              >
                <Text className="text-[9px] font-semibold text-white">
                  {PROVIDER_LABELS[provider]}
                </Text>
              </View>
            )}
            <Text className="text-[10px] text-stone-600">{time}</Text>
          </View>
          {progress && (
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <Text className="text-[10px] text-yellow-500/50">{'\u2713'}</Text>
              <Text className="text-[10px] text-stone-600" numberOfLines={1}>
                {progress.statusText}
              </Text>
            </View>
          )}
          {replyQuote}
          <View className="mt-1 rounded-lg bg-stone-700/25 px-3 py-2 flex-row items-end">
            <View className="flex-1">
              <MessageContent content={message.content} />
            </View>
            {replyButton}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
