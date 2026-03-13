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
import { X, ChevronDown, AlertTriangle, Plus, Trash2 } from 'lucide-react-native';
import type { Provider, Member, MemberType, SoldierType, SoldierConfig, SoldierSecret } from '../../lib/types';
import { PROVIDER_LABELS, MEMBER_TEMPLATES, CAPOREGIME_TEMPLATES, BOOKKEEPER_TEMPLATES, SOLDIER_TEMPLATES, MEMBER_TYPE_LABELS, MEMBER_TYPE_DESCRIPTIONS, SOLDIER_TYPE_LABELS, SOLDIER_TYPE_DESCRIPTIONS, EXTERNAL_SOLDIER_SYSTEM_PROMPT } from '../../config/constants';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { Dropdown } from '../ui/Dropdown';
import { EmojiPicker } from '../ui/EmojiPicker';

type CreatableMemberType = 'consul' | 'caporegime' | 'bookkeeper' | 'informant';

const DEFAULT_ROLE_EMOJI: Record<string, string> = {
  consul: '\u{1F3AD}',
  caporegime: '\u{1F44A}',
  bookkeeper: '\u{1F4DA}',
  informant: '\u{1F50D}',
  soldier: '\u{1F9E0}',
};

interface MemberEditorProps {
  visible: boolean;
  member: Member | null;
  onSave: (data: {
    name: string;
    catalog_model_id?: string;
    system_prompt: string;
    member_type?: MemberType;
    caporegime_id?: string;
    avatar_url?: string;
    soldier_type?: SoldierType;
    soldier_config?: SoldierConfig;
  }) => Promise<void>;
  onClose: () => void;
  /** Pre-set member type (e.g. for soldier creation) */
  forceMemberType?: MemberType;
  /** Pre-set caporegime_id for soldier creation */
  caporegimeId?: string;
}

export function MemberEditor({ visible, member, onSave, onClose, forceMemberType, caporegimeId }: MemberEditorProps) {
  const { modelsByProvider, availableProviders, loading: catalogLoading, error: catalogError, refetch: refetchCatalog } = useModelCatalog();

  const isEditing = useRef(false);
  if (visible) isEditing.current = !!member;

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);

  const initialProvider = member?.catalog_model?.provider ?? availableProviders[0] ?? 'claude';
  const [memberType, setMemberType] = useState<CreatableMemberType>(
    (forceMemberType as CreatableMemberType) ?? (member?.member_type as CreatableMemberType) ?? 'consul'
  );
  const [name, setName] = useState(member?.name ?? '');
  const initialRole = (forceMemberType as string) ?? (member?.member_type as string) ?? 'consul';
  const [avatarEmoji, setAvatarEmoji] = useState(member?.avatar_url ?? DEFAULT_ROLE_EMOJI[initialRole] ?? '');
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const [catalogModelId, setCatalogModelId] = useState(member?.catalog_model_id ?? '');
  const [systemPrompt, setSystemPrompt] = useState(member?.system_prompt ?? '');
  const [saving, setSaving] = useState(false);
  const [soldierType, setSoldierType] = useState<SoldierType>(member?.soldier_type ?? 'default');
  const [docsUrl, setDocsUrl] = useState(member?.soldier_config?.docs_url ?? '');
  const [secrets, setSecrets] = useState<SoldierSecret[]>(member?.soldier_config?.secrets ?? []);

  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSoldierTypePicker, setShowSoldierTypePicker] = useState(false);

  const providerModels = modelsByProvider[provider] ?? [];

  const effectiveCatalogModelId = catalogModelId && providerModels.some((a) => a.id === catalogModelId)
    ? catalogModelId
    : providerModels[0]?.id ?? '';

  useEffect(() => {
    if (effectiveCatalogModelId !== catalogModelId && effectiveCatalogModelId) {
      setCatalogModelId(effectiveCatalogModelId);
    }
  }, [effectiveCatalogModelId, catalogModelId]);

  const prevVisible = useRef(false);
  useEffect(() => {
    if (visible && !prevVisible.current) {
      refetchCatalog();
      setShowTemplatePicker(false);
      setShowRolePicker(false);
      const role = (forceMemberType as string) ?? (member?.member_type as string) ?? 'consul';
      setName(member?.name ?? '');
      setAvatarEmoji(member?.avatar_url ?? DEFAULT_ROLE_EMOJI[role] ?? '');
      setProvider(member?.catalog_model?.provider ?? availableProviders[0] ?? 'claude');
      setCatalogModelId(member?.catalog_model_id ?? '');
      setSystemPrompt(member?.system_prompt ?? '');
      setMemberType(
        (forceMemberType as CreatableMemberType) ?? (member?.member_type as CreatableMemberType) ?? 'consul'
      );
      setSoldierType(member?.soldier_type ?? 'default');
      setDocsUrl(member?.soldier_config?.docs_url ?? '');
      setSecrets(member?.soldier_config?.secrets ?? []);
      setShowSoldierTypePicker(false);
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

  const isInformant = (forceMemberType ?? memberType) === 'informant';
  const needsModel = !isInformant;

  // Get templates for current role
  const templates = forceMemberType === 'soldier'
    ? SOLDIER_TEMPLATES
    : memberType === 'caporegime'
      ? CAPOREGIME_TEMPLATES
      : memberType === 'bookkeeper'
        ? BOOKKEEPER_TEMPLATES
        : MEMBER_TEMPLATES;

  async function handleSubmit() {
    if (!name.trim()) return;
    if (needsModel && !effectiveCatalogModelId) return;

    setSaving(true);
    try {
      const data: {
        name: string;
        catalog_model_id?: string;
        system_prompt: string;
        member_type?: MemberType;
        caporegime_id?: string;
        avatar_url?: string;
        soldier_type?: SoldierType;
        soldier_config?: SoldierConfig;
      } = {
        name: name.trim(),
        system_prompt: systemPrompt,
        avatar_url: avatarEmoji || undefined,
      };

      if (needsModel && effectiveCatalogModelId) {
        data.catalog_model_id = effectiveCatalogModelId;
      }

      if (!isEditing.current) {
        data.member_type = forceMemberType ?? memberType;
        if (caporegimeId) {
          data.caporegime_id = caporegimeId;
        }
      }

      // Include soldier-specific fields
      const isSoldier = forceMemberType === 'soldier' || member?.member_type === 'soldier';
      if (isSoldier) {
        data.soldier_type = soldierType;
        if (soldierType === 'external') {
          const filteredSecrets = secrets.filter((s) => s.name.trim() && s.value.trim());
          data.soldier_config = {
            docs_url: docsUrl || undefined,
            secrets: filteredSecrets.length > 0 ? filteredSecrets : undefined,
          };
        }
      }

      await onSave(data);
    } finally {
      setSaving(false);
    }
  }

  const selectedModelAlias = providerModels.find((m) => m.id === effectiveCatalogModelId)?.alias ?? 'Select model';

  const roleOptions: CreatableMemberType[] = ['consul', 'caporegime', 'bookkeeper', 'informant'];

  const headerTitle = isEditing.current
    ? 'Reassign Member'
    : forceMemberType === 'soldier'
      ? 'Add Soldier'
      : isInformant
        ? 'New Informant'
        : 'Recruit Member';

  const submitDisabled = saving || !name.trim() || (needsModel && (catalogLoading || availableProviders.length === 0));

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
              setShowTemplatePicker(false);
              setShowRolePicker(false);
              setShowSoldierTypePicker(false);
            }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-stone-800 px-5 py-4">
              <Text className="font-serif text-lg font-bold text-stone-100">
                {headerTitle}
              </Text>
              <Pressable onPress={onClose} className="p-1">
                <X size={20} color="#a8a29e" />
              </Pressable>
            </View>

            {/* Form */}
            <ScrollView className="max-h-[70vh]" keyboardShouldPersistTaps="handled">
              <View className="p-5 gap-4">
                {member && !member.catalog_model && !isInformant && (
                  <View className="flex-row items-center gap-1.5">
                    <AlertTriangle size={12} color="#d97706" />
                    <Text className="text-xs text-amber-500">Model removed — pick a new one</Text>
                  </View>
                )}

                {/* Role picker (create only, not for soldier) */}
                {!isEditing.current && !forceMemberType && (
                  <View>
                    <Text className="mb-1 text-sm font-medium text-stone-300">Role</Text>
                    <Dropdown
                      open={showRolePicker}
                      onClose={() => setShowRolePicker(false)}
                      trigger={
                        <Pressable
                          onPress={() => {
                            setShowProviderPicker(false);
                            setShowModelPicker(false);
                            setShowTemplatePicker(false);
                            setShowRolePicker(!showRolePicker);
                          }}
                          className="flex-row items-center justify-between rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5"
                        >
                          <Text className="text-sm text-stone-100">{MEMBER_TYPE_LABELS[memberType]}</Text>
                          <ChevronDown size={16} color="#a8a29e" />
                        </Pressable>
                      }
                    >
                      {roleOptions.map((r) => (
                        <Pressable
                          key={r}
                          onPress={() => {
                            setMemberType(r);
                            // Update emoji to new role default if current is a role default or empty
                            const isDefault = !avatarEmoji || Object.values(DEFAULT_ROLE_EMOJI).includes(avatarEmoji);
                            if (isDefault) setAvatarEmoji(DEFAULT_ROLE_EMOJI[r] ?? '');
                            setShowRolePicker(false);
                          }}
                          className={`px-3 py-2.5 ${r === memberType ? 'bg-stone-700' : ''}`}
                        >
                          <Text className="text-sm text-stone-100">{MEMBER_TYPE_LABELS[r]}</Text>
                          <Text className="text-xs text-stone-500">{MEMBER_TYPE_DESCRIPTIONS[r]}</Text>
                        </Pressable>
                      ))}
                    </Dropdown>
                  </View>
                )}

                {/* Template (create only, not for informant) */}
                {!isEditing.current && !isInformant && (
                  <View>
                    <Text className="mb-1 text-sm font-medium text-stone-300">Template</Text>
                    <Dropdown
                      open={showTemplatePicker}
                      onClose={() => setShowTemplatePicker(false)}
                      trigger={
                        <Pressable
                          onPress={() => {
                            setShowProviderPicker(false);
                            setShowModelPicker(false);
                            setShowRolePicker(false);
                            setShowTemplatePicker(!showTemplatePicker);
                          }}
                          className="flex-row items-center justify-between rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5"
                        >
                          <Text className="text-sm text-stone-400">Pick a persona to prefill...</Text>
                          <ChevronDown size={16} color="#a8a29e" />
                        </Pressable>
                      }
                    >
                      {templates.map((t) => (
                        <Pressable
                          key={t.slug}
                          onPress={() => {
                            setName(t.name);
                            setAvatarEmoji(t.avatar_emoji);
                            setSystemPrompt(t.system_prompt === 'EXTERNAL_SOLDIER' ? EXTERNAL_SOLDIER_SYSTEM_PROMPT : t.system_prompt);
                            if (t.slug === 'agente-esterno') setSoldierType('external');
                            setShowTemplatePicker(false);
                          }}
                          className="flex-row items-center gap-2.5 px-3 py-2.5"
                        >
                          <Text className="text-base">{t.avatar_emoji}</Text>
                          <View className="flex-1">
                            <Text className="text-sm text-stone-100">{t.name}</Text>
                            <Text className="text-xs text-stone-500" numberOfLines={1}>{t.description}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </Dropdown>
                  </View>
                )}

                {/* Soldier Type (soldier creation/edit only) */}
                {(forceMemberType === 'soldier' || member?.member_type === 'soldier') && (
                  <View>
                    <Text className="mb-1 text-sm font-medium text-stone-300">Soldier Type</Text>
                    <Dropdown
                      open={showSoldierTypePicker}
                      onClose={() => setShowSoldierTypePicker(false)}
                      trigger={
                        <Pressable
                          onPress={() => {
                            setShowProviderPicker(false);
                            setShowModelPicker(false);
                            setShowTemplatePicker(false);
                            setShowRolePicker(false);
                            setShowSoldierTypePicker(!showSoldierTypePicker);
                          }}
                          className="flex-row items-center justify-between rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5"
                        >
                          <Text className="text-sm text-stone-100">{SOLDIER_TYPE_LABELS[soldierType]}</Text>
                          <ChevronDown size={16} color="#a8a29e" />
                        </Pressable>
                      }
                    >
                      {(['default', 'external'] as SoldierType[]).map((st) => (
                        <Pressable
                          key={st}
                          onPress={() => {
                            setSoldierType(st);
                            // Auto-fill system prompt when switching to external
                            if (st === 'external' && !systemPrompt.trim()) {
                              setSystemPrompt(EXTERNAL_SOLDIER_SYSTEM_PROMPT);
                            }
                            setShowSoldierTypePicker(false);
                          }}
                          className={`px-3 py-2.5 ${st === soldierType ? 'bg-stone-700' : ''}`}
                        >
                          <Text className="text-sm text-stone-100">{SOLDIER_TYPE_LABELS[st]}</Text>
                          <Text className="text-xs text-stone-500">{SOLDIER_TYPE_DESCRIPTIONS[st]}</Text>
                        </Pressable>
                      ))}
                    </Dropdown>
                  </View>
                )}

                {/* External Soldier Config */}
                {(forceMemberType === 'soldier' || member?.member_type === 'soldier') && soldierType === 'external' && (
                  <View className="gap-3 rounded-lg border border-stone-700/50 bg-stone-800/30 p-3">
                    <Text className="text-xs font-medium text-stone-400">API Configuration</Text>
                    <View>
                      <Text className="mb-1 text-xs text-stone-400">Documentation URL</Text>
                      <TextInput
                        value={docsUrl}
                        onChangeText={setDocsUrl}
                        placeholder="https://api.example.com/docs or OpenAPI spec URL"
                        placeholderTextColor="#57534e"
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100"
                      />
                      <Text className="mt-1 text-xs text-stone-500">Fetched and included in the soldier's context</Text>
                    </View>

                    {/* Dynamic secrets */}
                    <View className="gap-2">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs text-stone-400">Secrets</Text>
                        <Pressable
                          onPress={() => setSecrets([...secrets, { name: '', value: '' }])}
                          className="flex-row items-center gap-1 rounded px-2 py-1"
                        >
                          <Plus size={12} color="#a8a29e" />
                          <Text className="text-xs text-stone-400">Add</Text>
                        </Pressable>
                      </View>
                      {secrets.map((secret, i) => (
                        <View key={i} className="flex-row items-center gap-2">
                          <TextInput
                            value={secret.name}
                            onChangeText={(text) => {
                              const updated = [...secrets];
                              updated[i] = { ...updated[i], name: text };
                              setSecrets(updated);
                            }}
                            placeholder="Name (e.g. API_KEY)"
                            placeholderTextColor="#57534e"
                            autoCapitalize="none"
                            autoCorrect={false}
                            className="flex-1 rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs text-stone-100"
                          />
                          <TextInput
                            value={secret.value}
                            onChangeText={(text) => {
                              const updated = [...secrets];
                              updated[i] = { ...updated[i], value: text };
                              setSecrets(updated);
                            }}
                            placeholder="Value"
                            placeholderTextColor="#57534e"
                            autoCapitalize="none"
                            autoCorrect={false}
                            secureTextEntry
                            className="flex-1 rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs text-stone-100"
                          />
                          <Pressable
                            onPress={() => setSecrets(secrets.filter((_, j) => j !== i))}
                            className="p-1"
                          >
                            <Trash2 size={14} color="#78716c" />
                          </Pressable>
                        </View>
                      ))}
                      {secrets.length === 0 && (
                        <Text className="text-xs text-stone-600">No secrets configured. Secrets are injected as headers in API calls.</Text>
                      )}
                    </View>
                  </View>
                )}

                {/* Name */}
                <View>
                  <Text className="mb-1 text-sm font-medium text-stone-300">Name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder={isInformant ? 'e.g. Market Whisper' : memberType === 'caporegime' ? 'The Captain' : memberType === 'bookkeeper' ? 'The Archivist' : 'The Consigliere'}
                    placeholderTextColor="#57534e"
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                  />
                </View>

                {/* Avatar Emoji */}
                <EmojiPicker value={avatarEmoji} onChange={setAvatarEmoji} />

                {/* Provider & Model pickers */}
                {needsModel && (
                  <>
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
                  </>
                )}

                {/* System Prompt */}
                {needsModel && (
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
                    disabled={submitDisabled}
                    className={`rounded-lg bg-gold-600 px-4 py-2.5 ${submitDisabled ? 'opacity-50' : ''}`}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#0c0a09" />
                    ) : (
                      <Text className="text-sm font-semibold text-stone-950">
                        {isEditing.current ? 'Reassign' : forceMemberType === 'soldier' ? 'Add' : 'Recruit'}
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
