import { createServiceClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';
import Stripe from 'https://esm.sh/stripe@14.12.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { ride_id, tip_cents } = body;

    if (!ride_id) {
      return errorResponse('ride_id is required');
    }

    const supabase = createServiceClient();

    // Get ride details
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('*')
      .eq('id', ride_id)
      .single();

    if (rideError || !ride) {
      return errorResponse('Ride not found');
    }

    // Verify rider owns this ride
    if (ride.rider_id !== user.id) {
      return errorResponse('Unauthorized', 403);
    }

    // Verify ride is in completed status
    if (ride.status !== 'completed' && ride.status !== 'delivered') {
      return errorResponse('Payment can only be created for completed rides');
    }

    // Check if payment already exists
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id, status')
      .eq('ride_id', ride_id)
      .single();

    if (existingPayment && existingPayment.status === 'succeeded') {
      return errorResponse('Payment already completed for this ride');
    }

    // Calculate total amount (final fare + tip)
    const tipAmount = tip_cents || 0;
    const totalAmount = ride.final_fare_cents + tipAmount;

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      metadata: {
        ride_id: ride.id,
        rider_id: ride.rider_id,
        driver_id: ride.driver_id || '',
        job_type: ride.job_type,
        tip_cents: tipAmount.toString(),
      },
      description: `${ride.job_type} from ${ride.pickup_address} to ${ride.dropoff_address}`,
    });

    // Create or update payment record
    let payment;
    if (existingPayment) {
      const { data, error } = await supabase
        .from('payments')
        .update({
          amount_cents: totalAmount,
          stripe_payment_intent_id: paymentIntent.id,
          status: 'pending',
        })
        .eq('id', existingPayment.id)
        .select()
        .single();

      if (error) throw error;
      payment = data;
    } else {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          ride_id: ride.id,
          rider_id: ride.rider_id,
          amount_cents: totalAmount,
          stripe_payment_intent_id: paymentIntent.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      payment = data;
    }

    // Update ride with tip if provided
    if (tipAmount > 0) {
      await supabase
        .from('rides')
        .update({ tip_cents: tipAmount })
        .eq('id', ride_id);

      // Create ledger entry for tip (pending)
      if (ride.driver_id) {
        await supabase.from('ledger_entries').insert({
          driver_id: ride.driver_id,
          ride_id: ride.id,
          entry_type: 'tip',
          amount_cents: tipAmount,
          status: 'pending',
          description: 'Customer tip',
        });
      }
    }

    await supabase.from('ride_events').insert({
      ride_id: ride.id,
      event_type: 'payment_intent_created',
      actor_id: user.id,
      metadata: {
        payment_intent_id: paymentIntent.id,
        amount_cents: totalAmount,
        tip_cents: tipAmount,
      },
    });

    return successResponse({
      payment,
      client_secret: paymentIntent.client_secret,
      amount_cents: totalAmount,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return errorResponse(error.message, 500);
  }
});
