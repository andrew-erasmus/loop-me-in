import { useEffect, useState } from 'react';

// Mirrors Tailwind's `md` breakpoint, which is what every mobile/desktop
// chrome split in this app is already built on.
const QUERY = '(max-width: 767px)';

/**
 * For the rare interaction that has to *behave* differently by width, not
 * just look different — CSS's `md:` classes handle every chrome swap, but a
 * click handler can't branch in CSS. Keep reaching for this the exception,
 * not the default.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
