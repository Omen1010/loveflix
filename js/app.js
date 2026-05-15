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

let memories = [];
let currentMemory = null;
let currentImages = [];
let currentIndex = 0;
let currentMode = "image"; // "image" or "video"
let recentMemories = JSON.parse(localStorage.getItem("loveflix_recent")) || [];
let favoriteMemories = JSON.parse(localStorage.getItem("loveflix_favorites")) || [];
let favoriteVideos = JSON.parse(localStorage.getItem("loveflix_fav_videos")) || [];

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
  await refreshApp();
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
  showHome();
}

/* =========================
   HOME
========================= */
window.showHome = function(){
  const home = document.getElementById("homeScreen");
  const memory = document.getElementById("memoryScreen");
  if(home) home.style.display = "block";
  if(memory) memory.style.display = "none";
}

window.scrollToRows = function(){
  const rows = document.getElementById("rows");
  if(rows){
    rows.scrollIntoView({ behavior:"smooth" });
  }
}

/* =========================
   TIMELINE
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
   CONTINUE WATCHING
========================= */
function addRecentMemory(memory){
  recentMemories = recentMemories.filter(m=>m.id !== memory.id);
  recentMemories.unshift(memory);
  if(recentMemories.length > 5){
    recentMemories.pop();
  }
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
    </div>
    `;
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
  }else{
    favoriteMemories.push(memory);
  }
  localStorage.setItem("loveflix_favorites", JSON.stringify(favoriteMemories));
  generateFavorites();
}

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
    </div>
    `;
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
              <button onclick="event.stopPropagation(); toggleFavorite('${memory.id}')">
                ❤️ Favorite
              </button>
              <button onclick="event.stopPropagation(); editMemory('${memory.id}')">
                ✏️ Edit
              </button>
              <button class="delete-btn" onclick="event.stopPropagation(); deleteMemory('${memory.docId}')">
                🗑 Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
    `;
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

  // IMAGES
  let imageGallery = "";
  memory.images.forEach((img,index)=>{
    imageGallery += `
    <div class="card gallery-card" onclick='openGallery(${JSON.stringify(memory.images)}, ${index})'>
      <img src="${img}">
      <button class="img-delete-btn" onclick="event.stopPropagation(); deleteImageFromMemory(${index})">🗑</button>
      <div class="card-overlay">
        <h3>${memory.title}</h3>
        <p>${index + 1} / ${memory.images.length}</p>
      </div>
    </div>
    `;
  });

  // VIDEOS
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
    </div>
    `;
  });

  // RECOMMENDATIONS
  let recommendations = "";
  memories
    .filter(m=>m.id !== memory.id)
    .forEach(rec=>{
      recommendations += `
      <div class="card" onclick="openMemory('${rec.id}')">
        <img src="${rec.hero}">
        <div class="card-overlay">
          <h3>${rec.title}</h3>
        </div>
      </div>
      `;
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
        <button class="play-btn" onclick="addMediaToMemory()">
          ➕ Add Media
        </button>
        <button class="info-btn" onclick="showHome()">
          ← Back
        </button>
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
    <div class="netflix-row">
      ${recommendations}
    </div>
  </section>
  `;
}

/* =========================
   PRIVATE VAULT
========================= */
window.showPrivate = function(){
  document.getElementById("passwordScreen").classList.add("active");
}

window.closePasswordScreen = function(){
  document.getElementById("passwordScreen").classList.remove("active");
}

window.unlockPrivate = function(){
  const pass = document.getElementById("passwordInput").value;
  const memory = memories.find(m=>m.id === "private");
  if(pass === "love123" && memory){
    closePasswordScreen();
    renderMemory(memory);
  }else{
    alert("Incorrect code ❤️");
  }
}

/* =========================
   IMAGE VIEWER
========================= */
window.openGallery = async function(images,index){
  currentImages = images;
  currentIndex = index;
  currentMode = "image";

  updateViewer();

  const viewer = document.getElementById("viewer");
  if(viewer){
    viewer.style.display = "flex";
    viewer.classList.add("active");
  }

  // increment opens for the active memory
  if(currentMemory && currentMemory.docId){
    try{
      const newOpens = (currentMemory.opens || 0) + 1;
      await updateDoc(doc(db, "memories", currentMemory.docId), { opens: newOpens });
      currentMemory.opens = newOpens;
      const meta = document.querySelector(".memory-meta");
      if(meta) meta.innerHTML = meta.innerHTML.replace(/Opens:\s*\d+/, `Opens: ${newOpens}`);
    }catch(e){ console.log(e); }
  }
}

function updateViewer(){
  const image = document.getElementById("viewerImage");
  const counter = document.getElementById("imageCounter");

  // hide any video element
  const v = document.getElementById("viewerVideo");
  if(v){ v.pause(); v.style.display = "none"; }

  if(image){
    image.style.display = "block";
    image.src = currentImages[currentIndex];
  }
  if(counter){
    counter.innerText = `${currentIndex + 1} / ${currentImages.length}`;
  }
}

window.nextImage = function(){
  if(currentMode !== "image" || !currentImages.length) return;
  currentIndex = (currentIndex + 1) % currentImages.length;
  updateViewer();
}

window.prevImage = function(){
  if(currentMode !== "image" || !currentImages.length) return;
  currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
  updateViewer();
}

window.closeViewer = function(){
  const viewer = document.getElementById("viewer");
  if(viewer){
    viewer.style.display = "none";
    viewer.classList.remove("active");
  }
  const v = document.getElementById("viewerVideo");
  if(v){ v.pause(); v.src = ""; v.style.display = "none"; }
  const image = document.getElementById("viewerImage");
  if(image) image.style.display = "block";
}

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
    if(image && image.parentNode){
      image.parentNode.appendChild(v);
    }else if(viewer){
      viewer.appendChild(v);
    }
  }
  v.src = url;
  v.style.display = "block";
  v.play().catch(()=>{});

  if(viewer){
    viewer.style.display = "flex";
    viewer.classList.add("active");
  }

  // count as an open
  if(currentMemory && currentMemory.docId){
    try{
      const newOpens = (currentMemory.opens || 0) + 1;
      await updateDoc(doc(db, "memories", currentMemory.docId), { opens: newOpens });
      currentMemory.opens = newOpens;
      const meta = document.querySelector(".memory-meta");
      if(meta) meta.innerHTML = meta.innerHTML.replace(/Opens:\s*\d+/, `Opens: ${newOpens}`);
    }catch(e){ console.log(e); }
  }
}

/* =========================
   CREATE PANEL
========================= */
window.openCreator = function(){
  document.getElementById("creatorPanel").classList.add("active");
}

window.closeCreator = function(){
  document.getElementById("creatorPanel").classList.remove("active");
}

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
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "loveflix_uploads");

  const cloudName = "demdwlyct";

  try{
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: formData }
    );
    const data = await response.json();
    const imageURL = data.secure_url;

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
    closeCreator();

    document.getElementById("memoryTitle").value = "";
    document.getElementById("memoryDescription").value = "";
    document.getElementById("memoryImage").value = "";

    alert("Memory Created ❤️");
  }catch(error){
    console.log(error);
    alert("Upload failed ❤️");
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
}

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
}

/* =========================
   ADD MEDIA (image or video)
========================= */
window.addMediaToMemory = function(){
  if(!currentMemory) return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,video/*";

  input.onchange = async () => {
    const file = input.files[0];
    if(!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "loveflix_uploads");

    const isVideo = file.type.startsWith("video/");
    const endpoint = isVideo ? "video" : "image";

    try{
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/demdwlyct/${endpoint}/upload`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      const url = data.secure_url;

      const updatedImages = isVideo ? currentMemory.images : [...currentMemory.images, url];
      const updatedVideos = isVideo ? [...(currentMemory.videos||[]), url] : (currentMemory.videos||[]);

      await updateDoc(doc(db, "memories", currentMemory.docId), {
        images: updatedImages,
        videos: updatedVideos
      });

      await loadMemories();
      currentMemory = memories.find(m => m.id === currentMemory.id);
      renderMemory(currentMemory);
    }catch(error){
      console.log(error);
      alert("Upload failed ❤️");
    }
  };

  input.click();
}

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
}

/* =========================
   DELETE VIDEO FROM MEMORY
========================= */
window.deleteVideoFromMemory = async function(index){
  if(!currentMemory) return;
  if(!confirm("Remove this video? ❤️")) return;

  const updated = (currentMemory.videos || []).filter((_, i) => i !== index);

  try{
    await updateDoc(doc(db, "memories", currentMemory.docId), {
      videos: updated
    });
    await loadMemories();
    currentMemory = memories.find(m => m.id === currentMemory.id);
    renderMemory(currentMemory);
  }catch(error){
    console.log(error);
    alert("Delete failed ❤️");
  }
}

/* =========================
   FAVORITE A VIDEO
========================= */
window.toggleVideoFavorite = function(url){
  if(favoriteVideos.includes(url)){
    favoriteVideos = favoriteVideos.filter(u => u !== url);
  }else{
    favoriteVideos.push(url);
  }
  localStorage.setItem("loveflix_fav_videos", JSON.stringify(favoriteVideos));
  if(currentMemory) renderMemory(currentMemory);
}
