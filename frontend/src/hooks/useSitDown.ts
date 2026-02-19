import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import type { SitDown, SitDownMember, Role, Profile } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

export interface RolesByOwner {
  profile: Profile;
  roles: Role[];
}

export function useSitDown(sitDownId: string | undefined) {
  const { user } = useAuth();
  const [sitDown, setSitDown] = useState<SitDown | null>(null);
  const [members, setMembers] = useState<SitDownMember[]>([]);
  const [commissionRoles, setCommissionRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const sitDownRef = useRef<SitDown | null>(null);

  // Lightweight refetch: members + commission roles (no loading flash)
  const refreshMembers = useCallback(async () => {
    if (!sitDownId) return;

    let fetchedMembers: SitDownMember[] = [];
    try {
      fetchedMembers = await db.select<SitDownMember>('sit_down_members', {
        select: '*,profile:profiles!sit_down_members_profile_fk(*),role:roles(*)',
        filters: [{ column: 'sit_down_id', op: 'eq', value: sitDownId }],
      });
      setMembers(fetchedMembers);
    } catch {
      return; // silently skip on poll error
    }

    if (sitDownRef.current?.is_commission) {
      try {
        const donUserIds = fetchedMembers
          .filter((m) => m.user_id !== null)
          .map((m) => m.user_id as string);

        if (donUserIds.length > 0) {
          const allRoles = await db.select<Role>('roles', {
            select: '*',
            filters: [
              { column: 'owner_id', op: 'in', value: `(${donUserIds.join(',')})` },
              { column: 'is_template', op: 'eq', value: 'false' },
            ],
          });
          setCommissionRoles(allRoles);
        }
      } catch {
        // ignore poll errors
      }
    }
  }, [sitDownId]);

  // Full initial fetch (sit-down metadata + members + commission roles)
  const fetchSitDown = useCallback(async () => {
    if (!sitDownId) return;
    setLoading(true);

    try {
      const sitDownData = await db.selectOne<SitDown>('sit_downs', {
        select: '*',
        filters: [{ column: 'id', op: 'eq', value: sitDownId }],
      });
      if (sitDownData) {
        setSitDown(sitDownData);
        sitDownRef.current = sitDownData;
      }
    } catch (err) {
      console.error('[useSitDown] Failed to fetch sit-down:', err);
    }

    await refreshMembers();
    setLoading(false);
  }, [sitDownId, refreshMembers]);

  // Initial fetch
  useEffect(() => {
    fetchSitDown();
  }, [fetchSitDown]);

  async function addRoleMember(roleId: string) {
    if (!user || !sitDownId) throw new Error('Missing context');
    await db.insert('sit_down_members', {
      sit_down_id: sitDownId,
      role_id: roleId,
      added_by: user.id,
    });
    await refreshMembers();
  }

  async function addUserMember(userId: string) {
    if (!user || !sitDownId) throw new Error('Missing context');
    await db.insert('sit_down_members', {
      sit_down_id: sitDownId,
      user_id: userId,
      added_by: user.id,
    });
    await refreshMembers();
  }

  async function removeMember(memberId: string) {
    await db.delete('sit_down_members', [{ column: 'id', op: 'eq', value: memberId }]);
    await refreshMembers();
  }

  const donMembers = members.filter((m) => m.user_id !== null);
  const roleMembers = members.filter((m) => m.role_id !== null);
  const memberRoles = roleMembers
    .map((m) => m.role)
    .filter((r): r is Role => r !== undefined);

  // Group commission roles by owner for the MemberList component
  const rolesByOwner = new Map<string, RolesByOwner>();
  if (sitDown?.is_commission) {
    for (const don of donMembers) {
      if (don.user_id && don.profile) {
        rolesByOwner.set(don.user_id, {
          profile: don.profile,
          roles: commissionRoles.filter((r) => r.owner_id === don.user_id),
        });
      }
    }
  }

  return {
    sitDown,
    members,
    donMembers,
    roleMembers,
    memberRoles,
    commissionRoles,
    rolesByOwner,
    loading,
    addRoleMember,
    addUserMember,
    removeMember,
    refreshMembers,
    refetch: fetchSitDown,
  };
}
