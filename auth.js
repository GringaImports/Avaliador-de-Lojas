import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const emailEl = document.querySelector("#email");
const senhaEl = document.querySelector("#senha");
const msg = document.querySelector("#msg");

function show(text) {
  msg.textContent = text || "";
}

function normalizeEmail(v) {
  return (v || "").trim();
}

function normalizePass(v) {
  return (v || "").trim();
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

document.querySelector("#btnEntrar").addEventListener("click", async () => {
  show("");
  const email = normalizeEmail(emailEl.value);
  const senha = normalizePass(senhaEl.value);

  if (!email || !senha) return show("Preencha email e senha.");
  if (!isValidEmail(email)) return show("Digite um email válido (ex: nome@gmail.com).");

  try {
    await signInWithEmailAndPassword(auth, email, senha);
    location.href = "stores.html";
  } catch (e) {
    show(e.message);
  }
});

document.querySelector("#btnCadastrar").addEventListener("click", async () => {
  show("");
  const email = normalizeEmail(emailEl.value);
  const senha = normalizePass(senhaEl.value);

  if (!email || !senha) return show("Preencha email e senha.");
  if (!isValidEmail(email)) return show("Digite um email válido (ex: nome@gmail.com).");
  if (senha.length < 6) return show("Senha precisa ter pelo menos 6 caracteres.");

  try {
    await createUserWithEmailAndPassword(auth, email, senha);
    location.href = "stores.html";
  } catch (e) {
    show(e.message);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) location.href = "stores.html";
});
