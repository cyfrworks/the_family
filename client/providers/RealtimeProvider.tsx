import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { startGlobalChannel, stopGlobalChannel } from '../lib/realtime-hub';
import {
  registerForPushNotifications,
  setupNotificationResponseListener,
} from '../lib/notifications';

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    startGlobalChannel(user.id, queryClient);
    return () => { stopGlobalChannel(); };
  }, [user, queryClient]);

  // Push notification registration + deep-link listener
  // Token unregistration is handled by AuthContext.signOut(), not here —
  // cleanup here would delete the token from the DB on every remount,
  // preventing notifications from being delivered.
  useEffect(() => {
    if (!user) return;

    registerForPushNotifications();

    const removeResponseListener = setupNotificationResponseListener();
    return () => { removeResponseListener(); };
  }, [user]);

  return <>{children}</>;
}
