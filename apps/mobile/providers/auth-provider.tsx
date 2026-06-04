import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Session, type User } from '@supabase/supabase-js';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase';
import { queryClient } from '@/lib/query-client';
import { requestPhoneOtp, signOut, verifyPhoneOtp } from '@/services/supabase-auth-service';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isInitializing: boolean;
  requestOtp: typeof requestPhoneOtp;
  verifyOtp: typeof verifyPhoneOtp;
  logout: typeof signOut;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let previousUserId: string | undefined;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        previousUserId = data.session?.user.id;
        setSession(data.session);
      })
      .catch((error) => console.warn('Supabase session initialization failed.', error))
      .finally(() => setIsInitializing(false));

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id;
      if (previousUserId !== nextUserId) {
        queryClient.clear();
      }
      previousUserId = nextUserId;
      setSession(nextSession);
      setIsInitializing(false);
    });

    void AsyncStorage.removeItem('kundalikonnect-local-state-v2');
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isInitializing,
      requestOtp: requestPhoneOtp,
      verifyOtp: verifyPhoneOtp,
      logout: signOut,
    }),
    [isInitializing, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
