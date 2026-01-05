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
    const { shop_id, action, staff_user_id, role, permissions } = body;

    if (!shop_id || !action) {
      return errorResponse('shop_id and action are required');
    }

    const supabase = createServiceClient();

    // Verify user is owner or manager with staff management permission
    const { data: staffRecord } = await supabase
      .from('shop_staff')
      .select('role, permissions')
      .eq('shop_id', shop_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staffRecord || staffRecord.role !== 'owner') {
      if (staffRecord?.role !== 'manager' || !staffRecord.permissions?.manage_staff) {
        return errorResponse('You do not have permission to manage staff', 403);
      }
    }

    if (action === 'list') {
      const { data: staff, error } = await supabase
        .from('shop_staff')
        .select('*, profiles!shop_staff_user_id_fkey(id, email, full_name)')
        .eq('shop_id', shop_id)
        .order('role', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return successResponse(staff);
    }

    if (action === 'invite') {
      if (!staff_user_id || !role) {
        return errorResponse('staff_user_id and role are required');
      }

      // Check if user exists
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', staff_user_id)
        .single();

      if (!profile) {
        return errorResponse('User not found', 404);
      }

      // Create staff record
      const { data: newStaff, error } = await supabase
        .from('shop_staff')
        .insert({
          shop_id,
          user_id: staff_user_id,
          role,
          permissions: permissions || getDefaultPermissions(role),
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return errorResponse('User is already staff member', 400);
        }
        throw error;
      }

      // Notify user
      await supabase.from('notifications').insert({
        user_id: staff_user_id,
        type: 'system',
        title: 'Shop staff invitation',
        body: `You've been invited to join a shop as ${role}`,
        data: { shop_id, staff_id: newStaff.id },
      });

      return successResponse(newStaff, 201);
    }

    if (action === 'update') {
      if (!staff_user_id) {
        return errorResponse('staff_user_id is required');
      }

      const updates: any = {};
      if (role) updates.role = role;
      if (permissions) updates.permissions = permissions;

      const { data: updated, error } = await supabase
        .from('shop_staff')
        .update(updates)
        .eq('shop_id', shop_id)
        .eq('user_id', staff_user_id)
        .select()
        .single();

      if (error) throw error;
      return successResponse(updated);
    }

    if (action === 'remove') {
      if (!staff_user_id) {
        return errorResponse('staff_user_id is required');
      }

      // Can't remove owner
      const { data: targetStaff } = await supabase
        .from('shop_staff')
        .select('role')
        .eq('shop_id', shop_id)
        .eq('user_id', staff_user_id)
        .single();

      if (targetStaff?.role === 'owner') {
        return errorResponse('Cannot remove shop owner', 400);
      }

      const { error } = await supabase
        .from('shop_staff')
        .update({ is_active: false })
        .eq('shop_id', shop_id)
        .eq('user_id', staff_user_id);

      if (error) throw error;
      return successResponse({ removed: true });
    }

    return errorResponse('Invalid action. Use: list, invite, update, remove');
  } catch (error) {
    console.error('Error managing shop staff:', error);
    return errorResponse(error.message, 500);
  }
});

function getDefaultPermissions(role: string) {
  const permissions: Record<string, any> = {
    owner: {
      manage_orders: true,
      manage_menu: true,
      manage_staff: true,
      view_analytics: true,
    },
    manager: {
      manage_orders: true,
      manage_menu: true,
      manage_staff: true,
      view_analytics: true,
    },
    cashier: {
      manage_orders: true,
      manage_menu: false,
      manage_staff: false,
      view_analytics: false,
    },
    server: {
      manage_orders: true,
      manage_menu: false,
      manage_staff: false,
      view_analytics: false,
    },
    kitchen: {
      manage_orders: true,
      manage_menu: false,
      manage_staff: false,
      view_analytics: false,
    },
  };

  return permissions[role] || permissions.cashier;
}
