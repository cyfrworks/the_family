import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Users, Shield, Crown, Settings } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useCommissionContext } from '../../contexts/CommissionContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { SitDown } from '../../lib/types';

interface TabConfig {
  name: string;
  label: string;
  icon: typeof MessageSquare;
  badge?: number;
  hidden?: boolean;
}

export function MobileTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { isGodfather } = useAuth();
  const { pendingInvites } = useCommissionContext();

  // Read-only cache subscription for sit-down unread counts (no fetch, no realtime setup)
  const { data: sitDowns = [] } = useQuery<SitDown[]>({
    queryKey: ['sitDowns'],
    queryFn: async () => [],
    enabled: false,
  });

  // Read commission sit-down unread counts from cache
  const { data: commissionData } = useQuery<{
    contacts: unknown[];
    pendingInvites: unknown[];
    sentInvites: unknown[];
    commissionSitDowns: SitDown[];
  }>({
    queryKey: ['commission', 'state'],
    queryFn: async () => ({ contacts: [], pendingInvites: [], sentInvites: [], commissionSitDowns: [] }),
    enabled: false,
  });

  const totalUnread =
    sitDowns.reduce((sum, sd) => sum + (sd.unread_count ?? 0), 0) +
    (commissionData?.commissionSitDowns ?? []).reduce((sum, sd) => sum + (sd.unread_count ?? 0), 0);

  const tabs: TabConfig[] = [
    { name: '(sitdowns)', label: 'Sit-downs', icon: MessageSquare, badge: totalUnread },
    { name: 'commission', label: 'Commission', icon: Users, badge: pendingInvites.length },
    { name: 'members', label: 'Members', icon: Shield },
    { name: 'admin', label: 'Admin', icon: Crown, hidden: !isGodfather },
    { name: 'settings', label: 'Settings', icon: Settings },
  ];

  const visibleTabs = tabs.filter((t) => !t.hidden);

  return (
    <View
      className="flex-row border-t border-stone-800 bg-stone-900"
      style={{ paddingBottom: insets.bottom }}
    >
      {visibleTabs.map((tab) => {
        const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
        const isFocused = state.index === routeIndex;
        const Icon = tab.icon;

        return (
          <Pressable
            key={tab.name}
            onPress={() => {
              if (routeIndex === -1) return;
              const event = navigation.emit({
                type: 'tabPress',
                target: state.routes[routeIndex].key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(state.routes[routeIndex].name);
              }
            }}
            className="flex-1 items-center justify-center py-2"
          >
            <View className="relative">
              <Icon size={22} color={isFocused ? '#d97706' : '#78716c'} />
              {(tab.badge ?? 0) > 0 && (
                <View className="absolute -right-2 -top-1 h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-600 px-1">
                  <Text className="text-[9px] font-bold text-stone-950">
                    {(tab.badge ?? 0) > 99 ? '99+' : tab.badge}
                  </Text>
                </View>
              )}
            </View>
            <Text
              className={`mt-0.5 text-[10px] ${isFocused ? 'text-gold-500 font-medium' : 'text-stone-500'}`}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
