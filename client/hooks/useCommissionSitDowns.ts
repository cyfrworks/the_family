import { useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { SitDown } from '../lib/types';
import { useCommissionContext, type CommissionData } from '../contexts/CommissionContext';
import { broadcastLeave } from '../lib/realtime-hub';
import { useAuth } from '../contexts/AuthContext';

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

export function useCommissionSitDowns() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { commissionSitDowns: sitDowns, loading, refetch, markSitDownAsRead } = useCommissionContext();

  async function createCommissionSitDown(
    name: string,
    description: string | undefined,
    memberIds: string[],
    contactIds: string[]
  ) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: {
        action: 'create_commission',
        access_token: accessToken,
        name,
        description: description ?? null,
        member_ids: memberIds,
        contact_ids: contactIds,
      },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    const created = res?.sit_down as SitDown;
    queryClient.setQueryData<CommissionData>(['commission', 'state'], (old) => {
      if (!old) return old;
      return { ...old, commissionSitDowns: [created, ...old.commissionSitDowns] };
    });
    return created;
  }

  async function leaveSitDown(id: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'leave', access_token: accessToken, sit_down_id: id },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    queryClient.setQueryData<SitDown[]>(['sitDowns'], (old) => old?.filter((sd) => sd.id !== id));
    queryClient.setQueryData<CommissionData>(['commission', 'state'], (old) => {
      if (!old) return old;
      return { ...old, commissionSitDowns: old.commissionSitDowns.filter((sd) => sd.id !== id) };
    });

    if (user?.id) broadcastLeave(user.id, id);
  }

  return { sitDowns, loading, createCommissionSitDown, leaveSitDown, markAsRead: markSitDownAsRead, refetch };
}
