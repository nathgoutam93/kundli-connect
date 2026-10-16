import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import type { LegalDocumentId } from '@/constants/legal';

// Hosted copies (the same URLs go in the store listings and OAuth consent screens). Each value is
// read directly so Expo inlines it at build time.
const HOSTED_URLS: Record<LegalDocumentId, string | undefined> = {
  privacy: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  terms: process.env.EXPO_PUBLIC_TERMS_URL,
};

export function hostedLegalUrl(doc: LegalDocumentId) {
  return HOSTED_URLS[doc]?.trim() || null;
}

/** Opens the hosted page when one is configured, otherwise the built-in copy. */
export async function openLegalDocument(doc: LegalDocumentId) {
  const url = hostedLegalUrl(doc);
  if (url) {
    try {
      await WebBrowser.openBrowserAsync(url);
      return;
    } catch {
      // No browser available; fall through to the built-in copy.
    }
  }
  router.push({ pathname: '/legal/[doc]', params: { doc } });
}
