import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { supabase } from '../lib/realtime';
import { useAuth } from './AuthContext';
import type { CommissionContact, SitDown } from '../lib/types';

const COMMISSION_API_REF = 'formula:local.commission-api:0.1.0';

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

  const fetchAll = useCallback(async () => {
    if (!user) return;

    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: COMMISSION_API_REF,
        input: { action: 'state', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) return;

      setContacts((res?.contacts as CommissionContact[]) || []);
      setPendingInvites((res?.pending_invites as CommissionContact[]) || []);
      setSentInvites((res?.sent_invites as CommissionContact[]) || []);
      setCommissionSitDowns((res?.commission_sit_downs as SitDown[]) || []);
    } catch {
      // ignore poll errors
    }
  }, [user]);

  // Fetch once on mount (and when user changes)
  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    }
    init();
  }, [fetchAll]);

  // Realtime: refetch when commission_contacts change (RLS filters to own rows)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`commission:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commission_contacts' },
        () => { fetchAll(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
