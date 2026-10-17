import { functionError } from './service-error';

test('insufficient credits have a stable code for the purchase prompt', async () => {
  const error = await functionError({ context: new Response(JSON.stringify({ error: 'Credits needed' }), { status: 402 }) });
  expect(error.code).toBe('CREDITS_REQUIRED');
  expect(error.status).toBe(402);
});

test('server internals cannot become a user-facing error message', async () => {
  const error = await functionError({ context: new Response(JSON.stringify({ error: 'secret_table constraint failed' }), { status: 500 }) });
  expect(error.message).not.toContain('secret_table');
});
