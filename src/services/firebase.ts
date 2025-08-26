import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  signInAnonymously,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
};

// Inicializa app só uma vez
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Expor o que o resto do código espera
export function getDb() {
  return getFirestore(app);
}

// (Opcional, mas bom para segurança das regras)
export const auth = getAuth(app);
// 👉 cada ABA tem um usuário anônimo diferente
export async function ensureAnonAuth() {
  await setPersistence(auth, browserSessionPersistence);
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}
