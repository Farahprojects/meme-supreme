// supabase/functions/_shared/baseHandler.ts
// Centralized Edge Function Handler with Optimized Auth

import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { getSecureCorsHeaders } from "./secureCors.ts";
import { createPooledClient } from "./supabaseClient.ts";

// Internal API key for trusted inter-function calls
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

export interface RequestContext {
    requestId: string;
    startTime: number;
    corsHeaders: Record<string, string>;
    supabase: SupabaseClient;
    userId?: string | undefined;
    user_id?: string | undefined; // Compatibility
    isInternalCall: boolean;
    isAuthenticated: boolean;
}

export interface HandlerOptions {
    /** If true, validates JWT and requires auth. Default: false (public) */
    requireAuth?: boolean;
    /** If true, skips auth for internal calls with x-internal-key. Default: true */
    trustInternalCalls?: boolean;
}

export type HandlerFn = (req: Request, context: RequestContext) => Promise<Response>;

/**
 * Validates if request is from an internal trusted source.
 * Checks x-internal-key header or service role key in Authorization.
 */
function isInternalRequest(req: Request): boolean {
    const internalKey = req.headers.get("x-internal-key");
    const authHeader = req.headers.get("Authorization");

    // Check x-internal-key header
    if (internalKey && INTERNAL_API_KEY && internalKey === INTERNAL_API_KEY) {
        return true;
    }

    // Check if Authorization contains service role key (for edge-to-edge calls)
    if (authHeader && SUPABASE_SERVICE_ROLE_KEY && authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
        return true;
    }

    return false;
}

/**
 * Extracts user ID from x-user-id header (trusted internal calls only).
 */
function getTrustedUserId(req: Request): string | undefined {
    return req.headers.get("x-user-id") || undefined;
}

/**
 * Professional Edge Function Wrapper.
 * Standardizes CORS, Authentication, Error Handling, and Logging.
 * 
 * @param handler - The handler function to wrap
 * @param options - Configuration options for auth behavior
 */
export function wrapHandler(handler: HandlerFn, options: HandlerOptions = {}) {
    const { requireAuth = false, trustInternalCalls = true } = options;

    return async (req: Request) => {
        const requestId = crypto.randomUUID().slice(0, 8);
        const startTime = Date.now();
        const corsHeaders = getSecureCorsHeaders(req);

        // Handle CORS preflight (must return 2xx so browser allows the actual request)
        if (req.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // Single Supabase client for the entire request
        const supabase = createPooledClient();

        // Determine if this is an internal call
        const isInternal = trustInternalCalls && isInternalRequest(req);

        // For internal calls, trust the x-user-id header
        let userId: string | undefined;
        let isAuthenticated = false;

        if (isInternal) {
            userId = getTrustedUserId(req);
            isAuthenticated = !!userId;
        } else if (requireAuth) {
            // Validate JWT for external calls requiring auth
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) {
                return new Response(
                    JSON.stringify({ error: "Missing Authorization header", requestId }),
                    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Use anon key client to validate the user's JWT
            const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
            const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

            if (!SUPABASE_URL || !ANON_KEY) {
                console.error(`[${requestId}] Missing SUPABASE_URL or SUPABASE_ANON_KEY`);
                return new Response(
                    JSON.stringify({ error: "Server configuration error", requestId }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const authClient = createClient(SUPABASE_URL, ANON_KEY, {
                global: { headers: { Authorization: authHeader } },
                auth: { persistSession: false }
            });

            const { data: userData, error: authError } = await authClient.auth.getUser();
            if (authError || !userData?.user) {
                console.warn(`[${requestId}] Auth failed: ${authError?.message || 'No user'}`);
                return new Response(
                    JSON.stringify({ error: "Invalid or expired token", requestId }),
                    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            userId = userData.user.id;
            isAuthenticated = true;
        }

        const context: RequestContext = {
            requestId,
            startTime,
            corsHeaders,
            supabase,
            userId,
            user_id: userId,
            isInternalCall: isInternal,
            isAuthenticated
        };

        try {
            const response = await handler(req, context);
            return response;
        } catch (err) {
            const duration = Date.now() - startTime;
            const errorMessage = err instanceof Error ? err.message : String(err);

            console.error(`[${requestId}] Failed after ${duration}ms:`, errorMessage);

            return new Response(
                JSON.stringify({
                    error: errorMessage,
                    requestId,
                    duration_ms: duration
                }),
                {
                    status: (err instanceof Error && "status" in err ? (err as { status?: number }).status : undefined) ?? 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                }
            );
        }
    };
}

/**
 * Standard JSON response helper.
 */
export function jsonResponse(
    data: Record<string, unknown>,
    status = 200,
    context?: RequestContext
) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(context?.corsHeaders || {})
    };

    const body: Record<string, unknown> = { ...data };
    if (context) {
        body.requestId = context.requestId;
        body.duration_ms = Date.now() - context.startTime;
    }

    return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Helper to create headers for internal edge function calls.
 * Passes along the validated user_id so downstream functions skip re-auth.
 * @param callerFunction - When calling allowlisted functions (e.g. google-search), pass the current edge function name (e.g. "llm-handler-gemini").
 */
export function getInternalCallHeaders(userId?: string | null, callerFunction?: string | null): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    };

    if (INTERNAL_API_KEY) {
        headers["x-internal-key"] = INTERNAL_API_KEY;
    }

    if (userId) {
        headers["x-user-id"] = userId;
    }

    if (callerFunction && callerFunction.trim() !== "") {
        headers["x-caller-function"] = callerFunction.trim();
    }

    return headers;
}
