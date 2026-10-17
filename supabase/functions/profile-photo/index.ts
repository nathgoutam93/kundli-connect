import { profilePhotoResponse } from '../_shared/profile-photo.ts';
import { getRequestContext } from '../_shared/supabase.ts';

Deno.serve((request) => profilePhotoResponse(request, () => getRequestContext(request)));
