import { createSupabaseClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const user = await requireAuth(req);
    const body = await req.json();

    const { location_lat, location_lng, city, state, country } = body;

    if (!location_lat || !location_lng || !city || !country) {
      return errorResponse('Missing required fields');
    }

    const supabase = createSupabaseClient(req.headers.get('Authorization')!);

    // Check if user already has a pending request in this area
    const { data: existing } = await supabase
      .from('market_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return errorResponse('You already have a pending market request', 400);
    }

    const { data: marketRequest, error } = await supabase
      .from('market_requests')
      .insert({
        user_id: user.id,
        location_lat,
        location_lng,
        city,
        state,
        country,
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(marketRequest, 201);
  } catch (error) {
    console.error('Error creating market request:', error);
    return errorResponse(error.message, 500);
  }
});
