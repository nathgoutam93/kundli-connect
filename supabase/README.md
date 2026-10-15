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
supabase functions deploy create-checkout
supabase functions deploy confirm-checkout
supabase functions deploy payment-webhook --no-verify-jwt
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
  user, so concurrent requests cannot overdraw a balance. Credits and subscriptions are only
  granted by `fulfill_payment_order` after a verified payment.
- **Signed-out requests** have no access to tables or functions in `public`.
- **Edge Functions** validate ids and message lengths, and only allow scoring or liking
  profiles that are discoverable or already connected.

## Payments

Checkout is provider-agnostic:

1. The app calls `create-checkout` with a product (`credit_pack` / `subscription` + id). The
   price comes from `credit_packs` / `subscription_plans`, never from the app, and is
   snapshotted into `payment_orders`.
2. The server creates the order with the active provider and returns what the app needs.
3. The app's checkout adapter for that provider shows the payment UI
   (`apps/mobile/services/checkout/`).
4. The app sends the result to `confirm-checkout`; the provider verifies it server-side and
   `fulfill_payment_order` grants credits or the subscription. Providers with webhooks
   (Razorpay) also call `payment-webhook`, and fulfilment is idempotent, so the two paths can
   race safely.

Server code: `functions/_shared/payments/` (`types.ts` is the provider interface).

### Providers

| `PAYMENT_PROVIDER` | Use | Secrets |
|---|---|---|
| `dummy` (default) | Development and testing. The app shows a "Test payment" prompt; no money moves. | `PAYMENTS_ALLOW_DUMMY=true` (otherwise purchases are disabled) |
| `razorpay` | Production | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |

```sh
supabase secrets set PAYMENT_PROVIDER=dummy PAYMENTS_ALLOW_DUMMY=true
```

### Switching to Razorpay

1. In the Razorpay dashboard, create API keys and a webhook pointing to
   `https://<project-ref>.supabase.co/functions/v1/payment-webhook?provider=razorpay` with the
   events `payment.captured`, `order.paid` and `payment.failed`.
2. Set the secrets and switch the provider (and stop allowing the dummy):
   ```sh
   supabase secrets set PAYMENT_PROVIDER=razorpay RAZORPAY_KEY_ID=rzp_... \
     RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
   supabase secrets unset PAYMENTS_ALLOW_DUMMY
   ```
3. In the app: `npx expo install react-native-razorpay`, register the adapter in
   `apps/mobile/services/checkout/index.ts` (the exact lines are in the comment there) and
   ship a new build.
4. Test with Razorpay test-mode keys first; switch to live keys when ready.

Prices are placeholders: edit `credit_packs` and `subscription_plans.price_minor` (in paise).

Edge Function tests (payments, guards, push): `npm run supabase:functions:test` (needs Deno).

### After deploying

`spend_credit(text)` remains only so Edge Functions deployed before the lockdown migration keep
working during the rollout. Once the current functions are deployed it can be dropped.

## Social sign-in (Google, Meta, Apple)

The app signs in with Supabase-hosted OAuth in an in-app browser (`apps/mobile/services/auth/`),
so a provider works as soon as it is enabled in Supabase; no native SDK is required. Buttons
appear on the welcome screen only for providers listed in the app's
`EXPO_PUBLIC_SOCIAL_AUTH_PROVIDERS` (e.g. `google,facebook`).

**Redirect URLs** (Authentication → URL Configuration → Redirect URLs): add
`kundalikonnect://auth/callback`, plus `exp://<your-dev-machine>:8081/--/auth/callback` when
testing in Expo Go. The provider consoles below always redirect to Supabase, never to the app.

**Google**
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → *Web
   application*. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste the client ID and secret, enable.
3. Optional native account picker: also create Android/iOS client IDs, add the web client ID to
   "Authorized Client IDs" in the Supabase Google provider, and follow the steps in
   `apps/mobile/services/auth/index.ts`.

**Meta (Facebook)**
1. developers.facebook.com → Create app → add *Facebook Login*. Valid OAuth Redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`. Request the `email` permission.
2. Supabase → Authentication → Providers → Facebook: paste the App ID and App Secret, enable.
3. Switch the Meta app to *Live* before release (in development mode only app roles can log in).

**Apple** (needed for the iOS App Store if Google/Meta sign-in ships: guideline 4.8)
1. Apple Developer → Identifiers: create a Services ID with Sign in with Apple, return URL
   `https://<project-ref>.supabase.co/auth/v1/callback`; create a Sign in with Apple key.
2. Supabase → Authentication → Providers → Apple: fill in the Services ID, team, key, enable.
3. Add `apple` to `EXPO_PUBLIC_SOCIAL_AUTH_PROVIDERS`.

Notes:
- A social account and a phone account are separate users. Supabase links identities
  automatically only when they share a verified email, and phone sign-ups have none.
- New social users get their name and email prefilled in onboarding. If the email is already
  used by another profile, the profile is created without it.

## Recommended project settings

- **Asymmetric JWT signing keys** (Dashboard → Project Settings → JWT Keys). The Edge Functions
  verify tokens with `auth.getClaims()`, which checks them locally when asymmetric keys are
  enabled and otherwise falls back to a request to the Auth server.
- **Realtime** must be enabled for the project (it is by default).
