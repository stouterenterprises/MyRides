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
    const { offer_id, action, quote_fare_cents } = body;

    if (!offer_id || !action) {
      return errorResponse('Missing required fields');
    }

    if (!['accept', 'reject', 'quote'].includes(action)) {
      return errorResponse('Invalid action. Must be: accept, reject, or quote');
    }

    const supabase = createServiceClient();
    const config = await getAllConfig();

    // Get offer
    const { data: offer, error: offerError } = await supabase
      .from('ride_offers')
      .select('*, rides(*)')
      .eq('id', offer_id)
      .single();

    if (offerError || !offer) {
      return errorResponse('Offer not found');
    }

    // Get driver
    const { data: driver } = await supabase
      .from('drivers')
      .select('*')
      .eq('id', offer.driver_id)
      .single();

    if (!driver || driver.user_id !== user.id) {
      return errorResponse('Unauthorized', 403);
    }

    // Check if offer is still valid
    if (offer.offer_status !== 'pending') {
      return errorResponse('Offer is no longer pending');
    }

    if (new Date(offer.expires_at) < new Date()) {
      await supabase
        .from('ride_offers')
        .update({ offer_status: 'expired' })
        .eq('id', offer_id);
      return errorResponse('Offer has expired');
    }

    // Check if ride is still available
    const ride = offer.rides;
    if (ride.status !== 'matching' && ride.status !== 'requested') {
      return errorResponse('Ride is no longer available');
    }

    // Handle QUOTE action
    if (action === 'quote') {
      const quoteEnabled = getConfigValue(config, 'driver_quote_enabled', true);

      if (!quoteEnabled) {
        return errorResponse('Custom quotes are not enabled');
      }

      if (!quote_fare_cents) {
        return errorResponse('quote_fare_cents is required for quote action');
      }

      // Validate quote constraints
      const minPercent = getConfigValue(config, 'driver_quote_min_percent_of_estimate', 80);
      const maxPercent = getConfigValue(config, 'driver_quote_max_percent_of_estimate', 200);
      const flatMin = getConfigValue(config, 'driver_quote_flat_min_cents', 300);
      const flatMax = getConfigValue(config, 'driver_quote_flat_max_cents', 100000);

      const minByPercent = (ride.estimated_fare_cents * minPercent) / 100;
      const maxByPercent = (ride.estimated_fare_cents * maxPercent) / 100;

      if (quote_fare_cents < Math.max(minByPercent, flatMin)) {
        return errorResponse(
          `Quote too low. Minimum: $${(Math.max(minByPercent, flatMin) / 100).toFixed(2)}`
        );
      }

      if (quote_fare_cents > Math.min(maxByPercent, flatMax)) {
        return errorResponse(
          `Quote too high. Maximum: $${(Math.min(maxByPercent, flatMax) / 100).toFixed(2)}`
        );
      }

      // Update offer with quote
      const { data: updatedOffer, error: updateError } = await supabase
        .from('ride_offers')
        .update({
          quote_fare_cents,
          responded_at: new Date().toISOString(),
        })
        .eq('id', offer_id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Notify rider about the quote
      await supabase.from('notifications').insert({
        user_id: ride.rider_id,
        type: 'ride_request',
        title: 'New quote received',
        body: `Driver quoted $${(quote_fare_cents / 100).toFixed(2)} for your ${ride.job_type}`,
        data: { ride_id: ride.id, offer_id: offer.id, quote_fare_cents },
      });

      await supabase.from('ride_events').insert({
        ride_id: ride.id,
        event_type: 'driver_quote_submitted',
        actor_id: user.id,
        metadata: { offer_id: offer.id, quote_fare_cents },
      });

      return successResponse({ ...updatedOffer, action: 'quote_submitted' });
    }

    // Handle REJECT action
    if (action === 'reject') {
      const { data: updatedOffer, error: updateError } = await supabase
        .from('ride_offers')
        .update({
          offer_status: 'rejected',
          responded_at: new Date().toISOString(),
        })
        .eq('id', offer_id)
        .select()
        .single();

      if (updateError) throw updateError;

      await supabase.from('ride_events').insert({
        ride_id: ride.id,
        event_type: 'driver_rejected_offer',
        actor_id: user.id,
        metadata: { offer_id: offer.id },
      });

      return successResponse({ ...updatedOffer, action: 'rejected' });
    }

    // Handle ACCEPT action (direct accept, no quote)
    if (action === 'accept') {
      // Check if another driver already accepted
      const { data: existingMatch } = await supabase
        .from('rides')
        .select('driver_id')
        .eq('id', ride.id)
        .single();

      if (existingMatch?.driver_id) {
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
      const finalFare = offer.baseline_fare_cents;
      const platformFee = Math.round((finalFare * platformCommission) / 100);
      const driverEarnings = finalFare - platformFee;

      // Update ride with match
      const { data: updatedRide, error: rideUpdateError } = await supabase
        .from('rides')
        .update({
          driver_id: driver.id,
          status: 'matched',
          pricing_mode: 'baseline',
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

      // Notify rider
      await supabase.from('notifications').insert({
        user_id: ride.rider_id,
        type: 'ride_matched',
        title: 'Driver matched!',
        body: `Your ${ride.job_type} has been matched with a driver`,
        data: { ride_id: ride.id, driver_id: driver.id },
      });

      await supabase.from('ride_events').insert({
        ride_id: ride.id,
        event_type: 'ride_matched',
        actor_id: user.id,
        metadata: { offer_id: offer.id, driver_id: driver.id },
      });

      return successResponse({ ride: updatedRide, action: 'matched' });
    }

    return errorResponse('Invalid action');
  } catch (error) {
    console.error('Error responding to offer:', error);
    return errorResponse(error.message, 500);
  }
});
