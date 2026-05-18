import { initializeApp }                             from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs,
         getDoc, setDoc, doc, updateDoc, deleteDoc,
         query }                                      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes,
         getDownloadURL }                             from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth, GoogleAuthProvider, signInWithPopup,
         createUserWithEmailAndPassword,
         signInWithEmailAndPassword,
         onAuthStateChanged, signOut }                from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAfA9BsvLD-ZmJGNWo4WQysHb8ILUnksqs",
  authDomain:        "loveflix-2.firebaseapp.com",
  projectId:         "loveflix-2",
  storageBucket:     "loveflix-2.firebasestorage.app",
  messagingSenderId: "439756435753",
  appId:             "1:439756435753:web:9b08190ddcbe03eaa5c738"
};

const app      = initializeApp(firebaseConfig);
const db       = getFirestore(app);
const storage  = getStorage(app);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

export {
  db, collection, addDoc, getDocs, getDoc, setDoc,
  doc, updateDoc, deleteDoc, query,
  storage, ref, uploadBytes, getDownloadURL,
  auth, provider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
};
