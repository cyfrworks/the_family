import { useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { Plus, Copy, Check } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useMembers } from '../../hooks/useMembers';
import { useInformants } from '../../hooks/useInformants';
import { MemberCard } from '../../components/members/MemberCard';
import { MemberEditor } from '../../components/members/MemberEditor';
import { InformantCard } from '../../components/members/InformantCard';
import { InformantUsage } from '../../components/members/InformantUsage';
import type { Member } from '../../lib/types';
import { toast } from '../../lib/toast';
import { confirmAlert } from '../../lib/alert';
import { BackgroundWatermark } from '../../components/BackgroundWatermark';

export default function MembersScreen() {
  const { members, loading, createMember, updateMember, deleteMember } = useMembers();
  const { informants, loading: informantsLoading, createInformant, deleteInformant, regenerateToken } = useInformants();
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);

  // Informant creation state
  const [creatingInformant, setCreatingInformant] = useState(false);
  const [informantName, setInformantName] = useState('');
  const [informantEmoji, setInformantEmoji] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  async function handleDelete(member: Member) {
    const confirmed = await confirmAlert('Remove Member', `Remove ${member.name} from the Family?`);
    if (!confirmed) return;
    try {
      await deleteMember(member.id);
      toast.success(`${member.name} has left the Family.`);
    } catch {
      toast.error('They refused to go.');
    }
  }

  async function handleSave(data: { name: string; catalog_model_id: string; system_prompt: string }) {
    try {
      if (editing) {
        await updateMember(editing.id, data);
        toast.success(`${data.name} has new orders.`);
      } else {
        await createMember(data);
        toast.success(`${data.name} has joined the Family.`);
      }
      setEditing(null);
      setCreating(false);
    } catch {
      toast.error("Couldn't make it happen.");
    }
  }

  function handleClose() {
    setEditing(null);
    setCreating(false);
  }

  async function handleCreateInformant() {
    if (!informantName.trim()) return;
    try {
      const { token } = await createInformant(informantName.trim(), informantEmoji || undefined);
      setNewToken(token);
      toast.success(`${informantName} is now an informant.`);
    } catch {
      toast.error("Couldn't create the informant.");
    }
  }

  function handleCloseInformantModal() {
    setCreatingInformant(false);
    setInformantName('');
    setInformantEmoji('');
    setNewToken(null);
    setTokenCopied(false);
  }

  async function handleDeleteInformant(informant: Member) {
    const confirmed = await confirmAlert('Remove Informant', `Remove ${informant.name}? Their token will be invalidated.`);
    if (!confirmed) return;
    try {
      await deleteInformant(informant.id);
      toast.success(`${informant.name} has been silenced.`);
    } catch {
      toast.error("Couldn't remove the informant.");
    }
  }

  async function handleRegenerateToken(informant: Member) {
    const confirmed = await confirmAlert('Regenerate Token', `Generate a new token for ${informant.name}? The old token will stop working.`);
    if (!confirmed) return;
    try {
      const token = await regenerateToken(informant.id);
      setNewToken(token);
      setCreatingInformant(true);
      setInformantName(informant.name);
      toast.success('New token generated.');
    } catch {
      toast.error("Couldn't regenerate the token.");
    }
  }

  async function handleCopyToken() {
    if (newToken) {
      await Clipboard.setStringAsync(newToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  }

  return (
    <View className="flex-1 bg-stone-950">
      <BackgroundWatermark />
      <ScrollView className="mx-auto w-full max-w-4xl flex-1 p-6" contentContainerClassName="pb-12">
        {/* Header */}
        <View className="mb-8 flex-row items-center justify-between">
          <View>
            <Text className="font-serif text-3xl font-bold text-stone-100">Members</Text>
            <Text className="mt-1 text-sm text-stone-400">
              Your AI personas for sit-downs.
            </Text>
          </View>
          <Pressable
            onPress={() => setCreating(true)}
            className="flex-row items-center gap-2 rounded-lg bg-gold-600 px-4 py-2"
          >
            <Plus size={16} color="#0c0a09" />
            <Text className="text-sm font-semibold text-stone-950">Recruit</Text>
          </Pressable>
        </View>

        {/* AI Members List */}
        {loading ? (
          <View className="items-center justify-center py-12">
            <ActivityIndicator color="#78716c" />
            <Text className="mt-2 text-sm text-stone-500">Loading...</Text>
          </View>
        ) : members.length === 0 ? (
          <View className="items-center justify-center py-12">
            <Text className="text-sm text-stone-500">No members yet.</Text>
          </View>
        ) : (
          <View className="gap-2">
            {members.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onEdit={() => setEditing(member)}
                onDelete={() => handleDelete(member)}
              />
            ))}
          </View>
        )}

        {/* Informants Section */}
        <View className="mt-12 mb-6 flex-row items-center justify-between">
          <View>
            <Text className="font-serif text-2xl font-bold text-stone-100">Informants</Text>
            <Text className="mt-1 text-sm text-stone-400">
              External data pipelines feeding intel into sit-downs.
            </Text>
          </View>
          <Pressable
            onPress={() => setCreatingInformant(true)}
            className="flex-row items-center gap-2 rounded-lg bg-gold-600 px-4 py-2"
          >
            <Plus size={16} color="#0c0a09" />
            <Text className="text-sm font-semibold text-stone-950">Informant</Text>
          </Pressable>
        </View>

        {informantsLoading ? (
          <View className="items-center justify-center py-8">
            <ActivityIndicator color="#78716c" />
          </View>
        ) : informants.length === 0 ? (
          <View className="items-center justify-center rounded-lg border border-dashed border-stone-800 py-8">
            <Text className="text-sm text-stone-500">No informants yet.</Text>
            <Text className="mt-1 text-xs text-stone-600">
              Create one to feed external data into your sit-downs.
            </Text>
          </View>
        ) : (
          <>
            <View className="gap-2">
              {informants.map((informant) => (
                <InformantCard
                  key={informant.id}
                  informant={informant}
                  onDelete={() => handleDeleteInformant(informant)}
                  onRegenerate={() => handleRegenerateToken(informant)}
                />
              ))}
            </View>
            <InformantUsage />
          </>
        )}
      </ScrollView>

      {/* Member Editor Modal */}
      <MemberEditor
        visible={creating || editing !== null}
        member={editing}
        onSave={handleSave}
        onClose={handleClose}
      />

      {/* Informant Creator Modal */}
      {creatingInformant && (
        <View className="absolute inset-0 items-center justify-center bg-black/60 px-4">
          <View className="w-full max-w-md rounded-xl border border-stone-700 bg-stone-900 p-6">
            {newToken ? (
              // Token display (shown once)
              <>
                <Text className="mb-1 font-serif text-xl font-bold text-stone-100">
                  Informant Token
                </Text>
                <Text className="mb-4 text-xs text-stone-400">
                  Save this token now. Only the prefix is stored — the full token cannot be retrieved later.
                </Text>

                <View className="mb-4 rounded-lg border border-stone-700 bg-stone-800 p-3">
                  <Text className="font-mono text-xs leading-5 text-amber-400" selectable>
                    {newToken}
                  </Text>
                </View>
                <Pressable
                  onPress={handleCopyToken}
                  className="mb-4 flex-row items-center justify-center gap-2 rounded-lg border border-stone-600 bg-stone-800 py-2.5"
                >
                  {tokenCopied ? (
                    <>
                      <Check size={16} color="#22c55e" />
                      <Text className="text-sm font-medium text-green-500">Copied</Text>
                    </>
                  ) : (
                    <>
                      <Copy size={16} color="#d6d3d1" />
                      <Text className="text-sm font-medium text-stone-300">Copy Token</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={handleCloseInformantModal}
                  className="items-center rounded-lg bg-gold-600 py-2.5"
                >
                  <Text className="font-semibold text-stone-950">Done</Text>
                </Pressable>
              </>
            ) : (
              // Creation form
              <>
                <Text className="mb-4 font-serif text-xl font-bold text-stone-100">
                  New Informant
                </Text>

                <Text className="mb-1 text-xs text-stone-400">Name</Text>
                <TextInput
                  value={informantName}
                  onChangeText={setInformantName}
                  placeholder="e.g. Market Whisper"
                  placeholderTextColor="#57534e"
                  className="mb-3 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-sm text-stone-100"
                  autoFocus
                />

                <Text className="mb-1 text-xs text-stone-400">Avatar emoji (optional)</Text>
                <TextInput
                  value={informantEmoji}
                  onChangeText={setInformantEmoji}
                  placeholder="\u{1F50D}"
                  placeholderTextColor="#57534e"
                  className="mb-4 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-sm text-stone-100"
                  maxLength={2}
                />

                <View className="flex-row gap-3">
                  <Pressable
                    onPress={handleCloseInformantModal}
                    className="flex-1 items-center rounded-lg border border-stone-700 py-2.5"
                  >
                    <Text className="text-sm text-stone-400">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCreateInformant}
                    disabled={!informantName.trim()}
                    className={`flex-1 items-center rounded-lg py-2.5 ${informantName.trim() ? 'bg-gold-600' : 'bg-stone-700'}`}
                  >
                    <Text className={`text-sm font-semibold ${informantName.trim() ? 'text-stone-950' : 'text-stone-500'}`}>
                      Create
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
