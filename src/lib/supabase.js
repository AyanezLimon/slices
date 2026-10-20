import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

export const APP_URL = () => location.origin + import.meta.env.BASE_URL;

/** Lanza el error de Supabase con un mensaje legible. */
export function must({ data, error }) {
  if (error) throw new Error(error.message || 'Algo salió mal');
  return data;
}
