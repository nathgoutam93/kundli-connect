# Production checklist

Everything that has to happen before Kundali Konnect goes live, in the order to do it. Tick
items off as you go. Details for most backend steps are in [`supabase/README.md`](../supabase/README.md).

Status when this list was written: frontend redesign, backend performance and realtime,
security lockdown, checkout (dummy provider) and social sign-in adapters are merged to `main`.
**None of the backend work has been deployed yet.**

---

## 1. Supabase project

- [ ] Decide whether production gets its **own Supabase project** (recommended) or reuses the
      current one. A separate project keeps test users, test payments and dummy credits out of
      production.
- [ ] Pick the region closest to your users (e.g. Mumbai `ap-south-1` for India). It cannot be
      changed later.
- [ ] Upgrade to a paid plan: free projects pause after a week of inactivity and have no backups.
- [ ] Turn on **Point-in-Time Recovery** or at least check daily backups are running.
- [ ] Turn on **asymmetric JWT signing keys** (Project Settings → JWT Keys) so Edge Functions
      verify tokens locally.
- [ ] Check **Realtime** is enabled (Project Settings → Realtime). Chat and likes depend on it.
- [ ] Run the **Security Advisor** and **Performance Advisor** (Database → Advisors) after the
      migrations below and fix anything they flag.
- [ ] Enable MFA on your Supabase account and on every account with access to the org.

## 2. Deploy the database and Edge Functions

The merged PRs added three migrations (`20260606…_backend_performance_and_realtime`,
`20260607…_security_lockdown`, `20260608…_checkout`) and new/changed functions. Until they are
deployed, the live project still has the slow queries and the security holes the lockdown
closes.

- [ ] Copy root `.env.example` to `.env`, set `SUPABASE_PROJECT_REF`, then `npm run supabase:link`.
- [ ] Back up the database first (Database → Backups, or `supabase db dump`).
- [ ] `npm run supabase:db:push`
- [ ] Set the Edge Function secrets (see section 4 for payments):
      ```sh
      supabase secrets set ASTROLOGY_API_USER_ID=... ASTROLOGY_API_KEY=...
      supabase secrets set PAYMENT_PROVIDER=dummy PAYMENTS_ALLOW_DUMMY=true   # until Razorpay is ready
      ```
- [ ] `npm run supabase:functions:deploy`
- [ ] Once the new functions are deployed, drop the rollout shim:
      ```sql
      drop function if exists public.spend_credit(text);
      ```
- [ ] Smoke test on a real device: sign up, onboarding, Kundli generation, discover, like, reply,
      chat in real time between two phones, push notification arrives, test credit purchase.

## 3. Authentication

### Phone OTP
- [ ] Authentication → Providers → Phone: enable and connect a real **SMS provider** (Twilio,
      MessageBird, Vonage or Textlocal). For India, register your sender ID and message template
      on **DLT** first, or carriers will drop the SMS.
- [ ] Remove any test phone numbers / fixed OTPs configured in the dashboard.
- [ ] Set OTP expiry and rate limits (Authentication → Rate Limits) so SMS can't be abused to
      run up your bill.
- [ ] Turn on **CAPTCHA** protection (Authentication → Attack Protection) if you see signup abuse.

### Social sign-in
- [ ] Authentication → URL Configuration: add `kundalikonnect://auth/callback` to Redirect URLs.
      Remove any `exp://…` development URLs from the production project.
- [ ] **Google:** create the OAuth client, enable the provider in Supabase, and publish the
      OAuth consent screen (Testing → In production). Add your privacy policy URL and app logo
      to the consent screen.
- [ ] **Meta:** create the app, enable the provider, switch the Meta app to **Live** (in
      development mode only app roles can sign in). Meta requires a privacy policy URL and a
      data deletion URL or callback.
- [ ] **Apple:** required by App Store guideline 4.8 if Google or Meta sign-in ships on iOS.
      Create the Services ID and key, enable the provider.
- [ ] Set `EXPO_PUBLIC_SOCIAL_AUTH_PROVIDERS` for the production build (e.g. `google,facebook,apple`).
- [ ] Optional: native Google account picker (`apps/mobile/services/auth/index.ts` has the steps).

## 4. Payments (Razorpay)

Purchases currently run on the **dummy** provider: no money moves and credits are free.

- [ ] Complete Razorpay KYC and get the account activated.
- [ ] Set real prices (amounts are in paise; the current values are placeholders):
      ```sql
      update public.credit_packs set price_minor = ... where id = 'credits-10';
      update public.credit_packs set price_minor = ... where id = 'credits-25';
      update public.credit_packs set price_minor = ... where id = 'credits-50';
      update public.subscription_plans set price_minor = ... where id = 'plus-monthly';
      ```
- [ ] Create the webhook in Razorpay pointing to
      `https://<project-ref>.supabase.co/functions/v1/payment-webhook?provider=razorpay`
      with events `payment.captured`, `order.paid`, `payment.failed`.
- [ ] Switch the server to Razorpay and **stop allowing the dummy**:
      ```sh
      supabase secrets set PAYMENT_PROVIDER=razorpay RAZORPAY_KEY_ID=rzp_test_... \
        RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
      supabase secrets unset PAYMENTS_ALLOW_DUMMY
      ```
- [ ] In the app: `npx expo install react-native-razorpay` and register the adapter in
      `apps/mobile/services/checkout/index.ts` (the lines are in the comment there).
- [ ] Test end to end with **test keys**: successful payment, cancelled sheet, failed card, and
      the webhook arriving after the app was closed. Check credits are granted exactly once.
- [ ] Swap to **live keys** and a live webhook secret; make one small real purchase and refund it.
- [ ] If any test credits were granted in the production database, clear them
      (`credit_transactions` and `user_subscriptions` rows from `payment_orders` with provider
      `dummy`).
- [ ] **Store billing rules:** Google Play and the App Store generally require their own in-app
      billing for digital goods (credits, subscriptions). Confirm whether you qualify for an
      exception or alternative billing in India before shipping Razorpay in the store builds;
      otherwise you'll need a Play Billing / StoreKit provider (the checkout adapter design
      supports adding one).

## 5. Push notifications

Push goes through the Expo push service (`exp.host`), which needs platform credentials on EAS.

- [ ] **Android:** create a Firebase service account key (FCM v1) and upload it with
      `eas credentials` → Android → Push Notifications. Check `google-services.json` is from the
      production Firebase project.
- [ ] **iOS:** let EAS create the APNs key on the first iOS build, or upload one.
- [ ] `FCM_SERVER_KEY` in `.env.example` is the old legacy key and is not used by the code; you
      can ignore it.
- [ ] Optional: turn on Expo push security (access token) and set it as an Edge Function secret.

## 6. Mobile app configuration

- [ ] Add an iOS `bundleIdentifier` to `apps/mobile/app.json` (only the Android `package` is set).
- [ ] Production env for EAS builds (`eas env:create` or the EAS dashboard), not a local `.env`:
      `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
      `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_SOCIAL_AUTH_PROVIDERS`,
      `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL` (and the Google client IDs if you
      use the native picker).
- [ ] **Restrict the Google Maps key** in Google Cloud to your Android package + SHA-1 and to the
      Maps SDK for Android (it's only used for the Android map). `EXPO_PUBLIC_` values are
      visible to anyone with the app.
- [ ] Set a budget alert in Google Cloud for the Maps SDK.
- [ ] **Place search (Photon):** the public server is free but fair-use with no uptime guarantee.
      Before launch, decide whether that's enough or run your own Photon (open source) and set
      `EXPO_PUBLIC_PHOTON_URL`. Keep the OpenStreetMap credit shown under the search field.
- [ ] Replace placeholder icons/splash if needed; the Android adaptive icon background is still
      the default `#E6F4FE`, not the app's dark theme.
- [ ] Set `version` and confirm `eas.json` production profile (`autoIncrement` is on).
- [ ] Build with `eas build --profile production` for Android and iOS.

## 7. Features the stores will ask for

These are likely to block review if missing.

- [x] **Account deletion in the app.** Settings → Delete account (typed confirmation). The
      `delete-account` Edge Function removes photos, Kundli images, chats and the auth user;
      everything else cascades. Google Play still needs a **web** deletion link (see section 8).
- [x] **Report and block users.** Report and block from a profile in Discover, the like preview
      and the chat menu; unblock under Settings → Blocked people. Unmatch and Hide work too.
- [ ] **Act on reports (Apple 1.2).** Decide who reviews `user_reports` and how quickly (aim for
      within 24 hours), and follow the moderation steps in `supabase/README.md`.
- [x] **Age gate (18+).** The birth date picker stops at 18 years ago, and the database refuses an
      under-18 date of birth (and finishing onboarding without one) for app users. The terms and
      the welcome screen say the app is 18+. Profiles saved before the gate can be found with the
      query in `supabase/migrations/20260611090000_age_gate.sql`.
- [x] **Privacy policy and terms in the app.** Linked from the welcome screen (consent line) and
      Settings → Legal. Draft text is built in (`apps/mobile/constants/legal.ts`).
- [ ] **Finish the legal text.** Have a lawyer review the drafts, fill in every bracketed value
      (`LEGAL_CONTACT`: company name, address, support and grievance emails, Grievance Officer;
      dates, city, retention days, payment provider), and describe billing once it's final.
- [ ] **Host the privacy policy and terms** on a public web page (required by both stores, the
      Google OAuth consent screen and Meta). Use the same text as the app, then set
      `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_TERMS_URL` for the build so the app opens
      the hosted pages and they can't drift apart.
- [ ] Content moderation for profile photos and bios (manual review queue at minimum).

## 8. Store listings

### Google Play
- [ ] Developer account; app signing by Google Play.
- [ ] Data safety form (phone, email, name, birth date/time/place, location, photos, messages,
      payment info if Razorpay).
- [ ] Content rating questionnaire; target audience 18+; declare the app as a dating app.
- [ ] Closed testing track first (new personal developer accounts need 12+ testers for 14 days
      before production access).
- [ ] Account deletion URL: a web page (or form) where someone can request deletion without the
      app, listing what's deleted and kept. Requests can be actioned by deleting the user from
      Supabase → Authentication (the same cascade as in-app deletion; also clear their Storage
      folders `profile-photos/<id>/` and `kundli-charts/<id>/`).

### Apple App Store
- [ ] Apple Developer Program membership.
- [ ] App Privacy "nutrition label" answers.
- [ ] Age rating 17+/18+; review notes with a **demo account** (a phone number + OTP that works
      for the reviewer) so they can get past sign-in.
- [ ] TestFlight round before submitting.

## 9. Legal and compliance (India)

- [ ] Privacy policy that covers the **DPDP Act 2023**: what you collect, why, retention, how to
      delete, grievance officer contact. The built-in draft covers these headings; it needs legal
      review, real contact details, and updating if the data flows change (e.g. adding analytics).
- [ ] Birth details, location and photos are sensitive; only collect what you use and say how
      long you keep it.
- [ ] GST registration and invoices for paid credits/subscriptions if required.
- [ ] Check the astrology API's terms allow commercial use and your expected volume.

## 10. Operations

- [ ] Error reporting in the app (e.g. Sentry via `sentry-expo` / `@sentry/react-native`).
- [ ] Watch Edge Function logs and errors in Supabase after launch.
- [ ] Set spend caps / usage alerts for Supabase, the SMS provider, Google Maps and the
      astrology API.
- [ ] A support email shown in the app and store listings.
- [ ] Decide how you'll handle refunds and failed payments (Razorpay dashboard + manual credit
      adjustment).
- [ ] Rotate any secrets that were ever shared in chat, screenshots or committed by mistake.
- [ ] Optional: CI that runs `npm --prefix apps/mobile test`, typecheck, lint and
      `npm run supabase:functions:test` on pull requests (the repo has none yet).
