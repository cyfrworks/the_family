import { db } from '../lib/supabase';
import type { CommissionContact } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useCommissionContext } from '../contexts/CommissionContext';

export function useCommission() {
  const { user } = useAuth();
  const { contacts, pendingInvites, loading, refetch } = useCommissionContext();

  async function inviteByEmail(email: string) {
    const data = await db.rpc<CommissionContact>('invite_to_commission', {
      p_email: email,
    });
    await refetch();
    return data;
  }

  async function acceptInvite(contactId: string) {
    const data = await db.rpc<CommissionContact>('accept_commission_invite', {
      p_contact_id: contactId,
    });
    await refetch();
    return data;
  }

  async function declineInvite(contactId: string) {
    const data = await db.rpc<CommissionContact>('decline_commission_invite', {
      p_contact_id: contactId,
    });
    await refetch();
    return data;
  }

  async function removeContact(contactUserId: string) {
    if (!user) return;
    await db.delete('commission_contacts', [
      { column: 'user_id', op: 'eq', value: user.id },
      { column: 'contact_user_id', op: 'eq', value: contactUserId },
    ]);
    try {
      await db.delete('commission_contacts', [
        { column: 'user_id', op: 'eq', value: contactUserId },
        { column: 'contact_user_id', op: 'eq', value: user.id },
      ]);
    } catch {
      // Mirror row cleanup handled by the other user
    }
    await refetch();
  }

  return {
    contacts,
    pendingInvites,
    loading,
    inviteByEmail,
    acceptInvite,
    declineInvite,
    removeContact,
    refetch,
  };
}
