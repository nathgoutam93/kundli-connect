import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async () => {
  return Response.json(
    {
      error: 'Not implemented',
      next: 'Load recipient push token and send through FCM using server-side credentials.',
    },
    { status: 501 }
  );
});

