# Quick Database Setup (No CLI Required!)

## Step-by-Step Instructions

### 1. Open Supabase SQL Editor

Go to: **https://supabase.com/dashboard/project/zuhhucneordcqopqnhzf/sql/new**

### 2. Run Initial Schema

1. Open this file in your editor: `supabase/migrations/20240101000000_initial_schema.sql`
2. **Copy ALL the contents** (it's a long file - make sure you get everything!)
3. Paste into the Supabase SQL Editor
4. Click **"Run"** button (bottom right corner)
5. Wait for "Success. No rows returned" message

**This creates all 18 tables with RLS policies**

### 3. Run Shop Roles Migration

1. Open this file: `supabase/migrations/20240102000000_shop_roles.sql`
2. **Copy ALL the contents**
3. Paste into the Supabase SQL Editor
4. Click **"Run"**
5. Wait for success message

**This adds shop owner/staff features**

### 4. Sign Up

1. Go to your deployed Vercel app
2. Click "Sign Up"
3. Use email: **blstouter93@gmail.com**
4. Choose any password
5. Complete signup

### 5. Make Yourself Admin

1. Go back to Supabase SQL Editor
2. Run this single query:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'blstouter93@gmail.com';
```

3. Verify it worked by running:

```sql
SELECT id, email, role FROM profiles WHERE email = 'blstouter93@gmail.com';
```

You should see your user with `role = 'admin'`

### 6. Test Admin Access

1. Refresh your app
2. Go to `/admin`
3. You should see the admin dashboard!

---

## That's It! 🎉

Your database is now fully set up with:
- ✅ All 22 tables created
- ✅ Row Level Security enabled
- ✅ You as the admin user
- ✅ All config values loaded

## What Still Needs Setup

The **Edge Functions** still need to be deployed for full functionality. Options:

### Option A: Use Supabase CLI (Recommended - 2 minutes)

```bash
# Install once
npm install -g supabase

# Login and deploy
supabase login
supabase link --project-ref zuhhucneordcqopqnhzf
supabase functions deploy --no-verify-jwt
```

### Option B: Deploy via Dashboard (20-30 minutes)

Upload each function manually through Supabase Dashboard → Edge Functions

---

## Troubleshooting

**"Table already exists" error:**
- Database already has some tables. You can either:
  - Drop all tables and start fresh
  - Or manually create missing tables

**"Profile not found" after signup:**
- The signup might have failed. Try signing up again.
- Check Supabase Dashboard → Authentication → Users to see if user was created

**Can't access /admin:**
- Make sure you ran the UPDATE query to set role = 'admin'
- Log out and log back in
- Check the profiles table to verify role is 'admin'

---

Need help? Check the full README.md for detailed documentation.
