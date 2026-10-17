const prefix = 'profile-photo://';

export function photoReference(storagePath: string) {
  return `${prefix}${storagePath}`;
}

export function photoPath(reference: string) {
  if (!reference.startsWith(prefix)) return null;
  const path = reference.slice(prefix.length);
  if (!path || path.split('/').some((segment) => !segment || segment === '.' || segment === '..') || /[?#\\]/.test(path)) return null;
  return path;
}

/** Credentials are attached only to our configured Storage origin, never an arbitrary image URL. */
export function profileImageSource(reference: string, baseUrl: string, accessToken?: string, apiKey?: string) {
  const path = photoPath(reference);
  if (reference.startsWith(prefix) && !path) return null;
  if (!path) return { uri: reference };
  if (!accessToken || !baseUrl) return null;
  return {
    uri: `${baseUrl.replace(/\/$/, '')}/functions/v1/profile-photo?path=${encodeURIComponent(path)}`,
    headers: { Authorization: `Bearer ${accessToken}`, ...(apiKey ? { apikey: apiKey } : {}) },
  };
}

export function resizeDimensions(width: number, height: number, max = 1600) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('This photo has invalid dimensions.');
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
