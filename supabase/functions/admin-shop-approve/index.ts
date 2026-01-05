import { createServiceClient } from '../_shared/supabase.ts';
import { requireRole } from '../_shared/auth.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const { user } = await requireRole(req, 'admin');
    const body = await req.json();
    const { shop_request_id, action, market_id, admin_notes } = body;

    if (!shop_request_id || !action) {
      return errorResponse('shop_request_id and action are required');
    }

    if (!['approve', 'reject'].includes(action)) {
      return errorResponse('action must be: approve or reject');
    }

    if (action === 'approve' && !market_id) {
      return errorResponse('market_id is required for approval');
    }

    const supabase = createServiceClient();

    // Get shop request
    const { data: shopRequest, error: requestError } = await supabase
      .from('shop_requests')
      .select('*')
      .eq('id', shop_request_id)
      .single();

    if (requestError || !shopRequest) {
      return errorResponse('Shop request not found');
    }

    if (shopRequest.status !== 'pending') {
      return errorResponse('Shop request is not in pending status');
    }

    if (action === 'reject') {
      // Reject the request
      const { data: updated, error: updateError } = await supabase
        .from('shop_requests')
        .update({
          status: 'rejected',
          admin_notes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq('id', shop_request_id)
        .select()
        .single();

      if (updateError) throw updateError;

      return successResponse(updated);
    }

    // Approve and create shop
    const slug = generateSlug(shopRequest.business_name);

    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .insert({
        market_id,
        name: shopRequest.business_name,
        slug,
        category: shopRequest.category,
        description: shopRequest.description,
        address: shopRequest.address,
        location_lat: shopRequest.location_lat,
        location_lng: shopRequest.location_lng,
        phone: shopRequest.contact_phone,
        email: shopRequest.contact_email,
        logo_url: shopRequest.logo_url,
        cover_url: shopRequest.cover_url,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      })
      .select()
      .single();

    if (shopError) throw shopError;

    // Update shop request
    await supabase
      .from('shop_requests')
      .update({
        status: 'approved',
        created_shop_id: shop.id,
        admin_notes,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', shop_request_id);

    return successResponse({ shop, shop_request: shopRequest });
  } catch (error) {
    console.error('Error processing shop approval:', error);
    return errorResponse(error.message, error.message.includes('Forbidden') ? 403 : 500);
  }
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).substring(2, 8);
}
