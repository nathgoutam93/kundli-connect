import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync } from 'expo-image-manipulator';
import { Image } from 'react-native';

import { uploadProfilePhoto, uploadProfilePhotos } from './profile-photo-service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockSequence = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockSequence).padStart(12,'0')}` }));
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn(), readAsStringAsync: jest.fn(), deleteAsync: jest.fn(), EncodingType: { Base64: 'base64' } }));
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => mockClient }));

const user = 'aaaaaaaa-0000-4000-8000-000000000001';
const objects = new Set<string>();
const mockUpload = jest.fn();
const mockCommit = jest.fn();
const mockReserve = jest.fn();
const mockCancel = jest.fn();
const mockClient = {
  auth: { getSession: async () => ({ data: { session: { user: { id: user } } }, error: null }) },
  rpc: (name: string, args: { p_upload_id: string; p_replace_path?: string }) => name === 'reserve_profile_photo' ? mockReserve(args)
    : name === 'cancel_profile_photo' ? mockCancel(args) : mockCommit(args),
  storage: { from: () => ({ upload: mockUpload, list: async (_folder: string, opts: { search: string }) => ({
    data: objects.has(`${user}/${opts.search}`) ? [{ name: opts.search, metadata: { size: 100 } }] : [], error: null,
  }) }) },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  objects.clear();
  mockSequence = 0;
  jest.clearAllMocks();
  mockReserve.mockImplementation(async ({ p_upload_id }) => ({ data: {
    storage_path: `${user}/${p_upload_id}.jpg`, status: 'pending', expires_at: new Date(Date.now()+60000).toISOString(),
  }, error: null }));
  mockCommit.mockImplementation(async ({ p_upload_id }) => ({ data: `${user}/${p_upload_id}.jpg`, error: null }));
  mockCancel.mockResolvedValue({ data: true, error: null });
  mockUpload.mockImplementation(async (path: string) => { objects.add(path); return { error: null }; });
  jest.mocked(manipulateAsync).mockResolvedValue({ uri: 'file://resized.jpg', width: 1600, height: 1067 });
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, uri: 'file://resized.jpg', isDirectory: false, modificationTime: 0, size: 100 });
  jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue('YQ==');
  jest.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined);
  jest.spyOn(Image, 'getSize').mockImplementation(async (_uri, success) => { success?.(6000,4000); return { width: 6000, height: 4000 }; });
});

test('resizes before decoding/uploading and removes the temporary file', async () => {
  expect(await uploadProfilePhoto('file://original.jpg')).toContain('profile-photo://');
  expect(manipulateAsync).toHaveBeenCalledWith('file://original.jpg', [{ resize: { width: 1600, height: 1067 } }], { compress: 0.7, format: 'jpeg' });
  expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file://resized.jpg', expect.anything());
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file://resized.jpg', { idempotent: true });
  expect(mockUpload).toHaveBeenCalledWith(expect.any(String), expect.any(ArrayBuffer), expect.objectContaining({ upsert: false, contentType: 'image/jpeg' }));
});

test('an unknown commit result reuses the same upload ID and object on retry', async () => {
  mockCommit.mockResolvedValueOnce({ error: { message: 'Offline' } }).mockResolvedValueOnce({ error: { message: 'Offline' } });
  await expect(uploadProfilePhoto('file://original.jpg')).rejects.toThrow('Offline');
  await uploadProfilePhoto('file://original.jpg');
  expect(mockReserve.mock.calls[0][0].p_upload_id).toBe(mockReserve.mock.calls[1][0].p_upload_id);
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(manipulateAsync).toHaveBeenCalledTimes(1);
});

test('a lost upload response is reconciled before retrying or registering', async () => {
  mockUpload.mockImplementationOnce(async (path: string) => { objects.add(path); return { error: { message: 'Lost response' } }; });
  await expect(uploadProfilePhoto('file://original.jpg')).resolves.toContain('profile-photo://');
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockCommit).toHaveBeenCalledTimes(1);
});

test('batch failures retain successful results and replacement identifies the old path', async () => {
  jest.mocked(manipulateAsync).mockRejectedValueOnce(new Error('Bad image'));
  const results = await uploadProfilePhotos(['file://bad.jpg','file://good.jpg'],user);
  expect(results[0]).toMatchObject({ localUri: 'file://bad.jpg', error: 'Bad image' });
  expect(results[1].photoUri).toContain('profile-photo://');
  await uploadProfilePhoto('file://replacement.jpg', `profile-photo://${user}/old.jpg`);
  expect(mockReserve).toHaveBeenLastCalledWith(expect.objectContaining({ p_replace_path: `${user}/old.jpg` }));
});

test('oversized processed files are rejected before base64 allocation or upload', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, uri: 'file://resized.jpg', size: 3000000, isDirectory: false, modificationTime: 0 });
  await expect(uploadProfilePhoto('file://large.jpg')).rejects.toThrow('too large');
  expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  expect(mockUpload).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
  expect(mockCancel).toHaveBeenCalledTimes(1);
});
