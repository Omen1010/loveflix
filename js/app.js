import {
  db, collection, addDoc, getDocs, query,
  doc, deleteDoc, updateDoc
} from "./firebase.js";

/* =========================
   STATE
========================= */
let memories = [];
let currentMemory = null;
let currentImages = [];
let currentIndex = 0;
let currentMode = "image";
let recentMemories   = JSON.parse(localStorage.getItem("loveflix_recent"))     || [];
let favoriteMemories = JSON.parse(localStorage.getItem("loveflix_favorites"))  || [];
let favoriteVideos   = JSON.parse(localStorage.getItem("loveflix_fav_videos")) || [];

/* =========================
   PROFILE SYSTEM
========================= */
const PRIVATE_PROFILES = ["Omen", "Budhdhu"];
let currentProfile = sessionStorage.getItem("loveflix_profile") || null;

function applyProfile(profile){
  currentProfile = profile;
  sessionStorage.setItem("loveflix_profile", profile);
  const badge   = document.getElementById("profileBadge");
  const vaultBtn= document.getElementById("privateVaultBtn");
  const navbar  = document.getElementById("navbar");
  if(badge)    badge.textContent = profile;
  if(vaultBtn) vaultBtn.style.display = PRIVATE_PROFILES.includes(profile) ? "inline-block" : "none";
  if(navbar)  { navbar.style.opacity = "1"; navbar.style.pointerEvents = "all"; }
}

window.selectProfile = function(profile){
  const ps = document.getElementById("profileScreen");
  ps.style.transition = "opacity 0.5s ease, transform 0.5s ease";
  ps.style.opacity    = "0";
  ps.style.transform  = "scale(1.04)";
  setTimeout(async ()=>{
    ps.style.display = "none";
    applyProfile(profile);
    await refreshApp();
    document.getElementById("homeScreen").style.display = "block";
    renderDynamicTimeline();
    initTimelineCord();
  }, 500);
};

window.switchProfile = function(){
  sessionStorage.removeItem("loveflix_profile");
  currentProfile = null;
  document.getElementById("homeScreen").style.display   = "none";
  document.getElementById("memoryScreen").style.display = "none";
  const navbar = document.getElementById("navbar");
  if(navbar){ navbar.style.opacity = "0"; navbar.style.pointerEvents = "none"; }
  const ps = document.getElementById("profileScreen");
  ps.style.opacity   = "0";
  ps.style.transform = "scale(0.97)";
  ps.style.display   = "flex";
  requestAnimationFrame(()=>{
    ps.style.transition = "opacity 0.45s ease, transform 0.45s ease";
    ps.style.opacity    = "1";
    ps.style.transform  = "scale(1)";
  });
};

/* =========================
   UPLOAD PROGRESS UI
========================= */
function showUploadProgress(label){
  let ov = document.getElementById("uploadOverlay");
  if(!ov){
    ov = document.createElement("div");
    ov.id = "uploadOverlay";
    ov.innerHTML = `
      <div class="upload-inner">
        <div class="upload-spinner"></div>
        <div class="upload-label" id="uploadLabel">Uploading...</div>
        <div class="upload-bar-wrap"><div class="upload-bar-fill" id="uploadBarFill"></div></div>
        <div class="upload-pct" id="uploadPct">0%</div>
      </div>`;
    document.body.appendChild(ov);
    if(!document.getElementById("uploadOverlayStyles")){
      const s = document.createElement("style");
      s.id = "uploadOverlayStyles";
      s.textContent = `
        #uploadOverlay{position:fixed;inset:0;background:rgba(0,0,0,0.82);backdrop-filter:blur(16px);
          display:flex;justify-content:center;align-items:center;z-index:99999999;animation:uploadFadeIn 0.3s ease;}
        @keyframes uploadFadeIn{from{opacity:0;}to{opacity:1;}}
        .upload-inner{display:flex;flex-direction:column;align-items:center;gap:16px;padding:44px 52px;
          background:linear-gradient(135deg,rgba(15,0,5,0.97),rgba(5,0,15,0.97));
          border:1px solid rgba(255,0,60,0.28);border-radius:24px;
          box-shadow:0 40px 100px rgba(255,0,60,0.18);min-width:300px;text-align:center;}
        .upload-spinner{width:50px;height:50px;border-radius:50%;
          border:3px solid rgba(255,0,60,0.14);border-top-color:#ff003c;
          animation:uploadSpin 0.8s linear infinite;}
        @keyframes uploadSpin{to{transform:rotate(360deg);}}
        .upload-label{color:#ffb3c1;font-size:0.95rem;letter-spacing:1px;font-style:italic;}
        .upload-bar-wrap{width:240px;height:4px;background:rgba(255,255,255,0.06);border-radius:10px;overflow:hidden;}
        .upload-bar-fill{height:100%;width:0%;background:linear-gradient(90deg,#ff003c,#ff6b9d);
          border-radius:10px;transition:width 0.22s ease;box-shadow:0 0 10px rgba(255,0,60,0.65);}
        .upload-pct{color:#ff6b9d;font-size:0.82rem;letter-spacing:2px;}`;
      document.head.appendChild(s);
    }
  }
  ov.style.display = "flex";
  setUploadProgress(0, label || "Uploading...");
}

function setUploadProgress(pct, label){
  const fill  = document.getElementById("uploadBarFill");
  const pctEl = document.getElementById("uploadPct");
  const lblEl = document.getElementById("uploadLabel");
  if(fill)  fill.style.width      = `${Math.min(pct,100)}%`;
  if(pctEl) pctEl.textContent     = `${Math.round(Math.min(pct,100))}%`;
  if(lblEl && label) lblEl.textContent = label;
}

function hideUploadProgress(){
  const ov = document.getElementById("uploadOverlay");
  if(!ov) return;
  ov.style.transition = "opacity 0.38s ease";
  ov.style.opacity    = "0";
  setTimeout(()=>{ ov.style.display = "none"; ov.style.opacity = "1"; }, 400);
}

/* =========================
   CLOUDINARY UPLOAD
========================= */
const CLOUDINARY_CLOUD  = "demdwlyct";
const CLOUDINARY_PRESET = "loveflix_uploads";
const CHUNK_SIZE        = 50 * 1024 * 1024; // 50MB

function uploadToCloudinary(file, onProgress){
  return new Promise((resolve, reject)=>{
    if(file.size <= 100 * 1024 * 1024){
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", CLOUDINARY_PRESET);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`);
      xhr.upload.onprogress = e => { if(e.lengthComputable && onProgress) onProgress((e.loaded/e.total)*100); };
      xhr.onload = ()=>{
        try{
          const d = JSON.parse(xhr.responseText);
          if(xhr.status === 200 && d.secure_url) resolve(d);
          else reject(new Error(d.error?.message || "Upload failed"));
        }catch(e){ reject(e); }
      };
      xhr.onerror = ()=> reject(new Error("Network error"));
      xhr.send(fd);
    } else {
      uploadChunked(file, onProgress).then(resolve).catch(reject);
    }
  });
}

async function uploadChunked(file, onProgress){
  const uid = `loveflix_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  const total = Math.ceil(file.size / CHUNK_SIZE);
  let finalData = null;
  for(let i = 0; i < total; i++){
    const start = i * CHUNK_SIZE;
    const end   = Math.min(start + CHUNK_SIZE, file.size);
    const fd = new FormData();
    fd.append("file", file.slice(start, end));
    fd.append("upload_preset", CLOUDINARY_PRESET);
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`, {
      method: "POST",
      headers: { "X-Unique-Upload-Id": uid, "Content-Range": `bytes ${start}-${end-1}/${file.size}` },
      body: fd
    });
    const text = await res.text();
    if(onProgress) onProgress(((i+1)/total)*100);
    if(res.status === 200){
      try{ finalData = JSON.parse(text); }catch(e){ throw new Error("Bad response"); }
    } else if(res.status !== 206){
      let msg = `Chunk ${i+1} failed (${res.status})`;
      try{ msg = JSON.parse(text)?.error?.message || msg; }catch(_){}
      throw new Error(msg);
    }
  }
  if(!finalData?.secure_url) throw new Error("Chunked upload: no URL returned");
  return finalData;
}

/* =========================
   LOAD MEMORIES
========================= */
async function loadMemories(){
  try{
    memories = [];
    const snap = await getDocs(query(collection(db,"memories")));
    snap.forEach(ds=>{
      const d = ds.data();
      d.docId = ds.id;
      if(!d.images)        d.images        = [];
      if(!d.videos)        d.videos        = [];
      if(!d.opens)         d.opens         = 0;
      if(!d.favoriteCount) d.favoriteCount = 0;
      memories.push(d);
    });
  }catch(e){ console.log(e); }
}

/* =========================
   START
========================= */
window.addEventListener("DOMContentLoaded", async ()=>{
  // Splash takes 3s, then show profile or home
  setTimeout(async ()=>{
    const splash = document.getElementById("netflixSplash");
    if(splash) splash.style.display = "none";

    if(currentProfile){
      applyProfile(currentProfile);
      await refreshApp();
      document.getElementById("homeScreen").style.display = "block";
    } else {
      const ps = document.getElementById("profileScreen");
      ps.style.opacity   = "0";
      ps.style.transform = "scale(0.96)";
      ps.style.display   = "flex";
      requestAnimationFrame(()=>{
        ps.style.transition = "opacity 0.55s ease, transform 0.55s ease";
        ps.style.opacity    = "1";
        ps.style.transform  = "scale(1)";
      });
    }
  }, 3100);

  // Init non-blocking systems
  initCursor();
  initParticles();
  initNavbarScroll();
  initScrollReveal();

  // Timeline renders as soon as DOM ready (doesn't need memories)
  setTimeout(()=>{
    renderDynamicTimeline();
    initTimelineCord();
  }, 80);
});

/* =========================
   REFRESH
========================= */
async function refreshApp(){
  await loadMemories();
  generateRows();
  generateContinueWatching();
  generateFavorites();
  // Update hero memory count
  setTimeout(()=>{
    const el = document.getElementById("heroStatMemories");
    if(el) animateCounter(el, memories.length, 700);
  }, 200);
}

/* =========================
   HOME / NAV
========================= */
window.showHome = function(){
  const home   = document.getElementById("homeScreen");
  const memory = document.getElementById("memoryScreen");
  if(home)   home.style.display   = "block";
  if(memory) memory.style.display = "none";
};

window.scrollToRows = function(){
  const rows = document.getElementById("rows");
  if(rows) rows.scrollIntoView({ behavior:"smooth" });
};

/* =========================
   HERO RIPPLE
========================= */
window.addHeroRipple = function(e){
  const btn    = e.currentTarget;
  const ripple = document.createElement("span");
  ripple.className = "btn-ripple";
  const size   = Math.max(btn.offsetWidth, btn.offsetHeight) * 2;
  const rect   = btn.getBoundingClientRect();
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;`;
  btn.appendChild(ripple);
  setTimeout(()=> ripple.remove(), 700);
};

/* =========================
   COUNTER ANIMATION
========================= */
function animateCounter(el, target, duration){
  let n = 0;
  const step = target / (duration / 16);
  const tick = ()=>{
    n += step;
    if(n >= target){ el.textContent = target; return; }
    el.textContent = Math.floor(n);
    requestAnimationFrame(tick);
  };
  tick();
}

/* =========================
   CURSOR
========================= */
function initCursor(){
  const cursor = document.getElementById("customCursor");
  const ring   = document.getElementById("customCursorRing");
  if(!cursor || !ring || window.matchMedia("(hover:none)").matches) return;

  let mx=0, my=0, rx=0, ry=0;

  document.addEventListener("mousemove", e=>{
    mx = e.clientX; my = e.clientY;
    cursor.style.left = mx+"px";
    cursor.style.top  = my+"px";
  }, { passive:true });

  const animRing = ()=>{
    rx += (mx-rx) * 0.12;
    ry += (my-ry) * 0.12;
    ring.style.left = rx+"px";
    ring.style.top  = ry+"px";
    requestAnimationFrame(animRing);
  };
  animRing();

  document.addEventListener("mouseover", e=>{
    const isHoverable = e.target.closest("button, a, .card, .game-card, .timeline-item, .profile-card");
    ring.style.width       = isHoverable ? "52px" : "36px";
    ring.style.height      = isHoverable ? "52px" : "36px";
    ring.style.borderColor = isHoverable ? "rgba(255,0,60,0.8)" : "rgba(255,0,60,0.5)";
  }, { passive:true });

  document.addEventListener("mousedown", ()=>{ cursor.style.transform = "translate(-50%,-50%) scale(0.6)"; });
  document.addEventListener("mouseup",   ()=>{ cursor.style.transform = "translate(-50%,-50%) scale(1)"; });
}

/* =========================
   PARTICLES (lightweight — only 12)
========================= */
function initParticles(){
  const container = document.getElementById("heroParticles");
  if(!container) return;
  const spawn = ()=>{
    const p = document.createElement("div");
    p.className = "hero-particle";
    const size = 2 + Math.random()*3;
    const dur  = 8 + Math.random()*9;
    p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;animation-duration:${dur}s;animation-delay:${Math.random()*4}s;opacity:${0.25+Math.random()*0.4};`;
    container.appendChild(p);
    setTimeout(()=> p.remove(), (dur+4)*1000);
  };
  for(let i=0;i<12;i++) spawn();
  setInterval(spawn, 1200);
}

/* =========================
   NAVBAR SCROLL
========================= */
function initNavbarScroll(){
  const navbar = document.getElementById("navbar");
  if(!navbar) return;
  window.addEventListener("scroll", ()=>{
    navbar.classList.toggle("scrolled", window.scrollY > 55);
  }, { passive:true });
}

/* =========================
   SCROLL REVEAL
========================= */
function initScrollReveal(){
  const io = new IntersectionObserver((entries)=>{
    entries.forEach((entry, i)=>{
      if(entry.isIntersecting){
        setTimeout(()=> entry.target.classList.add("revealed"), i*70);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  const observe = ()=> document.querySelectorAll(".reveal-on-scroll:not(.revealed)").forEach(el=> io.observe(el));
  observe();
  setTimeout(observe, 3500);
}

/* =========================
   TIMELINE — RELATIONSHIP DATA
========================= */
const REL_START = new Date("2024-10-27T00:00:00");

function getRelDuration(){
  const ms   = new Date() - REL_START;
  const days  = Math.floor(ms / 86400000);
  const years = Math.floor(days / 365);
  const months= Math.floor((days % 365) / 30);
  const rem   = days % 30;
  const parts = [];
  if(years)  parts.push(`${years} year${years>1?"s":""}`);
  if(months) parts.push(`${months} month${months>1?"s":""}`);
  if(rem || !parts.length) parts.push(`${rem} day${rem!==1?"s":""}`);
  return parts.join(", ");
}

function buildMilestones(){
  const addM = (d,m)=>{ const r=new Date(d); r.setMonth(r.getMonth()+m); return r; };
  const addY = (d,y)=>{ const r=new Date(d); r.setFullYear(r.getFullYear()+y); return r; };

  const ms = [];

  // Fixed early milestones
  ms.push({ unlockDate:REL_START,           year:"2024", title:"We Found Trouble ❤️",            desc:"Two strangers becoming dangerously attached. The beginning of an addiction neither of us wanted to escape.", secret:"You walked in and ruined every standard I ever had. Completely. Irreversibly. And I'd let you do it again.", gameIndex:0 });
  ms.push({ unlockDate:addM(REL_START,1),   year:"2024", title:"The First Time We Met 🌙",       desc:"The nervous tension. The first touch. The first time wanting someone that intensely.", secret:"I remember thinking — this is going to be dangerous. And then choosing you anyway. Every single time after that.", gameIndex:1 });
  ms.push({ unlockDate:addM(REL_START,6),   year:"2025", title:"Six Months Deep 🔥",             desc:"Half a year in. Still completely consumed. Late nights, rough love, soft moments after.", secret:"Late nights where I forgot where I ended and you began. Messy, tangled, completely lost in you — the best kind of lost.", gameIndex:2 });

  // Yearly milestones
  const yearlyData = [
    { title:"One Year ❤️",              desc:"A whole year of choosing each other. Of surviving every season together. Still obsessed.",                  secret:"One year and I still reach for you first. In the dark. In every quiet moment that belongs only to us.",                             gameIndex:3 },
    { title:"Two Years — Still Starving ❤️", desc:"Still obsessed. Still attached. Still wanting you in every possible way.",                          secret:"Two years and the craving only got worse. That's not a problem. That's just what we are.",                                        gameIndex:4 },
    { title:"Three Years of Beautiful Chaos 🌹", desc:"Three years of dangerously loving each other.",                                                  secret:"Three years down and I still don't have the words for what this is. I just know I'm not done.",                                   gameIndex:0 },
    { title:"Four Years — Irreversibly Yours ❤️", desc:"Four years. Four versions of us. Every one of them worth it.",                                   secret:"Four years and every argument, every soft night made me more certain. It's you.",                                                gameIndex:1 },
    { title:"Five Years — Half a Decade 🔥", desc:"Half a decade of choosing the same person.",                                                          secret:"Five years. I'd do every single day again. Even the hard ones. Especially the hard ones.",                                        gameIndex:2 },
    { title:"Six Years Deep 💌",          desc:"Six years of secrets, inside jokes, and a love that keeps getting more complicated in the best way.",     secret:"Six years and you still surprise me. That's not something that happens to just anyone.",                                        gameIndex:3 },
    { title:"Seven Years — Still Addicted 🌙", desc:"Seven years of being each other's most dangerous comfort zone.",                                   secret:"Seven years and this addiction shows no signs of fading. I've stopped wanting it to.",                                           gameIndex:4 },
    { title:"Eight Years — Written In Everything 🔥", desc:"Eight years woven into each other so deeply neither could tell where one ends.",             secret:"Eight years and I still can't explain you to anyone who asks. Some things aren't meant to be explained.",                       gameIndex:0 },
    { title:"Nine Years — Almost A Decade ❤️", desc:"Almost ten years of this. Of us. Of the specific chaos only we could build.",                      secret:"Nine years in and I love you with the same hunger I had at the start. More, actually.",                                          gameIndex:1 },
    { title:"Ten Years — A Whole Decade ❤️‍🔥", desc:"Ten years. A full decade of choosing each other every single day.",                               secret:"Ten years and this still doesn't feel like enough time. That's the most romantic thing I've ever admitted.",                    gameIndex:2 },
  ];

  for(let y=1; y<=10; y++){
    const d = addY(REL_START,y);
    const data = yearlyData[y-1] || { title:`${y} Years Together ❤️`, desc:`${y} years of choosing each other.`, secret:`${y} years and I still don't have the right word for what you are to me.`, gameIndex:y%5 };
    ms.push({ unlockDate:d, year:d.getFullYear().toString(), ...data });
  }

  // Birthday (September 23 — adjust day/month here if needed)
  const BDAY_MONTH = 8; // 0-indexed: 8 = September
  const BDAY_DAY   = 23;
  const now = new Date();
  let byear = now.getFullYear();
  if(new Date(byear, BDAY_MONTH, BDAY_DAY) < REL_START) byear++;
  for(let i=0; i<8; i++){
    const bday = new Date(byear+i, BDAY_MONTH, BDAY_DAY);
    if(bday >= REL_START){
      ms.push({ unlockDate:bday, year:(byear+i).toString(), title:"Happy Birthday, Baby 🎂", desc:`Another year of you. Another year of us getting more impossible to explain.`, secret:`Happy birthday to the person who made me believe some addictions are worth keeping. I'd choose this chaos — with you — every time.`, gameIndex:4, isBirthday:true });
    }
  }

  return ms.sort((a,b)=> a.unlockDate - b.unlockDate);
}

/* =========================
   RENDER DYNAMIC TIMELINE
   KEY CHANGE: Only shows unlocked milestones + the SINGLE next locked one
========================= */
function renderDynamicTimeline(){
  const container = document.getElementById("dynamicTimeline");
  if(!container) return;

  const cord = container.querySelector(".timeline-cord");
  container.innerHTML = "";
  if(cord) container.appendChild(cord);

  const milestones = buildMilestones();
  const now        = new Date();
  const SOON_MS    = 60 * 86400000; // 60 days
  const WEEK_MS    = 7  * 86400000;

  // Split into unlocked and future
  const unlocked = milestones.filter(m => m.unlockDate <= now);
  const future   = milestones.filter(m => m.unlockDate >  now);

  // Render all unlocked milestones
  unlocked.forEach((m, i) => {
    const isNew = (now - m.unlockDate) <= WEEK_MS;
    container.appendChild(buildTimelineItem(m, "unlocked", isNew));
  });

  // Render ONLY the next locked milestone (the immediately upcoming one)
  if(future.length > 0){
    const next    = future[0];
    const isSoon  = (next.unlockDate - now) <= SOON_MS;
    const state   = isSoon ? "soon" : "locked";
    container.appendChild(buildTimelineItem(next, state, false));
  }

  // Update duration badge
  const badge = document.getElementById("relDurationText");
  if(badge) badge.textContent = getRelDuration();
}

function buildTimelineItem(m, state, isNewlyUnlocked){
  const item = document.createElement("div");
  const now  = new Date();

  const classes = ["timeline-item"];
  if(state === "locked") classes.push("locked");
  if(state === "soon")   classes.push("unlocking-soon");
  if(isNewlyUnlocked)    classes.push("newly-unlocked");
  item.className = classes.join(" ");

  if(state === "unlocked"){
    item.onclick = function(){ expandTimeline(this); };
  }

  const unlockStr = m.unlockDate.toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" });

  let inner = `<div class="timeline-dot"></div><div class="timeline-content">`;
  inner += `<div class="timeline-year">${m.year}</div>`;

  if(state === "locked"){
    inner += `<h3>🔒 Coming Soon</h3><p>This chapter hasn't been written yet. But it's already yours.</p>`;
    inner += `<span class="locked-hint">unlocks ${unlockStr}</span>`;
  } else if(state === "soon"){
    inner += `<h3>${m.title}</h3><p>${m.desc}</p>`;
    inner += `<span class="unlocking-hint">✦ unlocking ${unlockStr}</span>`;
  } else {
    inner += `<h3>${m.title}</h3><p>${m.desc}</p>`;
    if(m.secret){
      inner += `
        <div class="timeline-expand-card">
          <p class="timeline-secret">${m.secret}</p>
          <div class="timeline-game-btn" onclick="event.stopPropagation(); startTimelineGame(${m.gameIndex})">
            💌 Unlock the secret
          </div>
        </div>`;
    }
  }

  inner += `</div>`;
  item.innerHTML = inner;
  return item;
}

/* =========================
   TIMELINE CORD (scroll-linked)
========================= */
function initTimelineCord(){
  const fill     = document.getElementById("timelineCordFill");
  const bead     = document.getElementById("timelineCordBead");
  const timeline = document.getElementById("dynamicTimeline");
  if(!fill || !bead || !timeline) return;

  const update = ()=>{
    const rect = timeline.getBoundingClientRect();
    let pct = ((window.innerHeight - rect.top) / timeline.offsetHeight) * 100;
    pct = Math.max(0, Math.min(100, pct));
    fill.style.height = pct + "%";
    bead.style.top    = pct + "%";
  };

  window.addEventListener("scroll", update, { passive:true });
  update();
}

/* =========================
   TIMELINE EXPAND
========================= */
window.expandTimeline = function(item){
  const was = item.classList.contains("expanded");
  document.querySelectorAll(".timeline-item.expanded").forEach(el=>{ if(el!==item) el.classList.remove("expanded"); });
  item.classList.toggle("expanded", !was);
  if(!was) setTimeout(()=> item.scrollIntoView({ behavior:"smooth", block:"nearest" }), 100);
};

/* =========================
   TIMELINE GAME
========================= */
const timelineGames = [
  { question:"When we first talked — what did you actually feel about me?",
    choices:["Honestly? A little scared of you","Something I couldn't name or explain","Like I already knew you somehow","That you were going to ruin me"],
    reactions:[
      { text:"Good. Fear means I was already under your skin before you even realized it. That's exactly where I wanted to be. ❤️", anim:"sparks" },
      { text:"That feeling with no name? That was you recognizing me before your brain caught up. I felt it too. 🌙", anim:"typewriter" },
      { text:"You felt it too. We were already written long before we started. Some things aren't accidents. ❤️", anim:"glow" },
      { text:"I did ruin you. And you're still right here. That tells me everything I ever needed to know. 🔥", anim:"hearts" }
    ]
  },
  { question:"What do you think I noticed first about you?",
    choices:["How hard I was trying to hide my feelings","How quietly intense I am beneath everything","That I was already in trouble the moment I saw you","Everything. All at once. Like a collision."],
    reactions:[
      { text:"You were terrible at hiding it. Every single time your eyes said more than you wanted. And I loved watching you try. ❤️", anim:"pulse" },
      { text:"That quiet intensity underneath everything — that's what got me. It still gets me. Every single time I look at you. 🌙", anim:"typewriter" },
      { text:"You walked in looking like someone who was already mine. You just hadn't heard the news yet. 🔥", anim:"sparks" },
      { text:"Everything. All of it hit me at once. And every single thing made me want to get closer. ❤️", anim:"hearts" }
    ]
  },
  { question:"Those late nights with me — what did they actually feel like?",
    choices:["Like time didn't exist and we were the only ones left","Like I was slowly losing myself in you","Like the safest place I had ever been","Like an addiction I never wanted to quit"],
    reactions:[
      { text:"Time stopped because it knew — nothing more important was happening anywhere else in the world that night. ❤️", anim:"glow" },
      { text:"Good. Because I was never planning on giving you back to yourself. You were mine the moment you let me in. 🔥", anim:"sparks" },
      { text:"You still are. No matter what. I will always be the place where you can fall apart and still be safe. ❤️", anim:"hearts" },
      { text:"Then we match. Because letting go of you was never a thought I could even finish having. 🌙", anim:"typewriter" }
    ]
  },
  { question:"Right now — what does thinking about me feel like?",
    choices:["Warmth. Just this deep, quiet warmth.","Like missing someone who's right here with me","Like I can't quite breathe the normal way","Like coming home to somewhere I never want to leave"],
    reactions:[
      { text:"That warmth is me. It lives in your chest now. It was always going to end up there. ❤️", anim:"glow" },
      { text:"That ache you feel even when I'm close — that's love doing what it does. Making distance impossible. 🌙", anim:"typewriter" },
      { text:"Breathe, baby. I'm right here. I'm not going anywhere. Not now, not ever. ❤️", anim:"hearts" },
      { text:"Home. That single word is everything I ever wanted you to feel about me. 🔥", anim:"pulse" }
    ]
  },
  { question:"Two years of us. What would you actually call what we have?",
    choices:["Something I still can't put into words","The most real thing I have ever known","Beautiful chaos that somehow feels like peace","Mine. Just completely mine."],
    reactions:[
      { text:"Words were never going to be big enough for this anyway. Just feel it — that's the only place it fully exists. ❤️", anim:"typewriter" },
      { text:"The most real thing I have ever known too. And I have never once wanted an escape from it. 🔥", anim:"sparks" },
      { text:"Our chaos. The kind that only makes sense to us. And that's exactly how I want it to stay. 🌙", anim:"hearts" },
      { text:"Mine. You are mine. Happy birthday, baby. Two years down — and this is still just the beginning. ❤️", anim:"pulse" }
    ]
  }
];

window.startTimelineGame = function(index){
  const game = timelineGames[index];
  if(!game) return;
  const modal   = document.getElementById("timelineGameModal");
  const content = document.getElementById("tgmContent");

  content.innerHTML = `
    <h2>❤️ Omen is asking...</h2>
    <p>${game.question}</p>
    <div class="tgm-choice-grid">
      ${game.choices.map((c,i)=>`<div class="tgm-choice" onclick="answerTimelineGame(${index},${i},this)">${c}</div>`).join("")}
    </div>
    <div class="tgm-result" id="tgmResult"></div>
    <div id="tgmAnimCanvas" style="position:relative;min-height:10px;overflow:hidden;border-radius:16px;"></div>
    <button class="tgm-close" id="tgmCloseBtn" style="display:none;margin-top:10px;" onclick="closeTimelineGame()">Close ×</button>`;

  modal.classList.add("active");
};

window.answerTimelineGame = function(gameIndex, choiceIndex, el){
  const game      = timelineGames[gameIndex];
  const reaction  = game.reactions[choiceIndex];
  const allChoices= document.querySelectorAll(".tgm-choice");
  const result    = document.getElementById("tgmResult");
  const closeBtn  = document.getElementById("tgmCloseBtn");

  allChoices.forEach((c,i)=>{
    c.style.pointerEvents = "none";
    c.style.transition    = "opacity 0.4s, transform 0.4s";
    if(i===choiceIndex) c.classList.add("chosen");
    else { c.style.opacity="0.22"; c.style.transform="scale(0.94)"; }
  });

  result.style.opacity = "0";
  setTimeout(()=>{
    result.style.transition = "opacity 0.5s ease";
    result.style.opacity    = "1";
    typewriterText(result, reaction.text, 26);
  }, 450);

  setTimeout(()=> triggerTGMAnim(reaction.anim), 300);
  setTimeout(()=>{ if(closeBtn) closeBtn.style.display="inline-block"; }, 2000);
};

function typewriterText(el, text, speed){
  el.textContent = "";
  let i=0;
  const iv = setInterval(()=>{
    el.textContent += text[i++];
    if(i>=text.length) clearInterval(iv);
  }, speed);
}

function triggerTGMAnim(type){
  const canvas = document.getElementById("tgmAnimCanvas");
  if(!canvas) return;
  canvas.innerHTML = "";
  canvas.style.cssText = "position:relative;min-height:10px;overflow:hidden;border-radius:16px;";

  if(!document.getElementById("tgmAnimSt")){
    const s = document.createElement("style");
    s.id = "tgmAnimSt";
    s.textContent = `
      @keyframes tgmFloat{0%{opacity:0;transform:translateY(0) scale(0.5);}20%{opacity:1;}100%{opacity:0;transform:translateY(-80px) scale(0.8);}}
      @keyframes tgmSpark{0%{opacity:1;transform:translate(0,0) scale(1);}100%{opacity:0;transform:translate(var(--tx,20px),var(--ty,-50px)) scale(0);}}
      @keyframes tgmGlow{0%,100%{opacity:0;}50%{opacity:1;}}
      @keyframes tgmPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.03);box-shadow:0 0 50px rgba(255,0,60,0.45);}}
      @keyframes tgmLetter{0%{opacity:0;transform:translateY(-14px) rotate(-6deg);}60%{opacity:1;transform:translateY(3px) rotate(1deg);}100%{opacity:1;transform:translateY(0) rotate(0);}}`;
    document.head.appendChild(s);
  }

  if(type==="hearts"){
    canvas.style.minHeight="64px";
    const emojis=["❤️","🩷","💕","💗","💖"];
    for(let i=0;i<16;i++){
      const h=document.createElement("span");
      h.textContent=emojis[Math.floor(Math.random()*emojis.length)];
      h.style.cssText=`position:absolute;font-size:${11+Math.random()*16}px;left:${4+Math.random()*92}%;bottom:0;animation:tgmFloat ${1.5+Math.random()*1.8}s ease-out forwards;animation-delay:${Math.random()*0.8}s;pointer-events:none;`;
      canvas.appendChild(h);
    }
  } else if(type==="sparks"){
    canvas.style.minHeight="55px";
    for(let i=0;i<20;i++){
      const s=document.createElement("div");
      const tx=(Math.random()-0.5)*110, ty=-(30+Math.random()*55);
      s.style.cssText=`position:absolute;width:${3+Math.random()*5}px;height:${3+Math.random()*5}px;border-radius:50%;background:hsl(${335+Math.random()*35},100%,${55+Math.random()*20}%);left:${10+Math.random()*80}%;bottom:${Math.random()*25}%;--tx:${tx}px;--ty:${ty}px;animation:tgmSpark ${0.6+Math.random()*1}s ease-out forwards;animation-delay:${Math.random()*0.45}s;pointer-events:none;`;
      canvas.appendChild(s);
    }
  } else if(type==="glow"){
    canvas.style.cssText="position:relative;min-height:36px;border-radius:16px;background:radial-gradient(ellipse at center,rgba(255,0,60,0.18),transparent 70%);animation:tgmGlow 1.5s ease-in-out 2;";
  } else if(type==="pulse"){
    const box=canvas.closest(".tgm-box");
    if(box){ box.style.animation="none"; void box.offsetWidth; box.style.animation="tgmPulse 0.55s ease 3"; }
  } else if(type==="typewriter"){
    canvas.style.cssText="position:relative;min-height:44px;overflow:visible;border-radius:16px;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 0;";
    ["still","yours","❤️"].forEach((word,wi)=>{
      const wd=document.createElement("div");
      wd.style.display="flex";wd.style.gap="1px";
      [...word].forEach((ch,ci)=>{
        const l=document.createElement("span");
        l.textContent=ch;
        l.style.cssText=`display:inline-block;${wi===2?"font-size:1.4rem;":"font-size:0.95rem;"}color:${wi===2?"#ff003c":"#ffb3c1"};opacity:0;animation:tgmLetter 0.35s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:${(wi*4+ci)*0.055+0.1}s;`;
        wd.appendChild(l);
      });
      canvas.appendChild(wd);
    });
  }
}

window.closeTimelineGame = function(){
  document.getElementById("timelineGameModal").classList.remove("active");
};

/* =========================
   CONTINUE WATCHING
========================= */
function addRecentMemory(memory){
  recentMemories = recentMemories.filter(m=>m.id!==memory.id);
  recentMemories.unshift(memory);
  if(recentMemories.length>5) recentMemories.pop();
  localStorage.setItem("loveflix_recent", JSON.stringify(recentMemories));
  generateContinueWatching();
}

function generateContinueWatching(){
  const row = document.getElementById("continueWatching");
  if(!row) return;
  row.innerHTML = recentMemories.map(m=>`
    <div class="card" onclick="openMemory('${m.id}')">
      <img src="${m.hero}" loading="lazy" alt="${m.title}">
      <div class="card-overlay"><h3>${m.title}</h3><p>Continue Watching ❤️</p></div>
    </div>`).join("");
}

/* =========================
   FAVORITES
========================= */
window.toggleFavorite = function(id){
  const memory = memories.find(m=>m.id===id);
  if(!memory) return;
  if(favoriteMemories.find(m=>m.id===id)){
    favoriteMemories = favoriteMemories.filter(m=>m.id!==id);
  } else {
    favoriteMemories.push(memory);
  }
  localStorage.setItem("loveflix_favorites", JSON.stringify(favoriteMemories));
  generateFavorites();
};

function generateFavorites(){
  const row = document.getElementById("favoriteRows");
  if(!row) return;
  row.innerHTML = favoriteMemories.map(m=>`
    <div class="card" onclick="openMemory('${m.id}')">
      <img src="${m.hero}" loading="lazy" alt="${m.title}">
      <div class="card-overlay"><h3>${m.title}</h3></div>
    </div>`).join("");
}

/* =========================
   GENERATE ROWS
========================= */
function generateRows(){
  const rows = document.getElementById("rows");
  if(!rows) return;
  rows.innerHTML = memories.map(m=>`
    <section class="section">
      <h2>${m.title}</h2>
      <div class="netflix-row">
        <div class="card" onclick="openMemory('${m.id}')">
          <img src="${m.hero}" loading="lazy" alt="${m.title}">
          <div class="card-overlay">
            <h3>${m.title}</h3>
            <p>${m.description}</p>
            <div class="card-actions">
              <button onclick="event.stopPropagation();toggleFavorite('${m.id}')">❤️ Favorite</button>
              <button onclick="event.stopPropagation();editMemory('${m.id}')">✏️ Edit</button>
              <button class="delete-btn" onclick="event.stopPropagation();deleteMemory('${m.docId}')">🗑 Delete</button>
            </div>
          </div>
        </div>
      </div>
    </section>`).join("");
}

/* =========================
   OPEN MEMORY
========================= */
window.openMemory = function(id){
  const memory = memories.find(m=>m.id===id);
  if(!memory) return;
  currentMemory = memory;
  addRecentMemory(memory);
  if(id==="private"){
    if(!PRIVATE_PROFILES.includes(currentProfile)){ alert("This memory is private ❤️"); return; }
    showPrivate();
    return;
  }
  renderMemory(memory);
};

/* =========================
   RENDER MEMORY
========================= */
function renderMemory(memory){
  const home    = document.getElementById("homeScreen");
  const screen  = document.getElementById("memoryScreen");
  const content = document.getElementById("memoryContent");
  if(home)   home.style.display   = "none";
  if(screen) screen.style.display = "block";

  const videos = memory.videos || [];

  const imageGallery = memory.images.map((img,i)=>`
    <div class="card gallery-card" onclick='openGallery(${JSON.stringify(memory.images)},${i})'>
      <img src="${img}" loading="lazy" alt="${memory.title}">
      <button class="img-delete-btn" onclick="event.stopPropagation();deleteImageFromMemory(${i})">🗑</button>
      <div class="card-overlay"><h3>${memory.title}</h3><p>${i+1} / ${memory.images.length}</p></div>
    </div>`).join("") || '<p style="opacity:0.55;padding:18px;">No images yet.</p>';

  const videoGallery = videos.map((vid,vi)=>{
    const isFav = favoriteVideos.includes(vid);
    return `
    <div class="card gallery-card video-card" onclick="openVideo('${vid}')">
      <video src="${vid}" muted playsinline preload="metadata"></video>
      <div class="play-badge">▶</div>
      <button class="img-delete-btn" onclick="event.stopPropagation();deleteVideoFromMemory(${vi})">🗑</button>
      <button class="fav-btn" onclick="event.stopPropagation();toggleVideoFavorite('${vid}')">${isFav?"❤️":"🤍"}</button>
      <div class="card-overlay"><h3>${memory.title}</h3><p>Video ${vi+1} / ${videos.length}</p></div>
    </div>`;
  }).join("") || '<p style="opacity:0.55;padding:18px;">No videos yet.</p>';

  const recs = memories.filter(m=>m.id!==memory.id).map(rec=>`
    <div class="card" onclick="openMemory('${rec.id}')">
      <img src="${rec.hero}" loading="lazy" alt="${rec.title}">
      <div class="card-overlay"><h3>${rec.title}</h3></div>
    </div>`).join("");

  content.innerHTML = `
  <section class="hero" style="background-image:url('${memory.hero}')">
    <div class="overlay"></div>
    <div class="hero-content">
      <h1>${memory.title}</h1>
      <p>${memory.description}</p>
      <div class="memory-meta">
        <span>📸 ${memory.images.length} images</span>
        <span>🎬 ${videos.length} videos</span>
        <span>👁 Opens: ${memory.opens||0}</span>
      </div>
      <div class="hero-buttons">
        <button class="play-btn" onclick="addMediaToMemory()">➕ Add Media</button>
        <button class="info-btn" onclick="showHome()">← Back</button>
      </div>
    </div>
  </section>
  <section class="section"><h2>Gallery 📸</h2><div class="netflix-row">${imageGallery}</div></section>
  <section class="section"><h2>Videos 🎬</h2><div class="netflix-row">${videoGallery}</div></section>
  <section class="section"><h2>More Like This ❤️</h2><div class="netflix-row">${recs}</div></section>`;
}

/* =========================
   PRIVATE VAULT
========================= */
window.showPrivate = function(){
  if(!PRIVATE_PROFILES.includes(currentProfile)) return;
  document.getElementById("passwordScreen").classList.add("active");
};
window.closePasswordScreen = function(){
  document.getElementById("passwordScreen").classList.remove("active");
};
window.unlockPrivate = function(){
  const pass   = document.getElementById("passwordInput").value;
  const memory = memories.find(m=>m.id==="private");
  if(pass==="love123" && memory){ closePasswordScreen(); renderMemory(memory); }
  else alert("Incorrect code ❤️");
};

/* =========================
   SECRET TRIGGER
========================= */
window.secretTap       = function(){ const el=document.getElementById("secretMemory"); if(el) el.style.display="flex"; };
window.closeSecretMemory= function(){ const el=document.getElementById("secretMemory"); if(el) el.style.display="none"; };

/* =========================
   IMAGE VIEWER
========================= */
window.openGallery = async function(images, index){
  currentImages = images; currentIndex = index; currentMode = "image";
  updateViewer();
  const viewer = document.getElementById("viewer");
  if(viewer){ viewer.style.display="flex"; viewer.classList.add("active"); }
  if(currentMemory?.docId){
    try{
      const n = (currentMemory.opens||0)+1;
      await updateDoc(doc(db,"memories",currentMemory.docId),{opens:n});
      currentMemory.opens = n;
      const meta = document.querySelector(".memory-meta");
      if(meta) meta.innerHTML = meta.innerHTML.replace(/Opens:\s*\d+/,`Opens: ${n}`);
    }catch(e){ console.log(e); }
  }
};

function updateViewer(){
  const img     = document.getElementById("viewerImage");
  const counter = document.getElementById("imageCounter");
  const v       = document.getElementById("viewerVideo");
  if(v){ v.pause(); v.style.display="none"; }
  if(img){ img.style.display="block"; img.src=currentImages[currentIndex]; }
  if(counter) counter.innerText = `${currentIndex+1} / ${currentImages.length}`;
}

window.nextImage = function(){
  if(currentMode!=="image"||!currentImages.length) return;
  currentIndex = (currentIndex+1) % currentImages.length;
  updateViewer();
};
window.prevImage = function(){
  if(currentMode!=="image"||!currentImages.length) return;
  currentIndex = (currentIndex-1+currentImages.length) % currentImages.length;
  updateViewer();
};
window.closeViewer = function(){
  const viewer = document.getElementById("viewer");
  if(viewer){ viewer.style.display="none"; viewer.classList.remove("active"); }
  const v = document.getElementById("viewerVideo");
  if(v){ v.pause(); v.src=""; v.style.display="none"; }
  const img = document.getElementById("viewerImage");
  if(img) img.style.display="block";
};

/* =========================
   VIDEO VIEWER
========================= */
window.openVideo = async function(url){
  currentMode = "video";
  const viewer = document.getElementById("viewer");
  const img    = document.getElementById("viewerImage");
  if(img) img.style.display = "none";
  let v = document.getElementById("viewerVideo");
  if(!v){
    v = document.createElement("video");
    v.id = "viewerVideo"; v.controls = true; v.autoplay = true;
    v.style.cssText = "max-width:90vw;max-height:85vh;border-radius:12px;box-shadow:0 0 40px rgba(255,0,60,0.4);";
    if(img?.parentNode) img.parentNode.appendChild(v);
    else if(viewer)     viewer.appendChild(v);
  }
  v.src = url; v.style.display = "block"; v.play().catch(()=>{});
  if(viewer){ viewer.style.display="flex"; viewer.classList.add("active"); }
};

/* =========================
   CREATOR
========================= */
window.openCreator  = function(){ document.getElementById("creatorPanel").classList.add("active"); };
window.closeCreator = function(){ document.getElementById("creatorPanel").classList.remove("active"); };

/* =========================
   CREATE MEMORY
========================= */
window.createMemory = async function(){
  const title = document.getElementById("memoryTitle").value;
  const desc  = document.getElementById("memoryDescription").value;
  const input = document.getElementById("memoryImage");
  if(!title||!desc||!input.files[0]){ alert("Fill all fields ❤️"); return; }

  showUploadProgress("Creating your memory...");
  try{
    const data     = await uploadToCloudinary(input.files[0], pct=> setUploadProgress(pct,"Uploading cover..."));
    const imageURL = data.secure_url;
    setUploadProgress(100,"Saving...");
    await addDoc(collection(db,"memories"),{
      id: title.toLowerCase().replaceAll(" ","-"),
      title, description:desc, hero:imageURL,
      images:[imageURL], videos:[], tags:["New"], opens:0, favoriteCount:0
    });
    await refreshApp();
    hideUploadProgress(); closeCreator();
    ["memoryTitle","memoryDescription","memoryImage"].forEach(id=>{ document.getElementById(id).value=""; });
    showHome();
  }catch(e){ hideUploadProgress(); alert("Upload failed ❤️ — "+e.message); }
};

/* =========================
   DELETE MEMORY
========================= */
window.deleteMemory = async function(docId){
  if(!confirm("Delete this memory forever? ❤️")) return;
  try{ await deleteDoc(doc(db,"memories",docId)); await refreshApp(); }
  catch(e){ alert("Delete failed ❤️"); }
};

/* =========================
   EDIT MEMORY
========================= */
window.editMemory = async function(id){
  const memory = memories.find(m=>m.id===id);
  if(!memory) return;
  const newTitle = prompt("New title:", memory.title);       if(newTitle===null) return;
  const newDesc  = prompt("New description:", memory.description); if(newDesc===null) return;
  try{
    await updateDoc(doc(db,"memories",memory.docId),{
      title: newTitle.trim()||memory.title,
      description: newDesc.trim()||memory.description
    });
    await refreshApp();
  }catch(e){ alert("Update failed ❤️"); }
};

/* =========================
   ADD MEDIA (images x10, video x1 up to 500MB)
========================= */
window.addMediaToMemory = function(){
  if(!currentMemory) return;
  const input  = document.createElement("input");
  input.type   = "file";
  input.accept = "image/*,video/*";
  input.multiple = true;

  input.onchange = async ()=>{
    const files      = Array.from(input.files);
    const imageFiles = files.filter(f=>f.type.startsWith("image/"));
    const videoFiles = files.filter(f=>f.type.startsWith("video/"));
    if(imageFiles.length > 10){ alert("Max 10 images at a time ❤️"); return; }
    if(videoFiles.length > 1){ alert("Upload one video at a time ❤️"); return; }
    for(const vf of videoFiles){ if(vf.size > 500*1024*1024){ alert(`"${vf.name}" too large (max 500MB) ❤️`); return; } }

    let imgs = [...currentMemory.images];
    let vids = [...(currentMemory.videos||[])];

    try{
      for(let i=0;i<imageFiles.length;i++){
        const lbl = imageFiles.length>1 ? `Image ${i+1} of ${imageFiles.length}...` : "Uploading image...";
        if(i===0) showUploadProgress(lbl); else setUploadProgress(0,lbl);
        const d = await uploadToCloudinary(imageFiles[i], pct=> setUploadProgress(pct,lbl));
        imgs.push(d.secure_url);
      }
      if(videoFiles.length===1){
        const vf = videoFiles[0];
        showUploadProgress(vf.size>100*1024*1024 ? "Uploading large video in chunks... ❤️" : "Uploading video...");
        const d = await uploadToCloudinary(vf, pct=> setUploadProgress(pct,`Video ${Math.round(pct)}%`));
        vids.push(d.secure_url);
      }
      setUploadProgress(100,"Saving...");
      await updateDoc(doc(db,"memories",currentMemory.docId),{ images:imgs, videos:vids, hero:imgs[0]||currentMemory.hero });
      await loadMemories();
      currentMemory = memories.find(m=>m.id===currentMemory.id);
      hideUploadProgress();
      renderMemory(currentMemory);
    }catch(e){ hideUploadProgress(); alert("Upload failed ❤️ — "+e.message); }
  };
  input.click();
};

/* =========================
   DELETE IMAGE / VIDEO
========================= */
window.deleteImageFromMemory = async function(index){
  if(!currentMemory||!confirm("Remove this image? ❤️")) return;
  const updated = currentMemory.images.filter((_,i)=>i!==index);
  try{
    await updateDoc(doc(db,"memories",currentMemory.docId),{ images:updated, hero:updated[0]||currentMemory.hero });
    await loadMemories(); currentMemory=memories.find(m=>m.id===currentMemory.id); renderMemory(currentMemory);
  }catch(e){ alert("Delete failed ❤️"); }
};

window.deleteVideoFromMemory = async function(index){
  if(!currentMemory||!confirm("Remove this video? ❤️")) return;
  const updated = (currentMemory.videos||[]).filter((_,i)=>i!==index);
  try{
    await updateDoc(doc(db,"memories",currentMemory.docId),{ videos:updated });
    await loadMemories(); currentMemory=memories.find(m=>m.id===currentMemory.id); renderMemory(currentMemory);
  }catch(e){ alert("Delete failed ❤️"); }
};

/* =========================
   FAVORITE VIDEO
========================= */
window.toggleVideoFavorite = function(url){
  if(favoriteVideos.includes(url)) favoriteVideos=favoriteVideos.filter(u=>u!==url);
  else favoriteVideos.push(url);
  localStorage.setItem("loveflix_fav_videos", JSON.stringify(favoriteVideos));
  if(currentMemory) renderMemory(currentMemory);
};

/* =========================
   MINI GAMES
========================= */
window.openGame = function(gameId){
  const modal   = document.getElementById("gameModal");
  const content = document.getElementById("gameContent");
  if(!modal||!content) return;
  modal.classList.add("active");
  const fns = { lovemeter:renderLoveMeter, match:renderMemoryMatch, truth:renderTruthBomb, wyr:renderWouldYouRather };
  if(fns[gameId]) fns[gameId](content);
};
window.closeGame = function(){
  const m = document.getElementById("gameModal");
  if(m) m.classList.remove("active");
};
document.addEventListener("click", e=>{ const m=document.getElementById("gameModal"); if(m&&e.target===m) closeGame(); });

/* --- LOVE METER --- */
function renderLoveMeter(el){
  el.innerHTML = `
    <h2>Love Meter 💘</h2><p class="game-sub">Let the universe calculate what we already know.</p>
    <div class="love-meter-wrap">
      <div class="love-meter-names"><span>Budhdhu</span><span>Omen</span></div>
      <div class="love-meter-bar-outer"><div class="love-meter-bar-fill" id="lmFill"></div></div>
      <span class="love-meter-pct" id="lmPct">—</span>
      <div class="love-meter-result" id="lmResult"></div>
    </div>
    <button class="love-meter-btn" onclick="runLoveMeter()">Calculate ❤️</button>`;
}
const lmResults = [
  { pct:99, text:"Of course it's almost perfect. Almost — because nothing real is ever exactly perfect. And that's exactly why this is ours." },
  { pct:100, text:"The algorithm broke trying to calculate it. 100% and climbing. Science gave up. We didn't." },
  { pct:97, text:"97% compatible. The remaining 3% is just you being stubborn. Which honestly makes this better." },
  { pct:98, text:"98% — because we are the kind of danger the universe keeps warning people about but never stops." },
  { pct:96, text:"Dangerously, irreversibly, catastrophically in love. That's what 96% looks like when it's real." },
];
window.runLoveMeter = function(){
  const fill=document.getElementById("lmFill"), pct=document.getElementById("lmPct"), result=document.getElementById("lmResult");
  if(!fill) return;
  fill.style.width="0%"; pct.textContent="..."; result.textContent="";
  const c = lmResults[Math.floor(Math.random()*lmResults.length)];
  setTimeout(()=>{
    fill.style.width=c.pct+"%";
    let n=0; const step=c.pct/60;
    const tick=setInterval(()=>{
      n+=step;
      if(n>=c.pct){ n=c.pct; clearInterval(tick); setTimeout(()=>{ result.textContent=c.text; },280); }
      pct.textContent=Math.floor(n)+"%";
    },22);
  },280);
};

/* --- MEMORY MATCH --- */
const matchEmojis = ["❤️","🌙","🔥","💋","🌹","🥂","💌","✨"];
function renderMemoryMatch(el){
  const pairs = [...matchEmojis,...matchEmojis].sort(()=>Math.random()-0.5);
  el.innerHTML = `
    <h2>Memory Match 🃏</h2>
    <div class="match-score">Matches: <span id="matchCount">0</span> / 8</div>
    <div class="match-grid" id="matchGrid">
      ${pairs.map((e,i)=>`<div class="match-card" data-emoji="${e}" data-index="${i}" onclick="flipMatchCard(this)"><span class="card-face">${e}</span></div>`).join("")}
    </div>
    <div id="matchWin" style="display:none;margin-top:14px;color:#ff6b9d;font-style:italic;font-size:0.95rem;">You matched everything perfectly. Like you always do with me ❤️</div>`;
  window._matchState = { flipped:[], matched:0, locked:false };
}
window.flipMatchCard = function(card){
  const st = window._matchState;
  if(st.locked||card.classList.contains("flipped")||card.classList.contains("matched")) return;
  card.classList.add("flipped"); st.flipped.push(card);
  if(st.flipped.length===2){
    st.locked=true;
    const [a,b]=st.flipped;
    if(a.dataset.emoji===b.dataset.emoji&&a.dataset.index!==b.dataset.index){
      setTimeout(()=>{ a.classList.add("matched"); b.classList.add("matched"); st.matched++; document.getElementById("matchCount").textContent=st.matched; st.flipped=[]; st.locked=false; if(st.matched===8) document.getElementById("matchWin").style.display="block"; },380);
    } else {
      setTimeout(()=>{ a.classList.add("wrong-shake"); b.classList.add("wrong-shake"); setTimeout(()=>{ a.classList.remove("flipped","wrong-shake"); b.classList.remove("flipped","wrong-shake"); st.flipped=[]; st.locked=false; },420); },550);
    }
  }
};

/* --- TRUTH BOMB --- */
const truthQs = [
  { q:"What's one thing about me you'd never change?", yes:"And I'd never let you try to change it either. That thing you love? That's just me being made for you.", no:"Interesting. You hesitated. That means you already know. ❤️" },
  { q:"If I texted you right now — would you smile before you even read it?", yes:"Good. Because I smiled sending it. This is just what we are now.", no:"Liar. I saw that look on your face. You absolutely would. ❤️" },
  { q:"Honestly — do you think about me when I'm not there?", yes:"I think about you too. More than makes sense. More than I can explain.", no:"Somehow I don't believe that at all. ❤️" },
  { q:"Would you rather fight with me or not talk to me for a whole day?", yes:"Fighting it is. At least that means we're both fully in it.", no:"You chose silence. Which means you'd miss me. I knew it." },
  { q:"Is there a version of your life where you don't choose me?", yes:"Careful. That's the only dangerous answer you've given me.", no:"Good. Because in every version of mine — it's always you." },
];
let _truthIdx=0;
function renderTruthBomb(el){ _truthIdx=Math.floor(Math.random()*truthQs.length); window._truthEl=el; renderTruthQ(el); }
function renderTruthQ(el){
  const q=truthQs[_truthIdx];
  el.innerHTML=`
    <h2>Truth Bomb 💣</h2><p class="game-sub">Omen is asking. No running allowed.</p>
    <div class="truth-question">"${q.q}"</div>
    <div class="truth-btns">
      <button class="truth-btn" onclick="answerTruth('yes')">Yes ❤️</button>
      <button class="truth-btn" onclick="answerTruth('no')">No...</button>
    </div>
    <div class="truth-response" id="truthResp"></div>
    <button class="wyr-next-btn" id="truthNext" onclick="nextTruth()" style="display:none;margin-top:14px;">Next question →</button>`;
}
window.answerTruth = function(c){
  const q=truthQs[_truthIdx], resp=document.getElementById("truthResp"), btns=document.querySelectorAll(".truth-btn"), next=document.getElementById("truthNext");
  btns.forEach(b=>{ b.style.pointerEvents="none"; b.style.opacity="0.4"; });
  resp.textContent=q[c]||q.yes;
  setTimeout(()=> resp.classList.add("visible"),100);
  if(next) next.style.display="inline-block";
};
window.nextTruth = function(){ _truthIdx=(_truthIdx+1)%truthQs.length; if(window._truthEl) renderTruthQ(window._truthEl); };

/* --- WOULD YOU RATHER --- */
const wyrQs = [
  { a:"Know exactly what I'm thinking about you right now", b:"Never know but feel it in everything I do", ra:"Knowing is terrifying. Feeling it is the whole point. You chose to know me — and that makes sense.", rb:"Feeling it in everything — the smarter answer. Because I show you every single day." },
  { a:"Have one perfect hour together and then it ends", b:"Have a messy complicated forever with me", ra:"One perfect hour. The most heartbreaking answer. I'd make it count.", rb:"Messy forever. Correct. We were never going to be clean or easy anyway." },
  { a:"Read all my old journal entries about you", b:"Never know what I've written but I keep writing", ra:"You want to know. I've written things about you that would ruin you in the best possible way.", rb:"The mystery version. Wiser. What I've written is dangerous territory. ❤️" },
  { a:"Be the one who loves a little more", b:"Be the one who is loved a little more", ra:"Loving more is brave. And very you. This doesn't surprise me at all.", rb:"Being loved more. Honestly valid. Sit in it. You deserve every bit." },
  { a:"Fight with me and fix it the same night", b:"Never fight but also never go that deep", ra:"Fight and fix. We chose chaos. At least it means we care enough to argue.", rb:"Surface peace or real messy love — you chose the easy version. I don't believe it. ❤️" },
];
let _wyrIdx=0;
function renderWouldYouRather(el){ _wyrIdx=Math.floor(Math.random()*wyrQs.length); window._wyrEl=el; renderWyrQ(el); }
function renderWyrQ(el){
  const q=wyrQs[_wyrIdx];
  el.innerHTML=`
    <h2>Would You Rather 🔥</h2><p class="game-sub">Pick one. No explaining yourself.</p>
    <div class="wyr-options">
      <div class="wyr-opt" onclick="chooseWyr(this,'a')">${q.a}</div>
      <div class="wyr-opt" onclick="chooseWyr(this,'b')">${q.b}</div>
    </div>
    <div class="wyr-result" id="wyrResult"></div>
    <button class="wyr-next-btn" id="wyrNext" onclick="nextWyr()">Next →</button>`;
}
window.chooseWyr = function(el,c){
  const q=wyrQs[_wyrIdx];
  document.querySelectorAll(".wyr-opt").forEach(o=>{ o.style.pointerEvents="none"; o.style.opacity="0.38"; });
  el.style.opacity="1"; el.classList.add("chosen");
  const result=document.getElementById("wyrResult"), next=document.getElementById("wyrNext");
  result.textContent=c==="a"?q.ra:q.rb;
  setTimeout(()=> result.classList.add("visible"),100);
  if(next) next.classList.add("visible");
};
window.nextWyr = function(){ _wyrIdx=(_wyrIdx+1)%wyrQs.length; if(window._wyrEl) renderWyrQ(window._wyrEl); };
