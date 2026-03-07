import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { MessageSquare, Users } from 'lucide-react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSitDowns } from '../../hooks/useSitDowns';
import { useCommissionSitDowns } from '../../hooks/useCommissionSitDowns';
import { SitDownListItem } from './SitDownListItem';
import { CreateSitdownModal } from '../sitdown/CreateSitdownModal';
import { CreateCommissionSitDownModal } from '../commission/CreateCommissionSitDownModal';

type Segment = 'family' | 'commission';

interface SitDownListProps {
  variant: 'sidebar' | 'tab';
  onNavigate?: () => void;
}

export function SitDownList({ variant, onNavigate }: SitDownListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    sitDowns,
    loading: familyLoading,
    createSitDown,
    leaveSitDown: leaveFamilySitDown,
    markAsRead: markSitDownAsRead,
    refetch: refetchSitDowns,
  } = useSitDowns();
  const {
    sitDowns: commissionSitDowns,
    loading: commissionLoading,
    leaveSitDown: leaveCommissionSitDown,
    markAsRead: markCommissionAsRead,
  } = useCommissionSitDowns();

  const [segment, setSegment] = useState<Segment>('family');
  const [showCreate, setShowCreate] = useState(false);
  const [showCommissionCreate, setShowCommissionCreate] = useState(false);
  const isTab = variant === 'tab';

  function handleSitDownPress(id: string, markRead?: (id: string) => void) {
    markRead?.(id);
    onNavigate?.();
    router.push(`/sitdown/${id}`);
  }

  if (isTab) {
    // Tab variant: segmented control to toggle between Family / Commission
    const activeSitDowns = segment === 'family' ? sitDowns : commissionSitDowns;
    const activeLeave = segment === 'family' ? leaveFamilySitDown : leaveCommissionSitDown;
    const activeMarkRead = segment === 'family' ? markSitDownAsRead : markCommissionAsRead;
    const activeLoading = segment === 'family' ? familyLoading : commissionLoading;

    const familyUnread = sitDowns.reduce((sum, sd) => sum + (sd.unread_count ?? 0), 0);
    const commissionUnread = commissionSitDowns.reduce((sum, sd) => sum + (sd.unread_count ?? 0), 0);

    return (
      <>
        <View className="flex-1">
          {/* Segmented Control */}
          <View className="mx-4 mt-4 mb-3 flex-row rounded-lg bg-stone-800 p-1">
            <Pressable
              onPress={() => setSegment('family')}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-md py-2 ${segment === 'family' ? 'bg-stone-700' : ''}`}
            >
              <Text className={`text-sm font-medium ${segment === 'family' ? 'text-gold-500' : 'text-stone-400'}`}>
                Family
              </Text>
              {familyUnread > 0 && (
                <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-600 px-1">
                  <Text className="text-[9px] font-bold text-stone-950">
                    {familyUnread > 99 ? '99+' : familyUnread}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => setSegment('commission')}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-md py-2 ${segment === 'commission' ? 'bg-stone-700' : ''}`}
            >
              <Text className={`text-sm font-medium ${segment === 'commission' ? 'text-gold-500' : 'text-stone-400'}`}>
                Commission
              </Text>
              {commissionUnread > 0 && (
                <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-600 px-1">
                  <Text className="text-[9px] font-bold text-stone-950">
                    {commissionUnread > 99 ? '99+' : commissionUnread}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Create Button */}
          <View className="mx-4 mb-3">
            <Pressable
              onPress={() => segment === 'family' ? setShowCreate(true) : setShowCommissionCreate(true)}
              className="w-full rounded-lg bg-gold-600 px-3 py-2.5"
            >
              <Text className="text-center font-serif text-sm font-bold text-stone-950">
                Call a Sit-down
              </Text>
            </Pressable>
          </View>

          {/* List */}
          <View className="px-4" style={{ gap: 2 }}>
            {activeLoading && activeSitDowns.length === 0 && (
              <View className="items-center py-8">
                <ActivityIndicator color="#78716c" />
                <Text className="mt-2 text-sm text-stone-500">Loading sit-downs...</Text>
              </View>
            )}
            {activeSitDowns.map((sd) => (
              <SitDownListItem
                key={sd.id}
                sitDown={sd}
                icon={
                  segment === 'family'
                    ? <MessageSquare size={18} color={pathname === `/sitdown/${sd.id}` ? '#d97706' : '#d6d3d1'} />
                    : <Users size={18} color={pathname === `/sitdown/${sd.id}` ? '#d97706' : '#d6d3d1'} />
                }
                onPress={() => handleSitDownPress(sd.id, activeMarkRead)}
                onLeave={activeLeave}
                onMarkRead={activeMarkRead}
                variant="tab"
              />
            ))}
            {!activeLoading && activeSitDowns.length === 0 && (
              <Text className="px-3 py-8 text-center text-sm text-stone-600">
                {segment === 'family' ? 'No sit-downs yet. Start one.' : 'No commission sit-downs yet.'}
              </Text>
            )}
          </View>
        </View>

        <CreateSitdownModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          onCreate={createSitDown}
          onCreated={(id) => {
            setShowCreate(false);
            refetchSitDowns();
            router.push(`/sitdown/${id}`);
          }}
        />

        <CreateCommissionSitDownModal
          visible={showCommissionCreate}
          onClose={() => setShowCommissionCreate(false)}
          onCreated={(id) => {
            setShowCommissionCreate(false);
            router.push(`/sitdown/${id}`);
          }}
        />
      </>
    );
  }

  // Sidebar variant: both sections stacked (not used yet, but available for future Sidebar refactor)
  return (
    <>
      <View>
        <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">
          Sit-downs
        </Text>
        <Pressable
          onPress={() => setShowCreate(true)}
          className="mb-2 w-full rounded-lg bg-gold-600 px-3 py-2"
        >
          <Text className="text-center font-serif text-sm font-bold text-stone-950">
            Call a Sit-down
          </Text>
        </Pressable>

        <View style={{ gap: 2 }}>
          {sitDowns.map((sd) => (
            <SitDownListItem
              key={sd.id}
              sitDown={sd}
              icon={<MessageSquare size={16} color={pathname === `/sitdown/${sd.id}` ? '#d97706' : '#d6d3d1'} />}
              onPress={() => handleSitDownPress(sd.id, markSitDownAsRead)}
              onLeave={leaveFamilySitDown}
              onMarkRead={markSitDownAsRead}
              variant="sidebar"
            />
          ))}
          {sitDowns.length === 0 && (
            <Text className="px-3 py-4 text-center text-xs text-stone-600">
              No sit-downs yet. Start one.
            </Text>
          )}
        </View>

        <View className="mt-6 border-t border-stone-800 pt-4">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Commission Sit-downs
          </Text>
          <Pressable
            onPress={() => setShowCommissionCreate(true)}
            className="mb-2 w-full rounded-lg bg-gold-600 px-3 py-2"
          >
            <Text className="text-center font-serif text-sm font-bold text-stone-950">
              Call a Sit-down
            </Text>
          </Pressable>

          <View style={{ gap: 2 }}>
            {commissionSitDowns.map((sd) => (
              <SitDownListItem
                key={sd.id}
                sitDown={sd}
                icon={<Users size={16} color={pathname === `/sitdown/${sd.id}` ? '#d97706' : '#d6d3d1'} />}
                onPress={() => handleSitDownPress(sd.id, markCommissionAsRead)}
                onLeave={leaveCommissionSitDown}
                onMarkRead={markCommissionAsRead}
                variant="sidebar"
              />
            ))}
            {commissionSitDowns.length === 0 && (
              <Text className="px-3 py-4 text-center text-xs text-stone-600">
                No commission sit-downs yet.
              </Text>
            )}
          </View>
        </View>
      </View>

      <CreateSitdownModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={createSitDown}
        onCreated={(id) => {
          setShowCreate(false);
          onNavigate?.();
          refetchSitDowns();
          router.push(`/sitdown/${id}`);
        }}
      />

      <CreateCommissionSitDownModal
        visible={showCommissionCreate}
        onClose={() => setShowCommissionCreate(false)}
        onCreated={(id) => {
          setShowCommissionCreate(false);
          onNavigate?.();
          router.push(`/sitdown/${id}`);
        }}
      />
    </>
  );
}
