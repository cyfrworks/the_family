import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { MoreVertical, Trash2, LogOut, Info } from 'lucide-react-native';
import { Dropdown } from '../ui/Dropdown';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../lib/toast';
import { confirmAlert } from '../../lib/alert';
import type { SitDown } from '../../lib/types';

function SitDownTooltip({ description }: { description: string }) {
  const [show, setShow] = useState(false);

  return (
    <Dropdown
      open={show}
      onClose={() => setShow(false)}
      align="right"
      trigger={
        <Pressable onPress={() => setShow((s) => !s)} hitSlop={8}>
          <Info size={12} color="#57534e" />
        </Pressable>
      }
    >
      <View className="px-2.5 py-1.5 w-48">
        <Text className="text-[11px] leading-tight text-stone-300">
          {description}
        </Text>
      </View>
    </Dropdown>
  );
}

interface SitDownListItemProps {
  sitDown: SitDown;
  icon: React.ReactNode;
  onPress?: () => void;
  onDelete: (id: string) => Promise<void>;
  onLeave?: (id: string) => Promise<void>;
  onMarkRead?: (id: string) => void;
  variant?: 'sidebar' | 'tab';
}

export function SitDownListItem({
  sitDown,
  icon,
  onPress,
  onDelete,
  onLeave,
  onMarkRead,
  variant = 'sidebar',
}: SitDownListItemProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = pathname === `/sitdown/${sitDown.id}`;
  const isCommission = sitDown.is_commission === true;
  const isAdmin = !isCommission || sitDown.created_by === profile?.id;
  const unread = sitDown.unread_count ?? 0;

  function handlePress() {
    setMenuOpen(false);
    onMarkRead?.(sitDown.id);
    if (onPress) {
      onPress();
    } else {
      router.push(`/sitdown/${sitDown.id}`);
    }
  }

  async function handleDelete() {
    setMenuOpen(false);
    const confirmed = await confirmAlert('End this sit-down?', 'End this sit-down for everyone? All messages will be lost.');
    if (!confirmed) return;
    try {
      await onDelete(sitDown.id);
      if (pathname === `/sitdown/${sitDown.id}`) router.replace('/');
      toast.success('The sit-down is over.');
    } catch {
      toast.error("Couldn't end the sit-down.");
    }
  }

  async function handleLeave() {
    setMenuOpen(false);
    if (!onLeave) return;
    const confirmed = await confirmAlert('Leave this sit-down?', 'Leave this sit-down? You can be re-invited later.');
    if (!confirmed) return;
    try {
      await onLeave(sitDown.id);
      if (pathname === `/sitdown/${sitDown.id}`) router.replace('/');
      toast.success("You've left the sit-down.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't leave the sit-down.");
    }
  }

  const isTab = variant === 'tab';

  return (
    <View className={`flex-row items-center rounded-lg ${isActive ? 'bg-stone-800' : ''}`}>
      <Pressable
        onPress={handlePress}
        className={`min-w-0 flex-1 flex-row items-center gap-2 ${isTab ? 'px-4 py-3' : 'px-3 py-2'}`}
      >
        {icon}
        <Text
          numberOfLines={1}
          className={`flex-1 ${isTab ? 'text-base' : 'text-sm'} ${
            isActive ? 'text-gold-500' : 'text-stone-300'
          }`}
        >
          {sitDown.name}
        </Text>
        {unread > 0 && !isActive && (
          <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-600 px-1">
            <Text className="text-[10px] font-bold text-stone-950">
              {unread > 99 ? '99+' : unread}
            </Text>
          </View>
        )}
        {sitDown.description ? <SitDownTooltip description={sitDown.description} /> : null}
      </Pressable>

      <Dropdown
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        align="right"
        trigger={
          <Pressable
            onPress={() => setMenuOpen(!menuOpen)}
            style={{ padding: 4 }}
            hitSlop={6}
          >
            <MoreVertical size={14} color="#78716c" />
          </Pressable>
        }
      >
        {isCommission && !isAdmin && onLeave ? (
          <Pressable
            onPress={handleLeave}
            className="flex-row items-center gap-2 px-3 py-1.5"
            style={{ width: 144 }}
          >
            <LogOut size={14} color="#f59e0b" />
            <Text className="text-sm text-amber-500">Leave</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleDelete}
            className="flex-row items-center gap-2 px-3 py-1.5"
            style={{ width: 144 }}
          >
            <Trash2 size={14} color="#f87171" />
            <Text className="text-sm text-red-400">Delete</Text>
          </Pressable>
        )}
      </Dropdown>
    </View>
  );
}
