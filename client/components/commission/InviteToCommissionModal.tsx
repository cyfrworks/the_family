import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { X } from 'lucide-react-native';
import { showToast } from '../../lib/toast';
import { useCommission } from '../../hooks/useCommission';

interface InviteToCommissionModalProps {
  visible: boolean;
  onClose: () => void;
}

export function InviteToCommissionModal({ visible, onClose }: InviteToCommissionModalProps) {
  const { inviteByEmail } = useCommission();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  function resetForm() {
    setEmail('');
    setLoading(false);
    setInlineError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    if (!email.trim()) return;
    setInlineError(null);
    setLoading(true);
    try {
      await inviteByEmail(email.trim());
      showToast({ type: 'success', text1: 'Word has been sent.' });
      handleClose();
    } catch (err: unknown) {
      console.warn('Commission invite error:', err);

      // Build a searchable string from every possible error shape:
      // - err.message (plain or JSON-encoded)
      // - JSON.stringify of the whole error (catches CyfrError.code + message)
      // - String fallback
      let raw = err instanceof Error ? err.message : String(err);

      // err.message may itself be a JSON string from CYFR -- try to unwrap it
      try {
        const parsed = JSON.parse(raw);
        raw = parsed.message ?? parsed.error?.message ?? parsed.error ?? raw;
        if (typeof raw !== 'string') raw = JSON.stringify(raw);
      } catch {
        // not JSON, keep raw as-is
      }

      const upper = raw.toUpperCase();

      if (upper.includes('ALREADY_CONNECTED')) {
        setInlineError("They're already in The Commission.");
      } else if (
        upper.includes('ALREADY_PENDING') ||
        upper.includes('UNIQUE CONSTRAINT') ||
        upper.includes('DUPLICATE KEY')
      ) {
        setInlineError("Word's already been sent. They haven't responded yet.");
      } else if (upper.includes('USER_NOT_FOUND')) {
        setInlineError('No one in the underworld goes by that name.');
      } else if (upper.includes('CANNOT_INVITE_SELF')) {
        setInlineError("You can't invite yourself, Don.");
      } else {
        console.warn('Unrecognized invite error format:', raw);
        setInlineError("Couldn't send word.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View className="flex-1 items-center justify-center bg-black/60 px-4">
        <View className="w-full max-w-md rounded-xl border border-stone-800 bg-stone-900">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-stone-800 px-5 py-4">
            <Text className="font-serif text-lg font-bold text-stone-100">
              Invite a Don
            </Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <X size={20} color="#a8a29e" />
            </Pressable>
          </View>

          {/* Form body */}
          <View className="p-5 gap-4">
            <View>
              <Text className="mb-1 text-sm font-medium text-stone-300">Email</Text>
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setInlineError(null);
                }}
                placeholder="their.email@example.com"
                placeholderTextColor="#78716c"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className={`w-full rounded-lg border bg-stone-800 px-3 py-2 text-stone-100 ${
                  inlineError ? 'border-red-500' : 'border-stone-700'
                }`}
              />
              {inlineError ? (
                <Text className="mt-1.5 text-xs text-red-400">{inlineError}</Text>
              ) : (
                <Text className="mt-1.5 text-xs text-stone-500">
                  They must already have an account in The Family.
                </Text>
              )}
            </View>

            <View className="flex-row justify-end gap-2 pt-2">
              <Pressable
                onPress={handleClose}
                className="rounded-lg border border-stone-700 px-4 py-2"
              >
                <Text className="text-sm text-stone-300">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={loading || !email.trim()}
                className={`rounded-lg bg-gold-600 px-4 py-2 ${
                  loading || !email.trim() ? 'opacity-50' : ''
                }`}
              >
                {loading ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#0c0a09" />
                    <Text className="text-sm font-semibold text-stone-950">Sending word...</Text>
                  </View>
                ) : (
                  <Text className="text-sm font-semibold text-stone-950">Send Word</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
