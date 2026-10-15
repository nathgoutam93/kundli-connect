import { purchaseProduct, type CheckoutAdapter, type CheckoutSession } from '@/services/checkout';
import { createRazorpayCheckoutAdapter } from '@/services/checkout/razorpay-adapter';

jest.mock('@/lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

const session: CheckoutSession = {
  orderId: 'order-1',
  provider: 'fake',
  productName: '25 credits',
  amountMinor: 19900,
  currency: 'INR',
  checkout: {},
};

function fakeServer(confirmStatus: string, extra: Record<string, unknown> = {}) {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const invoke = jest.fn(async (name: string, body: Record<string, unknown>) => {
    calls.push({ name, body });
    return (name === 'create-checkout' ? session : { status: confirmStatus, ...extra }) as never;
  });
  return { invoke, calls };
}

function adapter(result: Awaited<ReturnType<CheckoutAdapter['pay']>>): CheckoutAdapter {
  return { provider: 'fake', pay: jest.fn(async () => result) };
}

describe('purchaseProduct', () => {
  it('creates the order, runs the adapter and lets the server confirm it', async () => {
    const { invoke, calls } = fakeServer('paid');
    const fake = adapter({ status: 'success', payload: { token: 'abc' } });

    const outcome = await purchaseProduct({ type: 'credit_pack', id: 'credits-25' }, {}, { invoke, adapters: { fake } });

    expect(outcome).toEqual({ status: 'paid', orderId: 'order-1' });
    expect(calls[0]).toEqual({ name: 'create-checkout', body: { productType: 'credit_pack', productId: 'credits-25' } });
    expect(calls[1]).toEqual({
      name: 'confirm-checkout',
      body: { orderId: 'order-1', result: { status: 'success', payload: { token: 'abc' } } },
    });
  });

  it('reports cancellations to the server so the order is closed', async () => {
    const { invoke, calls } = fakeServer('cancelled');
    const outcome = await purchaseProduct({ type: 'subscription', id: 'plus-monthly' }, {}, {
      invoke,
      adapters: { fake: adapter({ status: 'cancelled' }) },
    });

    expect(outcome.status).toBe('cancelled');
    expect(calls[1].body.result).toEqual({ status: 'cancelled' });
  });

  it('passes through server-side verification failures', async () => {
    const { invoke } = fakeServer('failed', { reason: 'Invalid payment signature.' });
    const outcome = await purchaseProduct({ type: 'credit_pack', id: 'credits-10' }, {}, {
      invoke,
      adapters: { fake: adapter({ status: 'success', payload: {} }) },
    });

    expect(outcome).toEqual({ status: 'failed', orderId: 'order-1', reason: 'Invalid payment signature.' });
  });

  it('fails cleanly when this build has no adapter for the server-selected provider', async () => {
    const { invoke, calls } = fakeServer('failed');
    const outcome = await purchaseProduct({ type: 'credit_pack', id: 'credits-10' }, {}, { invoke, adapters: {} });

    expect(outcome.status).toBe('failed');
    expect(calls[1].body.result).toMatchObject({ status: 'failed' });
  });
});

describe('Razorpay adapter', () => {
  const razorpaySession: CheckoutSession = {
    ...session,
    provider: 'razorpay',
    checkout: {
      keyId: 'rzp_test_key',
      razorpayOrderId: 'order_RZP1',
      amountMinor: 19900,
      currency: 'INR',
      name: 'Kundali Konnect',
      description: '25 credits',
    },
  };

  it('opens Standard Checkout with the server order and returns the signed response', async () => {
    const response = { razorpay_payment_id: 'pay_1', razorpay_order_id: 'order_RZP1', razorpay_signature: 'sig' };
    const sdk = { open: jest.fn(async () => response) };

    const result = await createRazorpayCheckoutAdapter(sdk).pay(razorpaySession, { email: 'a@b.c', phone: '+911' });

    expect(sdk.open).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'rzp_test_key',
        order_id: 'order_RZP1',
        amount: 19900,
        prefill: expect.objectContaining({ email: 'a@b.c', contact: '+911' }),
      })
    );
    expect(result).toEqual({ status: 'success', payload: response });
  });

  it('distinguishes a closed sheet from a failed payment', async () => {
    const cancelled = createRazorpayCheckoutAdapter({
      open: jest.fn(async () => Promise.reject({ code: 2, description: 'Payment Cancelled' })),
    });
    const failed = createRazorpayCheckoutAdapter({
      open: jest.fn(async () => Promise.reject({ code: 0, description: 'Network error' })),
    });

    expect(await cancelled.pay(razorpaySession, {})).toEqual({ status: 'cancelled' });
    expect(await failed.pay(razorpaySession, {})).toEqual({ status: 'failed', reason: 'Network error' });
  });
});
