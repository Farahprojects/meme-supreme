export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function getCorsHeaders(request: Request): Record<string, string> {
  const ALLOWED_ORIGINS = [
    'https://memesupreme.co',
    'https://www.memesupreme.co',
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  const origin = request.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
                    origin.endsWith('.memesupreme.co') ||
                    origin.endsWith('.supabase.co') ||
                    origin.endsWith('.vercel.app');

  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
  };
}
