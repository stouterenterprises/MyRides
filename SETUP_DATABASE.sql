-- =====================================================
-- STEP 1: Run the Initial Schema Migration
-- =====================================================
-- Copy and paste the contents of:
-- supabase/migrations/20240101000000_initial_schema.sql
-- into the Supabase SQL Editor and run it.

-- =====================================================
-- STEP 2: Run the Shop Roles Migration
-- =====================================================
-- Copy and paste the contents of:
-- supabase/migrations/20240102000000_shop_roles.sql
-- into the Supabase SQL Editor and run it.

-- =====================================================
-- STEP 3: Set Your Admin User (Run AFTER signup)
-- =====================================================
-- After you sign up with blstouter93@gmail.com, run this:

UPDATE profiles
SET role = 'admin'
WHERE email = 'blstouter93@gmail.com';

-- Verify admin was set:
SELECT id, email, role FROM profiles WHERE email = 'blstouter93@gmail.com';

-- =====================================================
-- QUICK SETUP INSTRUCTIONS
-- =====================================================

/*
1. Go to: https://supabase.com/dashboard/project/zuhhucneordcqopqnhzf/sql/new

2. Open the file: /supabase/migrations/20240101000000_initial_schema.sql
   - Copy ALL the contents
   - Paste into Supabase SQL Editor
   - Click "Run" (bottom right)
   - Wait for success message

3. Open the file: /supabase/migrations/20240102000000_shop_roles.sql
   - Copy ALL the contents
   - Paste into Supabase SQL Editor
   - Click "Run"
   - Wait for success message

4. Go to your deployed app and sign up with: blstouter93@gmail.com

5. Return to Supabase SQL Editor and run this query:

   UPDATE profiles SET role = 'admin' WHERE email = 'blstouter93@gmail.com';

6. Verify by running:

   SELECT id, email, role FROM profiles WHERE email = 'blstouter93@gmail.com';

7. You should see your user with role = 'admin'

8. Refresh your app and go to /admin

Done! All tables created and you're the admin.
*/
