import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, BookOpen } from 'lucide-react-native';
import { useOperations } from '../../hooks/useOperations';
import { BackgroundWatermark } from '../../components/BackgroundWatermark';
import type { Operation, BookkeeperEntry } from '../../lib/types';

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-600',
  completed: 'bg-green-700',
  failed: 'bg-red-700',
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  running: Clock,
  completed: CheckCircle,
  failed: XCircle,
};

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function OperationCard({ operation }: { operation: Operation }) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = STATUS_ICONS[operation.status] ?? Clock;
  const memberName = operation.member?.name ?? 'Unknown';

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      className="rounded-lg border border-stone-800 bg-stone-900 overflow-hidden"
    >
      <View className="flex-row items-center gap-3 px-4 py-3">
        {/* Status badge */}
        <View className={`h-7 w-7 items-center justify-center rounded-full ${STATUS_COLORS[operation.status]}`}>
          <StatusIcon size={14} color="#fff" />
        </View>

        {/* Info */}
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-stone-100" numberOfLines={1}>
            {memberName}
          </Text>
          <Text className="text-xs text-stone-500" numberOfLines={1}>
            {operation.task_summary || 'No summary'}
          </Text>
        </View>

        {/* Meta */}
        <View className="items-end gap-0.5">
          <Text className="text-[10px] text-stone-500">{formatTime(operation.started_at)}</Text>
          {operation.turns_used > 0 && (
            <Text className="text-[10px] text-stone-600">{operation.turns_used} turns</Text>
          )}
        </View>
        {expanded ? <ChevronUp size={14} color="#78716c" /> : <ChevronDown size={14} color="#78716c" />}
      </View>

      {expanded && (
        <View className="border-t border-stone-800 px-4 py-3 gap-2">
          {operation.result_content && (
            <View>
              <Text className="text-xs font-semibold text-stone-500 mb-1">Result</Text>
              <Text className="text-xs text-stone-300" selectable>{operation.result_content}</Text>
            </View>
          )}

          {Array.isArray(operation.tool_calls) && operation.tool_calls.length > 0 && (
            <View>
              <Text className="text-xs font-semibold text-stone-500 mb-1">
                Tool Calls ({operation.tool_calls.length})
              </Text>
              {operation.tool_calls.map((tc, i) => {
                const call = tc as Record<string, unknown>;
                return (
                  <Text key={i} className="text-[10px] text-stone-400 font-mono">
                    {call.name as string ?? 'unknown'} (turn {call.turn as number ?? '?'})
                  </Text>
                );
              })}
            </View>
          )}

          {operation.usage && typeof operation.usage === 'object' && (
            <View className="flex-row gap-3">
              {(operation.usage as Record<string, number>).input_tokens != null && (
                <Text className="text-[10px] text-stone-600">
                  In: {(operation.usage as Record<string, number>).input_tokens.toLocaleString()} tokens
                </Text>
              )}
              {(operation.usage as Record<string, number>).output_tokens != null && (
                <Text className="text-[10px] text-stone-600">
                  Out: {(operation.usage as Record<string, number>).output_tokens.toLocaleString()} tokens
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

function EntryCard({ entry }: { entry: BookkeeperEntry & { member?: { id: string; name: string; avatar_url: string | null } } }) {
  const [expanded, setExpanded] = useState(false);
  const memberName = entry.member?.name ?? 'Unknown';

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      className="rounded-lg border border-stone-800 bg-stone-900 overflow-hidden"
    >
      <View className="flex-row items-center gap-3 px-4 py-3">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-amber-800">
          <BookOpen size={14} color="#fff" />
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-stone-100" numberOfLines={1}>
            {entry.title}
          </Text>
          <Text className="text-xs text-stone-500" numberOfLines={1}>
            {memberName}
          </Text>
        </View>

        <View className="items-end gap-0.5">
          <Text className="text-[10px] text-stone-500">{formatTime(entry.created_at)}</Text>
          {entry.tags.length > 0 && (
            <Text className="text-[10px] text-stone-600">{entry.tags.length} tags</Text>
          )}
        </View>
        {expanded ? <ChevronUp size={14} color="#78716c" /> : <ChevronDown size={14} color="#78716c" />}
      </View>

      {expanded && (
        <View className="border-t border-stone-800 px-4 py-3 gap-2">
          <Text className="text-xs text-stone-300" selectable>{entry.content}</Text>
          {entry.tags.length > 0 && (
            <View className="flex-row flex-wrap gap-1 mt-1">
              {entry.tags.map((tag) => (
                <View key={tag} className="rounded bg-stone-800 px-1.5 py-0.5">
                  <Text className="text-[10px] text-stone-400">{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

type Tab = 'operations' | 'entries';

export default function OperationsScreen() {
  const { operations, bookkeeperEntries, loadingOps, loadingEntries } = useOperations();
  const [filter, setFilter] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('operations');

  const filtered = filter ? operations.filter((op) => op.status === filter) : operations;

  return (
    <View className="flex-1 bg-stone-950">
      <BackgroundWatermark />
      <ScrollView className="mx-auto w-full max-w-4xl flex-1 p-6" contentContainerClassName="pb-12">
        <View className="mb-6">
          <Text className="font-serif text-3xl font-bold text-stone-100">Operations</Text>
          <Text className="mt-1 text-sm text-stone-400">
            Caporegime missions and bookkeeper recordings.
          </Text>
        </View>

        {/* Tab switcher */}
        <View className="flex-row gap-2 mb-4">
          <Pressable
            onPress={() => setTab('operations')}
            className={`rounded-lg px-3 py-1.5 ${tab === 'operations' ? 'bg-stone-700' : 'bg-stone-800/50'}`}
          >
            <Text className={`text-xs ${tab === 'operations' ? 'text-stone-100' : 'text-stone-500'}`}>
              Caporegime Runs ({operations.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('entries')}
            className={`rounded-lg px-3 py-1.5 ${tab === 'entries' ? 'bg-stone-700' : 'bg-stone-800/50'}`}
          >
            <Text className={`text-xs ${tab === 'entries' ? 'text-stone-100' : 'text-stone-500'}`}>
              Bookkeeper Entries ({bookkeeperEntries.length})
            </Text>
          </Pressable>
        </View>

        {tab === 'operations' ? (
          <>
            {/* Filter bar */}
            <View className="flex-row gap-2 mb-4">
              {[null, 'running', 'completed', 'failed'].map((f) => (
                <Pressable
                  key={f ?? 'all'}
                  onPress={() => setFilter(f)}
                  className={`rounded-lg px-3 py-1.5 ${filter === f ? 'bg-stone-700' : 'bg-stone-800/50'}`}
                >
                  <Text className={`text-xs ${filter === f ? 'text-stone-100' : 'text-stone-500'}`}>
                    {f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {loadingOps ? (
              <View className="items-center justify-center py-12">
                <ActivityIndicator color="#78716c" />
              </View>
            ) : filtered.length === 0 ? (
              <View className="items-center justify-center py-12">
                <Text className="text-sm text-stone-500">
                  {filter ? `No ${filter} operations.` : 'No operations yet.'}
                </Text>
                <Text className="mt-1 text-xs text-stone-600">
                  Operations appear when a Caporegime processes an order.
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {filtered.map((op) => (
                  <OperationCard key={op.id} operation={op} />
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {loadingEntries ? (
              <View className="items-center justify-center py-12">
                <ActivityIndicator color="#78716c" />
              </View>
            ) : bookkeeperEntries.length === 0 ? (
              <View className="items-center justify-center py-12">
                <Text className="text-sm text-stone-500">No bookkeeper entries yet.</Text>
                <Text className="mt-1 text-xs text-stone-600">
                  Entries appear when a Bookkeeper records knowledge.
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {bookkeeperEntries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
