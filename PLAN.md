# Kundli Connect — System Design & Development Plan

## Overview

Kundli Connect is a matchmaking and dating platform focused on astrology-based compatibility using Kundli generation and matchmaking scores.

Backend architecture is built entirely on Supabase products with third-party astrology APIs.

# Core Goals

- Phone + Google authentication
- User profile management
- Kundli generation
- Compatibility scoring
- Matchmaking
- Real-time chat
- Push notifications
- Credit economy
- Membership subscriptions
- Scalable serverless backend

# Technology Stack

## Frontend

- Expo 

# Backend Infrastructure

Using only Supabase products:

| Product | Purpose |
|---|---|
| Supabase Auth | Authentication |
| Supabase Postgres | Main database |
| Supabase Storage | Media storage |
| Supabase Realtime | Chat + live updates |
| Supabase Edge Functions | Business logic |
| Supabase Cron | Scheduled jobs |
| Row Level Security | Authorization |

---

# Third Party Services

## Kundli API

https://astrologyapi.com/developers/v1/vedic/birth_details
https://astrologyapi.com/developers/v1/vedic/astro_details
https://astrologyapi.com/developers/v1/vedic/match_making_detailed_report

## Push Notifications

- Firebase Cloud Messaging (FCM)

## Payments

- Razorpay

---

# System Architecture

```text
Frontend App
     |
     v
Supabase Platform
 ├── Auth
 ├── Postgres
 ├── Storage
 ├── Realtime
 ├── Edge Functions
 └── Cron Jobs
     |
     v
Third Party APIs
 ├── Kundli API
 ├── FCM
 └── Razorpay
```

---

# Functional Requirements

# Authentication

## Features

- Phone OTP login
- Google login
- Session persistence
- JWT authentication

## Supabase Features Used

- Supabase Auth
- OAuth Providers
- Phone OTP

---

# User Profiles

## Features

- Create/edit profile
- Upload profile pictures
- Bio and preferences
- Verification status

# Kundli Generation

## Flow

```text
User submits birth details
        |
        v
Edge Function
        |
        v
Third Party Kundli API
        |
        v
Store parsed kundli in Postgres
        |
        v
Show curated chart in kundli details screen
```

## Notes

- Store raw JSON response
- Never expose API keys to frontend
- Generate once and cache

# Matchmaking System

## Features

- on Like intend
- Generate compatibility score using matchmaking api
- show curated matching score screen
- allow sending a one liner to initate like initent
- on reply to like intent, generate mutual like

## Matchmaking Flow

```text
User likes profile
        |
        v
Edge Function
        |
        ├── Fetch both kundlis
        ├── Generate score
        ├── Deduct credits
        ├── Save like
        └── show score to user, let user initiate like intend or dismiss 
```

# Discovery Feed

## Filters

- Age
- Religion
- Distance
- Mother tongue

## Query Strategy

Use:
- PostgreSQL RPC functions
- Indexed filtering
- Pagination

# Chat System

## Features

- Real-time messaging
- Seen status
- Media sharing

## Implementation

- Supabase Realtime
- Postgres messages table

# Push Notifications

## Notification Types

- New likes
- New matches
- New messages
- Subscription expiry

## Flow

```text
Database Trigger
      |
      v
Edge Function
      |
      v
Firebase Cloud Messaging
```

---

# Credit System

## Features

- Daily free credits
- Paid credits
- Credit deductions
- Transaction history

## Credit Usage

| Action | Credits |
|---|---|
| Generate Score | 2 |
| Send Like | 1 |
---

# Membership System

## Plans

### Free
- Limited likes
- Basic filters

### Gold
- Unlimited likes
- Advanced filters

### Premium
- Profile boosts
- Priority discovery
- Read receipts

---

# Payment Flow

```text
Frontend
    |
    v
Razorpay Checkout
    |
    v
Webhook -> Edge Function
    |
    v
Update subscription
```

# Storage Design

# Buckets

| Bucket | Purpose |
|---|---|
| profile-images | User photos |
| chat-media | Chat attachments |

# Security Design

# Mandatory Rules

- Enable RLS on all tables
- Use Edge Functions for sensitive operations
- Never expose API secrets
- Validate ownership everywhere

# Example RLS Policies

## messages

Users can only read messages from conversations they belong to.

## profile_images

Users can upload only to their own folder.

## likes

Prevent duplicate likes.

# Realtime Channels

| Channel | Purpose |
|---|---|
| messages | Chat |
| notifications | Live notifications |
| presence | Online status |
