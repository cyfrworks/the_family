import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/realtime';

export function useRealtimeStatus(): boolean {
  const [connected, setConnected] = useState(() => getSupabase().realtime.isConnected());

  useEffect(() => {
    const sb = getSupabase();
    const onOpen = () => setConnected(true);
    const onClose = () => setConnected(false);
    const onError = () => setConnected(false);

    sb.realtime.stateChangeCallbacks.open.push(onOpen);
    sb.realtime.stateChangeCallbacks.close.push(onClose);
    sb.realtime.stateChangeCallbacks.error.push(onError);

    setConnected(sb.realtime.isConnected());

    return () => {
      for (const [arr, fn] of [
        [sb.realtime.stateChangeCallbacks.open, onOpen],
        [sb.realtime.stateChangeCallbacks.close, onClose],
        [sb.realtime.stateChangeCallbacks.error, onError],
      ] as [Function[], Function][]) {
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }, []);

  return connected;
}
