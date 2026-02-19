import { useState } from 'react';
import { LogOut, Plus, Trash2, UserPlus } from 'lucide-react';
import type { SitDownMember, Role, CommissionContact } from '../../lib/types';
import type { RolesByOwner } from '../../hooks/useSitDown';
import { PROVIDER_COLORS } from '../../config/constants';
import { useAuth } from '../../contexts/AuthContext';

interface MemberListProps {
  members: SitDownMember[];
  availableRoles?: Role[];
  isCommission?: boolean;
  rolesByOwner?: Map<string, RolesByOwner>;
  addableContacts?: CommissionContact[];
  onAddRole?: (roleId: string) => Promise<void>;
  onAddUser?: (userId: string) => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
  onLeave?: () => Promise<void>;
}

export function MemberList({
  members,
  availableRoles,
  isCommission,
  rolesByOwner,
  addableContacts,
  onAddRole,
  onAddUser,
  onRemoveMember,
  onLeave,
}: MemberListProps) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);

  // For commission sit-downs, derive the Dons list from rolesByOwner (proven correct)
  // rather than members.filter(), which can miss Dons due to join/RLS quirks.
  const dons = isCommission && rolesByOwner && rolesByOwner.size > 0
    ? Array.from(rolesByOwner.entries()).map(([userId, { profile }]) => ({
        id: members.find((m) => m.user_id === userId)?.id ?? userId,
        user_id: userId,
        profile,
      }))
    : members.filter((m) => m.user_id).map((m) => ({
        id: m.id,
        user_id: m.user_id!,
        profile: m.profile,
      }));
  const roles = members.filter((m) => m.role_id);

  const memberRoleIds = new Set(roles.map((m) => m.role_id));
  const addableRoles = availableRoles?.filter((r) => !memberRoleIds.has(r.id)) ?? [];

  // For commission sit-downs, show only YOUR addable roles (each Don manages their own family)
  const groupedAddableRoles = new Map<string, { label: string; roles: Role[] }>();
  if (isCommission && rolesByOwner && user) {
    const myEntry = rolesByOwner.get(user.id);
    if (myEntry) {
      const myAddable = myEntry.roles.filter((r) => !memberRoleIds.has(r.id));
      if (myAddable.length > 0) {
        groupedAddableRoles.set(user.id, { label: 'Your Family', roles: myAddable });
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
            {dons.map((m) => (
              <div key={m.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-600 text-[10px] font-bold text-stone-950">
                  {m.profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                </div>
                <span className="text-xs text-stone-300 truncate">
                  {m.profile?.display_name ?? 'Don'}
                  {m.user_id === user?.id && <span className="text-stone-600"> (you)</span>}
                </span>
                {m.user_id === user?.id && onLeave && (
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

      {/* Existing role members */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
          Members
        </h4>
        <div className="space-y-0.5">
          {roles.map((m) => (
            <div key={m.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white ${m.role ? PROVIDER_COLORS[m.role.provider] : 'bg-stone-600'}`}
              >
                {m.role?.provider[0].toUpperCase() ?? '?'}
              </span>
              <span className="text-xs text-stone-300 truncate">{m.role?.name ?? 'Unknown'}</span>
              {onRemoveMember && (
                <button
                  onClick={() => onRemoveMember(m.id)}
                  className="ml-auto rounded p-0.5 text-stone-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {roles.length === 0 && (
            <p className="text-[11px] text-stone-600 px-2 py-1">No members added yet.</p>
          )}
        </div>
      </div>

      {/* Add Role — grouped by family for commission sit-downs */}
      {isCommission && groupedAddableRoles.size > 0 && onAddRole && (
        <>
          {Array.from(groupedAddableRoles.entries()).map(([ownerId, { label, roles: ownerRoles }]) => (
            <div key={ownerId}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
                {label}
              </h4>
              <div className="space-y-0.5">
                {ownerRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={async () => {
                      setAdding(true);
                      try {
                        await onAddRole(role.id);
                      } finally {
                        setAdding(false);
                      }
                    }}
                    disabled={adding}
                    className="flex w-full items-center gap-2 rounded-md border border-stone-800 px-2 py-1.5 text-left hover:bg-stone-800 transition-colors disabled:opacity-50"
                  >
                    <Plus size={12} className="text-gold-500 shrink-0" />
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white ${PROVIDER_COLORS[role.provider]}`}
                    >
                      {role.provider[0].toUpperCase()}
                    </span>
                    <span className="text-xs text-stone-300 truncate">{role.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Add Member — flat list for personal sit-downs */}
      {!isCommission && addableRoles.length > 0 && onAddRole && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5 px-1">
            Add Member
          </h4>
          <div className="space-y-0.5">
            {addableRoles.map((role) => (
              <button
                key={role.id}
                onClick={async () => {
                  setAdding(true);
                  try {
                    await onAddRole(role.id);
                  } finally {
                    setAdding(false);
                  }
                }}
                disabled={adding}
                className="flex w-full items-center gap-2 rounded-md border border-stone-800 px-2 py-1.5 text-left hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                <Plus size={12} className="text-gold-500 shrink-0" />
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white ${PROVIDER_COLORS[role.provider]}`}
                >
                  {role.provider[0].toUpperCase()}
                </span>
                <span className="text-xs text-stone-300 truncate">{role.name}</span>
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
