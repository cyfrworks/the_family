import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[realtime] VITE_SUPABASE_URL or VITE_SUPABASE_KEY not set — Realtime disabled');
}

export const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_KEY ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { heartbeatIntervalMs: 15000 },
});

export function setRealtimeAuth(token: string | null) {
  if (token) {
    supabase.realtime.setAuth(token);
  } else {
    supabase.realtime.setAuth(null);
  }
}

export function clearRealtime() {
  supabase.removeAllChannels();
}
