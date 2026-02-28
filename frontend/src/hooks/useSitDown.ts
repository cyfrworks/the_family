import { useCallback, useEffect, useState } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { supabase } from '../lib/realtime';
import type { SitDown, SitDownParticipant, Member, Profile } from '../lib/types';

export interface MembersByOwner {
  profile: Profile;
  members: Member[];
}

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

export function useSitDown(sitDownId: string | undefined) {
  const [sitDown, setSitDown] = useState<SitDown | null>(null);
  const [participants, setParticipants] = useState<SitDownParticipant[]>([]);
  const [commissionMembers, setCommissionMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Full load: get sit_down + participants in one formula call
  const fetchSitDown = useCallback(async () => {
    if (!sitDownId) return;
    setLoading(true);

    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SIT_DOWN_REF,
        input: { action: 'get', access_token: accessToken, sit_down_id: sitDownId },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      const sitDownData = res?.sit_down as SitDown | null;
      if (sitDownData) {
        setSitDown(sitDownData);
      }
      setParticipants((res?.participants as SitDownParticipant[]) || []);
      setCommissionMembers((res?.commission_members as Member[]) || []);
    } catch (err) {
      console.error('[useSitDown] Failed to fetch sit-down:', err);
    }

    setLoading(false);
  }, [sitDownId]);

  // Lightweight refresh: just participants (for Realtime and after mutations)
  const refreshParticipants = useCallback(async () => {
    if (!sitDownId) return;

    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SIT_DOWN_REF,
        input: { action: 'list_participants', access_token: accessToken, sit_down_id: sitDownId },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      setParticipants((res?.participants as SitDownParticipant[]) || []);
      setCommissionMembers((res?.commission_members as Member[]) || []);
    } catch (err) {
      console.error('[useSitDown] Failed to fetch participants:', err);
    }
  }, [sitDownId]);

  useEffect(() => {
    fetchSitDown();
  }, [fetchSitDown]);

  // Realtime subscription for participant changes
  useEffect(() => {
    if (!sitDownId) return;

    const channel = supabase
      .channel(`participants:${sitDownId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sit_down_participants', filter: `sit_down_id=eq.${sitDownId}` },
        () => {
          refreshParticipants();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sitDownId, refreshParticipants]);

  async function addMember(memberId: string) {
    if (!sitDownId) throw new Error('Missing context');

    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'add_member', access_token: accessToken, sit_down_id: sitDownId, member_id: memberId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await refreshParticipants();
  }

  async function addDon(userId: string) {
    if (!sitDownId) throw new Error('Missing context');

    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'add_don', access_token: accessToken, sit_down_id: sitDownId, user_id: userId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await refreshParticipants();
  }

  async function removeParticipant(participantId: string) {
    if (!sitDownId) throw new Error('Missing context');

    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'remove_participant', access_token: accessToken, sit_down_id: sitDownId, participant_id: participantId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

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
