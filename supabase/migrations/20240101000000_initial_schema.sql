-- =====================================================
-- MyRides Platform - Complete Database Schema
-- =====================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =====================================================
-- ENUMS
-- =====================================================

CREATE TYPE user_role AS ENUM ('rider', 'driver', 'admin');
CREATE TYPE market_status AS ENUM ('coming_soon', 'active', 'paused');
CREATE TYPE market_request_status AS ENUM ('pending', 'approved', 'rejected', 'merged');
CREATE TYPE job_type AS ENUM ('ride', 'delivery');
CREATE TYPE ride_status AS ENUM (
  'requested',
  'matching',
  'matched',
  'driver_arriving',
  'driver_arrived',
  'in_progress',
  'arriving_at_pickup',
  'picked_up',
  'arriving_at_dropoff',
  'delivered',
  'completed',
  'cancelled_by_rider',
  'cancelled_by_driver',
  'cancelled_by_system'
);
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'superseded');
CREATE TYPE pricing_mode AS ENUM ('baseline', 'driver_quote');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'refunded');
CREATE TYPE ledger_entry_type AS ENUM (
  'ride_earning',
  'delivery_earning',
  'platform_fee',
  'tip',
  'cancellation_fee',
  'bonus',
  'adjustment',
  'payout',
  'payout_fee',
  'refund'
);
CREATE TYPE ledger_entry_status AS ENUM ('pending', 'available', 'paid_out', 'reversed');
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE payout_method AS ENUM ('stripe_connect', 'paypal');
CREATE TYPE driver_approval_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE shop_status AS ENUM ('pending', 'approved', 'active', 'suspended', 'rejected');
CREATE TYPE notification_type AS ENUM (
  'ride_request',
  'ride_matched',
  'ride_status',
  'message',
  'payment',
  'payout',
  'market_active',
  'shop_approved',
  'system'
);

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'rider',
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Markets
CREATE TABLE markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status market_status NOT NULL DEFAULT 'coming_soon',
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_km DOUBLE PRECISION NOT NULL DEFAULT 25,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

CREATE INDEX idx_markets_status ON markets(status);
CREATE INDEX idx_markets_location ON markets USING GIST(
  ST_MakePoint(center_lng, center_lat)::geography
);

-- Market Requests
CREATE TABLE market_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL,
  status market_request_status NOT NULL DEFAULT 'pending',
  merged_to_market_id UUID REFERENCES markets(id),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_market_requests_user ON market_requests(user_id);
CREATE INDEX idx_market_requests_status ON market_requests(status);

-- Drivers
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  market_id UUID REFERENCES markets(id),
  approval_status driver_approval_status NOT NULL DEFAULT 'pending',
  accepts_rides BOOLEAN NOT NULL DEFAULT true,
  accepts_deliveries BOOLEAN NOT NULL DEFAULT false,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_location_lat DOUBLE PRECISION,
  last_location_lng DOUBLE PRECISION,
  last_heartbeat TIMESTAMPTZ,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  vehicle_plate TEXT,
  vehicle_color TEXT,
  license_number TEXT,
  stripe_account_id TEXT,
  paypal_email TEXT,
  preferred_payout_method payout_method DEFAULT 'stripe_connect',
  documents JSONB DEFAULT '[]',
  rating_avg DECIMAL(3,2) DEFAULT 5.00,
  rating_count INTEGER NOT NULL DEFAULT 0,
  total_rides INTEGER NOT NULL DEFAULT 0,
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_drivers_user ON drivers(user_id);
CREATE INDEX idx_drivers_market ON drivers(market_id);
CREATE INDEX idx_drivers_online ON drivers(is_online, approval_status);
CREATE INDEX idx_drivers_location ON drivers USING GIST(
  ST_MakePoint(last_location_lng, last_location_lat)::geography
) WHERE is_online = true AND approval_status = 'approved';

-- Shops
CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  cover_url TEXT,
  status shop_status NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_shops_market ON shops(market_id);
CREATE INDEX idx_shops_status ON shops(status);
CREATE INDEX idx_shops_category ON shops(category);
CREATE INDEX idx_shops_slug ON shops(slug);

-- Shop Requests
CREATE TABLE shop_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name TEXT NOT NULL,
  category TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  cover_url TEXT,
  status shop_status NOT NULL DEFAULT 'pending',
  created_shop_id UUID REFERENCES shops(id),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_shop_requests_status ON shop_requests(status);

-- Rides (unified jobs table)
CREATE TABLE rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type job_type NOT NULL,
  rider_id UUID NOT NULL REFERENCES profiles(id),
  driver_id UUID REFERENCES drivers(id),
  market_id UUID NOT NULL REFERENCES markets(id),
  shop_id UUID REFERENCES shops(id),
  status ride_status NOT NULL DEFAULT 'requested',
  pricing_mode pricing_mode NOT NULL DEFAULT 'baseline',
  selected_offer_id UUID,

  -- Locations
  pickup_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  dropoff_address TEXT NOT NULL,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  distance_km DOUBLE PRECISION,

  -- Pricing
  estimated_fare_cents INTEGER NOT NULL,
  final_fare_cents INTEGER,
  platform_fee_cents INTEGER,
  driver_earnings_cents INTEGER,
  tip_cents INTEGER DEFAULT 0,

  -- Delivery-specific
  delivery_instructions TEXT,
  delivery_order_summary TEXT,
  delivery_proof_url TEXT,

  -- Timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Metadata
  cancellation_reason TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rides_rider ON rides(rider_id);
CREATE INDEX idx_rides_driver ON rides(driver_id);
CREATE INDEX idx_rides_market ON rides(market_id);
CREATE INDEX idx_rides_shop ON rides(shop_id);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_rides_job_type ON rides(job_type);
CREATE INDEX idx_rides_created ON rides(created_at DESC);

-- Ride Events (audit log)
CREATE TABLE ride_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ride_events_ride ON ride_events(ride_id, created_at);

-- Ride Offers (including custom quotes)
CREATE TABLE ride_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  baseline_fare_cents INTEGER NOT NULL,
  quote_fare_cents INTEGER,
  offer_status offer_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ride_offers_ride ON ride_offers(ride_id);
CREATE INDEX idx_ride_offers_driver ON ride_offers(driver_id);
CREATE INDEX idx_ride_offers_status ON ride_offers(offer_status);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  recipient_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_ride ON messages(ride_id, created_at);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, read_at);

-- Driver Locations (tracking)
CREATE TABLE driver_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed_kmh DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_locations_driver ON driver_locations(driver_id, created_at DESC);
CREATE INDEX idx_driver_locations_ride ON driver_locations(ride_id, created_at DESC);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id),
  rider_id UUID NOT NULL REFERENCES profiles(id),
  amount_cents INTEGER NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_ride ON payments(ride_id);
CREATE INDEX idx_payments_rider ON payments(rider_id);
CREATE INDEX idx_payments_stripe_pi ON payments(stripe_payment_intent_id);

-- Ledger Entries (true ledger system)
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  ride_id UUID REFERENCES rides(id),
  payout_id UUID,
  entry_type ledger_entry_type NOT NULL,
  amount_cents INTEGER NOT NULL,
  status ledger_entry_status NOT NULL DEFAULT 'pending',
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_driver ON ledger_entries(driver_id, created_at DESC);
CREATE INDEX idx_ledger_ride ON ledger_entries(ride_id);
CREATE INDEX idx_ledger_payout ON ledger_entries(payout_id);
CREATE INDEX idx_ledger_status ON ledger_entries(driver_id, status);

-- Payouts
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  net_amount_cents INTEGER NOT NULL,
  method payout_method NOT NULL,
  status payout_status NOT NULL DEFAULT 'pending',
  is_expedited BOOLEAN NOT NULL DEFAULT false,
  stripe_transfer_id TEXT,
  paypal_batch_id TEXT,
  paypal_payout_item_id TEXT,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_payouts_driver ON payouts(driver_id, created_at DESC);
CREATE INDEX idx_payouts_status ON payouts(status);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- Device Tokens (for push notifications)
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);

-- Shop Promotions (future use)
CREATE TABLE shop_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  discount_percent INTEGER,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shop_promotions_shop ON shop_promotions(shop_id);
CREATE INDEX idx_shop_promotions_active ON shop_promotions(is_active, valid_from, valid_until);

-- Config (global settings)
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- =====================================================
-- FOREIGN KEY CONSTRAINTS (deferred)
-- =====================================================

ALTER TABLE rides ADD CONSTRAINT fk_rides_selected_offer
  FOREIGN KEY (selected_offer_id) REFERENCES ride_offers(id);

ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_payout
  FOREIGN KEY (payout_id) REFERENCES payouts(id);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markets_updated_at BEFORE UPDATE ON markets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_requests_updated_at BEFORE UPDATE ON market_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shops_updated_at BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_config_updated_at BEFORE UPDATE ON config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Calculate driver wallet balance
CREATE OR REPLACE FUNCTION get_driver_balance(p_driver_id UUID)
RETURNS INTEGER AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN status = 'available' THEN amount_cents
      ELSE 0
    END
  ), 0)::INTEGER
  FROM ledger_entries
  WHERE driver_id = p_driver_id;
$$ LANGUAGE SQL STABLE;

-- Check if location is in market
CREATE OR REPLACE FUNCTION is_location_in_market(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_market_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_market RECORD;
  v_distance_km DOUBLE PRECISION;
BEGIN
  SELECT center_lat, center_lng, radius_km
  INTO v_market
  FROM markets
  WHERE id = p_market_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_distance_km := ST_Distance(
    ST_MakePoint(p_lng, p_lat)::geography,
    ST_MakePoint(v_market.center_lng, v_market.center_lat)::geography
  ) / 1000;

  RETURN v_distance_km <= v_market.radius_km;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Markets (public read for active markets)
CREATE POLICY "Anyone can view active markets" ON markets
  FOR SELECT USING (status = 'active');

CREATE POLICY "Admins can manage markets" ON markets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Market Requests
CREATE POLICY "Users can view own market requests" ON market_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create market requests" ON market_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all market requests" ON market_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update market requests" ON market_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Drivers
CREATE POLICY "Drivers can view own profile" ON drivers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Drivers can update own profile" ON drivers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all drivers" ON drivers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage drivers" ON drivers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Shops (public read for approved shops)
CREATE POLICY "Anyone can view approved shops" ON shops
  FOR SELECT USING (status IN ('approved', 'active'));

CREATE POLICY "Admins can manage shops" ON shops
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Shop Requests (public create, admin manage)
CREATE POLICY "Anyone can create shop requests" ON shop_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all shop requests" ON shop_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update shop requests" ON shop_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Rides
CREATE POLICY "Riders can view own rides" ON rides
  FOR SELECT USING (auth.uid() = rider_id);

CREATE POLICY "Drivers can view assigned rides" ON rides
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM drivers WHERE user_id = auth.uid() AND id = rides.driver_id)
  );

CREATE POLICY "Admins can view all rides" ON rides
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Ride Events
CREATE POLICY "Users can view events for their rides" ON ride_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rides
      WHERE rides.id = ride_events.ride_id
      AND (
        rides.rider_id = auth.uid()
        OR EXISTS (SELECT 1 FROM drivers WHERE user_id = auth.uid() AND id = rides.driver_id)
      )
    )
  );

CREATE POLICY "Admins can view all ride events" ON ride_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Ride Offers
CREATE POLICY "Riders can view offers for their rides" ON ride_offers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rides WHERE id = ride_offers.ride_id AND rider_id = auth.uid())
  );

CREATE POLICY "Drivers can view own offers" ON ride_offers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM drivers WHERE user_id = auth.uid() AND id = ride_offers.driver_id)
  );

-- Messages
CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = recipient_id
  );

-- Driver Locations
CREATE POLICY "Riders can view driver location for their active ride" ON driver_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rides
      WHERE rides.id = driver_locations.ride_id
      AND rides.rider_id = auth.uid()
      AND rides.status IN ('matched', 'driver_arriving', 'driver_arrived', 'in_progress', 'arriving_at_pickup', 'picked_up', 'arriving_at_dropoff')
    )
  );

CREATE POLICY "Drivers can view own locations" ON driver_locations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM drivers WHERE user_id = auth.uid() AND id = driver_locations.driver_id)
  );

-- Payments
CREATE POLICY "Riders can view own payments" ON payments
  FOR SELECT USING (auth.uid() = rider_id);

CREATE POLICY "Admins can view all payments" ON payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Ledger Entries
CREATE POLICY "Drivers can view own ledger" ON ledger_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM drivers WHERE user_id = auth.uid() AND id = ledger_entries.driver_id)
  );

CREATE POLICY "Admins can view all ledger entries" ON ledger_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Payouts
CREATE POLICY "Drivers can view own payouts" ON payouts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM drivers WHERE user_id = auth.uid() AND id = payouts.driver_id)
  );

CREATE POLICY "Admins can view all payouts" ON payouts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Device Tokens
CREATE POLICY "Users can manage own device tokens" ON device_tokens
  FOR ALL USING (auth.uid() = user_id);

-- Shop Promotions (public read)
CREATE POLICY "Anyone can view active promotions" ON shop_promotions
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage promotions" ON shop_promotions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Config (admin only)
CREATE POLICY "Admins can view config" ON config
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage config" ON config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =====================================================
-- INITIAL CONFIG DATA
-- =====================================================

INSERT INTO config (key, value, description) VALUES
  ('platform_commission_percent', '20', 'Platform commission percentage on rides/deliveries'),
  ('payout_expedited_fee_percent', '2', 'Percentage fee for expedited payouts'),
  ('payout_expedited_flat_fee', '100', 'Flat fee in cents for expedited payouts'),
  ('cancellation_fee_rider', '500', 'Cancellation fee for riders in cents'),
  ('cancellation_fee_driver', '500', 'Cancellation fee for drivers in cents'),
  ('matching_radius_km', '10', 'Radius in km for driver matching'),
  ('daily_payout_time_utc', '"02:00"', 'Daily payout batch time in UTC (HH:MM)'),
  ('delivery_enabled', 'true', 'Whether delivery feature is enabled'),
  ('delivery_base_fee_cents', '300', 'Base fee for deliveries in cents'),
  ('delivery_per_km_cents', '100', 'Per-km fee for deliveries in cents'),
  ('delivery_minimum_fee_cents', '500', 'Minimum delivery fee in cents'),
  ('delivery_tip_enabled', 'true', 'Whether tips are enabled for deliveries'),
  ('driver_quote_enabled', 'true', 'Whether custom driver quotes are enabled'),
  ('driver_quote_min_percent_of_estimate', '80', 'Minimum quote as % of estimate'),
  ('driver_quote_max_percent_of_estimate', '200', 'Maximum quote as % of estimate'),
  ('driver_quote_flat_min_cents', '300', 'Minimum quote in cents'),
  ('driver_quote_flat_max_cents', '100000', 'Maximum quote in cents'),
  ('driver_quote_response_window_seconds', '300', 'Time for drivers to respond with quotes'),
  ('rider_quote_selection_timeout_seconds', '600', 'Time for riders to select a quote'),
  ('platform_commission_applies_to_quotes', 'true', 'Whether commission applies to custom quotes'),
  ('shops_enabled', 'true', 'Whether shops/restaurants feature is enabled'),
  ('ride_base_fee_cents', '250', 'Base fee for rides in cents'),
  ('ride_per_km_cents', '150', 'Per-km fee for rides in cents'),
  ('ride_per_minute_cents', '25', 'Per-minute fee for rides in cents'),
  ('ride_minimum_fee_cents', '500', 'Minimum ride fee in cents')
ON CONFLICT (key) DO NOTHING;
