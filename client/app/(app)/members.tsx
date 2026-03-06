import { useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useMembers } from '../../hooks/useMembers';
import { MemberCard } from '../../components/members/MemberCard';
import { MemberEditor } from '../../components/members/MemberEditor';
import type { Member } from '../../lib/types';
import { toast } from '../../lib/toast';
import { confirmAlert } from '../../lib/alert';
import { BackgroundWatermark } from '../../components/BackgroundWatermark';

export default function MembersScreen() {
  const { members, loading, createMember, updateMember, deleteMember } = useMembers();
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);

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

  return (
    <View className="flex-1 bg-stone-950">
      <BackgroundWatermark />
      <View className="mx-auto w-full max-w-4xl flex-1 p-6">
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

        {/* Content */}
        {loading ? (
          <View className="flex-1 items-center justify-center py-12">
            <ActivityIndicator color="#78716c" />
            <Text className="mt-2 text-sm text-stone-500">Loading...</Text>
          </View>
        ) : members.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <Text className="text-sm text-stone-500">No members yet.</Text>
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View className="h-2" />}
            contentContainerClassName="pb-6"
            renderItem={({ item: member }) => (
              <MemberCard
                member={member}
                onEdit={() => setEditing(member)}
                onDelete={() => handleDelete(member)}
              />
            )}
          />
        )}
      </View>

      {/* Member Editor Modal */}
      <MemberEditor
        visible={creating || editing !== null}
        member={editing}
        onSave={handleSave}
        onClose={handleClose}
      />
    </View>
  );
}
