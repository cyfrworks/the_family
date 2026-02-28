import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { SitDown } from '../lib/types';
import { useCommissionContext } from '../contexts/CommissionContext';

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

export function useCommissionSitDowns() {
  const { commissionSitDowns: sitDowns, loading, refetch } = useCommissionContext();

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

    await refetch();
  }

  return { sitDowns, loading, createCommissionSitDown, deleteSitDown, refetch };
}
