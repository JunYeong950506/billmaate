import { useEffect, useState } from 'react';

export type LayoutMode = 'mobile' | 'desktop';

const DESKTOP_QUERY = '(min-width: 1024px)';

function getInitialMode(): LayoutMode {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  return window.matchMedia(DESKTOP_QUERY).matches ? 'desktop' : 'mobile';
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() => getInitialMode());

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_QUERY);

    const handleChange = (event: MediaQueryListEvent): void => {
      setMode(event.matches ? 'desktop' : 'mobile');
    };

    setMode(mediaQuery.matches ? 'desktop' : 'mobile');

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return mode;
}
