import { createServiceClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';
import { getAllConfig, getConfigValue } from '../_shared/config.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { offer_id } = body;

    if (!offer_id) {
      return errorResponse('offer_id is required');
    }

    const supabase = createServiceClient();
    const config = await getAllConfig();

    // Get offer with ride details
    const { data: offer, error: offerError } = await supabase
      .from('ride_offers')
      .select('*, rides(*), drivers(*)')
      .eq('id', offer_id)
      .single();

    if (offerError || !offer) {
      return errorResponse('Offer not found');
    }

    const ride = offer.rides;
    const driver = offer.drivers;

    // Verify rider owns this ride
    if (ride.rider_id !== user.id) {
      return errorResponse('Unauthorized', 403);
    }

    // Verify offer has a quote
    if (!offer.quote_fare_cents) {
      return errorResponse('This offer does not have a custom quote');
    }

    // Verify ride is still in matching state
    if (ride.status !== 'matching' && ride.status !== 'requested') {
      return errorResponse('Ride is no longer available for matching');
    }

    // Check if another driver already matched
    if (ride.driver_id) {
      return errorResponse('This ride has already been matched');
    }

    // Mark all other offers as superseded
    await supabase
      .from('ride_offers')
      .update({ offer_status: 'superseded' })
      .eq('ride_id', ride.id)
      .neq('id', offer_id);

    // Update this offer to accepted
    await supabase
      .from('ride_offers')
      .update({
        offer_status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('id', offer_id);

    // Calculate platform fee and driver earnings
    const platformCommission = getConfigValue(config, 'platform_commission_percent', 20);
    const applyCommissionToQuotes = getConfigValue(
      config,
      'platform_commission_applies_to_quotes',
      true
    );

    const finalFare = offer.quote_fare_cents;
    const platformFee = applyCommissionToQuotes
      ? Math.round((finalFare * platformCommission) / 100)
      : Math.round((offer.baseline_fare_cents * platformCommission) / 100);
    const driverEarnings = finalFare - platformFee;

    // Update ride with match
    const { data: updatedRide, error: rideUpdateError } = await supabase
      .from('rides')
      .update({
        driver_id: driver.id,
        status: 'matched',
        pricing_mode: 'driver_quote',
        selected_offer_id: offer.id,
        final_fare_cents: finalFare,
        platform_fee_cents: platformFee,
        driver_earnings_cents: driverEarnings,
        matched_at: new Date().toISOString(),
      })
      .eq('id', ride.id)
      .select()
      .single();

    if (rideUpdateError) throw rideUpdateError;

    // Create ledger entry (pending until payment succeeds)
    await supabase.from('ledger_entries').insert({
      driver_id: driver.id,
      ride_id: ride.id,
      entry_type: ride.job_type === 'ride' ? 'ride_earning' : 'delivery_earning',
      amount_cents: driverEarnings,
      status: 'pending',
      description: `${ride.job_type} from ${ride.pickup_address} to ${ride.dropoff_address}`,
    });

    // Notify driver
    await supabase.from('notifications').insert({
      user_id: driver.user_id,
      type: 'ride_matched',
      title: 'Your quote was accepted!',
      body: `Rider accepted your quote of $${(finalFare / 100).toFixed(2)}`,
      data: { ride_id: ride.id, offer_id: offer.id },
    });

    await supabase.from('ride_events').insert({
      ride_id: ride.id,
      event_type: 'quote_selected',
      actor_id: user.id,
      metadata: {
        offer_id: offer.id,
        driver_id: driver.id,
        quote_fare_cents: finalFare,
      },
    });

    return successResponse({ ride: updatedRide, offer });
  } catch (error) {
    console.error('Error selecting quote:', error);
    return errorResponse(error.message, 500);
  }
});
