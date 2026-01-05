// =====================================================
// Shared TypeScript Types
// =====================================================

export type UserRole = 'rider' | 'driver' | 'admin' | 'shop_owner' | 'shop_manager' | 'shop_staff';
export type ShopStaffRole = 'owner' | 'manager' | 'cashier' | 'server' | 'kitchen';
export type MarketStatus = 'coming_soon' | 'active' | 'paused';
export type MarketRequestStatus = 'pending' | 'approved' | 'rejected' | 'merged';
export type JobType = 'ride' | 'delivery';
export type RideStatus =
  | 'requested'
  | 'matching'
  | 'matched'
  | 'driver_arriving'
  | 'driver_arrived'
  | 'in_progress'
  | 'arriving_at_pickup'
  | 'picked_up'
  | 'arriving_at_dropoff'
  | 'delivered'
  | 'completed'
  | 'cancelled_by_rider'
  | 'cancelled_by_driver'
  | 'cancelled_by_system';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'superseded';
export type PricingMode = 'baseline' | 'driver_quote';
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';
export type LedgerEntryType =
  | 'ride_earning'
  | 'delivery_earning'
  | 'platform_fee'
  | 'tip'
  | 'cancellation_fee'
  | 'bonus'
  | 'adjustment'
  | 'payout'
  | 'payout_fee'
  | 'refund';
export type LedgerEntryStatus = 'pending' | 'available' | 'paid_out' | 'reversed';
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type PayoutMethod = 'stripe_connect' | 'paypal';
export type DriverApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type ShopStatus = 'pending' | 'approved' | 'active' | 'suspended' | 'rejected';
export type NotificationType =
  | 'ride_request'
  | 'ride_matched'
  | 'ride_status'
  | 'message'
  | 'payment'
  | 'payout'
  | 'market_active'
  | 'shop_approved'
  | 'system';

// Database tables
export interface Profile {
  id: string;
  role: UserRole;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Market {
  id: string;
  name: string;
  code: string;
  status: MarketStatus;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  timezone: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
}

export interface MarketRequest {
  id: string;
  user_id: string;
  location_lat: number;
  location_lng: number;
  city: string;
  state: string | null;
  country: string;
  status: MarketRequestStatus;
  merged_to_market_id: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface Driver {
  id: string;
  user_id: string;
  market_id: string | null;
  approval_status: DriverApprovalStatus;
  accepts_rides: boolean;
  accepts_deliveries: boolean;
  is_online: boolean;
  last_location_lat: number | null;
  last_location_lng: number | null;
  last_heartbeat: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  license_number: string | null;
  stripe_account_id: string | null;
  paypal_email: string | null;
  preferred_payout_method: PayoutMethod | null;
  documents: any[];
  rating_avg: number;
  rating_count: number;
  total_rides: number;
  total_deliveries: number;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface Shop {
  id: string;
  market_id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  address: string;
  location_lat: number;
  location_lng: number;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  cover_url: string | null;
  status: ShopStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface ShopRequest {
  id: string;
  business_name: string;
  category: string;
  address: string;
  city: string;
  state: string | null;
  country: string;
  location_lat: number | null;
  location_lng: number | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  status: ShopStatus;
  created_shop_id: string | null;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface Ride {
  id: string;
  job_type: JobType;
  rider_id: string;
  driver_id: string | null;
  market_id: string;
  shop_id: string | null;
  status: RideStatus;
  pricing_mode: PricingMode;
  selected_offer_id: string | null;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number | null;
  estimated_fare_cents: number;
  final_fare_cents: number | null;
  platform_fee_cents: number | null;
  driver_earnings_cents: number | null;
  tip_cents: number;
  delivery_instructions: string | null;
  delivery_order_summary: string | null;
  delivery_proof_url: string | null;
  requested_at: string;
  matched_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RideEvent {
  id: string;
  ride_id: string;
  event_type: string;
  actor_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface RideOffer {
  id: string;
  ride_id: string;
  driver_id: string;
  baseline_fare_cents: number;
  quote_fare_cents: number | null;
  offer_status: OfferStatus;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  ride_id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export interface DriverLocation {
  id: string;
  driver_id: string;
  ride_id: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed_kmh: number | null;
  created_at: string;
}

export interface Payment {
  id: string;
  ride_id: string;
  rider_id: string;
  amount_cents: number;
  status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  failure_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  driver_id: string;
  ride_id: string | null;
  payout_id: string | null;
  entry_type: LedgerEntryType;
  amount_cents: number;
  status: LedgerEntryStatus;
  description: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface Payout {
  id: string;
  driver_id: string;
  amount_cents: number;
  fee_cents: number;
  net_amount_cents: number;
  method: PayoutMethod;
  status: PayoutStatus;
  is_expedited: boolean;
  stripe_transfer_id: string | null;
  paypal_batch_id: string | null;
  paypal_payout_item_id: string | null;
  failure_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  completed_at: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
}

export interface Config {
  key: string;
  value: any;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface ShopStaff {
  id: string;
  shop_id: string;
  user_id: string;
  role: ShopStaffRole;
  permissions: {
    manage_orders: boolean;
    manage_menu: boolean;
    manage_staff: boolean;
    view_analytics: boolean;
  };
  is_active: boolean;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopHours {
  id: string;
  shop_id: string;
  day_of_week: number; // 0-6, 0 = Sunday
  open_time: string;
  close_time: string;
  is_closed: boolean;
  created_at: string;
}

export interface ShopMenuItem {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  preparation_time_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  ride_id: string;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  price_cents: number;
  special_instructions: string | null;
  created_at: string;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}
