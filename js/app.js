import {
  db, collection, addDoc, getDocs, getDoc, setDoc,
  doc, updateDoc, deleteDoc, query,
  auth, provider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "./firebase.js";

/* ─── PER-USER THEME STORAGE (uid-scoped) ─── */
window.__lfUid = null;
window.__lfThemeKey = () => window.__lfUid ? `lf_theme_${window.__lfUid}` : null;
window.__lfThemeRead = () => { const k = window.__lfThemeKey(); if(!k) return null; try{ return localStorage.getItem(k); }catch(_){ return null; } };
window.__lfThemeWrite = (v) => { const k = window.__lfThemeKey(); if(!k) return; try{ localStorage.setItem(k, v); }catch(_){} };
window.__lfThemeWipe  = () => { const k = window.__lfThemeKey(); if(!k) return; try{ localStorage.removeItem(k); }catch(_){} };
/* Strip the legacy GLOBAL 'lf_theme' key on every boot so a previous user's theme can never leak to another */
try{ localStorage.removeItem('lf_theme'); }catch(_){}


/* ─────────────────────────────────────────
   EARLY RESILIENT WIRING
   Runs before anything that could throw so the
   Theme button + Example vaults always work,
   even if Firestore/auth init fails later.
───────────────────────────────────────── */
(function lfEarlyWiring(){
  // ---- THEME PICKER (open/close) ----
  function openPanel(){
    const p = document.getElementById('lfThemePanel');
    const b = document.getElementById('lfThemeBackdrop');
    if(p) p.classList.add('open');
    if(b) b.classList.add('open');
  }
  function closePanel(){
    const p = document.getElementById('lfThemePanel');
    const b = document.getElementById('lfThemeBackdrop');
    if(p) p.classList.remove('open');
    if(b) b.classList.remove('open');
  }
  // expose immediately — full lfPremium IIFE will override with richer versions
  if(!window.openThemePicker)  window.openThemePicker  = openPanel;
  if(!window.closeThemePicker) window.closeThemePicker = closePanel;

  // ---- THEME APPLY (always works, even if lfPremium IIFE never runs) ----
  function lfShade(hex, amt){
    try{
      const c = String(hex||'').replace('#','');
      const n = parseInt(c.length===3 ? c.split('').map(x=>x+x).join('') : c, 16);
      const r = Math.min(255, Math.max(0, ((n>>16)&255) + amt));
      const g = Math.min(255, Math.max(0, ((n>>8)&255)  + amt));
      const b = Math.min(255, Math.max(0, (n&255)       + amt));
      return '#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
    }catch(e){ return hex; }
  }
  function lfApplyThemeObj(t){
    t = Object.assign({ couple:'', accent:'#ff003c', bg:'#0a0204', font:"'Playfair Display', serif" }, t||{});
    const r = document.documentElement.style;
    const A=t.accent, AS=lfShade(A,20), BG=t.bg, BG2=lfShade(BG,10), F=t.font;
    r.setProperty('--lf-accent', A);
    r.setProperty('--lf-accent-soft', AS);
    r.setProperty('--lf-bg-1', BG);
    r.setProperty('--lf-bg-2', BG2);
    r.setProperty('--lf-font-display', F);
    r.setProperty('--accent', A);
    let s = document.getElementById('lfThemeOverride');
    if(!s){ s = document.createElement('style'); s.id='lfThemeOverride'; document.head.appendChild(s); }
    s.textContent = `
      body, .home-screen, #homeScreen, #memoryScreen, .auth-screen, #authScreen, .ab, .profile-screen, .netflix-splash { background: ${BG} !important; }
      body { background: linear-gradient(180deg, ${BG}, ${BG2} 60%, #050505) !important; }
      h1, h2, h3, .logo, .splash-logo, .ab-logo, .ab-title, .timeline-content h3, .tgm-box h2, .game-modal-box h2, .love-meter-pct { font-family: ${F} !important; }
      .logo, .splash-logo, .ab-logo, .badge-heart, .timeline-year, .timeline-content h3, .tgm-box h2, .game-modal-box h2, .love-meter-pct, .gallery-card .img-delete-btn, .secret-trigger { color: ${A} !important; }
      .ab-btn, .card-actions button:hover, .close-btn, .gallery-card .img-delete-btn:hover, .love-meter-btn, .tgm-close:hover, .nav-btn:not(.nav-btn-ghost):hover { background: ${A} !important; }
      .ab-btn { background: linear-gradient(135deg, ${A}, ${lfShade(A,-30)}) !important; box-shadow: 0 8px 24px ${A}55 !important; }
      .timeline-line { background: linear-gradient(180deg, ${A}, ${AS}, ${A}) !important; }
      .timeline-dot  { box-shadow: 0 0 10px ${A}, 0 0 25px ${A}aa !important; background: ${A} !important; }
      .tgm-choice:hover, .wyr-opt.chosen, .truth-btn:hover, .gallery-page-btn:hover, .timeline-game-btn:hover, .game-play-btn:hover, .load-more-btn:hover, .match-card.matched, .tgm-choice.chosen { border-color: ${A} !important; background: ${A}26 !important; color: #fff !important; }
      .love-meter-bar-fill, .uq-bar-fill { background: linear-gradient(90deg, ${A}, ${AS}) !important; box-shadow: 0 0 12px ${A}aa !important; }
      .avatar-omen { background: linear-gradient(135deg, ${lfShade(BG,15)}, ${lfShade(BG,40)}) !important; color: ${A} !important; }
      .ab-in:focus { border-color: ${A}80 !important; }
      .ab-sw span  { color: ${AS} !important; }
    `;
    const pill = document.getElementById('couplePill');
    if(pill){
      const label = t.couple || (window.userProfile ? `${(window.userProfile.yourName||'')} & ${(window.userProfile.partnerName||'')}` : '');
      if(label && label.trim() !== '&'){ pill.innerHTML = `<span class="heart">❤</span>${label}`; pill.style.display='inline-flex'; }
      else { pill.style.display='none'; }
    }
    try{ window.__lfThemeWrite(JSON.stringify(t)); }catch(e){}
    if(window.userProfile) window.userProfile.theme = t;
    if(typeof window.saveProfile === 'function'){ try{ window.saveProfile({ theme: t }); }catch(e){} }
  }
  function lfReadThemeFromUI(){
    return {
      couple: '',
      accent: document.getElementById('lfThemeAccent')?.value || '#ff003c',
      bg:     document.getElementById('lfThemeBg')?.value     || '#0a0204',
      font:   document.getElementById('lfThemeFont')?.value   || "'Playfair Display', serif"
    };
  }
  window.lfApplyThemeNow  = function(){ lfApplyThemeObj(lfReadThemeFromUI()); };
  window.lfApplyAndClose  = function(){ lfApplyThemeObj(lfReadThemeFromUI()); closePanel(); };

  // Live-apply as user changes inputs
  const themeInputIds = ['lfThemeAccent','lfThemeBg','lfThemeFont'];
  document.addEventListener('input',  (e) => { if(e.target && themeInputIds.includes(e.target.id)) lfApplyThemeObj(lfReadThemeFromUI()); });
  document.addEventListener('change', (e) => { if(e.target && themeInputIds.includes(e.target.id)) lfApplyThemeObj(lfReadThemeFromUI()); });

  // Hydrate from localStorage on first load (avoid flash)
  try{
    const cached = JSON.parse(window.__lfThemeRead()||'null');
    if(cached){
      if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>lfApplyThemeObj(cached));
      else lfApplyThemeObj(cached);
    }
  }catch(e){}

  // event delegation as a SAFETY NET (works even if inline onclick fails)
  document.addEventListener('click', (e) => {
    const openBtn  = e.target.closest('.lf-theme-btn, [data-open-theme]');
    if(openBtn){ e.preventDefault(); try{ window.openThemePicker(); }catch(_){ openPanel(); } return; }
    const doneBtn = e.target.closest('.lf-theme-save');
    if(doneBtn){ e.preventDefault(); window.lfApplyAndClose(); return; }
    const closeBtn = e.target.closest('.lf-theme-close, .lf-theme-backdrop');
    if(closeBtn){ e.preventDefault(); try{ window.closeThemePicker(); }catch(_){ closePanel(); } return; }
  });

  // ---- EXAMPLE VAULTS (canvas thumbnails + open modal) ----
  const EXAMPLES = [
    { chapter:'Chapter 04 · 2024', title:"That rooftop, golden hour",
      desc:"The sun melted into the skyline and so did we. No words — just the wind, your hand in mine, and a city that finally felt quiet.",
      palette:['#ff6a3d','#ff003c','#d4a24c'] },
    { chapter:'Chapter 07 · 2024', title:"The night we didn't sleep",
      desc:"Fairy lights, half-finished cups of chai, and a playlist on loop. We talked till the sky turned blue and called it falling deeper.",
      palette:['#8a5cf6','#ff5d8f','#220a2e'] },
    { chapter:'Chapter 12 · 2025', title:"Slow dance, no music",
      desc:"The room was dim, the world was loud, and we just swayed. No song needed — your heartbeat was the rhythm.",
      palette:['#e8b4a0','#ff003c','#1a0f0d'] }
  ];

  /* ── Animated vault thumbnails ─────────────────────────
     Root cause of "plain solid" look: getBoundingClientRect()
     returns 0×0 at DOMContentLoaded for position:absolute
     canvases whose parent hasn't painted yet, so the canvas
     was drawn at 1×1 px and CSS-stretched to a solid blob.
     Fix: read parent.clientWidth/Height (layout-based), and
     run a requestAnimationFrame loop for animated hearts.
  ──────────────────────────────────────────────────────── */
  const _vaultAnims = new WeakMap();   // canvas → { raf, stop }

  function _vaultReset(p, w, h){
    p.x     = Math.random();
    p.y     = 1.05 + Math.random() * 0.1;
    p.size  = 0.45 + Math.random() * 1.1;
    p.speed = 0.0004 + Math.random() * 0.0005;
    p.wob   = Math.random() * Math.PI * 2;
    p.wobS  = 0.012 + Math.random() * 0.018;
    p.drift = (Math.random() - 0.5) * 0.0008;
    p.alpha = 0.12 + Math.random() * 0.5;
  }

  function _vaultStartAnim(cv, idx){
    if(_vaultAnims.has(cv)) return;
    const ex = EXAMPLES[idx] || EXAMPLES[0];
    const [c1, c2, c3] = ex.palette;

    // seed 12 heart particles at random starting positions
    const particles = Array.from({length:12}, () => {
      const p = {};
      _vaultReset(p);
      p.y = Math.random();  // scatter initial Y
      return p;
    });

    let rafId = null;
    function frame(){
      // ── size canvas from PARENT (avoids getBoundingClientRect=0 bug) ──
      const parent = cv.parentElement || cv;
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.max(4, parent.clientWidth  || parent.offsetWidth  || 300);
      const ph = Math.max(4, parent.clientHeight || parent.offsetHeight || 375);
      const cw = Math.round(pw * dpr);
      const ch = Math.round(ph * dpr);
      if(cv.width !== cw || cv.height !== ch){ cv.width = cw; cv.height = ch; }

      const ctx = cv.getContext('2d');

      // gradient background
      const g = ctx.createLinearGradient(0, 0, cw, ch);
      g.addColorStop(0,    c1);
      g.addColorStop(0.55, c2);
      g.addColorStop(1,    c3);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);

      // soft radial highlight
      const rg = ctx.createRadialGradient(cw*.68, ch*.32, 5, cw*.68, ch*.32, Math.max(cw,ch)*.72);
      rg.addColorStop(0, 'rgba(255,255,255,0.22)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, cw, ch);

      // floating animated hearts
      const fs = Math.max(10, Math.floor(ch * 0.075));
      ctx.font = `${fs}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      particles.forEach(p => {
        p.y   -= p.speed;
        p.wob += p.wobS;
        p.x   += p.drift;
        if(p.y < -0.12) _vaultReset(p);
        ctx.globalAlpha = p.alpha;
        ctx.save();
        ctx.translate(p.x * cw, p.y * ch);
        ctx.scale(p.size, p.size);
        ctx.fillStyle = '#fff';
        ctx.fillText('❤', Math.sin(p.wob) * 7, 0);
        ctx.restore();
      });
      ctx.globalAlpha = 1;

      // bottom gradient for text legibility
      const bg = ctx.createLinearGradient(0, ch * 0.52, 0, ch);
      bg.addColorStop(0, 'rgba(0,0,0,0)');
      bg.addColorStop(1, 'rgba(0,0,0,0.60)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, ch * 0.52, cw, ch * 0.48);

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    _vaultAnims.set(cv, { stop(){ cancelAnimationFrame(rafId); _vaultAnims.delete(cv); } });
  }

  function _vaultStopAnim(cv){
    const a = _vaultAnims.get(cv); if(a) a.stop();
  }

  // Static draw for the large example-viewer canvas (no animation needed — one-off)
  function drawVaultCanvas(cv, idx){
    if(!cv) return;
    const parent = cv.parentElement || cv;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.max(4, parent.clientWidth  || parent.offsetWidth  || 400);
    const ph = Math.max(4, parent.clientHeight || parent.offsetHeight || 400);
    const cw = Math.round(pw * dpr);
    const ch = Math.round(ph * dpr);
    if(cv.width !== cw || cv.height !== ch){ cv.width = cw; cv.height = ch; }
    const ctx = cv.getContext('2d');
    const ex = EXAMPLES[idx] || EXAMPLES[0];
    const [c1, c2, c3] = ex.palette;
    const g = ctx.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, c1); g.addColorStop(0.55, c2); g.addColorStop(1, c3);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    const rg = ctx.createRadialGradient(cw*.7, ch*.35, 10, cw*.7, ch*.35, Math.max(cw,ch)*.7);
    rg.addColorStop(0, 'rgba(255,255,255,0.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, cw, ch);
    // Static hearts for the viewer modal
    ctx.font = `${Math.floor(ch*0.08)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let s = (idx+1)*9301;
    function rnd(){ s=(s*9301+49297)%233280; return s/233280; }
    for(let i=0;i<18;i++){
      ctx.globalAlpha = 0.15 + rnd() * 0.5;
      ctx.save();
      ctx.translate(rnd()*cw, rnd()*ch);
      ctx.scale(0.5+rnd()*1.4, 0.5+rnd()*1.4);
      ctx.fillStyle = '#fff';
      ctx.fillText('❤', 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const bg = ctx.createLinearGradient(0, ch*0.55, 0, ch);
    bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = bg; ctx.fillRect(0, ch*0.55, cw, ch*0.45);
  }

  function renderAllVaultCanvases(){
    document.querySelectorAll('.lf-mock-thumb canvas[data-vault]').forEach(cv => {
      const idx = parseInt(cv.dataset.vault, 10) || 0;
      _vaultStartAnim(cv, idx);   // kick off animation loop (idempotent)
    });
  }

  window.openExampleVault = function(idx){
    const ex = EXAMPLES[idx]; if(!ex) return;
    const v = document.getElementById('lfExampleViewer'); if(!v) return;
    document.getElementById('lfExampleChapter').textContent = ex.chapter;
    document.getElementById('lfExampleTitle').textContent   = ex.title;
    document.getElementById('lfExampleDesc').textContent    = ex.desc;
    v.classList.add('open');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {    // double-rAF — layout guaranteed settled
        drawVaultCanvas(document.getElementById('lfExampleCanvas'), idx);
      });
    });
  };
  window.closeExampleVault = function(e){
    if(e && e.target && !e.target.classList.contains('lf-example-viewer')) return;
    const v = document.getElementById('lfExampleViewer'); if(!v) return;
    v.classList.remove('open');
    document.body.style.overflow = '';
  };

  // Pause animations when tab is hidden → save CPU
  document.addEventListener('visibilitychange', () => {
    const cvs = document.querySelectorAll('.lf-mock-thumb canvas[data-vault]');
    if(document.hidden){
      cvs.forEach(_vaultStopAnim);
    } else {
      cvs.forEach(cv => { _vaultStartAnim(cv, parseInt(cv.dataset.vault,10)||0); });
    }
  });

  function init(){
    // Wait 2 frames so CSS layout has painted before reading clientWidth
    requestAnimationFrame(() => requestAnimationFrame(renderAllVaultCanvases));

    let rt; window.addEventListener('resize', () => {
      clearTimeout(rt); rt = setTimeout(() => {
        // Stop then restart so canvas size snaps to new layout
        document.querySelectorAll('.lf-mock-thumb canvas[data-vault]').forEach(cv => {
          _vaultStopAnim(cv);
          _vaultStartAnim(cv, parseInt(cv.dataset.vault,10)||0);
        });
      }, 180);
    }, {passive:true});

    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape'){
        const v = document.getElementById('lfExampleViewer');
        if(v && v.classList.contains('open')) window.closeExampleVault();
      }
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();


/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let memories         = [];
let currentMemory    = null;
let currentImages    = [];
let currentIndex     = 0;
let currentMode      = "image";
let recentMemories   = [];
let favoriteMemories = [];
let favoriteVideos   = [];
let currentUser      = null;
let userProfile      = null;

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
const CLOUD         = "demdwlyct";
const PRESET        = "loveflix_uploads";
const CHUNK         = 50 * 1024 * 1024;
const ROWS_PG       = 6;
const GAL_PG        = 60;
const VAULT_NAMES = [];
/* Emails (lowercased) of the original couple — legacy root /memories auto-imports once into their user-scoped collection */
const LEGACY_OWNERS = ["omenagarwal000@gmail.com","sahatitli2006@gmail.com"]; // e.g. ["you@gmail.com","partner@gmail.com"]

/* ─────────────────────────────────────────
   CLOUDINARY URL OPTIMIZER (perf)
   - injects f_auto (best format: avif/webp), q_auto (smart quality),
     w_<width> (responsive size). Cuts payload 5-10×.
───────────────────────────────────────── */
function cldOpt(url, w){
  if(!url || typeof url!=="string") return url;
  if(!/res\.cloudinary\.com\//.test(url)) return url;
  if(/\/upload\/(f_|q_|w_|h_)/.test(url)) return url; // already transformed
  const t = `f_auto,q_auto${w?`,w_${w}`:""}`;
  return url.replace("/upload/", `/upload/${t}/`);
}
function cldPoster(url){
  if(!url || !/res\.cloudinary\.com\//.test(url)) return "";
  return url.replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i,".jpg")
            .replace("/upload/","/upload/f_auto,q_auto,w_500,so_0/");
}


/* ─────────────────────────────────────────
   FIRESTORE PATHS  (user-scoped)
───────────────────────────────────────── */
const memoriesCol  = () => collection(db,"users",currentUser.uid,"memories");
const memDoc       = (id) => doc(db,"users",currentUser.uid,"memories",id);
const profileRef   = ()  => doc(db,"users",currentUser.uid,"profile","data");

/* ─────────────────────────────────────────
   LOCALSTORAGE  (uid-prefixed)
───────────────────────────────────────── */
const lsKey = (k) => `lf_${currentUser?.uid}_${k}`;
const lsGet = (k) => { try{ return JSON.parse(localStorage.getItem(lsKey(k))); }catch(_){ return null; } };
const lsSet = (k,v) => localStorage.setItem(lsKey(k), JSON.stringify(v));

/* ─────────────────────────────────────────
   PROFILE HELPERS
───────────────────────────────────────── */
const yourName    = () => userProfile?.yourName    || "you";
const partnerName = () => userProfile?.partnerName || "them";
const relStart    = () => { const d=new Date(userProfile?.startDate||"2024-10-27"); return isNaN(d)?new Date("2024-10-27"):d; };
const bdayMonth   = () => userProfile?.birthday ? new Date(userProfile.birthday+"T00:00:00").getMonth() : 8;
const bdayDay     = () => userProfile?.birthday ? new Date(userProfile.birthday+"T00:00:00").getDate()  : 23;

/* ─────────────────────────────────────────
   AUTH BOOT  — single entry point
───────────────────────────────────────── */
window.addEventListener("DOMContentLoaded", () => {
  initCursor();
  initNavbarScroll();

  /* Speed up splash */
  const ss = document.createElement("style");
  ss.textContent = `.netflix-splash{animation:splashFadeOut 0.5s ease 1.8s forwards!important;}`;
  document.head.appendChild(ss);

   onAuthStateChanged(auth, async (user) => {
    hideSplash();
    if (user) {
      currentUser = user;
      window.__lfUid = user.uid;
      /* Hide the auth overlay IMMEDIATELY so the UI advances even
         while Firestore is still loading the profile. Prevents the
         "stuck on login, need to refresh" bug. */
      hideAuthScreen();
      try {
        await loadProfile();
        if (!userProfile) { showOnboarding(); return; }
        // Set active profile automatically for current account
window.activeProfile =
    localStorage.getItem("lf_active_profile") ||
    userProfile.yourName;

localStorage.setItem(
    "lf_active_profile",
    window.activeProfile
);
window.activeProfile =
    localStorage.getItem("lf_active_profile") ||
    userProfile.yourName;

localStorage.setItem(
    "lf_active_profile",
    window.activeProfile
);

console.log("ACTIVE PROFILE:", window.activeProfile);
console.log("USER PROFILE:", userProfile);
        await bootApp();
      } catch (e) {
        console.error("boot failed:", e);
        // fall back so the user isn't stuck on a blank screen
        const home = document.getElementById("homeScreen");
        if (home) home.style.display = "block";
        try { updateNavbar(); } catch(_){}
      }
    } else {

      currentUser=null;
      window.__lfUid = null;
      try{
        const r=document.documentElement.style;
        ["--lf-accent","--lf-accent-soft","--lf-bg-1","--lf-bg-2","--lf-font-display","--accent"].forEach(v=>r.removeProperty(v));
        const ov=document.getElementById("lfThemeOverride"); if(ov) ov.textContent="";
      }catch(_){}
      userProfile=null;

      memories=[];

      document
      .getElementById(
      "profileBadge"
      )
      ?.replaceChildren();

      document
      .getElementById(
      "couplePill"
      )
      ?.replaceChildren();

      showAuthScreen(
      "login"
      );
}
  });
});

function hideSplash(){
  const s = document.getElementById("netflixSplash");
  if(s) s.style.display = "none";
}

/* ─────────────────────────────────────────
   PROFILE LOAD / SAVE
───────────────────────────────────────── */
async function loadProfile(){
  try{
    const snap = await getDoc(profileRef());
    userProfile = snap.exists() ? snap.data() : null;

    if(userProfile){
      window.activeProfile =
        localStorage.getItem('lf_active_profile')
        || userProfile.yourName;
    }

  }catch(e){
    console.error("loadProfile:",e);
    userProfile = null;
  }
}
async function saveProfile(data){
  await setDoc(profileRef(), data, {merge:true});
  userProfile = {...(userProfile||{}), ...data};
}

/* ─────────────────────────────────────────
   BOOT APP  (called after auth + profile ready)
───────────────────────────────────────── */
async function bootApp(){
  recentMemories=
lsGet("recent") || [];

favoriteMemories=
lsGet("favs") || [];

favoriteVideos=
lsGet("favvids") || [];

/* force profile-specific theme */

if(
userProfile?.theme
){

applyTheme(
  userProfile.theme
);

}else{

window.__lfThemeWipe();

}

  hideAuthScreen();
  hideOnboarding();
  await refreshApp();

  const home = document.getElementById("homeScreen");
  if(home) home.style.display = "block";

  updateNavbar();
  initParticles();
  initScrollReveal();
  setTimeout(() => { renderTimeline(); initCord(); }, 100);
  setTimeout(initSlideshow, 500);

  // Notify lfPremium that the profile is ready — replaces the 800ms polling setInterval
  window.dispatchEvent(new CustomEvent('lf:profileLoaded'));
}

/* ─────────────────────────────────────────
   AUTH SCREEN
───────────────────────────────────────── */
window.showAuthScreen=function(mode){
  let el = document.getElementById("authScreen");
  if(!el){ el=document.createElement("div"); el.id="authScreen"; document.body.appendChild(el); }
  el.style.cssText = "position:fixed;inset:0;background:#050505;display:flex;justify-content:center;align-items:center;z-index:999997;";
  injectAuthStyles();

  const isLogin = mode==="login";
  el.innerHTML = `
  <div class="ab">
    <div class="ab-logo">LOVEFLIX</div>
    <h2 class="ab-title">${isLogin?"Welcome back ❤️":"Start your story ❤️"}</h2>
    <p class="ab-sub">${isLogin?"Sign in to your universe":"Create your account"}</p>
    ${!isLogin?`<input class="ab-in" id="aName" type="text" placeholder="Your name">`:""}
    <input class="ab-in" id="aEmail" type="email" placeholder="Email" autocomplete="email">
    <input class="ab-in" id="aPass"  type="password" placeholder="Password" autocomplete="${isLogin?"current-password":"new-password"}">
    ${!isLogin?`<input class="ab-in" id="aPass2" type="password" placeholder="Confirm password">`:""}
    <div id="aErr" class="ab-err"></div>
    <button class="ab-btn" onclick="doEmailAuth('${mode}')">
      ${isLogin?"Sign In →":"Create Account →"}
    </button>
    <div class="ab-div"><span>or</span></div>
    <button class="ab-g" onclick="doGoogle()">
      <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.251 17.64 11.943 17.64 9.2z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
      Continue with Google
    </button>
    <p class="ab-sw">${isLogin
      ?`No account? <span onclick="showAuthScreen('signup')">Sign up</span>`
      :`Have an account? <span onclick="showAuthScreen('login')">Sign in</span>`
    }</p>
  </div>`;
}

window.hideAuthScreen=function(){
  const el=document.getElementById("authScreen");
  if(el) el.style.display="none";
}

function injectAuthStyles(){
  if(document.getElementById("authSt")) return;
  const s=document.createElement("style"); s.id="authSt";
  s.textContent=`
    .ab{width:min(420px,96vw);background:linear-gradient(135deg,rgba(18,0,7,.98),rgba(5,0,18,.98));border:1px solid rgba(255,0,60,.22);border-radius:28px;padding:44px 38px;display:flex;flex-direction:column;gap:13px;box-shadow:0 40px 100px rgba(255,0,60,.15);}
    .ab-logo{font-family:'Playfair Display',serif;font-style:italic;font-size:2.2rem;font-weight:700;color:#e50914;letter-spacing:4px;text-align:center;text-shadow:0 0 30px rgba(229,9,20,.4);}
    .ab-title{font-family:'Playfair Display',serif;font-style:italic;font-size:1.45rem;color:#fff;text-align:center;}
    .ab-sub{font-size:.83rem;color:rgba(255,255,255,.35);text-align:center;letter-spacing:.5px;margin-bottom:4px;}
    .ab-in{padding:13px 15px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(255,255,255,.04);color:#fff;font-size:.93rem;outline:none;transition:border-color .2s,background .2s;}
    .ab-in:focus{border-color:rgba(255,0,60,.5);background:rgba(255,255,255,.07);}
    .ab-in::placeholder{color:rgba(255,255,255,.28);}
    .ab-err{font-size:.8rem;color:#ff6b9d;min-height:16px;font-style:italic;text-align:center;}
    .ab-btn{padding:14px;border:none;border-radius:13px;background:linear-gradient(135deg,#e8003a,#b5002a);color:#fff;font-size:.97rem;font-weight:500;cursor:pointer;transition:transform .25s,box-shadow .25s;box-shadow:0 8px 24px rgba(229,0,58,.4);}
    .ab-btn:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(229,0,58,.5);}
    .ab-div{display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.18);font-size:.78rem;}
    .ab-div::before,.ab-div::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.08);}
    .ab-g{padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(255,255,255,.04);color:rgba(255,255,255,.8);font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;transition:background .2s;}
    .ab-g:hover{background:rgba(255,255,255,.09);}
    .ab-sw{font-size:.8rem;color:rgba(255,255,255,.3);text-align:center;}
    .ab-sw span{color:#ff6b9d;cursor:pointer;text-decoration:underline;}
    @media(max-width:480px){.ab{padding:30px 20px;}}
  `;
  document.head.appendChild(s);
}

/* ─────────────────────────────────────────
   AUTH HANDLERS
───────────────────────────────────────── */
window.doEmailAuth = async function(mode){
  const err  = document.getElementById("aErr");
  const email= document.getElementById("aEmail")?.value.trim();
  const pass = document.getElementById("aPass")?.value;
  if(!email||!pass){ err.textContent="Please fill all fields ❤️"; return; }

  const MSGS = {
    "auth/email-already-in-use":  "That email is already registered ❤️",
    "auth/invalid-email":          "Invalid email address ❤️",
    "auth/wrong-password":         "Wrong password ❤️",
    "auth/invalid-credential":     "Wrong email or password ❤️",
    "auth/user-not-found":         "No account with that email ❤️",
    "auth/too-many-requests":      "Too many attempts — try later ❤️",
    "auth/weak-password":          "Password needs at least 6 characters ❤️",
  };

  try {
    err.textContent = "";
    if(mode==="signup"){
      const name  = document.getElementById("aName")?.value.trim();
      const pass2 = document.getElementById("aPass2")?.value;
      if(!name){ err.textContent="What's your name? ❤️"; return; }
      if(pass!==pass2){ err.textContent="Passwords don't match ❤️"; return; }
      if(pass.length<6){ err.textContent="Password needs at least 6 characters ❤️"; return; }
      await createUserWithEmailAndPassword(auth, email, pass);
      /* onAuthStateChanged fires → loadProfile → null → showOnboarding */
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      /* onAuthStateChanged fires → loadProfile → bootApp */
    }
  } catch(e){
    err.textContent = MSGS[e.code] || "Something went wrong ❤️";
  }
};

window.doGoogle = async function(){
  const err = document.getElementById("aErr");
  try {
    await signInWithPopup(auth, provider);
  } catch(e){
    if(err) err.textContent = "Google sign-in failed ❤️";
    else console.error(e);
  }
};

window.handleLogout = async function(){

  if(!confirm(
    "Sign out of LOVEFLIX? ❤️"
  )) return;

  try{

    /* stop timers */
    if(
      typeof _ssTimer!=="undefined"
      && _ssTimer
    ){
      clearInterval(_ssTimer);
    }

    /* clear runtime state */

    memories=[];
    currentMemory=null;
    currentImages=[];
    currentIndex=0;
    currentMode="image";

    recentMemories=[];
    favoriteMemories=[];
    favoriteVideos=[];

    userProfile=null;
    currentUser=null;
    localStorage.removeItem("lf_active_profile");
    window.activeProfile = null;

    /* clear UI */

    const badge=
    document.getElementById(
      "profileBadge"
    );

    if(badge)
    badge.textContent="";

    const pill=
    document.getElementById(
      "couplePill"
    );

    if(pill){
      pill.innerHTML="";
      pill.style.display="none";
    }

    const rows=
    document.getElementById(
      "rows"
    );

    if(rows)
    rows.innerHTML="";

    const fav=
    document.getElementById(
      "favoriteRows"
    );

    if(fav)
    fav.innerHTML="";

    const cont=
    document.getElementById(
      "continueWatching"
    );

    if(cont)
    cont.innerHTML="";

    const top=
    document.getElementById(
      "topMemories"
    );

    if(top)
    top.innerHTML="";

    document
    .getElementById(
      "homeScreen"
    )
    .style.display="none";

    document
    .getElementById(
      "memoryScreen"
    )
    .style.display="none";

    /* remove previous theme */

    document
    .documentElement
    .removeAttribute(
      "style"
    );

    window.__lfThemeWipe();

    await signOut(auth);

  }catch(e){

    console.log(e);

  }

}
/* Back-compat shims for any leftover HTML using old names */
window.switchProfile = window.handleLogout;
window.selectProfile = function(){ /* legacy no-op — auth-aware system handles this */ };
/* openVault is used in some HTML variants — alias to showPrivate */
window.openVault = function(){ window.showPrivate && window.showPrivate(); };

/* ─────────────────────────────────────────
   ONBOARDING
───────────────────────────────────────── */
function showOnboarding(){
  let el=document.getElementById("obScreen");
  if(!el){el=document.createElement("div");el.id="obScreen";document.body.appendChild(el);}
  el.style.cssText="position:fixed;inset:0;background:#050505;display:flex;justify-content:center;align-items:center;z-index:999996;";
  injectAuthStyles();

  const s=document.createElement("style");
  s.textContent=`.ob-lbl{font-size:.75rem;color:rgba(255,255,255,.35);letter-spacing:1px;text-transform:uppercase;margin-bottom:-5px;}`;
  document.head.appendChild(s);

  el.innerHTML=`
  <div class="ab" style="max-width:460px;">
    <div class="ab-logo">LOVEFLIX</div>
    <h2 class="ab-title" style="font-size:1.2rem;">Set up your universe ❤️</h2>
    <p class="ab-sub">Personalise your story — takes 30 seconds</p>
    <label class="ob-lbl">Your name</label>
    <input class="ab-in" id="obYN" type="text" placeholder="e.g. Omen">
    <label class="ob-lbl">Your partner's name</label>
    <input class="ab-in" id="obPN" type="text" placeholder="e.g. Budhdhu">
    <label class="ob-lbl">Relationship start date</label>
    <input class="ab-in" id="obSD" type="date" style="color-scheme:dark;">
    <label class="ob-lbl">Partner's birthday</label>
    <input class="ab-in" id="obBD" type="date" style="color-scheme:dark;">
    <div id="obErr" class="ab-err"></div>
    <button class="ab-btn" onclick="submitOnboarding()">Start Our Story ❤️</button>
  </div>`;
}

function hideOnboarding(){
  const el=document.getElementById("obScreen");
  if(el) el.style.display="none";
}

window.submitOnboarding = async function(){
  const yn  = document.getElementById("obYN")?.value.trim();
  const pn  = document.getElementById("obPN")?.value.trim();
  const sd  = document.getElementById("obSD")?.value;
  const bd  = document.getElementById("obBD")?.value;
  const err = document.getElementById("obErr");
  if(!yn||!pn){ err.textContent="Please enter both names ❤️"; return; }
  if(!sd)     { err.textContent="When did your story start? ❤️"; return; }
  if(!bd)     { err.textContent="Partner's birthday? ❤️"; return; }
  try {
    await saveProfile({yourName:yn, partnerName:pn, startDate:sd, birthday:bd, createdAt:Date.now()});
    window.activeProfile = yn; localStorage.setItem('lf_active_profile', yn);
    await bootApp();
  } catch(e){ err.textContent="Save failed — check connection ❤️"; console.error(e); }
};

/* ─────────────────────────────────────────
   NAVBAR
───────────────────────────────────────── */
function updateNavbar(){
  const nav=document.getElementById("navbar");
  if(nav){nav.style.opacity="1";nav.style.pointerEvents="all";}
  const badge=document.getElementById("profileBadge");
 if(badge){badge.textContent = `${yourName()} ❤️ ${partnerName()}`;}
  const vb=document.getElementById("privateVaultBtn");
  if(vb)vb.style.display =
    userProfile?.yourName
        ? "inline-block"
        : "none";
}

window.showHome=function(){
  document.getElementById("homeScreen").style.display="block";
  document.getElementById("memoryScreen").style.display="none";
};
window.scrollToRows=function(){
  const r=document.getElementById("rows"); if(r) r.scrollIntoView({behavior:"smooth"});
};
window.addHeroRipple=function(e){
  const btn=e.currentTarget, ripple=document.createElement("span");
  ripple.className="btn-ripple";
  const sz=Math.max(btn.offsetWidth,btn.offsetHeight)*2, rect=btn.getBoundingClientRect();
  ripple.style.cssText=`width:${sz}px;height:${sz}px;left:${e.clientX-rect.left-sz/2}px;top:${e.clientY-rect.top-sz/2}px;`;
  btn.appendChild(ripple); setTimeout(()=>ripple.remove(),700);
};

/* ─────────────────────────────────────────
   FIRESTORE — load & refresh
───────────────────────────────────────── */
async function loadMemories(){
  if(!currentUser) return;
  try {
    memories=[];
    const snap=await getDocs(query(memoriesCol()));
    snap.forEach(ds=>{
      const d=ds.data(); d.docId=ds.id;
      if(!d.images)        d.images=[];
      if(!d.videos)        d.videos=[];
      if(!d.opens)         d.opens=0;
      if(!d.favoriteCount) d.favoriteCount=0;
      memories.push(d);
    });
    /* ── LEGACY FALLBACK: one-time migrate root /memories → users/{uid}/memories
       Runs only when:
         (a) user-scoped collection is empty, AND
         (b) caller's email is in LEGACY_OWNERS, AND
         (c) profile is not already flagged migrated.
       Original /memories docs are NEVER deleted. */
    const email = (currentUser.email||"").toLowerCase();
    if(memories.length===0
        && LEGACY_OWNERS.includes(email)
        && !userProfile?.legacyImported){
      try {
        const legacy = await getDocs(query(collection(db,"memories")));
        const copies = [];
        legacy.forEach(ds=>{
          const d=ds.data();
          if(!d.images)        d.images=[];
          if(!d.videos)        d.videos=[];
          if(!d.opens)         d.opens=0;
          if(!d.favoriteCount) d.favoriteCount=0;
          copies.push({...d, _legacyId: ds.id});
        });
        for(const c of copies){
          const {_legacyId, ...rest} = c;
          await setDoc(doc(db,"users",currentUser.uid,"memories",_legacyId), rest, {merge:true});
          rest.docId=_legacyId; memories.push(rest);
        }
        await saveProfile({legacyImported:true, legacyImportedAt:Date.now()});
        console.log(`[LOVEFLIX] Legacy import: ${copies.length} memories copied for ${email}`);
      } catch(e){ console.warn("Legacy import skipped:", e?.message||e); }
    }
  } catch(e){ console.error("loadMemories:",e); }
}

async function refreshApp(){
  if(!currentUser) return;
  await loadMemories();
  generateRows();
  genContinueWatching();
  genFavorites();
  genTopMemories();
  if(window._slideshowLayerA) refreshSlideshow();
  setTimeout(()=>{
    const el=document.getElementById("heroStatMemories");
    if(el) animCounter(el,memories.length,700);
    const sinceEl=document.querySelector("[data-since]");
    if(sinceEl) sinceEl.textContent=relStart().getFullYear();
  },200);
}

/* ─────────────────────────────────────────
   CURSOR
───────────────────────────────────────── */
function initCursor(){
  const cur=document.getElementById("customCursor");
  const ring=document.getElementById("customCursorRing");
  if(!cur||!ring||window.matchMedia("(hover:none)").matches) return;
  /* Force cursor above every overlay (upload, auth, onboarding, viewer) */
  cur.style.zIndex  = "2147483647";
  ring.style.zIndex = "2147483646";
  let mx=0,my=0,rx=0,ry=0;
  document.addEventListener("mousemove",e=>{
    mx=e.clientX;my=e.clientY;
    cur.style.left=mx+"px";cur.style.top=my+"px";
  },{passive:true});
  const loop=()=>{rx+=(mx-rx)*.12;ry+=(my-ry)*.12;ring.style.left=rx+"px";ring.style.top=ry+"px";requestAnimationFrame(loop);};
  loop();
  document.addEventListener("mouseover",e=>{
    const h=e.target.closest("button,a,.card,.game-card,.timeline-item");
    ring.style.width=h?"52px":"36px"; ring.style.height=h?"52px":"36px";
    ring.style.borderColor=h?"rgba(255,0,60,.8)":"rgba(255,0,60,.5)";
  },{passive:true});
  document.addEventListener("mousedown",()=>{cur.style.transform="translate(-50%,-50%) scale(.6)";});
  document.addEventListener("mouseup",  ()=>{cur.style.transform="translate(-50%,-50%) scale(1)";});
}

/* ─────────────────────────────────────────
   PARTICLES
───────────────────────────────────────── */
function initParticles(){
  const c=document.getElementById("heroParticles"); if(!c) return;
  const spawn=()=>{
    const MAX_P = window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : window.innerWidth<768 ? 3 : 8; if(MAX_P===0){c.innerHTML='';return;} if(c.children.length>=MAX_P) return;
    const p=document.createElement("div"); p.className="hero-particle";
    const sz=2+Math.random()*3, dur=10+Math.random()*8;
    p.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*100}%;animation-duration:${dur}s;opacity:${.2+Math.random()*.35};`;
    c.appendChild(p); setTimeout(()=>p.remove(),dur*1000);
  };
  const MAX0 = (window.innerWidth<768||matchMedia("(prefers-reduced-motion:reduce)").matches)?3:8;
  for(let i=0;i<MAX0;i++) spawn();
  setInterval(spawn, window.innerWidth<768?3500:2000);
}

/* ─────────────────────────────────────────
   NAVBAR SCROLL
───────────────────────────────────────── */
function initNavbarScroll(){
  const nav=document.getElementById("navbar"); if(!nav) return;
  window.addEventListener("scroll",()=>nav.classList.toggle("scrolled",scrollY>55),{passive:true});
}

/* ─────────────────────────────────────────
   SCROLL REVEAL
───────────────────────────────────────── */
function initScrollReveal(){
  const observe=()=>{
    const io=new IntersectionObserver((ents)=>{
      ents.forEach((e,i)=>{if(e.isIntersecting){setTimeout(()=>e.target.classList.add("revealed"),i*70);io.unobserve(e.target);}});
    },{threshold:0.05,rootMargin:'0px 0px -5% 0px'});
    document.querySelectorAll(".reveal-on-scroll:not(.revealed)").forEach(el=>io.observe(el));
  };
  observe(); setTimeout(observe,3500);
}
function revealNew(parent){
  const io=new IntersectionObserver((ents)=>{
    ents.forEach((e,i)=>{if(e.isIntersecting){setTimeout(()=>e.target.classList.add("revealed"),i*55);io.unobserve(e.target);}});
  },{threshold:.08});
  (parent||document).querySelectorAll(".reveal-on-scroll:not(.revealed)").forEach(el=>io.observe(el));
}

/* ─────────────────────────────────────────
   COUNTER
───────────────────────────────────────── */
function animCounter(el,target,dur){
  let n=0; const step=target/(dur/16);
  const tick=()=>{n+=step;if(n>=target){el.textContent=target;return;}el.textContent=Math.floor(n);requestAnimationFrame(tick);};
  tick();
}

/* ─────────────────────────────────────────
   TIMELINE — personalised
───────────────────────────────────────── */
function getRelDuration(){
  const ms=Date.now()-relStart();
  const days=Math.floor(ms/864e5), yrs=Math.floor(days/365), mos=Math.floor((days%365)/30), rem=days%30;
  const p=[];
  if(yrs) p.push(`${yrs} year${yrs>1?"s":""}`);
  if(mos) p.push(`${mos} month${mos>1?"s":""}`);
  if(rem||!p.length) p.push(`${rem} day${rem!==1?"s":""}`);
  return p.join(", ");
}

function buildMilestones(){
  const RS=relStart(), P=partnerName(), Y=yourName();
  const addM=(d,m)=>{const r=new Date(d);r.setMonth(r.getMonth()+m);return r;};
  const addY=(d,y)=>{const r=new Date(d);r.setFullYear(r.getFullYear()+y);return r;};
  const yr=(d)=>d.getFullYear().toString();

  const items=[
    {u:RS,            y:yr(RS),            t:"We Found Trouble ❤️",              d:"Two strangers becoming dangerously attached. The beginning of an addiction neither of us wanted to escape.",    s:`${Y} walked in and ruined every standard ${P} ever had. Completely. Irreversibly.`, g:0},
    {u:addM(RS,1),    y:yr(addM(RS,1)),    t:"The First Time We Met 🌙",          d:"The nervous tension. The first touch. The first time wanting someone that intensely.",                         s:`I remember thinking — this is going to be dangerous. And then choosing ${P} anyway. Every single time.`, g:1},
    {u:addM(RS,6),    y:yr(addM(RS,6)),    t:"Six Months Deep 🔥",               d:"Half a year in. Still completely consumed. Late nights, rough love, soft moments after.",                     s:`Late nights where ${Y} forgot where they ended and ${P} began. The best kind of lost.`, g:2},
  ];

  [
    {t:"One Year ❤️",                     d:"A whole year of choosing each other.",                         s:`One year and ${Y} still reaches for ${P} first. In every quiet moment that belongs only to you.`,g:3},
    {t:"Two Years — Still Starving ❤️",   d:"Still obsessed. Still attached. Still wanting everything.",    s:`Two years and the craving only got worse. That's not a problem. That's just what we are.`,g:4},
    {t:"Three Years of Beautiful Chaos 🌹",d:"Three years of dangerously loving each other.",               s:`Three years down and the words still aren't big enough. We just know we're not done.`,g:0},
    {t:"Four Years — Irreversibly Yours ❤️",d:"Four years. Four versions of us. Every one worth it.",       s:`Four years and every argument, every soft night made it more certain. It's ${P}.`,g:1},
    {t:"Five Years — Half a Decade 🔥",   d:"Half a decade of choosing the same person.",                  s:`Five years. Every single day again. Even the hard ones. Especially those.`,g:2},
    {t:"Six Years Deep 💌",               d:"Six years of secrets, inside jokes, and love getting better.", s:`Six years and ${P} still surprises ${Y}. That's rare.`,g:3},
    {t:"Seven Years — Still Addicted 🌙", d:"Seven years of being each other's most dangerous comfort.",   s:`Seven years and this addiction shows no signs of fading. We've stopped wanting it to.`,g:4},
    {t:"Eight Years 🔥",                  d:"Eight years woven into each other so deeply.",                 s:`Eight years and still can't explain this to anyone. Some things aren't meant to be.`,g:0},
    {t:"Nine Years ❤️",                   d:"Almost ten years of this. Of us.",                             s:`Nine years in and the love hits the same. More, actually.`,g:1},
    {t:"Ten Years ❤️‍🔥",                  d:"Ten years. A full decade of choosing each other.",             s:`Ten years and it still doesn't feel like enough. That's the most romantic thing ever admitted.`,g:2},
  ].forEach((x,i)=>{
    const d=addY(RS,i+1);
    items.push({u:d, y:yr(d), t:x.t, d:x.d, s:x.s, g:x.g});
  });

  /* Birthday milestones */
  const now=new Date(); let by=now.getFullYear();
  if(new Date(by,bdayMonth(),bdayDay())<RS) by++;
  for(let i=0;i<8;i++){
    const bd=new Date(by+i,bdayMonth(),bdayDay());
    if(bd>=RS) items.push({u:bd,y:(by+i).toString(),t:`Happy Birthday, ${P} 🎂`,d:`Another year of ${P}. Another year of us getting more impossible to explain.`,s:`Happy birthday to the person who made forever make sense. This chaos — every time.`,g:4});
  }

  return items.sort((a,b)=>a.u-b.u);
}

function renderTimeline(){
  const container=document.getElementById("dynamicTimeline"); if(!container) return;
  const cord=container.querySelector(".timeline-cord");
  container.innerHTML=""; if(cord) container.appendChild(cord);

  const now=new Date(), SOON=60*864e5, WEEK=7*864e5;
  const all=buildMilestones();
  const unlocked=all.filter(m=>m.u<=now);
  const future  =all.filter(m=>m.u>now);

  unlocked.forEach(m=>container.appendChild(buildItem(m,"unlocked",(now-m.u)<=WEEK)));
  if(future.length) container.appendChild(buildItem(future[0],(future[0].u-now)<=SOON?"soon":"locked",false));

  const badge=document.getElementById("relDurationText");
  if(badge) badge.textContent=getRelDuration();
  setTimeout(injectWaveCord,100);
}

function buildItem(m,state,isNew){
  const el=document.createElement("div");
  const cls=["timeline-item"];
  if(state==="locked")    cls.push("locked");
  if(state==="soon")      cls.push("unlocking-soon");
  if(isNew)               cls.push("newly-unlocked");
  el.className=cls.join(" ");
  if(state==="unlocked") el.onclick=function(){expandTimeline(this);};

  const uls=m.u.toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"});
  let h=`<div class="timeline-dot"></div><div class="timeline-content"><div class="timeline-year">${m.y}</div>`;
  if(state==="locked"){
    h+=`<h3>🔒 Coming Soon</h3><p>This chapter hasn't been written yet. But it's already yours.</p><span class="locked-hint">unlocks ${uls}</span>`;
  } else if(state==="soon"){
    h+=`<h3>${m.t}</h3><p>${m.d}</p><span class="unlocking-hint">✦ unlocking ${uls}</span>`;
  } else {
    h+=`<h3>${m.t}</h3><p>${m.d}</p>`;
    if(m.s) h+=`<div class="timeline-expand-card"><p class="timeline-secret">${m.s}</p><div class="timeline-game-btn" onclick="event.stopPropagation();startTLGame(${m.g})">💌 Unlock the secret</div></div>`;
  }
  h+=`</div>`; el.innerHTML=h; return el;
}

window.expandTimeline=function(item){
  const was=item.classList.contains("expanded");
  document.querySelectorAll(".timeline-item.expanded").forEach(e=>{if(e!==item)e.classList.remove("expanded");});
  item.classList.toggle("expanded",!was);
  if(!was) setTimeout(()=>item.scrollIntoView({behavior:"smooth",block:"nearest"}),100);
};

/* ─────────────────────────────────────────
   TIMELINE CORD + WAVE
───────────────────────────────────────── */
function initCord(){
  const fill=document.getElementById("timelineCordFill");
  const bead=document.getElementById("timelineCordBead");
  const tl  =document.getElementById("dynamicTimeline");
  if(!fill||!bead||!tl) return;
  const upd=()=>{
    const rect=tl.getBoundingClientRect();
    let pct=((innerHeight-rect.top)/tl.offsetHeight)*100;
    pct=Math.max(0,Math.min(100,pct));
    fill.style.height=pct+"%"; bead.style.top=pct+"%";
  };
  window.addEventListener("scroll",upd,{passive:true}); upd();
}

function injectWaveCord(){
  const tl=document.getElementById("dynamicTimeline"); if(!tl) return;
  const old=document.getElementById("tlWave"); if(old) old.remove();
  if(innerWidth<=860) return;
  const h=tl.scrollHeight||800;
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.id="tlWave"; svg.setAttribute("width","100%"); svg.setAttribute("height",h);
  svg.style.cssText=`position:absolute;top:0;left:0;width:100%;height:${h}px;pointer-events:none;z-index:0;overflow:visible;`;
  const cx=50,amp=18,segs=24,sh=h/segs;
  let d=`M ${cx} 0 `;
  for(let i=1;i<=segs;i++){
    const y=i*sh,x=cx+(i%2===0?amp:-amp),cpx=i%2===0?cx-amp*.8:cx+amp*.8,cpy=(i-.5)*sh;
    d+=`C ${cpx} ${cpy} ${x} ${cpy} ${x} ${y} `;
  }
  const wave=document.createElementNS("http://www.w3.org/2000/svg","path");
  wave.setAttribute("d",d);wave.setAttribute("fill","none");wave.setAttribute("stroke","rgba(255,0,60,.07)");wave.setAttribute("stroke-width","28");wave.setAttribute("stroke-linecap","round");
  const line=document.createElementNS("http://www.w3.org/2000/svg","line");
  line.setAttribute("x1","50%");line.setAttribute("y1","0");line.setAttribute("x2","50%");line.setAttribute("y2",h);line.setAttribute("stroke","rgba(255,0,60,.08)");line.setAttribute("stroke-width","3");line.setAttribute("stroke-dasharray","6 8");
  svg.appendChild(wave);svg.appendChild(line);
  tl.insertBefore(svg,tl.firstChild);
}
window.addEventListener("resize",()=>{const s=document.getElementById("tlWave");if(s)s.style.display=innerWidth<=860?"none":"block";},{passive:true});

/* ─────────────────────────────────────────
   TIMELINE GAMES
───────────────────────────────────────── */
function tlGames(){
  const P=partnerName(),Y=yourName();
  return [
    {q:`When you two first talked — what did ${Y} actually feel?`,
     c:["A little scared","Something unnameable","Like they already knew each other","That danger was coming"],
     r:[{t:`Good. Fear means ${P} was already under ${Y}'s skin. ❤️`,a:"sparks"},{t:`No name for it — just recognition before the brain caught up. 🌙`,a:"typewriter"},{t:`Already written, long before it started. ❤️`,a:"glow"},{t:`${P} did ruin ${Y}. And ${Y} is still right here. 🔥`,a:"hearts"}]},
    {q:`What do you think ${P} noticed first about ${Y}?`,
     c:["Hiding feelings badly","That quiet intensity","That trouble started immediately","Everything, all at once"],
     r:[{t:`${Y} was terrible at hiding it. Those eyes said everything. ❤️`,a:"pulse"},{t:`That quiet intensity — it got ${P}. It still does. 🌙`,a:"typewriter"},{t:`${Y} walked in already looking like ${P}'s. 🔥`,a:"sparks"},{t:`Everything at once. And every bit made ${P} want to get closer. ❤️`,a:"hearts"}]},
    {q:`Those late nights together — what did they feel like?`,
     c:["Like time stopped","Like losing yourself in them","Like the safest place","Like an addiction"],
     r:[{t:`Time stopped because nothing more important was happening anywhere. ❤️`,a:"glow"},{t:`Good. There was never a plan to give ${Y} back to themselves. 🔥`,a:"sparks"},{t:`Still the safest place. Always. ❤️`,a:"hearts"},{t:`Then we match. Letting go was never a thought either could finish. 🌙`,a:"typewriter"}]},
    {q:`Right now — thinking about ${P} feels like...`,
     c:["Deep quiet warmth","Missing someone who's right here","Can't breathe normally","Coming home"],
     r:[{t:`That warmth is ${P}. It lives there now. ❤️`,a:"glow"},{t:`That ache even when they're close — love making distance impossible. 🌙`,a:"typewriter"},{t:`Breathe. ${P} is right here. Not going anywhere. ❤️`,a:"hearts"},{t:`Home. That's everything ${P} ever wanted ${Y} to feel. 🔥`,a:"pulse"}]},
    {q:`What do ${Y} and ${P} actually have?`,
     c:["Still impossible to put into words","The most real thing ever known","Beautiful chaos that feels like peace","Mine. Completely mine."],
     r:[{t:`Words were never going to be big enough anyway. ❤️`,a:"typewriter"},{t:`The most real thing. And never once wanted an escape. 🔥`,a:"sparks"},{t:`Our chaos. Only makes sense to us. Exactly how it stays. 🌙`,a:"hearts"},{t:`Mine. And this is still just the beginning. ❤️`,a:"pulse"}]},
  ];
}

let _tlGames=null;
window.startTLGame=function(idx){
  _tlGames=tlGames();
  const game=_tlGames[idx]; if(!game) return;
  const modal=document.getElementById("timelineGameModal");
  const content=document.getElementById("tgmContent");
  content.innerHTML=`<h2>❤️ A question...</h2><p>${game.q}</p>
    <div class="tgm-choice-grid">${game.c.map((c,i)=>`<div class="tgm-choice" onclick="answerTLGame(${idx},${i},this)">${c}</div>`).join("")}</div>
    <div class="tgm-result" id="tgmResult"></div>
    <div id="tgmCanvas" style="position:relative;min-height:10px;overflow:hidden;border-radius:16px;"></div>
    <button class="tgm-close" id="tgmClose" style="display:none;margin-top:10px;" onclick="closeTLGame()">Close ×</button>`;
  modal.classList.add("active");
};

window.answerTLGame=function(gi,ci){
  const reaction=(_tlGames||tlGames())[gi].r[ci];
  document.querySelectorAll(".tgm-choice").forEach((c,i)=>{
    c.style.pointerEvents="none";c.style.transition="opacity .4s,transform .4s";
    if(i===ci) c.classList.add("chosen"); else{c.style.opacity=".22";c.style.transform="scale(.94)";}
  });
  const res=document.getElementById("tgmResult");
  res.style.opacity="0";
  setTimeout(()=>{res.style.transition="opacity .5s";res.style.opacity="1";typewrite(res,reaction.t,26);},450);
  setTimeout(()=>tgmAnim(reaction.a),300);
  setTimeout(()=>{const b=document.getElementById("tgmClose");if(b)b.style.display="inline-block";},2000);
};
window.closeTLGame=function(){document.getElementById("timelineGameModal").classList.remove("active");};

function typewrite(el,text,speed){
  el.textContent="";
  if(!text) return;
  let i=0;
  const iv=setInterval(()=>{ if(i>=text.length){clearInterval(iv);return;} el.textContent+=text[i++]; },speed);
}

function tgmAnim(type){
  const c=document.getElementById("tgmCanvas"); if(!c) return;
  c.innerHTML=""; c.style.cssText="position:relative;min-height:10px;overflow:hidden;border-radius:16px;";
  if(!document.getElementById("tgmSt")){
    const s=document.createElement("style");s.id="tgmSt";
    s.textContent=`@keyframes tgmF{0%{opacity:0;transform:translateY(0) scale(.5);}20%{opacity:1;}100%{opacity:0;transform:translateY(-80px) scale(.8);}}@keyframes tgmS{0%{opacity:1;transform:translate(0,0) scale(1);}100%{opacity:0;transform:translate(var(--tx,20px),var(--ty,-50px)) scale(0);}}@keyframes tgmG{0%,100%{opacity:0;}50%{opacity:1;}}@keyframes tgmP{0%,100%{transform:scale(1);}50%{transform:scale(1.03);box-shadow:0 0 50px rgba(255,0,60,.45);}}@keyframes tgmL{0%{opacity:0;transform:translateY(-14px) rotate(-6deg);}60%{opacity:1;transform:translateY(3px) rotate(1deg);}100%{opacity:1;transform:translateY(0) rotate(0);}}`;
    document.head.appendChild(s);
  }
  if(type==="hearts"){
    c.style.minHeight="64px";
    const em=["❤️","🩷","💕","💗","💖"];
    for(let i=0;i<16;i++){const h=document.createElement("span");h.textContent=em[i%5];h.style.cssText=`position:absolute;font-size:${11+Math.random()*16}px;left:${4+Math.random()*92}%;bottom:0;animation:tgmF ${1.5+Math.random()*1.8}s ease-out forwards;animation-delay:${Math.random()*.8}s;pointer-events:none;`;c.appendChild(h);}
  } else if(type==="sparks"){
    c.style.minHeight="55px";
    for(let i=0;i<20;i++){const s=document.createElement("div");const tx=(Math.random()-.5)*110,ty=-(30+Math.random()*55);s.style.cssText=`position:absolute;width:${3+Math.random()*5}px;height:${3+Math.random()*5}px;border-radius:50%;background:hsl(${335+Math.random()*35},100%,${55+Math.random()*20}%);left:${10+Math.random()*80}%;bottom:${Math.random()*25}%;--tx:${tx}px;--ty:${ty}px;animation:tgmS ${.6+Math.random()}s ease-out forwards;animation-delay:${Math.random()*.45}s;pointer-events:none;`;c.appendChild(s);}
  } else if(type==="glow"){
    c.style.cssText="position:relative;min-height:36px;border-radius:16px;background:radial-gradient(ellipse at center,rgba(255,0,60,.18),transparent 70%);animation:tgmG 1.5s ease-in-out 2;";
  } else if(type==="pulse"){
    const box=c.closest(".tgm-box");if(box){box.style.animation="none";void box.offsetWidth;box.style.animation="tgmP .55s ease 3";}
  } else if(type==="typewriter"){
    c.style.cssText="position:relative;min-height:44px;overflow:visible;border-radius:16px;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 0;";
    ["still","yours","❤️"].forEach((word,wi)=>{const wd=document.createElement("div");wd.style.display="flex";wd.style.gap="1px";[...word].forEach((ch,ci)=>{const l=document.createElement("span");l.textContent=ch;l.style.cssText=`display:inline-block;${wi===2?"font-size:1.4rem;":"font-size:.95rem;"}color:${wi===2?"#ff003c":"#ffb3c1"};opacity:0;animation:tgmL .35s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:${(wi*4+ci)*.055+.1}s;`;wd.appendChild(l);});c.appendChild(wd);});
  }
}

/* ─────────────────────────────────────────
   CONTINUE WATCHING
───────────────────────────────────────── */
function addRecent(memory){
  recentMemories=recentMemories.filter(m=>m.id!==memory.id);
  recentMemories.unshift({id:memory.id}); if(recentMemories.length>5) recentMemories.pop();
  lsSet("recent",recentMemories); genContinueWatching();
}
function genContinueWatching(){
  const row=document.getElementById("continueWatching"); if(!row) return;
  const fresh=recentMemories.map(m=>memories.find(x=>x.id===m.id)||m).filter(m=>m&&m.hero);
  row.innerHTML=fresh.map(m=>`<div class="card" onclick="openMemory('${m.id}')"><img src="${cldOpt(m.hero,600)}" loading="lazy" decoding="async" alt="${m.title}"><div class="card-overlay"><h3>${m.title}</h3><p>Continue Watching ❤️</p></div></div>`).join("");
}

/* ─────────────────────────────────────────
   FAVORITES
───────────────────────────────────────── */
window.toggleFavorite=function(id){
  const m=memories.find(m=>m.id===id); if(!m) return;
  if(favoriteMemories.find(f=>f.id===id)) favoriteMemories=favoriteMemories.filter(f=>f.id!==id);
  else favoriteMemories.push({id:m.id});
  lsSet("favs",favoriteMemories); genFavorites();
};
function genFavorites(){
  const row=document.getElementById("favoriteRows"); if(!row) return;
  const fresh2=favoriteMemories.map(m=>memories.find(x=>x.id===m.id)||m).filter(m=>m&&m.hero);
  row.innerHTML=fresh2.map(m=>`<div class="card" onclick="openMemory('${m.id}')"><img src="${cldOpt(m.hero,600)}" loading="lazy" decoding="async" alt="${m.title}"><div class="card-overlay"><h3>${m.title}</h3></div></div>`).join("");
}

/* ─────────────────────────────────────────
   TOP MEMORIES
───────────────────────────────────────── */
function genTopMemories(){
  const row=document.getElementById("topMemories"); if(!row) return;
  const top=[...memories].filter(m=>m.opens>0).sort((a,b)=>b.opens-a.opens).slice(0,8);
  row.innerHTML=top.length
    ? top.map(m=>`<div class="card" onclick="openMemory('${m.id}')"><img src="${cldOpt(m.hero,600)}" loading="lazy" decoding="async" alt="${m.title}"><div class="card-overlay"><h3>${m.title}</h3><p>🔥 ${m.opens} replays</p></div></div>`).join("")
    : '<p style="opacity:.4;padding:16px;font-size:.88rem;font-style:italic;">Open some memories to see them here ❤️</p>';
}

/* ─────────────────────────────────────────
   GENERATE ROWS — paginated
───────────────────────────────────────── */
let _rowsLoaded=0;
function generateRows(){
  _rowsLoaded=0;
  const rows=document.getElementById("rows"); if(rows) rows.innerHTML="";
  appendRows();
}
window.loadMoreRows=function(){appendRows();};
function appendRows(){
  const rows=document.getElementById("rows"); if(!rows) return;
  const start=_rowsLoaded, end=Math.min(_rowsLoaded+ROWS_PG,memories.length);
  const slice=memories.slice(start,end), hasMore=end<memories.length;
  const old=rows.querySelector(".load-more-wrap"); if(old) old.remove();
  slice.forEach(m=>{
    const sec=document.createElement("section"); sec.className="section reveal-on-scroll";
    sec.innerHTML=`<h2>${m.title}</h2><div class="netflix-row"><div class="card" onclick="openMemory('${m.id}')"><img src="${cldOpt(m.hero,600)}" loading="lazy" decoding="async" alt="${m.title}"><div class="card-overlay"><h3>${m.title}</h3><p>${m.description}</p><div class="card-actions"><button onclick="event.stopPropagation();toggleFavorite('${m.id}')">❤️ Fav</button><button onclick="event.stopPropagation();editMemory('${m.id}')">✏️ Edit</button><button class="delete-btn" onclick="event.stopPropagation();deleteMemory('${m.docId}')">🗑</button></div></div></div></div>`;
    rows.appendChild(sec);
  });
  _rowsLoaded=end;
  if(hasMore){
    const wrap=document.createElement("div"); wrap.className="load-more-wrap";
    wrap.innerHTML=`<button class="load-more-btn" onclick="loadMoreRows()"><span class="lm-icon">↓</span> Load More (${memories.length-_rowsLoaded} remaining)</button>`;
    rows.appendChild(wrap);
  }
  setTimeout(()=>revealNew(rows),80);
}

/* ─────────────────────────────────────────
   OPEN MEMORY
───────────────────────────────────────── */
window.openMemory=function(id){
  const memory=memories.find(m=>m.id===id); if(!memory) return;
  currentMemory=memory; 
  /* SECURE MEMORY */

if(memory.isPrivate){

  const entered = prompt(

    "Enter Love Password ❤️"
  );

  if(entered !== memory.lovePassword){

    alert(
      "Wrong Love Password ❤️"
    );

    return;
  }
}addRecent(memory);
 
  renderMemory(memory);
};

/* ─────────────────────────────────────────
   GALLERY STATE + RENDER MEMORY
───────────────────────────────────────── */
window._gPage=0;
window._gAll=[];

function renderMemory(memory){
  const home=document.getElementById("homeScreen");
  const screen=document.getElementById("memoryScreen");
  const content=document.getElementById("memoryContent");
  if(home)   home.style.display="none";
  if(screen) screen.style.display="block";
  window._gPage=0;
  window._gAll=memory.images?[...memory.images]:[];

  const vids=memory.videos||[];
  const vidHTML=vids.length
    ?`<div class="video-grid-layout">${vids.map((v,vi)=>{const f=favoriteVideos.includes(v);return`<div class="card gallery-card video-card" onclick="openVideo('${v}')"><video src="${v}" muted playsinline preload="none" poster="${cldPoster(v)}"></video><div class="play-badge">▶</div><button class="img-delete-btn" onclick="event.stopPropagation();deleteVid(${vi})">🗑</button><button class="fav-btn" onclick="event.stopPropagation();toggleVidFav('${v}')">${f?"❤️":"🤍"}</button><div class="card-overlay"><h3>${memory.title}</h3><p>Video ${vi+1}/${vids.length}</p></div></div>`;}).join("")}</div>`
    :'<p style="opacity:.5;padding:16px 0;font-style:italic;font-size:.9rem;">No videos yet.</p>';

  const recs=memories.filter(m=>m.id!==memory.id).slice(0,8).map(r=>`<div class="card" onclick="openMemory('${r.id}')"><img src="${cldOpt(r.hero,600)}" loading="lazy" decoding="async" alt="${r.title}"><div class="card-overlay"><h3>${r.title}</h3></div></div>`).join("");

  content.innerHTML=`
  <section class="hero" style="background-image:url('${cldOpt(memory.hero,1600)}')">
    <div class="overlay"></div>
    <div class="hero-content">
      <h1>${memory.title}</h1><p>${memory.description}</p>
      <div class="memory-meta">
        <span>📸 ${memory.images.length} images</span>
        <span>🎬 ${vids.length} videos</span>
        <span>👁 Opens: ${memory.opens||0}</span>
      </div>
      <div class="hero-buttons">
        <button class="play-btn" onclick="addMedia()">➕ Add Media</button>
        <button class="info-btn" onclick="showHome()">← Back</button>
      </div>
    </div>
  </section>
  <section class="section" id="galWrap"><h2>Gallery 📸</h2><div id="galContainer"></div></section>
  <section class="section"><h2>Videos 🎬</h2>${vidHTML}</section>
  <section class="section"><h2>More Like This ❤️</h2><div class="netflix-row">${recs}</div></section>`;

  window._renderGal();
}

window._renderGal=function(){
  const con=document.getElementById("galContainer"); if(!con) return;
  const all=window._gAll, total=all.length;
  const pages=Math.ceil(total/GAL_PG), page=window._gPage;
  const start=page*GAL_PG, end=Math.min(start+GAL_PG,total), slice=all.slice(start,end);

  if(!total){con.innerHTML='<p style="opacity:.5;padding:16px 0;font-style:italic;font-size:.9rem;">No images yet. Use ➕ Add Media.</p>';return;}

  const cards=slice.map((img,li)=>{
    const gi=start+li;
    return`<div class="card gallery-card" onclick="openGallery(window._gAll,${gi})"><img src="${cldOpt(img,700)}" loading="lazy" decoding="async" alt="Image ${gi+1}"><button class="img-delete-btn" onclick="event.stopPropagation();deleteImg(${gi})">🗑</button><div class="card-overlay"><p>${gi+1}/${total}</p></div></div>`;
  }).join("");

  const pag=pages>1?`<div class="gallery-pagination"><button class="gallery-page-btn" onclick="window._gPage--;window._renderGal()" ${page===0?"disabled":""}>← Prev</button><span class="gallery-page-info">${page+1}/${pages} · ${start+1}–${end} of ${total}</span><button class="gallery-page-btn" onclick="window._gPage++;window._renderGal()" ${page>=pages-1?"disabled":""}>Next →</button></div>`:"";

  con.innerHTML=`<div class="gallery-grid">${cards}</div>${pag}`;
  if(page>0){const w=document.getElementById("galWrap");if(w)w.scrollIntoView({behavior:"smooth",block:"start"});}
};

/* ─────────────────────────────────────────
   PRIVATE VAULT
───────────────────────────────────────── */
window.showPrivate=function(){
  if(!VAULT_NAMES.includes(userProfile?.yourName||"")) return;
  document.getElementById("passwordScreen").classList.add("active");
};
window.closePasswordScreen=function(){document.getElementById("passwordScreen").classList.remove("active");};
window.unlockPrivate=function(){
  const pass=document.getElementById("passwordInput").value;
  const m=memories.find(m=>m.id==="private");
  if(pass==="love123"&&m){closePasswordScreen();renderMemory(m);}
  else alert("Incorrect code ❤️");
};

/* ─────────────────────────────────────────
   SECRET TRIGGER
───────────────────────────────────────── */
window.secretTap=function(){const e=document.getElementById("secretMemory");if(e)e.style.display="flex";};
window.closeSecretMemory=function(){const e=document.getElementById("secretMemory");if(e)e.style.display="none";};

/* ─────────────────────────────────────────
   IMAGE VIEWER
───────────────────────────────────────── */
window.openGallery=async function(images,index){
  currentImages=Array.isArray(images)?images:window._gAll;
  currentIndex=index; currentMode="image";
  updateViewer();
  const v=document.getElementById("viewer");
  if(v){v.style.display="flex";v.classList.add("active");}
  if(currentMemory?.docId){
    try{
      const n=(currentMemory.opens||0)+1;
      await updateDoc(memDoc(currentMemory.docId),{opens:n});
      currentMemory.opens=n;
      const meta=document.querySelector(".memory-meta");
      if(meta) meta.innerHTML=meta.innerHTML.replace(/Opens:\s*\d+/,`Opens: ${n}`);
    }catch(e){console.log(e);}
  }
};
function updateViewer(){
  const img=document.getElementById("viewerImage");
  const ctr=document.getElementById("imageCounter");
  const vid=document.getElementById("viewerVideo");
  if(vid){vid.pause();vid.style.display="none";}
  if(img){img.style.display="block";img.src=currentImages[currentIndex];}
  if(ctr) ctr.innerText=`${currentIndex+1} / ${currentImages.length}`;
}
window.nextImage=function(){if(currentMode!=="image"||!currentImages.length)return;currentIndex=(currentIndex+1)%currentImages.length;updateViewer();};
window.prevImage=function(){if(currentMode!=="image"||!currentImages.length)return;currentIndex=(currentIndex-1+currentImages.length)%currentImages.length;updateViewer();};
window.closeViewer=function(){
  const v=document.getElementById("viewer");if(v){v.style.display="none";v.classList.remove("active");}
  const vid=document.getElementById("viewerVideo");if(vid){vid.pause();vid.src="";vid.style.display="none";}
  const img=document.getElementById("viewerImage");if(img)img.style.display="block";
};

/* ─────────────────────────────────────────
   VIDEO VIEWER
───────────────────────────────────────── */
window.openVideo=async function(url){
  currentMode="video";
  const viewer=document.getElementById("viewer");
  const img=document.getElementById("viewerImage"); if(img) img.style.display="none";
  let v=document.getElementById("viewerVideo");
  if(!v){v=document.createElement("video");v.id="viewerVideo";v.controls=true;v.autoplay=true;v.style.cssText="max-width:90vw;max-height:85vh;border-radius:12px;box-shadow:0 0 40px rgba(255,0,60,.4);";if(img?.parentNode)img.parentNode.appendChild(v);else if(viewer)viewer.appendChild(v);}
  v.src=url;v.style.display="block";v.play().catch(()=>{});
  if(viewer){viewer.style.display="flex";viewer.classList.add("active");}
};

/* ─────────────────────────────────────────
   CREATOR
───────────────────────────────────────── */
window.openCreator=function(){document.getElementById("creatorPanel").classList.add("active");};
window.closeCreator=function(){document.getElementById("creatorPanel").classList.remove("active");};

/* ─────────────────────────────────────────
   CLOUDINARY UPLOAD
───────────────────────────────────────── */
function uploadToCloudinary(file,onProgress){
  return new Promise((resolve,reject)=>{
    if(file.size<=100*1024*1024){
      const fd=new FormData(); fd.append("file",file); fd.append("upload_preset",PRESET);
      const xhr=new XMLHttpRequest();
      xhr.open("POST",`https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`);
      xhr.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(e.loaded/e.total*100);};
      xhr.onload=()=>{try{const d=JSON.parse(xhr.responseText);if(xhr.status===200&&d.secure_url)resolve(d);else reject(new Error(d.error?.message||"Upload failed"));}catch(e){reject(e);}};
      xhr.onerror=()=>reject(new Error("Network error"));
      xhr.send(fd);
    } else { uploadChunked(file,onProgress).then(resolve).catch(reject); }
  });
}
async function uploadChunked(file,onProgress){
  const uid=`lf_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  const total=Math.ceil(file.size/CHUNK); let finalData=null;
  for(let i=0;i<total;i++){
    const s=i*CHUNK,e=Math.min(s+CHUNK,file.size);
    const fd=new FormData(); fd.append("file",file.slice(s,e)); fd.append("upload_preset",PRESET);
    const res=await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`,{method:"POST",headers:{"X-Unique-Upload-Id":uid,"Content-Range":`bytes ${s}-${e-1}/${file.size}`},body:fd});
    const text=await res.text(); if(onProgress) onProgress((i+1)/total*100);
    if(res.status===200){try{finalData=JSON.parse(text);}catch(e){throw new Error("Bad response");}}
    else if(res.status!==206){let msg=`Chunk ${i+1} failed`;try{msg=JSON.parse(text)?.error?.message||msg;}catch(_){}throw new Error(msg);}
  }
  if(!finalData?.secure_url) throw new Error("No URL returned");
  return finalData;
}

/* ─────────────────────────────────────────
   UPLOAD PROGRESS OVERLAY  (createMemory)
───────────────────────────────────────── */
function showProgress(label){
  let ov=document.getElementById("upOv");
  if(!ov){
    ov=document.createElement("div");ov.id="upOv";
    ov.innerHTML=`<div class="upi"><div class="ups"></div><div class="upl" id="upL">Uploading...</div><div class="upbw"><div class="upbf" id="upF"></div></div><div class="upp" id="upP">0%</div></div>`;
    document.body.appendChild(ov);
    const s=document.createElement("style");
    s.textContent=`#upOv{position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(16px);display:flex;justify-content:center;align-items:center;z-index:99999999;cursor:none !important;}.upi{display:flex;flex-direction:column;align-items:center;gap:16px;padding:44px 52px;background:linear-gradient(135deg,rgba(15,0,5,.97),rgba(5,0,15,.97));border:1px solid rgba(255,0,60,.28);border-radius:24px;min-width:300px;text-align:center;}.ups{width:50px;height:50px;border-radius:50%;border:3px solid rgba(255,0,60,.14);border-top-color:#ff003c;animation:spin .8s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}.upl{color:#ffb3c1;font-size:.95rem;letter-spacing:1px;font-style:italic;}.upbw{width:240px;height:4px;background:rgba(255,255,255,.06);border-radius:10px;overflow:hidden;}.upbf{height:100%;width:0%;background:linear-gradient(90deg,#ff003c,#ff6b9d);border-radius:10px;transition:width .22s ease;}.upp{color:#ff6b9d;font-size:.82rem;letter-spacing:2px;}`;
    document.head.appendChild(s);
  }
  ov.style.display="flex"; setProgress(0,label||"Uploading...");
}
function setProgress(pct,label){
  const f=document.getElementById("upF"),p=document.getElementById("upP"),l=document.getElementById("upL");
  if(f) f.style.width=`${Math.min(pct,100)}%`;
  if(p) p.textContent=`${Math.round(Math.min(pct,100))}%`;
  if(l&&label) l.textContent=label;
}
function hideProgress(){
  const ov=document.getElementById("upOv"); if(!ov) return;
  ov.style.transition="opacity .38s"; ov.style.opacity="0";
  setTimeout(()=>{ov.style.display="none";ov.style.opacity="1";},400);
}

/* ─────────────────────────────────────────
   UPLOAD QUEUE  (addMedia — non-blocking)
───────────────────────────────────────── */
function ensureQueue(){
  let q=document.getElementById("uploadQueue");
  if(!q){q=document.createElement("div");q.id="uploadQueue";document.body.appendChild(q);}
  return q;
}
function qTask(filename){
  const queue=ensureQueue();
  const uid=`uq_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const name=filename.length>28?filename.slice(0,25)+"…":filename;
  const task=document.createElement("div"); task.className="uq-task"; task.id=uid;
  task.innerHTML=`<div class="uq-header"><span class="uq-filename">${name}</span><span class="uq-status" id="uqs_${uid}">uploading</span></div><div class="uq-bar-outer"><div class="uq-bar-fill" id="uqf_${uid}"></div></div>`;
  queue.appendChild(task); return uid;
}
function qUpdate(uid,pct){
  const f=document.getElementById(`uqf_${uid}`), s=document.getElementById(`uqs_${uid}`);
  if(f) f.style.width=Math.min(pct,99)+"%"; if(s&&pct<100) s.textContent=Math.round(pct)+"%";
}
function qDone(uid,ok){
  const task=document.getElementById(uid),f=document.getElementById(`uqf_${uid}`),s=document.getElementById(`uqs_${uid}`);
  if(!task) return;
  task.classList.add(ok?"uq-done":"uq-error");
  if(f) f.style.width="100%"; if(s) s.textContent=ok?"saved ❤️":"failed";
  setTimeout(()=>{task.classList.add("uq-removing");setTimeout(()=>task.remove(),420);},3000);
}

/* ─────────────────────────────────────────
   CREATE MEMORY
───────────────────────────────────────── */
window.createMemory=async function(){
  if(!currentUser){alert("Please sign in ❤️");return;}
  const title=document.getElementById("memoryTitle").value;
  const desc =document.getElementById("memoryDescription").value;
  const files=Array.from(document.getElementById("memoryImage").files);
  if(!title||!desc||!files.length){alert("Fill all fields ❤️");return;}
  showProgress("Creating your memory...");
  try{
    let imgs=[],vids=[];
    for(let i=0;i<files.length;i++){
      const f=files[i], type=f.type.startsWith("video/")?"video":"image";
      setProgress(i/files.length*100,`Uploading ${i+1}/${files.length}`);
      const d=await uploadToCloudinary(f,pct=>setProgress(pct));
      if(type==="video") vids.push(d.secure_url); else imgs.push(d.secure_url);
    }
    setProgress(100,"Saving...");
    const isPrivate   = document.getElementById("secureMemory")?.checked   || false;
    const lovePassword = document.getElementById("securePassword")?.value    || "";
await addDoc(memoriesCol(),{id:title.toLowerCase().replaceAll(" ","-"),title,description:desc,hero:imgs[0] || vids[0],images:imgs,videos:vids,tags:["New"],opens:0,favoriteCount:0,isPrivate,lovePassword});    await refreshApp(); hideProgress(); closeCreator();
    document.getElementById("memoryTitle").value="";
    document.getElementById("memoryDescription").value="";
    document.getElementById("memoryImage").value="";
    /* RESET SECURE MEMORY */

document.getElementById(
  "secureMemory"
).checked = false;

document.getElementById(
  "securePassword"
).value = "";

document.getElementById(
  "securePasswordWrap"
).style.display = "none";
    alert("Memory Created ❤️");
  }catch(e){console.error(e);hideProgress();alert("Upload failed ❤️");}
};

/* ─────────────────────────────────────────
   DELETE / EDIT MEMORY
───────────────────────────────────────── */
window.deleteMemory=async function(docId){
  if(!confirm("Delete this memory forever? ❤️")) return;
  try{await deleteDoc(memDoc(docId));await refreshApp();}catch(e){alert("Delete failed ❤️");}
};
window.editMemory=async function(id){
  const m=memories.find(m=>m.id===id); if(!m) return;
  const t=prompt("New title:",m.title); if(t===null) return;
  const d=prompt("New description:",m.description); if(d===null) return;
  try{await updateDoc(memDoc(m.docId),{title:t.trim()||m.title,description:d.trim()||m.description});await refreshApp();}catch(e){alert("Update failed ❤️");}
};

/* ─────────────────────────────────────────
   ADD MEDIA — background non-blocking
───────────────────────────────────────── */
window.addMedia=function(){
  if(!currentMemory) return;
  const input=document.createElement("input"); input.type="file"; input.accept="image/*,video/*"; input.multiple=true;
  input.onchange=async()=>{
    const files=Array.from(input.files); if(!files.length) return;
    const imgs=files.filter(f=>f.type.startsWith("image/")), vids=files.filter(f=>f.type.startsWith("video/"));
    if(imgs.length>10){alert("Max 10 images at a time ❤️");return;}
    if(vids.length>1){alert("One video at a time ❤️");return;}
    for(const v of vids){if(v.size>500*1024*1024){alert(`"${v.name}" too large (max 500MB) ❤️`);return;}}

    const mid=currentMemory.id, mdocId=currentMemory.docId, origHero=currentMemory.hero;
    let curImgs=[...currentMemory.images], curVids=[...(currentMemory.videos||[])];
    const uids=[...imgs,...vids].map(f=>qTask(f.name));

    (async()=>{
      try{
        for(let i=0;i<imgs.length;i++){const uid=uids[i];try{const d=await uploadToCloudinary(imgs[i],p=>qUpdate(uid,p));curImgs.push(d.secure_url);qDone(uid,true);}catch(e){qDone(uid,false);}}
        for(let i=0;i<vids.length;i++){const uid=uids[imgs.length+i];try{const d=await uploadToCloudinary(vids[i],p=>qUpdate(uid,p));curVids.push(d.secure_url);qDone(uid,true);}catch(e){qDone(uid,false);}}
        await updateDoc(memDoc(mdocId),{images:curImgs,videos:curVids,hero:curImgs[0]||origHero});
        await loadMemories();
        const upd=memories.find(m=>m.id===mid);
        if(upd){currentMemory=upd;window._gAll=[...upd.images];const s=document.getElementById("memoryScreen");if(s&&s.style.display!=="none")renderMemory(currentMemory);}
        if(window._slideshowLayerA) refreshSlideshow();
      }catch(e){console.error(e);}
    })();
  };
  input.click();
};

/* ─────────────────────────────────────────
   DELETE IMAGE / VIDEO
───────────────────────────────────────── */
window.deleteImg=async function(index){
  if(!currentMemory||!confirm("Remove this image? ❤️")) return;
  const upd=currentMemory.images.filter((_,i)=>i!==index);
  try{await updateDoc(memDoc(currentMemory.docId),{images:upd,hero:upd[0]||currentMemory.hero});await loadMemories();currentMemory=memories.find(m=>m.id===currentMemory.id);renderMemory(currentMemory);}catch(e){alert("Delete failed ❤️");}
};
window.deleteVid=async function(index){
  if(!currentMemory||!confirm("Remove this video? ❤️")) return;
  const upd=(currentMemory.videos||[]).filter((_,i)=>i!==index);
  try{await updateDoc(memDoc(currentMemory.docId),{videos:upd});await loadMemories();currentMemory=memories.find(m=>m.id===currentMemory.id);renderMemory(currentMemory);}catch(e){alert("Delete failed ❤️");}
};
window.toggleVidFav=function(url){
  if(favoriteVideos.includes(url)) favoriteVideos=favoriteVideos.filter(u=>u!==url); else favoriteVideos.push(url);
  lsSet("favvids",favoriteVideos); if(currentMemory) renderMemory(currentMemory);
};

/* ─────────────────────────────────────────
   MINI GAMES
───────────────────────────────────────── */
window.openGame=function(id){
  const modal=document.getElementById("gameModal"),content=document.getElementById("gameContent");
  if(!modal||!content) return;
  modal.classList.add("active");
  ({lovemeter:renderLoveMeter,match:renderMatch,truth:renderTruth,wyr:renderWYR})[id]?.(content);
};
window.closeGame=function(){const m=document.getElementById("gameModal");if(m)m.classList.remove("active");};
document.addEventListener("click",e=>{const m=document.getElementById("gameModal");if(m&&e.target===m)window.closeGame();});

function renderLoveMeter(el){
  const Y=yourName(),P=partnerName();
  el.innerHTML=`<h2>Love Meter 💘</h2><p class="game-sub">Let the universe calculate what we already know.</p><div class="love-meter-wrap"><div class="love-meter-names"><span>${Y}</span><span>${P}</span></div><div class="love-meter-bar-outer"><div class="love-meter-bar-fill" id="lmF"></div></div><span class="love-meter-pct" id="lmP">—</span><div class="love-meter-result" id="lmR"></div></div><button class="love-meter-btn" onclick="runLoveMeter()">Calculate ❤️</button>`;
}
const LM=[{p:99,t:"Of course it's almost perfect. Almost — because nothing real is ever exactly perfect. And that's exactly why this is ours."},{p:100,t:"The algorithm broke trying to calculate it. 100% and climbing. Science gave up. We didn't."},{p:97,t:"97% compatible. The remaining 3% is just stubbornness. Which honestly makes this better."},{p:98,t:"98% — the kind of danger the universe warns about but never stops."},{p:96,t:"Dangerously, irreversibly, catastrophically in love. That's what 96% looks like when it's real."}];
window.runLoveMeter=function(){
  const f=document.getElementById("lmF"),p=document.getElementById("lmP"),r=document.getElementById("lmR"); if(!f) return;
  f.style.width="0%";p.textContent="...";r.textContent="";
  const c=LM[Math.floor(Math.random()*LM.length)];
  setTimeout(()=>{f.style.width=c.p+"%";let n=0;const step=c.p/60;const tick=setInterval(()=>{n+=step;if(n>=c.p){clearInterval(tick);setTimeout(()=>{r.textContent=c.t;},280);}p.textContent=Math.floor(n)+"%";},22);},280);
};

const ME=["❤️","🌙","🔥","💋","🌹","🥂","💌","✨"];
function renderMatch(el){
  const pairs=[...ME,...ME].sort(()=>Math.random()-.5);
  el.innerHTML=`<h2>Memory Match 🃏</h2><div class="match-score">Matches: <span id="mC">0</span>/8</div><div class="match-grid">${pairs.map((e,i)=>`<div class="match-card" data-emoji="${e}" data-index="${i}" onclick="flipCard(this)"><span class="card-face">${e}</span></div>`).join("")}</div><div id="mW" style="display:none;margin-top:14px;color:#ff6b9d;font-style:italic;font-size:.95rem;">Perfectly matched. Like you always do with me ❤️</div>`;
  window._ms={flipped:[],matched:0,locked:false};
}
window.flipCard=function(card){
  const st=window._ms;
  if(st.locked||card.classList.contains("flipped")||card.classList.contains("matched")) return;
  card.classList.add("flipped");st.flipped.push(card);
  if(st.flipped.length===2){
    st.locked=true;const [a,b]=st.flipped;
    if(a.dataset.emoji===b.dataset.emoji&&a.dataset.index!==b.dataset.index){
      setTimeout(()=>{a.classList.add("matched");b.classList.add("matched");st.matched++;document.getElementById("mC").textContent=st.matched;st.flipped=[];st.locked=false;if(st.matched===8)document.getElementById("mW").style.display="block";},380);
    }else{setTimeout(()=>{a.classList.add("wrong-shake");b.classList.add("wrong-shake");setTimeout(()=>{a.classList.remove("flipped","wrong-shake");b.classList.remove("flipped","wrong-shake");st.flipped=[];st.locked=false;},420);},550);}
  }
};

function buildTQ(){const P=partnerName();return[
  {q:`What's one thing about ${P} you'd never change?`,yes:`Never let anyone try to change it. That thing you love? That's just ${P} being made for you.`,no:`You hesitated. That means you already know. ❤️`},
  {q:`If ${P} texted you right now — would you smile before reading it?`,yes:`Good. Because they smiled sending it. This is just what you are now.`,no:`Liar. The look on your face says otherwise. ❤️`},
  {q:`Do you think about ${P} when they're not there?`,yes:`They think about you too. More than makes sense.`,no:`That's not believable at all. ❤️`},
  {q:`Fight with ${P} or not talk for a whole day?`,yes:`Fighting it is. At least you're both fully in it.`,no:`You chose silence. Which means you'd miss them.`},
  {q:`Is there a version of your life where you don't choose ${P}?`,yes:`Careful. That's the only dangerous answer.`,no:`Good. Because in every version of theirs — it's always you.`},
];}
let _ti=0;
function renderTruth(el){_ti=Math.floor(Math.random()*5);window._te=el;renderTQ(el);}
function renderTQ(el){const q=buildTQ()[_ti];el.innerHTML=`<h2>Truth Bomb 💣</h2><p class="game-sub">No running allowed.</p><div class="truth-question">"${q.q}"</div><div class="truth-btns"><button class="truth-btn" onclick="answerT('yes')">Yes ❤️</button><button class="truth-btn" onclick="answerT('no')">No...</button></div><div class="truth-response" id="tR"></div><button class="wyr-next-btn" id="tN" onclick="nextT()" style="display:none;margin-top:14px;">Next →</button>`;}
window.answerT=function(c){const q=buildTQ()[_ti],r=document.getElementById("tR"),n=document.getElementById("tN");document.querySelectorAll(".truth-btn").forEach(b=>{b.style.pointerEvents="none";b.style.opacity=".4";});r.textContent=q[c];setTimeout(()=>r.classList.add("visible"),100);if(n)n.style.display="inline-block";};
window.nextT=function(){_ti=(_ti+1)%5;if(window._te)renderTQ(window._te);};

function buildWQ(){const P=partnerName();return[
  {a:`Know exactly what ${P} is thinking`,b:`Never know but feel it in everything they do`,ra:`Knowing is terrifying. Feeling it is the whole point.`,rb:`Smarter. Because ${P} shows you every single day.`},
  {a:`One perfect hour together then it ends`,b:`Messy complicated forever`,ra:`Most heartbreaking answer. Make it count.`,rb:`Messy forever. Correct. Never going to be clean.`},
  {a:`Read all of ${P}'s journals about you`,b:`Never know but they keep writing`,ra:`You want to know. What's been written would ruin you in the best way.`,rb:`Wiser. It's dangerous territory. ❤️`},
  {a:`Be the one who loves a little more`,b:`Be the one who is loved a little more`,ra:`Loving more is brave. Very you.`,rb:`Being loved more. Sit in it. You deserve every bit.`},
  {a:`Fight with ${P} and fix it the same night`,b:`Never fight but never go that deep`,ra:`Fight and fix. The chaos choice.`,rb:`Surface peace or real messy love — you chose easy. Not buying it. ❤️`},
];}
let _wi=0;
function renderWYR(el){_wi=Math.floor(Math.random()*5);window._we=el;renderWQ(el);}
function renderWQ(el){const q=buildWQ()[_wi];el.innerHTML=`<h2>Would You Rather 🔥</h2><p class="game-sub">Pick one.</p><div class="wyr-options"><div class="wyr-opt" onclick="chooseW(this,'a')">${q.a}</div><div class="wyr-opt" onclick="chooseW(this,'b')">${q.b}</div></div><div class="wyr-result" id="wR"></div><button class="wyr-next-btn" id="wN" onclick="nextW()">Next →</button>`;}
window.chooseW=function(el,c){const q=buildWQ()[_wi];document.querySelectorAll(".wyr-opt").forEach(o=>{o.style.pointerEvents="none";o.style.opacity=".38";});el.style.opacity="1";el.classList.add("chosen");const r=document.getElementById("wR"),n=document.getElementById("wN");r.textContent=c==="a"?q.ra:q.rb;setTimeout(()=>r.classList.add("visible"),100);if(n)n.classList.add("visible");};
window.nextW=function(){_wi=(_wi+1)%5;if(window._we)renderWQ(window._we);};

/* ─────────────────────────────────────────
   HERO SLIDESHOW
───────────────────────────────────────── */
window._slideshowLayerA=null;
window._slideshowLayerB=null;
let _ssActive="A",_ssImages=[],_ssIdx=0,_ssTimer=null;

function initSlideshow(){
  const hero=document.querySelector(".home-hero");
  if(!hero||window._slideshowLayerA) return;
  window._slideshowLayerA=document.createElement("div");
  window._slideshowLayerA.className="hero-slide-layer active";
  window._slideshowLayerA.id="heroSlideA";
  window._slideshowLayerB=document.createElement("div");
  window._slideshowLayerB.className="hero-slide-layer inactive";
  window._slideshowLayerB.id="heroSlideB";
  hero.insertBefore(window._slideshowLayerB,hero.firstChild);
  hero.insertBefore(window._slideshowLayerA,hero.firstChild);
  refreshSlideshow();
}

function refreshSlideshow(){
  const pool=memories.filter(m=>m.id!=="private"&&m.hero).map(m=>m.hero);
  if(!pool.length) pool.push("https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?q=60&w=1400&auto=format&fit=crop");
  _ssImages=pool.sort(()=>Math.random()-.5); _ssIdx=0;
  const A=window._slideshowLayerA;
  if(A){A.style.backgroundImage=`url('${_ssImages[0]}')`;A.className="hero-slide-layer active";if(window._slideshowLayerB)window._slideshowLayerB.className="hero-slide-layer inactive";_ssActive="A";}
  if(_ssTimer) clearInterval(_ssTimer);
  _ssTimer=setInterval(()=>{
    if(document.hidden) return;
    const home=document.getElementById("homeScreen");
    if(!home||home.style.display==="none") return;
    _ssIdx=(_ssIdx+1)%_ssImages.length;
    const LA=window._slideshowLayerA,LB=window._slideshowLayerB; if(!LA||!LB) return;
    if(_ssActive==="A"){LB.style.backgroundImage=`url('${_ssImages[_ssIdx]}')`;LB.className="hero-slide-layer active";LA.className="hero-slide-layer inactive";_ssActive="B";}
    else{LA.style.backgroundImage=`url('${_ssImages[_ssIdx]}')`;LA.className="hero-slide-layer active";LB.className="hero-slide-layer inactive";_ssActive="A";}
  },5000);
}
/* =========================
   SECURE MEMORY UI
========================= */

const secureCheck =
document.getElementById(
  "secureMemory"
);

if(secureCheck){

  secureCheck.addEventListener(

    "change",

    function(){

      const wrap =

      document.getElementById(
        "securePasswordWrap"
      );

      if(!wrap) return;

      wrap.style.display =

      this.checked
      ? "block"
      : "none";
    }
  );
}
/* SECURE MEMORY UI */

window.toggleSecureMemory = function(el){

  const wrap =

  document.getElementById(
    "securePasswordWrap"
  );

  if(!wrap) return;

  wrap.style.display =

  el.checked
  ? "block"
  : "none";
}
/* ═════════════════════════════════════════════════════════════
   LOVEFLIX PREMIUM UPGRADE MODULE  (v.1)
   - Heart particle overlay (cinematic, throttled for perf)
   - Theme picker (full custom: couple name, accent, bg, font)
     persisted to userProfile.theme via debounced setDoc
   - Couple-name pill in navbar
   - Reveal-on-scroll observer for new marketing sections
   - Auth-screen marketing injector (mock memories + tagline)
   All additive — wraps/extends existing functions, does NOT replace them.
   ═════════════════════════════════════════════════════════════ */
;(function lfPremium(){
  /* ---------- Heart particle generator (perf-aware) ---------- */
  function spawnHearts(){
    const c = document.getElementById('lfHearts');
    if(!c) return;
    if(window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const MAX = window.innerWidth < 768 ? 5 : 12;
    function spawn(){
      if(c.children.length >= MAX) return;
      const s = document.createElement('span');
      s.textContent = '❤';
      const size = 12 + Math.random()*22;
      s.style.left = (Math.random()*100) + '%';
      s.style.fontSize = size + 'px';
      s.style.setProperty('--dx', ((Math.random()-0.5)*200) + 'px');
      s.style.animationDuration = (8 + Math.random()*10) + 's';
      s.style.opacity = (0.4 + Math.random()*0.5);
      c.appendChild(s);
      setTimeout(()=>s.remove(), 20000);
    }
    for(let i=0;i<Math.floor(MAX/2);i++) setTimeout(spawn, i*600);
    setInterval(spawn, window.innerWidth < 768 ? 2200 : 1400);
  }

  /* ---------- Theme system ---------- */
  const DEFAULT_THEME = {
    couple: '',
    accent: '#ff003c',
    bg: '#0a0204',
    font: "'Playfair Display', serif"
  };
  const PRESETS = [
    { name:'Crimson',  accent:'#ff003c', bg:'#0a0204' },
    { name:'Rose',     accent:'#ff5d8f', bg:'#15060c' },
    { name:'Gold',     accent:'#d4a24c', bg:'#10080a' },
    { name:'Sunset',   accent:'#ff6a3d', bg:'#180a08' },
    { name:'Midnight', accent:'#8a5cf6', bg:'#070417' },
    { name:'Cream',    accent:'#e8b4a0', bg:'#1a0f0d' }
  ];

   function applyTheme(t){
    t = Object.assign({}, DEFAULT_THEME, t || {});
    const r = document.documentElement.style;
    r.setProperty('--lf-accent', t.accent);
    r.setProperty('--lf-accent-soft', shade(t.accent, 20));
    r.setProperty('--lf-bg-1', t.bg);
    r.setProperty('--lf-bg-2', shade(t.bg, 10));
    r.setProperty('--lf-font-display', t.font);
    r.setProperty('--accent', t.accent);

    /* === Force hardcoded reds / bg / font to follow the theme === */
    let s = document.getElementById('lfThemeOverride');
    if(!s){ s = document.createElement('style'); s.id = 'lfThemeOverride'; document.head.appendChild(s); }
    const A = t.accent, AS = shade(t.accent,20), BG = t.bg, BG2 = shade(t.bg,10), F = t.font;
    s.textContent = `
      body, .home-screen, #homeScreen, #memoryScreen,
      .auth-screen, #authScreen, .ab, .profile-screen,
      .netflix-splash { background: ${BG} !important; }
      body { background: linear-gradient(180deg, ${BG}, ${BG2} 60%, #050505) !important; }

      h1, h2, h3, .logo, .splash-logo, .ab-logo, .ab-title,
      .timeline-content h3, .tgm-box h2, .game-modal-box h2,
      .love-meter-pct { font-family: ${F} !important; }

      .logo, .splash-logo, .ab-logo, .badge-heart,
      .timeline-year, .timeline-content h3,
      .tgm-box h2, .game-modal-box h2, .love-meter-pct,
      .gallery-card .img-delete-btn,
      .secret-trigger { color: ${A} !important; }

      .ab-btn, .card-actions button:hover,
      .close-btn, .gallery-card .img-delete-btn:hover,
      .love-meter-btn, .tgm-close:hover,
      .nav-btn:not(.nav-btn-ghost):hover { background: ${A} !important; }

      .ab-btn { background: linear-gradient(135deg, ${A}, ${shade(A,-30)}) !important; box-shadow: 0 8px 24px ${A}55 !important; }

      .timeline-line { background: linear-gradient(180deg, ${A}, ${AS}, ${A}) !important; }
      .timeline-dot  { box-shadow: 0 0 10px ${A}, 0 0 25px ${A}aa !important; background: ${A} !important; }

      .tgm-choice:hover, .wyr-opt.chosen, .truth-btn:hover,
      .gallery-page-btn:hover, .timeline-game-btn:hover,
      .game-play-btn:hover, .load-more-btn:hover,
      .match-card.matched, .tgm-choice.chosen
        { border-color: ${A} !important; background: ${A}26 !important; color: #fff !important; }

      .love-meter-bar-fill, .uq-bar-fill
        { background: linear-gradient(90deg, ${A}, ${AS}) !important; box-shadow: 0 0 12px ${A}aa !important; }

      .avatar-omen { background: linear-gradient(135deg, ${shade(BG,15)}, ${shade(BG,40)}) !important; color: ${A} !important; }

      .ab-in:focus { border-color: ${A}80 !important; }
      .ab-sw span  { color: ${AS} !important; }
    `;

    // update couple pill
    const pill = document.getElementById('couplePill');
    if(pill){
      const label = t.couple || (window.userProfile ? `${(window.userProfile.yourName||'')} & ${(window.userProfile.partnerName||'')}` : '');
      if(label && label.trim() !== '&'){
        pill.innerHTML = `<span class="heart">❤</span>${label}`;
        pill.style.display = 'inline-flex';
      } else { pill.style.display = 'none'; }
    }
  }

  function shade(hex, amt){
    // lighten/darken hex by amt (0-100)
    try{
      const c = hex.replace('#','');
      const n = parseInt(c.length===3 ? c.split('').map(x=>x+x).join('') : c, 16);
      const r = Math.min(255, Math.max(0, ((n>>16)&255) + amt));
      const g = Math.min(255, Math.max(0, ((n>>8)&255)  + amt));
      const b = Math.min(255, Math.max(0, (n&255)       + amt));
      return '#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
    }catch(e){ return hex; }
  }

  // debounced save (avoid hammering Firestore on color drag)
  let saveTimer = null;
  function saveTheme(theme){
    applyTheme(theme);
    if(window.userProfile) window.userProfile.theme = theme;
    try{ window.__lfThemeWrite(JSON.stringify(theme)); }catch(e){}
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try{
        if(typeof window.saveProfile === 'function' && window.currentUser){
          await window.saveProfile({ theme });
        }
      }catch(e){ console.warn('theme save failed', e); }
    }, 700);
  }

  function buildPresetUI(){
    const wrap = document.getElementById('lfPresets');
    if(!wrap) return;
    wrap.innerHTML = PRESETS.map((p,i)=>`
      <div class="lf-preset" data-i="${i}"
           style="background:linear-gradient(135deg, ${p.accent}, ${p.bg})">
        <span>${p.name}</span>
      </div>`).join('');
    wrap.querySelectorAll('.lf-preset').forEach(el => {
      el.addEventListener('click', () => {
        const p = PRESETS[+el.dataset.i];
        const cur = currentThemeFromUI();
        const next = { ...cur, accent:p.accent, bg:p.bg };
        setUIFromTheme(next);
        saveTheme(next);
        wrap.querySelectorAll('.lf-preset').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
      });
    });
  }

  function currentThemeFromUI(){
    return {
      couple: '',
      accent: document.getElementById('lfThemeAccent')?.value || DEFAULT_THEME.accent,
      bg:     document.getElementById('lfThemeBg')?.value     || DEFAULT_THEME.bg,
      font:   document.getElementById('lfThemeFont')?.value   || DEFAULT_THEME.font
    };
  }
  function setUIFromTheme(t){
    t = Object.assign({}, DEFAULT_THEME, t||{});
    const a = document.getElementById('lfThemeAccent'); if(a) a.value = t.accent;
    const b = document.getElementById('lfThemeBg');     if(b) b.value = t.bg;
    const f = document.getElementById('lfThemeFont');   if(f) f.value = t.font;
    const c = document.getElementById('lfThemeCouple'); if(c) c.value = t.couple;
    const an = document.getElementById('lfAccentName'); if(an) an.textContent = t.accent;
    const bn = document.getElementById('lfBgName');     if(bn) bn.textContent = t.bg;
  }

  function bindInputs(){
    const inputs = ['lfThemeAccent','lfThemeBg','lfThemeFont'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if(!el || el.__lfBound) return;
      el.__lfBound = true;
      const ev = (el.type === 'color' || el.tagName === 'SELECT') ? 'input' : 'input';
      el.addEventListener(ev, () => {
        const t = currentThemeFromUI();
        const an = document.getElementById('lfAccentName'); if(an) an.textContent = t.accent;
        const bn = document.getElementById('lfBgName');     if(bn) bn.textContent = t.bg;
        saveTheme(t);
      });
    });
  }

  window.openThemePicker = function(){
    buildPresetUI();
    bindInputs();
    // hydrate from profile or localStorage
    let t = (window.userProfile && window.userProfile.theme) || null;
    if(!t){ try{ t = JSON.parse(window.__lfThemeRead()||'null'); }catch(e){} }
    if(!t){
      t = { ...DEFAULT_THEME, couple: window.userProfile ? `${window.userProfile.yourName||''} & ${window.userProfile.partnerName||''}`.replace(/^ & $/,'') : '' };
    }
    setUIFromTheme(t);
    document.getElementById('lfThemePanel').classList.add('open');
    document.getElementById('lfThemeBackdrop').classList.add('open');
  };
  window.closeThemePicker = function(){
    document.getElementById('lfThemePanel').classList.remove('open');
    document.getElementById('lfThemeBackdrop').classList.remove('open');
  };
  window.resetTheme = function(){
    setUIFromTheme(DEFAULT_THEME);
    saveTheme(DEFAULT_THEME);
  };
  window.applyTheme = applyTheme;

  /* ---------- Reveal-on-scroll for new marketing sections ---------- */
  function initReveal(){
    if(!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('revealed'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if(e.isIntersecting){ e.target.classList.add('revealed'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    document.querySelectorAll('.reveal-on-scroll').forEach(el => io.observe(el));
  }

  /* ---------- Auth-screen marketing injector ---------- */
  function injectAuthMarketing(){
    // wait until the auth screen has been rendered by existing code
    const target = document.querySelector('.auth-screen, #authScreen, .auth-box, .auth-container');
    if(!target || target.querySelector('.lf-auth-marketing')) return false;
    const div = document.createElement('div');
    div.className = 'lf-auth-marketing';
    div.innerHTML = `
      <p class="lf-auth-tagline">LOVEFLIX — your private love story, only for us ❤</p>
      <div class="lf-mini-mocks">
        <img src="images/mock-1.jpg" alt="" loading="lazy">
        <img src="images/mock-2.jpg" alt="" loading="lazy">
        <img src="images/mock-3.jpg" alt="" loading="lazy">
      </div>
    `;
    target.appendChild(div);
    return true;
  }

  /* ---------- Boot ---------- */
  function boot(){
    spawnHearts();
    // NOTE: initReveal() removed — initScrollReveal() in bootApp already covers all
    // .reveal-on-scroll elements. Running two IntersectionObservers on the same
    // elements caused double-fires and wasted memory.

    // Hydrate theme early from localStorage so first paint isn't a flash
    try{
      const cached = JSON.parse(window.__lfThemeRead() || 'null');
      if(cached) applyTheme(cached);
    }catch(e){}

    // Re-apply when profile loads (Firestore wins over local cache).
    // Listen for a custom 'lf:profileLoaded' event fired by bootApp — zero polling.
    window.addEventListener('lf:profileLoaded', () => {
      if(window.userProfile?.theme) applyTheme(window.userProfile.theme);
    }, { once: false });

    // Try inject auth marketing repeatedly until auth screen exists & populated
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if(injectAuthMarketing() || tries > 30) clearInterval(iv);
    }, 500);
  }

  if(document.readyState === 'loading'){
    window.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
