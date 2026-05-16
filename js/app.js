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
/* =========================
   LOVEFLIX — JS ADDITIONS
   Paste this entire block at the BOTTOM of app.js
   (after the last line: toggleVideoFavorite function)
========================= */

/* =========================
   CUSTOM CURSOR
========================= */

(function initCursor(){
  const cursor = document.getElementById("customCursor");
  const ring = document.getElementById("customCursorRing");
  if(!cursor || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener("mousemove", e => {
    mx = e.clientX; my = e.clientY;
    cursor.style.left = mx + "px";
    cursor.style.top = my + "px";
  });

  // Ring follows with lag
  function animRing(){
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    ring.style.left = rx + "px";
    ring.style.top = ry + "px";
    requestAnimationFrame(animRing);
  }
  animRing();

  // Enlarge ring on hoverable elements
  document.addEventListener("mouseover", e => {
    if(e.target.closest("button, a, .card, .game-card, .timeline-item, .profile-card")){
      ring.style.width = "55px";
      ring.style.height = "55px";
      ring.style.borderColor = "rgba(255,0,60,0.8)";
    } else {
      ring.style.width = "38px";
      ring.style.height = "38px";
      ring.style.borderColor = "rgba(255,0,60,0.5)";
    }
  });

  document.addEventListener("mousedown", () => {
    cursor.style.transform = "translate(-50%,-50%) scale(0.6)";
  });
  document.addEventListener("mouseup", () => {
    cursor.style.transform = "translate(-50%,-50%) scale(1)";
  });
})();

/* =========================
   HERO RIPPLE ON BUTTON
========================= */

window.addHeroRipple = function(e){
  const btn = e.currentTarget;
  const ripple = document.createElement("span");
  ripple.className = "btn-ripple";
  const size = Math.max(btn.offsetWidth, btn.offsetHeight) * 2;
  const rect = btn.getBoundingClientRect();
  ripple.style.cssText = `
    width:${size}px; height:${size}px;
    left:${e.clientX - rect.left - size/2}px;
    top:${e.clientY - rect.top - size/2}px;
  `;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 700);
};

/* =========================
   HERO FLOATING PARTICLES
========================= */

(function initParticles(){
  const container = document.getElementById("heroParticles");
  if(!container) return;

  function spawnParticle(){
    const p = document.createElement("div");
    p.className = "hero-particle";
    const size = 2 + Math.random() * 4;
    const duration = 7 + Math.random() * 10;
    const delay = Math.random() * 5;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      animation-duration:${duration}s;
      animation-delay:${delay}s;
      opacity:${0.3 + Math.random() * 0.5};
    `;
    container.appendChild(p);
    setTimeout(() => p.remove(), (duration + delay) * 1000);
  }

  for(let i = 0; i < 18; i++) spawnParticle();
  setInterval(spawnParticle, 900);
})();

/* =========================
   NAVBAR SCROLL EFFECT
========================= */

(function initNavbarScroll(){
  const navbar = document.getElementById("navbar");
  if(!navbar) return;
  window.addEventListener("scroll", () => {
    if(window.scrollY > 60){
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
  });
})();

/* =========================
   SCROLL REVEAL
========================= */

(function initScrollReveal(){
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if(entry.isIntersecting){
        setTimeout(() => {
          entry.target.classList.add("revealed");
        }, i * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  function observeAll(){
    document.querySelectorAll(".reveal-on-scroll:not(.revealed)").forEach(el => {
      observer.observe(el);
    });
  }

  observeAll();
  // Re-run after memories load
  setTimeout(observeAll, 2000);
  setTimeout(observeAll, 4000);
})();

/* =========================
   HERO STAT COUNTER ANIMATION
========================= */

function animateCounter(el, target, duration){
  if(!el) return;
  let start = 0;
  const step = target / (duration / 16);
  function tick(){
    start += step;
    if(start >= target){
      el.textContent = target;
      return;
    }
    el.textContent = Math.floor(start);
    requestAnimationFrame(tick);
  }
  tick();
}

// Hook into refreshApp — update hero stats after memories load
const _originalRefreshApp = window._refreshAppHooked;
const _heroStatsUpdate = function(){
  setTimeout(() => {
    const countEl = document.getElementById("heroStatMemories");
    if(countEl && typeof memories !== "undefined"){
      animateCounter(countEl, memories.length, 800);
    }
  }, 500);
};

// Intercept: call after each refresh
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(_heroStatsUpdate, 3500);
});

/* Override refreshApp to also update stats */
const _nativeRefreshApp = window.refreshApp;
window.refreshApp = async function(){
  if(typeof refreshApp_internal === "function") await refreshApp_internal();
  _heroStatsUpdate();
};

/* =========================
   TIMELINE GAME ANIMATION — UPGRADED
   Replaces triggerTGMAnimation in app.js
   This is a full upgrade — paste over the existing triggerTGMAnimation function
   OR just paste this here since it redefines it
========================= */

window.triggerTGMAnimation = function(type){
  const canvas = document.getElementById("tgmAnimCanvas");
  if(!canvas) return;
  canvas.innerHTML = "";
  canvas.style.cssText = "position:relative; min-height:10px; overflow:hidden; border-radius:20px;";

  // Inject shared keyframes once
  if(!document.getElementById("tgmAnimStylesV2")){
    const s = document.createElement("style");
    s.id = "tgmAnimStylesV2";
    s.textContent = `
      @keyframes tgmFloat{
        0%{opacity:0;transform:translateY(0) scale(0.4) rotate(var(--rot,0deg));}
        15%{opacity:1;}
        85%{opacity:0.6;}
        100%{opacity:0;transform:translateY(-90px) scale(1.1) rotate(calc(var(--rot,0deg) + 30deg));}
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
      @keyframes tgmLetterDrop{
        0%{opacity:0;transform:translateY(-20px) rotate(-8deg);}
        60%{opacity:1;transform:translateY(4px) rotate(2deg);}
        80%{transform:translateY(-2px) rotate(-1deg);}
        100%{opacity:1;transform:translateY(0) rotate(0deg);}
      }
      @keyframes tgmStarSpin{
        0%{opacity:0;transform:translate(-50%,-50%) scale(0) rotate(0deg);}
        40%{opacity:1;transform:translate(-50%,-50%) scale(1.2) rotate(180deg);}
        100%{opacity:0;transform:translate(-50%,-50%) scale(0.5) rotate(360deg);}
      }
      @keyframes tgmShimmer{
        0%{background-position:200% center;}
        100%{background-position:-200% center;}
      }
      @keyframes tgmHeartBeat{
        0%,100%{transform:scale(1);}
        25%{transform:scale(1.3);}
        50%{transform:scale(1.1);}
        75%{transform:scale(1.25);}
      }
      @keyframes tgmWave{
        0%{transform:translateX(-100%);}
        100%{transform:translateX(100%);}
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
    // Animated heart burst with letter-by-letter reveal effect
    canvas.style.minHeight = "80px";

    const emojis = ["❤️","🩷","💕","💗","💖","🌹","💝","💓"];
    for(let i = 0; i < 22; i++){
      const h = document.createElement("span");
      h.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      const rot = (Math.random() - 0.5) * 40;
      h.style.cssText = `
        position:absolute;
        font-size:${11 + Math.random() * 18}px;
        left:${3 + Math.random() * 94}%;
        bottom:${Math.random() * 15}%;
        --rot:${rot}deg;
        animation:tgmFloat ${1.6 + Math.random() * 2}s ease-out forwards;
        animation-delay:${Math.random() * 1}s;
        pointer-events:none;
        filter:drop-shadow(0 0 4px rgba(255,0,60,0.5));
      `;
      canvas.appendChild(h);
    }

    // Pulsing hearts on the tgm-box
    const box = canvas.closest(".tgm-box");
    if(box){
      box.style.animation = "none";
      void box.offsetWidth;
      box.style.animation = "tgmHeartBeat 0.6s ease 2";
    }

  } else if(type === "sparks"){
    // Dramatic spark burst radiating outward
    canvas.style.minHeight = "70px";

    const center = document.createElement("div");
    center.style.cssText = `
      position:absolute; left:50%; top:50%;
      width:20px; height:20px;
      border-radius:50%;
      background:#ff003c;
      transform:translate(-50%,-50%) scale(0);
      animation:tgmStarSpin 0.9s ease forwards;
      box-shadow:0 0 30px #ff003c;
      pointer-events:none;
    `;
    canvas.appendChild(center);

    for(let i = 0; i < 26; i++){
      const s = document.createElement("div");
      const angle = (i / 26) * Math.PI * 2;
      const dist = 40 + Math.random() * 60;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 20;
      s.style.cssText = `
        position:absolute;
        width:${2 + Math.random() * 6}px;
        height:${2 + Math.random() * 6}px;
        border-radius:50%;
        background:hsl(${330 + Math.random() * 40},100%,${50+Math.random()*25}%);
        left:${48 + Math.random() * 4}%;
        top:${40 + Math.random() * 20}%;
        --tx:${tx}px; --ty:${ty}px;
        animation:tgmSpark ${0.6 + Math.random() * 0.9}s ease-out forwards;
        animation-delay:${0.1 + Math.random() * 0.4}s;
        pointer-events:none;
        box-shadow:0 0 6px currentColor;
      `;
      canvas.appendChild(s);
    }

  } else if(type === "glow"){
    // Shimmer wave sweep across the modal
    canvas.style.cssText = `
      position:relative; min-height:14px; border-radius:20px; overflow:hidden;
    `;

    const shimmer = document.createElement("div");
    shimmer.style.cssText = `
      position:absolute; inset:0;
      background:linear-gradient(90deg,
        transparent 0%,
        rgba(255,0,60,0.25) 30%,
        rgba(255,107,157,0.35) 50%,
        rgba(255,0,60,0.25) 70%,
        transparent 100%);
      background-size:200% 100%;
      animation:tgmShimmer 1.2s ease 2;
      border-radius:20px;
      pointer-events:none;
    `;
    canvas.appendChild(shimmer);

    // Also glow the box border
    const box = canvas.closest(".tgm-box");
    if(box){
      box.style.transition = "box-shadow 0.4s ease";
      box.style.boxShadow = "0 0 0 2px rgba(255,0,60,0.5), 0 40px 100px rgba(255,0,60,0.4)";
      setTimeout(() => { box.style.boxShadow = "0 40px 100px rgba(255,0,60,0.25)"; }, 1600);
    }

  } else if(type === "pulse"){
    // Full screen flash + concentric rings
    const flash = document.createElement("div");
    flash.style.cssText = `
      position:fixed; inset:0; pointer-events:none;
      background:radial-gradient(ellipse at center, rgba(255,0,60,0.12), transparent 60%);
      animation:tgmGlowPulse 0.7s ease 2;
      z-index:99;
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1600);

    // Ripple rings
    canvas.style.cssText = "position:relative; min-height:60px; overflow:hidden; border-radius:20px;";
    for(let i = 0; i < 3; i++){
      const ring = document.createElement("div");
      ring.style.cssText = `
        position:absolute;
        left:50%; top:50%;
        width:20px; height:20px;
        border:2px solid rgba(255,0,60,${0.7 - i * 0.2});
        border-radius:50%;
        transform:translate(-50%,-50%) scale(0);
        animation:tgmBoxPulse ${0.8 + i * 0.3}s ease ${i * 0.15}s 2;
        pointer-events:none;
      `;
      canvas.appendChild(ring);
    }

  } else if(type === "typewriter"){
    // Letter-by-letter drop from above with staggered timing
    canvas.style.cssText = "position:relative; min-height:50px; overflow:visible; border-radius:20px; display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:4px; padding:10px 0;";

    const words = ["still", "yours", "❤️"];
    words.forEach((word, wi) => {
      const wordEl = document.createElement("div");
      wordEl.style.cssText = "display:flex; gap:1px;";
      [...word].forEach((char, ci) => {
        const letterEl = document.createElement("span");
        letterEl.textContent = char;
        letterEl.style.cssText = `
          display:inline-block;
          font-size:${wi === 2 ? 1.4 : 1.0}rem;
          color:${wi === 2 ? "#ff003c" : "#ffb3c1"};
          opacity:0;
          animation:tgmLetterDrop 0.4s cubic-bezier(.2,.8,.2,1) forwards;
          animation-delay:${(wi * 4 + ci) * 0.06 + 0.1}s;
          filter:drop-shadow(0 0 8px rgba(255,0,60,0.6));
          ${wi === 2 ? "font-size:1.6rem;" : ""}
        `;
        wordEl.appendChild(letterEl);
      });
      canvas.appendChild(wordEl);
    });
  }
};

/* =========================
   MINI GAMES SYSTEM
========================= */

window.openGame = function(gameId){
  const modal = document.getElementById("gameModal");
  const content = document.getElementById("gameContent");
  if(!modal || !content) return;

  modal.classList.add("active");

  switch(gameId){
    case "lovemeter": renderLoveMeter(content); break;
    case "match":     renderMemoryMatch(content); break;
    case "truth":     renderTruthBomb(content); break;
    case "wyr":       renderWouldYouRather(content); break;
  }
};

window.closeGame = function(){
  const modal = document.getElementById("gameModal");
  if(modal) modal.classList.remove("active");
};

/* ---- LOVE METER ---- */
function renderLoveMeter(el){
  el.innerHTML = `
    <h2>Love Meter 💘</h2>
    <p class="game-sub">Let the universe calculate what we already know.</p>
    <div class="love-meter-wrap">
      <div class="love-meter-names">
        <span>Budhdhu</span><span>Omen</span>
      </div>
      <div class="love-meter-bar-outer">
        <div class="love-meter-bar-fill" id="lmFill"></div>
      </div>
      <span class="love-meter-pct" id="lmPct">—</span>
      <div class="love-meter-result" id="lmResult"></div>
    </div>
    <button class="love-meter-btn" onclick="runLoveMeter()">Calculate ❤️</button>
  `;
}

const loveMeterResults = [
  { pct: 99, text: "Of course it's almost perfect. Almost — because nothing real is ever exactly perfect. And that's exactly why this is ours." },
  { pct: 100, text: "The algorithm broke trying to calculate it. 100% and climbing. Science gave up. We didn't." },
  { pct: 97, text: "97% compatible. The remaining 3% is just you being stubborn. Which honestly makes this better." },
  { pct: 98, text: "98% — because we are the kind of danger the universe keeps warning people about but never actually stops." },
  { pct: 96, text: "Dangerously, irreversibly, catastrophically in love. That's what 96% looks like when it's real." },
];

window.runLoveMeter = function(){
  const fill = document.getElementById("lmFill");
  const pct = document.getElementById("lmPct");
  const result = document.getElementById("lmResult");
  if(!fill) return;

  fill.style.width = "0%";
  pct.textContent = "...";
  result.textContent = "";

  const chosen = loveMeterResults[Math.floor(Math.random() * loveMeterResults.length)];

  setTimeout(() => {
    fill.style.width = chosen.pct + "%";
    // Animate number
    let n = 0;
    const step = chosen.pct / 60;
    const tick = setInterval(() => {
      n += step;
      if(n >= chosen.pct){
        n = chosen.pct;
        clearInterval(tick);
        setTimeout(() => {
          result.textContent = chosen.text;
        }, 300);
      }
      pct.textContent = Math.floor(n) + "%";
    }, 25);
  }, 300);
};

/* ---- MEMORY MATCH ---- */
const matchEmojis = ["❤️","🌙","🔥","💋","🌹","🥂","💌","✨"];

function renderMemoryMatch(el){
  let pairs = [...matchEmojis, ...matchEmojis];
  pairs = pairs.sort(() => Math.random() - 0.5);

  el.innerHTML = `
    <h2>Memory Match 🃏</h2>
    <div class="match-score">Matches: <span id="matchCount">0</span> / 8</div>
    <div class="match-grid" id="matchGrid">
      ${pairs.map((emoji, i) => `
        <div class="match-card" data-emoji="${emoji}" data-index="${i}" onclick="flipMatchCard(this)">
          <span class="card-face">${emoji}</span>
        </div>
      `).join("")}
    </div>
    <div id="matchWin" style="display:none; margin-top:16px; color:#ff6b9d; font-style:italic; font-size:1rem;">
      You matched everything perfectly. Like you always do with me ❤️
    </div>
  `;

  window._matchState = { flipped: [], matched: 0, locked: false };
}

window.flipMatchCard = function(card){
  const state = window._matchState;
  if(state.locked || card.classList.contains("flipped") || card.classList.contains("matched")) return;

  card.classList.add("flipped");
  state.flipped.push(card);

  if(state.flipped.length === 2){
    state.locked = true;
    const [a, b] = state.flipped;
    if(a.dataset.emoji === b.dataset.emoji && a.dataset.index !== b.dataset.index){
      // Match
      setTimeout(() => {
        a.classList.add("matched");
        b.classList.add("matched");
        state.matched++;
        document.getElementById("matchCount").textContent = state.matched;
        state.flipped = [];
        state.locked = false;
        if(state.matched === 8){
          document.getElementById("matchWin").style.display = "block";
        }
      }, 400);
    } else {
      // No match
      setTimeout(() => {
        a.classList.add("wrong-shake");
        b.classList.add("wrong-shake");
        setTimeout(() => {
          a.classList.remove("flipped", "wrong-shake");
          b.classList.remove("flipped", "wrong-shake");
          state.flipped = [];
          state.locked = false;
        }, 450);
      }, 600);
    }
  }
};

/* ---- TRUTH BOMB ---- */
const truthQuestions = [
  { q: "What's one thing about me you'd never change?", answers: {
    yes: "And I'd never let you try to change it either. That thing you love? That's just me being made for you.",
    no: "Interesting. You hesitated. That means you already know. ❤️"
  }},
  { q: "If I texted you right now — would you smile before you even read it?", answers: {
    yes: "Good. Because I smiled sending it. This is just what we are now.",
    no: "Liar. I saw that look on your face. You absolutely would. ❤️"
  }},
  { q: "Honestly — do you think about me when I'm not there?", answers: {
    yes: "I think about you too. More than makes sense. More than I can explain.",
    no: "Somehow I don't believe that at all. Your face does not match your answer. ❤️"
  }},
  { q: "Would you rather fight with me or not talk to me for a whole day?", answers: {
    yes: "Fighting it is. At least that means we're both fully in it.",
    no: "See — you chose silence. Which means you'd actually miss me. I knew it."
  }},
  { q: "Is there a version of your life where you don't choose me?", answers: {
    yes: "Careful. That's the only dangerous answer you've given me.",
    no: "Good. Because in every version of mine — it's always you. Without question."
  }},
  { q: "What's the one memory of us that you keep going back to?", answers: {
    yes: "The beginning. That one moment where everything shifted and we both knew.",
    no: "You're not ready to say it out loud yet. But I already know. ❤️"
  }},
];

let truthIndex = 0;

function renderTruthBomb(el){
  truthIndex = Math.floor(Math.random() * truthQuestions.length);
  renderTruthQuestion(el);
}

function renderTruthQuestion(el){
  const q = truthQuestions[truthIndex];
  el.innerHTML = `
    <h2>Truth Bomb 💣</h2>
    <p class="game-sub">Omen is asking. No running allowed.</p>
    <div class="truth-question">"${q.q}"</div>
    <div class="truth-btns">
      <button class="truth-btn" onclick="answerTruth('yes')">Yes ❤️</button>
      <button class="truth-btn" onclick="answerTruth('no')">No...</button>
    </div>
    <div class="truth-response" id="truthResp"></div>
    <button class="wyr-next-btn" id="truthNext" onclick="nextTruth()" style="display:none; margin-top:16px;">
      Next question →
    </button>
  `;
  window._truthEl = el;
}

window.answerTruth = function(choice){
  const q = truthQuestions[truthIndex];
  const resp = document.getElementById("truthResp");
  const btns = document.querySelectorAll(".truth-btn");
  const nextBtn = document.getElementById("truthNext");
  btns.forEach(b => { b.style.pointerEvents = "none"; b.style.opacity = "0.4"; });
  resp.textContent = q.answers[choice] || q.answers.yes;
  setTimeout(() => resp.classList.add("visible"), 100);
  if(nextBtn) nextBtn.style.display = "inline-block";
};

window.nextTruth = function(){
  truthIndex = (truthIndex + 1) % truthQuestions.length;
  if(window._truthEl) renderTruthQuestion(window._truthEl);
};

/* ---- WOULD YOU RATHER ---- */
const wyrQuestions = [
  {
    a: "Know exactly what I'm thinking about you right now",
    b: "Never know but feel it in everything I do",
    ra: "Knowing is terrifying. Feeling it is the whole point. You chose to *know* me — and honestly, that makes sense.",
    rb: "Feeling it in everything — that's the smarter answer. Because I show you every single day anyway."
  },
  {
    a: "Have one hour together fully perfect and then it ends",
    b: "Have a messy, complicated forever with me",
    ra: "One perfect hour. That's the most heartbreaking answer. But also the most romantic. I'd make it count.",
    rb: "Messy forever. Correct. We were never going to be clean or easy anyway."
  },
  {
    a: "Read all my old journal entries about you",
    b: "Never know what I've written but I keep writing",
    ra: "You want to know. Of course you do. And I've written things about you that would ruin you in the best possible way.",
    rb: "The mystery version. Wiser. Because what I've written is dangerous territory. ❤️"
  },
  {
    a: "Be the one who loves a little more",
    b: "Be the one who is loved a little more",
    ra: "Loving more is brave. And also very you. This doesn't surprise me at all.",
    rb: "Being loved more. Honestly valid. Sit in it. You deserve every bit of it."
  },
  {
    a: "Fight with me and fix it the same night",
    b: "Never fight but also never go that deep",
    ra: "Fight and fix. We chose chaos. We always did. At least it means we care enough to argue.",
    rb: "Surface-level peace or real messy love — you chose the easy version. I don't believe it for a second. ❤️"
  },
];

let wyrIndex = 0;

function renderWouldYouRather(el){
  wyrIndex = Math.floor(Math.random() * wyrQuestions.length);
  renderWyrQuestion(el);
}

function renderWyrQuestion(el){
  const q = wyrQuestions[wyrIndex];
  el.innerHTML = `
    <h2>Would You Rather 🔥</h2>
    <p class="game-sub">Pick one. No explaining yourself.</p>
    <div class="wyr-options">
      <div class="wyr-opt" onclick="chooseWyr(this, 'a')">${q.a}</div>
      <div class="wyr-opt" onclick="chooseWyr(this, 'b')">${q.b}</div>
    </div>
    <div class="wyr-result" id="wyrResult"></div>
    <button class="wyr-next-btn" id="wyrNext" onclick="nextWyr()">Next →</button>
  `;
  window._wyrEl = el;
}

window.chooseWyr = function(el, choice){
  const q = wyrQuestions[wyrIndex];
  document.querySelectorAll(".wyr-opt").forEach(o => {
    o.style.pointerEvents = "none";
    o.style.opacity = "0.4";
  });
  el.style.opacity = "1";
  el.classList.add("chosen");

  const result = document.getElementById("wyrResult");
  const next = document.getElementById("wyrNext");
  result.textContent = choice === "a" ? q.ra : q.rb;
  setTimeout(() => result.classList.add("visible"), 100);
  if(next) next.classList.add("visible");
};

window.nextWyr = function(){
  wyrIndex = (wyrIndex + 1) % wyrQuestions.length;
  if(window._wyrEl) renderWyrQuestion(window._wyrEl);
};

/* =========================
   CLOSE GAME MODAL ON BACKDROP CLICK
========================= */

document.addEventListener("click", function(e){
  const modal = document.getElementById("gameModal");
  if(modal && e.target === modal){
    closeGame();
  }
});
/* =========================
   PASTE THIS AT THE BOTTOM OF app_additions.js
   (after the closeGame backdrop click handler)

   DYNAMIC TIMELINE SYSTEM
   — Relationship start: 27 October 2024
   — Milestones auto-unlock based on real date
   — Future milestones stay locked until their date arrives
   — New year milestones auto-generate forever
========================= */

/* =========================
   RELATIONSHIP START DATE
========================= */

const REL_START = new Date("2024-10-27T00:00:00");

/* =========================
   RELATIONSHIP DURATION HELPERS
========================= */

function getRelDuration(){
  const now = new Date();
  const ms = now - REL_START;

  const totalDays = Math.floor(ms / (1000 * 60 * 60 * 24));
  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);
  const days = totalDays % 30;

  let parts = [];
  if(years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if(months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if(days > 0 || parts.length === 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);

  return {
    text: parts.join(", "),
    totalDays,
    years,
    months
  };
}

/* =========================
   MILESTONE DEFINITIONS
   Each milestone has a `unlockDate` — Date object.
   If unlockDate <= today: UNLOCKED (show fully)
   If unlockDate <= today + 60 days: UNLOCKING SOON (teased)
   If unlockDate > today + 60 days: LOCKED (blurred)
========================= */

function buildMilestones(){
  const start = REL_START;

  // Helper: add months to a date
  function addMonths(d, m){
    const r = new Date(d);
    r.setMonth(r.getMonth() + m);
    return r;
  }

  function addYears(d, y){
    const r = new Date(d);
    r.setFullYear(r.getFullYear() + y);
    return r;
  }

  function fmt(d){
    return d.toLocaleDateString("en-IN", { year:"numeric", month:"long", day:"numeric" });
  }

  function fmtYear(d){
    return d.getFullYear().toString();
  }

  const milestones = [];

  // ─── FIXED EARLY MILESTONES ───────────────────────────────

  milestones.push({
    unlockDate: start,
    year: fmtYear(start),
    title: "We Found Trouble ❤️",
    desc: "Two strangers becoming dangerously attached. The beginning of an addiction neither of us wanted to escape.",
    secret: "You walked in and ruined every standard I ever had. Completely. Irreversibly. And I'd let you do it again.",
    gameIndex: 0,
    icon: "❤️"
  });

  milestones.push({
    unlockDate: addMonths(start, 1),
    year: fmtYear(addMonths(start, 1)),
    title: "The First Time We Met 🌙",
    desc: "The nervous tension. The first touch. The first time wanting someone that intensely.",
    secret: "I remember thinking — this is going to be dangerous. And then choosing you anyway. Every single time after that.",
    gameIndex: 1,
    icon: "🌙"
  });

  milestones.push({
    unlockDate: addMonths(start, 6),
    year: fmtYear(addMonths(start, 6)),
    title: "Six Months Deep 🔥",
    desc: "Half a year in. Still completely consumed. Late nights, rough love, soft moments after.",
    secret: "Late nights where I forgot where I ended and you began. Messy, tangled, completely lost in you — the best kind of lost.",
    gameIndex: 2,
    icon: "🔥"
  });

  // ─── DYNAMIC YEARLY MILESTONES ────────────────────────────
  // Generates for year 1, 2, 3... up to 10 years from start

  const yearlyData = [
    {
      title: "One Year ❤️",
      desc: "A whole year of choosing each other. Of surviving every season together. Still obsessed.",
      secret: "One year and I still reach for you first. In the dark. In every quiet moment that belongs only to us.",
      gameIndex: 3,
      icon: "🥂"
    },
    {
      title: "Two Years — Still Starving ❤️",
      desc: "Still obsessed. Still attached. Still wanting you in every possible way.",
      secret: "Two years and the craving only got worse. That's not a problem. That's just what we are.",
      gameIndex: 4,
      icon: "💋"
    },
    {
      title: "Three Years of This Beautiful Chaos 🌹",
      desc: "Three years of dangerously loving each other. Of becoming each other's permanent habit.",
      secret: "Three years down and I still don't have the words for what this is. I just know I'm not done.",
      gameIndex: 0,
      icon: "🌹"
    },
    {
      title: "Four Years — Irreversibly Yours ❤️",
      desc: "Four years. Four versions of us. Every one of them worth it.",
      secret: "Four years and every argument, every soft night, every ridiculous moment made me more certain. It's you.",
      gameIndex: 1,
      icon: "❤️‍🔥"
    },
    {
      title: "Five Years — Half a Decade of Us 🔥",
      desc: "Half a decade of choosing the same person. Of turning into each other slowly.",
      secret: "Five years. I'd do every single day of it again. Even the hard ones. Especially the hard ones.",
      gameIndex: 2,
      icon: "✨"
    },
    {
      title: "Six Years Deep 💌",
      desc: "Six years of secrets, inside jokes, and a love that keeps getting more complicated in the best way.",
      secret: "Six years and you still surprise me. That's not something that happens to just anyone.",
      gameIndex: 3,
      icon: "💌"
    },
    {
      title: "Seven Years — Still Addicted 🌙",
      desc: "Seven years of being each other's most dangerous comfort zone.",
      secret: "Seven years and this addiction shows no signs of fading. I've stopped wanting it to.",
      gameIndex: 4,
      icon: "🌙"
    },
    {
      title: "Eight Years — Written In Everything 🔥",
      desc: "Eight years of being woven into each other's story so deeply neither of us could tell where one ends.",
      secret: "Eight years and I still can't explain you to anyone who asks. Because some things aren't meant to be explained.",
      gameIndex: 0,
      icon: "🔥"
    },
    {
      title: "Nine Years — Almost A Decade ❤️",
      desc: "Almost ten years of this. Of us. Of the specific chaos only we could build.",
      secret: "Nine years in and I love you with the same hunger I had at the start. More, actually.",
      gameIndex: 1,
      icon: "❤️"
    },
    {
      title: "Ten Years — A Whole Decade ❤️‍🔥",
      desc: "Ten years. A full decade of choosing each other every single day. Extraordinary.",
      secret: "Ten years and this still doesn't feel like enough time. That's the most romantic thing I've ever admitted.",
      gameIndex: 2,
      icon: "🥂"
    },
  ];

  for(let y = 1; y <= 10; y++){
    const anniversaryDate = addYears(start, y);
    const data = yearlyData[y - 1] || {
      title: `${y} Years Together ❤️`,
      desc: `${y} years of choosing each other. Of becoming something neither of us could have predicted.`,
      secret: `${y} years and I still don't have the right word for what you are to me. But I'm not stopping.`,
      gameIndex: y % 5,
      icon: "❤️"
    };

    milestones.push({
      unlockDate: anniversaryDate,
      year: fmtYear(anniversaryDate),
      ...data
    });
  }

  // ─── BIRTHDAY MILESTONE (Budhdhu's birthday) ──────────────
  // Adjust this date to her actual birthday
  // This adds every year automatically
  const BIRTHDAY_MONTH = 9; // September = 9 (0-indexed)
  const BIRTHDAY_DAY = 23;  // ← CHANGE THIS to her actual birthday day

  const now = new Date();
  let bdayYear = now.getFullYear();
  let bdayThisYear = new Date(bdayYear, BIRTHDAY_MONTH, BIRTHDAY_DAY);
  if(bdayThisYear < REL_START) bdayYear++;

  // Add birthday milestones for the next 8 years
  for(let i = 0; i < 8; i++){
    const bday = new Date(bdayYear + i, BIRTHDAY_MONTH, BIRTHDAY_DAY);
    if(bday >= REL_START){
      milestones.push({
        unlockDate: bday,
        year: (bdayYear + i).toString(),
        title: "Happy Birthday, Baby 🎂",
        desc: `Another year of you. Another year of us getting more impossible to explain to anyone outside this.`,
        secret: `Happy birthday to the person who made me believe that some addictions are worth keeping. I'd choose this chaos — with you — every time.`,
        gameIndex: 4,
        icon: "🎂",
        isBirthday: true
      });
    }
  }

  // Sort all milestones by unlockDate
  milestones.sort((a, b) => a.unlockDate - b.unlockDate);

  return milestones;
}

/* =========================
   RENDER DYNAMIC TIMELINE
========================= */

function renderDynamicTimeline(){
  const container = document.getElementById("dynamicTimeline");
  if(!container) return;

  // Clear existing static items (keep the cord)
  const cord = container.querySelector(".timeline-cord");
  container.innerHTML = "";
  if(cord) container.appendChild(cord);

  const milestones = buildMilestones();
  const now = new Date();
  const soonThreshold = 60 * 24 * 60 * 60 * 1000; // 60 days in ms

  milestones.forEach((m, i) => {
    const isUnlocked = m.unlockDate <= now;
    const isSoon = !isUnlocked && (m.unlockDate - now) <= soonThreshold;
    const isLocked = !isUnlocked && !isSoon;

    // Check if unlocked within last 7 days (newly unlocked)
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const isNewlyUnlocked = isUnlocked && (now - m.unlockDate) <= sevenDays;

    const item = document.createElement("div");
    item.className = [
      "timeline-item",
      isLocked ? "locked" : "",
      isSoon ? "unlocking-soon" : "",
      isNewlyUnlocked ? "newly-unlocked" : ""
    ].filter(Boolean).join(" ");

    item.setAttribute("data-index", i);

    if(isUnlocked && !isLocked){
      item.setAttribute("onclick", "expandTimeline(this)");
      item.style.cursor = "pointer";
    }

    // Format unlock date for locked/soon hints
    const unlockStr = m.unlockDate.toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric"
    });

    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-year">${m.year}</div>
        <h3>${isLocked ? "🔒 Coming Soon" : m.title}</h3>
        <p>${isLocked
          ? "This chapter hasn't been written yet. But it's already yours."
          : m.desc
        }</p>
        ${isLocked ? `<span class="locked-hint">unlocks ${unlockStr}</span>` : ""}
        ${isSoon ? `<span class="unlocking-hint">✦ unlocking ${unlockStr}</span>` : ""}
        ${isUnlocked && m.secret ? `
          <div class="timeline-expand-card">
            <p class="timeline-secret">${m.secret}</p>
            <div class="timeline-game-btn"
              onclick="event.stopPropagation(); startTimelineGame(${m.gameIndex})">
              💌 Unlock the secret
            </div>
          </div>
        ` : ""}
      </div>
    `;

    container.appendChild(item);
  });

  // Update the duration badge
  const dur = getRelDuration();
  const badge = document.getElementById("relDurationText");
  if(badge) badge.textContent = dur.text;
}

/* =========================
   ANIMATED CORD — scroll-linked
========================= */

function initTimelineCord(){
  const fill = document.getElementById("timelineCordFill");
  const bead = document.getElementById("timelineCordBead");
  const timeline = document.getElementById("dynamicTimeline");
  if(!fill || !bead || !timeline) return;

  function update(){
    const rect = timeline.getBoundingClientRect();
    const totalH = timeline.offsetHeight;
    const winH = window.innerHeight;
    let pct = ((winH - rect.top) / totalH) * 100;
    pct = Math.max(0, Math.min(100, pct));

    fill.style.height = pct + "%";
    bead.style.top = pct + "%";
  }

  window.addEventListener("scroll", update, { passive: true });
  update();
}

/* =========================
   BOOT — call after DOM loads
========================= */

// Override the old initTimelineProgress function
window.initTimelineProgress = function(){
  // replaced by initTimelineCord
};

// Run after splash + profile select
document.addEventListener("DOMContentLoaded", () => {
  // Render once on load (even before profile — just in case)
  setTimeout(() => {
    renderDynamicTimeline();
    initTimelineCord();
  }, 100);
});

// Also re-render after profile is selected (homeScreen shown)
const _origSelectProfile = window.selectProfile;
window.selectProfile = function(profile){
  _origSelectProfile(profile);
  setTimeout(() => {
    renderDynamicTimeline();
    initTimelineCord();
  }, 700);
};

// Re-render cord on resize (mobile/desktop switch)
window.addEventListener("resize", () => {
  initTimelineCord();
});
