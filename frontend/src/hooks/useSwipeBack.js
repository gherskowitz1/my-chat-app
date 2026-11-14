import { useEffect, useRef } from 'react';

const MOBILE_QUERY = '(max-width: 768px)'; // matches ChatLayout.module.css's breakpoint
const START_SLOP_PX = 10;     // movement before deciding swipe vs. scroll
const COMMIT_FRACTION = 0.35; // drag this far across to go back...
const FLICK_SPEED = 0.5;      // ...or flick at least this fast (px/ms)
const SETTLE_MS = 300;        // a bit over the panes' 0.28s CSS transition

// Swipe right on an open chat (phone layout only) to go back to the
// channel/DM list, with both panes following your finger like a native
// app. Ignores touches that start in a text box, a code block, something
// that scrolls sideways, or a full-screen overlay (image lightbox, pickers,
// profile cards) so those keep working normally.
export function useSwipeBack({ enabled, onBack, paneRef, navRef }) {
  // Read through a ref so a re-render mid-swipe (a new message arriving,
  // say) doesn't re-run the effect and drop the drag in progress.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const pane = paneRef.current;
    const nav = navRef.current;
    if (!enabled || !pane || !nav) return;

    let start = null;
    let dragging = false;
    let dx = 0;

    const shouldIgnore = (target) => {
      if (target.closest('textarea, input, select, pre, [data-no-swipe]')) return true;
      for (let el = target; el && el !== pane; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') return true;
        if (el.scrollWidth > el.clientWidth + 1 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) return true;
      }
      return false;
    };

    const setTransforms = (paneX, navX) => {
      pane.style.transform = paneX;
      nav.style.transform = navX;
    };

    const onStart = (e) => {
      if (e.touches.length !== 1 || !window.matchMedia(MOBILE_QUERY).matches) return;
      if (shouldIgnore(e.target)) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, time: Date.now() };
      dragging = false;
      dx = 0;
    };

    const onMove = (e) => {
      if (!start) return;
      const t = e.touches[0];
      const mx = t.clientX - start.x;
      const my = t.clientY - start.y;
      if (!dragging) {
        if (Math.abs(mx) < START_SLOP_PX && Math.abs(my) < START_SLOP_PX) return;
        // Mostly vertical (scrolling the chat) or leftward — not a swipe back.
        if (mx <= 0 || Math.abs(my) > Math.abs(mx)) { start = null; return; }
        dragging = true;
        pane.style.transition = 'none';
        nav.style.transition = 'none';
      }
      e.preventDefault(); // keep the chat from scrolling while dragging
      dx = Math.max(0, mx);
      setTransforms(`translateX(${dx}px)`, `translateX(calc(-100% + ${dx}px))`);
    };

    const onEnd = () => {
      if (!start) return;
      const wasDragging = dragging;
      const elapsed = Math.max(1, Date.now() - start.time);
      start = null;
      dragging = false;
      if (!wasDragging) return;

      pane.style.transition = '';
      nav.style.transition = '';
      const committed = dx > pane.offsetWidth * COMMIT_FRACTION || (dx > 40 && dx / elapsed > FLICK_SPEED);
      if (committed) {
        // Animate the rest of the way to the list's resting position, then
        // hand over to the CSS classes (which describe that same position),
        // so there's no snap back before onBack's re-render lands.
        setTransforms('translateX(100%)', 'translateX(0)');
        onBackRef.current();
        setTimeout(() => setTransforms('', ''), SETTLE_MS);
      } else {
        setTransforms('', ''); // CSS transition slides it back
      }
    };

    pane.addEventListener('touchstart', onStart, { passive: true });
    pane.addEventListener('touchmove', onMove, { passive: false });
    pane.addEventListener('touchend', onEnd);
    pane.addEventListener('touchcancel', onEnd);
    return () => {
      pane.removeEventListener('touchstart', onStart);
      pane.removeEventListener('touchmove', onMove);
      pane.removeEventListener('touchend', onEnd);
      pane.removeEventListener('touchcancel', onEnd);
      pane.style.transition = '';
      nav.style.transition = '';
    };
  }, [enabled, paneRef, navRef]);
}
