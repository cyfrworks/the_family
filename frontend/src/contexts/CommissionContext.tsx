import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { db } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type { CommissionContact, SitDown } from '../lib/types';

const POLL_INTERVAL_MS = 10_000;

interface CommissionState {
  contacts: CommissionContact[];
  pendingInvites: CommissionContact[];
  sentInvites: CommissionContact[];
  commissionSitDowns: SitDown[];
  loading: boolean;
  refetch: () => Promise<void>;
}

const CommissionContext = createContext<CommissionState | null>(null);

export function CommissionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<CommissionContact[]>([]);
  const [pendingInvites, setPendingInvites] = useState<CommissionContact[]>([]);
  const [sentInvites, setSentInvites] = useState<CommissionContact[]>([]);
  const [commissionSitDowns, setCommissionSitDowns] = useState<SitDown[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) return;

    // Fire all four queries in parallel
    const [contactsResult, invitesResult, sentResult, sitDownsResult] = await Promise.allSettled([
      db.select<CommissionContact>('commission_contacts', {
        select: '*,contact_profile:profiles!commission_contacts_contact_profile_fk(*)',
        filters: [
          { column: 'user_id', op: 'eq', value: user.id },
          { column: 'status', op: 'eq', value: 'accepted' },
        ],
        order: [{ column: 'created_at', direction: 'desc' }],
      }),
      db.select<CommissionContact>('commission_contacts', {
        select: '*,profile:profiles!commission_contacts_user_profile_fk(*)',
        filters: [
          { column: 'contact_user_id', op: 'eq', value: user.id },
          { column: 'status', op: 'eq', value: 'pending' },
        ],
        order: [{ column: 'created_at', direction: 'desc' }],
      }),
      db.select<CommissionContact>('commission_contacts', {
        select: '*,contact_profile:profiles!commission_contacts_contact_profile_fk(*)',
        filters: [
          { column: 'user_id', op: 'eq', value: user.id },
          { column: 'status', op: 'eq', value: 'pending' },
        ],
        order: [{ column: 'created_at', direction: 'desc' }],
      }),
      db.select<SitDown>('sit_downs', {
        select: '*',
        filters: [{ column: 'is_commission', op: 'eq', value: 'true' }],
        order: [{ column: 'created_at', direction: 'desc' }],
      }),
    ]);

    if (contactsResult.status === 'fulfilled') setContacts(contactsResult.value);
    if (invitesResult.status === 'fulfilled') setPendingInvites(invitesResult.value);
    if (sentResult.status === 'fulfilled') setSentInvites(sentResult.value);
    if (sitDownsResult.status === 'fulfilled') setCommissionSitDowns(sitDownsResult.value);
  }, [user]);

  // Initial fetch
  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    }
    init();
  }, [fetchAll]);

  // Single poll for all commission data
  useEffect(() => {
    if (!user) return;
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, fetchAll]);

  return (
    <CommissionContext.Provider value={{ contacts, pendingInvites, sentInvites, commissionSitDowns, loading, refetch: fetchAll }}>
      {children}
    </CommissionContext.Provider>
  );
}

export function useCommissionContext() {
  const ctx = useContext(CommissionContext);
  if (!ctx) throw new Error('useCommissionContext must be used within CommissionProvider');
  return ctx;
}
