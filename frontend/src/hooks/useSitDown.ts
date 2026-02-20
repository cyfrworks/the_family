import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import type { CatalogModel, SitDown, SitDownParticipant, Member, Profile } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

export interface MembersByOwner {
  profile: Profile;
  members: Member[];
}

export function useSitDown(sitDownId: string | undefined) {
  const { user } = useAuth();
  const [sitDown, setSitDown] = useState<SitDown | null>(null);
  const [participants, setParticipants] = useState<SitDownParticipant[]>([]);
  const [commissionMembers, setCommissionMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const sitDownRef = useRef<SitDown | null>(null);

  // Lightweight refetch: participants + commission members (no loading flash)
  const refreshParticipants = useCallback(async () => {
    if (!sitDownId) return;

    let fetchedParticipants: SitDownParticipant[] = [];
    try {
      fetchedParticipants = await db.select<SitDownParticipant>('sit_down_participants', {
        select: '*',
        filters: [{ column: 'sit_down_id', op: 'eq', value: sitDownId }],
      });

      // Fetch profiles for don participants
      const userIds = [...new Set(fetchedParticipants.filter((p) => p.user_id).map((p) => p.user_id as string))];
      if (userIds.length > 0) {
        const profiles = await db.select<Profile>('profiles', {
          select: '*',
          filters: [{ column: 'id', op: 'in', value: `(${userIds.join(',')})` }],
        });
        const profileMap = new Map(profiles.map((p) => [p.id, p]));
        for (const p of fetchedParticipants) {
          if (p.user_id) p.profile = profileMap.get(p.user_id);
        }
      }

      // Fetch members for member participants
      const memberIds = [...new Set(fetchedParticipants.filter((p) => p.member_id).map((p) => p.member_id as string))];
      if (memberIds.length > 0) {
        const members = await db.select<Member>('members', {
          select: '*',
          filters: [{ column: 'id', op: 'in', value: `(${memberIds.join(',')})` }],
        });

        // Enrich members with catalog model data
        const modelIds = [...new Set(members.map((m) => m.catalog_model_id))];
        if (modelIds.length > 0) {
          const models = await db.select<CatalogModel>('model_catalog', {
            select: '*',
            filters: [{ column: 'id', op: 'in', value: `(${modelIds.join(',')})` }],
          });
          const modelMap = new Map(models.map((m) => [m.id, m]));
          for (const member of members) {
            member.catalog_model = modelMap.get(member.catalog_model_id);
          }
        }

        const memberMap = new Map(members.map((m) => [m.id, m]));
        for (const p of fetchedParticipants) {
          if (p.member_id) p.member = memberMap.get(p.member_id);
        }
      }

      setParticipants(fetchedParticipants);
    } catch (err) {
      console.error('[useSitDown] Failed to fetch participants:', err);
      return;
    }

    if (sitDownRef.current?.is_commission) {
      try {
        const donUserIds = fetchedParticipants
          .filter((p) => p.user_id != null)
          .map((p) => p.user_id as string);

        if (donUserIds.length > 0) {
          const allMembers = await db.select<Member>('members', {
            select: '*',
            filters: [
              { column: 'owner_id', op: 'in', value: `(${donUserIds.join(',')})` },
            ],
          });

          // Enrich commission members with catalog model data
          const modelIds = [...new Set(allMembers.map((m) => m.catalog_model_id))];
          if (modelIds.length > 0) {
            const models = await db.select<CatalogModel>('model_catalog', {
              select: '*',
              filters: [{ column: 'id', op: 'in', value: `(${modelIds.join(',')})` }],
            });
            const modelMap = new Map(models.map((m) => [m.id, m]));
            for (const member of allMembers) {
              member.catalog_model = modelMap.get(member.catalog_model_id);
            }
          }

          setCommissionMembers(allMembers);
        }
      } catch (err) {
        console.error('[useSitDown] Failed to fetch commission members:', err);
      }
    }
  }, [sitDownId]);

  // Full initial fetch (sit-down metadata + participants + commission members)
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

    await refreshParticipants();
    setLoading(false);
  }, [sitDownId, refreshParticipants]);

  // Initial fetch
  useEffect(() => {
    fetchSitDown();
  }, [fetchSitDown]);

  async function addMember(memberId: string) {
    if (!user || !sitDownId) throw new Error('Missing context');
    await db.insert('sit_down_participants', {
      sit_down_id: sitDownId,
      member_id: memberId,
      added_by: user.id,
    });
    await refreshParticipants();
  }

  async function addDon(userId: string) {
    if (!user || !sitDownId) throw new Error('Missing context');
    try {
      await db.insert('sit_down_participants', {
        sit_down_id: sitDownId,
        user_id: userId,
        added_by: user.id,
      });
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('23505')) {
        // Already a participant — just refresh
        await refreshParticipants();
        return;
      }
      throw err;
    }
    await refreshParticipants();
  }

  async function removeParticipant(participantId: string) {
    await db.delete('sit_down_participants', [{ column: 'id', op: 'eq', value: participantId }]);
    await refreshParticipants();
  }

  const donParticipants = participants.filter((p) => p.user_id != null);
  const memberParticipants = participants.filter((p) => p.member_id != null);
  const participantMembers = memberParticipants
    .map((p) => p.member)
    .filter((m): m is Member => m !== undefined);

  // Group commission members by owner for the MemberList component
  const membersByOwner = new Map<string, MembersByOwner>();
  if (sitDown?.is_commission) {
    for (const don of donParticipants) {
      if (don.user_id && don.profile) {
        membersByOwner.set(don.user_id, {
          profile: don.profile,
          members: commissionMembers.filter((m) => m.owner_id === don.user_id),
        });
      }
    }
  }

  return {
    sitDown,
    participants,
    donParticipants,
    memberParticipants,
    participantMembers,
    commissionMembers,
    membersByOwner,
    loading,
    addMember,
    addDon,
    removeParticipant,
    refreshParticipants,
    refetch: fetchSitDown,
  };
}
