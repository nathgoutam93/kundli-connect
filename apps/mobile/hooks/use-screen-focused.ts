import { NavigationContext } from '@react-navigation/native';
import { useContext, useEffect, useState } from 'react';

/**
 * Whether the screen this component lives in is the one being shown. Outside a navigator (e.g.
 * the root loading state) it reports `true`. Used to pause decorative loops on hidden screens.
 */
export function useScreenFocused() {
  const navigation = useContext(NavigationContext);
  const [isFocused, setIsFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) {
      return;
    }
    setIsFocused(navigation.isFocused());
    const unsubscribeFocus = navigation.addListener('focus', () => setIsFocused(true));
    const unsubscribeBlur = navigation.addListener('blur', () => setIsFocused(false));
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  return isFocused;
}
