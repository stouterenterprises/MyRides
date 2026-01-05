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
    const { key, value } = body;

    if (!key || value === undefined) {
      return errorResponse('key and value are required');
    }

    const supabase = createServiceClient();

    // Upsert config
    const { data: config, error } = await supabase
      .from('config')
      .upsert({
        key,
        value,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(config);
  } catch (error) {
    console.error('Error updating config:', error);
    return errorResponse(error.message, error.message.includes('Forbidden') ? 403 : 500);
  }
});
