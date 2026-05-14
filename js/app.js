import { db, collection, addDoc, getDocs, query, doc, deleteDoc, updateDoc } from "./firebase.js";

/* =========================
   STATE & PERSISTENCE
========================= */
let memories = [];
let currentMemory = null;
let recentMemories = JSON.parse(localStorage.getItem("loveflix_recent")) || [];
let favoriteMemories = JSON.parse(localStorage.getItem("loveflix_favorites")) || [];

/* =========================
   INITIALIZATION
========================= */
window.addEventListener("DOMContentLoaded", async () => {
    await refreshApp();
    initTimelineProgress();
    if (!history.state) history.replaceState({ type: "home" }, "Home", "#home");
});

window.onpopstate = (e) => {
    if (e.state) {
        e.state.type === "home" ? showHome(false) : renderMemory(e.state.data, false);
    }
};

async function refreshApp() {
    await loadMemories();
    generateRows();
    generateContinueWatching();
    generateFavorites();
    
    const splash = document.getElementById('splash-screen');
    if(splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 600);
    }
}

async function loadMemories() {
    const q = query(collection(db, "memories"));
    const snapshot = await getDocs(q);
    memories = [];
    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        data.docId = docSnap.id;
        memories.push(data);
    });
}

/* =========================
   NAVIGATION ENGINE
========================= */
function pushHistory(type, data = null) {
    const state = { type, data };
    const url = data ? `#${data.id}` : "#home";
    history.pushState(state, "", url);
}

window.goBack = () => window.history.back();

window.showHome = function (saveHistory = true) {
    document.getElementById("homeScreen").style.display = "block";
    document.getElementById("memoryScreen").style.display = "none";
    currentMemory = null;
    if (saveHistory) pushHistory("home");
};

window.scrollToRows = () => document.getElementById("rows").scrollIntoView({ behavior: "smooth" });

/* =========================
   IMAGE VIEWER LOGIC
========================= */
let currentImages = [];
let currentIndex = 0;

window.openGallery = function (images, index) {
    currentImages = images;
    currentIndex = index;
    const viewer = document.getElementById("viewer");
    const imgElement = document.getElementById("viewerImage");
    if (viewer && imgElement) {
        imgElement.src = currentImages[currentIndex];
        document.getElementById("imageCounter").innerText = `${currentIndex + 1} / ${currentImages.length}`;
        viewer.style.display = "flex";
        viewer.classList.add("active");
    }
};

window.nextImage = () => {
    currentIndex = (currentIndex + 1) % currentImages.length;
    document.getElementById("viewerImage").src = currentImages[currentIndex];
    document.getElementById("imageCounter").innerText = `${currentIndex + 1} / ${currentImages.length}`;
};

window.prevImage = () => {
    currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
    document.getElementById("viewerImage").src = currentImages[currentIndex];
    document.getElementById("imageCounter").innerText = `${currentIndex + 1} / ${currentImages.length}`;
};

window.closeViewer = () => {
    const viewer = document.getElementById("viewer");
    if(viewer) {
        viewer.style.display = "none";
        viewer.classList.remove("active");
    }
};

/* =========================
   DYNAMIC RENDERING
========================= */
window.openMemory = (id) => {
    const memory = memories.find(m => m.id === id);
    if (!memory) return;
    currentMemory = memory;
    addRecentMemory(memory);
    renderMemory(memory, true);
};

function renderMemory(memory, saveHistory = true) {
    document.getElementById("homeScreen").style.display = "none";
    document.getElementById("memoryScreen").style.display = "block";
    const content = document.getElementById("memoryContent");

    if (saveHistory) pushHistory("memory", memory);

    const mediaItems = (memory.images || []).map((url, index) => {
        const isVideo = url.includes(".mp4") || url.includes("/video/upload");
        return `
            <div class="card">
                ${isVideo ? 
                    `<video src="${url}" muted loop onmouseover="this.play()" onmouseout="this.pause()" style="width:100%;height:100%;object-fit:cover;border-radius:28px;"></video>` : 
                    `<img src="${url}" onclick='openGallery(${JSON.stringify(memory.images)}, ${index})'>`
                }
                <div class="card-overlay">
                    <button class="delete-btn" onclick="event.stopPropagation(); deleteSpecificMedia(${index})">🗑️</button>
                </div>
            </div>`;
    }).join('');

    content.innerHTML = `
        <section class="hero" style="background-image:url('${memory.hero}')">
            <div class="overlay"></div>
            <div class="hero-content">
                <h1 contenteditable="true" onblur="saveQuickEdit(this, 'title')">${memory.title}</h1>
                <p contenteditable="true" onblur="saveQuickEdit(this, 'description')">${memory.description}</p>
                <div class="hero-buttons">
                    <button class="play-btn" onclick="addMediaToMemory()">＋ Add Media</button>
                    <button class="info-btn" onclick="window.goBack()">← Back</button>
                </div>
            </div>
        </section>
        <section class="section">
            <h2>Gallery 📸</h2>
            <div class="netflix-row">${mediaItems || "<p>Empty folder</p>"}</div>
        </section>`;
}

/* =========================
   MANAGEMENT TOOLS
========================= */
window.saveQuickEdit = async (el, field) => {
    await updateDoc(doc(db, "memories", currentMemory.docId), { [field]: el.innerText });
    currentMemory[field] = el.innerText;
};

window.deleteSpecificMedia = async function(index) {
    if (!confirm("Delete this item? ❤️")) return;
    currentMemory.images.splice(index, 1);
    await updateDoc(doc(db, "memories", currentMemory.docId), { images: currentMemory.images });
    renderMemory(currentMemory, false);
};

window.addMediaToMemory = async function() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.click();
    input.onchange = async () => {
        const file = input.files[0];
        const type = file.type.startsWith("video/") ? "video" : "image";
        const url = await uploadToCloudinary(file, type);
        if (url) {
            currentMemory.images.push(url);
            await updateDoc(doc(db, "memories", currentMemory.docId), { images: currentMemory.images });
            renderMemory(currentMemory, false);
        }
    };
};

async function uploadToCloudinary(file, type) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "loveflix_uploads");
    const res = await fetch(`https://api.cloudinary.com/v1_1/demdwlyct/${type}/upload`, { method: "POST", body: formData });
    const data = await res.json();
    return data.secure_url;
}

/* =========================
   HOME UI & PERSISTENCE
========================= */
window.toggleFavorite = function (id) {
    const memory = memories.find((m) => m.id === id);
    if (!memory) return;
    const index = favoriteMemories.findIndex((m) => m.id === id);
    if (index > -1) favoriteMemories.splice(index, 1);
    else favoriteMemories.unshift(memory);
    localStorage.setItem("loveflix_favorites", JSON.stringify(favoriteMemories));
    generateFavorites();
};

function addRecentMemory(memory) {
    recentMemories = recentMemories.filter((m) => m.id !== memory.id);
    recentMemories.unshift(memory);
    if (recentMemories.length > 6) recentMemories.pop();
    localStorage.setItem("loveflix_recent", JSON.stringify(recentMemories));
    generateContinueWatching();
}

function generateFavorites() {
    const row = document.getElementById("favoriteRows");
    if (row) row.innerHTML = favoriteMemories.map(m => `<div class="card" onclick="openMemory('${m.id}')"><img src="${m.hero}"><div class="card-overlay"><h3>${m.title}</h3></div></div>`).join('');
}

function generateContinueWatching() {
    const row = document.getElementById("continueWatching");
    if (row) row.innerHTML = recentMemories.map(m => `<div class="card" onclick="openMemory('${m.id}')"><img src="${m.hero}"><div class="card-overlay"><h3>${m.title}</h3></div></div>`).join('');
}

function generateRows() {
    const container = document.getElementById("rows");
    if (!container) return;
    container.innerHTML = memories.filter(m => m.id !== 'private').map(m => `
        <section class="section">
            <h2>${m.title}</h2>
            <div class="netflix-row">
                <div class="card" onclick="openMemory('${m.id}')">
                    <img src="${m.hero}">
                    <div class="card-overlay">
                        <h3>${m.title}</h3>
                        <div class="card-actions">
                            <button onclick="event.stopPropagation(); toggleFavorite('${m.id}')">❤️ Favorite</button>
                            <button class="delete-btn" onclick="event.stopPropagation(); deleteMemory('${m.docId}')">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        </section>`).join('');
}

window.deleteMemory = async function(docId) {
    if (!confirm("Delete entire folder? ❤️")) return;
    await deleteDoc(doc(db, "memories", docId));
    await refreshApp();
};

/* =========================
   UI HELPERS (TIMELINE & SECRET)
========================= */
function initTimelineProgress() {
    const progress = document.querySelector(".timeline-progress");
    const timeline = document.querySelector(".timeline");
    if (!progress || !timeline) return;
    window.addEventListener("scroll", () => {
        const rect = timeline.getBoundingClientRect();
        let percent = ((window.innerHeight - rect.top) / timeline.offsetHeight) * 100;
        progress.style.height = `${Math.min(Math.max(percent, 0), 100)}%`;
    });
}

window.secretTap = () => alert("You found a secret moment! 🌙");
window.openCreator = () => document.getElementById("creatorPanel").classList.add("active");
window.closeCreator = () => document.getElementById("creatorPanel").classList.remove("active");

window.showPrivate = () => document.getElementById("passwordScreen").classList.add("active");
window.closePasswordScreen = () => document.getElementById("passwordScreen").classList.remove("active");

window.unlockPrivate = function () {
    const pass = document.getElementById("passwordInput").value;
    const memory = memories.find(m => m.id === "private");
    if (pass === "love123" && memory) {
        closePasswordScreen();
        renderMemory(memory, true);
    } else {
        alert("Incorrect code ❤️");
    }
};

window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeViewer();
    if (e.key === "ArrowRight") nextImage();
    if (e.key === "ArrowLeft") prevImage();
});