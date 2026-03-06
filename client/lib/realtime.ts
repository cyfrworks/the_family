import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
    if (!url || !key) throw new Error('Supabase env vars not set');
    _supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { heartbeatIntervalMs: 15000 },
    });
  }
  return _supabase;
}

export function setRealtimeAuth(token: string | null) {
  if (token) {
    getSupabase().realtime.setAuth(token);
  } else {
    getSupabase().realtime.setAuth(null);
  }
}

export function clearRealtime() {
  getSupabase().removeAllChannels();
}
