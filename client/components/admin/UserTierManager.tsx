import { useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { useAuth } from '../../contexts/AuthContext';
import { TIER_LABELS, TIER_COLORS } from '../../config/constants';
import type { UserTier } from '../../lib/types';
import { toast } from '../../lib/toast';
import { Dropdown } from '../ui/Dropdown';

const TIERS: UserTier[] = ['godfather', 'boss', 'associate'];

export function UserTierManager() {
  const { user } = useAuth();
  const { users, loading, updateTier } = useAdminUsers();
  const [tierPickerUserId, setTierPickerUserId] = useState<string | null>(null);

  async function handleTierChange(userId: string, tier: UserTier) {
    setTierPickerUserId(null);
    try {
      await updateTier(userId, tier);
      toast.success('Tier updated.');
    } catch {
      toast.error('Failed to update tier.');
    }
  }

  if (loading) {
    return (
      <View className="items-center justify-center gap-2 py-8">
        <ActivityIndicator color="#78716c" />
        <Text className="text-sm text-stone-500">Loading users...</Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Text className="mb-4 text-sm text-stone-400">
        {users.length} user{users.length !== 1 ? 's' : ''} in the Family
      </Text>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View className="h-2" />}
        renderItem={({ item: u }) => (
          <View className="flex-row items-center gap-3 rounded-lg border border-stone-800 bg-stone-900 p-3">
            <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-600">
              <Text className="text-sm font-bold text-stone-950">
                {u.display_name?.[0]?.toUpperCase() ?? 'D'}
              </Text>
            </View>
            <View className="flex-1 min-w-0 flex-row items-center">
              <Text className="font-medium text-stone-100">{u.display_name}</Text>
              {u.id === user?.id && (
                <Text className="ml-2 text-xs text-stone-500">(you)</Text>
              )}
            </View>

            {/* Tier picker */}
            <Dropdown
              open={tierPickerUserId === u.id}
              onClose={() => setTierPickerUserId(null)}
              align="right"
              trigger={
                <Pressable
                  onPress={() => setTierPickerUserId(tierPickerUserId === u.id ? null : u.id)}
                  className="rounded border border-stone-700 bg-stone-800 px-2 py-1"
                >
                  <Text className="text-sm text-stone-100">{TIER_LABELS[u.tier]}</Text>
                </Pressable>
              }
            >
              {TIERS.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => handleTierChange(u.id, t)}
                  className={`px-3 py-2 ${t === u.tier ? 'bg-stone-700' : ''}`}
                >
                  <Text className="text-sm text-stone-100">{TIER_LABELS[t]}</Text>
                </Pressable>
              ))}
            </Dropdown>

            <View className={`rounded px-2 py-0.5 ${TIER_COLORS[u.tier]}`}>
              <Text className={`text-[10px] font-semibold ${
                u.tier === 'associate' ? 'text-stone-300' : 'text-stone-950'
              }`}>
                {TIER_LABELS[u.tier]}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
