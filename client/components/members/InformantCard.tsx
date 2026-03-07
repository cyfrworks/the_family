import { View, Text, Pressable } from 'react-native';
import { Trash2, RefreshCw } from 'lucide-react-native';
import type { Member } from '../../lib/types';

interface InformantCardProps {
  informant: Member;
  onDelete?: () => void;
  onRegenerate?: () => void;
}

export function InformantCard({ informant, onDelete, onRegenerate }: InformantCardProps) {
  const lastUsed = informant.last_used_at
    ? new Date(informant.last_used_at).toLocaleDateString()
    : 'Never';

  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">
      {/* Avatar */}
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-stone-800">
        <Text className="text-base">{informant.avatar_url || '\u{1F50D}'}</Text>
      </View>

      {/* Name + token info */}
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-stone-100">{informant.name}</Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          <Text className="font-mono text-xs text-stone-500">
            {informant.token_prefix}...
          </Text>
          <Text className="text-[10px] text-stone-600">Last used: {lastUsed}</Text>
        </View>
      </View>

      {/* Actions */}
      <View className="flex-row items-center gap-1">
        {onRegenerate && (
          <Pressable onPress={onRegenerate} hitSlop={8} className="rounded-md p-2">
            <RefreshCw size={16} color="#78716c" />
          </Pressable>
        )}
        {onDelete && (
          <Pressable onPress={onDelete} hitSlop={8} className="rounded-md p-2">
            <Trash2 size={16} color="#78716c" />
          </Pressable>
        )}
      </View>
    </View>
  );
}
