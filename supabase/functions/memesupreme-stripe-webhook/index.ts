// @ts-nocheck - Deno runtime
// Meme Supreme - Isolated Stripe Webhook Handler

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from "npm:stripe@14.21.0";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const signature = req.headers.get('stripe-signature');
    const body = await req.text();
    const endpointSecret = Deno.env.get('STRIPE_MEMESUPREME_WEBHOOK_SECRET'); // Isolated secret

    if (!signature || !endpointSecret) {
      console.error('[MemeSupreme Webhook] Missing signature or secret');
      return new Response('Missing signature or secret', { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
    } catch (err) {
      console.error('[MemeSupreme Webhook] Signature verification failed:', err);
      return new Response('Invalid signature', { status: 400 });
    }

    console.log(`[MemeSupreme Webhook] Processing event: ${event.type}`);

    // Verify this is actually for Meme Supreme before doing anything
    const isMemeSupremeEvent = (obj: any): boolean => {
      // Check Stripe metadata explicitly provided during checkout session creation
      if (obj?.metadata?.app === 'memesupreme') return true;
      return false;
    };

    const obj = event.data.object as any;

    if (!isMemeSupremeEvent(obj)) {
      console.log(`[MemeSupreme Webhook] Received webhook not intended for Meme Supreme. Ignoring.`);
      return new Response(JSON.stringify({ received: true, ignored: true }), { status: 200 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.client_reference_id;

        if (!orderId) {
          console.error('[MemeSupreme Webhook] Missing client_reference_id on checkout session');
          break;
        }

        console.log(`[MemeSupreme Webhook] Fulfillment - Attempting to mark order ${orderId} as Paid`);

        const { data, error } = await supabase
          .from('memesupreme_orders')
          .update({
            status: 'paid',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
          .eq('status', 'pending') // Ensure we only update pending orders (idempotency)
          .select()
          .single();

        if (error) {
          console.error(`[MemeSupreme Webhook] Error updating order status for ${orderId}:`, error);
        } else if (data) {
          console.log(`[MemeSupreme Webhook] Success: Flipped order ${orderId} from 'pending' to 'paid'`);

          // ADD CREDITS Logic
          let creditsToAdd = 0;
          if (data.product_type === 'memesupreme-pack-5') {
            creditsToAdd = 5;
          } else if (data.product_type === 'memesupreme-pack-20') {
            creditsToAdd = 20;
          } else if (data.product_type === 'memesupreme-roast') {
            creditsToAdd = 1; // Fallback legacy
          }

          if (creditsToAdd > 0 && data.session_id) {
            // First try to select existing credits
            const { data: credData } = await supabase
              .from('memesupreme_credits')
              .select('credits_remaining')
              .eq('session_id', data.session_id)
              .single();

            const newBalance = (credData?.credits_remaining || 0) + creditsToAdd;

            const { error: credErr } = await supabase
              .from('memesupreme_credits')
              .upsert({
                session_id: data.session_id,
                credits_remaining: newBalance,
                updated_at: new Date().toISOString()
              }, { onConflict: 'session_id' });

            if (credErr) {
              console.error(`[MemeSupreme Webhook] Error adding ${creditsToAdd} credits for session ${data.session_id}:`, credErr);
            } else {
              console.log(`[MemeSupreme Webhook] Successfully added ${creditsToAdd} credits to session ${data.session_id}. New balance: ${newBalance}`);
            }
          }

        } else {
          console.log(`[MemeSupreme Webhook] Notice: Order ${orderId} was not updated. It may not exist or is no longer 'pending'`);
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.client_reference_id;

        if (!orderId) {
          console.error('[MemeSupreme Webhook] Missing client_reference_id on expired session');
          break;
        }

        console.log(`[MemeSupreme Webhook] Session Expired - Attempting to mark order ${orderId} as Failed`);

        const { data, error } = await supabase
          .from('memesupreme_orders')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
          .eq('status', 'pending') // We only move to failed if it's currently pending
          .select()
          .single();

        if (error) {
          console.error(`[MemeSupreme Webhook] Error updating order status for ${orderId}:`, error);
        } else if (data) {
          console.log(`[MemeSupreme Webhook] Success: Flipped order ${orderId} from 'pending' to 'failed'`);
        } else {
          console.log(`[MemeSupreme Webhook] Notice: Order ${orderId} was not updated. It may not exist or is no longer 'pending'`);
        }
        break;
      }

      // Reset usage counters when a subscription renews (new billing period starts)
      case 'invoice.payment_succeeded': {
        const inv = event.data.object as any;
        // Only reset on a recurring cycle, not on the first payment
        if (inv.billing_reason === 'subscription_cycle' && inv.subscription) {
          console.log(`[MemeSupreme Webhook] Billing cycle renewal for subscription ${inv.subscription} — resetting usage counters`);
          const { error: resetErr } = await supabase
            .from('subscriptions')
            .update({
              images_used: 0,
              reels_used: 0,
              current_period_start: new Date(inv.period_start * 1000).toISOString(),
              current_period_end:   new Date(inv.period_end   * 1000).toISOString(),
            })
            .eq('stripe_subscription_id', inv.subscription);
          if (resetErr) console.error('[MemeSupreme Webhook] Failed to reset usage counters:', resetErr);
          else console.log(`[MemeSupreme Webhook] Usage counters reset for subscription ${inv.subscription}`);
        }
        break;
      }

      // Keep period dates and status in sync on any subscription change
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as any;
        console.log(`[MemeSupreme Webhook] Subscription updated ${stripeSub.id} — syncing period and status`);
        const updatePayload: Record<string, unknown> = {
          status: stripeSub.status,
          current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
          current_period_end:   new Date(stripeSub.current_period_end   * 1000).toISOString(),
        };
        // If the period start changed, it's a renewal — reset counters
        const { data: existingRow } = await supabase
          .from('subscriptions')
          .select('current_period_start')
          .eq('stripe_subscription_id', stripeSub.id)
          .single();
        if (
          existingRow?.current_period_start &&
          existingRow.current_period_start !== updatePayload.current_period_start
        ) {
          updatePayload.images_used = 0;
          updatePayload.reels_used  = 0;
          console.log(`[MemeSupreme Webhook] Period changed — also resetting counters`);
        }
        const { error: updateErr } = await supabase
          .from('subscriptions')
          .update(updatePayload)
          .eq('stripe_subscription_id', stripeSub.id);
        if (updateErr) console.error('[MemeSupreme Webhook] Failed to update subscription:', updateErr);
        break;
      }

      default:
        console.log(`[MemeSupreme Webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[MemeSupreme Webhook] Handler error:', error);
    return new Response('Internal server error', { status: 500 });
  }
});
