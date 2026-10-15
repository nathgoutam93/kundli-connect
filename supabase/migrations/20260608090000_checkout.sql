-- Provider-agnostic checkout.
--
-- Prices live in the database (never trusted from the app). An Edge Function creates a
-- payment_orders row, asks the configured provider (dummy or Razorpay) to create its order,
-- and fulfils the purchase once the provider confirms payment, either from the app's confirm
-- call or from the provider webhook. fulfill_payment_order is idempotent, so both paths can
-- race safely. Everything that creates or fulfils orders is service-role only.

-- ---------------------------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------------------------

create table if not exists public.credit_packs (
  id text primary key,
  name text not null,
  credits integer not null check (credits > 0),
  price_minor integer not null check (price_minor > 0),
  currency text not null default 'INR',
  active boolean not null default true,
  sort_order integer not null default 0
);

alter table public.credit_packs enable row level security;

drop policy if exists "Authenticated users read active credit packs" on public.credit_packs;
create policy "Authenticated users read active credit packs"
on public.credit_packs for select
to authenticated
using (active);

revoke insert, update, delete, truncate on public.credit_packs from anon, authenticated;
revoke all on public.credit_packs from anon;

-- Placeholder prices; change them here (or in the table) before going live.
insert into public.credit_packs (id, name, credits, price_minor, sort_order)
values
  ('credits-10', '10 credits', 10, 9900, 1),
  ('credits-25', '25 credits', 25, 19900, 2),
  ('credits-50', '50 credits', 50, 34900, 3)
on conflict (id) do nothing;

alter table public.subscription_plans
  add column if not exists price_minor integer check (price_minor is null or price_minor > 0),
  add column if not exists currency text not null default 'INR',
  add column if not exists duration_days integer not null default 30 check (duration_days > 0);

update public.subscription_plans set price_minor = 49900, duration_days = 30
where id = 'plus-monthly' and price_minor is null;
update public.subscription_plans set price_minor = 119900, duration_days = 90
where id = 'premium-quarterly' and price_minor is null;

-- ---------------------------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------------------------

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_type text not null check (product_type in ('credit_pack', 'subscription')),
  product_id text not null,
  product_name text not null,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null,
  provider text not null,
  provider_order_id text,
  provider_payment_id text,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  failure_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (provider, provider_order_id)
);

create index if not exists payment_orders_user_id_created_at_idx
  on public.payment_orders(user_id, created_at desc);

alter table public.payment_orders enable row level security;

drop policy if exists "Users read own payment orders" on public.payment_orders;
create policy "Users read own payment orders"
on public.payment_orders for select
to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete, truncate on public.payment_orders from anon, authenticated;
revoke all on public.payment_orders from anon;

-- Webhook deliveries already processed, so retries from the provider are ignored.
create table if not exists public.payment_webhook_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_webhook_events from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Order lifecycle (service role only)
-- ---------------------------------------------------------------------------------------------

-- Snapshots the price from the catalog into a new order.
create or replace function public.create_payment_order(
  p_user_id uuid,
  p_product_type text,
  p_product_id text,
  p_provider text
)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_amount integer;
  v_currency text;
  v_order public.payment_orders;
begin
  if p_product_type = 'credit_pack' then
    select name, price_minor, currency into v_name, v_amount, v_currency
    from public.credit_packs where id = p_product_id and active;
  elsif p_product_type = 'subscription' then
    select name, price_minor, currency into v_name, v_amount, v_currency
    from public.subscription_plans where id = p_product_id and active and price_minor is not null;
  else
    raise exception 'Unknown product type' using errcode = '22023';
  end if;

  if v_amount is null then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  insert into public.payment_orders (user_id, product_type, product_id, product_name, amount_minor, currency, provider)
  values (p_user_id, p_product_type, p_product_id, v_name, v_amount, v_currency, p_provider)
  returning * into v_order;

  return v_order;
end;
$$;

-- Marks an order paid and grants what was bought, exactly once. Safe to call from both the
-- app's confirm request and the provider webhook.
create or replace function public.fulfill_payment_order(
  p_order_id uuid,
  p_provider_payment_id text,
  p_amount_minor integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.payment_orders;
  v_credits integer;
  v_duration integer;
  v_renewal timestamptz;
begin
  select * into v_order from public.payment_orders where id = p_order_id for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.status = 'paid' then
    return jsonb_build_object('orderId', v_order.id, 'status', 'paid', 'alreadyFulfilled', true);
  end if;

  if p_amount_minor is not null and p_amount_minor <> v_order.amount_minor then
    raise exception 'Paid amount does not match the order' using errcode = '22023';
  end if;

  update public.payment_orders
  set status = 'paid', provider_payment_id = p_provider_payment_id, paid_at = now(), failure_reason = null
  where id = v_order.id;

  if v_order.product_type = 'credit_pack' then
    select credits into v_credits from public.credit_packs where id = v_order.product_id;

    insert into public.credit_transactions (user_id, amount, reason, metadata)
    values (v_order.user_id, v_credits, 'Purchased ' || v_order.product_name, jsonb_build_object('orderId', v_order.id));
  else
    select credit_bonus, duration_days into v_credits, v_duration
    from public.subscription_plans where id = v_order.product_id;

    -- Renewing while active extends from the current renewal date instead of resetting it.
    select greatest(coalesce(max(renewal_date), now()), now()) + make_interval(days => v_duration)
    into v_renewal
    from public.user_subscriptions
    where user_id = v_order.user_id and status = 'active';

    insert into public.user_subscriptions (user_id, plan_id, status, renewal_date, updated_at)
    values (v_order.user_id, v_order.product_id, 'active', v_renewal, now())
    on conflict (user_id) do update
    set plan_id = excluded.plan_id, status = 'active', renewal_date = excluded.renewal_date, updated_at = now();

    if coalesce(v_credits, 0) > 0 then
      insert into public.credit_transactions (user_id, amount, reason, metadata)
      values (v_order.user_id, v_credits, v_order.product_name || ' bonus credits', jsonb_build_object('orderId', v_order.id));
    end if;
  end if;

  insert into public.activity_events (user_id, event_type, title, description, metadata)
  values (
    v_order.user_id,
    case when v_order.product_type = 'credit_pack' then 'credit' else 'subscription' end,
    case when v_order.product_type = 'credit_pack' then v_order.product_name || ' added' else v_order.product_name || ' activated' end,
    'Payment received. Thank you!',
    jsonb_build_object('orderId', v_order.id)
  );

  return jsonb_build_object(
    'orderId', v_order.id,
    'status', 'paid',
    'alreadyFulfilled', false,
    'productType', v_order.product_type,
    'credits', coalesce(v_credits, 0),
    'renewalDate', v_renewal
  );
end;
$$;

-- Records a failed or cancelled payment; a paid order is never downgraded.
create or replace function public.fail_payment_order(p_order_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.payment_orders
  set status = 'failed', failure_reason = left(p_reason, 500)
  where id = p_order_id and status = 'created';
$$;

revoke all on function public.create_payment_order(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.fulfill_payment_order(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.fail_payment_order(uuid, text) from public, anon, authenticated;
grant execute on function public.create_payment_order(uuid, text, text, text) to service_role;
grant execute on function public.fulfill_payment_order(uuid, text, integer) to service_role;
grant execute on function public.fail_payment_order(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Retire the free test purchase functions (the dummy payment provider replaces them)
-- ---------------------------------------------------------------------------------------------

drop function if exists public.test_purchase_credits(integer);
drop function if exists public.activate_test_subscription(text);
drop function if exists public.restore_test_subscription();
drop function if exists public.assert_test_purchases_enabled();
delete from public.app_settings where key = 'test_purchases_enabled';
