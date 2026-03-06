import { useState, useEffect } from 'react';
import { supabase } from '../lib/realtime';

export function useRealtimeStatus(): boolean {
  const [connected, setConnected] = useState(() => supabase.realtime.isConnected());

  useEffect(() => {
    const onOpen = () => setConnected(true);
    const onClose = () => setConnected(false);
    const onError = () => setConnected(false);

    supabase.realtime.stateChangeCallbacks.open.push(onOpen);
    supabase.realtime.stateChangeCallbacks.close.push(onClose);
    supabase.realtime.stateChangeCallbacks.error.push(onError);

    setConnected(supabase.realtime.isConnected());

    return () => {
      for (const [arr, fn] of [
        [supabase.realtime.stateChangeCallbacks.open, onOpen],
        [supabase.realtime.stateChangeCallbacks.close, onClose],
        [supabase.realtime.stateChangeCallbacks.error, onError],
      ] as [Function[], Function][]) {
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }, []);

  return connected;
}
