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
let recentMemories = JSON.parse(localStorage.getItem("loveflix_recent")) || [];
let favoriteMemories = JSON.parse(localStorage.getItem("loveflix_favorites")) || [];
let screenHistory = [];
let moonClicks = 0;

/* =========================
   INITIALIZATION
========================= */

window.addEventListener("DOMContentLoaded", async () => {

  await refreshApp();

  initTimelineProgress();

  if (!history.state) {
    history.replaceState({ type: "home" }, "Home", "#home");
  }
});

window.onpopstate = (e) => {

  if (!e.state) return;

  if (e.state.type === "home") {
    showHome(false);
  }

  if (e.state.type === "memory") {
    renderMemory(e.state.data, false);
  }
};

/* =========================
   LOAD MEMORIES
========================= */

async function loadMemories() {

  try {

    memories = [];

    const q = query(collection(db, "memories"));

    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {

      const data = docSnap.data();

      data.docId = docSnap.id;

      if (!data.opens) data.opens = 0;
      if (!data.favoriteCount) data.favoriteCount = 0;
      if (!data.images) data.images = [];
      if (!data.videos) data.videos = [];

      memories.push(data);
    });

  } catch (error) {

    console.log(error);
  }
}

/* =========================
   REFRESH APP
========================= */

async function refreshApp() {

  await loadMemories();

  generateRows();
  generateContinueWatching();
  generateFavorites();
  generateTopMemories();

  showHome(false);
}

/* =========================
   NAVIGATION
========================= */

function pushHistory(type, data = null) {

  const state = { type, data };

  const url = data ? `#${data.id}` : "#home";

  history.pushState(state, "", url);
}

window.goBack = () => window.history.back();

/* =========================
   HOME
========================= */

window.showHome = function (saveHistory = true) {

  const home = document.getElementById("homeScreen");
  const memory = document.getElementById("memoryScreen");

  if (home) home.style.display = "block";
  if (memory) memory.style.display = "none";

  currentMemory = null;

  if (saveHistory) {
    pushHistory("home");
  }
};

window.scrollToRows = function () {

  const rows = document.getElementById("rows");

  if (rows) {
    rows.scrollIntoView({ behavior: "smooth" });
  }
};

/* =========================
   TIMELINE PROGRESS
========================= */

function initTimelineProgress() {

  const progress = document.querySelector(".timeline-progress");
  const timeline = document.querySelector(".timeline");

  if (!progress || !timeline) return;

  window.addEventListener("scroll", () => {

    const rect = timeline.getBoundingClientRect();
    const totalHeight = timeline.offsetHeight;
    const windowHeight = window.innerHeight;

    let percent = ((windowHeight - rect.top) / totalHeight) * 100;

    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    progress.style.height = `${percent}%`;
  });
}

/* =========================
   SECRET ENGINE
========================= */

window.secretTap = function () {

  moonClicks++;

  if (moonClicks >= 5) {

    openSecretMemory();

    moonClicks = 0;
  }
};

function openSecretMemory() {

  document.getElementById("secretMemory").style.display = "flex";
}

window.closeSecretMemory = function () {

  document.getElementById("secretMemory").style.display = "none";
};

/* =========================
   CONTINUE WATCHING
========================= */

function addRecentMemory(memory) {

  recentMemories = recentMemories.filter((m) => m.id !== memory.id);

  recentMemories.unshift(memory);

  if (recentMemories.length > 6) {
    recentMemories.pop();
  }

  localStorage.setItem(
    "loveflix_recent",
    JSON.stringify(recentMemories)
  );

  generateContinueWatching();
}

function generateContinueWatching() {

  const row = document.getElementById("continueWatching");

  if (!row) return;

  row.innerHTML = recentMemories
    .map(
      (m) => `

      <div class="card" onclick="openMemory('${m.id}')">

        <img src="${m.hero}">

        <div class="card-overlay">
          <h3>${m.title}</h3>
          <p>Continue Watching ❤️</p>
        </div>

      </div>
    `
    )
    .join("");
}

/* =========================
   FAVORITES
========================= */

window.toggleFavorite = function (id) {

  const memory = memories.find((m) => m.id === id);

  if (!memory) return;

  const index = favoriteMemories.findIndex((m) => m.id === id);

  if (index > -1) {

    favoriteMemories.splice(index, 1);
    memory.favoriteCount--;

  } else {

    favoriteMemories.unshift(memory);
    memory.favoriteCount++;
  }

  localStorage.setItem(
    "loveflix_favorites",
    JSON.stringify(favoriteMemories)
  );

  generateFavorites();
  generateTopMemories();
};

function generateFavorites() {

  const row = document.getElementById("favoriteRows");

  if (!row) return;

  row.innerHTML = favoriteMemories
    .map(
      (m) => `

      <div class="card" onclick="openMemory('${m.id}')">

        <img src="${m.hero}">

        <div class="card-overlay">
          <h3>${m.title}</h3>
          <p>Favorite Memory ❤️</p>
        </div>

      </div>
    `
    )
    .join("");
}

/* =========================
   TOP MEMORIES
========================= */

function generateTopMemories() {

  const row = document.getElementById("topMemories");

  if (!row) return;

  row.innerHTML = "";

  const sorted = [...memories].sort(
    (a, b) => (b.opens || 0) - (a.opens || 0)
  );

  sorted.slice(0, 5).forEach((memory) => {

    row.innerHTML += `

      <div class="card" onclick="openMemory('${memory.id}')">

        <img src="${memory.hero}">

        <div class="card-overlay">
          <h3>${memory.title}</h3>
          <p>Replayed ${memory.opens || 0} times ❤️</p>
        </div>

      </div>
    `;
  });
}

/* =========================
   GENERATE ROWS
========================= */

function generateRows() {

  const container = document.getElementById("rows");

  if (!container) return;

  container.innerHTML = memories
    .filter((m) => m.id !== "private")
    .map(
      (m) => `

      <section class="section">

        <h2>${m.title}</h2>

        <div class="netflix-row">

          <div class="card" onclick="openMemory('${m.id}')">

            <img src="${m.hero}">

            <div class="card-overlay">

              <h3>${m.title}</h3>

              <p>${m.description}</p>

              <div class="card-actions">

                <button onclick="event.stopPropagation(); toggleFavorite('${m.id}')">
                  ❤️ Favorite
                </button>

                <button onclick="event.stopPropagation(); editMemory('${m.id}')">
                  ✏️ Edit
                </button>

                <button class="delete-btn" onclick="event.stopPropagation(); deleteMemory('${m.docId}')">
                  🗑 Delete
                </button>

              </div>

            </div>

          </div>

        </div>

      </section>
    `
    )
    .join("");
}

/* =========================
   OPEN MEMORY
========================= */

window.openMemory = async function (id) {

  const memory = memories.find((m) => m.id === id);

  if (!memory) return;

  currentMemory = memory;

  addRecentMemory(memory);

  memory.opens++;

  await updateDoc(doc(db, "memories", memory.docId), {
    opens: memory.opens
  });

  generateTopMemories();

  if (id === "private") {
    showPrivate();
    return;
  }

  renderMemory(memory, true);
};

/* =========================
   RENDER MEMORY
========================= */

function renderMemory(memory, saveHistory = true) {

  const home = document.getElementById("homeScreen");
  const screen = document.getElementById("memoryScreen");
  const content = document.getElementById("memoryContent");

  if (home) home.style.display = "none";
  if (screen) screen.style.display = "block";

  if (saveHistory) {
    pushHistory("memory", memory);
  }

  const mediaItems = (memory.images || [])
    .map((url, index) => {

      const isVideo =
        url.includes(".mp4") || url.includes("/video/upload");

      return `

        <div class="card">

          ${
            isVideo
              ? `<video src="${url}" muted loop controls style="width:100%;height:100%;object-fit:cover;border-radius:28px;"></video>`
              : `<img src="${url}" onclick='openGallery(${JSON.stringify(
                  memory.images
                )},${index})'>`
          }

          <div class="card-overlay">

            <h3>${memory.title}</h3>

            <p>${memory.description}</p>

            <button class="delete-btn" onclick="event.stopPropagation(); deleteSpecificMedia(${index})">
              🗑 Delete
            </button>

          </div>

        </div>
      `;
    })
    .join("");

  const recommendations = memories
    .filter((m) => m.id !== memory.id)
    .map(
      (rec) => `

      <div class="card" onclick="openMemory('${rec.id}')">

        <img src="${rec.hero}">

        <div class="card-overlay">
          <h3>${rec.title}</h3>
          <p>${rec.description}</p>
        </div>

      </div>
    `
    )
    .join("");

  content.innerHTML = `

    <section class="hero" style="background-image:url('${memory.hero}')">

      <div class="overlay"></div>

      <div class="hero-content">

        <h1 contenteditable="true" onblur="saveQuickEdit(this,'title')">
          ${memory.title}
        </h1>

        <p contenteditable="true" onblur="saveQuickEdit(this,'description')">
          ${memory.description}
        </p>

        <div class="memory-details">

          <div class="memory-tags">

            <span>❤️ ${memory.favoriteCount || 0} Favorites</span>
            <span>🔥 ${memory.opens || 0} Opens</span>
            <span>📸 ${(memory.images || []).length} Media</span>

          </div>

        </div>

        <div class="hero-buttons">

          <button class="play-btn" onclick="addMediaToMemory()">
            ➕ Add Media
          </button>

          <button class="info-btn" onclick="goBack()">
            ← Back
          </button>

        </div>

      </div>

    </section>

    <section class="section">

      <h2>Gallery 📸</h2>

      <div class="netflix-row">
        ${mediaItems}
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
   QUICK EDIT
========================= */

window.saveQuickEdit = async function (el, field) {

  if (!currentMemory) return;

  currentMemory[field] = el.innerText;

  await updateDoc(doc(db, "memories", currentMemory.docId), {
    [field]: el.innerText
  });
};

/* =========================
   DELETE SPECIFIC MEDIA
========================= */

window.deleteSpecificMedia = async function (index) {

  if (!currentMemory) return;

  if (!confirm("Delete this media? ❤️")) return;

  currentMemory.images.splice(index, 1);

  await updateDoc(doc(db, "memories", currentMemory.docId), {
    images: currentMemory.images
  });

  renderMemory(currentMemory, false);
};

/* =========================
   ADD MEDIA
========================= */

window.addMediaToMemory = async function () {

  if (!currentMemory) return;

  const input = document.createElement("input");

  input.type = "file";
  input.accept = "image/*,video/*";

  input.click();

  input.onchange = async () => {

    const file = input.files[0];

    if (!file) return;

    const type = file.type.startsWith("video/")
      ? "video"
      : "image";

    const url = await uploadToCloudinary(file, type);

    if (url) {

      currentMemory.images.push(url);

      await updateDoc(doc(db, "memories", currentMemory.docId), {
        images: currentMemory.images
      });

      renderMemory(currentMemory, false);
    }
  };
};

async function uploadToCloudinary(file, type) {

  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", "loveflix_uploads");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/demdwlyct/${type}/upload`,
    {
      method: "POST",
      body: formData
    }
  );

  const data = await res.json();

  return data.secure_url;
}

/* =========================
   DELETE MEMORY
========================= */

window.deleteMemory = async function (docId) {

  if (!confirm("Delete entire folder? ❤️")) return;

  await deleteDoc(doc(db, "memories", docId));

  await refreshApp();
};

/* =========================
   PRIVATE VAULT
========================= */

window.showPrivate = function () {
  document.getElementById("passwordScreen").classList.add("active");
};

window.closePasswordScreen = function () {
  document.getElementById("passwordScreen").classList.remove("active");
};

window.unlockPrivate = function () {

  const pass = document.getElementById("passwordInput").value;

  const memory = memories.find((m) => m.id === "private");

  if (pass === "love123" && memory) {

    closePasswordScreen();

    renderMemory(memory, true);

  } else {

    alert("Incorrect code ❤️");
  }
};

/* =========================
   VIEWER
========================= */

window.openGallery = function (images, index) {

  currentImages = images;
  currentIndex = index;

  updateViewer();

  const viewer = document.getElementById("viewer");

  if (viewer) {
    viewer.style.display = "flex";
    viewer.classList.add("active");
  }
};

function updateViewer() {

  const image = document.getElementById("viewerImage");
  const counter = document.getElementById("imageCounter");

  if (image) {
    image.src = currentImages[currentIndex];
  }

  if (counter) {
    counter.innerText = `${currentIndex + 1} / ${currentImages.length}`;
  }
}

window.nextImage = function () {

  currentIndex =
    (currentIndex + 1) % currentImages.length;

  updateViewer();
};

window.prevImage = function () {

  currentIndex =
    (currentIndex - 1 + currentImages.length) % currentImages.length;

  updateViewer();
};

window.closeViewer = function () {

  const viewer = document.getElementById("viewer");

  if (viewer) {
    viewer.style.display = "none";
    viewer.classList.remove("active");
  }
};

/* =========================
   CREATE PANEL
========================= */

window.openCreator = function () {
  document.getElementById("creatorPanel").classList.add("active");
};

window.closeCreator = function () {
  document.getElementById("creatorPanel").classList.remove("active");
};

/* =========================
   CREATE MEMORY
========================= */

window.createMemory = async function () {

  const title = document.getElementById("memoryTitle").value;
  const description = document.getElementById("memoryDescription").value;
  const imageInput = document.getElementById("memoryImage");

  if (!title || !description || !imageInput.files[0]) {
    alert("Fill all fields ❤️");
    return;
  }

  const file = imageInput.files[0];

  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", "loveflix_uploads");

  const cloudName = "demdwlyct";

  try {

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData
      }
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

  } catch (error) {

    console.log(error);
    alert("Upload failed ❤️");
  }
};
