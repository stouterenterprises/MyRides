import { createServiceClient } from '../_shared/supabase.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    const id = url.searchParams.get('id');

    if (!slug && !id) {
      return errorResponse('Either slug or id is required');
    }

    const supabase = createServiceClient();

    let query = supabase
      .from('shops')
      .select('*, markets(*)')
      .in('status', ['approved', 'active']);

    if (slug) {
      query = query.eq('slug', slug);
    } else {
      query = query.eq('id', id);
    }

    const { data: shop, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('Shop not found', 404);
      }
      throw error;
    }

    return successResponse(shop);
  } catch (error) {
    console.error('Error fetching shop details:', error);
    return errorResponse(error.message, 500);
  }
});
