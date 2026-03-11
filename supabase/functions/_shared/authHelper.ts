// ============================================================================
// AUTH HELPER - REUSABLE AUTH LAYER FOR EDGE FUNCTIONS
// ============================================================================

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { getSecureCorsHeaders } from "./secureCors.ts";

// Cached environment variables
const ENV = {
  INTERNAL_API_KEY: Deno.env.get("INTERNAL_API_KEY") || "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") || "",
};

export interface AuthContext {
  isInternalCall: boolean;
  authHeader: string | null;
  userId: string | null; // from JWT or x-user-id header
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Get auth context from request headers.
 * Detects internal calls and extracts user ID from trusted headers.
 */
export function getAuthContext(req: Request): AuthContext {
  const internalKey = req.headers.get("x-internal-key");
  const authHeader = req.headers.get("Authorization");
  const trustedUserId = req.headers.get("x-user-id");

  // Check if this is an internal call (from another edge function)
  const hasValidInternalKey = internalKey && ENV.INTERNAL_API_KEY && internalKey === ENV.INTERNAL_API_KEY;
  const hasServiceRoleKey = authHeader && ENV.SUPABASE_SERVICE_ROLE_KEY && authHeader === `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`;
  const isInternalCall = Boolean(hasValidInternalKey || hasServiceRoleKey);

  return {
    isInternalCall,
    authHeader,
    // For internal calls, trust x-user-id header
    userId: isInternalCall && trustedUserId ? trustedUserId : null,
  };
}

// Reusable auth client - avoid creating multiple clients
let _authClient: SupabaseClient | null = null;
let _lastAuthHeader: string | null = null;

function getAuthClient(authHeader: string): SupabaseClient {
  // Reuse client if same auth header
  if (_authClient && _lastAuthHeader === authHeader) {
    return _authClient;
  }

  _authClient = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  _lastAuthHeader = authHeader;

  return _authClient;
}

/**
 * Authenticate user if needed. Skips for internal calls or when user already validated.
 * OPTIMIZED: Reuses auth client instead of creating new one each time.
 */
export async function authenticateUserIfNeeded(
  authCtx: AuthContext,
  expectedUserId: string | null | undefined,
  requestId: string
): Promise<void> {
  if (authCtx.isInternalCall) {
    return;
  }

  if (!authCtx.authHeader) {
    console.error("[auth] 401: Missing Authorization header");
    throw new HttpError(401, "Missing Authorization header");
  }

  const authClient = getAuthClient(authCtx.authHeader);
  const { data: userData, error: authError } = await authClient.auth.getUser();

  if (authError || !userData?.user) {
    console.error("[auth] 401: Invalid or expired token", authError?.message ?? "no user");
    throw new HttpError(401, "Invalid or expired token");
  }

  // Always set userId from token
  authCtx.userId = userData.user.id;

  // Only check mismatch if expectedUserId was provided
  if (expectedUserId && userData.user.id !== expectedUserId) {
    throw new HttpError(403, "user_id mismatch");
  }
}

/**
 * Extract user ID from JWT without network call.
 * PRO: Zero latency. CON: Trusts the token (assumes API Gateway validated signature).
 */
export function getUserIdFromTokenLocal(authHeader: string | null): string | null {
  if (!authHeader) return null;
  try {
    const token = authHeader.replace("Bearer ", "");
    const [_header, payload, _signature] = token.split(".");
    if (!payload) return null;

    // Base64 decode
    const decodedPayload = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(decodedPayload);
    return claims.sub || null;
  } catch (e) {
    console.error("Failed to parse JWT local:", e);
    return null;
  }
}

/**
 * Ensure user has access to conversation. Returns conversation mode.
 * OPTIMIZED: Reuses auth client.
 */
export async function ensureConversationAccess(
  authCtx: AuthContext,
  chatId: string,
  requestId: string
): Promise<{ conversationExists: boolean; mode?: string }> {
  // Internal calls skip RLS check
  if (authCtx.isInternalCall) {
    return { conversationExists: true };
  }

  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
    throw new Error("Missing env: SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const authClient = getAuthClient(authCtx.authHeader ?? "");

  // Single query: get both existence and mode
  const { data, error } = await authClient
    .from("conversations")
    .select("id, mode")
    .eq("id", chatId)
    .maybeSingle();

  if (error) {
    console.error(`[${requestId}] DB Error in ensureConversationAccess:`, error);
    return { conversationExists: false };
  }

  if (!data) {
    return { conversationExists: false };
  }

  return {
    conversationExists: true,
    mode: data.mode
  };
}

/**
 * OPTIMIZED: Combined auth + conversation access check.
 * Runs both checks in parallel when possible.
 */
export async function authenticateAndCheckAccess(
  authCtx: AuthContext,
  chatId: string,
  expectedUserId: string | null | undefined,
  requestId: string
): Promise<{ conversationExists: boolean; mode?: string }> {
  // Internal calls skip both checks
  if (authCtx.isInternalCall) {
    console.info(`[${requestId}] Skipping auth+access - internal call`);
    return { conversationExists: true };
  }

  // Run auth and conversation check in parallel
  const [authResult, conversationResult] = await Promise.all([
    authenticateUserIfNeeded(authCtx, expectedUserId, requestId).then(() => ({ success: true })).catch(err => ({ success: false, error: err })),
    ensureConversationAccess(authCtx, chatId, requestId)
  ]);

  // Check auth result
  if (!authResult.success) {
    throw (authResult as any).error;
  }

  return conversationResult;
}

export function parseJsonBody(req: Request): Promise<any> {
  return req.json().catch(() => {
    throw new HttpError(400, "Invalid JSON body");
  });
}

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

/**
 * Auth middleware that validates user authentication and provides auth context
 */
export async function withAuth(
  req: Request,
  handler: (authCtx: AuthContext) => Promise<Response>
): Promise<Response> {
  try {
    const authCtx = getAuthContext(req);

    // For non-internal calls, validate the auth token
    if (!authCtx.isInternalCall) {
      await authenticateUserIfNeeded(authCtx, undefined, crypto.randomUUID().substring(0, 8));
    }

    return await handler(authCtx);
  } catch (err) {
    if (err instanceof HttpError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Auth middleware error:", err);
    return new Response(JSON.stringify({ error: "Authentication failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Auth middleware that validates conversation access
 */
export async function withConversationAuth(
  req: Request,
  chatId: string,
  handler: (authCtx: AuthContext, conversation: { conversationExists: boolean; mode?: string }) => Promise<Response>
): Promise<Response> {
  try {
    const authCtx = getAuthContext(req);
    const requestId = crypto.randomUUID().substring(0, 8);

    // Use optimized combined check
    const conversationResult = await authenticateAndCheckAccess(
      authCtx,
      chatId,
      undefined,
      requestId
    );

    return await handler(authCtx, conversationResult);
  } catch (err) {
    if (err instanceof HttpError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Conversation auth middleware error:", err);
    return new Response(JSON.stringify({ error: "Authentication or access check failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Standard CORS response for preflight requests
 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: getSecureCorsHeaders(req),
    });
  }
  return null;
}

/**
 * Wrap a handler with standard error handling and CORS
 */
export async function withStandardHandling(
  req: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const response = await handler();

    // Add CORS headers to the response
    const corsHeaders = getSecureCorsHeaders(req);
    const responseHeaders = new Headers(response.headers);

    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: {
          "Content-Type": "application/json",
          ...getSecureCorsHeaders(req),
        },
      });
    }

    console.error("Handler error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...getSecureCorsHeaders(req),
      },
    });
  }
}

/**
 * Helper to create headers for internal edge function calls.
 * Passes along the validated user_id so downstream functions skip re-auth.
 * @param callerFunction - When calling allowlisted functions (e.g. google-search), pass the current edge function name so the target can verify it (e.g. "llm-handler-gemini").
 */
export function getInternalCallHeaders(userId?: string | null, callerFunction?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  if (ENV.INTERNAL_API_KEY) {
    headers["x-internal-key"] = ENV.INTERNAL_API_KEY;
  }

  if (userId) {
    headers["x-user-id"] = userId;
  }

  if (callerFunction && callerFunction.trim() !== "") {
    headers["x-caller-function"] = callerFunction.trim();
  }

  return headers;
}
