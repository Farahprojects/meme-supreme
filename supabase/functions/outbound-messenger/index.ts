// @ts-nocheck - Deno runtime, types checked at deployment
// Outbound message sender via SMTP endpoint

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { handleCorsOptions, getSecureCorsHeaders } from "../_shared/secureCors.ts";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

interface LogData {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, any>;
  page?: string;
}

// Structured logging function
function logMessage(message: string, logData: Omit<LogData, 'message'>) {
  const { level, data = {}, page = 'outbound-messenger' } = logData;
  const logObject = {
    level,
    message,
    page,
    data: { ...data, timestamp: new Date().toISOString() }
  };

  // Log in a format that will be easy to parse
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(logObject));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  const corsHeaders = getSecureCorsHeaders(req);

  try {
    // Generate unique request ID for correlation with VPS logs
    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    logMessage("Outbound email request received", { level: 'info', data: { method: req.method, requestId, timestamp } });

    // Initialize Supabase client (no auth required for testing)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Log raw request data for debugging (sanitizing sensitive data)
    const rawBody = await req.text();
    logMessage("Request body received", {
      level: 'debug',
      data: { bodyLength: rawBody.length }
    });

    // Parse the body again since we consumed it
    const { to, subject, html, text, from } = JSON.parse(rawBody) as EmailPayload;

    logMessage("Processing outbound email request", {
      level: 'info',
      data: {
        to,
        subject,
        htmlLength: html?.length || 0,
        textLength: text?.length || 0,
        from: from || "default"
      }
    });

    if (!to || !subject || (!html && !text)) {
      logMessage("Missing required fields in email request", {
        level: 'error',
        data: { hasTo: !!to, hasSubject: !!subject, hasHtml: !!html }
      });
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check if SMTP endpoint is configured
    const smtpEndpoint = Deno.env.get("OUTBOUND_SMTP_ENDPOINT");
    if (!smtpEndpoint) {
      logMessage("Outbound SMTP endpoint not configured", {
        level: 'error',
        data: { envVar: "OUTBOUND_SMTP_ENDPOINT" }
      });
      return new Response(JSON.stringify({ error: "Outbound SMTP endpoint not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const fromAddress = from || "noreply@memesupreme.co";

    let payloadSlug = "noreply";
    let payloadDomain = "memesupreme.co";

    if (fromAddress.includes('@')) {
      const parts = fromAddress.split('@');
      if (parts.length === 2 && parts[0] && parts[1]) {
        payloadSlug = parts[0];
        payloadDomain = parts[1];
      }
    }

    // Send email to VPS SMTP endpoint
    logMessage("Sending email to VPS SMTP endpoint", {
      level: 'info',
      data: {
        smtpEndpoint,
        to,
        subject,
        from: fromAddress
      }
    });

    // Build the payload in the format expected by the external SMTP service
    const smtpPayload = {
      slug: payloadSlug,
      domain: payloadDomain,
      to_email: to,
      subject: subject,
      body: text || html, // Use text version if available, otherwise HTML
      request_id: requestId, // Add request ID for VPS correlation
      timestamp: timestamp
    };

    // Log final payload being sent to VPS
    logMessage("📧 FINAL PAYLOAD TO VPS:", {
      level: 'info',
      data: { payload: smtpPayload }
    });

    let smtpResponse;
    let smtpResult;

    try {
      smtpResponse = await fetch(smtpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'memesupreme-outbound-messenger/1.0'
        },
        body: JSON.stringify(smtpPayload)
      });

      const responseText = await smtpResponse.text();

      logMessage("VPS SMTP endpoint response received", {
        level: 'info',
        data: {
          status: smtpResponse.status,
          statusText: smtpResponse.statusText,
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200)
        }
      });

      // Try to parse JSON response
      try {
        smtpResult = JSON.parse(responseText);
      } catch (parseError) {
        smtpResult = { success: smtpResponse.ok, message: responseText };
      }

    } catch (fetchError) {
      logMessage("Failed to reach VPS SMTP endpoint", {
        level: 'error',
        data: {
          error: fetchError instanceof Error ? fetchError.message : String(fetchError),
          smtpEndpoint,
          to,
          subject
        }
      });
      return new Response(JSON.stringify({ error: "Failed to reach SMTP endpoint", details: fetchError instanceof Error ? fetchError.message : String(fetchError) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check if VPS approved the email
    if (!smtpResponse.ok || (smtpResult && smtpResult.success === false)) {
      logMessage("VPS SMTP endpoint rejected email", {
        level: 'warn',
        data: {
          status: smtpResponse.status,
          response: smtpResult,
          to,
          subject
        }
      });
      return new Response(JSON.stringify({
        error: "Email rejected by SMTP endpoint",
        details: smtpResult?.message || smtpResult?.error || "Unknown rejection reason"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    logMessage("VPS SMTP endpoint approved email", {
      level: 'info',
      data: {
        response: smtpResult,
        to,
        subject
      }
    });

    // Save outbound email to email_messages table
    const { error: dbError } = await supabase
      .from('email_messages')
      .insert({
        subject: subject,
        body: html || text || '',
        from_address: from || 'noreply@memesupreme.co',
        to_address: to,
        direction: 'outbound',
        sent_via: 'outbound-messenger',
        is_read: true,
        is_starred: false,
        is_archived: false,
        raw_headers: JSON.stringify({
          vps_response: smtpResult,
          vps_status: smtpResponse.status,
          request_id: requestId
        })
      });

    if (dbError) {
      logMessage("Failed to save outbound email to database", {
        level: 'error',
        data: {
          requestId,
          error: dbError.message,
          to,
          subject
        }
      });
      return new Response(JSON.stringify({ error: "Failed to save email to database", details: dbError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    logMessage("Outbound email saved to database successfully", {
      level: 'info',
      data: {
        requestId,
        to,
        subject,
        direction: 'outbound'
      }
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    logMessage("Unexpected error in outbound-messenger", {
      level: 'error',
      data: {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      }
    });
    return new Response(JSON.stringify({ error: "Unexpected error", details: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
