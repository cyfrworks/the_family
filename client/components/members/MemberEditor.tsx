import { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { X, ChevronDown, AlertTriangle } from 'lucide-react-native';
import type { Provider, Member } from '../../lib/types';
import { PROVIDER_LABELS } from '../../config/constants';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { Dropdown } from '../ui/Dropdown';

interface MemberEditorProps {
  visible: boolean;
  member: Member | null;
  prefill?: { name: string; system_prompt: string };
  onSave: (data: { name: string; catalog_model_id: string; system_prompt: string }) => Promise<void>;
  onClose: () => void;
}

export function MemberEditor({ visible, member, prefill, onSave, onClose }: MemberEditorProps) {
  const { modelsByProvider, availableProviders, loading: catalogLoading, error: catalogError, refetch: refetchCatalog } = useModelCatalog();

  // Keep track of whether we're editing so the title doesn't flash during close animation
  const isEditing = useRef(false);
  if (visible) isEditing.current = !!member;

  const initialProvider = member?.catalog_model?.provider ?? availableProviders[0] ?? 'claude';
  const [name, setName] = useState(member?.name ?? prefill?.name ?? '');
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const [catalogModelId, setCatalogModelId] = useState(member?.catalog_model_id ?? '');
  const [systemPrompt, setSystemPrompt] = useState(member?.system_prompt ?? prefill?.system_prompt ?? '');
  const [saving, setSaving] = useState(false);

  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  const providerModels = modelsByProvider[provider] ?? [];

  const effectiveCatalogModelId = catalogModelId && providerModels.some((a) => a.id === catalogModelId)
    ? catalogModelId
    : providerModels[0]?.id ?? '';

  useEffect(() => {
    if (effectiveCatalogModelId !== catalogModelId && effectiveCatalogModelId) {
      setCatalogModelId(effectiveCatalogModelId);
    }
  }, [effectiveCatalogModelId, catalogModelId]);

  // Refresh catalog and reset form when modal opens
  const prevVisible = useRef(false);
  useEffect(() => {
    if (visible && !prevVisible.current) {
      refetchCatalog();
      setName(member?.name ?? prefill?.name ?? '');
      setProvider(member?.catalog_model?.provider ?? availableProviders[0] ?? 'claude');
      setCatalogModelId(member?.catalog_model_id ?? '');
      setSystemPrompt(member?.system_prompt ?? prefill?.system_prompt ?? '');
    }
    prevVisible.current = visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setCatalogModelId(modelsByProvider[p]?.[0]?.id ?? '');
    setShowProviderPicker(false);
  }

  function handleModelChange(id: string) {
    setCatalogModelId(id);
    setShowModelPicker(false);
  }

  async function handleSubmit() {
    if (!name.trim() || !effectiveCatalogModelId) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), catalog_model_id: effectiveCatalogModelId, system_prompt: systemPrompt });
    } finally {
      setSaving(false);
    }
  }

  const selectedModelAlias = providerModels.find((m) => m.id === effectiveCatalogModelId)?.alias ?? 'Select model';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/60 p-4"
          onPress={onClose}
        >
          <Pressable
            className="w-full max-w-lg rounded-xl border border-stone-800 bg-stone-900"
            onPress={() => {
              setShowProviderPicker(false);
              setShowModelPicker(false);
            }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-stone-800 px-5 py-4">
              <Text className="font-serif text-lg font-bold text-stone-100">
                {isEditing.current ? 'Edit Member' : 'Create Member'}
              </Text>
              <Pressable onPress={onClose} className="p-1">
                <X size={20} color="#a8a29e" />
              </Pressable>
            </View>

            {/* Form */}
            <ScrollView className="max-h-[70vh]" keyboardShouldPersistTaps="handled">
              <View className="p-5 gap-4">
                {member && !member.catalog_model && (
                  <View className="flex-row items-center gap-1.5">
                    <AlertTriangle size={12} color="#d97706" />
                    <Text className="text-xs text-amber-500">Model removed — pick a new one</Text>
                  </View>
                )}

                {/* Name */}
                <View>
                  <Text className="mb-1 text-sm font-medium text-stone-300">Name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="The Consigliere"
                    placeholderTextColor="#57534e"
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                  />
                </View>

                {/* Provider & Model pickers */}
                {catalogLoading ? (
                  <View className="flex-row items-center gap-2 py-2">
                    <ActivityIndicator size="small" color="#a8a29e" />
                    <Text className="text-sm text-stone-400">Loading models...</Text>
                  </View>
                ) : catalogError || availableProviders.length === 0 ? (
                  <View className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2">
                    <Text className="text-sm text-red-300">
                      {catalogError ?? 'No models available. Ask your Godfather to add models to the catalog.'}
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row gap-3">
                    {/* Provider picker */}
                    <View className="flex-1">
                      <Text className="mb-1 text-sm font-medium text-stone-300">Provider</Text>
                      <Dropdown
                        open={showProviderPicker}
                        onClose={() => setShowProviderPicker(false)}
                        trigger={
                          <Pressable
                            onPress={() => {
                              setShowModelPicker(false);
                              setShowProviderPicker(!showProviderPicker);
                            }}
                            className="flex-row items-center justify-between rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5"
                          >
                            <Text className="text-sm text-stone-100">{PROVIDER_LABELS[provider]}</Text>
                            <ChevronDown size={16} color="#a8a29e" />
                          </Pressable>
                        }
                      >
                        {availableProviders.map((p) => (
                          <Pressable
                            key={p}
                            onPress={() => handleProviderChange(p)}
                            className={`px-3 py-2.5 ${p === provider ? 'bg-stone-700' : ''}`}
                          >
                            <Text className="text-sm text-stone-100">{PROVIDER_LABELS[p]}</Text>
                          </Pressable>
                        ))}
                      </Dropdown>
                    </View>

                    {/* Model picker */}
                    <View className="flex-1">
                      <Text className="mb-1 text-sm font-medium text-stone-300">Model</Text>
                      <Dropdown
                        open={showModelPicker}
                        onClose={() => setShowModelPicker(false)}
                        trigger={
                          <Pressable
                            onPress={() => {
                              setShowProviderPicker(false);
                              setShowModelPicker(!showModelPicker);
                            }}
                            className="flex-row items-center justify-between rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5"
                          >
                            <Text className="text-sm text-stone-100" numberOfLines={1}>
                              {selectedModelAlias}
                            </Text>
                            <ChevronDown size={16} color="#a8a29e" />
                          </Pressable>
                        }
                      >
                        {providerModels.map((m) => (
                          <Pressable
                            key={m.id}
                            onPress={() => handleModelChange(m.id)}
                            className={`px-3 py-2.5 ${m.id === effectiveCatalogModelId ? 'bg-stone-700' : ''}`}
                          >
                            <Text className="text-sm text-stone-100">{m.alias}</Text>
                          </Pressable>
                        ))}
                      </Dropdown>
                    </View>
                  </View>
                )}

                {/* System Prompt */}
                <View>
                  <Text className="mb-1 text-sm font-medium text-stone-300">System Prompt</Text>
                  <TextInput
                    value={systemPrompt}
                    onChangeText={setSystemPrompt}
                    placeholder="Describe this member's personality, speaking style, and expertise..."
                    placeholderTextColor="#57534e"
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                    style={{ minHeight: 140 }}
                  />
                </View>

                {/* Actions */}
                <View className="flex-row justify-end gap-2 pt-2">
                  <Pressable
                    onPress={onClose}
                    className="rounded-lg border border-stone-700 px-4 py-2.5"
                  >
                    <Text className="text-sm text-stone-300">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSubmit}
                    disabled={saving || catalogLoading || availableProviders.length === 0 || !name.trim()}
                    className={`rounded-lg bg-gold-600 px-4 py-2.5 ${
                      saving || catalogLoading || availableProviders.length === 0 || !name.trim() ? 'opacity-50' : ''
                    }`}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#0c0a09" />
                    ) : (
                      <Text className="text-sm font-semibold text-stone-950">
                        {isEditing.current ? 'Update' : 'Create'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
