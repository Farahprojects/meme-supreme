import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const theraiUrl = process.env.NEXT_PUBLIC_THERAI_SUPABASE_URL;
const theraiAnonKey = process.env.NEXT_PUBLIC_THERAI_SUPABASE_ANON_KEY;

/**
 * Lazy-initialized Supabase clients to prevent build-time crashes on Vercel
 * when environment variables are missing during prerendering.
 */

let _supabase: SupabaseClient | null = null;
let _theraiSupabase: SupabaseClient | null = null;

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

export const theraiSupabase = (() => {
    if (_theraiSupabase) return _theraiSupabase;
    const url = theraiUrl || supabaseUrl;
    const key = theraiAnonKey || supabaseAnonKey;

    if (!url || !key) {
        if (process.env.NODE_ENV === 'development') {
            console.warn("Therai Supabase credentials missing. Client will be initialized with dummy values.");
        }
        _theraiSupabase = createClient('https://placeholder.supabase.co', 'placeholder');
        return _theraiSupabase;
    }
    _theraiSupabase = createClient(url, key);
    return _theraiSupabase;
})() as SupabaseClient;
