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
    const { market_id } = body;

    if (!market_id) {
      return errorResponse('market_id is required');
    }

    const supabase = createServiceClient();

    // Activate the market
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .update({
        status: 'active',
        activated_at: new Date().toISOString(),
      })
      .eq('id', market_id)
      .select()
      .single();

    if (marketError) throw marketError;

    // Notify all users who requested this market
    const { data: requests } = await supabase
      .from('market_requests')
      .select('user_id')
      .eq('merged_to_market_id', market_id)
      .eq('status', 'approved');

    if (requests && requests.length > 0) {
      const notifications = requests.map((req) => ({
        user_id: req.user_id,
        type: 'market_active',
        title: `${market.name} is now active!`,
        body: `Great news! The market you requested is now available.`,
        data: { market_id },
      }));

      await supabase.from('notifications').insert(notifications);
    }

    return successResponse(market);
  } catch (error) {
    console.error('Error activating market:', error);
    return errorResponse(error.message, error.message.includes('Forbidden') ? 403 : 500);
  }
});
