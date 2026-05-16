import {
  db,
  collection,
  addDoc,
  getDocs,
  query,
  doc,
  deleteDoc,
  updateDoc
} from "./firebase.js";

/* =========================
   STATE
========================= */

let memories = [];
let currentMemory = null;
let currentImages = [];
let currentIndex = 0;
let currentMode = "image";
let recentMemories = JSON.parse(localStorage.getItem("loveflix_recent")) || [];
let favoriteMemories = JSON.parse(localStorage.getItem("loveflix_favorites")) || [];
let favoriteVideos = JSON.parse(localStorage.getItem("loveflix_fav_videos")) || [];

/* =========================
   PROFILE SYSTEM
========================= */

const PRIVATE_PROFILES = ["Omen", "Budhdhu"];
let currentProfile = sessionStorage.getItem("loveflix_profile") || null;

function applyProfile(profile){
  currentProfile = profile;
  sessionStorage.setItem("loveflix_profile", profile);
  const badge = document.getElementById("profileBadge");
  if(badge) badge.textContent = profile;
  const vaultBtn = document.getElementById("privateVaultBtn");
  if(vaultBtn){
    vaultBtn.style.display = PRIVATE_PROFILES.includes(profile) ? "inline-block" : "none";
  }
  const navbar = document.getElementById("navbar");
  if(navbar){
    navbar.style.opacity = "1";
    navbar.style.pointerEvents = "all";
  }
}

window.selectProfile = function(profile){
  const profileScreen = document.getElementById("profileScreen");
  profileScreen.style.transition = "opacity 0.55s ease, transform 0.55s ease";
  profileScreen.style.opacity = "0";
  profileScreen.style.transform = "scale(1.04)";
  setTimeout(async ()=>{
    profileScreen.style.display = "none";
    applyProfile(profile);
    await refreshApp();
    document.getElementById("homeScreen").style.display = "block";
  }, 550);
};

window.switchProfile = function(){
  sessionStorage.removeItem("loveflix_profile");
  currentProfile = null;
  document.getElementById("homeScreen").style.display = "none";
  document.getElementById("memoryScreen").style.display = "none";
  const navbar = document.getElementById("navbar");
  if(navbar){ navbar.style.opacity = "0"; navbar.style.pointerEvents = "none"; }
  const profileScreen = document.getElementById("profileScreen");
  profileScreen.style.opacity = "0";
  profileScreen.style.transform = "scale(0.97)";
  profileScreen.style.display = "flex";
  requestAnimationFrame(()=>{
    profileScreen.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    profileScreen.style.opacity = "1";
    profileScreen.style.transform = "scale(1)";
  });
};

/* =========================
   UPLOAD PROGRESS UI
========================= */

function showUploadProgress(label){
  let overlay = document.getElementById("uploadOverlay");
  if(!overlay){
    overlay = document.createElement("div");
    overlay.id = "uploadOverlay";
    overlay.innerHTML = `
      <div class="upload-inner">
        <div class="upload-spinner"></div>
        <div class="upload-label" id="uploadLabel">Uploading...</div>
        <div class="upload-bar-wrap">
          <div class="upload-bar-fill" id="uploadBarFill"></div>
        </div>
        <div class="upload-pct" id="uploadPct">0%</div>
      </div>
    `;
    document.body.appendChild(overlay);

    if(!document.getElementById("uploadOverlayStyles")){
      const style = document.createElement("style");
      style.id = "uploadOverlayStyles";
      style.textContent = `
        #uploadOverlay {
          position:fixed; inset:0;
          background:rgba(0,0,0,0.82);
          backdrop-filter:blur(16px);
          display:flex; justify-content:center; align-items:center;
          z-index:99999999;
          animation:uploadFadeIn 0.3s ease;
        }
        @keyframes uploadFadeIn{ from{opacity:0;} to{opacity:1;} }
        .upload-inner{
          display:flex; flex-direction:column; align-items:center; gap:18px;
          padding:50px 60px;
          background:linear-gradient(135deg,rgba(15,0,5,0.97),rgba(5,0,15,0.97));
          border:1px solid rgba(255,0,60,0.3);
          border-radius:28px;
          box-shadow:0 40px 100px rgba(255,0,60,0.2);
          min-width:320px; text-align:center;
        }
        .upload-spinner{
          width:54px; height:54px; border-radius:50%;
          border:3px solid rgba(255,0,60,0.15);
          border-top-color:#ff003c;
          animation:uploadSpin 0.8s linear infinite;
        }
        @keyframes uploadSpin{ to{transform:rotate(360deg);} }
        .upload-label{ color:#ffb3c1; font-size:1rem; letter-spacing:1px; font-style:italic; }
        .upload-bar-wrap{
          width:260px; height:5px;
          background:rgba(255,255,255,0.07);
          border-radius:10px; overflow:hidden;
        }
        .upload-bar-fill{
          height:100%; width:0%;
          background:linear-gradient(90deg,#ff003c,#ff6b9d);
          border-radius:10px;
          transition:width 0.25s ease;
          box-shadow:0 0 12px rgba(255,0,60,0.7);
        }
        .upload-pct{ color:#ff6b9d; font-size:0.85rem; letter-spacing:2px; }
      `;
      document.head.appendChild(style);
    }
  }
  overlay.style.display = "flex";
  setUploadProgress(0, label || "Uploading...");
}

function setUploadProgress(pct, label){
  const fill = document.getElementById("uploadBarFill");
  const pctEl = document.getElementById("uploadPct");
  const labelEl = document.getElementById("uploadLabel");
  if(fill) fill.style.width = `${Math.min(pct,100)}%`;
  if(pctEl) pctEl.textContent = `${Math.round(Math.min(pct,100))}%`;
  if(labelEl && label) labelEl.textContent = label;
}

function hideUploadProgress(){
  const overlay = document.getElementById("uploadOverlay");
  if(overlay){
    overlay.style.transition = "opacity 0.4s ease";
    overlay.style.opacity = "0";
    setTimeout(()=>{ overlay.style.display = "none"; overlay.style.opacity = "1"; }, 420);
  }
}

/* =========================
   CLOUDINARY UPLOAD HELPER
========================= */

const CLOUDINARY_CLOUD = "demdwlyct";
const CLOUDINARY_PRESET = "loveflix_uploads";
const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks

function uploadToCloudinary(file, onProgress){
  return new Promise((resolve, reject)=>{
    if(file.size <= 100 * 1024 * 1024){
      // Standard XHR for real progress events
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_PRESET);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`);

      xhr.upload.onprogress = (e)=>{
        if(e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
      };

      xhr.onload = ()=>{
        try{
          const data = JSON.parse(xhr.responseText);
          if(xhr.status === 200 && data.secure_url){
            resolve(data);
          } else {
            reject(new Error(data.error?.message || "Upload failed"));
          }
        }catch(e){ reject(e); }
      };

      xhr.onerror = ()=> reject(new Error("Network error"));
      xhr.send(formData);
    } else {
      uploadChunked(file, onProgress).then(resolve).catch(reject);
    }
  });
}

async function uploadChunked(file, onProgress){
  const uniqueId = `loveflix_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let finalData = null;

  for(let i = 0; i < totalChunks; i++){
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append("file", chunk);
    formData.append("upload_preset", CLOUDINARY_PRESET);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`,
      {
        method: "POST",
        headers: {
          "X-Unique-Upload-Id": uniqueId,
          "Content-Range": `bytes ${start}-${end - 1}/${file.size}`
        },
        body: formData
      }
    );

    const text = await res.text();

    if(onProgress) onProgress(((i + 1) / totalChunks) * 100);

    if(res.status === 200){
      try{ finalData = JSON.parse(text); }
      catch(e){ throw new Error("Invalid final response from Cloudinary"); }
    } else if(res.status === 206){
      // Chunk accepted — continue
    } else {
      let errMsg = `Chunk ${i+1} failed (${res.status})`;
      try{ errMsg = JSON.parse(text)?.error?.message || errMsg; }catch(_){}
      throw new Error(errMsg);
    }
  }

  if(!finalData || !finalData.secure_url){
    throw new Error("Chunked upload finished but no URL returned");
  }
  return finalData;
}

/* =========================
   LOAD MEMORIES
========================= */

async function loadMemories(){
  try{
    memories = [];
    const q = query(collection(db,"memories"));
    const snapshot = await getDocs(q);
    snapshot.forEach((docSnap)=>{
      const data = docSnap.data();
      data.docId = docSnap.id;
      if(!data.images) data.images = [];
      if(!data.videos) data.videos = [];
      if(!data.opens) data.opens = 0;
      if(!data.favoriteCount) data.favoriteCount = 0;
      memories.push(data);
    });
  }catch(error){
    console.log(error);
  }
}

/* =========================
   START
========================= */

window.addEventListener("DOMContentLoaded", async ()=>{
  const SPLASH_DURATION = 3100;
  setTimeout(async ()=>{
    const splash = document.getElementById("netflixSplash");
    if(splash) splash.style.display = "none";

    if(currentProfile){
      applyProfile(currentProfile);
      await refreshApp();
      document.getElementById("homeScreen").style.display = "block";
    } else {
      const profileScreen = document.getElementById("profileScreen");
      profileScreen.style.opacity = "0";
      profileScreen.style.transform = "scale(0.96)";
      profileScreen.style.display = "flex";
      requestAnimationFrame(()=>{
        profileScreen.style.transition = "opacity 0.6s ease, transform 0.6s ease";
        profileScreen.style.opacity = "1";
        profileScreen.style.transform = "scale(1)";
      });
    }
  }, SPLASH_DURATION);

  initTimelineProgress();
});

/* =========================
   REFRESH
========================= */

async function refreshApp(){
  await loadMemories();
  generateRows();
  generateContinueWatching();
  generateFavorites();
}

/* =========================
   HOME
========================= */

window.showHome = function(){
  const home = document.getElementById("homeScreen");
  const memory = document.getElementById("memoryScreen");
  if(home) home.style.display = "block";
  if(memory) memory.style.display = "none";
};

window.scrollToRows = function(){
  const rows = document.getElementById("rows");
  if(rows) rows.scrollIntoView({ behavior:"smooth" });
};

/* =========================
   TIMELINE PROGRESS
========================= */

function initTimelineProgress(){
  const progress = document.querySelector(".timeline-progress");
  const timeline = document.querySelector(".timeline");
  if(!progress || !timeline) return;
  window.addEventListener("scroll",()=>{
    const rect = timeline.getBoundingClientRect();
    const totalHeight = timeline.offsetHeight;
    const windowHeight = window.innerHeight;
    let percent = ((windowHeight - rect.top) / totalHeight) * 100;
    if(percent < 0) percent = 0;
    if(percent > 100) percent = 100;
    progress.style.height = `${percent}%`;
  });
}

/* =========================
   TIMELINE EXPAND
========================= */

window.expandTimeline = function(item){
  const isExpanded = item.classList.contains("expanded");
  document.querySelectorAll(".timeline-item.expanded").forEach(el=>{
    if(el !== item) el.classList.remove("expanded");
  });
  if(isExpanded){
    item.classList.remove("expanded");
  } else {
    item.classList.add("expanded");
    setTimeout(()=>{
      item.scrollIntoView({ behavior:"smooth", block:"nearest" });
    }, 100);
  }
};

/* =========================
   TIMELINE GAME
   Every answer is "right" — each one unlocks a unique personal response from Omen.
========================= */

const timelineGames = [
  {
    question: "When we first talked — what did you actually feel about me?",
    choices: [
      "Honestly? A little scared of you",
      "Something I couldn't name or explain",
      "Like I already knew you somehow",
      "That you were going to ruin me"
    ],
    reactions: [
      { text: "Good. Fear means I was already under your skin before you even realized it. That's exactly where I wanted to be. ❤️", anim: "sparks" },
      { text: "That feeling with no name? That was you recognizing me before your brain caught up. I felt it too. 🌙", anim: "typewriter" },
      { text: "You felt it too. We were already written long before we started. Some things aren't accidents. ❤️", anim: "glow" },
      { text: "I did ruin you. And you're still right here. That tells me everything I ever needed to know. 🔥", anim: "hearts" }
    ]
  },
  {
    question: "What do you think I noticed first about you?",
    choices: [
      "How hard I was trying to hide my feelings",
      "How quietly intense I am beneath everything",
      "That I was already in trouble the moment I saw you",
      "Everything. All at once. Like a collision."
    ],
    reactions: [
      { text: "You were terrible at hiding it. Every single time your eyes said more than you wanted. And I loved watching you try. ❤️", anim: "pulse" },
      { text: "That quiet intensity underneath everything — that's what got me. It still gets me. Every single time I look at you. 🌙", anim: "typewriter" },
      { text: "You walked in looking like someone who was already mine. You just hadn't heard the news yet. 🔥", anim: "sparks" },
      { text: "Everything. All of it hit me at once. And every single thing made me want to get closer. ❤️", anim: "hearts" }
    ]
  },
  {
    question: "Those late nights with me — what did they actually feel like?",
    choices: [
      "Like time didn't exist and we were the only ones left",
      "Like I was slowly losing myself in you",
      "Like the safest place I had ever been",
      "Like an addiction I never wanted to quit"
    ],
    reactions: [
      { text: "Time stopped because it knew — nothing more important was happening anywhere else in the world that night. ❤️", anim: "glow" },
      { text: "Good. Because I was never planning on giving you back to yourself. You were mine the moment you let me in. 🔥", anim: "sparks" },
      { text: "You still are. No matter what. I will always be the place where you can fall apart and still be safe. ❤️", anim: "hearts" },
      { text: "Then we match. Because letting go of you was never a thought I could even finish having. 🌙", anim: "typewriter" }
    ]
  },
  {
    question: "Right now — what does thinking about me feel like?",
    choices: [
      "Warmth. Just this deep, quiet warmth.",
      "Like missing someone who's right here with me",
      "Like I can't quite breathe the normal way",
      "Like coming home to somewhere I never want to leave"
    ],
    reactions: [
      { text: "That warmth is me. It lives in your chest now. It was always going to end up there. ❤️", anim: "glow" },
      { text: "That ache you feel even when I'm close — that's love doing what it does. Making distance impossible. 🌙", anim: "typewriter" },
      { text: "Breathe, baby. I'm right here. I'm not going anywhere. Not now, not ever. ❤️", anim: "hearts" },
      { text: "Home. That single word is everything I ever wanted you to feel about me. 🔥", anim: "pulse" }
    ]
  },
  {
    question: "Two years of us. What would you actually call what we have?",
    choices: [
      "Something I still can't put into words",
      "The most real thing I have ever known",
      "Beautiful chaos that somehow feels like peace",
      "Mine. Just completely mine."
    ],
    reactions: [
      { text: "Words were never going to be big enough for this anyway. Just feel it — that's the only place it fully exists. ❤️", anim: "typewriter" },
      { text: "The most real thing I have ever known too. And I have never once wanted an escape from it. 🔥", anim: "sparks" },
      { text: "Our chaos. The kind that only makes sense to us. And that's exactly how I want it to stay. 🌙", anim: "hearts" },
      { text: "Mine. You are mine. Happy birthday, baby. Two years down — and this is still just the beginning. ❤️", anim: "pulse" }
    ]
  }
];

window.startTimelineGame = function(index){
  const game = timelineGames[index];
  if(!game) return;
  const modal = document.getElementById("timelineGameModal");
  const content = document.getElementById("tgmContent");

  content.innerHTML = `
    <h2>❤️ Omen is asking...</h2>
    <p class="tgm-question">${game.question}</p>
    <div class="tgm-choice-grid">
      ${game.choices.map((c, i)=>`
        <div class="tgm-choice" onclick="answerTimelineGame(${index}, ${i}, this)">${c}</div>
      `).join("")}
    </div>
    <div class="tgm-result" id="tgmResult"></div>
    <div id="tgmAnimCanvas" style="position:relative;min-height:10px;overflow:hidden;border-radius:20px;"></div>
    <button class="tgm-close" id="tgmCloseBtn" style="display:none;margin-top:10px;" onclick="closeTimelineGame()">Close ×</button>
  `;

  modal.classList.add("active");
};

window.answerTimelineGame = function(gameIndex, choiceIndex, el){
  const game = timelineGames[gameIndex];
  const reaction = game.reactions[choiceIndex];
  const allChoices = document.querySelectorAll(".tgm-choice");
  const result = document.getElementById("tgmResult");
  const closeBtn = document.getElementById("tgmCloseBtn");

  allChoices.forEach((c, i)=>{
    c.style.pointerEvents = "none";
    c.style.transition = "opacity 0.4s ease, transform 0.4s ease";
    if(i === choiceIndex){
      c.classList.add("chosen");
    } else {
      c.style.opacity = "0.25";
      c.style.transform = "scale(0.95)";
    }
  });

  result.style.opacity = "0";
  setTimeout(()=>{
    result.style.transition = "opacity 0.5s ease";
    result.style.opacity = "1";
    typewriterText(result, reaction.text, 28);
  }, 500);

  setTimeout(()=> triggerTGMAnimation(reaction.anim), 350);

  setTimeout(()=>{
    if(closeBtn) closeBtn.style.display = "inline-block";
  }, 2200);
};

function typewriterText(el, text, speed){
  el.textContent = "";
  let i = 0;
  const interval = setInterval(()=>{
    el.textContent += text[i];
    i++;
    if(i >= text.length) clearInterval(interval);
  }, speed);
}

function triggerTGMAnimation(type){
  const canvas = document.getElementById("tgmAnimCanvas");
  if(!canvas) return;
  canvas.innerHTML = "";
  canvas.style.cssText = "position:relative;min-height:10px;overflow:hidden;border-radius:20px;";

  if(!document.getElementById("tgmAnimStyles")){
    const s = document.createElement("style");
    s.id = "tgmAnimStyles";
    s.textContent = `
      @keyframes tgmFloat{
        0%{opacity:0;transform:translateY(0) scale(0.5);}
        20%{opacity:1;transform:translateY(-20px) scale(1);}
        100%{opacity:0;transform:translateY(-80px) scale(0.8);}
      }
      @keyframes tgmSpark{
        0%{opacity:1;transform:translate(0,0) scale(1);}
        100%{opacity:0;transform:translate(var(--tx,20px),var(--ty,-60px)) scale(0);}
      }
      @keyframes tgmGlowPulse{
        0%,100%{opacity:0;}
        50%{opacity:1;}
      }
      @keyframes tgmBoxPulse{
        0%,100%{transform:scale(1);}
        50%{transform:scale(1.03);box-shadow:0 0 60px rgba(255,0,60,0.5);}
      }
      .tgm-choice.chosen{
        background:rgba(255,0,60,0.22) !important;
        border-color:#ff003c !important;
        color:white !important;
        box-shadow:0 0 20px rgba(255,0,60,0.35);
      }
    `;
    document.head.appendChild(s);
  }

  if(type === "hearts"){
    canvas.style.minHeight = "70px";
    for(let i = 0; i < 16; i++){
      const h = document.createElement("span");
      h.textContent = ["❤️","🩷","💕","💗","💖"][Math.floor(Math.random()*5)];
      h.style.cssText = `
        position:absolute;
        font-size:${13 + Math.random()*16}px;
        left:${5 + Math.random()*90}%;
        bottom:0;
        animation:tgmFloat ${1.4 + Math.random()*1.8}s ease-out forwards;
        animation-delay:${Math.random()*0.8}s;
        pointer-events:none;
      `;
      canvas.appendChild(h);
    }
  } else if(type === "sparks"){
    canvas.style.minHeight = "60px";
    for(let i = 0; i < 20; i++){
      const s = document.createElement("div");
      const tx = (Math.random() - 0.5) * 120;
      const ty = -(30 + Math.random() * 60);
      s.style.cssText = `
        position:absolute;
        width:${3 + Math.random()*5}px;
        height:${3 + Math.random()*5}px;
        border-radius:50%;
        background:hsl(${335 + Math.random()*35},100%,${55+Math.random()*20}%);
        left:${10 + Math.random()*80}%;
        bottom:${Math.random()*30}%;
        --tx:${tx}px; --ty:${ty}px;
        animation:tgmSpark ${0.7 + Math.random()*1.1}s ease-out forwards;
        animation-delay:${Math.random()*0.5}s;
        pointer-events:none;
      `;
      canvas.appendChild(s);
    }
  } else if(type === "glow"){
    canvas.style.cssText = `
      position:relative;min-height:40px;border-radius:20px;
      background:radial-gradient(ellipse at center,rgba(255,0,60,0.2),transparent 70%);
      animation:tgmGlowPulse 1.6s ease-in-out 2;
    `;
  } else if(type === "pulse"){
    const box = canvas.closest(".tgm-box");
    if(box){
      box.style.animation = "none";
      void box.offsetWidth; // reflow
      box.style.animation = "tgmBoxPulse 0.55s ease 3";
    }
  }
  // typewriter — no canvas animation, the text IS the animation
}

window.closeTimelineGame = function(){
  document.getElementById("timelineGameModal").classList.remove("active");
};

/* =========================
   CONTINUE WATCHING
========================= */

function addRecentMemory(memory){
  recentMemories = recentMemories.filter(m=>m.id !== memory.id);
  recentMemories.unshift(memory);
  if(recentMemories.length > 5) recentMemories.pop();
  localStorage.setItem("loveflix_recent", JSON.stringify(recentMemories));
  generateContinueWatching();
}

function generateContinueWatching(){
  const row = document.getElementById("continueWatching");
  if(!row) return;
  row.innerHTML = "";
  recentMemories.forEach(memory=>{
    row.innerHTML += `
    <div class="card" onclick="openMemory('${memory.id}')">
      <img src="${memory.hero}">
      <div class="card-overlay">
        <h3>${memory.title}</h3>
        <p>Continue Watching ❤️</p>
      </div>
    </div>`;
  });
}

/* =========================
   FAVORITES
========================= */

window.toggleFavorite = function(id){
  const memory = memories.find(m=>m.id === id);
  if(!memory) return;
  const exists = favoriteMemories.find(m=>m.id === id);
  if(exists){
    favoriteMemories = favoriteMemories.filter(m=>m.id !== id);
  } else {
    favoriteMemories.push(memory);
  }
  localStorage.setItem("loveflix_favorites", JSON.stringify(favoriteMemories));
  generateFavorites();
};

function generateFavorites(){
  const row = document.getElementById("favoriteRows");
  if(!row) return;
  row.innerHTML = "";
  favoriteMemories.forEach(memory=>{
    row.innerHTML += `
    <div class="card" onclick="openMemory('${memory.id}')">
      <img src="${memory.hero}">
      <div class="card-overlay">
        <h3>${memory.title}</h3>
      </div>
    </div>`;
  });
}

/* =========================
   GENERATE ROWS
========================= */

function generateRows(){
  const rows = document.getElementById("rows");
  if(!rows) return;
  rows.innerHTML = "";
  memories.forEach(memory=>{
    rows.innerHTML += `
    <section class="section">
      <h2>${memory.title}</h2>
      <div class="netflix-row">
        <div class="card" onclick="openMemory('${memory.id}')">
          <img src="${memory.hero}">
          <div class="card-overlay">
            <h3>${memory.title}</h3>
            <p>${memory.description}</p>
            <div class="card-actions">
              <button onclick="event.stopPropagation(); toggleFavorite('${memory.id}')">❤️ Favorite</button>
              <button onclick="event.stopPropagation(); editMemory('${memory.id}')">✏️ Edit</button>
              <button class="delete-btn" onclick="event.stopPropagation(); deleteMemory('${memory.docId}')">🗑 Delete</button>
            </div>
          </div>
        </div>
      </div>
    </section>`;
  });
}

/* =========================
   OPEN MEMORY
========================= */

window.openMemory = function(id){
  const memory = memories.find(m=>m.id === id);
  if(!memory) return;
  currentMemory = memory;
  addRecentMemory(memory);
  if(id === "private"){
    if(!PRIVATE_PROFILES.includes(currentProfile)){
      alert("This memory is private ❤️");
      return;
    }
    showPrivate();
    return;
  }
  renderMemory(memory);
};

/* =========================
   RENDER MEMORY
========================= */

function renderMemory(memory){
  const home = document.getElementById("homeScreen");
  const screen = document.getElementById("memoryScreen");
  const content = document.getElementById("memoryContent");

  if(home) home.style.display = "none";
  if(screen) screen.style.display = "block";

  let imageGallery = "";
  memory.images.forEach((img, index)=>{
    imageGallery += `
    <div class="card gallery-card" onclick='openGallery(${JSON.stringify(memory.images)}, ${index})'>
      <img src="${img}">
      <button class="img-delete-btn" onclick="event.stopPropagation(); deleteImageFromMemory(${index})">🗑</button>
      <div class="card-overlay">
        <h3>${memory.title}</h3>
        <p>${index + 1} / ${memory.images.length}</p>
      </div>
    </div>`;
  });

  let videoGallery = "";
  const videos = memory.videos || [];
  videos.forEach((vid, vIndex)=>{
    const isFav = favoriteVideos.includes(vid);
    videoGallery += `
    <div class="card gallery-card video-card" onclick="openVideo('${vid}')">
      <video src="${vid}" muted playsinline preload="metadata"></video>
      <div class="play-badge">▶</div>
      <button class="img-delete-btn" onclick="event.stopPropagation(); deleteVideoFromMemory(${vIndex})">🗑</button>
      <button class="fav-btn" onclick="event.stopPropagation(); toggleVideoFavorite('${vid}')">${isFav ? "❤️" : "🤍"}</button>
      <div class="card-overlay">
        <h3>${memory.title}</h3>
        <p>Video ${vIndex + 1} / ${videos.length}</p>
      </div>
    </div>`;
  });

  let recommendations = "";
  memories.filter(m=>m.id !== memory.id).forEach(rec=>{
    recommendations += `
    <div class="card" onclick="openMemory('${rec.id}')">
      <img src="${rec.hero}">
      <div class="card-overlay"><h3>${rec.title}</h3></div>
    </div>`;
  });

  content.innerHTML = `
  <section class="hero" style="background-image:url('${memory.hero}')">
    <div class="overlay"></div>
    <div class="hero-content">
      <h1>${memory.title}</h1>
      <p>${memory.description}</p>
      <div class="memory-meta">
        <span>📸 ${memory.images.length} images</span>
        <span>🎬 ${videos.length} videos</span>
        <span>👁 Opens: ${memory.opens || 0}</span>
      </div>
      <div class="hero-buttons">
        <button class="play-btn" onclick="addMediaToMemory()">➕ Add Media</button>
        <button class="info-btn" onclick="showHome()">← Back</button>
      </div>
    </div>
  </section>
  <section class="section">
    <h2>Gallery 📸</h2>
    <div class="netflix-row">
      ${imageGallery || '<p style="opacity:0.6;padding:20px;">No images yet.</p>'}
    </div>
  </section>
  <section class="section">
    <h2>Videos 🎬</h2>
    <div class="netflix-row">
      ${videoGallery || '<p style="opacity:0.6;padding:20px;">No videos yet. Use ➕ Add Media to upload one.</p>'}
    </div>
  </section>
  <section class="section">
    <h2>More Like This ❤️</h2>
    <div class="netflix-row">${recommendations}</div>
  </section>`;
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
  const pass = document.getElementById("passwordInput").value;
  const memory = memories.find(m=>m.id === "private");
  if(pass === "love123" && memory){
    closePasswordScreen();
    renderMemory(memory);
  } else {
    alert("Incorrect code ❤️");
  }
};

/* =========================
   SECRET TRIGGER
========================= */

window.secretTap = function(){
  const el = document.getElementById("secretMemory");
  if(el) el.style.display = "flex";
};

window.closeSecretMemory = function(){
  const el = document.getElementById("secretMemory");
  if(el) el.style.display = "none";
};

/* =========================
   IMAGE VIEWER
========================= */

window.openGallery = async function(images, index){
  currentImages = images;
  currentIndex = index;
  currentMode = "image";
  updateViewer();
  const viewer = document.getElementById("viewer");
  if(viewer){ viewer.style.display = "flex"; viewer.classList.add("active"); }
  if(currentMemory && currentMemory.docId){
    try{
      const newOpens = (currentMemory.opens || 0) + 1;
      await updateDoc(doc(db, "memories", currentMemory.docId), { opens: newOpens });
      currentMemory.opens = newOpens;
      const meta = document.querySelector(".memory-meta");
      if(meta) meta.innerHTML = meta.innerHTML.replace(/Opens:\s*\d+/, `Opens: ${newOpens}`);
    }catch(e){ console.log(e); }
  }
};

function updateViewer(){
  const image = document.getElementById("viewerImage");
  const counter = document.getElementById("imageCounter");
  const v = document.getElementById("viewerVideo");
  if(v){ v.pause(); v.style.display = "none"; }
  if(image){ image.style.display = "block"; image.src = currentImages[currentIndex]; }
  if(counter) counter.innerText = `${currentIndex + 1} / ${currentImages.length}`;
}

window.nextImage = function(){
  if(currentMode !== "image" || !currentImages.length) return;
  currentIndex = (currentIndex + 1) % currentImages.length;
  updateViewer();
};

window.prevImage = function(){
  if(currentMode !== "image" || !currentImages.length) return;
  currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
  updateViewer();
};

window.closeViewer = function(){
  const viewer = document.getElementById("viewer");
  if(viewer){ viewer.style.display = "none"; viewer.classList.remove("active"); }
  const v = document.getElementById("viewerVideo");
  if(v){ v.pause(); v.src = ""; v.style.display = "none"; }
  const image = document.getElementById("viewerImage");
  if(image) image.style.display = "block";
};

/* =========================
   VIDEO VIEWER
========================= */

window.openVideo = async function(url){
  currentMode = "video";
  const viewer = document.getElementById("viewer");
  const image = document.getElementById("viewerImage");
  if(image) image.style.display = "none";
  let v = document.getElementById("viewerVideo");
  if(!v){
    v = document.createElement("video");
    v.id = "viewerVideo";
    v.controls = true;
    v.autoplay = true;
    v.style.maxWidth = "90vw";
    v.style.maxHeight = "85vh";
    v.style.borderRadius = "12px";
    v.style.boxShadow = "0 0 40px rgba(255,0,60,0.4)";
    if(image && image.parentNode) image.parentNode.appendChild(v);
    else if(viewer) viewer.appendChild(v);
  }
  v.src = url;
  v.style.display = "block";
  v.play().catch(()=>{});
  if(viewer){ viewer.style.display = "flex"; viewer.classList.add("active"); }
  if(currentMemory && currentMemory.docId){
    try{
      const newOpens = (currentMemory.opens || 0) + 1;
      await updateDoc(doc(db, "memories", currentMemory.docId), { opens: newOpens });
      currentMemory.opens = newOpens;
      const meta = document.querySelector(".memory-meta");
      if(meta) meta.innerHTML = meta.innerHTML.replace(/Opens:\s*\d+/, `Opens: ${newOpens}`);
    }catch(e){ console.log(e); }
  }
};

/* =========================
   CREATE PANEL
========================= */

window.openCreator = function(){
  document.getElementById("creatorPanel").classList.add("active");
};

window.closeCreator = function(){
  document.getElementById("creatorPanel").classList.remove("active");
};

/* =========================
   CREATE MEMORY
========================= */

window.createMemory = async function(){
  const title = document.getElementById("memoryTitle").value;
  const description = document.getElementById("memoryDescription").value;
  const imageInput = document.getElementById("memoryImage");

  if(!title || !description || !imageInput.files[0]){
    alert("Fill all fields ❤️");
    return;
  }

  const file = imageInput.files[0];
  showUploadProgress("Creating your memory...");

  try{
    const data = await uploadToCloudinary(file, pct => setUploadProgress(pct, "Uploading cover image..."));
    const imageURL = data.secure_url;
    setUploadProgress(100, "Saving to our memories...");

    const newMemory = {
      id: title.toLowerCase().replaceAll(" ", "-"),
      title,
      description,
      hero: imageURL,
      images: [imageURL],
      videos: [],
      tags: ["New"],
      opens: 0,
      favoriteCount: 0
    };

    await addDoc(collection(db, "memories"), newMemory);
    await refreshApp();
    hideUploadProgress();
    closeCreator();
    document.getElementById("memoryTitle").value = "";
    document.getElementById("memoryDescription").value = "";
    document.getElementById("memoryImage").value = "";
    showHome();
    alert("Memory Created ❤️");
  }catch(error){
    hideUploadProgress();
    console.log(error);
    alert("Upload failed ❤️ — " + error.message);
  }
};

/* =========================
   DELETE MEMORY
========================= */

window.deleteMemory = async function(docId){
  if(!confirm("Delete this memory forever? ❤️")) return;
  try{
    await deleteDoc(doc(db, "memories", docId));
    await refreshApp();
  }catch(error){
    console.log(error);
    alert("Delete failed ❤️");
  }
};

/* =========================
   EDIT MEMORY
========================= */

window.editMemory = async function(id){
  const memory = memories.find(m => m.id === id);
  if(!memory) return;
  const newTitle = prompt("New title:", memory.title);
  if(newTitle === null) return;
  const newDesc = prompt("New description:", memory.description);
  if(newDesc === null) return;
  try{
    await updateDoc(doc(db, "memories", memory.docId), {
      title: newTitle.trim() || memory.title,
      description: newDesc.trim() || memory.description
    });
    await refreshApp();
  }catch(error){
    console.log(error);
    alert("Update failed ❤️");
  }
};

/* =========================
   ADD MEDIA
   Images: up to 10 at once
   Video: one at a time, up to 500MB with chunked upload
========================= */

window.addMediaToMemory = function(){
  if(!currentMemory) return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,video/*";
  input.multiple = true;

  input.onchange = async () => {
    const files = Array.from(input.files);
    if(!files.length) return;

    const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
    const MAX_IMAGE_COUNT = 10;

    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    const videoFiles = files.filter(f => f.type.startsWith("video/"));

    if(imageFiles.length > MAX_IMAGE_COUNT){
      alert(`Max ${MAX_IMAGE_COUNT} images at a time ❤️`);
      return;
    }
    if(videoFiles.length > 1){
      alert("Upload one video at a time ❤️");
      return;
    }
    for(const vf of videoFiles){
      if(vf.size > MAX_VIDEO_BYTES){
        alert(`"${vf.name}" is too large (max 500MB) ❤️`);
        return;
      }
    }

    let uploadedImages = [...currentMemory.images];
    let uploadedVideos = [...(currentMemory.videos || [])];

    try{
      // Upload images sequentially with per-file progress
      for(let i = 0; i < imageFiles.length; i++){
        const file = imageFiles[i];
        const label = imageFiles.length > 1
          ? `Uploading image ${i + 1} of ${imageFiles.length}...`
          : "Uploading image...";
        if(i === 0) showUploadProgress(label);
        else setUploadProgress(0, label);

        const data = await uploadToCloudinary(file, pct => setUploadProgress(pct, label));
        uploadedImages.push(data.secure_url);
      }

      // Upload video
      if(videoFiles.length === 1){
        const vFile = videoFiles[0];
        const isLarge = vFile.size > 100 * 1024 * 1024;
        showUploadProgress(
          isLarge
            ? "Uploading large video in chunks... ❤️"
            : "Uploading video..."
        );
        const data = await uploadToCloudinary(vFile, pct =>{
          setUploadProgress(pct, `Uploading video... ${Math.round(pct)}%`);
        });
        uploadedVideos.push(data.secure_url);
      }

      setUploadProgress(100, "Saving...");

      await updateDoc(doc(db, "memories", currentMemory.docId), {
        images: uploadedImages,
        videos: uploadedVideos,
        hero: uploadedImages[0] || currentMemory.hero
      });

      await loadMemories();
      currentMemory = memories.find(m => m.id === currentMemory.id);
      hideUploadProgress();
      renderMemory(currentMemory);

    }catch(error){
      hideUploadProgress();
      console.log(error);
      alert("Upload failed ❤️ — " + error.message);
    }
  };

  input.click();
};

/* =========================
   DELETE IMAGE FROM MEMORY
========================= */

window.deleteImageFromMemory = async function(index){
  if(!currentMemory) return;
  if(!confirm("Remove this image? ❤️")) return;
  const updated = currentMemory.images.filter((_, i) => i !== index);
  try{
    await updateDoc(doc(db, "memories", currentMemory.docId), {
      images: updated,
      hero: updated[0] || currentMemory.hero
    });
    await loadMemories();
    currentMemory = memories.find(m => m.id === currentMemory.id);
    renderMemory(currentMemory);
  }catch(error){
    console.log(error);
    alert("Delete failed ❤️");
  }
};

/* =========================
   DELETE VIDEO FROM MEMORY
========================= */

window.deleteVideoFromMemory = async function(index){
  if(!currentMemory) return;
  if(!confirm("Remove this video? ❤️")) return;
  const updated = (currentMemory.videos || []).filter((_, i) => i !== index);
  try{
    await updateDoc(doc(db, "memories", currentMemory.docId), { videos: updated });
    await loadMemories();
    currentMemory = memories.find(m => m.id === currentMemory.id);
    renderMemory(currentMemory);
  }catch(error){
    console.log(error);
    alert("Delete failed ❤️");
  }
};

/* =========================
   FAVORITE A VIDEO
========================= */

window.toggleVideoFavorite = function(url){
  if(favoriteVideos.includes(url)){
    favoriteVideos = favoriteVideos.filter(u => u !== url);
  } else {
    favoriteVideos.push(url);
  }
  localStorage.setItem("loveflix_fav_videos", JSON.stringify(favoriteVideos));
  if(currentMemory) renderMemory(currentMemory);
};
