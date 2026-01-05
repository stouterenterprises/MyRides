-- =====================================================
-- Shop Owner/Staff Roles Extension
-- =====================================================
-- Run this after the initial schema migration

-- Update user_role enum to include shop roles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'shop_owner';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'shop_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'shop_staff';

-- Shop Staff Members
CREATE TABLE IF NOT EXISTS shop_staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'cashier', 'server', 'kitchen')),
  permissions JSONB DEFAULT '{"manage_orders": true, "manage_menu": false, "manage_staff": false, "view_analytics": false}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES profiles(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, user_id)
);

CREATE INDEX idx_shop_staff_shop ON shop_staff(shop_id);
CREATE INDEX idx_shop_staff_user ON shop_staff(user_id);
CREATE INDEX idx_shop_staff_active ON shop_staff(shop_id, is_active);

-- Shop Hours
CREATE TABLE IF NOT EXISTS shop_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, day_of_week)
);

CREATE INDEX idx_shop_hours_shop ON shop_hours(shop_id);

-- Shop Menu Items (simplified)
CREATE TABLE IF NOT EXISTS shop_menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price_cents INTEGER NOT NULL,
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  preparation_time_minutes INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shop_menu_shop ON shop_menu_items(shop_id);
CREATE INDEX idx_shop_menu_available ON shop_menu_items(shop_id, is_available);

-- Order Items (links rides to menu items)
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES shop_menu_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL,
  special_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_ride ON order_items(ride_id);

-- Update trigger for shop_staff
CREATE TRIGGER update_shop_staff_updated_at BEFORE UPDATE ON shop_staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shop_menu_items_updated_at BEFORE UPDATE ON shop_menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- RLS POLICIES FOR SHOP STAFF
-- =====================================================

ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Shop Staff Policies
CREATE POLICY "Shop owners can manage staff" ON shop_staff
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shop_staff ss
      WHERE ss.shop_id = shop_staff.shop_id
      AND ss.user_id = auth.uid()
      AND ss.role = 'owner'
      AND ss.is_active = true
    )
  );

CREATE POLICY "Users can view own shop staff records" ON shop_staff
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Managers can view shop staff" ON shop_staff
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shop_staff ss
      WHERE ss.shop_id = shop_staff.shop_id
      AND ss.user_id = auth.uid()
      AND ss.role IN ('owner', 'manager')
      AND ss.is_active = true
    )
  );

CREATE POLICY "Admins can view all shop staff" ON shop_staff
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Shop Hours Policies
CREATE POLICY "Anyone can view shop hours" ON shop_hours
  FOR SELECT USING (true);

CREATE POLICY "Shop staff can manage hours" ON shop_hours
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shop_staff
      WHERE shop_id = shop_hours.shop_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
      AND is_active = true
      AND (permissions->>'manage_menu')::boolean = true
    )
  );

-- Shop Menu Items Policies
CREATE POLICY "Anyone can view available menu items" ON shop_menu_items
  FOR SELECT USING (is_available = true);

CREATE POLICY "Shop staff can view all menu items" ON shop_menu_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shop_staff
      WHERE shop_id = shop_menu_items.shop_id
      AND user_id = auth.uid()
      AND is_active = true
    )
  );

CREATE POLICY "Shop staff can manage menu items" ON shop_menu_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shop_staff
      WHERE shop_id = shop_menu_items.shop_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
      AND is_active = true
      AND (permissions->>'manage_menu')::boolean = true
    )
  );

-- Order Items Policies
CREATE POLICY "Riders can view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rides WHERE id = order_items.ride_id AND rider_id = auth.uid())
  );

CREATE POLICY "Shop staff can view shop orders" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rides r
      JOIN shop_staff ss ON ss.shop_id = r.shop_id
      WHERE r.id = order_items.ride_id
      AND ss.user_id = auth.uid()
      AND ss.is_active = true
    )
  );

CREATE POLICY "Drivers can view assigned order items" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rides r
      JOIN drivers d ON d.id = r.driver_id
      WHERE r.id = order_items.ride_id
      AND d.user_id = auth.uid()
    )
  );

-- Update shops table to link owner
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);

-- Function to auto-create shop_staff record when shop is approved
CREATE OR REPLACE FUNCTION create_shop_owner_staff()
RETURNS TRIGGER AS $$
BEGIN
  -- If shop is being approved and has an owner_id, create shop_staff record
  IF NEW.status = 'approved' AND OLD.status = 'pending' AND NEW.owner_id IS NOT NULL THEN
    INSERT INTO shop_staff (shop_id, user_id, role, permissions, is_active, accepted_at)
    VALUES (
      NEW.id,
      NEW.owner_id,
      'owner',
      '{"manage_orders": true, "manage_menu": true, "manage_staff": true, "view_analytics": true}',
      true,
      NOW()
    )
    ON CONFLICT (shop_id, user_id) DO NOTHING;

    -- Update user profile role
    UPDATE profiles
    SET role = 'shop_owner'
    WHERE id = NEW.owner_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_shop_owner_staff_trigger
  AFTER UPDATE ON shops
  FOR EACH ROW
  EXECUTE FUNCTION create_shop_owner_staff();

-- Add config values for shop features
INSERT INTO config (key, value, description) VALUES
  ('shops_allow_custom_hours', 'true', 'Allow shops to set custom operating hours'),
  ('shops_menu_items_enabled', 'true', 'Enable menu item management for shops'),
  ('shops_auto_accept_orders', 'false', 'Auto-accept delivery orders without shop confirmation'),
  ('shops_order_preparation_buffer_minutes', '15', 'Default buffer time for order preparation')
ON CONFLICT (key) DO NOTHING;
