import { createServiceClient, createSupabaseClient } from '../_shared/supabase.ts';
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

    const {
      job_type,
      pickup_address,
      pickup_lat,
      pickup_lng,
      dropoff_address,
      dropoff_lat,
      dropoff_lng,
      shop_id,
      delivery_instructions,
      delivery_order_summary,
    } = body;

    if (!job_type || !pickup_address || !dropoff_address) {
      return errorResponse('Missing required fields');
    }

    const supabase = createServiceClient();
    const config = await getAllConfig();

    // Calculate distance (simplified - using Haversine formula)
    const distance_km = calculateDistance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);

    // Find market
    const { data: markets } = await supabase
      .from('markets')
      .select('*')
      .eq('status', 'active');

    const market = markets?.find((m: any) => {
      const marketDist = calculateDistance(pickup_lat, pickup_lng, m.center_lat, m.center_lng);
      return marketDist <= m.radius_km;
    });

    if (!market) {
      return errorResponse('No active market found for this location. Submit a market request!', 400);
    }

    // Calculate estimated fare
    let estimated_fare_cents: number;
    if (job_type === 'ride') {
      const base = getConfigValue(config, 'ride_base_fee_cents', 250);
      const perKm = getConfigValue(config, 'ride_per_km_cents', 150);
      const minimum = getConfigValue(config, 'ride_minimum_fee_cents', 500);
      estimated_fare_cents = Math.max(base + (distance_km * perKm), minimum);
    } else {
      const base = getConfigValue(config, 'delivery_base_fee_cents', 300);
      const perKm = getConfigValue(config, 'delivery_per_km_cents', 100);
      const minimum = getConfigValue(config, 'delivery_minimum_fee_cents', 500);
      estimated_fare_cents = Math.max(base + (distance_km * perKm), minimum);
    }

    // Create ride
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .insert({
        job_type,
        rider_id: user.id,
        market_id: market.id,
        shop_id: shop_id || null,
        status: 'requested',
        pickup_address,
        pickup_lat,
        pickup_lng,
        dropoff_address,
        dropoff_lat,
        dropoff_lng,
        distance_km,
        estimated_fare_cents: Math.round(estimated_fare_cents),
        delivery_instructions,
        delivery_order_summary,
      })
      .select()
      .single();

    if (rideError) throw rideError;

    // Log event
    await supabase.from('ride_events').insert({
      ride_id: ride.id,
      event_type: 'ride_requested',
      actor_id: user.id,
      metadata: { job_type, market_id: market.id },
    });

    // Trigger dispatch (will be handled by dispatch-match function)
    // In production, this would be a background job or webhook
    // For MVP, we'll call it directly
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ ride_id: ride.id }),
      });
    } catch (err) {
      console.error('Failed to trigger dispatch:', err);
    }

    return successResponse(ride, 201);
  } catch (error) {
    console.error('Error creating ride:', error);
    return errorResponse(error.message, 500);
  }
});

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
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
