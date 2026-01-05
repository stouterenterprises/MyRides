import { createServiceClient } from '../_shared/supabase.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const url = new URL(req.url);
    const market_id = url.searchParams.get('market_id');
    const category = url.searchParams.get('category');

    const supabase = createServiceClient();

    let query = supabase
      .from('shops')
      .select('*')
      .in('status', ['approved', 'active'])
      .order('name');

    if (market_id) {
      query = query.eq('market_id', market_id);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data: shops, error } = await query;

    if (error) throw error;

    return successResponse(shops);
  } catch (error) {
    console.error('Error fetching shops:', error);
    return errorResponse(error.message, 500);
  }
});
