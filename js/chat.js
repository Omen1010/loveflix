/* ============================================================
   LOVEFLIX  —  Couples Chat Module
   - Per-device "Who am I?" role (p1 / p2) stored in localStorage
   - Real-time messages via Firestore onSnapshot
   - Typing indicator, daily streak, daily mood
   - Sealed Love-Letters & Time Capsules (unlock on date)
   - In-site notification: sound + tab-title flash + toast
   ============================================================ */
import {
  db, collection, addDoc, doc, setDoc, getDoc, updateDoc,
  onSnapshot, orderBy, query, serverTimestamp, limit
} from "./firebase.js";

(function lfChat(){
  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const todayKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  /* ---------- state ---------- */
  let uid = null;          // firebase user uid
  let meRole = null;       // 'p1' or 'p2'
  let unsubMsgs = null;
  let unsubTyping = null;
  let unsubMeta = null;
  let typingTimer = null;
  let openCount = 0;       // unread badge while panel closed
  let isPanelOpen = false;
  let cachedMsgs = [];
  let origTitle = document.title;
  let titleFlashIv = null;

  /* ---------- DOM (built once on first open) ---------- */
  function ensureDom(){
    if($('lfChatPanel')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="lf-chat-backdrop" id="lfChatBackdrop"></div>
      <aside class="lf-chat-panel" id="lfChatPanel" aria-hidden="true">
        <header class="lf-chat-head">
          <div class="lf-chat-title">
            <span class="lf-chat-heart">💌</span>
            <div>
              <strong id="lfChatTitleText">Our Chat</strong>
              <small id="lfChatSubtitle">just for us</small>
            </div>
          </div>
          <div class="lf-chat-head-right">
            <span class="lf-chat-streak" id="lfChatStreak" title="Daily streak">🔥 0</span>
            <button class="lf-chat-close" id="lfChatCloseBtn" aria-label="Close">×</button>
          </div>
        </header>

        <div class="lf-chat-mood" id="lfChatMood">
          <span class="lf-mood-label">Today's mood</span>
          <div class="lf-mood-row">
            <button data-mood="🥰">🥰</button>
            <button data-mood="😘">😘</button>
            <button data-mood="🥺">🥺</button>
            <button data-mood="😍">😍</button>
            <button data-mood="😴">😴</button>
            <button data-mood="🔥">🔥</button>
            <button data-mood="💔">💔</button>
          </div>
          <div class="lf-mood-pair" id="lfMoodPair"></div>
        </div>

        <div class="lf-chat-body" id="lfChatBody"></div>

        <div class="lf-typing" id="lfTyping" style="display:none;">
          <span class="lf-typing-dots"><i></i><i></i><i></i></span>
          <span id="lfTypingWho">partner is typing…</span>
        </div>

        <div class="lf-chat-compose">
          <div class="lf-compose-row">
            <button class="lf-comp-btn" id="lfBtnSeal" title="Send a sealed love letter">💌</button>
            <button class="lf-comp-btn" id="lfBtnCapsule" title="Send as a time capsule">⏰</button>
            <button class="lf-comp-btn" id="lfBtnPing" title="Send a heart ping (no text)">❤</button>
          </div>
          <div class="lf-compose-input">
            <textarea id="lfChatInput" rows="1" placeholder="write something soft…" maxlength="2000"></textarea>
            <button class="lf-chat-send" id="lfChatSendBtn" aria-label="Send">➤</button>
          </div>
          <div class="lf-compose-meta" id="lfComposeMeta"></div>
        </div>
      </aside>

      <!-- ROLE PICKER -->
      <div class="lf-role-modal" id="lfRoleModal">
        <div class="lf-role-box">
          <h3>Who's on this phone? 💕</h3>
          <p>So we can tell your messages apart from your partner's. You only pick this once per device.</p>
          <div class="lf-role-choices" id="lfRoleChoices"></div>
        </div>
      </div>

      <!-- TOAST -->
      <div class="lf-chat-toast" id="lfChatToast"></div>

      <!-- AUDIO PING (data URI: tiny soft chime) -->
      <audio id="lfChatPing" preload="auto"
        src="data:audio/wav;base64,UklGRkAEAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRoEAAB/f39/f39/f39/f39/f39/f39/f39/f3+Af4F/f3+Af3+Cgn5+gIB+f4GAfn+CgX5+gIF+f4F/f3+Af3+Bf3+Af3+Af39/f39/f39/f39/f39/f39/f39/f3+Af3+Af3+Af39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f3+Af39/fwAAAAB/f39/f39/"></audio>
    `;
    document.body.appendChild(wrap);

    $('lfChatCloseBtn').onclick = closeChat;
    $('lfChatBackdrop').onclick = closeChat;
    $('lfChatSendBtn').onclick = () => sendCurrent();
    $('lfChatInput').addEventListener('input', onInputChange);
    $('lfChatInput').addEventListener('keydown', (e) => {
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendCurrent(); }
    });
    $('lfBtnSeal').onclick    = () => toggleMode('seal');
    $('lfBtnCapsule').onclick = () => toggleMode('capsule');
    $('lfBtnPing').onclick    = sendPing;

    $('lfChatMood').querySelectorAll('button[data-mood]').forEach(b => {
      b.onclick = () => setMyMood(b.dataset.mood);
    });
  }

  /* ---------- Role picker (profile-aware: reads yourName / partnerName) ---------- */
  function rolesFromProfile(){
    // Priority: explicit userProfile override > Loveflix real profiles
    const yn = window.userProfile?.yourName
            || window.__lfProfileNames?.p1
            || 'You';
    const pn = window.userProfile?.partnerName
            || window.__lfProfileNames?.p2
            || 'Partner';
    return { p1: yn, p2: pn };
  }
  /* Auto-pick role from the active profile's yourName / partnerName
     so neither of you has to tap "who's on this phone" again. */
function autoRoleFromActiveProfile(){

  const active =
    (window.activeProfile ||
     localStorage.getItem('lf_active_profile') ||
     '')
      .trim()
      .toLowerCase();

  const yourName =
    (window.userProfile?.yourName || '')
      .trim()
      .toLowerCase();

  const partnerName =
    (window.userProfile?.partnerName || '')
      .trim()
      .toLowerCase();

  if(active === yourName) return 'p1';
  if(active === partnerName) return 'p2';

  return null;
}
  function askRole(cb){
    ensureDom();
    // Skip the picker if we already know who you are from the profile screen
    const auto = autoRoleFromActiveProfile();
    if(auto){
      try{ localStorage.setItem(`lf_me_${uid}`, auto); }catch(_){}
      meRole = auto;
      cb && cb();
      return;
    }
    const names = rolesFromProfile();
    const wrap = $('lfRoleChoices');
    wrap.innerHTML = `
      <button data-r="p1"><span>${esc(names.p1)}</span></button>
      <button data-r="p2"><span>${esc(names.p2)}</span></button>
    `;
    wrap.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        const r = b.dataset.r;
        try{ localStorage.setItem(`lf_me_${uid}`, r); }catch(_){}
        meRole = r;
        $('lfRoleModal').classList.remove('open');
        cb && cb();
      };
    });
    $('lfRoleModal').classList.add('open');
  }
  function loadRole(){
    try{ meRole = localStorage.getItem(`lf_me_${uid}`); }catch(_){ meRole = null; }
    // If profile changed (e.g. switched between partners on same device),
    // override the stored role so messages get attributed correctly.
    const auto = autoRoleFromActiveProfile();
    if(auto && auto !== meRole){
      meRole = auto;
      try{ localStorage.setItem(`lf_me_${uid}`, auto); }catch(_){}
    }
    return !!meRole;
  }
  function myName(){ return rolesFromProfile()[meRole] || 'me'; }
  function otherName(){ return rolesFromProfile()[meRole === 'p1' ? 'p2' : 'p1'] || 'partner'; }
  function otherRole(){ return meRole === 'p1' ? 'p2' : 'p1'; }

  /* ---------- OS / Phone notifications ---------- */
  let notifAsked = false;
  async function ensureNotifPermission(){
    if(notifAsked) return;
    notifAsked = true;
    if(!('Notification' in window)) return;
    if(Notification.permission === 'default'){
      try{ await Notification.requestPermission(); }catch(_){}
    }
  }
  function fireOSNotification(title, body){
    try{
      if(!('Notification' in window)) return;
      if(Notification.permission !== 'granted') return;
      // Vibrate on phone (Android)
      if(navigator.vibrate) navigator.vibrate([120, 60, 120]);
      const n = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'loveflix-chat',     // collapses repeats
        renotify: true,
        vibrate: [120, 60, 120],
        silent: false
      });
      n.onclick = () => {
        try{ window.focus(); }catch(_){}
        openChat();
        n.close();
      };
      // auto-dismiss after 8s so the tray isn't flooded
      setTimeout(()=>{ try{ n.close(); }catch(_){} }, 8000);
    }catch(_){}
  }

  /* ---------- Firestore paths (shared collection per user account) ---------- */
  const msgsCol  = () => collection(db,'users',uid,'chat_messages');
  const typingD  = (r) => doc(db,'users',uid,'chat_meta','typing_'+r);
  const moodD    = (r) => doc(db,'users',uid,'chat_meta','mood_'+r+'_'+todayKey());
  const streakD  = () => doc(db,'users',uid,'chat_meta','streak');

  /* ---------- Open / close panel ---------- */
  function openChat(){
    if(!uid){
      const u = (window.__lfUid) || (window.currentUser && window.currentUser.uid) || null;
      if(u) uid = u;
    }
    if(!uid){ alert('Please sign in first ❤️'); return; }
    ensureDom();
    if(!loadRole()){ askRole(()=>openChat()); return; }
    ensureNotifPermission(); // ask once, on first real user interaction
    isPanelOpen = true; openCount = 0; stopTitleFlash();
    updateBadge();
    $('lfChatTitleText').textContent = `${myName()} ❤️ ${otherName()}`;
    $('lfChatSubtitle').textContent = `you are ${myName()}`;
    $('lfChatPanel').classList.add('open');
    $('lfChatBackdrop').classList.add('open');
    subscribe();
    // iOS Safari: unlock audio on this user gesture so future ping.play() works
    try {
      const a = document.getElementById('lfChatPing');
      if (a && !a.__lfUnlocked) {
        a.__lfUnlocked = true;
        const v = a.volume; a.volume = 0;
        a.play().then(()=>{ a.pause(); a.currentTime = 0; a.volume = v; }).catch(()=>{ a.volume = v; });
      }
    } catch(_) {}
    setTimeout(()=> { $('lfChatInput').focus(); scrollBottom(); }, 60);
  }
  function closeChat(){
    isPanelOpen = false;
    $('lfChatPanel')?.classList.remove('open');
    $('lfChatBackdrop')?.classList.remove('open');
    setTypingNow(false);
  }
  window.openChatPanel = openChat;
  window.closeChatPanel = closeChat;

  /* ---------- Subscriptions ---------- */
  function subscribe(){
    if(unsubMsgs) return; // already subscribed
    const q = query(msgsCol(), orderBy('createdAt','asc'), limit(500));
    unsubMsgs = onSnapshot(q, (snap) => {
      const arr = []; snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
      const prevLen = cachedMsgs.length;
      cachedMsgs = arr;
      renderMessages();
      // detect new partner message
      if(arr.length > prevLen){
        const last = arr[arr.length-1];
        if(last && last.senderRole && last.senderRole !== meRole){
          handleIncoming(last);
        }
      }
      updateStreakIfNeeded(arr);
    });

    // typing indicator from partner
    unsubTyping = onSnapshot(typingD(otherRole()), (d) => {
      const data = d.exists() ? d.data() : null;
      const fresh = data && data.at && (Date.now() - (data.at?.toMillis ? data.at.toMillis() : 0) < 4000);
      const t = $('lfTyping');
      if(t){
        t.style.display = fresh ? 'flex' : 'none';
        $('lfTypingWho').textContent = `${otherName()} is typing…`;
      }
    });

    // mood (today)
    unsubMeta = onSnapshot(moodD(otherRole()), (d) => renderMoodPair(d.exists() ? d.data() : null));
  }

  /* ---------- Rendering ---------- */
  function renderMessages(){
    const body = $('lfChatBody');
    if(!body) return;
    body.innerHTML = '';
    let lastDay = '';
    cachedMsgs.forEach(m => {
      const when = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
      const day = when.toLocaleDateString();
      if(day !== lastDay){
        const sep = document.createElement('div'); sep.className='lf-chat-day'; sep.textContent = day;
        body.appendChild(sep); lastDay = day;
      }
      body.appendChild(renderMsg(m, when));
    });
    scrollBottom();
  }
  function renderMsg(m, when){
    const mine = m.senderRole === meRole;
    const div = document.createElement('div');
    div.className = `lf-msg ${mine ? 'mine' : 'theirs'} t-${m.type || 'text'}`;
    const who = mine ? myName() : otherName();
    const time = when.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

    if(m.type === 'ping'){
      div.innerHTML = `<div class="lf-ping">❤</div><span class="lf-msg-meta">${esc(who)} · ${time}</span>`;
      return div;
    }
    if(m.type === 'capsule'){
      const unlockAt = m.unlockAt?.toDate ? m.unlockAt.toDate() : new Date(m.unlockAtMs || 0);
      const locked = Date.now() < unlockAt.getTime();
      div.innerHTML = `
        <div class="lf-bubble lf-capsule ${locked?'locked':'open'}">
          ${locked ? `<div class="lf-cap-ico">⏰</div>
            <div class="lf-cap-text">Time capsule from <strong>${esc(who)}</strong></div>
            <div class="lf-cap-when">unlocks ${unlockAt.toLocaleString()}</div>` :
            `<div class="lf-cap-ico">✨</div>
             <div class="lf-cap-text">${esc(m.text||'')}</div>
             <div class="lf-cap-when">opened · sent ${time}</div>`}
        </div>
        <span class="lf-msg-meta">${esc(who)} · ${time}</span>`;
      return div;
    }
    if(m.type === 'seal'){
      const opened = !!m.openedBy?.[meRole];
      div.innerHTML = `
        <div class="lf-bubble lf-seal ${opened?'opened':''}" data-id="${esc(m.id)}">
          ${opened ? `<div class="lf-seal-text">${esc(m.text||'')}</div>` :
            `<div class="lf-seal-wax">💌</div>
             <div class="lf-seal-hint">a sealed letter from <strong>${esc(who)}</strong> — tap to open</div>`}
        </div>
        <span class="lf-msg-meta">${esc(who)} · ${time}</span>`;
      if(!opened){
        div.querySelector('.lf-seal').onclick = () => openSeal(m.id);
      }
      return div;
    }
    // plain text
    div.innerHTML = `<div class="lf-bubble"><div class="lf-msg-text">${esc(m.text||'')}</div></div>
      <span class="lf-msg-meta">${esc(who)} · ${time}</span>`;
    return div;
  }
  function scrollBottom(){
    const body = $('lfChatBody'); if(body) body.scrollTop = body.scrollHeight;
  }

  /* ---------- Composer modes ---------- */
  let composeMode = 'text';
  function toggleMode(m){
    composeMode = (composeMode === m) ? 'text' : m;
    const meta = $('lfComposeMeta');
    $('lfBtnSeal').classList.toggle('active', composeMode==='seal');
    $('lfBtnCapsule').classList.toggle('active', composeMode==='capsule');
    if(composeMode === 'seal') meta.innerHTML = `💌 <em>Sealed letter</em> — partner will see a closed envelope they tap to open.`;
    else if(composeMode === 'capsule'){
      meta.innerHTML = `⏰ <em>Time capsule</em> unlocks on:
        <input type="datetime-local" id="lfCapWhen" style="margin-left:6px;">`;
      setTimeout(() => {
        const dt = new Date(Date.now() + 24*3600*1000);
        const v = dt.toISOString().slice(0,16);
        const el = $('lfCapWhen'); if(el) el.value = v;
      }, 10);
    } else meta.innerHTML = '';
  }

  /* ---------- Send ---------- */
  async function sendCurrent(){
    const ta = $('lfChatInput');
    const text = (ta.value || '').trim();
    if(!text) return;
    const payload = {
      senderRole: meRole,
      senderName: myName(),
      text,
      type: composeMode === 'capsule' ? 'capsule' : composeMode === 'seal' ? 'seal' : 'text',
      createdAt: serverTimestamp()
    };
    if(composeMode === 'capsule'){
      const w = $('lfCapWhen')?.value;
      const when = w ? new Date(w) : new Date(Date.now() + 24*3600*1000);
      payload.unlockAt = when;
      payload.unlockAtMs = when.getTime();
    }
    if(composeMode === 'seal'){
      payload.openedBy = {};
    }
    ta.value = ''; ta.style.height='auto';
    setTypingNow(false);
    composeMode = 'text';
    toggleMode('text'); // reset UI
    try{ await addDoc(msgsCol(), payload); }
    catch(e){ console.error('send failed', e); alert('Send failed — check your connection.'); }
  }
  async function sendPing(){
    if(!uid || !meRole) return;
    try{
      await addDoc(msgsCol(), {
        senderRole: meRole, senderName: myName(),
        type: 'ping', createdAt: serverTimestamp()
      });
    }catch(e){ console.error(e); }
  }
  async function openSeal(id){
    try{
      await updateDoc(doc(db,'users',uid,'chat_messages',id), {
        [`openedBy.${meRole}`]: Date.now()
      });
    }catch(e){ console.error(e); }
  }

  /* ---------- Typing ---------- */
  function onInputChange(e){
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
    setTypingNow(true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => setTypingNow(false), 2500);
  }
  let lastTypingWrite = 0;
  async function setTypingNow(active){
    if(!uid || !meRole) return;
    const now = Date.now();
    if(active && now - lastTypingWrite < 1500) return; // throttle
    lastTypingWrite = now;
    try{
      await setDoc(typingD(meRole), {
        at: active ? serverTimestamp() : null,
        active
      }, { merge:true });
    }catch(_){}
  }

  /* ---------- Mood ---------- */
  async function setMyMood(emoji){
    if(!uid || !meRole) return;
    try{
      await setDoc(moodD(meRole), { mood: emoji, at: serverTimestamp(), role: meRole }, { merge:true });
      renderMoodPair({ mood: emoji });
    }catch(_){}
  }
  async function renderMoodPair(otherMood){
    const el = $('lfMoodPair'); if(!el) return;
    let mineMood = '–';
    try{
      const s = await getDoc(moodD(meRole));
      if(s.exists()) mineMood = s.data().mood || '–';
    }catch(_){}
    const them = otherMood?.mood || '–';
    el.innerHTML = `<span><b>${esc(myName())}:</b> ${mineMood}</span> <span><b>${esc(otherName())}:</b> ${them}</span>`;
  }

  /* ---------- Streak (both messaged today = +1) ---------- */
  async function updateStreakIfNeeded(arr){
    try{
      const today = todayKey();
      const todays = arr.filter(m => {
        const d = m.createdAt?.toDate ? m.createdAt.toDate() : null;
        if(!d) return false;
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === today;
      });
      const roles = new Set(todays.map(m => m.senderRole));
      const both = roles.has('p1') && roles.has('p2');
      const snap = await getDoc(streakD());
      const cur = snap.exists() ? snap.data() : { count:0, lastDay:'' };
      if(both && cur.lastDay !== today){
        const yest = new Date(); yest.setDate(yest.getDate()-1);
        const yestKey = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
        const newCount = (cur.lastDay === yestKey) ? (cur.count||0)+1 : 1;
        await setDoc(streakD(), { count: newCount, lastDay: today }, { merge:true });
        $('lfChatStreak').textContent = `🔥 ${newCount}`;
      } else {
        $('lfChatStreak').textContent = `🔥 ${cur.count || 0}`;
      }
    }catch(_){}
  }

  /* ---------- Incoming notification ---------- */
  function handleIncoming(m){
    // sound (only if tab is visible — otherwise the OS notification handles sound)
    if(!document.hidden){
      try{ const a = $('lfChatPing'); if(a){ a.currentTime = 0; a.play().catch(()=>{}); } }catch(_){}
    }
    const who = m.senderName || otherName();
    const preview = m.type === 'ping' ? '❤ sent you a heart'
                  : m.type === 'seal' ? '💌 sent you a sealed letter'
                  : m.type === 'capsule' ? '⏰ sent you a time capsule'
                  : (m.text || '').slice(0, 140);

    // Fire real OS notification whenever the panel is closed OR the tab is hidden.
    // This is what makes the phone buzz + show a tray notification.
    if(!isPanelOpen || document.hidden){
      fireOSNotification(`${who} ❤️`, preview);
    }
    if(!isPanelOpen){
      openCount++; updateBadge();
      startTitleFlash();
      toast(`${esc(who)}: ${esc(preview)}`);
    }
  }
  function toast(html){
    const t = $('lfChatToast'); if(!t) return;
    t.innerHTML = html; t.classList.add('show');
    clearTimeout(t.__h); t.__h = setTimeout(()=>t.classList.remove('show'), 4200);
    t.onclick = openChat;
  }
  function startTitleFlash(){
    if(titleFlashIv) return;
    let on = false;
    titleFlashIv = setInterval(() => {
      document.title = on ? origTitle : '💌 New message ❤️';
      on = !on;
    }, 1100);
  }
  function stopTitleFlash(){
    if(titleFlashIv){ clearInterval(titleFlashIv); titleFlashIv = null; document.title = origTitle; }
  }
  function updateBadge(){
    const b = document.getElementById('lfChatNavBadge');
    if(b){ b.textContent = openCount > 0 ? openCount : ''; b.style.display = openCount > 0 ? 'inline-flex' : 'none'; }
  }

  /* ---------- Init: wait for auth ----------
     Reads whichever global the host app exposes:
       - window.__lfUid  (set by app.js onAuthStateChanged)
       - window.currentUser?.uid  (legacy)
     This prevents the "Please sign in first" false-negative
     that happened when only __lfUid was set. */
  function getActiveUid(){
    return (window.__lfUid) ||
           (window.currentUser && window.currentUser.uid) ||
           null;
  }
  function tryInit(){
    const activeUid = getActiveUid();
    if(activeUid && uid !== activeUid){
      uid = activeUid;
      // start a background subscription so notifications arrive even when panel closed
      ensureDom();
      if(loadRole()){ subscribe(); }
    }
    if(!activeUid){
      // teardown if signed out
      if(unsubMsgs){ unsubMsgs(); unsubMsgs=null; }
      if(unsubTyping){ unsubTyping(); unsubTyping=null; }
      if(unsubMeta){ unsubMeta(); unsubMeta=null; }
      uid = null; meRole = null; cachedMsgs = [];
    }
  }
  setInterval(tryInit, 800);
  document.addEventListener('DOMContentLoaded', () => { origTitle = document.title; tryInit(); });
})();
