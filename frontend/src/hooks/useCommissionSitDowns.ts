import { db } from '../lib/supabase';
import type { SitDown } from '../lib/types';
import { useCommissionContext } from '../contexts/CommissionContext';

export function useCommissionSitDowns() {
  const { commissionSitDowns: sitDowns, loading, refetch } = useCommissionContext();

  async function createCommissionSitDown(
    name: string,
    description: string | undefined,
    roleIds: string[],
    contactIds: string[]
  ) {
    const data = await db.rpc<SitDown>('create_commission_sit_down', {
      p_name: name,
      p_description: description ?? null,
      p_role_ids: roleIds,
      p_contact_ids: contactIds,
    });
    await refetch();
    return data;
  }

  async function deleteSitDown(id: string) {
    await db.delete('sit_downs', [{ column: 'id', op: 'eq', value: id }]);
    await refetch();
  }

  return { sitDowns, loading, createCommissionSitDown, deleteSitDown, refetch };
}
