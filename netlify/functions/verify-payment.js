/**
 * PAYMENT VERIFICATION ENDPOINT
 * 
 * Server-side verification of payment status
 * - Checks Stripe session
 * - Checks database payment status
 * - Returns verification result
 * 
 * NO CLIENT-SIDE TRUST
 */

const Stripe = require("stripe");
const { getSupabaseAdmin } = require("./_supabase");
const { isPaymentBypassEnabled } = require("./payment-enforcer");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    if (isPaymentBypassEnabled()) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          verified: true,
          hasPaid: true,
          bypass: true,
          paymentDetails: null,
          message: 'ALLOW_PAYMENT_BYPASS is set — not a real payment (testing only)'
        })
      };
    }

    const { sessionId, userId, email } = JSON.parse(event.body || '{}');

    console.log('Verifying payment:', { sessionId, userId, email });

    let isPaid = false;
    let paymentDetails = null;

    // Method 1: Verify via Stripe session ID
    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status === 'paid') {
          isPaid = true;
          paymentDetails = {
            sessionId: session.id,
            amountPaid: session.amount_total / 100,
            currency: session.currency,
            customerEmail: session.customer_details?.email || session.customer_email,
            paymentStatus: session.payment_status
          };
        }
      } catch (stripeError) {
        console.error('Stripe verification error:', stripeError);
      }
    }

    // Method 2: Check database for payment record
    if (!isPaid && (userId || email)) {
      const supabase = getSupabaseAdmin();
      
      let query = supabase
        .from('claim_letters')
        .select('*')
        .eq('payment_status', 'paid');

      if (userId) {
        query = query.eq('user_id', userId);
      } else if (email) {
        query = query.eq('user_email', email);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(1);

      if (!error && data && data.length > 0) {
        isPaid = true;
        paymentDetails = {
          documentId: data[0].id,
          paymentStatus: data[0].payment_status,
          stripeSessionId: data[0].stripe_session_id
        };
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        verified: isPaid,
        hasPaid: isPaid,
        paymentDetails: isPaid ? paymentDetails : null,
        message: isPaid ? 'Payment verified' : 'No valid payment found'
      })
    };

  } catch (error) {
    console.error('Payment verification error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Verification failed',
        details: error.message,
        verified: false,
        hasPaid: false
      })
    };
  }
};
