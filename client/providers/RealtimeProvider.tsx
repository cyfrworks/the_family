import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { startGlobalChannel, stopGlobalChannel } from '../lib/realtime-hub';

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    startGlobalChannel(user.id, queryClient);
    return () => { stopGlobalChannel(); };
  }, [user, queryClient]);

  return <>{children}</>;
}
