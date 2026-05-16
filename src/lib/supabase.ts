import { createClient } from '@supabase/supabase-js';

let supabaseInstance: any = null;

// Lazy initialize supabase client to prevent crashing on startup if env vars are missing
export const supabase = new Proxy({} as any, {
  get: (target, name) => {
    if (!supabaseInstance) {
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project.supabase.co')) {
        throw new Error('Konfigurasi Supabase belum diset. Harap masukkan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di Secrets.');
      }
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    }
    const value = supabaseInstance[name];
    if (typeof value === 'function') {
      return value.bind(supabaseInstance);
    }
    return value;
  },
});
