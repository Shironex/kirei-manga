import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the chrome stays after the last pointer move. */
const HIDE_AFTER_MS = 2600;

/**
 * Reader chrome that gets out of the way: shown on pointer movement, hidden
 * after a pause, kept while `pinned` (a panel is open, the scrubber is held,
 * focus is inside the chrome). `toggle` is the centre tap and the H key;
 * `hide` is for page turns from the keyboard, which mean reading.
 */
export function useAutoHide(pinned: boolean) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!pinnedRef.current) setVisible(false);
    }, HIDE_AFTER_MS);
  }, []);

  const show = useCallback(() => {
    setVisible(true);
    schedule();
  }, [schedule]);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    if (!pinnedRef.current) setVisible(false);
  }, []);

  const toggle = useCallback(() => {
    clearTimeout(timer.current);
    setVisible(current => {
      if (!current) schedule();
      return !current;
    });
  }, [schedule]);

  // Opening the reader shows the chrome once, then it fades.
  useEffect(() => {
    schedule();
    return () => clearTimeout(timer.current);
  }, [schedule]);

  // Unpinning (closing a panel) restarts the countdown.
  useEffect(() => {
    if (pinned) {
      clearTimeout(timer.current);
      setVisible(true);
    } else {
      schedule();
    }
  }, [pinned, schedule]);

  return { visible: visible || pinned, show, hide, toggle };
}
