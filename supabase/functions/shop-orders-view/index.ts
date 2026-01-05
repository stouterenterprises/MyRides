import { createServiceClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const user = await requireAuth(req);
    const url = new URL(req.url);
    const shopId = url.searchParams.get('shop_id');
    const status = url.searchParams.get('status'); // active, completed, all

    if (!shopId) {
      return errorResponse('shop_id is required');
    }

    const supabase = createServiceClient();

    // Verify user is staff member of this shop
    const { data: staffRecord } = await supabase
      .from('shop_staff')
      .select('role, permissions')
      .eq('shop_id', shopId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staffRecord) {
      return errorResponse('You do not have access to this shop', 403);
    }

    // Build query
    let query = supabase
      .from('rides')
      .select(`
        *,
        profiles!rides_rider_id_fkey(id, full_name, phone),
        drivers(id, user_id, vehicle_make, vehicle_model, vehicle_plate),
        order_items(*)
      `)
      .eq('shop_id', shopId)
      .eq('job_type', 'delivery')
      .order('created_at', { ascending: false });

    // Filter by status
    if (status === 'active') {
      query = query.not('status', 'in', '(completed,cancelled_by_rider,cancelled_by_driver,cancelled_by_system)');
    } else if (status === 'completed') {
      query = query.eq('status', 'completed');
    }

    const { data: orders, error } = await query.limit(50);

    if (error) throw error;

    // Format response with order details
    const formattedOrders = orders?.map((order) => ({
      ...order,
      order_items_summary: order.order_items?.map((item: any) => ({
        name: item.item_name,
        quantity: item.quantity,
        price: item.price_cents,
        instructions: item.special_instructions,
      })),
      customer_name: order.profiles?.full_name,
      customer_phone: order.profiles?.phone,
      driver_info: order.drivers ? {
        vehicle: `${order.drivers.vehicle_make} ${order.drivers.vehicle_model}`,
        plate: order.drivers.vehicle_plate,
      } : null,
    }));

    return successResponse(formattedOrders || []);
  } catch (error) {
    console.error('Error fetching shop orders:', error);
    return errorResponse(error.message, 500);
  }
});
