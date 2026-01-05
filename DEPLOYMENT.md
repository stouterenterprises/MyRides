# MyRides Deployment Guide

Complete step-by-step guide to deploy your MyRides platform to production.

## Pre-Deployment Checklist

- [ ] Supabase project created
- [ ] Stripe account set up
- [ ] Vercel account ready
- [ ] Domain name (optional)

## Step 1: Database Setup

### 1.1 Link Supabase Project

```bash
supabase link --project-ref zuhhucneordcqopqnhzf
```

### 1.2 Push Migrations

```bash
supabase db push
```

This creates all 18 tables with RLS policies and seeds initial config.

### 1.3 Verify Database

Go to Supabase Dashboard → Table Editor and verify:
- All 18 tables created
- Config table has ~25 rows
- RLS enabled on all tables

## Step 2: Configure Secrets

### 2.1 Get Required Keys

**Supabase Service Role Key:**
1. Supabase Dashboard → Settings → API
2. Copy "service_role" key (keep secret!)

**Stripe Keys:**
1. Stripe Dashboard → Developers → API Keys
2. Copy "Secret key" (sk_test_... or sk_live_...)
3. Stripe Dashboard → Developers → Webhooks → Add endpoint
4. Endpoint URL: `https://zuhhucneordcqopqnhzf.supabase.co/functions/v1/payments-stripe-webhook`
5. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
6. Copy "Signing secret" (whsec_...)

**PayPal (Optional):**
1. PayPal Developer → My Apps & Credentials
2. Create app, copy Client ID and Secret

### 2.2 Run Bootstrap Script

```bash
./scripts/bootstrap-secrets.sh
```

Follow prompts to enter all secrets. This sets Supabase Edge Function secrets.

### 2.3 Verify Secrets

```bash
supabase secrets list
```

Should show:
- SUPABASE_SERVICE_ROLE_KEY
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- APP_BASE_URL
- PAYPAL_CLIENT_ID (if configured)
- PAYPAL_SECRET (if configured)

## Step 3: Deploy Edge Functions

### 3.1 Deploy All Functions

```bash
supabase functions deploy --no-verify-jwt
```

This deploys all 20+ Edge Functions.

### 3.2 Verify Functions

```bash
supabase functions list
```

All functions should show as deployed.

### 3.3 Test a Function

```bash
curl https://zuhhucneordcqopqnhzf.supabase.co/functions/v1/markets-list
```

Should return: `{"success":true,"data":[]}`

## Step 4: Deploy Frontend to Vercel

### 4.1 Install Vercel CLI

```bash
npm install -g vercel
```

### 4.2 Link Project

```bash
vercel link
```

### 4.3 Set Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://zuhhucneordcqopqnhzf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4.4 Deploy

```bash
vercel --prod
```

### 4.5 Verify Deployment

Visit your Vercel URL and:
1. Sign up for an account
2. Verify auth works
3. Check database for new profile

## Step 5: Configure Stripe Connect

### 5.1 Enable Connect

1. Stripe Dashboard → Connect → Get started
2. Complete onboarding
3. Enable "Express" accounts

### 5.2 Set Redirect URLs

In Connect Settings:
- Redirect URI: `https://your-app.vercel.app/driver/stripe-return`
- Refresh URI: `https://your-app.vercel.app/driver/stripe-refresh`

## Step 6: Create Admin Account

### 6.1 Sign Up

Visit `/auth/signup` and create an account.

### 6.2 Promote to Admin

In Supabase Dashboard → Table Editor → profiles:

1. Find your user
2. Change `role` from 'rider' to 'admin'
3. Save

### 6.3 Verify Admin Access

Visit `/admin` - you should see the admin dashboard.

## Step 7: Create First Market

### 7.1 Via Admin UI

1. Log in as admin
2. Go to Markets → Create Market
3. Fill in details:
   - Name: "San Francisco"
   - Code: "sf"
   - Center coordinates: 37.7749, -122.4194
   - Radius: 25 km
   - Status: active

### 7.2 Via Database (Alternative)

```sql
INSERT INTO markets (name, code, status, center_lat, center_lng, radius_km, timezone)
VALUES ('San Francisco', 'sf', 'active', 37.7749, -122.4194, 25, 'America/Los_Angeles');
```

## Step 8: Set Up Daily Payouts

### 8.1 Option A: GitHub Actions (Recommended)

Create `.github/workflows/daily-payouts.yml`:

```yaml
name: Daily Payouts
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily
jobs:
  run-payouts:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Payout
        run: |
          curl -X POST https://zuhhucneordcqopqnhzf.supabase.co/functions/v1/payouts-run-daily-batch \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

Add `SUPABASE_SERVICE_ROLE_KEY` to GitHub Secrets.

### 8.2 Option B: Vercel Cron

Create `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/payouts",
    "schedule": "0 2 * * *"
  }]
}
```

Create `/app/api/cron/payouts/route.ts` that calls the Edge Function.

### 8.3 Option C: External Cron Service

Use cron-job.org, EasyCron, or similar:
- URL: `https://zuhhucneordcqopqnhzf.supabase.co/functions/v1/payouts-run-daily-batch`
- Method: POST
- Header: `Authorization: Bearer <SERVICE_ROLE_KEY>`
- Schedule: Daily at 2 AM UTC

## Step 9: Configure Stripe Webhook (Production)

### 9.1 Update Webhook Endpoint

If you used test endpoint earlier, update to production:

1. Stripe Dashboard → Webhooks
2. Edit endpoint
3. Update URL to production: `https://zuhhucneordcqopqnhzf.supabase.co/functions/v1/payments-stripe-webhook`

### 9.2 Update Webhook Secret

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_production_xxx
```

## Step 10: Testing in Production

### 10.1 Create Test Driver

1. Sign up as driver
2. Admin approves driver
3. Driver goes online

### 10.2 Create Test Ride

1. Sign up as rider (different account)
2. Request ride in active market
3. Verify dispatch sends offers to driver

### 10.3 Complete Ride Flow

1. Driver accepts offer
2. Driver updates status through flow
3. Rider makes payment
4. Verify ledger entry created
5. Trigger payout manually
6. Verify Stripe transfer created

## Step 11: Monitoring & Logs

### 11.1 Supabase Logs

View Edge Function logs:
- Supabase Dashboard → Functions → Select function → Logs

### 11.2 Database Queries

Monitor slow queries:
- Supabase Dashboard → Database → Query Performance

### 11.3 Stripe Dashboard

Monitor payments and transfers:
- Stripe Dashboard → Payments
- Stripe Dashboard → Connect → Transfers

## Step 12: Custom Domain (Optional)

### 12.1 Add Domain to Vercel

1. Vercel Dashboard → Settings → Domains
2. Add custom domain
3. Configure DNS records

### 12.2 Update Secrets

```bash
supabase secrets set APP_BASE_URL=https://yourdomain.com
```

## Troubleshooting

### Edge Function Errors

Check logs in Supabase Dashboard → Functions. Common issues:
- Missing secrets
- Invalid Supabase URL
- Incorrect service role key

### RLS Policy Errors

If users can't access data:
1. Verify user is authenticated
2. Check profile role is correct
3. Review RLS policies in Table Editor

### Stripe Webhook Failures

1. Verify webhook secret matches
2. Check Edge Function logs
3. Verify endpoint URL is correct
4. Test with Stripe CLI: `stripe listen --forward-to ...`

### Payment Intent Creation Fails

- Verify ride is in completed status
- Check Stripe secret key is valid
- Ensure no existing succeeded payment

## Production Checklist

Before going live:

- [ ] All secrets configured
- [ ] Edge Functions deployed
- [ ] Frontend deployed to Vercel
- [ ] Admin account created
- [ ] At least one active market
- [ ] Daily payouts configured
- [ ] Stripe webhook tested
- [ ] Test ride completed end-to-end
- [ ] Test payout completed
- [ ] Custom domain configured (optional)
- [ ] Monitoring set up
- [ ] Error tracking configured (Sentry, etc.)

## Scaling Considerations

### Database
- Enable connection pooling in Supabase
- Add indexes for slow queries
- Consider read replicas for high traffic

### Edge Functions
- Monitor invocation counts
- Optimize frequently called functions
- Consider caching for config reads

### Real-time
- Monitor concurrent connections
- Consider dedicated Realtime server for high scale

## Support

Issues? Check:
1. Edge Function logs
2. Database logs
3. Vercel deployment logs
4. Stripe webhook logs

Good luck with your launch! 🚀
