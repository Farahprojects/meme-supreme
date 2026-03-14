import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { handleCorsOptions, getSecureCorsHeaders } from "../_shared/secureCors.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Use the service role key to bypass RLS for auth operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface AuthRequest {
  action: 'request_otc' | 'verify_otc' | 'request_otc_reset' | 'verify_otc_reset';
  email: string;
  token?: string; // Only needed for verify_otc / verify_otc_reset
  password?: string;
  new_password?: string; // Only for verify_otc_reset
}

// Generate a random 6-digit OTC
function generateOTC(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  const corsHeaders = getSecureCorsHeaders(req);

  try {
    const body = await req.json() as AuthRequest;
    const { action, email, token, password, new_password } = body;

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: "Valid email is required" }), { status: 400, headers: corsHeaders });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (action === 'request_otc') {
      // 1. Generate 6-digit OTC
      const otc = generateOTC();

      // Generate expiration (5 minutes from now)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);

      // 2. Ensure user_profile exists
      const { error: profileError } = await supabase
        .from('user_profile')
        .upsert({ email: normalizedEmail }, { onConflict: 'email', ignoreDuplicates: true });

      if (profileError) {
        console.error("Profile Upsert Error:", profileError);
        throw new Error("Failed to initialize user profile");
      }

      // 3. Save OTC to otc_tokens table
      const { error: otcError } = await supabase
        .from('otc_tokens')
        .insert({
          email: normalizedEmail,
          token: otc,
          expires_at: expiresAt.toISOString()
        });

      if (otcError) {
        console.error("OTC Insert Error:", otcError);
        throw new Error("Failed to generate security token");
      }

      // 4. Fetch email template and send via internal outbound-messenger
      let emailHtml = "";
      let emailSubject = `${otc} is your Meme Supreme login code`;

      try {
        const { data: templateData, error: templateErr } = await supabase
          .from("email_notification_templates")
          .select("subject, body_html")
          .eq("template_type", "auth_otc")
          .single();

        if (templateErr || !templateData) {
          console.error("Template fetch failed, falling back to basic:", templateErr);
          emailHtml = `<p>Your Meme Supreme code is: <strong>${otc}</strong> (expires in 5 minutes)</p>`;
        } else {
          emailHtml = templateData.body_html.replace(/\{\{otc\}\}/g, otc);
          emailSubject = templateData.subject.replace(/\{\{otc\}\}/g, otc);
        }
      } catch (err) {
        console.error("Error fetching template from DB:", err);
        emailHtml = `<p>Your Meme Supreme code is: <strong>${otc}</strong> (expires in 5 minutes)</p>`;
      }

      try {
        const messengerRes = await fetch(`${SUPABASE_URL}/functions/v1/outbound-messenger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            to: normalizedEmail,
            subject: emailSubject,
            html: emailHtml
          })
        });

        if (!messengerRes.ok) {
          console.error("Failed to trigger outbound-messenger:", await messengerRes.text());
        }
      } catch (err) {
        console.error("Error calling outbound-messenger:", err);
      }

      return new Response(JSON.stringify({ success: true, message: "Code sent" }), { status: 200, headers: corsHeaders });

    } else if (action === 'verify_otc') {
      if (!token) {
        return new Response(JSON.stringify({ error: "Code is required" }), { status: 400, headers: corsHeaders });
      }

      // 1. Check OTC in database
      const { data: otcRecord, error: otcLookupError } = await supabase
        .from('otc_tokens')
        .select('*')
        .eq('email', normalizedEmail)
        .eq('token', token.trim())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (otcLookupError || !otcRecord) {
        return new Response(JSON.stringify({ error: "Invalid code." }), { status: 400, headers: corsHeaders });
      }

      // 2. Check Expiration
      if (new Date(otcRecord.expires_at) < new Date()) {
        // Delete expired token
        await supabase.from('otc_tokens').delete().eq('id', otcRecord.id);
        return new Response(JSON.stringify({ error: "Code has expired. Please request a new one." }), { status: 400, headers: corsHeaders });
      }

      // 3. Mark email as verified in user_profile
      await supabase
        .from('user_profile')
        .update({ is_email_verified: true })
        .eq('email', normalizedEmail);

      // 4. Delete the used OTC token so it can't be reused
      await supabase.from('otc_tokens').delete().eq('id', otcRecord.id);

      // 5. Generate a true Supabase Auth Session (Admin API)
      if (!password) {
        return new Response(JSON.stringify({ error: "Password is required for registration" }), { status: 400, headers: corsHeaders });
      }

      let authUser;

      // Look up user directly by email — avoids fetching all users
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: password,
        email_confirm: true,
      });

      if (createError) {
        if (createError.message.toLowerCase().includes('already been registered') || createError.message.toLowerCase().includes('already exists')) {
          // User exists — find them via user_profile which stores the auth id
          const { data: profileRow } = await supabase
            .from('user_profile')
            .select('auth_user_id, is_email_verified')
            .eq('email', normalizedEmail)
            .single();

          if (profileRow?.is_email_verified && profileRow?.auth_user_id) {
            return new Response(JSON.stringify({ error: "This code cannot be used to access this account. Please sign in normally." }), { status: 400, headers: corsHeaders });
          }

          if (profileRow?.auth_user_id) {
            await supabase.auth.admin.updateUserById(profileRow.auth_user_id, { password, email_confirm: true });
            authUser = { id: profileRow.auth_user_id, email: normalizedEmail };
          } else {
            throw new Error("Failed to provision auth user");
          }
        } else {
          throw new Error("Failed to provision auth user: " + createError.message);
        }
      } else {
        authUser = newUser.user;
        // Store auth_user_id in user_profile for future lookups
        await supabase
          .from('user_profile')
          .update({ auth_user_id: authUser.id })
          .eq('email', normalizedEmail);
      }

      // 6. Perform standard sign in with the user's chosen password
      const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password
      });

      if (signInError || !sessionData.session) {
        console.error("Failed to vend session:", signInError);
        throw new Error("Failed to finalize login session.");
      }

      // Return the real Supabase Auth session back to the client!
      return new Response(JSON.stringify({
        success: true,
        session: sessionData.session
      }), { status: 200, headers: corsHeaders });

    } else if (action === 'request_otc_reset') {
      // Check the user exists in user_profile — no need for auth_user_id here
      const { data: profileRow } = await supabase
        .from('user_profile')
        .select('email')
        .eq('email', normalizedEmail)
        .single();

      if (!profileRow) {
        // Don't reveal whether the email exists
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      }

      const otc = generateOTC();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);

      const { error: otcError } = await supabase
        .from('otc_tokens')
        .insert({
          email: normalizedEmail,
          token: otc,
          expires_at: expiresAt.toISOString()
        });

      if (otcError) {
        console.error("OTC reset insert error:", otcError);
        return new Response(JSON.stringify({ error: "Failed to generate reset code. Try again." }), { status: 500, headers: corsHeaders });
      }

      let emailHtml = `<p>Your password reset code is: <strong>${otc}</strong> (expires in 5 minutes)</p>`;
      let emailSubject = "Reset your Meme Supreme password";

      const { data: templateData, error: templateErr } = await supabase
        .from("email_notification_templates")
        .select("subject, body_html")
        .eq("template_type", "auth_otc_reset")
        .single();

      if (!templateErr && templateData) {
        emailHtml = templateData.body_html.replace(/\{\{otc\}\}/g, otc);
        emailSubject = templateData.subject.replace(/\{\{otc\}\}/g, otc);
      }

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/outbound-messenger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ to: normalizedEmail, subject: emailSubject, html: emailHtml })
        });
      } catch (err) {
        console.error("Outbound messenger error:", err);
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });

    } else if (action === 'verify_otc_reset') {
      if (!token) {
        return new Response(JSON.stringify({ error: "Code is required" }), { status: 400, headers: corsHeaders });
      }
      if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
        return new Response(JSON.stringify({ error: "New password must be at least 6 characters" }), { status: 400, headers: corsHeaders });
      }

      const { data: otcRecord, error: otcLookupError } = await supabase
        .from('otc_tokens')
        .select('*')
        .eq('email', normalizedEmail)
        .eq('token', token.trim())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (otcLookupError || !otcRecord) {
        return new Response(JSON.stringify({ error: "Invalid code." }), { status: 400, headers: corsHeaders });
      }

      if (new Date(otcRecord.expires_at) < new Date()) {
        await supabase.from('otc_tokens').delete().eq('id', otcRecord.id);
        return new Response(JSON.stringify({ error: "Code has expired. Please request a new one." }), { status: 400, headers: corsHeaders });
      }

      await supabase.from('otc_tokens').delete().eq('id', otcRecord.id);

      // Find the auth user by email — works without needing auth_user_id stored in user_profile
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const authUser = listData?.users?.find((u) => u.email === normalizedEmail);

      if (listError || !authUser) {
        return new Response(JSON.stringify({ error: "Account not found. Please sign up." }), { status: 400, headers: corsHeaders });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, { password: new_password });

      if (updateError) {
        console.error("Password update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update password. Try again." }), { status: 500, headers: corsHeaders });
      }

      const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: new_password
      });

      if (signInError || !sessionData.session) {
        return new Response(JSON.stringify({ error: "Password updated but sign-in failed. Please sign in with your new password." }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true, session: sessionData.session }), { status: 200, headers: corsHeaders });

    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });
    }

  } catch (error) {
    console.error("Auth Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
