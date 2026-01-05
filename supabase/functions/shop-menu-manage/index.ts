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
    const method = req.method;

    const supabase = createServiceClient();

    // Get shop_id from query or body
    const shopId = url.searchParams.get('shop_id') || (await req.json().catch(() => ({}))).shop_id;

    if (!shopId) {
      return errorResponse('shop_id is required');
    }

    // Verify user has permission to manage menu for this shop
    const { data: staffRecord } = await supabase
      .from('shop_staff')
      .select('role, permissions')
      .eq('shop_id', shopId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staffRecord || !['owner', 'manager'].includes(staffRecord.role)) {
      return errorResponse('You do not have permission to manage this shop menu', 403);
    }

    if (!(staffRecord.permissions?.manage_menu)) {
      return errorResponse('You do not have menu management permissions', 403);
    }

    // Handle different methods
    if (method === 'GET') {
      // List menu items
      const { data: items, error } = await supabase
        .from('shop_menu_items')
        .select('*')
        .eq('shop_id', shopId)
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return successResponse(items);
    }

    if (method === 'POST') {
      // Create menu item
      const body = await req.json();
      const { name, description, category, price_cents, image_url, preparation_time_minutes } = body;

      if (!name || !price_cents) {
        return errorResponse('name and price_cents are required');
      }

      const { data: item, error } = await supabase
        .from('shop_menu_items')
        .insert({
          shop_id: shopId,
          name,
          description,
          category,
          price_cents,
          image_url,
          preparation_time_minutes: preparation_time_minutes || 15,
        })
        .select()
        .single();

      if (error) throw error;
      return successResponse(item, 201);
    }

    if (method === 'PUT') {
      // Update menu item
      const body = await req.json();
      const { item_id, ...updates } = body;

      if (!item_id) {
        return errorResponse('item_id is required');
      }

      const { data: item, error } = await supabase
        .from('shop_menu_items')
        .update(updates)
        .eq('id', item_id)
        .eq('shop_id', shopId)
        .select()
        .single();

      if (error) throw error;
      return successResponse(item);
    }

    if (method === 'DELETE') {
      // Delete menu item
      const itemId = url.searchParams.get('item_id');

      if (!itemId) {
        return errorResponse('item_id is required');
      }

      const { error } = await supabase
        .from('shop_menu_items')
        .delete()
        .eq('id', itemId)
        .eq('shop_id', shopId);

      if (error) throw error;
      return successResponse({ deleted: true });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    console.error('Error managing shop menu:', error);
    return errorResponse(error.message, 500);
  }
});
