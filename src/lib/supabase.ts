import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Lazy-initialized Supabase clients to prevent build-time crashes on Vercel
 * when environment variables are missing during prerendering.
 */

let _supabase: SupabaseClient | null = null;

export const supabase = (() => {
    if (_supabase) return _supabase;
    if (!supabaseUrl || !supabaseAnonKey) {
        if (process.env.NODE_ENV === 'development') {
            console.warn("Meme Supreme Supabase credentials missing. Client will be initialized with dummy values.");
        }
        _supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder');
        return _supabase;
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
    return _supabase;
})() as SupabaseClient;
