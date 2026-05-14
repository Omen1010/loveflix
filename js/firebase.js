import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  query
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* =========================
   FIREBASE CONFIG
========================= */

const firebaseConfig = {
  apiKey: "AIzaSyAfA9BsvLD-ZmJGNWo4WQysHb8ILUnksqs",
  authDomain: "loveflix-2.firebaseapp.com",
  projectId: "loveflix-2",
  storageBucket: "loveflix-2.firebasestorage.app",
  messagingSenderId: "439756435753",
  appId: "1:439756435753:web:9b08190ddcbe03eaa5c738"
}; 

/* =========================
   INITIALIZE
========================= */

const app =
initializeApp(firebaseConfig);

/* FIRESTORE */

const db =
getFirestore(app);

/* STORAGE */

const storage =
getStorage(app);

/* EXPORT */

export {
  doc,

  updateDoc,

  deleteDoc,

  db,

  storage,

  collection,

  addDoc,

  getDocs,

  query,

  ref,

  uploadBytes,

  getDownloadURL
};