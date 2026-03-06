import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react-native';
import { showToast } from '../../lib/toast';
import { useMembers } from '../../hooks/useMembers';
import { useCommission } from '../../hooks/useCommission';
import { useCommissionSitDowns } from '../../hooks/useCommissionSitDowns';
import { PROVIDER_COLORS } from '../../config/constants';

interface CreateCommissionSitDownModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function CreateCommissionSitDownModal({
  visible,
  onClose,
  onCreated,
}: CreateCommissionSitDownModalProps) {
  const { members: myMembers } = useMembers();
  const { contacts } = useCommission();
  const { createCommissionSitDown } = useCommissionSitDowns();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setStep(1);
    setName('');
    setDescription('');
    setSelectedMemberIds(new Set());
    setSelectedContactIds(new Set());
    setLoading(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleContact(id: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (selectedContactIds.size === 0) {
      showToast({ type: 'error', text1: 'Invite at least one Don to the sit-down.' });
      return;
    }
    setLoading(true);
    try {
      const sitDown = await createCommissionSitDown(
        name,
        description || undefined,
        Array.from(selectedMemberIds),
        Array.from(selectedContactIds),
      );
      resetForm();
      onCreated(sitDown.id);
    } catch {
      showToast({ type: 'error', text1: "Couldn't arrange the sit-down." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/60 p-4"
          onPress={handleClose}
        >
          <Pressable
            className="w-full max-w-md rounded-xl border border-stone-800 bg-stone-900"
            onPress={() => {}}
          >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-stone-800 px-5 py-4">
            <Text className="font-serif text-lg font-bold text-stone-100">
              Commission Sit-down
            </Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <X size={20} color="#a8a29e" />
            </Pressable>
          </View>

          {/* Step indicator */}
          <View className="flex-row items-center gap-1 px-5 pt-4">
            {[1, 2, 3].map((s) => (
              <View
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  s <= step ? 'bg-gold-600' : 'bg-stone-700'
                }`}
              />
            ))}
          </View>

          {/* Step 1: Name & Description */}
          {step === 1 && (
            <View className="p-5 gap-4">
              <View>
                <Text className="mb-1 text-sm font-medium text-stone-300">Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Joint venture, Territory talks..."
                  placeholderTextColor="#78716c"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100"
                />
              </View>
              <View>
                <Text className="mb-1 text-sm font-medium text-stone-300">
                  Description{' '}
                  <Text className="text-stone-500">(optional)</Text>
                </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What's on the table?"
                  placeholderTextColor="#78716c"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100"
                />
              </View>
              <View className="flex-row justify-end pt-2">
                <Pressable
                  onPress={() => {
                    if (name.trim()) setStep(2);
                  }}
                  disabled={!name.trim()}
                  className={`flex-row items-center gap-1 rounded-lg bg-gold-600 px-4 py-2 ${
                    !name.trim() ? 'opacity-50' : ''
                  }`}
                >
                  <Text className="text-sm font-semibold text-stone-950">Next</Text>
                  <ChevronRight size={16} color="#0c0a09" />
                </Pressable>
              </View>
            </View>
          )}

          {/* Step 2: Select Members */}
          {step === 2 && (
            <View className="p-5 gap-4">
              <View>
                <Text className="mb-2 text-sm font-medium text-stone-300">
                  Bring your Members to the table
                </Text>
                {myMembers.length === 0 ? (
                  <Text className="py-2 text-xs text-stone-500">
                    You don't have any Members yet. You can add them later.
                  </Text>
                ) : (
                  <ScrollView className="max-h-48" showsVerticalScrollIndicator={false}>
                    <View className="gap-1">
                      {myMembers.map((member) => {
                        const isSelected = selectedMemberIds.has(member.id);
                        return (
                          <Pressable
                            key={member.id}
                            onPress={() => toggleMember(member.id)}
                            className={`flex-row w-full items-center gap-2 rounded-lg border px-3 py-2 ${
                              isSelected
                                ? 'border-gold-600 bg-gold-600/10'
                                : 'border-stone-700'
                            }`}
                          >
                            <View
                              className={`h-6 w-6 items-center justify-center rounded ${
                                member.catalog_model
                                  ? PROVIDER_COLORS[member.catalog_model.provider]
                                  : 'bg-stone-600'
                              }`}
                            >
                              <Text className="text-[9px] font-bold text-white">
                                {member.catalog_model?.provider[0].toUpperCase() ?? '?'}
                              </Text>
                            </View>
                            <Text
                              className="flex-1 text-sm text-stone-300"
                              numberOfLines={1}
                            >
                              {member.name}
                            </Text>
                            {isSelected && <Check size={14} color="#f59e0b" />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </View>
              <View className="flex-row justify-between pt-2">
                <Pressable
                  onPress={() => setStep(1)}
                  className="flex-row items-center gap-1 rounded-lg border border-stone-700 px-4 py-2"
                >
                  <ChevronLeft size={16} color="#d6d3d1" />
                  <Text className="text-sm text-stone-300">Back</Text>
                </Pressable>
                <Pressable
                  onPress={() => setStep(3)}
                  className="flex-row items-center gap-1 rounded-lg bg-gold-600 px-4 py-2"
                >
                  <Text className="text-sm font-semibold text-stone-950">Next</Text>
                  <ChevronRight size={16} color="#0c0a09" />
                </Pressable>
              </View>
            </View>
          )}

          {/* Step 3: Select Contacts */}
          {step === 3 && (
            <View className="p-5 gap-4">
              <View>
                <Text className="mb-2 text-sm font-medium text-stone-300">
                  Invite Dons to the sit-down
                </Text>
                {contacts.length === 0 ? (
                  <Text className="py-2 text-xs text-stone-500">
                    No Commission contacts yet. Invite some Dons first.
                  </Text>
                ) : (
                  <ScrollView className="max-h-48" showsVerticalScrollIndicator={false}>
                    <View className="gap-1">
                      {contacts.map((contact) => {
                        const isSelected = selectedContactIds.has(contact.contact_user_id);
                        return (
                          <Pressable
                            key={contact.id}
                            onPress={() => toggleContact(contact.contact_user_id)}
                            className={`flex-row w-full items-center gap-2 rounded-lg border px-3 py-2 ${
                              isSelected
                                ? 'border-gold-600 bg-gold-600/10'
                                : 'border-stone-700'
                            }`}
                          >
                            <View className="h-6 w-6 items-center justify-center rounded-full bg-gold-600">
                              <Text className="text-[10px] font-bold text-stone-950">
                                {contact.contact_profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                              </Text>
                            </View>
                            <Text
                              className="flex-1 text-sm text-stone-300"
                              numberOfLines={1}
                            >
                              {contact.contact_profile?.display_name ?? 'Don'}
                            </Text>
                            {isSelected && <Check size={14} color="#f59e0b" />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </View>
              <View className="flex-row justify-between pt-2">
                <Pressable
                  onPress={() => setStep(2)}
                  className="flex-row items-center gap-1 rounded-lg border border-stone-700 px-4 py-2"
                >
                  <ChevronLeft size={16} color="#d6d3d1" />
                  <Text className="text-sm text-stone-300">Back</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={loading || selectedContactIds.size === 0}
                  className={`rounded-lg bg-gold-600 px-4 py-2 ${
                    loading || selectedContactIds.size === 0 ? 'opacity-50' : ''
                  }`}
                >
                  {loading ? (
                    <View className="flex-row items-center gap-2">
                      <ActivityIndicator size="small" color="#0c0a09" />
                      <Text className="text-sm font-semibold text-stone-950">Creating...</Text>
                    </View>
                  ) : (
                    <Text className="text-sm font-semibold text-stone-950">
                      Call the Sit-down
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
