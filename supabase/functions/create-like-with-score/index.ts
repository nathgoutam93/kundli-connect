import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async () => {
  return Response.json(
    {
      error: 'Not implemented',
      next: 'Fetch both kundlis, call matchmaking API, deduct credits, then insert public.likes.',
    },
    { status: 501 }
  );
});

