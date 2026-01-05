import { createServiceClient } from '../_shared/supabase.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const body = await req.json();

    const {
      business_name,
      category,
      address,
      city,
      state,
      country,
      location_lat,
      location_lng,
      contact_name,
      contact_email,
      contact_phone,
      description,
      logo_url,
      cover_url,
    } = body;

    if (!business_name || !category || !address || !city || !country ||
        !contact_name || !contact_email || !contact_phone) {
      return errorResponse('Missing required fields');
    }

    const supabase = createServiceClient();

    // Create shop request
    const { data: shopRequest, error } = await supabase
      .from('shop_requests')
      .insert({
        business_name,
        category,
        address,
        city,
        state,
        country,
        location_lat,
        location_lng,
        contact_name,
        contact_email,
        contact_phone,
        description,
        logo_url,
        cover_url,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(shopRequest, 201);
  } catch (error) {
    console.error('Error creating shop request:', error);
    return errorResponse(error.message, 500);
  }
});
