import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';

type Attempt = { userId: string; kind: 'send' | 'reply'; targetId: string; text: string };
let storageWrites = Promise.resolve();
function serialize<T>(work: () => Promise<T>) {
  const result = storageWrites.then(work);
  storageWrites = result.then(() => undefined, () => undefined);
  return result;
}
async function keyFor(attempt: Attempt) {
  // Store a fingerprint and UUID, never the message body, in the retry journal.
  const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([attempt.kind,attempt.targetId,attempt.text.trim()]));
  return `message-attempt-v1:${attempt.userId}:${hash}`;
}
export async function getMessageRequestId(attempt: Attempt) {
  const key = await keyFor(attempt);
  return serialize(async () => {
    const existing = await AsyncStorage.getItem(key);
    if (existing && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(existing)) return existing;
    const id = randomUUID();
    await AsyncStorage.setItem(key,id);
    return id;
  });
}
export async function confirmMessageRequest(attempt: Attempt, requestId: string) {
  const key = await keyFor(attempt);
  await serialize(async () => {
    if (await AsyncStorage.getItem(key) === requestId) await AsyncStorage.removeItem(key);
  });
}
