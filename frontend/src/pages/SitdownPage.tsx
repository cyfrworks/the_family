import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useSitDown } from '../hooks/useSitDown';
import { useRoles } from '../hooks/useRoles';
import { useCommission } from '../hooks/useCommission';
import { useAuth } from '../contexts/AuthContext';
import { ChatView } from '../components/chat/ChatView';
import type { SitDownContext } from '../hooks/useAIResponse';
import { MemberList } from '../components/sitdown/MemberList';
import { toast } from 'sonner';

export function SitdownPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    sitDown,
    members,
    memberRoles,
    commissionRoles,
    rolesByOwner,
    loading,
    addRoleMember,
    addUserMember,
    removeMember,
    refreshMembers,
  } = useSitDown(id);
  const { user } = useAuth();
  const { myRoles } = useRoles();
  const { contacts } = useCommission();
  const [showMembers, setShowMembers] = useState(false);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-stone-500">Loading...</p>
      </div>
    );
  }

  if (!sitDown) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="font-serif text-lg text-stone-400">Sit-down not found</p>
          <button
            onClick={() => navigate('/')}
            className="mt-2 text-sm text-gold-500 hover:text-gold-400"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  // For commission sit-downs, use all member Dons' roles as available
  const availableRoles = sitDown.is_commission ? commissionRoles : myRoles;

  // For commission sit-downs, find contacts not yet in the sit-down
  const memberUserIds = new Set(members.filter((m) => m.user_id).map((m) => m.user_id));
  const addableContacts = sitDown.is_commission
    ? contacts.filter((c) => !memberUserIds.has(c.contact_user_id))
    : [];

  // Build context so AI roles know who their Don is and what families are at the table
  const sitDownContext: SitDownContext = {
    isCommission: sitDown.is_commission,
    dons: members
      .filter((m) => m.user_id !== null && m.profile)
      .map((m) => ({ userId: m.user_id!, displayName: m.profile!.display_name })),
    allRoles: memberRoles,
  };

  // Shared MemberList props (used by both mobile and desktop sidebars)
  const memberListProps = {
    members,
    availableRoles,
    isCommission: sitDown.is_commission,
    rolesByOwner: sitDown.is_commission ? rolesByOwner : undefined,
    addableContacts,
    onAddRole: async (roleId: string) => {
      try {
        await addRoleMember(roleId);
        toast.success('A new face at the table.');
      } catch {
        toast.error('Couldn\'t bring them in.');
      }
    },
    onAddUser: sitDown.is_commission ? async (userId: string) => {
      try {
        await addUserMember(userId);
        toast.success('A new Don at the table.');
      } catch {
        toast.error('Couldn\'t bring them in.');
      }
    } : undefined,
    onRemoveMember: async (memberId: string) => {
      try {
        await removeMember(memberId);
        toast.success('They\'ve been excused.');
      } catch {
        toast.error('They won\'t leave.');
      }
    },
    onLeave: async () => {
      const myMember = members.find((m) => m.user_id === user?.id);
      if (!myMember) return;
      try {
        await removeMember(myMember.id);
        navigate('/');
        toast.success('You\'ve left the table.');
      } catch {
        toast.error('Couldn\'t leave.');
      }
    },
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="rounded-md p-1 text-stone-400 hover:text-stone-200 lg:hidden"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="truncate font-serif text-lg font-bold text-stone-100">
              {sitDown.name}
            </h2>
            {sitDown.description && (
              <p className="truncate text-xs text-stone-500">{sitDown.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Chat */}
      <ChatView sitDownId={sitDown.id} roles={memberRoles} sitDownContext={sitDownContext} onToggleMembers={() => setShowMembers((s) => !s)} showMembers={showMembers} onPoll={refreshMembers} />

      {/* Members drawer */}
      {showMembers && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setShowMembers(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-72 border-l border-stone-800 bg-stone-900 p-3 overflow-y-auto">
            <MemberList {...memberListProps} />
          </div>
        </>
      )}
    </div>
  );
}
