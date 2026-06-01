import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async () => {
  return Response.json(
    {
      error: 'Not implemented',
      next: 'Call the Kundli API with server-side secrets, then upsert public.kundlis.',
    },
    { status: 501 }
  );
});

