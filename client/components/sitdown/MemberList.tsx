import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, Platform } from 'react-native';
import { Plus, UserPlus, X } from 'lucide-react-native';
import { PROVIDER_COLORS } from '../../config/constants';
import { useAuth } from '../../contexts/AuthContext';
import type { SitDownParticipant, Member, CommissionContact } from '../../lib/types';
import type { MembersByOwner } from '../../hooks/useSitDownData';

interface MemberListProps {
  participants: SitDownParticipant[];
  availableMembers?: Member[];
  isCommission?: boolean;
  membersByOwner?: Map<string, MembersByOwner>;
  addableContacts?: CommissionContact[];
  onAddMember?: (memberId: string) => Promise<void>;
  onAddUser?: (userId: string) => Promise<void>;
  onRemoveParticipant?: (participantId: string) => Promise<void>;
  onToggleAdmin?: (userId: string) => Promise<void>;
  onLeave?: () => Promise<void>;
}

export function MemberList({
  participants,
  availableMembers,
  isCommission,
  membersByOwner,
  addableContacts,
  onAddMember,
  onAddUser,
  onRemoveParticipant,
  onToggleAdmin,
  onLeave,
}: MemberListProps) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [togglingAdmin, setTogglingAdmin] = useState<string | null>(null);

  const callerIsAdmin = isCommission && participants.find((p) => p.user_id === user?.id)?.is_admin;

  // For commission sit-downs, derive the Dons list from membersByOwner (proven correct)
  // rather than participants.filter(), which can miss Dons due to join/RLS quirks.
  const dons =
    isCommission && membersByOwner && membersByOwner.size > 0
      ? Array.from(membersByOwner.entries()).map(([userId, { profile }]) => ({
          id: participants.find((p) => p.user_id === userId)?.id ?? userId,
          user_id: userId,
          profile,
        }))
      : participants
          .filter((p) => p.user_id)
          .map((p) => ({
            id: p.id,
            user_id: p.user_id!,
            profile: p.profile,
          }));
  const memberParticipants = participants.filter((p) => p.member_id);

  const participantMemberIds = new Set(memberParticipants.map((p) => p.member_id));
  const addableMembers =
    availableMembers?.filter((m) => !participantMemberIds.has(m.id)) ?? [];

  // For commission sit-downs, show only YOUR addable members (each Don manages their own family)
  const groupedAddableMembers = new Map<string, { label: string; members: Member[] }>();
  if (isCommission && membersByOwner && user) {
    const myEntry = membersByOwner.get(user.id);
    if (myEntry) {
      const myAddable = myEntry.members.filter((m) => !participantMemberIds.has(m.id));
      if (myAddable.length > 0) {
        groupedAddableMembers.set(user.id, { label: 'Your Family', members: myAddable });
      }
    }
  }

  function handleRemove(participantId: string, name: string) {
    const msg = `Remove ${name} from this sit-down?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) onRemoveParticipant?.(participantId);
    } else {
      Alert.alert('Remove Member', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => onRemoveParticipant?.(participantId) },
      ]);
    }
  }

  function handleLeave() {
    const msg = 'Are you sure you want to leave this sit-down?';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) onLeave?.();
    } else {
      Alert.alert('Leave Sit-Down', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => onLeave?.() },
      ]);
    }
  }

  async function handleAddMember(memberId: string) {
    if (!onAddMember) return;
    setAdding(true);
    try {
      await onAddMember(memberId);
    } finally {
      setAdding(false);
    }
  }

  async function handleAddUser(userId: string) {
    if (!onAddUser) return;
    setAdding(true);
    try {
      await onAddUser(userId);
    } finally {
      setAdding(false);
    }
  }

  function handleToggleAdmin(userId: string, name: string, currentlyAdmin: boolean) {
    const verb = currentlyAdmin ? 'Demote' : 'Promote';
    const desc = currentlyAdmin
      ? `Remove ${name} as admin?`
      : `Make ${name} an admin? They\u2019ll be able to manage this sit-down.`;
    const doToggle = async () => {
      setTogglingAdmin(userId);
      try {
        await onToggleAdmin?.(userId);
      } finally {
        setTogglingAdmin(null);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(desc)) doToggle();
    } else {
      Alert.alert(`${verb} Admin`, desc, [
        { text: 'Cancel', style: 'cancel' },
        { text: verb, style: currentlyAdmin ? 'destructive' : 'default', onPress: doToggle },
      ]);
    }
  }

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      <View className="gap-3 p-1">
        {/* Dons */}
        {dons.length > 0 && (
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
              Dons
            </Text>
            <View className="gap-0.5">
              {dons.map((d) => {
                const donIsAdmin = participants.find((p) => p.user_id === d.user_id)?.is_admin;
                const isSelf = d.user_id === user?.id;
                const showToggle = isCommission && onToggleAdmin && callerIsAdmin && !isSelf;

                return (
                  <View key={d.id} className="flex-row items-center gap-2 rounded-md px-2 py-1.5">
                    <View className="h-6 w-6 items-center justify-center rounded-full bg-yellow-600">
                      <Text className="text-[10px] font-bold text-stone-950">
                        {d.profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                      </Text>
                    </View>
                    <View className="flex-row items-center flex-1 gap-1 min-w-0">
                      <Text className="text-xs text-stone-300 shrink" numberOfLines={1}>
                        {d.profile?.display_name ?? 'Don'}
                        {isSelf && (
                          <Text className="text-stone-600"> (you)</Text>
                        )}
                      </Text>
                      {isCommission && donIsAdmin && (
                        showToggle ? (
                          <Pressable
                            onPress={() => handleToggleAdmin(d.user_id, d.profile?.display_name ?? 'Don', true)}
                            disabled={togglingAdmin === d.user_id}
                            hitSlop={6}
                          >
                            <Text style={{ fontSize: 12 }}>{'\uD83E\uDD43'}</Text>
                          </Pressable>
                        ) : (
                          <Text style={{ fontSize: 12 }}>{'\uD83E\uDD43'}</Text>
                        )
                      )}
                    </View>
                    {showToggle && !donIsAdmin && (
                      <Pressable
                        onPress={() => handleToggleAdmin(d.user_id, d.profile?.display_name ?? 'Don', false)}
                        disabled={togglingAdmin === d.user_id}
                        className="rounded p-0.5"
                        hitSlop={8}
                      >
                        <Text style={{ fontSize: 10 }}>{'\uD83E\uDD43'}</Text>
                      </Pressable>
                    )}
                    {isSelf && onLeave && (
                      <Pressable onPress={handleLeave} className="rounded p-0.5" hitSlop={8}>
                        <Text style={{ fontSize: 12 }}>{'\uD83D\uDEAA'}</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Existing member participants */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
            Members
          </Text>
          <View className="gap-0.5">
            {memberParticipants.map((p) => (
              <View
                key={p.id}
                className="flex-row items-center gap-2 rounded-md px-2 py-1.5"
              >
                <View
                  className={`h-6 w-6 shrink-0 items-center justify-center rounded ${p.member?.catalog_model ? PROVIDER_COLORS[p.member.catalog_model.provider] : 'bg-stone-600'}`}
                >
                  <Text className="text-[9px] font-bold text-white">
                    {p.member?.catalog_model?.provider[0].toUpperCase() ?? '?'}
                  </Text>
                </View>
                <Text className="text-xs text-stone-300 flex-1" numberOfLines={1}>
                  {p.member?.name ?? 'Unknown'}
                </Text>
                {onRemoveParticipant && (!isCommission || p.member?.owner_id === user?.id) && (
                  <Pressable
                    onPress={() => handleRemove(p.id, p.member?.name ?? 'this member')}
                    className="ml-auto rounded p-0.5"
                    hitSlop={8}
                  >
                    <X size={12} color="#57534e" />
                  </Pressable>
                )}
              </View>
            ))}
            {memberParticipants.length === 0 && (
              <Text className="text-[11px] text-stone-600 px-2 py-1">
                No members added yet.
              </Text>
            )}
          </View>
        </View>

        {/* Add Member -- grouped by family for commission sit-downs */}
        {isCommission &&
          groupedAddableMembers.size > 0 &&
          onAddMember &&
          Array.from(groupedAddableMembers.entries()).map(
            ([ownerId, { label, members: ownerMembers }]) => (
              <View key={ownerId}>
                <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
                  {label}
                </Text>
                <View className="gap-0.5">
                  {ownerMembers.map((member) => (
                    <Pressable
                      key={member.id}
                      onPress={() => handleAddMember(member.id)}
                      disabled={adding}
                      className={`flex-row items-center gap-2 rounded-md border border-stone-800 px-2 py-1.5 ${adding ? 'opacity-50' : ''}`}
                    >
                      <Plus size={12} color="#eab308" />
                      <View
                        className={`h-5 w-5 shrink-0 items-center justify-center rounded ${member.catalog_model ? PROVIDER_COLORS[member.catalog_model.provider] : 'bg-stone-600'}`}
                      >
                        <Text className="text-[8px] font-bold text-white">
                          {member.catalog_model?.provider[0].toUpperCase() ?? '?'}
                        </Text>
                      </View>
                      <Text className="text-xs text-stone-300 flex-1" numberOfLines={1}>
                        {member.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ),
          )}

        {/* Add Member -- flat list for personal sit-downs */}
        {!isCommission && addableMembers.length > 0 && onAddMember && (
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
              Add Member
            </Text>
            <View className="gap-0.5">
              {addableMembers.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => handleAddMember(member.id)}
                  disabled={adding}
                  className={`flex-row items-center gap-2 rounded-md border border-stone-800 px-2 py-1.5 ${adding ? 'opacity-50' : ''}`}
                >
                  <Plus size={12} color="#eab308" />
                  <View
                    className={`h-5 w-5 shrink-0 items-center justify-center rounded ${member.catalog_model ? PROVIDER_COLORS[member.catalog_model.provider] : 'bg-stone-600'}`}
                  >
                    <Text className="text-[8px] font-bold text-white">
                      {member.catalog_model?.provider[0].toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <Text className="text-xs text-stone-300 flex-1" numberOfLines={1}>
                    {member.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Invite Don to commission sit-down */}
        {isCommission && addableContacts && addableContacts.length > 0 && onAddUser && (
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
              Invite a Don
            </Text>
            <View className="gap-0.5">
              {addableContacts.map((contact) => (
                <Pressable
                  key={contact.id}
                  onPress={() => handleAddUser(contact.contact_user_id)}
                  disabled={adding}
                  className={`flex-row items-center gap-2 rounded-md border border-stone-800 px-2 py-1.5 ${adding ? 'opacity-50' : ''}`}
                >
                  <UserPlus size={12} color="#eab308" />
                  <View className="h-5 w-5 items-center justify-center rounded-full bg-yellow-600">
                    <Text className="text-[8px] font-bold text-stone-950">
                      {contact.contact_profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                    </Text>
                  </View>
                  <Text className="text-xs text-stone-300 flex-1" numberOfLines={1}>
                    {contact.contact_profile?.display_name ?? 'Don'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
