import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

import { photoPath, photoReference, resizeDimensions } from '@/lib/profile-photos';
import { getSupabaseClient } from '@/lib/supabase';

export type PhotoUploadResult = { localUri: string; photoUri?: string; error?: string };
type Reservation = { storage_path: string; status: 'pending' | 'committed' | 'cancelled'; expires_at: string };

async function requireUser(expectedId?: string) {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user || (expectedId && user.id !== expectedId)) throw new Error('Your session changed. Please try again.');
  return user;
}

function ownedPath(reference: string, userId: string) {
  const path = photoPath(reference);
  if (!path?.startsWith(`${userId}/`)) throw new Error('This photo could not be found. Reload your profile.');
  return path;
}

async function preparePhoto(uri: string) {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
  const dimensions = resizeDimensions(width, height);
  const staged = await manipulateAsync(uri, [{ resize: dimensions }], { compress: 0.7, format: SaveFormat.JPEG });
  try {
    const info = await FileSystem.getInfoAsync(staged.uri);
    if (!info.exists || info.size < 1 || info.size > 2 * 1024 * 1024) {
      throw new Error('This photo is too large. Please choose a smaller photo.');
    }
    const base64 = await FileSystem.readAsStringAsync(staged.uri, { encoding: FileSystem.EncodingType.Base64 });
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } finally {
    await FileSystem.deleteAsync(staged.uri, { idempotent: true }).catch(() => undefined);
  }
}

/** The operation ID survives app restarts and ambiguous upload/commit responses. */
export async function uploadProfilePhoto(uri: string, replacement?: string, expectedUserId?: string, restartExpired = true): Promise<string> {
  const supabase = getSupabaseClient();
  const user = await requireUser(expectedUserId);
  const replacePath = replacement ? ownedPath(replacement, user.id) : null;
  const key = `photo-upload:${user.id}:${encodeURIComponent(uri)}:${encodeURIComponent(replacePath ?? 'new')}`;
  let uploadId = await AsyncStorage.getItem(key);
  if (!uploadId) {
    uploadId = randomUUID();
    await AsyncStorage.setItem(key, uploadId);
  }
  const { data, error } = await supabase.rpc('reserve_profile_photo', { p_upload_id: uploadId, p_replace_path: replacePath });
  if (error) throw new Error(error.message || 'Could not start photo upload.');
  const reservation = data as Reservation | null;
  if (!reservation) throw new Error('Could not start photo upload.');
  if (reservation.status === 'cancelled' || (reservation.status === 'pending' && Date.parse(reservation.expires_at) <= Date.now())) {
    if (!restartExpired) throw new Error('Upload expired. Select the photo again.');
    await AsyncStorage.removeItem(key);
    return uploadProfilePhoto(uri, replacement, user.id, false);
  }
  if (reservation.status !== 'committed') {
    const exists = async () => {
      const filename = reservation.storage_path.split('/').pop()!;
      const { data, error } = await supabase.storage.from('profile-photos').list(user.id, { search: filename, limit: 10 });
      if (error) throw new Error('Could not check the upload. Please try again.');
      return data?.some((file) => file.name === filename && Number(file.metadata?.size) > 0);
    };
    if (!await exists()) {
      let bytes: ArrayBuffer;
      try {
        bytes = await preparePhoto(uri);
      } catch (error) {
        // A known local failure happened before upload. Free its slot without ever
        // cancelling an ambiguous server commit or deleting a registered photo.
        await requireUser(user.id);
        const cancelled = await supabase.rpc('cancel_profile_photo', { p_upload_id: uploadId });
        if (!cancelled.error && cancelled.data === true) await AsyncStorage.removeItem(key);
        throw error;
      }
      await requireUser(user.id);
      const { error } = await supabase.storage.from('profile-photos').upload(reservation.storage_path, bytes, {
        contentType: 'image/jpeg', upsert: false, cacheControl: '0',
      });
      // If the response was lost, check the same immutable path before deciding to upload again.
      if (error && !await exists()) throw new Error('Photo upload failed. Please try again.');
    }
    await requireUser(user.id);
    const commit = () => supabase.rpc('commit_profile_photo', { p_upload_id: uploadId });
    let result = await commit();
    if (result.error) {
      await requireUser(user.id);
      result = await commit();
    }
    if (result.error || !result.data) throw new Error(result.error?.message || 'Could not finish photo upload. Please retry this photo.');
  }
  await requireUser(user.id);
  // Failure to forget a completed ID is harmless: the next retry returns the same registered photo.
  await AsyncStorage.removeItem(key).catch(() => undefined);
  return photoReference(reservation.storage_path);
}

/** Sequential processing bounds memory use and reports successes even if another item fails. */
export async function uploadProfilePhotos(uris: string[], expectedUserId: string): Promise<PhotoUploadResult[]> {
  const results: PhotoUploadResult[] = [];
  const seen = new Set<string>();
  for (const uri of uris) {
    if (seen.has(uri)) continue;
    seen.add(uri);
    try { results.push({ localUri: uri, photoUri: await uploadProfilePhoto(uri, undefined, expectedUserId) }); }
    catch (error) { results.push({ localUri: uri, error: error instanceof Error ? error.message : 'Photo upload failed. Please try again.' }); }
  }
  return results;
}

export async function removeProfilePhoto(reference: string, expectedUserId?: string) {
  const user = await requireUser(expectedUserId);
  const { error } = await getSupabaseClient().rpc('remove_profile_photo', { p_path: ownedPath(reference, user.id) });
  if (error) throw new Error(error.message || 'Could not remove photo.');
}

export async function reorderProfilePhotos(references: string[], expectedUserId?: string) {
  const user = await requireUser(expectedUserId);
  const paths = references.map((reference) => ownedPath(reference, user.id));
  const { error } = await getSupabaseClient().rpc('reorder_profile_photos', { p_storage_paths: paths });
  if (error) throw new Error(error.message || 'Could not reorder photos.');
}
