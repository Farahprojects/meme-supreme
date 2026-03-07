import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const theraiUrl = process.env.NEXT_PUBLIC_THERAI_SUPABASE_URL || supabaseUrl;
const theraiAnonKey = process.env.NEXT_PUBLIC_THERAI_SUPABASE_ANON_KEY || supabaseAnonKey;

export const theraiSupabase = createClient(theraiUrl, theraiAnonKey);
