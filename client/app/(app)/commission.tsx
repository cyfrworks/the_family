import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { MoreVertical, Trash2, UserPlus } from 'lucide-react-native';
import { useCommission } from '../../hooks/useCommission';
import { InviteToCommissionModal } from '../../components/commission/InviteToCommissionModal';
import { Dropdown } from '../../components/ui/Dropdown';
import { toast } from '../../lib/toast';
import { confirmAlert } from '../../lib/alert';
import { BackgroundWatermark } from '../../components/BackgroundWatermark';

export default function CommissionScreen() {
  const { contacts, pendingInvites, sentInvites, acceptInvite, declineInvite, removeContact } = useCommission();
  const [showInvite, setShowInvite] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  async function handleRemoveContact(contactUserId: string, contactName: string) {
    setMenuOpen(null);
    const confirmed = await confirmAlert('Remove contact', `Remove ${contactName} from The Commission?`);
    if (!confirmed) return;
    try {
      await removeContact(contactUserId);
      toast.success(`${contactName} has been removed.`);
    } catch {
      toast.error("Couldn't remove contact.");
    }
  }

  return (
    <View className="flex-1 bg-stone-950">
      <BackgroundWatermark />
      <ScrollView contentContainerClassName="p-4 pb-8">
        <Text className="mb-4 font-serif text-2xl font-bold text-stone-100">The Commission</Text>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <View className="mb-4 gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Pending Invites
            </Text>
            {pendingInvites.map((invite) => (
              <View
                key={invite.id}
                className="rounded-lg border border-gold-600/30 bg-gold-600/10 px-4 py-3"
              >
                <Text className="mb-2 text-sm text-gold-500">
                  <Text className="font-semibold">
                    {invite.profile?.display_name ?? 'A Don'}
                  </Text>
                  {' wants you in The Commission'}
                </Text>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={async () => {
                      try {
                        await acceptInvite(invite.id);
                        toast.success('Welcome to The Commission.');
                      } catch {
                        toast.error("Couldn't accept the invite.");
                      }
                    }}
                    className="flex-row items-center gap-1 rounded bg-gold-600 px-3 py-1.5"
                  >
                    <Text className="text-sm font-semibold text-stone-950">Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      try {
                        await declineInvite(invite.id);
                        toast.success('Invitation declined.');
                      } catch {
                        toast.error("Couldn't decline the invite.");
                      }
                    }}
                    className="flex-row items-center gap-1 rounded border border-stone-700 px-3 py-1.5"
                  >
                    <Text className="text-sm text-stone-400">Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Sent Invites */}
        {sentInvites.length > 0 && (
          <View className="mb-4 gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Sent Invites
            </Text>
            {sentInvites.map((c) => (
              <View key={c.id} className="flex-row items-center gap-3 rounded-lg bg-stone-900 px-4 py-3 opacity-70">
                <View className="h-8 w-8 items-center justify-center rounded-full bg-stone-700">
                  <Text className="text-xs font-bold text-stone-400">
                    {c.contact_profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                  </Text>
                </View>
                <Text numberOfLines={1} className="flex-1 text-sm italic text-stone-500">
                  {c.contact_profile?.display_name ?? 'Don'}
                </Text>
                <Text className="text-xs text-stone-600">Pending...</Text>
              </View>
            ))}
          </View>
        )}

        {/* Accepted Contacts */}
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Contacts
          </Text>
          {contacts.map((c) => {
            const contactName = c.contact_profile?.display_name ?? 'this Don';
            return (
              <View key={c.id} className="flex-row items-center gap-3 rounded-lg bg-stone-900 px-4 py-3">
                <View className="h-8 w-8 items-center justify-center rounded-full bg-gold-600">
                  <Text className="text-xs font-bold text-stone-950">
                    {c.contact_profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                  </Text>
                </View>
                <Text numberOfLines={1} className="flex-1 text-sm text-stone-300">
                  {c.contact_profile?.display_name ?? 'Don'}
                </Text>
                <Dropdown
                  open={menuOpen === c.id}
                  onClose={() => setMenuOpen(null)}
                  align="right"
                  trigger={
                    <Pressable
                      onPress={() => setMenuOpen(menuOpen === c.id ? null : c.id)}
                      style={{ padding: 4 }}
                      hitSlop={6}
                    >
                      <MoreVertical size={16} color="#78716c" />
                    </Pressable>
                  }
                >
                  <Pressable
                    onPress={() => handleRemoveContact(c.contact_user_id, contactName)}
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
            <Text className="px-3 py-8 text-center text-sm text-stone-600">
              No contacts yet. Invite a Don to get started.
            </Text>
          )}
        </View>

        {/* Invite Button */}
        <Pressable
          onPress={() => setShowInvite(true)}
          className="mt-4 flex-row items-center justify-center gap-2 rounded-lg bg-gold-600 px-4 py-2.5"
        >
          <UserPlus size={16} color="#0c0a09" />
          <Text className="font-serif text-sm font-bold text-stone-950">Invite a Don</Text>
        </Pressable>
      </ScrollView>

      <InviteToCommissionModal
        visible={showInvite}
        onClose={() => setShowInvite(false)}
      />
    </View>
  );
}
