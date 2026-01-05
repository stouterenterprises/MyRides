import { createServiceClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { lat, lng, heading, speed_kmh, ride_id } = body;

    if (lat === undefined || lng === undefined) {
      return errorResponse('lat and lng are required');
    }

    const supabase = createServiceClient();

    // Get driver
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (driverError || !driver) {
      return errorResponse('Driver profile not found', 404);
    }

    // Update driver location and heartbeat
    await supabase
      .from('drivers')
      .update({
        last_location_lat: lat,
        last_location_lng: lng,
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', driver.id);

    // Record location history
    await supabase.from('driver_locations').insert({
      driver_id: driver.id,
      ride_id: ride_id || null,
      lat,
      lng,
      heading,
      speed_kmh,
    });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error recording location:', error);
    return errorResponse(error.message, 500);
  }
});
