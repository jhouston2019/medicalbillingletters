import Stripe from "stripe";
import { buffer } from "micro";
import { getSupabaseAdmin } from "./_supabase.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = { path: "/.netlify/functions/stripe-webhook" };

export async function handler(event) {
  try {
    const sig = event.headers["stripe-signature"];
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body || "");
    let evt;

    try {
      evt = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object;
      const recordId = session.metadata?.recordId || null;
      const customerEmail = session.customer_details?.email || session.customer_email;

      console.log('Checkout completed:', {
        sessionId: session.id,
        recordId,
        email: customerEmail,
        paymentStatus: session.payment_status
      });

      const supabase = getSupabaseAdmin();

      if (recordId) {
        // Update specific record
        const { error } = await supabase
          .from("claim_letters")
          .update({
            stripe_session_id: session.id,
            stripe_payment_status: session.payment_status,
            payment_status: 'paid',
            letter_generated: false, // Explicitly mark as not yet generated
            updated_at: new Date().toISOString()
          })
          .eq("id", recordId);

        if (error) {
          console.error('Failed to update record:', error);
          
          // Check if it's a unique constraint violation (session ID reuse attempt)
          if (error.code === '23505') {
            console.error('🚨 SECURITY ALERT: Attempted reuse of Stripe session ID:', session.id);
          }
        } else {
          console.log('✅ Payment verified for record:', recordId);
        }
      } else if (customerEmail) {
        // Create payment record for user
        const { error } = await supabase
          .from("claim_letters")
          .insert({
            user_email: customerEmail,
            stripe_session_id: session.id,
            stripe_payment_status: session.payment_status,
            payment_status: 'paid',
            letter_generated: false, // One payment = one letter (not yet used)
            status: 'payment_completed',
            file_name: 'pending_upload',
            file_path: 'pending_upload'
          });

        if (error) {
          console.error('Failed to create payment record:', error);
          
          // Check if it's a unique constraint violation (session ID reuse attempt)
          if (error.code === '23505') {
            console.error('🚨 SECURITY ALERT: Attempted reuse of Stripe session ID:', session.id);
          }
        } else {
          console.log('✅ Payment record created for:', customerEmail);
        }
      }
    }

    // Handle subscription events (if using subscriptions)
    if (evt.type === "customer.subscription.created" || 
        evt.type === "customer.subscription.updated") {
      const subscription = evt.data.object;
      const customerId = subscription.customer;

      const supabase = getSupabaseAdmin();
      
      // Update or create subscription record
      await supabase
        .from("subscriptions")
        .upsert({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          plan_type: subscription.metadata?.plan_type || 'STANDARD',
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
        }, {
          onConflict: 'stripe_subscription_id'
        });
    }

    if (evt.type === "customer.subscription.deleted") {
      const subscription = evt.data.object;
      
      const supabase = getSupabaseAdmin();
      await supabase
        .from("subscriptions")
        .update({ status: 'canceled' })
        .eq("stripe_subscription_id", subscription.id);
    }

    return { statusCode: 200, body: "ok" };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
}