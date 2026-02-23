import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useSitDown } from '../hooks/useSitDown';
import { useMembers } from '../hooks/useMembers';
import { useCommission } from '../hooks/useCommission';
import { useAuth } from '../contexts/AuthContext';
import { ChatView } from '../components/chat/ChatView';
import { MemberList } from '../components/sitdown/MemberList';
import { buildMemberOwnerMap } from '../lib/mention-parser';
import { toast } from 'sonner';

export function SitdownPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    sitDown,
    participants,
    participantMembers,
    commissionMembers,
    membersByOwner,
    loading,
    addMember,
    addDon,
    removeParticipant,
    refreshParticipants,
  } = useSitDown(id);
  const { user } = useAuth();
  const { members: myMembers } = useMembers();
  const { contacts } = useCommission();
  const [showMembers, setShowMembers] = useState(false);

  // Build disambiguation map for members with duplicate names (for mention autocomplete)
  // Must be before early returns to satisfy React's rules of hooks.
  const memberOwnerMap = useMemo(() => {
    const dons = participants
      .filter((p) => p.user_id != null && p.profile)
      .map((p) => ({ userId: p.user_id!, displayName: p.profile!.display_name }));
    return buildMemberOwnerMap(participantMembers, dons);
  }, [participants, participantMembers]);

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

  // For commission sit-downs, use all participant Dons' members as available
  const availableMembers = sitDown.is_commission ? commissionMembers : myMembers;

  // For commission sit-downs, find contacts not yet in the sit-down
  const participantUserIds = new Set(participants.filter((p) => p.user_id).map((p) => p.user_id));
  const addableContacts = sitDown.is_commission
    ? contacts.filter((c) => !participantUserIds.has(c.contact_user_id))
    : [];

  // Shared MemberList props (used by both mobile and desktop sidebars)
  const memberListProps = {
    participants,
    availableMembers,
    isCommission: sitDown.is_commission,
    membersByOwner: sitDown.is_commission ? membersByOwner : undefined,
    addableContacts,
    onAddMember: async (memberId: string) => {
      try {
        await addMember(memberId);
        toast.success('A new face at the table.');
      } catch {
        toast.error('Couldn\'t bring them in.');
      }
    },
    onAddUser: sitDown.is_commission ? async (userId: string) => {
      try {
        await addDon(userId);
        toast.success('A new Don at the table.');
      } catch {
        toast.error('Couldn\'t bring them in.');
      }
    } : undefined,
    onRemoveParticipant: async (participantId: string) => {
      try {
        await removeParticipant(participantId);
        toast.success('They\'ve been excused.');
      } catch {
        toast.error('They won\'t leave.');
      }
    },
    onLeave: async () => {
      const myParticipant = participants.find((p) => p.user_id === user?.id);
      if (!myParticipant) return;
      try {
        await removeParticipant(myParticipant.id);
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
      <ChatView sitDownId={sitDown.id} members={participantMembers} memberOwnerMap={memberOwnerMap} onToggleMembers={() => setShowMembers((s) => !s)} showMembers={showMembers} onPoll={refreshParticipants} />

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
