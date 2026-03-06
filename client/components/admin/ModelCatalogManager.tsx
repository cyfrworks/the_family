import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader } from 'lucide-react-native';
import { cyfrCall } from '../../lib/cyfr';
import { getAccessToken } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { useModels } from '../../hooks/useModels';
import { PROVIDER_LABELS, PROVIDER_COLORS } from '../../config/constants';
import { AddModelModal } from './AddModelModal';
import type { CatalogModel, Provider } from '../../lib/types';
import { toast } from '../../lib/toast';
import { confirmAlert } from '../../lib/alert';
import { Dropdown } from '../ui/Dropdown';

const ADMIN_API_REF = 'formula:local.admin-api:0.1.0';

function EditRow({ entry, onSaved, onCancel }: { entry: CatalogModel; onSaved: () => void; onCancel: () => void }) {
  const { models, loading: modelsLoading } = useModels();
  const [alias, setAlias] = useState(entry.alias);
  const [model, setModel] = useState(entry.model);
  const [minTier, setMinTier] = useState(entry.min_tier);
  const [sortOrder, setSortOrder] = useState(String(entry.sort_order));
  const [saving, setSaving] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showTierPicker, setShowTierPicker] = useState(false);

  const providerModels = models[entry.provider as Provider] ?? [];
  const modelOptions = providerModels.includes(entry.model)
    ? providerModels
    : [entry.model, ...providerModels];

  async function save() {
    setSaving(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: ADMIN_API_REF,
        input: {
          action: 'catalog_update',
          access_token: accessToken,
          catalog_id: entry.id,
          catalog_updates: { alias, model, min_tier: minTier, sort_order: parseInt(sortOrder) || 0 },
        },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      toast.success('Catalog entry updated.');
      onSaved();
    } catch {
      toast.error('Failed to update entry.');
    }
    setSaving(false);
  }

  return (
    <View className="gap-3 rounded-lg border border-gold-600/50 bg-stone-800/50 p-4">
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="mb-1 text-xs text-stone-400">Alias</Text>
          <TextInput
            value={alias}
            onChangeText={setAlias}
            className="rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100"
          />
        </View>
        <View className="flex-1">
          <Text className="mb-1 text-xs text-stone-400">Model ID</Text>
          {modelsLoading ? (
            <View className="flex-row items-center gap-1.5 px-2 py-1.5">
              <ActivityIndicator size="small" color="#78716c" />
              <Text className="text-xs text-stone-500">Loading...</Text>
            </View>
          ) : (
            <Dropdown
              open={showModelPicker}
              onClose={() => setShowModelPicker(false)}
              maxHeight={192}
              trigger={
                <Pressable
                  onPress={() => {
                    setShowTierPicker(false);
                    setShowModelPicker(!showModelPicker);
                  }}
                  className="rounded border border-stone-700 bg-stone-800 px-2 py-1.5"
                >
                  <Text className="text-sm text-stone-100" numberOfLines={1}>{model}</Text>
                </Pressable>
              }
            >
              {modelOptions.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => { setModel(m); setShowModelPicker(false); }}
                  className={`px-2 py-2 ${m === model ? 'bg-stone-700' : ''}`}
                >
                  <Text className="text-sm text-stone-100" numberOfLines={1}>{m}</Text>
                </Pressable>
              ))}
            </Dropdown>
          )}
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="mb-1 text-xs text-stone-400">Min Tier</Text>
          <Dropdown
            open={showTierPicker}
            onClose={() => setShowTierPicker(false)}
            trigger={
              <Pressable
                onPress={() => {
                  setShowModelPicker(false);
                  setShowTierPicker(!showTierPicker);
                }}
                className="rounded border border-stone-700 bg-stone-800 px-2 py-1.5"
              >
                <Text className="text-sm text-stone-100">
                  {minTier === 'boss' ? 'Boss+' : 'Associate (everyone)'}
                </Text>
              </Pressable>
            }
          >
            <Pressable
              onPress={() => { setMinTier('associate'); setShowTierPicker(false); }}
              className={`px-2 py-2 ${minTier === 'associate' ? 'bg-stone-700' : ''}`}
            >
              <Text className="text-sm text-stone-100">Associate (everyone)</Text>
            </Pressable>
            <Pressable
              onPress={() => { setMinTier('boss'); setShowTierPicker(false); }}
              className={`px-2 py-2 ${minTier === 'boss' ? 'bg-stone-700' : ''}`}
            >
              <Text className="text-sm text-stone-100">Boss+</Text>
            </Pressable>
          </Dropdown>
        </View>
        <View className="flex-1">
          <Text className="mb-1 text-xs text-stone-400">Sort Order</Text>
          <TextInput
            value={sortOrder}
            onChangeText={setSortOrder}
            keyboardType="numeric"
            className="rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100"
          />
        </View>
      </View>
      <View className="flex-row justify-end gap-2">
        <Pressable onPress={onCancel} className="rounded border border-stone-700 px-3 py-1.5">
          <Text className="text-xs text-stone-300">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={saving}
          className={`rounded bg-gold-600 px-3 py-1.5 ${saving ? 'opacity-50' : ''}`}
        >
          <Text className="text-xs font-semibold text-stone-950">
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ModelCatalogManager() {
  const { user } = useAuth();
  const { catalogModels, loading, refetch } = useModelCatalog();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleAdd(data: { provider: Provider; alias: string; model: string; min_tier: 'boss' | 'associate'; sort_order: number }) {
    if (!user) return;

    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: ADMIN_API_REF,
      input: {
        action: 'catalog_add',
        access_token: accessToken,
        catalog_entry: data,
      },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    toast.success(`${PROVIDER_LABELS[data.provider]} / ${data.alias} added to catalog.`);
    setShowAdd(false);
    refetch();
  }

  async function toggleActive(entry: CatalogModel) {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: ADMIN_API_REF,
      input: {
        action: 'catalog_toggle',
        access_token: accessToken,
        catalog_id: entry.id,
      },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) return;

    refetch();
  }

  async function doDelete(entry: CatalogModel) {
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: ADMIN_API_REF,
        input: {
          action: 'catalog_delete',
          access_token: accessToken,
          catalog_id: entry.id,
        },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      toast.success('Catalog entry deleted.');
      refetch();
    } catch {
      toast.error('Failed to delete catalog entry.');
    }
  }

  async function deleteEntry(entry: CatalogModel) {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    let affectedCount = 0;
    try {
      const preview = await cyfrCall('execution', {
        action: 'run',
        reference: ADMIN_API_REF,
        input: {
          action: 'catalog_delete_preview',
          access_token: accessToken,
          catalog_id: entry.id,
        },
        type: 'formula',
        timeout: 30000,
      });
      const previewRes = preview as Record<string, unknown> | null;
      affectedCount = (previewRes?.affected_member_count as number) ?? 0;
    } catch {
      // If preview fails, still allow deletion with generic message
    }

    const label = `${PROVIDER_LABELS[entry.provider]} / ${entry.alias}`;
    const msg = affectedCount > 0
      ? `Delete "${label}"? ${affectedCount} member${affectedCount !== 1 ? 's' : ''} will need a new model assigned.`
      : `Delete "${label}"?`;

    const confirmed = await confirmAlert('Delete Model', msg);
    if (confirmed) doDelete(entry);
  }

  if (loading) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator color="#78716c" />
        <Text className="mt-2 text-sm text-stone-500">Loading catalog...</Text>
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-stone-400">
          {catalogModels.length} model{catalogModels.length !== 1 ? 's' : ''} in catalog
        </Text>
        <Pressable
          onPress={() => setShowAdd(true)}
          className="flex-row items-center gap-2 rounded-lg bg-gold-600 px-3 py-2"
        >
          <Plus size={16} color="#0c0a09" />
          <Text className="text-sm font-semibold text-stone-950">Add Model</Text>
        </Pressable>
      </View>

      {catalogModels.length === 0 ? (
        <View className="items-center py-8">
          <Text className="text-sm text-stone-500">
            No models in catalog. Add some for your Family.
          </Text>
        </View>
      ) : (
        <FlatList
          data={catalogModels}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item: entry }) => (
            <View>
              {editingId === entry.id ? (
                <EditRow
                  entry={entry}
                  onSaved={() => {
                    setEditingId(null);
                    refetch();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <View
                  className={`flex-row items-center gap-3 rounded-lg border p-3 ${
                    entry.is_active
                      ? 'border-stone-800 bg-stone-900'
                      : 'border-stone-800/50 bg-stone-900/50 opacity-60'
                  }`}
                >
                  <View className={`rounded px-1.5 py-0.5 ${PROVIDER_COLORS[entry.provider]}`}>
                    <Text className="text-[10px] font-semibold text-white">
                      {PROVIDER_LABELS[entry.provider]}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="font-medium text-stone-100">{entry.alias}</Text>
                    <Text className="text-xs text-stone-500" numberOfLines={1}>{entry.model}</Text>
                  </View>
                  <View className={`rounded px-1.5 py-0.5 ${
                    entry.min_tier === 'boss' ? 'bg-stone-400' : 'bg-stone-700'
                  }`}>
                    <Text className={`text-[10px] font-semibold ${
                      entry.min_tier === 'boss' ? 'text-stone-950' : 'text-stone-300'
                    }`}>
                      {entry.min_tier === 'boss' ? 'Boss+' : 'All'}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Pressable
                      onPress={() => toggleActive(entry)}
                      className="rounded p-1.5"
                    >
                      {entry.is_active ? (
                        <ToggleRight size={16} color="#22c55e" />
                      ) : (
                        <ToggleLeft size={16} color="#78716c" />
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => setEditingId(entry.id)}
                      className="rounded p-1.5"
                    >
                      <Pencil size={14} color="#78716c" />
                    </Pressable>
                    <Pressable
                      onPress={() => deleteEntry(entry)}
                      className="rounded p-1.5"
                    >
                      <Trash2 size={14} color="#78716c" />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        />
      )}

      <AddModelModal
        visible={showAdd}
        onAdd={handleAdd}
        onClose={() => setShowAdd(false)}
      />
    </View>
  );
}
