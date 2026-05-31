/* =============================================================
   LOVEFLIX — polish.js
   Tiny progressive-enhancement: cursor-tracking 3D tilt on cards.
   - Pure vanilla, no deps
   - rAF-throttled, passive listeners
   - Skips on touch + reduced-motion
   - Self-cleans on mouseleave (no stuck transforms)
   Load at end of <body> with `defer`.
============================================================= */
(function lfPolish(){
  if (window.matchMedia('(hover: none)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SELECTOR = '.card, .lf-mock-thumb, .game-card';
  let raf = 0;
  let pending = null; // { el, tx, ty }

  function flush(){
    raf = 0;
    if (!pending) return;
    const { el, tx, ty } = pending;
    el.style.setProperty('--tx', tx.toFixed(3));
    el.style.setProperty('--ty', ty.toFixed(3));
    pending = null;
  }

  function onMove(e){
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const tx = ((e.clientX - r.left) / r.width  - 0.5) * 2;  // -1..1
    const ty = ((e.clientY - r.top)  / r.height - 0.5) * 2;
    pending = { el, tx, ty };
    if (!raf) raf = requestAnimationFrame(flush);
  }

  function onLeave(e){
    const el = e.currentTarget;
    el.style.removeProperty('--tx');
    el.style.removeProperty('--ty');
  }

  function bind(el){
    if (el.__lfTilt) return;
    el.__lfTilt = true;
    el.addEventListener('mousemove', onMove, { passive: true });
    el.addEventListener('mouseleave', onLeave, { passive: true });
  }

  function scan(){
    document.querySelectorAll(SELECTOR).forEach(bind);
  }

  // Initial pass + watch for late-added cards (timeline/vault render async)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }

  // Observe new cards added by app.js / chat.js
  const mo = new MutationObserver(() => {
    // Cheap debounce via rAF
    if (mo.__pending) return;
    mo.__pending = requestAnimationFrame(() => {
      mo.__pending = null;
      scan();
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();
