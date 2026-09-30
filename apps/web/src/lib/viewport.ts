/**
 * Keep `--app-height` equal to the part of the screen you can actually see.
 *
 * `100dvh` is supposed to be this and mostly is, but on iOS it is the browser's
 * account of the viewport rather than a measurement of it: it can lag a toolbar
 * that is mid-collapse, and it does not always reach the bottom edge of an
 * installed app. When it comes up short the shell stops above the bottom of the
 * screen and the page behind it shows through under the tab bar as a band.
 *
 * `visualViewport.height` is the measurement — the region genuinely on screen,
 * after browser chrome and the on-screen keyboard. Following it means the shell
 * is the right height while Safari's toolbar animates away, not a beat later,
 * and the tab bar sits on the bottom edge throughout.
 *
 * The CSS keeps `100dvh` as the fallback, so a browser without
 * `visualViewport` — or the first paint, before this runs — is no worse off
 * than before.
 */
export function trackViewportHeight(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;

  let frame = 0;
  const apply = () => {
    // resize and scroll both fire many times through a toolbar collapse;
    // coalescing to one write per frame keeps that from thrashing layout.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      document.documentElement.style.setProperty('--app-height', `${viewport.height}px`);
    });
  };

  apply();
  viewport.addEventListener('resize', apply);
  // iOS reports a collapsing toolbar as the visual viewport scrolling within
  // the layout viewport, not as a resize, so both are needed.
  viewport.addEventListener('scroll', apply);
}
