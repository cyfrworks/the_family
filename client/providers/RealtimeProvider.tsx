import { useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { startGlobalChannel, stopGlobalChannel } from '../lib/realtime-hub';
import {
  registerForPushNotifications,
  unregisterPushToken,
  setupNotificationResponseListener,
} from '../lib/notifications';

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pushTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    startGlobalChannel(user.id, queryClient);
    return () => { stopGlobalChannel(); };
  }, [user, queryClient]);

  // Push notification registration + deep-link listener
  useEffect(() => {
    if (!user) return;

    registerForPushNotifications().then((token) => {
      pushTokenRef.current = token;
    });

    const removeResponseListener = setupNotificationResponseListener();

    return () => {
      removeResponseListener();
      if (pushTokenRef.current) {
        unregisterPushToken(pushTokenRef.current);
        pushTokenRef.current = null;
      }
    };
  }, [user]);

  return <>{children}</>;
}
