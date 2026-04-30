# Supabase Setup — Phase 1

Project URL: https://yvjxcvnlapfikzovzgwd.supabase.co
Dashboard:   https://supabase.com/dashboard/project/yvjxcvnlapfikzovzgwd

## Step 1 — Apply the migration

In the Supabase Dashboard → SQL Editor, paste the full contents of:
  supabase/migrations/20260430000001_initial_schema.sql

Click Run. You should see no errors.

## Step 2 — Seed the properties

In the Supabase Dashboard → SQL Editor, paste the full contents of:
  supabase/seed.sql

Click Run. This inserts 55 properties (24 Ben Graham, 31 Pete Birch).
Verify: Table Editor → properties → should show 55 rows.

## Step 3 — Create the three user accounts

Dashboard → Authentication → Users → Add user → Create new user.
Turn "Send email" OFF for each.

For each user, expand "User metadata" and paste the JSON shown.
The full_name value MUST match the manager_name in the properties table exactly.

| Email                         | Password | User metadata JSON                |
|-------------------------------|----------|-----------------------------------|
| ben@ashproperty.co.uk         | ASH1!    | {"full_name": "Ben Graham"}       |
| pete@ashproperty.co.uk        | ASH1!    | {"full_name": "Pete Birch"}       |
| admin@ashproperty.co.uk       | ASH1!    | {"full_name": "ASH Admin"}        |

## Step 4 — Promote admin user(s)

In SQL Editor, run:

  UPDATE public.users SET role = 'admin' WHERE email = 'admin@ashproperty.co.uk';

If Pete should also have admin access (sees all properties):

  UPDATE public.users SET role = 'admin' WHERE email = 'pete.birch@ashproperty.co.uk';

## Step 5 — Create the Storage bucket

Dashboard → Storage → New bucket:
  Name:   inspection-files
  Public: OFF (leave toggled off)

## Step 6 — Build and install the APK

From the app/ directory (requires Node in PATH):

  npm run build
  npx cap sync android

Then open app/android/ in Android Studio, connect your phone, and press Run.
Or: Build → Generate Signed APK for a standalone install file.

## Verify it works

1. Open the app on your phone
2. Sign in with ben@ashproperty.co.uk / ASH1!
3. You should see your 24 properties listed
4. Search for "G52" — Glencairn Court should appear
5. Sign out and sign in as admin@ashproperty.co.uk — all 55 properties should appear
