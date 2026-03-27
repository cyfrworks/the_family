import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Plus, Copy, Check, Info } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useMembers } from '../../hooks/useMembers';
import { useInformants } from '../../hooks/useInformants';
import { MemberCard } from '../../components/members/MemberCard';
import { MemberEditor } from '../../components/members/MemberEditor';
import { CaporegimeCard } from '../../components/members/CaporegimeCard';
import { InformantCard } from '../../components/members/InformantCard';
import { InformantUsage } from '../../components/members/InformantUsage';
import { Dropdown } from '../../components/ui/Dropdown';
import { MEMBER_TYPE_DESCRIPTIONS } from '../../config/constants';
import type { Member, MemberType, SoldierType, SoldierConfig } from '../../lib/types';
import { toast } from '../../lib/toast';
import { confirmAlert } from '../../lib/alert';
import { BackgroundWatermark } from '../../components/BackgroundWatermark';

// ── Role tooltip (press-to-reveal description) ────────────────────────
function RoleTooltip({ role }: { role: string }) {
  const [show, setShow] = useState(false);
  const description = MEMBER_TYPE_DESCRIPTIONS[role];
  if (!description) return null;

  return (
    <Dropdown
      open={show}
      onClose={() => setShow(false)}
      align="right"
      trigger={
        <Pressable onPress={() => setShow((s) => !s)} hitSlop={8}>
          <Info size={12} color="#57534e" />
        </Pressable>
      }
    >
      <View className="px-2.5 py-1.5 w-48">
        <Text className="text-[11px] leading-tight text-stone-300">
          {description}
        </Text>
      </View>
    </Dropdown>
  );
}

export default function MembersScreen() {
  const { members, loading, createMember, updateMember, deleteMember, listCrew } = useMembers();
  const { informants, loading: informantsLoading, createInformant, deleteInformant, regenerateToken } = useInformants();
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [editorMemberType, setEditorMemberType] = useState<MemberType | undefined>(undefined);
  const [editorCaporegimeId, setEditorCaporegimeId] = useState<string | undefined>(undefined);

  // Crew state: caporegime_id -> soldiers
  const [crewMap, setCrewMap] = useState<Record<string, Member[]>>({});
  const [crewLoading, setCrewLoading] = useState<Record<string, boolean>>({});

  // Token display state
  const [creatingInformant, setCreatingInformant] = useState(false);
  const [informantName, setInformantName] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Categorize members
  const consuls = members.filter((m) => m.member_type === 'consul');
  const caporegimes = members.filter((m) => m.member_type === 'caporegime');
  const bookkeepers = members.filter((m) => m.member_type === 'bookkeeper');

  // Load crew for each caporegime
  const loadCrew = useCallback(async (capoId: string) => {
    setCrewLoading((prev) => ({ ...prev, [capoId]: true }));
    try {
      const soldiers = await listCrew(capoId);
      setCrewMap((prev) => ({ ...prev, [capoId]: soldiers }));
    } catch {
      // silent fail
    } finally {
      setCrewLoading((prev) => ({ ...prev, [capoId]: false }));
    }
  }, [listCrew]);

  useEffect(() => {
    for (const capo of caporegimes) {
      if (!crewMap[capo.id] && !crewLoading[capo.id]) {
        loadCrew(capo.id);
      }
    }
  }, [caporegimes, crewMap, crewLoading, loadCrew]);

  async function handleDelete(member: Member) {
    const label = member.member_type === 'caporegime' ? 'Caporegime' : member.member_type === 'bookkeeper' ? 'Bookkeeper' : 'Member';
    const confirmed = await confirmAlert(`Remove ${label}`, `Remove ${member.name} from the Family?`);
    if (!confirmed) return;
    try {
      await deleteMember(member.id);
      toast.success(`${member.name} has left the Family.`);
    } catch {
      toast.error('They refused to go.');
    }
  }

  async function handleSave(data: {
    name: string;
    catalog_model_id?: string;
    system_prompt: string;
    member_type?: MemberType;
    caporegime_id?: string;
    avatar_url?: string;
    soldier_type?: SoldierType;
    soldier_config?: SoldierConfig;
  }) {
    try {
      if (editing) {
        const updates: Record<string, unknown> = {
          name: data.name,
          catalog_model_id: data.catalog_model_id,
          system_prompt: data.system_prompt,
          avatar_url: data.avatar_url,
        };
        if (editing.member_type === 'soldier') {
          updates.soldier_type = data.soldier_type;
          updates.soldier_config = data.soldier_config;
        }
        await updateMember(editing.id, updates);
        // Reload crew if editing a soldier
        if (editing.caporegime_id) {
          loadCrew(editing.caporegime_id);
        }
        toast.success(`${data.name} has new orders.`);
      } else if (data.member_type === 'informant') {
        // Route informant creation through the informant hook
        const { token } = await createInformant(data.name, data.avatar_url);
        setNewToken(token);
        setInformantName(data.name);
        setCreatingInformant(true);
        toast.success(`${data.name} is now an informant.`);
      } else {
        await createMember(data);
        const label = data.member_type === 'soldier' ? 'soldier' : data.member_type === 'caporegime' ? 'captain' : 'member';
        toast.success(`${data.name} has joined the Family as ${label}.`);
        // Reload crew if we added a soldier
        if (data.caporegime_id) {
          loadCrew(data.caporegime_id);
        }
      }
      setEditing(null);
      setCreating(false);
      setEditorMemberType(undefined);
      setEditorCaporegimeId(undefined);
    } catch {
      toast.error("Couldn't make it happen.");
    }
  }

  function handleClose() {
    setEditing(null);
    setCreating(false);
    setEditorMemberType(undefined);
    setEditorCaporegimeId(undefined);
  }

  function handleCreateWithType(type?: MemberType) {
    setEditorMemberType(type);
    setEditorCaporegimeId(undefined);
    setCreating(true);
  }

  function handleAddSoldier(caporegimeId: string) {
    setEditorMemberType('soldier');
    setEditorCaporegimeId(caporegimeId);
    setCreating(true);
  }

  async function handleDeleteSoldier(soldier: Member) {
    const confirmed = await confirmAlert('Remove Soldier', `Remove ${soldier.name} from the crew?`);
    if (!confirmed) return;
    try {
      await deleteMember(soldier.id);
      toast.success(`${soldier.name} has been dismissed.`);
      if (soldier.caporegime_id) {
        loadCrew(soldier.caporegime_id);
      }
    } catch {
      toast.error("Couldn't remove the soldier.");
    }
  }

  function handleCloseInformantModal() {
    setCreatingInformant(false);
    setInformantName('');
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

  const isLoading = loading || informantsLoading;

  return (
    <View className="flex-1 bg-stone-950">
      <BackgroundWatermark />
      <ScrollView className="mx-auto w-full max-w-4xl flex-1 p-6" contentContainerClassName="pb-12">
        {/* Header */}
        <View className="mb-8 flex-row items-center justify-between">
          <View>
            <Text className="font-serif text-3xl font-bold text-stone-100">Members</Text>
            <Text className="mt-1 text-sm text-stone-400">
              Your family for sit-downs.
            </Text>
          </View>
          <Pressable
            onPress={() => handleCreateWithType()}
            className="flex-row items-center gap-2 rounded-lg bg-gold-600 px-4 py-2"
          >
            <Plus size={16} color="#0c0a09" />
            <Text className="text-sm font-semibold text-stone-950">Recruit</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View className="items-center justify-center py-12">
            <ActivityIndicator color="#78716c" />
            <Text className="mt-2 text-sm text-stone-500">Loading...</Text>
          </View>
        ) : (
          <>
            {/* Consuls Section */}
            {consuls.length > 0 && (
              <View className="mb-8">
                <View className="flex-row items-center gap-1.5 mb-2 px-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Consuls
                  </Text>
                  <RoleTooltip role="consul" />
                </View>
                <View className="gap-2">
                  {consuls.map((member) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      onEdit={() => setEditing(member)}
                      onDelete={() => handleDelete(member)}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Caporegimes Section */}
            {caporegimes.length > 0 && (
              <View className="mb-8">
                <View className="flex-row items-center gap-1.5 mb-2 px-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Caporegimes
                  </Text>
                  <RoleTooltip role="caporegime" />
                </View>
                <View className="gap-2">
                  {caporegimes.map((member) => (
                    <CaporegimeCard
                      key={member.id}
                      member={member}
                      onEdit={() => setEditing(member)}
                      onDelete={() => handleDelete(member)}
                      onAddSoldier={() => handleAddSoldier(member.id)}
                      onEditSoldier={(soldier) => setEditing(soldier)}
                      onDeleteSoldier={handleDeleteSoldier}
                      soldiers={crewMap[member.id] || []}
                      loadingSoldiers={crewLoading[member.id]}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Bookkeepers Section */}
            {bookkeepers.length > 0 && (
              <View className="mb-8">
                <View className="flex-row items-center gap-1.5 mb-2 px-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Bookkeepers
                  </Text>
                  <RoleTooltip role="bookkeeper" />
                </View>
                <View className="gap-2">
                  {bookkeepers.map((member) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      onEdit={() => setEditing(member)}
                      onDelete={() => handleDelete(member)}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Informants Section */}
            {informants.length > 0 && (
              <View className="mb-8">
                <View className="flex-row items-center gap-1.5 mb-2 px-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Informants
                  </Text>
                  <RoleTooltip role="informant" />
                </View>
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
              </View>
            )}

            {/* Empty state */}
            {consuls.length === 0 && caporegimes.length === 0 && bookkeepers.length === 0 && informants.length === 0 && (
              <View className="items-center justify-center py-12">
                <Text className="text-sm text-stone-500">No members yet.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Member Editor Modal */}
      <MemberEditor
        visible={creating || editing !== null}
        member={editing}
        onSave={handleSave}
        onClose={handleClose}
        forceMemberType={editorMemberType}
        caporegimeId={editorCaporegimeId}
      />

      {/* Informant Token Display Modal */}
      {creatingInformant && newToken && (
        <View className="absolute inset-0 items-center justify-center bg-black/60 px-4">
          <View className="w-full max-w-md rounded-xl border border-stone-700 bg-stone-900 p-6">
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
          </View>
        </View>
      )}
    </View>
  );
}
