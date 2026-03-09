import { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Pencil, Trash2, AlertTriangle, ChevronDown, ChevronUp, Plus, Users } from 'lucide-react-native';
import type { Member } from '../../lib/types';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../config/constants';
import { MemberCard } from './MemberCard';

interface CaporegimeCardProps {
  member: Member;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddSoldier?: () => void;
  onEditSoldier?: (soldier: Member) => void;
  onDeleteSoldier?: (soldier: Member) => void;
  soldiers?: Member[];
  loadingSoldiers?: boolean;
}

export function CaporegimeCard({
  member,
  onEdit,
  onDelete,
  onAddSoldier,
  onEditSoldier,
  onDeleteSoldier,
  soldiers = [],
  loadingSoldiers,
}: CaporegimeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const provider = member.catalog_model?.provider;
  const alias = member.catalog_model?.alias;

  return (
    <View className="rounded-lg border border-stone-800 bg-stone-900 overflow-hidden">
      {/* Main card */}
      <View className="flex-row items-center gap-3 px-4 py-3">
        {/* Avatar */}
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-stone-800">
          <Text className="text-base">{member.avatar_url || '\u{1F44A}'}</Text>
        </View>

        {/* Name + model info */}
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="font-medium text-stone-100">{member.name}</Text>
            <View className="rounded bg-amber-900/50 px-1.5 py-0.5">
              <Text className="text-[9px] font-semibold text-amber-400">CAPO</Text>
            </View>
          </View>
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
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => setExpanded(!expanded)}
            hitSlop={8}
            className="flex-row items-center gap-1 rounded-md p-2"
          >
            <Users size={14} color="#78716c" />
            {soldiers.length > 0 && (
              <Text className="text-xs text-stone-500">{soldiers.length}</Text>
            )}
            {expanded ? <ChevronUp size={14} color="#78716c" /> : <ChevronDown size={14} color="#78716c" />}
          </Pressable>
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
      </View>

      {/* Crew section (expandable) */}
      {expanded && (
        <View className="border-t border-stone-800 bg-stone-950/50 px-4 py-3">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Crew ({soldiers.length})
            </Text>
            {onAddSoldier && (
              <Pressable
                onPress={onAddSoldier}
                className="flex-row items-center gap-1 rounded bg-stone-800 px-2 py-1"
              >
                <Plus size={12} color="#eab308" />
                <Text className="text-xs text-stone-300">Add Soldier</Text>
              </Pressable>
            )}
          </View>

          {loadingSoldiers ? (
            <ActivityIndicator size="small" color="#78716c" />
          ) : soldiers.length === 0 ? (
            <Text className="text-xs text-stone-600">No soldiers in this crew yet.</Text>
          ) : (
            <View className="gap-1.5">
              {soldiers.map((soldier) => (
                <MemberCard
                  key={soldier.id}
                  member={soldier}
                  compact
                  onEdit={onEditSoldier ? () => onEditSoldier(soldier) : undefined}
                  onDelete={onDeleteSoldier ? () => onDeleteSoldier(soldier) : undefined}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
