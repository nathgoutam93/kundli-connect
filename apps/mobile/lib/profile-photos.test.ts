import { photoPath, photoReference, profileImageSource, resizeDimensions } from './profile-photos';

test('private references use an authenticated endpoint and never put tokens in URLs', () => {
  const ref = photoReference('user/photo.jpg');
  const source = profileImageSource(ref, 'https://project.supabase.co/', 'secret', 'public-key');
  expect(source).toEqual({ uri: 'https://project.supabase.co/functions/v1/profile-photo?path=user%2Fphoto.jpg',
    headers: { Authorization: 'Bearer secret', apikey: 'public-key' } });
  expect(source?.uri).not.toContain('secret');
  expect(profileImageSource(ref, 'https://project.supabase.co')).toBeNull();
  expect(profileImageSource('https://untrusted.example/photo.jpg', 'https://project.supabase.co', 'secret'))
    .toEqual({ uri: 'https://untrusted.example/photo.jpg' });
  expect(photoPath('profile-photo://user/../photo.jpg')).toBeNull();
});

test('photos are bounded on their longest edge, without upscaling', () => {
  expect(resizeDimensions(6000, 4000)).toEqual({ width: 1600, height: 1067 });
  expect(resizeDimensions(3000, 6000)).toEqual({ width: 800, height: 1600 });
  expect(resizeDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  expect(() => resizeDimensions(0, 100)).toThrow();
});
