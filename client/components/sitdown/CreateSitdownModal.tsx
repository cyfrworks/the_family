import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { toast } from '../../lib/toast';
import type { SitDown } from '../../lib/types';

interface CreateSitdownModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  onCreate: (name: string, description?: string) => Promise<SitDown>;
}

export function CreateSitdownModal({ visible, onClose, onCreated, onCreate }: CreateSitdownModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const sitDown = await onCreate(name.trim(), description.trim() || undefined);
      setName('');
      setDescription('');
      onCreated(sitDown.id);
    } catch {
      toast.error("Couldn't arrange the sit-down.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setName('');
    setDescription('');
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
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
                Call a Sit-down
              </Text>
              <Pressable onPress={handleClose} className="p-1">
                <X size={20} color="#a8a29e" />
              </Pressable>
            </View>

            {/* Form */}
            <View className="p-5 gap-4">
              <View>
                <Text className="mb-1 text-sm font-medium text-stone-300">Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Strategy session, War council..."
                  placeholderTextColor="#57534e"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                  autoFocus
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
                  placeholder="What's this sit-down about?"
                  placeholderTextColor="#57534e"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                />
              </View>

              <View className="flex-row justify-end gap-2 pt-2">
                <Pressable
                  onPress={handleClose}
                  className="rounded-lg border border-stone-700 px-4 py-2.5"
                >
                  <Text className="text-sm text-stone-300">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={loading || !name.trim()}
                  className={`rounded-lg bg-gold-600 px-4 py-2.5 ${
                    loading || !name.trim() ? 'opacity-50' : ''
                  }`}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#0c0a09" />
                  ) : (
                    <Text className="text-sm font-semibold text-stone-950">Create</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
