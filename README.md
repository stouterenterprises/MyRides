# MyRides Platform

A production-ready ride-hailing + delivery platform MVP built with Next.js 14, Supabase, and Stripe Connect.

## Features

### Core Functionality
- **Unified Jobs System**: Single platform for both rides and deliveries
- **Custom Driver Quotes**: Drivers can submit custom pricing for rides
- **Shop Directory**: Restaurants and shops can join the platform
- **Market Expansion**: Riders can request new markets
- **Real-time Dispatch**: Automatic driver matching with real-time updates
- **Ledger System**: Complete financial tracking with negative balance support
- **Dual Payout System**: Daily batch payouts + expedited on-demand payouts

### Payment & Payouts
- **Stripe Connect Express** for driver payouts (required)
- **PayPal Payouts** support (optional)
- **Stripe Payment Intents** for rider payments
- **Complete webhook handling** for payment events
- **True ledger system** tracking all transactions

### Security & Architecture
- **Zero secrets in client code** - all privileged operations via Edge Functions
- **Row Level Security (RLS)** on all database tables
- **Role-based access** (rider/driver/admin)
- **API-first design** - ready for mobile (iOS/Android via Expo/React Native)

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (Auth, Postgres, Realtime, Storage, Edge Functions)
- **Payments**: Stripe Connect Express, Stripe Payment Intents, PayPal Payouts (optional)
- **Deployment**: Vercel (frontend), Supabase (backend)
- **Validation**: Zod for all API inputs

## Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Stripe account (for payments)
- Vercel account (for deployment)
- Supabase CLI: `npm install -g supabase`

## Quick Start

### 1. Clone and Install

```bash
npm install
```

### 2. Environment Setup

The `.env.local` file has been created with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://zuhhucneordcqopqnhzf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Initialize Supabase

```bash
# Link to your Supabase project
supabase link --project-ref zuhhucneordcqopqnhzf

# Push database migrations
supabase db push
```

### 4. Bootstrap Secrets

Run the bootstrap script to configure all secrets:

```bash
chmod +x scripts/bootstrap-secrets.sh
./scripts/bootstrap-secrets.sh
```

You'll need:
- **Supabase Service Role Key** (from Supabase Dashboard → Settings → API)
- **Stripe Secret Key** (from Stripe Dashboard)
- **Stripe Webhook Secret** (create webhook in Stripe Dashboard)
- **PayPal Client ID & Secret** (optional)
- **App Base URL** (e.g., https://myrides.vercel.app)

### 5. Deploy Edge Functions

```bash
supabase functions deploy --no-verify-jwt
```

This deploys all 20+ Edge Functions.

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
MyRides/
├── app/                      # Next.js App Router
│   ├── auth/                 # Authentication pages
│   ├── rider/                # Rider dashboard & features
│   ├── driver/               # Driver dashboard & features
│   ├── admin/                # Admin panel
│   └── layout.tsx            # Root layout
├── lib/                      # Shared utilities
│   ├── supabase/             # Supabase client configs
│   ├── types.ts              # TypeScript types
│   ├── validation.ts         # Zod schemas
│   └── config.ts             # Config helpers
├── supabase/
│   ├── functions/            # Edge Functions (20+)
│   │   ├── _shared/          # Shared utilities
│   │   ├── markets-list/
│   │   ├── rides-create/
│   │   ├── dispatch-match/
│   │   ├── offers-respond/
│   │   ├── payments-create-intent/
│   │   ├── payments-stripe-webhook/
│   │   ├── payouts-run-daily-batch/
│   │   └── ...
│   └── migrations/           # Database schema
│       └── 20240101000000_initial_schema.sql
├── scripts/
│   ├── bootstrap-secrets.sh  # Secret setup script
│   ├── driver-simulator.ts   # Testing tool
│   └── seed.ts               # Demo data
└── README.md                 # This file
```

## Edge Functions (20+)

All privileged operations run as Supabase Edge Functions:

### Markets
- `markets-list` - List active markets
- `market-requests-create` - Create market request
- `admin-market-activate` - Activate market (admin)

### Rides/Jobs
- `rides-create` - Create ride/delivery request
- `dispatch-match` - Match drivers to rides
- `ride-status-update` - Update ride status

### Offers & Quotes
- `offers-respond` - Driver accepts/rejects/quotes
- `offers-select-quote` - Rider selects driver's quote

### Payments
- `payments-create-intent` - Create Stripe PaymentIntent
- `payments-stripe-webhook` - Handle Stripe webhooks

### Payouts
- `payouts-run-daily-batch` - Daily batch payouts
- `payouts-request-expedited` - On-demand expedited payout

### Shops
- `shop-requests-create` - Submit shop application
- `admin-shop-approve` - Approve shop (admin)
- `shops-list` - List approved shops
- `shops-detail` - Get shop details

### Drivers
- `drivers-connect-onboard` - Driver onboarding
- `admin-driver-approve` - Approve driver (admin)
- `locations-ping` - Driver location tracking

### Admin & Messaging
- `admin-config-update` - Update platform config
- `messages-send` - Send ride chat message

## Database Schema (18 Tables)

Complete schema with RLS policies:

- `profiles` - User accounts (extends auth.users)
- `drivers` - Driver profiles
- `markets` - Geographic markets
- `market_requests` - Rider market expansion requests
- `rides` - Unified rides + deliveries table
- `ride_events` - Audit log
- `ride_offers` - Driver offers with custom quotes
- `messages` - Ride chat
- `driver_locations` - Location tracking
- `payments` - Payment records
- `ledger_entries` - True ledger system
- `payouts` - Payout records
- `notifications` - In-app notifications
- `device_tokens` - Push notification tokens
- `shops` - Approved shops/restaurants
- `shop_requests` - Shop applications
- `shop_promotions` - Shop promotions
- `config` - Global platform configuration

## Platform Configuration

All settings in `config` table (admin-editable):

- `platform_commission_percent` (default: 20)
- `payout_expedited_fee_percent` (default: 2)
- `matching_radius_km` (default: 10)
- `driver_quote_enabled` (default: true)
- `driver_quote_min_percent_of_estimate` (default: 80)
- `driver_quote_max_percent_of_estimate` (default: 200)
- Plus 20+ more configurable settings

## Testing

### Driver Simulator

Test the complete ride flow:

```bash
npm run simulator
```

Features:
- Go online/offline
- View and respond to offers
- Submit custom quotes
- Update ride status
- View wallet balance
- Send location pings

### Manual Testing Flow

1. **Create Admin**: Sign up, manually set role='admin' in database
2. **Create Market**: Admin creates active market
3. **Driver Onboarding**: Sign up as driver, get approved
4. **Request Ride**: Rider requests ride
5. **Driver Accepts**: Driver accepts or submits quote
6. **Complete Ride**: Driver updates status, rider pays
7. **Payout**: Daily batch or expedited payout

## Deployment

### Vercel Deployment

```bash
vercel --prod
```

Environment variables in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Stripe Webhook

1. Create webhook: `https://zuhhucneordcqopqnhzf.supabase.co/functions/v1/payments-stripe-webhook`
2. Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
3. Copy webhook secret to Supabase

### Daily Payout Cron

```bash
0 2 * * * curl -X POST https://zuhhucneordcqopqnhzf.supabase.co/functions/v1/payouts-run-daily-batch \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## Mobile Ready

API-first architecture enables clean mobile migration:

1. Create Expo/React Native app
2. Use Supabase JS SDK
3. Call same Edge Functions
4. Share TypeScript types
5. Add native features (maps, push, etc.)

## Security Checklist

- ✅ No secrets in client code
- ✅ All privileged operations via Edge Functions
- ✅ RLS enabled on all tables
- ✅ Zod validation on all inputs
- ✅ Webhook signature verification
- ✅ Role-based authorization

## License

MIT
