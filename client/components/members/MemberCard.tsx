import { View, Text, Pressable } from 'react-native';
import { Pencil, Trash2, AlertTriangle } from 'lucide-react-native';
import type { Member } from '../../lib/types';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../config/constants';

interface MemberCardProps {
  member: Member;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}

export function MemberCard({ member, onEdit, onDelete, compact }: MemberCardProps) {
  const provider = member.catalog_model?.provider;
  const alias = member.catalog_model?.alias;

  if (compact) {
    return (
      <View className="flex-row items-center gap-2 rounded-lg bg-stone-800 px-3 py-2">
        {provider ? (
          <View className={`h-5 w-5 items-center justify-center rounded ${PROVIDER_COLORS[provider]}`}>
            <Text className="text-[10px] font-bold text-white">
              {provider[0].toUpperCase()}
            </Text>
          </View>
        ) : (
          <View className="h-5 w-5 items-center justify-center rounded bg-amber-600">
            <Text className="text-[10px] font-bold text-white">!</Text>
          </View>
        )}
        <Text className="text-sm text-stone-200">{member.name}</Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">
      {/* Avatar */}
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-stone-800">
        <Text className="text-base">{member.avatar_url || '\u{1F3AD}'}</Text>
      </View>

      {/* Name + model info */}
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-stone-100">{member.name}</Text>
        {provider ? (
          <View className="mt-0.5 flex-row items-center gap-2">
            <View className={`rounded px-1.5 py-0.5 ${PROVIDER_COLORS[provider]}`}>
              <Text className="text-[10px] font-semibold text-white">
                {PROVIDER_LABELS[provider]}
              </Text>
            </View>
            <Text className="text-xs text-stone-500" numberOfLines={1}>{alias ?? 'Unknown model'}</Text>
          </View>
        ) : (
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <AlertTriangle size={12} color="#d97706" />
            <Text className="text-xs text-amber-500">Model removed — pick a new one</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      {(onEdit || onDelete) && (
        <View className="flex-row items-center gap-1">
          {onEdit && (
            <Pressable onPress={onEdit} hitSlop={8} className="rounded-md p-2">
              <Pencil size={16} color="#78716c" />
            </Pressable>
          )}
          {onDelete && (
            <Pressable onPress={onDelete} hitSlop={8} className="rounded-md p-2">
              <Trash2 size={16} color="#78716c" />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
