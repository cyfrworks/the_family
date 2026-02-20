import { useState } from 'react';
import { LogOut, Plus, Trash2, UserPlus } from 'lucide-react';
import type { SitDownParticipant, Member, CommissionContact } from '../../lib/types';
import type { MembersByOwner } from '../../hooks/useSitDown';
import { PROVIDER_COLORS } from '../../config/constants';
import { useAuth } from '../../contexts/AuthContext';

interface MemberListProps {
  participants: SitDownParticipant[];
  availableMembers?: Member[];
  isCommission?: boolean;
  membersByOwner?: Map<string, MembersByOwner>;
  addableContacts?: CommissionContact[];
  onAddMember?: (memberId: string) => Promise<void>;
  onAddUser?: (userId: string) => Promise<void>;
  onRemoveParticipant?: (participantId: string) => Promise<void>;
  onLeave?: () => Promise<void>;
}

export function MemberList({
  participants,
  availableMembers,
  isCommission,
  membersByOwner,
  addableContacts,
  onAddMember,
  onAddUser,
  onRemoveParticipant,
  onLeave,
}: MemberListProps) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);

  // For commission sit-downs, derive the Dons list from membersByOwner (proven correct)
  // rather than participants.filter(), which can miss Dons due to join/RLS quirks.
  const dons = isCommission && membersByOwner && membersByOwner.size > 0
    ? Array.from(membersByOwner.entries()).map(([userId, { profile }]) => ({
        id: participants.find((p) => p.user_id === userId)?.id ?? userId,
        user_id: userId,
        profile,
      }))
    : participants.filter((p) => p.user_id).map((p) => ({
        id: p.id,
        user_id: p.user_id!,
        profile: p.profile,
      }));
  const memberParticipants = participants.filter((p) => p.member_id);

  const participantMemberIds = new Set(memberParticipants.map((p) => p.member_id));
  const addableMembers = availableMembers?.filter((m) => !participantMemberIds.has(m.id)) ?? [];

  // For commission sit-downs, show only YOUR addable members (each Don manages their own family)
  const groupedAddableMembers = new Map<string, { label: string; members: Member[] }>();
  if (isCommission && membersByOwner && user) {
    const myEntry = membersByOwner.get(user.id);
    if (myEntry) {
      const myAddable = myEntry.members.filter((m) => !participantMemberIds.has(m.id));
      if (myAddable.length > 0) {
        groupedAddableMembers.set(user.id, { label: 'Your Family', members: myAddable });
      }
    }
  }

  return (
    <div className="space-y-3">
      {dons.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
            Dons
          </h4>
          <div className="space-y-0.5">
            {dons.map((d) => (
              <div key={d.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-600 text-[10px] font-bold text-stone-950">
                  {d.profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                </div>
                <span className="text-xs text-stone-300 truncate">
                  {d.profile?.display_name ?? 'Don'}
                  {d.user_id === user?.id && <span className="text-stone-600"> (you)</span>}
                </span>
                {d.user_id === user?.id && onLeave && (
                  <button
                    onClick={onLeave}
                    className="ml-auto rounded p-0.5 text-stone-600 hover:text-red-400 transition-colors"
                    title="Leave sit-down"
                  >
                    <LogOut size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing member participants */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
          Members
        </h4>
        <div className="space-y-0.5">
          {memberParticipants.map((p) => (
            <div key={p.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white ${p.member ? PROVIDER_COLORS[p.member.provider] : 'bg-stone-600'}`}
              >
                {p.member?.provider[0].toUpperCase() ?? '?'}
              </span>
              <span className="text-xs text-stone-300 truncate">{p.member?.name ?? 'Unknown'}</span>
              {onRemoveParticipant && (
                <button
                  onClick={() => onRemoveParticipant(p.id)}
                  className="ml-auto rounded p-0.5 text-stone-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {memberParticipants.length === 0 && (
            <p className="text-[11px] text-stone-600 px-2 py-1">No members added yet.</p>
          )}
        </div>
      </div>

      {/* Add Member — grouped by family for commission sit-downs */}
      {isCommission && groupedAddableMembers.size > 0 && onAddMember && (
        <>
          {Array.from(groupedAddableMembers.entries()).map(([ownerId, { label, members: ownerMembers }]) => (
            <div key={ownerId}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
                {label}
              </h4>
              <div className="space-y-0.5">
                {ownerMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={async () => {
                      setAdding(true);
                      try {
                        await onAddMember(member.id);
                      } finally {
                        setAdding(false);
                      }
                    }}
                    disabled={adding}
                    className="flex w-full items-center gap-2 rounded-md border border-stone-800 px-2 py-1.5 text-left hover:bg-stone-800 transition-colors disabled:opacity-50"
                  >
                    <Plus size={12} className="text-gold-500 shrink-0" />
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white ${PROVIDER_COLORS[member.provider]}`}
                    >
                      {member.provider[0].toUpperCase()}
                    </span>
                    <span className="text-xs text-stone-300 truncate">{member.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Add Member — flat list for personal sit-downs */}
      {!isCommission && addableMembers.length > 0 && onAddMember && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
            Add Member
          </h4>
          <div className="space-y-0.5">
            {addableMembers.map((member) => (
              <button
                key={member.id}
                onClick={async () => {
                  setAdding(true);
                  try {
                    await onAddMember(member.id);
                  } finally {
                    setAdding(false);
                  }
                }}
                disabled={adding}
                className="flex w-full items-center gap-2 rounded-md border border-stone-800 px-2 py-1.5 text-left hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                <Plus size={12} className="text-gold-500 shrink-0" />
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white ${PROVIDER_COLORS[member.provider]}`}
                >
                  {member.provider[0].toUpperCase()}
                </span>
                <span className="text-xs text-stone-300 truncate">{member.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Invite Don to commission sit-down */}
      {isCommission && addableContacts && addableContacts.length > 0 && onAddUser && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
            Invite a Don
          </h4>
          <div className="space-y-0.5">
            {addableContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={async () => {
                  setAdding(true);
                  try {
                    await onAddUser(contact.contact_user_id);
                  } finally {
                    setAdding(false);
                  }
                }}
                disabled={adding}
                className="flex w-full items-center gap-2 rounded-md border border-stone-800 px-2 py-1.5 text-left hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                <UserPlus size={12} className="text-gold-500 shrink-0" />
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-600 text-[8px] font-bold text-stone-950">
                  {contact.contact_profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                </div>
                <span className="text-xs text-stone-300 truncate">
                  {contact.contact_profile?.display_name ?? 'Don'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
