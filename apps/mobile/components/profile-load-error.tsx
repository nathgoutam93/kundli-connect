import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';

export function ProfileLoadError({ onRetry }: { onRetry: () => Promise<unknown> }) {
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try { await onRetry(); } catch { /* The route keeps the error screen visible. */ }
    finally { setRetrying(false); }
  }
  return (
    <Screen>
      <EmptyState
        icon="cloud-offline-outline"
        title="Could not load your profile"
        message="Your saved profile is safe. Check your connection and try again."
        action={<Button label="Try again" loading={retrying} onPress={() => { void retry(); }} />}
      />
    </Screen>
  );
}
