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
supabase functions deploy generate-match-score
supabase functions deploy create-like
supabase functions deploy reply-to-like
supabase functions deploy send-chat-message
supabase functions deploy send-push-notification --no-verify-jwt
```

Or run `npm run supabase:db:push` and `npm run supabase:functions:deploy` from the repo root.

## How the backend is put together

- **Reads go straight to Postgres.** The app reads through RLS-protected tables and a few
  `security invoker` SQL functions that return everything a screen needs in one round trip:
  `get_discover_profiles`, `get_incoming_likes`, `get_chat_previews`. Public profile data comes
  from the `profile_cards` view, which hides fields a user marked as not visible.
- **Writes with side effects go through Edge Functions** (`generate-kundli`,
  `generate-match-score`, `create-like`, `reply-to-like`, `send-chat-message`). They hold the
  astrology API keys, spend credits, and send push notifications in the background after
  responding. Multi-step writes (`reply_to_like`, `send_chat_message`) are single SQL
  transactions.
- **Shared Edge Function code** lives in `functions/_shared/` (HTTP helpers, auth, push).
- **Realtime:** `messages`, `likes` and `chat_participants` are in the `supabase_realtime`
  publication. The app subscribes once per session (`hooks/use-realtime-sync.ts`); Realtime
  applies each subscriber's RLS policies.

## Security model

- **Profiles are owner-only.** `profiles` and `profile_photos` can only be read by their owner.
  Everyone else sees `profile_cards`, which returns an age instead of the birth date and never
  phone, email, birth time/place or coordinates. Cards are visible for completed, discoverable
  profiles and between people connected through a like.
- **Server-controlled columns.** Direct API writes cannot change a profile's phone,
  verification status, Kundli status or discoverability (`protect_profile_columns` trigger);
  discoverability follows `user_settings`.
- **No direct writes to server-owned tables.** Likes are created only by `create-like` (which
  charges a credit and needs a match score); recipients may only move a pending like to
  `dismissed`. Messages are written only by `send_chat_message` / `reply_to_like` (max 2000
  characters; opening messages max 300).
- **Credits** are spent and refunded only by the Edge Functions through
  `spend_user_credit` / `refund_credit_transaction` (service role). Spends are serialised per
  user, so concurrent requests cannot overdraw a balance.
- **Signed-out requests** have no access to tables or functions in `public`.
- **Edge Functions** validate ids and message lengths, and only allow scoring or liking
  profiles that are discoverable or already connected.

### Test purchases

Until real checkout ships, the test credit/subscription functions are disabled. To enable them
in a development project only:

```sql
update public.app_settings set value = 'true' where key = 'test_purchases_enabled';
```

### After deploying

`spend_credit(text)` remains only so Edge Functions deployed before the lockdown migration keep
working during the rollout. Once the current functions are deployed it can be dropped.

## Recommended project settings

- **Asymmetric JWT signing keys** (Dashboard → Project Settings → JWT Keys). The Edge Functions
  verify tokens with `auth.getClaims()`, which checks them locally when asymmetric keys are
  enabled and otherwise falls back to a request to the Auth server.
- **Realtime** must be enabled for the project (it is by default).
