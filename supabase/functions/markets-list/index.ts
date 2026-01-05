import { createServiceClient } from '../_shared/supabase.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const supabase = createServiceClient();

    const { data: markets, error } = await supabase
      .from('markets')
      .select('*')
      .eq('status', 'active')
      .order('name');

    if (error) throw error;

    return successResponse(markets);
  } catch (error) {
    console.error('Error fetching markets:', error);
    return errorResponse(error.message, 500);
  }
});
