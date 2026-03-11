import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const { product_type, session_id } = await req.json();

    if (!product_type || !session_id) {
      return new Response(JSON.stringify({ error: "Missing required fields (product_type, session_id)" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ALLOWED_PRODUCTS = ['memesupreme-pack-5', 'memesupreme-pack-20', 'memesupreme-roast'];
    if (!ALLOWED_PRODUCTS.includes(product_type)) {
      return new Response(JSON.stringify({ error: "Invalid product type" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[MemeSupreme] Creating checkout for product: ${product_type}, session: ${session_id}`);

    // 1. Fetch pricing from price_list (e.g. 'memesupreme-roast')
    // We use product_type as the ID in price_list
    const { data: plan, error: planError } = await supabase
      .from('price_list')
      .select('id, stripe_price_id, unit_price_usd')
      .eq('id', product_type)
      .single();

    if (planError || !plan) {
      console.error('[MemeSupreme] Plan lookup error:', planError);
      return new Response(JSON.stringify({ error: "Product not found in price list" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!plan.stripe_price_id) {
      return new Response(JSON.stringify({ error: "Stripe price ID not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountCents = Math.round(plan.unit_price_usd * 100);

    // 2. Create the Meme Supreme Order Record (Pending)
    const { data: order, error: orderError } = await supabase
      .from('memesupreme_orders')
      .insert({
        price_list_id: plan.id,
        product_type: product_type,
        amount_usd: amountCents,
        session_id: session_id,
        status: 'pending'
      })
      .select('id')
      .single();

    if (orderError || !order) {
      console.error('[MemeSupreme] Failed to create order:', orderError);
      throw new Error("Failed to create pending order record");
    }

    const orderId = order.id;
    console.log(`[MemeSupreme] Created pending order: ${orderId}`);

    // 3. Create Stripe Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'], // Apple/Google Pay are supported by default in Checkout via 'card'
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: 'payment',
      client_reference_id: orderId, // Links Stripe payload back to our DB
      success_url: `https://memesupreme.co?order_id=${orderId}&success=true`,
      cancel_url: `https://memesupreme.co`,
      metadata: {
        app: "memesupreme",
        feature: "generate_meme",
        order_id: orderId,
        session_id: session_id
      }
    });

    // 4. Update order with Stripe Session ID
    await supabase
      .from('memesupreme_orders')
      .update({ stripe_session_id: checkoutSession.id })
      .eq('id', orderId);

    console.log(`[MemeSupreme] Checkout session created: ${checkoutSession.id}`);

    // 5. Return Checkout URL to client
    return new Response(JSON.stringify({
      url: checkoutSession.url,
      order_id: orderId,
      session_id: checkoutSession.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[MemeSupreme] Create checkout error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
