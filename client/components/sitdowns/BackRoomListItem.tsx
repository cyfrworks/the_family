import { View, Text, Pressable } from 'react-native';
import { usePathname } from 'expo-router';
import { UserAvatar } from '../common/UserAvatar';
import type { BackRoomContact } from '../../hooks/useBackRoomSitDowns';

interface BackRoomListItemProps {
  contact: BackRoomContact;
  onPress: () => void;
  variant?: 'sidebar' | 'tab';
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function BackRoomListItem({ contact, onPress, variant = 'sidebar' }: BackRoomListItemProps) {
  const pathname = usePathname();
  const isActive = contact.sitDown ? pathname === `/sitdown/${contact.sitDown.id}` : false;
  const isTab = variant === 'tab';

  const profile = { display_name: contact.displayName, avatar_url: contact.avatarUrl };

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg ${isTab ? 'px-4 py-3' : 'px-3 py-2.5'} ${isActive ? 'bg-stone-800' : ''}`}
    >
      <UserAvatar profile={profile} size={isTab ? 40 : 32} />
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className={`${isTab ? 'text-base' : 'text-sm'} font-medium ${isActive ? 'text-gold-500' : 'text-stone-200'}`}
        >
          {contact.displayName}
        </Text>
        <Text
          numberOfLines={1}
          className="text-xs text-stone-500"
        >
          {contact.lastMessageContent ?? 'No messages yet'}
        </Text>
      </View>
      <View className="items-end gap-1">
        {contact.lastMessageAt && (
          <Text className="text-[10px] text-stone-600">
            {formatRelativeTime(contact.lastMessageAt)}
          </Text>
        )}
        {contact.unreadCount > 0 && !isActive && (
          <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-600 px-1">
            <Text className="text-[10px] font-bold text-stone-950">
              {contact.unreadCount > 99 ? '99+' : contact.unreadCount}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
