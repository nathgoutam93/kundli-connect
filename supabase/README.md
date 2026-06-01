# Supabase Backend

This directory stores the repo-side Supabase backend for Kundali Konnect.

## Structure

- `config.toml` - local Supabase CLI configuration.
- `migrations/` - Postgres schema, indexes, and RLS policies.
- `functions/` - Edge Function source for server-side business logic.

## Setup

1. Create a Supabase project in the dashboard.
2. Copy root `.env.example` to `.env` for backend/API secrets.
3. Copy `apps/mobile/.env.example` to `apps/mobile/.env` for Expo public Supabase variables.
4. Enable Phone Auth in Supabase Auth providers.
5. Configure an SMS provider before testing real phone OTP.
6. Link and deploy from this repo:

```sh
supabase link --project-ref your-project-ref
supabase db push
supabase functions deploy generate-kundli
supabase functions deploy create-like-with-score
supabase functions deploy send-push-notification
```

The Edge Functions are stubs for now. They should hold API keys and call third-party services such as Astrology API, Razorpay, and FCM.
