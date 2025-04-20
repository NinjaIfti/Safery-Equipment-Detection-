// src/firebase.js
import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyC2gGtKPH8wXRQMT_P924WgdnyZtsLxmFk",
  authDomain: "safety-equipment-e8fea.firebaseapp.com",
  projectId: "safety-equipment-e8fea",
  storageBucket: "safety-equipment-e8fea.firebasestorage.app",
  messagingSenderId: "567020346429",
  appId: "1:567020346429:web:4eb706de550698d97b5e54",
  measurementId: "G-5RZPDBJT78",
};

// Initialize Firebase only once
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const db = getFirestore(app);

export { app, storage, db };