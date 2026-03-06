import { useQueryClient } from '@tanstack/react-query';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { SitDown, SitDownParticipant } from '../lib/types';
import { useCommissionContext } from '../contexts/CommissionContext';
import { useAuth } from '../contexts/AuthContext';
import { notifyMembershipChange } from './useSitDowns';

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

    // Notify invited Dons so the sit-down appears in their sidebar
    for (const contactId of contactIds) {
      notifyMembershipChange(contactId);
    }
    await refetch();
    return res?.sit_down as SitDown;
  }

  async function deleteSitDown(id: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'delete_commission', access_token: accessToken, sit_down_id: id },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    // Notify other Dons so the sit-down disappears from their sidebar
    const cached = queryClient.getQueryData<{ participants?: SitDownParticipant[] }>(['sitDown', 'enter', id]);
    if (cached?.participants) {
      for (const p of cached.participants) {
        if (p.user_id && p.user_id !== user?.id) {
          notifyMembershipChange(p.user_id);
        }
      }
    }
    queryClient.removeQueries({ queryKey: ['sitDown', 'enter', id] });
    await refetch();
  }

  async function leaveSitDown(id: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: { action: 'leave_commission', access_token: accessToken, sit_down_id: id },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    // Clear the sit-down page cache and refresh sidebar lists
    queryClient.removeQueries({ queryKey: ['sitDown', 'enter', id] });
    queryClient.invalidateQueries({ queryKey: ['sitDowns'] });
    await refetch();
  }

  return { sitDowns, loading, createCommissionSitDown, deleteSitDown, leaveSitDown, markAsRead: markSitDownAsRead, refetch };
}
