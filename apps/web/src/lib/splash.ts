/**
 * Takes down the launch splash that `index.html` paints before the bundle
 * loads.
 *
 * It waits for the infinity to be whole before fading, so the splash never
 * leaves mid-stroke with half a symbol on screen. The draw is one CSS animation
 * cycle; these mark the stretch of it where both strands are fully drawn, and
 * must match the `45%, 62%` stop in the `splash-loop` keyframes.
 */
const CYCLE_MS = 2800;
const HOLD_START = 0.45 * CYCLE_MS;
const HOLD_END = 0.62 * CYCLE_MS;
const FADE_MS = 400;

let hiding = false;

export function hideSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash || hiding) return;
  hiding = true;

  const leave = () => {
    splash.classList.add('leaving');
    window.setTimeout(() => {
      splash.remove();
      document.documentElement.classList.remove('splashing');
    }, FADE_MS);
  };

  // Where in the loop the strands are right now. No running animation — reduced
  // motion, or no Web Animations API — means the symbol is static and already
  // whole, so there is nothing to wait for.
  const strand = splash.querySelector('path');
  const animation = strand?.getAnimations?.()[0];
  const time = animation?.currentTime;
  if (typeof time !== 'number') {
    leave();
    return;
  }

  const t = time % CYCLE_MS;
  const wait = t < HOLD_START ? HOLD_START - t : t <= HOLD_END ? 0 : CYCLE_MS - t + HOLD_START;
  window.setTimeout(leave, wait);
}
