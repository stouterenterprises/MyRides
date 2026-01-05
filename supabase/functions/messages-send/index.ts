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
    const { ride_id, recipient_id, content } = body;

    if (!ride_id || !recipient_id || !content) {
      return errorResponse('ride_id, recipient_id, and content are required');
    }

    const supabase = createServiceClient();

    // Verify user is part of this ride
    const { data: ride } = await supabase
      .from('rides')
      .select('rider_id, driver_id, drivers!rides_driver_id_fkey(user_id)')
      .eq('id', ride_id)
      .single();

    if (!ride) {
      return errorResponse('Ride not found', 404);
    }

    const isRider = ride.rider_id === user.id;
    const isDriver = ride.drivers?.user_id === user.id;

    if (!isRider && !isDriver) {
      return errorResponse('Unauthorized', 403);
    }

    // Create message
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        ride_id,
        sender_id: user.id,
        recipient_id,
        content,
      })
      .select()
      .single();

    if (error) throw error;

    // Send notification to recipient
    await supabase.from('notifications').insert({
      user_id: recipient_id,
      type: 'message',
      title: 'New message',
      body: content.substring(0, 100),
      data: { ride_id, message_id: message.id },
    });

    return successResponse(message, 201);
  } catch (error) {
    console.error('Error sending message:', error);
    return errorResponse(error.message, 500);
  }
});
