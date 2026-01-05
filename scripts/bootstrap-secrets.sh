#!/bin/bash

# =====================================================
# MyRides Platform - Bootstrap Secrets Script
# =====================================================
# This script sets up all required secrets for the platform
# NEVER commit this file with actual secret values!
# =====================================================

set -e

echo "========================================="
echo "MyRides Platform - Secret Bootstrap"
echo "========================================="
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "ERROR: Supabase CLI is not installed."
    echo "Install it with: npm install -g supabase"
    exit 1
fi

# Check if we're in a Supabase project
if [ ! -d "supabase" ]; then
    echo "ERROR: Not in a Supabase project directory."
    echo "Run 'supabase init' first."
    exit 1
fi

echo "This script will set up all secrets for your MyRides platform."
echo ""
echo "You will be prompted for the following:"
echo "  1. Supabase Service Role Key (from Supabase dashboard)"
echo "  2. Stripe Secret Key (sk_test_... or sk_live_...)"
echo "  3. Stripe Webhook Secret (whsec_...)"
echo "  4. PayPal Client ID (optional)"
echo "  5. PayPal Secret (optional)"
echo "  6. App Base URL (your deployed app URL)"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."
echo ""

# =====================================================
# CLIENT-SAFE SECRETS (.env.local)
# =====================================================

echo "Setting up client-safe environment variables..."
echo ""

if [ -f .env.local ]; then
    echo ".env.local already exists. Skipping..."
else
    echo "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    echo "should already be in .env.local"
    echo ""
fi

# =====================================================
# SUPABASE EDGE FUNCTION SECRETS
# =====================================================

echo "Setting up Supabase Edge Function secrets..."
echo ""

# Supabase Service Role Key
echo -n "Enter Supabase Service Role Key: "
read -s SUPABASE_SERVICE_ROLE_KEY
echo ""

# Stripe Secret Key
echo -n "Enter Stripe Secret Key (sk_test_... or sk_live_...): "
read -s STRIPE_SECRET_KEY
echo ""

# Stripe Webhook Secret
echo -n "Enter Stripe Webhook Secret (whsec_...): "
read -s STRIPE_WEBHOOK_SECRET
echo ""

# PayPal Client ID (optional)
echo -n "Enter PayPal Client ID (optional, press Enter to skip): "
read PAYPAL_CLIENT_ID

# PayPal Secret (optional)
if [ -n "$PAYPAL_CLIENT_ID" ]; then
    echo -n "Enter PayPal Secret: "
    read -s PAYPAL_SECRET
    echo ""
else
    PAYPAL_SECRET=""
fi

# App Base URL
echo -n "Enter App Base URL (e.g., https://myrides.vercel.app): "
read APP_BASE_URL

echo ""
echo "Setting Supabase secrets..."

# Create temporary env file for Supabase
TEMP_ENV=$(mktemp)
cat > "$TEMP_ENV" <<EOF
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET
APP_BASE_URL=$APP_BASE_URL
EOF

if [ -n "$PAYPAL_CLIENT_ID" ]; then
    echo "PAYPAL_CLIENT_ID=$PAYPAL_CLIENT_ID" >> "$TEMP_ENV"
    echo "PAYPAL_SECRET=$PAYPAL_SECRET" >> "$TEMP_ENV"
fi

# Set secrets via Supabase CLI
supabase secrets set --env-file "$TEMP_ENV"

# Clean up
rm "$TEMP_ENV"

echo ""
echo "========================================="
echo "✓ Bootstrap Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Deploy Edge Functions: supabase functions deploy"
echo "  2. Run migrations: supabase db push"
echo "  3. Deploy to Vercel: vercel --prod"
echo ""
echo "IMPORTANT: Never commit secrets to git!"
echo "========================================="
