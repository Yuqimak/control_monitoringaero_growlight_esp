import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
