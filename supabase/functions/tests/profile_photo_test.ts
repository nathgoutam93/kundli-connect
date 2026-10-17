// deno-lint-ignore-file no-explicit-any require-await -- minimal Supabase fakes
import { profilePhotoResponse } from '../_shared/profile-photo.ts';
import { HttpError } from '../_shared/http.ts';

const path = 'aaaaaaaa-0000-4000-8000-000000000001/photo.jpg';
function context(permissions: boolean[]) {
  let downloads = 0;
  const value: any = {
    userClient: { rpc: async () => ({ data: permissions.shift() ?? false, error: null }) },
    adminClient: { storage: { from: () => ({ download: async () => { downloads++; return { data: new Blob(['photo'], { type: 'image/jpeg' }), error: null }; } }) } },
  };
  return { get: async () => value, downloads: () => downloads };
}

Deno.test('private photo delivery checks access twice and prevents response caching', async () => {
  const c = context([true,true]);
  const response = await profilePhotoResponse(new Request(`https://app/profile-photo?path=${path}`),c.get);
  if (response.status !== 200 || c.downloads() !== 1 || !response.headers.get('Cache-Control')?.includes('no-store')) throw new Error('Bad photo response');
  if (await response.text() !== 'photo') throw new Error('Missing image');
});

Deno.test('blocked, hidden, missing and signed-out requests do not expose photos', async () => {
  const c = context([false]);
  if ((await profilePhotoResponse(new Request(`https://app/photo?path=${path}`),c.get)).status !== 404 || c.downloads()) throw new Error('Denied photo downloaded');
  const response = await profilePhotoResponse(new Request(`https://app/photo?path=${path}`),async () => { throw new HttpError(401,'Unauthorized'); });
  if (response.status !== 401) throw new Error('Signed-out request allowed');
});

Deno.test('a block during the object download suppresses the response', async () => {
  const c = context([true,false]);
  const response = await profilePhotoResponse(new Request(`https://app/photo?path=${path}`),c.get);
  if (response.status !== 404 || await response.text() === 'photo') throw new Error('Block race leaked bytes');
});

Deno.test('path traversal cannot reach Storage', async () => {
  const c = context([true,true]);
  const response = await profilePhotoResponse(new Request('https://app/photo?path=../../private'),c.get);
  if (response.status !== 404 || c.downloads()) throw new Error('Invalid path reached Storage');
});
