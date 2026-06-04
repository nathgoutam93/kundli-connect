import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 30 * 60 * 1000,
      retry: 1,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

let listenersConfigured = false;

export function configureReactNativeQueryListeners() {
  if (listenersConfigured || Platform.OS === 'web') {
    return () => undefined;
  }

  listenersConfigured = true;
  const appStateSubscription = AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
  });
  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    onlineManager.setOnline(Boolean(state.isConnected));
  });

  return () => {
    listenersConfigured = false;
    appStateSubscription.remove();
    unsubscribeNetInfo();
  };
}
