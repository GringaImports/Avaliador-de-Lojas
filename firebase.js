import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDV4Jnxvf5B7EaHSQmXhTtqkk13DZGE7Zk",
  authDomain: "avaliador-lojas.firebaseapp.com",
  projectId: "avaliador-lojas",
  storageBucket: "avaliador-lojas.firebasestorage.app",
  messagingSenderId: "842406691834",
  appId: "1:842406691834:web:016ef2c3a3e1e0e891da43",
  measurementId: "G-M9FFMFF6EC"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
