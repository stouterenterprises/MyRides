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

    const {
      market_id,
      accepts_rides,
      accepts_deliveries,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      vehicle_plate,
      vehicle_color,
      license_number,
    } = body;

    if (!market_id) {
      return errorResponse('market_id is required');
    }

    const supabase = createServiceClient();

    // Check if driver profile already exists
    const { data: existing } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return errorResponse('Driver profile already exists', 400);
    }

    // Verify market exists and is active
    const { data: market } = await supabase
      .from('markets')
      .select('id, status')
      .eq('id', market_id)
      .single();

    if (!market || market.status !== 'active') {
      return errorResponse('Invalid or inactive market');
    }

    // Create driver profile
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .insert({
        user_id: user.id,
        market_id,
        approval_status: 'pending',
        accepts_rides: accepts_rides !== false,
        accepts_deliveries: accepts_deliveries || false,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        vehicle_plate,
        vehicle_color,
        license_number,
      })
      .select()
      .single();

    if (driverError) throw driverError;

    // Notify admins
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      const notifications = admins.map((admin: any) => ({
        user_id: admin.id,
        type: 'system',
        title: 'New driver application',
        body: `A new driver has applied in market ${market_id}`,
        data: { driver_id: driver.id },
      }));

      await supabase.from('notifications').insert(notifications);
    }

    return successResponse(driver, 201);
  } catch (error) {
    console.error('Error creating driver profile:', error);
    return errorResponse(error.message, 500);
  }
});
