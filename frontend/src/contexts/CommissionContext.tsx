import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type { CommissionContact, SitDown } from '../lib/types';

const POLL_FOCUSED_MS = 10_000;
const POLL_BACKGROUND_MS = 30_000;
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) return;

    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: { registry: COMMISSION_API_REF },
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

  // Initial fetch
  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    }
    init();
  }, [fetchAll]);

  // Adaptive polling: fast when tab is focused, slow when backgrounded
  useEffect(() => {
    if (!user) return;

    function scheduleNext() {
      const interval = document.visibilityState === 'visible' ? POLL_FOCUSED_MS : POLL_BACKGROUND_MS;
      pollRef.current = setInterval(fetchAll, interval);
    }

    scheduleNext();

    function handleVisibilityChange() {
      if (pollRef.current) clearInterval(pollRef.current);
      if (document.visibilityState === 'visible') fetchAll();
      scheduleNext();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
