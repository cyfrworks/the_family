import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { CommissionContact } from '../lib/types';
import { useCommissionContext } from '../contexts/CommissionContext';

const COMMISSION_API_REF = 'formula:local.commission-api:0.1.0';

export function useCommission() {
  const { contacts, pendingInvites, sentInvites, loading, refetch } = useCommissionContext();

  async function inviteByEmail(email: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: COMMISSION_API_REF,
      input: { action: 'invite', access_token: accessToken, email },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await refetch();
    return res?.contact as CommissionContact;
  }

  async function acceptInvite(contactId: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: COMMISSION_API_REF,
      input: { action: 'accept', access_token: accessToken, contact_id: contactId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await refetch();
    return res?.contact as CommissionContact;
  }

  async function declineInvite(contactId: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: COMMISSION_API_REF,
      input: { action: 'decline', access_token: accessToken, contact_id: contactId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await refetch();
    return res?.contact as CommissionContact;
  }

  async function removeContact(contactUserId: string) {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: COMMISSION_API_REF,
      input: { action: 'remove', access_token: accessToken, contact_user_id: contactUserId },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    await refetch();
  }

  return {
    contacts,
    pendingInvites,
    sentInvites,
    loading,
    inviteByEmail,
    acceptInvite,
    declineInvite,
    removeContact,
    refetch,
  };
}
