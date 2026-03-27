import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import type { MemberProgress, ProgressEvent } from '../../hooks/useMemberProgress';

interface MemberProgressCardProps {
  progress: MemberProgress;
}

function PulseDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#eab308',
  }));

  return <Animated.View style={style} />;
}

function formatEvent(event: ProgressEvent): string {
  switch (event.kind) {
    case 'status':
      return event.text || '';
    case 'turn_start':
      return `Turn ${event.turn}`;
    case 'tool_use':
      return `Called ${event.tool}`;
    case 'tool_result':
      return `${event.tool} returned`;
    case 'text_delta':
      return `Response (${event.content?.length ?? 0} chars)`;
    case 'usage':
      return `${event.inputTokens ?? 0} in / ${event.outputTokens ?? 0} out tokens`;
    case 'error':
      return event.message || 'Error';
    default:
      return event.kind;
  }
}

function eventIcon(kind: string): string {
  switch (kind) {
    case 'status':
      return '\u25CB'; // ○
    case 'turn_start':
      return '\u25B6'; // ▶
    case 'tool_use':
      return '\u2192'; // →
    case 'tool_result':
      return '\u2190'; // ←
    case 'text_delta':
      return '\u270E'; // ✎
    case 'usage':
      return '\u2234'; // ∴
    case 'error':
      return '\u2717'; // ✗
    default:
      return '\u00B7'; // ·
  }
}

export function MemberProgressCard({ progress }: MemberProgressCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Elapsed timer — ticks every second while in progress
  useEffect(() => {
    if (progress.completed) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - progress.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [progress.completed, progress.startedAt]);

  // Auto-scroll event log to bottom
  useEffect(() => {
    if (expanded) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [expanded, progress.events.length]);

  const hasContent = progress.streamedContent.length > 0;
  const hasEvents = progress.events.length > 0;

  return (
    <View className={`mx-3 mb-2 rounded-lg border ${progress.isError ? 'border-red-800/50 bg-red-900/10' : 'border-stone-800 bg-stone-900/80'}`}>
      {/* Collapsed header — always visible */}
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center px-3 py-2"
      >
        {!progress.completed ? (
          <View className="flex-row items-center gap-1 mr-2">
            <PulseDot delay={0} />
            <PulseDot delay={150} />
            <PulseDot delay={300} />
          </View>
        ) : progress.isError ? (
          <Text className="text-red-400 text-xs mr-2">{'\u2717'}</Text>
        ) : (
          <Text className="text-yellow-500/60 text-xs mr-2">{'\u2713'}</Text>
        )}

        <Text className="text-xs text-stone-400 font-medium flex-1" numberOfLines={1}>
          <Text className={progress.isError ? 'text-red-400' : 'text-yellow-500'}>{progress.memberName}</Text>
          {progress.statusText ? ` \u2014 ${progress.statusText}` : ' is deliberating...'}
          {!progress.completed && elapsed > 0 ? (
            <Text className="text-stone-600"> {elapsed}s</Text>
          ) : null}
        </Text>

        {(hasEvents || hasContent) && (
          <View className="ml-2">
            {expanded ? (
              <ChevronDown size={12} color="#78716c" />
            ) : (
              <ChevronRight size={12} color="#78716c" />
            )}
          </View>
        )}
      </Pressable>

      {/* Collapsed summary — visible when not expanded */}
      {!expanded && (progress.toolsUsed.length > 0 || progress.totalTokens > 0 || progress.streamedContent.length > 0) && (
        <View className="flex-row items-center px-3 pb-1.5 gap-3">
          {progress.toolsUsed.length > 0 && (
            <Text className="text-[10px] text-stone-600">
              {'\u2192'} {progress.toolsUsed.join(', ')}
            </Text>
          )}
          {progress.totalTokens > 0 && (
            <Text className="text-[10px] text-stone-600">
              {progress.totalTokens >= 1000
                ? `${(progress.totalTokens / 1000).toFixed(1)}k`
                : progress.totalTokens}{' '}
              tokens
            </Text>
          )}
          {progress.streamedContent.length > 0 && (
            <Text className="text-[10px] text-stone-600">
              {progress.streamedContent.length} chars
            </Text>
          )}
        </View>
      )}

      {/* Expanded detail */}
      {expanded && (
        <View className="border-t border-stone-800 px-3 pb-2">
          {/* Event log */}
          {hasEvents && (
            <ScrollView
              ref={scrollRef}
              style={{ maxHeight: 200 }}
              className="mt-2"
            >
              {progress.events.map((event, i) => (
                <View key={i} className="mb-0.5">
                  <View className="flex-row items-start">
                    <Text className="text-[10px] text-stone-600 w-4">{eventIcon(event.kind)}</Text>
                    <Text className="text-[10px] text-stone-500 flex-1">{formatEvent(event)}</Text>
                  </View>
                  {event.kind === 'tool_use' && event.input ? (
                    <Text className="text-[9px] text-stone-600 ml-4" numberOfLines={2}>{event.input}</Text>
                  ) : null}
                  {event.kind === 'tool_result' && event.preview ? (
                    <Text className="text-[9px] text-stone-600 ml-4" numberOfLines={2}>{event.preview}</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}

          {/* Streamed content preview */}
          {hasContent && (
            <ScrollView style={{ maxHeight: 200 }} className="mt-2 rounded bg-stone-800/60 px-2 py-1.5">
              <Text className="text-[11px] text-stone-400 leading-4">
                {progress.streamedContent}
              </Text>
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}
