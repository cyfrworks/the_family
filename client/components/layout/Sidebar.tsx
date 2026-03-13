import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { DrawerContentScrollView, type DrawerContentComponentProps } from '@react-navigation/drawer';
import { useRouter, usePathname } from 'expo-router';
import {
  MessageSquare,
  Settings,
  LogOut,
  Shield,
  MoreVertical,
  Trash2,
  Users,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Info,
  Crown,
  Activity,
  Copy,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../common/UserAvatar';
import { useSitDowns } from '../../hooks/useSitDowns';
import { useCommission } from '../../hooks/useCommission';
import { useCommissionSitDowns } from '../../hooks/useCommissionSitDowns';
import { useRealtimeStatus } from '../../hooks/useRealtimeStatus';
import { CreateSitdownModal } from '../sitdown/CreateSitdownModal';
import { CreateCommissionSitDownModal } from '../commission/CreateCommissionSitDownModal';
import { InviteToCommissionModal } from '../commission/InviteToCommissionModal';
import { TIER_LABELS, TIER_COLORS } from '../../config/constants';
import * as Clipboard from 'expo-clipboard';
import { toast } from '../../lib/toast';
import { confirmAlert } from '../../lib/alert';
import { Dropdown } from '../ui/Dropdown';
import { RunYourFamilyButton } from '../common/RunYourFamilyButton';

// ── Tooltip (press-to-reveal description) ──────────────────────────────
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

// ── Pending-invites inline banner ──────────────────────────────────────
function SidebarPendingInvites({
  invites,
  onAccept,
  onDecline,
}: {
  invites: { id: string; profile?: { display_name?: string } | null }[];
  onAccept: (id: string) => Promise<unknown>;
  onDecline: (id: string) => Promise<unknown>;
}) {
  if (invites.length === 0) return null;

  return (
    <View className="mb-2 gap-1">
      {invites.map((invite) => (
        <View
          key={invite.id}
          className="rounded-lg border border-gold-600/30 bg-gold-600/10 px-3 py-2"
        >
          <Text className="mb-1.5 text-xs text-gold-500">
            <Text className="font-semibold">
              {invite.profile?.display_name ?? 'A Don'}
            </Text>
            {' wants you in The Commission'}
          </Text>
          <View className="flex-row gap-1.5">
            <Pressable
              onPress={async () => {
                try {
                  await onAccept(invite.id);
                  toast.success('Welcome to The Commission.');
                } catch {
                  toast.error("Couldn't accept the invite.");
                }
              }}
              className="flex-row items-center gap-1 rounded bg-gold-600 px-2 py-1"
            >
              <Text className="text-[11px] font-semibold text-stone-950">Accept</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                try {
                  await onDecline(invite.id);
                  toast.success('Invitation declined.');
                } catch {
                  toast.error("Couldn't decline the invite.");
                }
              }}
              className="flex-row items-center gap-1 rounded border border-stone-700 px-2 py-1"
            >
              <Text className="text-[11px] text-stone-400">Decline</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Main Sidebar ───────────────────────────────────────────────────────
export function Sidebar(props: DrawerContentComponentProps) {
  const router = useRouter();
  const pathname = usePathname();

  const { profile, isGodfather, tier, signOut } = useAuth();
  const realtimeConnected = useRealtimeStatus();
  const { sitDowns, createSitDown, leaveSitDown: leaveFamilySitDown, markAsRead: markSitDownAsRead, refetch: refetchSitDowns } = useSitDowns();
  const { contacts, pendingInvites, sentInvites, acceptInvite, declineInvite, removeContact } = useCommission();
  const { sitDowns: commissionSitDowns, leaveSitDown: leaveCommissionSitDown, markAsRead: markCommissionAsRead } = useCommissionSitDowns();

  const [showCreate, setShowCreate] = useState(false);
  const [showCommissionCreate, setShowCommissionCreate] = useState(false);
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showCommission, setShowCommission] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  function closeDrawer() {
    props.navigation.closeDrawer();
  }

  function handleSignOut() {
    signOut();
    router.replace('/(auth)/login');
  }

  async function handleLeaveSitDown(id: string, onLeave: (id: string) => Promise<void>) {
    const confirmed = await confirmAlert(
      'Leave this sit-down?',
      'Walk away and the words stay behind. All messages will be lost.',
    );
    if (!confirmed) return;
    try {
      await onLeave(id);
      if (pathname === `/sitdown/${id}`) router.replace('/');
      toast.success("You've left the table.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't leave the sit-down.");
    }
  }

  function renderSitDownItem(
    sd: { id: string; name: string; description?: string | null; unread_count?: number },
    icon: React.ReactNode,
    onLeave: (id: string) => Promise<void>,
    onMarkRead?: (id: string) => void,
  ) {
    const isActive = pathname === `/sitdown/${sd.id}`;
    const unread = sd.unread_count ?? 0;

    return (
      <View key={sd.id} className={`flex-row items-center rounded-lg ${isActive ? 'bg-stone-800' : ''}`}>
        <Pressable
          onPress={() => {
            setMenuOpen(null);
            onMarkRead?.(sd.id);
            closeDrawer();
            router.push(`/sitdown/${sd.id}`);
          }}
          className="min-w-0 flex-1 flex-row items-center gap-2 px-3 py-2"
        >
          {icon}
          <Text
            numberOfLines={1}
            className={`flex-1 text-sm ${
              isActive ? 'text-gold-500' : 'text-stone-300'
            }`}
          >
            {sd.name}
          </Text>
          {unread > 0 && !isActive && (
            <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-600 px-1">
              <Text className="text-[10px] font-bold text-stone-950">
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          )}
          {sd.description ? <SitDownTooltip description={sd.description} /> : null}
        </Pressable>

        {/* Context-menu trigger */}
        <Dropdown
          open={menuOpen === sd.id}
          onClose={() => setMenuOpen(null)}
          align="right"
          trigger={
            <Pressable
              onPress={() => setMenuOpen(menuOpen === sd.id ? null : sd.id)}
              style={{ padding: 4 }}
              hitSlop={6}
            >
              <MoreVertical size={14} color="#78716c" />
            </Pressable>
          }
        >
          <Pressable
            onPress={async () => {
              setMenuOpen(null);
              await Clipboard.setStringAsync(sd.id);
              toast.success('Sit-down ID copied.');
            }}
            className="flex-row items-center gap-2 px-3 py-1.5"
            style={{ width: 144 }}
          >
            <Copy size={14} color="#a8a29e" />
            <Text className="text-sm text-stone-300">Copy ID</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuOpen(null);
              handleLeaveSitDown(sd.id, onLeave);
            }}
            className="flex-row items-center gap-2 px-3 py-1.5"
            style={{ width: 144 }}
          >
            <LogOut size={14} color="#f59e0b" />
            <Text className="text-sm text-amber-500">Leave</Text>
          </Pressable>
        </Dropdown>
      </View>
    );
  }

  const familyUnread = sitDowns.reduce((sum, sd) => sum + (sd.unread_count ?? 0), 0);
  const commissionUnread = commissionSitDowns.reduce((sum, sd) => sum + (sd.unread_count ?? 0), 0);

  return (
    <>
      <View className="flex-1 bg-stone-900">
        {/* Header */}
        <Pressable
          onPress={() => {
            closeDrawer();
            router.push('/');
          }}
          className="flex-row items-center gap-2 border-b border-stone-800 px-4 py-4"
        >
          <Image
            source={require('../../assets/images/logo.png')}
            style={{ width: 32, height: 32, borderRadius: 8 }}
          />
          <Text className="font-serif text-xl font-bold text-gold-500">
            The Family
          </Text>
        </Pressable>

        {/* Scrollable content */}
        <DrawerContentScrollView
          {...props}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 }}
          style={{ backgroundColor: '#1c1917' }}
        >
          <View>
            {/* ── Call a Sit-down ──────────────────────────── */}
            <Dropdown
              open={showCreatePicker}
              onClose={() => setShowCreatePicker(false)}
              trigger={
                <Pressable
                  onPress={() => setShowCreatePicker(!showCreatePicker)}
                  className="mb-3 w-full rounded-lg bg-gold-600 px-3 py-2"
                >
                  <Text className="text-center font-serif text-sm font-bold text-stone-950">
                    Call a Sit-down
                  </Text>
                </Pressable>
              }
            >
              <Pressable
                onPress={() => { setShowCreatePicker(false); setShowCreate(true); }}
                className="flex-row items-center gap-2 px-3 py-2.5"
              >
                <MessageSquare size={14} color="#d6d3d1" />
                <Text className="text-sm text-stone-100">Family</Text>
              </Pressable>
              <Pressable
                onPress={() => { setShowCreatePicker(false); setShowCommissionCreate(true); }}
                className="flex-row items-center gap-2 px-3 py-2.5"
              >
                <Users size={14} color="#d6d3d1" />
                <Text className="text-sm text-stone-100">Commission</Text>
              </Pressable>
            </Dropdown>

            {/* ── Family Sit-downs ─────────────────────────── */}
            <View className="mb-1 flex-row items-center gap-1.5">
              <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Family
              </Text>
              {familyUnread > 0 && (
                <View className="h-3.5 min-w-[14px] items-center justify-center rounded-full bg-gold-600 px-1">
                  <Text className="text-[8px] font-bold text-stone-950">
                    {familyUnread > 99 ? '99+' : familyUnread}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ gap: 2 }}>
              {sitDowns.map((sd) =>
                renderSitDownItem(
                  sd,
                  <MessageSquare size={16} color={pathname === `/sitdown/${sd.id}` ? '#d97706' : '#d6d3d1'} />,
                  leaveFamilySitDown,
                  markSitDownAsRead,
                ),
              )}
              {sitDowns.length === 0 && (
                <Text className="px-3 py-4 text-center text-xs text-stone-600">
                  No sit-downs yet. Start one.
                </Text>
              )}
            </View>

            {/* ── Commission Sit-downs ──────────────────────── */}
            <View className="mt-5 border-t border-stone-800 pt-4">
              <View className="mb-1 flex-row items-center gap-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Commission
                </Text>
                {commissionUnread > 0 && (
                  <View className="h-3.5 min-w-[14px] items-center justify-center rounded-full bg-gold-600 px-1">
                    <Text className="text-[8px] font-bold text-stone-950">
                      {commissionUnread > 99 ? '99+' : commissionUnread}
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ gap: 2 }}>
                {commissionSitDowns.map((sd) =>
                  renderSitDownItem(
                    sd,
                    <Users size={16} color={pathname === `/sitdown/${sd.id}` ? '#d97706' : '#d6d3d1'} />,
                    leaveCommissionSitDown,
                    markCommissionAsRead,
                  ),
                )}
                {commissionSitDowns.length === 0 && (
                  <Text className="px-3 py-4 text-center text-xs text-stone-600">
                    No commission sit-downs yet.
                  </Text>
                )}
              </View>
            </View>
          </View>
        </DrawerContentScrollView>

        {/* ── Bottom navigation ──────────────────────────── */}
        <View className="border-t border-stone-800 p-3 gap-0.5">
          {/* The Commission (expandable contact list) */}
          <Pressable
            onPress={() => setShowCommission((s) => !s)}
            className="flex-row items-center gap-2 rounded-lg px-3 py-2"
          >
            <Users size={16} color="#d6d3d1" />
            <Text className="flex-1 text-sm text-stone-300">The Commission</Text>
            {pendingInvites.length > 0 && (
              <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-600 px-1">
                <Text className="text-[10px] font-bold text-stone-950">
                  {pendingInvites.length}
                </Text>
              </View>
            )}
            {showCommission
              ? <ChevronDown size={14} color="#78716c" />
              : <ChevronUp size={14} color="#78716c" />
            }
          </Pressable>

          {showCommission && (
            <View className="ml-2 mt-1 gap-1.5 border-l border-stone-800 pl-3 pb-1">
              <SidebarPendingInvites
                invites={pendingInvites}
                onAccept={acceptInvite}
                onDecline={declineInvite}
              />

              {/* Outgoing pending invites */}
              {sentInvites.map((c) => (
                <View key={c.id} className="flex-row items-center gap-2 rounded-md px-2 py-1 opacity-60">
                  <UserAvatar profile={c.contact_profile} size={20} />
                  <Text numberOfLines={1} className="flex-1 text-xs italic text-stone-500">
                    {c.contact_profile?.display_name ?? 'Don'}
                  </Text>
                  <Text className="text-[10px] text-stone-600">Pending...</Text>
                </View>
              ))}

              {/* Contact list */}
              {contacts.map((c) => {
                const contactName = c.contact_profile?.display_name ?? 'this Don';
                return (
                  <View key={c.id} className="flex-row items-center gap-2 rounded-md px-2 py-1">
                    <UserAvatar profile={c.contact_profile} size={20} />
                    <Text numberOfLines={1} className="flex-1 text-xs text-stone-400">
                      {c.contact_profile?.display_name ?? 'Don'}
                    </Text>
                    <Dropdown
                      open={menuOpen === `contact-${c.id}`}
                      onClose={() => setMenuOpen(null)}
                      align="right"
                      trigger={
                        <Pressable
                          onPress={() => setMenuOpen(menuOpen === `contact-${c.id}` ? null : `contact-${c.id}`)}
                          style={{ padding: 4 }}
                          hitSlop={6}
                        >
                          <MoreVertical size={12} color="#78716c" />
                        </Pressable>
                      }
                    >
                      <Pressable
                        onPress={async () => {
                          setMenuOpen(null);
                          const confirmed = await confirmAlert('Remove contact', `Remove ${contactName} from The Commission?`);
                          if (!confirmed) return;
                          try {
                            await removeContact(c.contact_user_id);
                            toast.success(`${contactName} has been removed.`);
                          } catch {
                            toast.error("Couldn't remove contact.");
                          }
                        }}
                        className="flex-row items-center gap-2 px-3 py-1.5"
                        style={{ width: 144 }}
                      >
                        <Trash2 size={14} color="#f87171" />
                        <Text className="text-sm text-red-400">Remove</Text>
                      </Pressable>
                    </Dropdown>
                  </View>
                );
              })}

              {contacts.length === 0 && pendingInvites.length === 0 && sentInvites.length === 0 && (
                <Text className="px-2 py-1 text-[11px] text-stone-600">
                  No contacts yet.
                </Text>
              )}

              <Pressable
                onPress={() => setShowInvite(true)}
                className="flex-row items-center gap-2 rounded-md px-2 py-1"
              >
                <UserPlus size={12} color="#d97706" />
                <Text className="text-xs text-gold-500">Invite a Don</Text>
              </Pressable>
            </View>
          )}

          {/* Members link */}
          <Pressable
            onPress={() => {
              closeDrawer();
              router.push('/members');
            }}
            className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${
              pathname === '/members' ? 'bg-stone-800' : ''
            }`}
          >
            <Shield size={16} color={pathname === '/members' ? '#d97706' : '#d6d3d1'} />
            <Text className={`text-sm ${pathname === '/members' ? 'text-gold-500' : 'text-stone-300'}`}>
              Members
            </Text>
          </Pressable>

          {/* Operations link */}
          <Pressable
            onPress={() => {
              closeDrawer();
              router.push('/operations');
            }}
            className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${
              pathname === '/operations' ? 'bg-stone-800' : ''
            }`}
          >
            <Activity size={16} color={pathname === '/operations' ? '#d97706' : '#d6d3d1'} />
            <Text className={`text-sm ${pathname === '/operations' ? 'text-gold-500' : 'text-stone-300'}`}>
              Operations
            </Text>
          </Pressable>

          {/* Admin link (godfather only) */}
          {isGodfather && (
            <Pressable
              onPress={() => {
                closeDrawer();
                router.push('/admin');
              }}
              className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${
                pathname === '/admin' ? 'bg-stone-800' : ''
              }`}
            >
              <Crown size={16} color={pathname === '/admin' ? '#d97706' : '#d6d3d1'} />
              <Text className={`text-sm ${pathname === '/admin' ? 'text-gold-500' : 'text-stone-300'}`}>
                Admin
              </Text>
            </Pressable>
          )}

          {/* Settings link */}
          <Pressable
            onPress={() => {
              closeDrawer();
              router.push('/settings');
            }}
            className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${
              pathname === '/settings' ? 'bg-stone-800' : ''
            }`}
          >
            <Settings size={16} color={pathname === '/settings' ? '#d97706' : '#d6d3d1'} />
            <Text className={`text-sm ${pathname === '/settings' ? 'text-gold-500' : 'text-stone-300'}`}>
              Settings
            </Text>
          </Pressable>
        </View>

        {/* ── User profile section ───────────────────────── */}
        <View className="border-t border-stone-800 p-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2 flex-1 min-w-0">
              <UserAvatar profile={profile} size={32} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm text-stone-300">
                  {profile?.display_name ?? 'Don'}
                </Text>
                <View className="flex-row items-center gap-1.5 flex-wrap mt-0.5">
                  <View className={`rounded px-1.5 py-0.5 ${TIER_COLORS[tier]}`}>
                    <Text className={`text-[9px] font-semibold ${
                      tier === 'associate' ? 'text-stone-300' : 'text-stone-950'
                    }`}>
                      {TIER_LABELS[tier]}
                    </Text>
                  </View>
                  <View className={`flex-row items-center gap-1 rounded px-1.5 py-0.5 ${
                    realtimeConnected
                      ? 'bg-emerald-900/50'
                      : 'bg-red-900/50'
                  }`}>
                    <View className={`h-1.5 w-1.5 rounded-full ${
                      realtimeConnected ? 'bg-emerald-400' : 'bg-red-400'
                    }`} />
                    <Text className={`text-[9px] font-semibold ${
                      realtimeConnected ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {realtimeConnected ? 'Wired in' : 'Dark'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            <RunYourFamilyButton compact />
            <Pressable
              onPress={handleSignOut}
              className="rounded-md p-1.5"
              hitSlop={6}
            >
              <LogOut size={16} color="#a8a29e" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Modals ──────────────────────────────────────── */}
      <CreateSitdownModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={createSitDown}
        onCreated={(id) => {
          setShowCreate(false);
          closeDrawer();
          refetchSitDowns();
          router.push(`/sitdown/${id}`);
        }}
      />

      <CreateCommissionSitDownModal
        visible={showCommissionCreate}
        onClose={() => setShowCommissionCreate(false)}
        onCreated={(id) => {
          setShowCommissionCreate(false);
          closeDrawer();
          router.push(`/sitdown/${id}`);
        }}
      />

      <InviteToCommissionModal
        visible={showInvite}
        onClose={() => setShowInvite(false)}
      />
    </>
  );
}
