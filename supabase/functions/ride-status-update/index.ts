import { createServiceClient, createSupabaseClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { ride_id, status, delivery_proof_url } = body;

    if (!ride_id || !status) {
      return errorResponse('Missing required fields');
    }

    const supabase = createServiceClient();

    // Get ride
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('*')
      .eq('id', ride_id)
      .single();

    if (rideError || !ride) {
      return errorResponse('Ride not found');
    }

    // Get driver for this ride
    const { data: driver } = await supabase
      .from('drivers')
      .select('user_id')
      .eq('id', ride.driver_id)
      .single();

    // Verify authorization (must be the driver)
    if (!driver || driver.user_id !== user.id) {
      return errorResponse('Unauthorized', 403);
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      matched: ['driver_arriving', 'cancelled_by_driver'],
      driver_arriving: ['driver_arrived', 'cancelled_by_driver'],
      driver_arrived: ['in_progress', 'arriving_at_pickup', 'cancelled_by_driver'],
      arriving_at_pickup: ['picked_up', 'cancelled_by_driver'],
      picked_up: ['arriving_at_dropoff', 'cancelled_by_driver'],
      in_progress: ['completed', 'arriving_at_dropoff', 'cancelled_by_driver'],
      arriving_at_dropoff: ['delivered', 'cancelled_by_driver'],
      delivered: ['completed'],
    };

    if (!validTransitions[ride.status]?.includes(status)) {
      return errorResponse(`Invalid status transition from ${ride.status} to ${status}`);
    }

    // Update ride
    const updateData: any = { status };

    if (status === 'in_progress' && !ride.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    if (status === 'completed' && !ride.completed_at) {
      updateData.completed_at = new Date().toISOString();
    }

    if (delivery_proof_url) {
      updateData.delivery_proof_url = delivery_proof_url;
    }

    const { data: updatedRide, error: updateError } = await supabase
      .from('rides')
      .update(updateData)
      .eq('id', ride_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log event
    await supabase.from('ride_events').insert({
      ride_id: ride.id,
      event_type: `status_changed_${status}`,
      actor_id: user.id,
      metadata: { old_status: ride.status, new_status: status },
    });

    // Send notification to rider
    await supabase.from('notifications').insert({
      user_id: ride.rider_id,
      type: 'ride_status',
      title: `Your ${ride.job_type} is ${status.replace(/_/g, ' ')}`,
      body: getStatusMessage(status, ride.job_type),
      data: { ride_id: ride.id, status },
    });

    return successResponse(updatedRide);
  } catch (error) {
    console.error('Error updating ride status:', error);
    return errorResponse(error.message, 500);
  }
});

function getStatusMessage(status: string, jobType: string): string {
  const messages: Record<string, string> = {
    driver_arriving: `Your driver is on the way`,
    driver_arrived: `Your driver has arrived`,
    in_progress: `Your ${jobType} is in progress`,
    arriving_at_pickup: `Driver is arriving at pickup location`,
    picked_up: `Order picked up, on the way to you`,
    arriving_at_dropoff: `Driver is arriving at dropoff`,
    delivered: `Your order has been delivered`,
    completed: `Your ${jobType} is complete`,
  };
  return messages[status] || `Status updated to ${status}`;
}
