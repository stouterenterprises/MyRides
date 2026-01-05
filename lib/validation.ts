import { z } from 'zod';

// =====================================================
// Zod Validation Schemas
// =====================================================

// Market Request
export const createMarketRequestSchema = z.object({
  location_lat: z.number().min(-90).max(90),
  location_lng: z.number().min(-180).max(180),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  country: z.string().min(2).max(100),
});

export const activateMarketSchema = z.object({
  market_id: z.string().uuid(),
});

// Ride Request
export const createRideRequestSchema = z.object({
  job_type: z.enum(['ride', 'delivery']),
  pickup_address: z.string().min(1).max(500),
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  dropoff_address: z.string().min(1).max(500),
  dropoff_lat: z.number().min(-90).max(90),
  dropoff_lng: z.number().min(-180).max(180),
  shop_id: z.string().uuid().optional(),
  delivery_instructions: z.string().max(1000).optional(),
  delivery_order_summary: z.string().max(2000).optional(),
});

// Offer Response
export const respondToOfferSchema = z.object({
  offer_id: z.string().uuid(),
  action: z.enum(['accept', 'reject']),
  quote_fare_cents: z.number().int().positive().optional(),
});

// Ride Status Update
export const updateRideStatusSchema = z.object({
  ride_id: z.string().uuid(),
  status: z.enum([
    'driver_arriving',
    'driver_arrived',
    'in_progress',
    'arriving_at_pickup',
    'picked_up',
    'arriving_at_dropoff',
    'delivered',
    'completed',
  ]),
  delivery_proof_url: z.string().url().optional(),
});

// Message
export const sendMessageSchema = z.object({
  ride_id: z.string().uuid(),
  recipient_id: z.string().uuid(),
  content: z.string().min(1).max(1000),
});

// Location Ping
export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed_kmh: z.number().min(0).optional(),
  ride_id: z.string().uuid().optional(),
});

// Driver Onboarding
export const driverOnboardSchema = z.object({
  market_id: z.string().uuid(),
  accepts_rides: z.boolean().default(true),
  accepts_deliveries: z.boolean().default(false),
  vehicle_make: z.string().max(50).optional(),
  vehicle_model: z.string().max(50).optional(),
  vehicle_year: z.number().int().min(1900).max(2100).optional(),
  vehicle_plate: z.string().max(20).optional(),
  vehicle_color: z.string().max(30).optional(),
  license_number: z.string().max(50).optional(),
});

// Driver Approval
export const approveDriverSchema = z.object({
  driver_id: z.string().uuid(),
  approval_status: z.enum(['approved', 'rejected', 'suspended']),
  admin_notes: z.string().max(1000).optional(),
});

// Payout Request
export const requestExpeditedPayoutSchema = z.object({
  amount_cents: z.number().int().positive().optional(),
});

// Shop Request
export const createShopRequestSchema = z.object({
  business_name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  country: z.string().min(2).max(100),
  location_lat: z.number().min(-90).max(90).optional(),
  location_lng: z.number().min(-180).max(180).optional(),
  contact_name: z.string().min(1).max(100),
  contact_email: z.string().email().max(200),
  contact_phone: z.string().min(1).max(50),
  description: z.string().max(2000).optional(),
  logo_url: z.string().url().optional(),
  cover_url: z.string().url().optional(),
});

// Shop Approval
export const approveShopSchema = z.object({
  shop_request_id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  market_id: z.string().uuid().optional(),
  admin_notes: z.string().max(1000).optional(),
});

// Config Update
export const updateConfigSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
});

// Payment Intent
export const createPaymentIntentSchema = z.object({
  ride_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  tip_cents: z.number().int().min(0).default(0),
});

// Stripe Webhook
export const stripeWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.any(),
  }),
});

// Helper: validate with Zod
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function validateSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.errors.map(e => e.message).join(', ') };
}
