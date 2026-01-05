import { createServiceClient } from '../_shared/supabase.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';
import { getAllConfig, getConfigValue } from '../_shared/config.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const body = await req.json();
    const { ride_id } = body;

    if (!ride_id) {
      return errorResponse('ride_id is required');
    }

    const supabase = createServiceClient();
    const config = await getAllConfig();

    // Get ride details
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('*')
      .eq('id', ride_id)
      .single();

    if (rideError || !ride) {
      return errorResponse('Ride not found');
    }

    if (ride.status !== 'requested') {
      return errorResponse('Ride is not in requested status');
    }

    // Update ride to matching status
    await supabase
      .from('rides')
      .update({ status: 'matching' })
      .eq('id', ride_id);

    // Find available drivers in the market
    const matchingRadius = getConfigValue(config, 'matching_radius_km', 10);
    const driverQuoteEnabled = getConfigValue(config, 'driver_quote_enabled', true);
    const responseWindow = getConfigValue(config, 'driver_quote_response_window_seconds', 300);

    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, user_id, last_location_lat, last_location_lng')
      .eq('market_id', ride.market_id)
      .eq('is_online', true)
      .eq('approval_status', 'approved')
      .gte('last_heartbeat', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Active in last 5 mins

    if (!drivers || drivers.length === 0) {
      await supabase.from('ride_events').insert({
        ride_id: ride.id,
        event_type: 'no_drivers_available',
        metadata: {},
      });
      return successResponse({ matched: false, reason: 'No drivers available' });
    }

    // Filter drivers by job type preference
    const eligibleDrivers = drivers.filter((d: any) => {
      if (ride.job_type === 'ride' && !d.accepts_rides) return false;
      if (ride.job_type === 'delivery' && !d.accepts_deliveries) return false;

      // Check distance
      if (d.last_location_lat && d.last_location_lng) {
        const dist = calculateDistance(
          ride.pickup_lat,
          ride.pickup_lng,
          d.last_location_lat,
          d.last_location_lng
        );
        return dist <= matchingRadius;
      }

      return true;
    });

    if (eligibleDrivers.length === 0) {
      await supabase.from('ride_events').insert({
        ride_id: ride.id,
        event_type: 'no_eligible_drivers',
        metadata: {},
      });
      return successResponse({ matched: false, reason: 'No eligible drivers in range' });
    }

    // Create offers for top N drivers (e.g., 5)
    const topDrivers = eligibleDrivers.slice(0, 5);
    const expiresAt = new Date(Date.now() + responseWindow * 1000).toISOString();

    const offers = topDrivers.map((driver: any) => ({
      ride_id: ride.id,
      driver_id: driver.id,
      baseline_fare_cents: ride.estimated_fare_cents,
      offer_status: 'pending',
      expires_at: expiresAt,
    }));

    const { data: createdOffers, error: offerError } = await supabase
      .from('ride_offers')
      .insert(offers)
      .select();

    if (offerError) throw offerError;

    // Send notifications to drivers
    const notifications = topDrivers.map((driver: any) => ({
      user_id: driver.user_id,
      type: 'ride_request',
      title: `New ${ride.job_type} request`,
      body: `${ride.pickup_address} → ${ride.dropoff_address}`,
      data: { ride_id: ride.id, job_type: ride.job_type },
    }));

    await supabase.from('notifications').insert(notifications);

    await supabase.from('ride_events').insert({
      ride_id: ride.id,
      event_type: 'offers_sent',
      metadata: { driver_count: topDrivers.length },
    });

    return successResponse({
      matched: true,
      offers_sent: createdOffers.length,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('Error dispatching ride:', error);
    return errorResponse(error.message, 500);
  }
});

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
