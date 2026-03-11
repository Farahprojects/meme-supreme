// Secure CORS configuration for Meme Supreme
// Production domains are strictly controlled

const ALLOWED_ORIGINS = [
  // Production domains
  'https://memesupreme.co',
  'https://www.memesupreme.co',
  'https://cossyqsvqxatbbhysdur.supabase.co',
  // Development
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];

/**
 * Get secure CORS headers for a request
 * Allows requests from whitelisted origins + wildcard subdomains
 */
export function getSecureCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';

  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.memesupreme.co') ||
    origin.endsWith('.supabase.co') ||
    origin.endsWith('.vercel.app');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

/**
 * Handle CORS preflight OPTIONS requests
 */
export function handleCorsOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getSecureCorsHeaders(request),
  });
}
