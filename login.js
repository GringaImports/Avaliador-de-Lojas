import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const form = document.querySelector("#formLogin");
const emailEl = document.querySelector("#email");
const passEl = document.querySelector("#password");
const rememberEl = document.querySelector("#remember");

const btnEntrar = document.querySelector("#btnEntrar");
const btnCadastrar = document.querySelector("#btnCadastrar");
const msg = document.querySelector("#msg");

const togglePass = document.querySelector("#togglePass");

function show(text = "", type = "info") {
  msg.textContent = text;
  msg.className = "auth-msg";
  if (!text) return;
  msg.classList.add(type === "error" ? "is-error" : "is-ok");
}

function setLoading(isLoading, label = "Entrar") {
  btnEntrar.disabled = isLoading;
  btnCadastrar.disabled = isLoading;
  btnEntrar.textContent = isLoading ? "Aguarde..." : label;
}

function friendlyAuthError(code) {
  // códigos mais comuns do Firebase Auth
  if (code.includes("auth/invalid-email")) return "Email inválido. Verifique e tente novamente.";
  if (code.includes("auth/missing-password")) return "Digite sua senha.";
  if (code.includes("auth/invalid-credential")) return "Email ou senha incorretos.";
  if (code.includes("auth/user-not-found")) return "Usuário não encontrado. Clique em “Criar conta”.";
  if (code.includes("auth/wrong-password")) return "Senha incorreta.";
  if (code.includes("auth/email-already-in-use")) return "Esse email já está cadastrado. Clique em “Entrar”.";
  if (code.includes("auth/weak-password")) return "Senha fraca. Use pelo menos 6 caracteres.";
  if (code.includes("auth/configuration-not-found")) return "Auth não habilitado no Firebase. Ative Email/Senha.";
  return "Erro: " + code;
}

togglePass.addEventListener("click", () => {
  const isPass = passEl.type === "password";
  passEl.type = isPass ? "text" : "password";
  togglePass.textContent = isPass ? "🙈" : "👁️";
});

async function applyPersistence() {
  const persistence = rememberEl.checked ? browserLocalPersistence : browserSessionPersistence;
  await setPersistence(auth, persistence);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  show("");

  const email = (emailEl.value || "").trim();
  const password = passEl.value || "";

  if (!email) return show("Digite seu email.", "error");
  if (!password || password.length < 6) return show("Digite sua senha (mínimo 6 caracteres).", "error");

  setLoading(true, "Entrar");

  try {
    await applyPersistence();
    await signInWithEmailAndPassword(auth, email, password);

    show("Login efetuado ✅ Redirecionando...", "ok");

    // manda pro painel
    setTimeout(() => (location.href = "stores.html"), 400);
  } catch (err) {
    console.error(err);
    show(friendlyAuthError(err?.code || err?.message || "erro"), "error");
  } finally {
    setLoading(false, "Entrar");
  }
});

btnCadastrar.addEventListener("click", async () => {
  show("");

  const email = (emailEl.value || "").trim();
  const password = passEl.value || "";

  if (!email) return show("Digite um email para criar conta.", "error");
  if (!password || password.length < 6) return show("Crie uma senha (mínimo 6 caracteres).", "error");

  setLoading(true, "Criando conta...");

  try {
    await applyPersistence();
    await createUserWithEmailAndPassword(auth, email, password);

    show("Conta criada ✅ Indo para o painel...", "ok");
    setTimeout(() => (location.href = "stores.html"), 400);
  } catch (err) {
    console.error(err);
    show(friendlyAuthError(err?.code || err?.message || "erro"), "error");
  } finally {
    setLoading(false, "Entrar");
  }
});
