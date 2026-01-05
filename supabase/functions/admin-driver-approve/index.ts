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
    const { driver_id, approval_status, admin_notes } = body;

    if (!driver_id || !approval_status) {
      return errorResponse('driver_id and approval_status are required');
    }

    if (!['approved', 'rejected', 'suspended'].includes(approval_status)) {
      return errorResponse('Invalid approval_status');
    }

    const supabase = createServiceClient();

    // Get driver
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('*, profiles!drivers_user_id_fkey(id)')
      .eq('id', driver_id)
      .single();

    if (driverError || !driver) {
      return errorResponse('Driver not found');
    }

    // Update driver
    const { data: updated, error: updateError } = await supabase
      .from('drivers')
      .update({
        approval_status,
        approved_at: approval_status === 'approved' ? new Date().toISOString() : null,
        approved_by: approval_status === 'approved' ? user.id : null,
      })
      .eq('id', driver_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Notify driver
    const statusMessages: Record<string, { title: string; body: string }> = {
      approved: {
        title: 'Application approved!',
        body: 'Congratulations! You can now start accepting ride requests.',
      },
      rejected: {
        title: 'Application not approved',
        body: 'Unfortunately, your driver application was not approved.',
      },
      suspended: {
        title: 'Account suspended',
        body: 'Your driver account has been suspended. Contact support for details.',
      },
    };

    const message = statusMessages[approval_status];

    await supabase.from('notifications').insert({
      user_id: driver.profiles.id,
      type: 'system',
      title: message.title,
      body: admin_notes || message.body,
      data: { driver_id, approval_status },
    });

    return successResponse(updated);
  } catch (error) {
    console.error('Error approving driver:', error);
    return errorResponse(error.message, error.message.includes('Forbidden') ? 403 : 500);
  }
});
