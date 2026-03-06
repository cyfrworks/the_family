import { useState, useEffect } from 'react';
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
import { X, ChevronDown } from 'lucide-react-native';
import type { Provider } from '../../lib/types';
import { PROVIDER_LABELS } from '../../config/constants';
import { useModels } from '../../hooks/useModels';
import { Dropdown } from '../ui/Dropdown';

interface AddModelModalProps {
  visible: boolean;
  onAdd: (data: { provider: Provider; alias: string; model: string; min_tier: 'boss' | 'associate'; sort_order: number }) => Promise<void>;
  onClose: () => void;
}

export function AddModelModal({ visible, onAdd, onClose }: AddModelModalProps) {
  const { models, availableProviders, loading: modelsLoading, error: modelsError } = useModels();
  const [provider, setProvider] = useState<Provider>(availableProviders[0] ?? 'claude');
  const [model, setModel] = useState('');
  const [alias, setAlias] = useState('');
  const [minTier, setMinTier] = useState<'boss' | 'associate'>('associate');
  const [sortOrder, setSortOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showTierPicker, setShowTierPicker] = useState(false);

  const providerModels = models[provider] ?? [];
  const effectiveModel = model && providerModels.includes(model) ? model : providerModels[0] ?? '';

  useEffect(() => {
    if (effectiveModel !== model && effectiveModel) {
      setModel(effectiveModel);
    }
  }, [effectiveModel, model]);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setProvider(availableProviders[0] ?? 'claude');
      setModel('');
      setAlias('');
      setMinTier('associate');
      setSortOrder('0');
    }
  }, [visible, availableProviders]);

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(models[p]?.[0] ?? '');
    setShowProviderPicker(false);
  }

  function closeAllPickers() {
    setShowProviderPicker(false);
    setShowModelPicker(false);
    setShowTierPicker(false);
  }

  async function handleSubmit() {
    if (!alias.trim() || !effectiveModel) return;
    setSaving(true);
    try {
      await onAdd({ provider, alias: alias.trim(), model: effectiveModel, min_tier: minTier, sort_order: parseInt(sortOrder) || 0 });
    } finally {
      setSaving(false);
    }
  }

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
            onPress={closeAllPickers}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-stone-800 px-5 py-4">
              <Text className="font-serif text-lg font-bold text-stone-100">
                Add Model to Catalog
              </Text>
              <Pressable onPress={onClose} className="p-1">
                <X size={20} color="#a8a29e" />
              </Pressable>
            </View>

            {/* Form */}
            <ScrollView keyboardShouldPersistTaps="handled">
              <View className="p-5 gap-4">
                {modelsLoading ? (
                  <View className="flex-row items-center gap-2 py-2">
                    <ActivityIndicator size="small" color="#a8a29e" />
                    <Text className="text-sm text-stone-400">Discovering models from API keys...</Text>
                  </View>
                ) : modelsError || availableProviders.length === 0 ? (
                  <View className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2">
                    <Text className="text-sm text-red-300">
                      {modelsError ?? 'No AI providers configured. Add API keys first.'}
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Provider & Model */}
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <Text className="mb-1 text-sm font-medium text-stone-300">Provider</Text>
                        <Dropdown
                          open={showProviderPicker}
                          onClose={() => setShowProviderPicker(false)}
                          trigger={
                            <Pressable
                              onPress={() => {
                                setShowModelPicker(false);
                                setShowTierPicker(false);
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

                      <View className="flex-1">
                        <Text className="mb-1 text-sm font-medium text-stone-300">Model ID</Text>
                        <Dropdown
                          open={showModelPicker}
                          onClose={() => setShowModelPicker(false)}
                          maxHeight={192}
                          trigger={
                            <Pressable
                              onPress={() => {
                                setShowProviderPicker(false);
                                setShowTierPicker(false);
                                setShowModelPicker(!showModelPicker);
                              }}
                              className="flex-row items-center justify-between rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5"
                            >
                              <Text className="flex-1 text-sm text-stone-100" numberOfLines={1}>
                                {effectiveModel || 'Select'}
                              </Text>
                              <ChevronDown size={16} color="#a8a29e" />
                            </Pressable>
                          }
                        >
                          {providerModels.map((m) => (
                            <Pressable
                              key={m}
                              onPress={() => { setModel(m); setShowModelPicker(false); }}
                              className={`px-3 py-2.5 ${m === effectiveModel ? 'bg-stone-700' : ''}`}
                            >
                              <Text className="text-sm text-stone-100" numberOfLines={1}>{m}</Text>
                            </Pressable>
                          ))}
                        </Dropdown>
                      </View>
                    </View>

                    {/* Alias */}
                    <View>
                      <Text className="mb-1 text-sm font-medium text-stone-300">
                        Alias <Text className="text-stone-500">(what users see)</Text>
                      </Text>
                      <TextInput
                        value={alias}
                        onChangeText={setAlias}
                        placeholder='e.g. "Sonnet", "Pro", "Fast"'
                        placeholderTextColor="#57534e"
                        className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                      />
                    </View>

                    {/* Min Tier & Sort Order */}
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <Text className="mb-1 text-sm font-medium text-stone-300">Min Tier</Text>
                        <Dropdown
                          open={showTierPicker}
                          onClose={() => setShowTierPicker(false)}
                          trigger={
                            <Pressable
                              onPress={() => {
                                setShowProviderPicker(false);
                                setShowModelPicker(false);
                                setShowTierPicker(!showTierPicker);
                              }}
                              className="flex-row items-center justify-between rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5"
                            >
                              <Text className="text-sm text-stone-100">
                                {minTier === 'boss' ? 'Boss (Boss + Godfather)' : 'Associate (everyone)'}
                              </Text>
                              <ChevronDown size={16} color="#a8a29e" />
                            </Pressable>
                          }
                        >
                          <Pressable
                            onPress={() => { setMinTier('associate'); setShowTierPicker(false); }}
                            className={`px-3 py-2.5 ${minTier === 'associate' ? 'bg-stone-700' : ''}`}
                          >
                            <Text className="text-sm text-stone-100">Associate (everyone)</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => { setMinTier('boss'); setShowTierPicker(false); }}
                            className={`px-3 py-2.5 ${minTier === 'boss' ? 'bg-stone-700' : ''}`}
                          >
                            <Text className="text-sm text-stone-100">Boss (Boss + Godfather)</Text>
                          </Pressable>
                        </Dropdown>
                      </View>
                      <View className="flex-1">
                        <Text className="mb-1 text-sm font-medium text-stone-300">Sort Order</Text>
                        <TextInput
                          value={sortOrder}
                          onChangeText={setSortOrder}
                          keyboardType="numeric"
                          className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                        />
                      </View>
                    </View>
                  </>
                )}

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
                    disabled={saving || modelsLoading || availableProviders.length === 0 || !alias.trim()}
                    className={`rounded-lg bg-gold-600 px-4 py-2.5 ${
                      saving || modelsLoading || availableProviders.length === 0 || !alias.trim() ? 'opacity-50' : ''
                    }`}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#0c0a09" />
                    ) : (
                      <Text className="text-sm font-semibold text-stone-950">Add to Catalog</Text>
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
