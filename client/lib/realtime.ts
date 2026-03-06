import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY as string;

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
