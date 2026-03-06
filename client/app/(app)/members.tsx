import { useState } from 'react';
import { View, Text, Pressable, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Plus, LayoutGrid } from 'lucide-react-native';
import { useMembers } from '../../hooks/useMembers';
import { MemberCard } from '../../components/members/MemberCard';
import { MemberEditor } from '../../components/members/MemberEditor';
import { MemberTemplateSelector } from '../../components/members/MemberTemplateSelector';
import type { Member, MemberTemplate } from '../../lib/types';
import { toast } from '../../lib/toast';
import { BackgroundWatermark } from '../../components/BackgroundWatermark';

export default function MembersScreen() {
  const { members, loading, createMember, updateMember, deleteMember } = useMembers();
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [prefill, setPrefill] = useState<{ name: string; system_prompt: string } | undefined>();

  function handleTemplateSelect(template: MemberTemplate) {
    setShowTemplates(false);
    setPrefill({ name: template.name, system_prompt: template.system_prompt });
    setCreating(true);
  }

  function handleDelete(member: Member) {
    Alert.alert(
      'Remove Member',
      `Remove ${member.name} from the Family?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMember(member.id);
              toast.success(`${member.name} has left the Family.`);
            } catch {
              toast.error('They refused to go.');
            }
          },
        },
      ],
    );
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
      setPrefill(undefined);
    } catch {
      toast.error("Couldn't make it happen.");
    }
  }

  function handleClose() {
    setEditing(null);
    setCreating(false);
    setPrefill(undefined);
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
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setShowTemplates(true)}
              className="flex-row items-center gap-2 rounded-lg border border-stone-700 px-3 py-2"
            >
              <LayoutGrid size={16} color="#d6d3d1" />
              <Text className="text-sm text-stone-300">The Outfit</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setPrefill(undefined);
                setCreating(true);
              }}
              className="flex-row items-center gap-2 rounded-lg bg-gold-600 px-4 py-2"
            >
              <Plus size={16} color="#0c0a09" />
              <Text className="text-sm font-semibold text-stone-950">New Member</Text>
            </Pressable>
          </View>
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
        prefill={!editing ? prefill : undefined}
        onSave={handleSave}
        onClose={handleClose}
      />

      {/* Template Selector Modal */}
      <MemberTemplateSelector
        visible={showTemplates}
        onSelect={handleTemplateSelect}
        onClose={() => setShowTemplates(false)}
      />
    </View>
  );
}
