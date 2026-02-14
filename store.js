import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp,
  addDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

/* =========================
   CONFIG: 20 PERGUNTAS
   ========================= */

const QUESTIONS = [
  "As prateleiras da loja estão limpas e arrumadas?",
  "Todos os produtos estão claramente visíveis e acessíveis?",
  "Os produtos estão organizados de forma lógica?",
  "Como está a organização do estoque?",
  "Os funcionários estão com os uniformes corretamente?",
  "O preço de todos os produtos está claramente marcado?",
  "O preço dos produtos corresponde ao informado no sistema de check-out?",
  "Os funcionários estão tratando os clientes de maneira amigável e profissional?",
  "Os membros da equipe têm conhecimento suficiente sobre os produtos que estão vendendo?",
  "Os sistemas de segurança estão funcionando corretamente?",
  "O sistema de videomonitoramento está cobrindo todas as áreas importantes?",
  "Todas as promoções atuais estão claramente sinalizadas?",
  "Os materiais de marketing estão atualizados e em boas condições?",
  "Pequenos reparos ou manutenções na loja são realizados prontamente?",
  "Banheiros, provadores e outras áreas do cliente estão limpos e em boas condições?",
  "Todas as transações estão sendo registradas corretamente?",
  "O malote do gestor está correto?",
  "As reclamações dos clientes são tratadas de maneira satisfatória?",
  "Existe um método de coleta de feedback dos clientes após a compra?",
  "As melhorias baseadas no feedback dos clientes estão sendo implementadas de forma contínua?"
];

/* =========================
   ELEMENTOS DA TELA
   ========================= */

const userEmailEl = document.querySelector("#userEmail");
const btnSair = document.querySelector("#btnSair");

const storeTitle = document.querySelector("#storeTitle");
const storeMeta = document.querySelector("#storeMeta");

const questionsEl = document.querySelector("#questions");

const myAvgEl = document.querySelector("#myAvg");
const statusEl = document.querySelector("#status");

const commentEl = document.querySelector("#comment");
const btnSalvar = document.querySelector("#btnSalvar");
const msg = document.querySelector("#msg");

const reportReasonEl = document.querySelector("#reportReason");
const btnReport = document.querySelector("#btnReport");

/* =========================
   PEGAR storeId PELO HASH
   URL exemplo: store.html#id=ABC123
   ========================= */

const params = new URLSearchParams((location.hash || "").replace("#", "?"));
const storeId = params.get("id");

if (!storeId) {
  alert("StoreId não informado na URL. Volte e clique em 'Avaliar'.");
  location.href = "stores.html";
}

/* =========================
   ESTADO
   ========================= */

let currentUser = null;
let answers = {}; // q01..q20 => 1..5

/* =========================
   UTIL
   ========================= */

function show(text) {
  msg.textContent = text || "";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function qKey(i) {
  return `q${String(i + 1).padStart(2, "0")}`;
}

function calcAverage() {
  const sum = QUESTIONS.reduce((acc, _, i) => acc + Number(answers[qKey(i)] || 0), 0);
  return sum / QUESTIONS.length;
}

/* =========================
   STATUS INTELIGENTE
   Itens críticos: 10, 11, 16, 17
   - Se qualquer um <= 2 -> CRÍTICO (mesmo com média alta)
   ========================= */

function criticalFlags() {
  // índices (0-based): 9,10,15,16 => perguntas 10,11,16,17
  const criticalIdx = [9, 10, 15, 16];

  const failed = criticalIdx
    .map(i => ({ idx: i + 1, key: qKey(i), val: Number(answers[qKey(i)] || 0) }))
    .filter(x => x.val > 0 && x.val <= 2);

  return {
    hasCriticalFail: failed.length > 0,
    failedCritical: failed.map(x => x.idx) // ex: [10,16]
  };
}

function updateUI() {
  const filled = Object.keys(answers).length;
  const avg = calcAverage();

  myAvgEl.textContent = avg.toFixed(2);

  if (filled < QUESTIONS.length) {
    statusEl.textContent = `Faltam ${QUESTIONS.length - filled} perguntas`;
    return;
  }

  const crit = criticalFlags();

  if (crit.hasCriticalFail) {
    statusEl.textContent = `🚨 Crítico (falha nas perguntas: ${crit.failedCritical.join(", ")})`;
    return;
  }

  if (avg >= 4.2) statusEl.textContent = "✅ Aprovado";
  else if (avg >= 3.2) statusEl.textContent = "⚠️ Atenção";
  else statusEl.textContent = "🚨 Crítico";
}

/* =========================
   RENDER PERGUNTAS
   ========================= */

function renderQuestions() {
  questionsEl.innerHTML = QUESTIONS.map((text, i) => {
    const key = qKey(i);
    return `
      <div class="q" data-key="${key}">
        <div class="q-title"><b>${i + 1}.</b> ${escapeHtml(text)}</div>
        <div class="scale">
          ${[1,2,3,4,5].map(n => `<button type="button" data-val="${n}">${n}</button>`).join("")}
        </div>
        <div class="muted">1=péssimo • 5=excelente</div>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".q").forEach((qEl) => {
    qEl.querySelectorAll("button[data-val]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = qEl.getAttribute("data-key");
        const val = Number(btn.getAttribute("data-val"));

        answers[key] = val;

        // marca ativo
        qEl.querySelectorAll("button[data-val]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        updateUI();
      });
    });
  });

  updateUI();
}

/* =========================
   CARREGAR DADOS DA LOJA
   ========================= */

async function loadStore() {
  const ref = doc(db, "stores", storeId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    alert("Loja não encontrada.");
    location.href = "stores.html";
    return;
  }

  const s = snap.data();

  storeTitle.textContent = s.name || "Loja";
  storeMeta.textContent = `${s.category || ""} • ${s.city || ""} • ⭐ ${Number(s.ratingAvg || 0).toFixed(2)} (${Number(s.ratingCount || 0)}) • Críticas: ${Number(s.criticalCount || 0)}`;
}

/* =========================
   CARREGAR MINHA REVIEW (se existir)
   ========================= */

async function loadMyReview(uid) {
  const ref = doc(db, "stores", storeId, "reviews", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const r = snap.data();
  answers = r.answers || {};
  commentEl.value = r.comment || "";

  // pintar botões
  Object.entries(answers).forEach(([k, v]) => {
    const qEl = document.querySelector(`.q[data-key="${k}"]`);
    if (!qEl) return;
    qEl.querySelectorAll("button[data-val]").forEach((b) => b.classList.remove("active"));
    const active = qEl.querySelector(`button[data-val="${v}"]`);
    if (active) active.classList.add("active");
  });

  updateUI();
}

/* =========================
   RECOMPUTE AGREGADOS (MVP)
   Atualiza:
   - ratingAvg
   - ratingCount
   - criticalCount (quantas reviews com criticalFail)
   ========================= */

async function recomputeStoreAggregate() {
  const revCol = collection(db, "stores", storeId, "reviews");
  const snap = await getDocs(revCol);
  const reviews = snap.docs.map(d => d.data());

  if (reviews.length === 0) {
    await updateDoc(doc(db, "stores", storeId), {
      ratingAvg: 0,
      ratingCount: 0,
      criticalCount: 0,
      updatedAt: serverTimestamp()
    });
    return;
  }

  const sum = reviews.reduce((acc, r) => acc + Number(r.averageRating || 0), 0);
  const avg = sum / reviews.length;

  const criticalCount = reviews.reduce((acc, r) => acc + (r.criticalFail ? 1 : 0), 0);

  await updateDoc(doc(db, "stores", storeId), {
    ratingAvg: avg,
    ratingCount: reviews.length,
    criticalCount,
    updatedAt: serverTimestamp()
  });
}

/* =========================
   SALVAR REVIEW
   ========================= */

btnSalvar.addEventListener("click", async () => {
  show("");

  if (!currentUser) return show("Você precisa estar logado.");

  const filled = Object.keys(answers).length;
  if (filled < QUESTIONS.length) return show(`Responda todas as ${QUESTIONS.length} perguntas.`);

  const avg = calcAverage();
  const crit = criticalFlags();

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    const uid = currentUser.uid;
    const ref = doc(db, "stores", storeId, "reviews", uid);

    await setDoc(ref, {
      uid,
      storeId,
      answers,
      averageRating: avg,
      comment: (commentEl.value || "").trim(),

      // status inteligente
      criticalFail: crit.hasCriticalFail,
      failedCritical: crit.failedCritical,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    await recomputeStoreAggregate();
    await loadStore();

    show("Avaliação salva ✅");
  } catch (e) {
    console.error(e);
    show("Erro ao salvar: " + (e?.message || e));
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar avaliação";
  }
});

/* =========================
   DENUNCIAR (MVP simples)
   ========================= */

btnReport?.addEventListener("click", async () => {
  show("");

  if (!currentUser) return show("Você precisa estar logado.");
  const reason = reportReasonEl?.value || "";
  if (!reason) return show("Selecione um motivo.");

  try {
    await addDoc(collection(db, "reports"), {
      storeId,
      reviewUid: currentUser.uid,
      reportedBy: currentUser.uid,
      reason,
      createdAt: serverTimestamp(),
      status: "open"
    });

    show("Denúncia enviada ✅");
    reportReasonEl.value = "";
  } catch (e) {
    console.error(e);
    show("Erro ao denunciar: " + (e?.message || e));
  }
});

/* =========================
   SAIR
   ========================= */

btnSair?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

/* =========================
   AUTH
   ========================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }

  currentUser = user;
  userEmailEl.textContent = user.email || "(sem email)";

  renderQuestions();
  await loadStore();
  await loadMyReview(user.uid);
});
