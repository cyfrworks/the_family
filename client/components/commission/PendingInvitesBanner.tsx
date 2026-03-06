import { View, Text, Pressable, Alert } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { showToast } from '../../lib/toast';
import type { CommissionContact } from '../../lib/types';

interface PendingInvitesBannerProps {
  invites: CommissionContact[];
  onAccept: (contactId: string) => Promise<unknown>;
  onDecline: (contactId: string) => Promise<unknown>;
}

export function PendingInvitesBanner({ invites, onAccept, onDecline }: PendingInvitesBannerProps) {
  if (invites.length === 0) return null;

  function handleDecline(invite: CommissionContact) {
    const inviterName = invite.profile?.display_name ?? 'this Don';
    Alert.alert(
      'Decline Invitation',
      `Are you sure you want to decline the invitation from ${inviterName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await onDecline(invite.id);
              showToast({ type: 'success', text1: 'Invitation declined.' });
            } catch {
              showToast({ type: 'error', text1: "Couldn't decline the invite." });
            }
          },
        },
      ],
    );
  }

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
                  showToast({ type: 'success', text1: 'Welcome to The Commission.' });
                } catch {
                  showToast({ type: 'error', text1: "Couldn't accept the invite." });
                }
              }}
              className="flex-row items-center gap-1 rounded bg-gold-600 px-2 py-0.5"
            >
              <Check size={10} color="#0c0a09" />
              <Text className="text-[11px] font-semibold text-stone-950">Accept</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDecline(invite)}
              className="flex-row items-center gap-1 rounded border border-stone-700 px-2 py-0.5"
            >
              <X size={10} color="#a8a29e" />
              <Text className="text-[11px] text-stone-400">Decline</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
