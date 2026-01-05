import { createServiceClient } from '../_shared/supabase.ts';
import { errorResponse, corsHeaders } from '../_shared/response.ts';
import Stripe from 'https://esm.sh/stripe@14.12.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return errorResponse('Missing stripe-signature header', 400);
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return errorResponse('Webhook secret not configured', 500);
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return errorResponse(`Webhook Error: ${err.message}`, 400);
    }

    const supabase = createServiceClient();

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSuccess(supabase, paymentIntent);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailure(supabase, paymentIntent);
        break;
      }

      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentCanceled(supabase, paymentIntent);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return errorResponse(error.message, 500);
  }
});

async function handlePaymentSuccess(supabase: any, paymentIntent: Stripe.PaymentIntent) {
  const { ride_id, tip_cents } = paymentIntent.metadata;

  // Update payment status
  const { data: payment } = await supabase
    .from('payments')
    .update({
      status: 'succeeded',
      stripe_charge_id: paymentIntent.latest_charge,
    })
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .select()
    .single();

  if (!payment) {
    console.error('Payment not found for PI:', paymentIntent.id);
    return;
  }

  // Update ledger entries from pending to available
  const { data: ledgerEntries } = await supabase
    .from('ledger_entries')
    .update({ status: 'available' })
    .eq('ride_id', ride_id)
    .eq('status', 'pending')
    .select();

  console.log(`Updated ${ledgerEntries?.length || 0} ledger entries to available`);

  // Log event
  await supabase.from('ride_events').insert({
    ride_id,
    event_type: 'payment_succeeded',
    metadata: {
      payment_id: payment.id,
      amount_cents: paymentIntent.amount,
      charge_id: paymentIntent.latest_charge,
    },
  });

  // Get ride details for notification
  const { data: ride } = await supabase
    .from('rides')
    .select('rider_id, driver_id, job_type')
    .eq('id', ride_id)
    .single();

  if (ride) {
    // Notify rider
    await supabase.from('notifications').insert({
      user_id: ride.rider_id,
      type: 'payment',
      title: 'Payment successful',
      body: `Your payment of $${(paymentIntent.amount / 100).toFixed(2)} was processed successfully`,
      data: { ride_id, payment_id: payment.id },
    });

    // Notify driver
    if (ride.driver_id) {
      const { data: driver } = await supabase
        .from('drivers')
        .select('user_id')
        .eq('id', ride.driver_id)
        .single();

      if (driver) {
        await supabase.from('notifications').insert({
          user_id: driver.user_id,
          type: 'payment',
          title: 'Earnings confirmed',
          body: `Payment received for your ${ride.job_type}`,
          data: { ride_id, payment_id: payment.id },
        });
      }
    }
  }
}

async function handlePaymentFailure(supabase: any, paymentIntent: Stripe.PaymentIntent) {
  const { ride_id } = paymentIntent.metadata;

  await supabase
    .from('payments')
    .update({
      status: 'failed',
      failure_reason: paymentIntent.last_payment_error?.message || 'Payment failed',
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  await supabase.from('ride_events').insert({
    ride_id,
    event_type: 'payment_failed',
    metadata: {
      payment_intent_id: paymentIntent.id,
      error: paymentIntent.last_payment_error?.message,
    },
  });

  // Get ride for notification
  const { data: ride } = await supabase
    .from('rides')
    .select('rider_id')
    .eq('id', ride_id)
    .single();

  if (ride) {
    await supabase.from('notifications').insert({
      user_id: ride.rider_id,
      type: 'payment',
      title: 'Payment failed',
      body: 'Your payment could not be processed. Please try again.',
      data: { ride_id },
    });
  }
}

async function handlePaymentCanceled(supabase: any, paymentIntent: Stripe.PaymentIntent) {
  const { ride_id } = paymentIntent.metadata;

  await supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  await supabase.from('ride_events').insert({
    ride_id,
    event_type: 'payment_canceled',
    metadata: { payment_intent_id: paymentIntent.id },
  });
}
