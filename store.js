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
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

/* =========================
   CONFIG
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

// perguntas críticas (1-based): 10, 11, 16, 17
const CRITICAL_INDEXES = [9, 10, 15, 16];

const MAX_IMAGES_PER_QUESTION = 3;
const IMAGE_MAX_WIDTH = 1000;
const IMAGE_QUALITY = 0.62;

/* =========================
   ELEMENTOS
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
const btnBaixarPdf = document.querySelector("#btnBaixarPdf");
const msg = document.querySelector("#msg");

const reportReasonEl = document.querySelector("#reportReason");
const btnReport = document.querySelector("#btnReport");

/* =========================
   STORE ID
   URL: store.html#id=ABC123
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
let currentStore = null;
let answers = {};
let lastSavedSnapshot = null;

/* =========================
   UTILS
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

function initAnswers() {
  answers = {};
  QUESTIONS.forEach((text, i) => {
    answers[qKey(i)] = {
      text,
      answer: "",
      note: "",
      images: []
    };
  });
}

function answeredCount() {
  return Object.values(answers).filter(
    (item) => item.answer === "sim" || item.answer === "nao"
  ).length;
}

function yesCount() {
  return Object.values(answers).filter((item) => item.answer === "sim").length;
}

function noCount() {
  return Object.values(answers).filter((item) => item.answer === "nao").length;
}

function compliancePct() {
  return (yesCount() / QUESTIONS.length) * 100;
}

// Mantém compatibilidade com o restante do sistema (escala 0 a 5)
function ratingEquivalent() {
  return (yesCount() / QUESTIONS.length) * 5;
}

function criticalFlagsFromAnswers() {
  const failed = CRITICAL_INDEXES
    .map((idx) => ({
      idx: idx + 1,
      key: qKey(idx),
      answer: answers[qKey(idx)]?.answer || ""
    }))
    .filter((item) => item.answer === "nao");

  return {
    hasCriticalFail: failed.length > 0,
    failedCritical: failed.map((item) => item.idx)
  };
}

function statusFromCurrentAnswers() {
  const filled = answeredCount();
  if (filled < QUESTIONS.length) {
    return {
      label: `Faltam ${QUESTIONS.length - filled} perguntas`,
      tone: "neutral"
    };
  }

  const crit = criticalFlagsFromAnswers();
  if (crit.hasCriticalFail) {
    return {
      label: `🚨 Crítico (falha nas perguntas: ${crit.failedCritical.join(", ")})`,
      tone: "bad"
    };
  }

  const no = noCount();
  if (no === 0) return { label: "✅ Tudo conforme", tone: "ok" };
  if (no <= 5) return { label: "⚠️ Pontos de atenção", tone: "warn" };
  return { label: "🚨 Necessita ação", tone: "bad" };
}

function statusFromStore(store) {
  const avg = Number(store?.ratingAvg || 0);
  const cnt = Number(store?.ratingCount || 0);
  const critical = Number(store?.criticalCount || 0);

  if (cnt === 0) return { label: "Sem avaliações", cls: "status-neutral" };
  if (critical > 0) return { label: "Crítica", cls: "status-bad" };
  if (avg >= 4.2) return { label: "Aprovada", cls: "status-ok" };
  if (avg >= 3.2) return { label: "Atenção", cls: "status-warn" };
  return { label: "Crítica", cls: "status-bad" };
}

function deepCloneAnswers() {
  return JSON.parse(JSON.stringify(answers));
}

function setSaveLoading(isLoading) {
  btnSalvar.disabled = isLoading;
  btnSalvar.textContent = isLoading ? "Salvando..." : "Salvar checklist e gerar PDF";
}

function getImageTypeFromBase64(base64) {
  if (String(base64).startsWith("data:image/png")) return "PNG";
  return "JPEG";
}

function safeText(value, fallback = "-") {
  const v = String(value ?? "").trim();
  return v || fallback;
}

function splitLongText(pdf, text, maxWidth = 180) {
  return pdf.splitTextToSize(String(text || "-"), maxWidth);
}

function formatDateBR(value = new Date()) {
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return new Date().toLocaleString("pt-BR");
  }
}

/* =========================
   IMAGEM -> BASE64 COM COMPRESSÃO
   ========================= */

async function compressImageToBase64(file, maxWidth = IMAGE_MAX_WIDTH, quality = IMAGE_QUALITY) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");

          let { width, height } = img;

          if (width > maxWidth) {
            const ratio = maxWidth / width;
            width = maxWidth;
            height = Math.round(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const base64 = canvas.toDataURL("image/jpeg", quality);
          resolve(base64);
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =========================
   UI
   ========================= */

function updateUI() {
  myAvgEl.textContent = `${answeredCount()}/${QUESTIONS.length}`;
  statusEl.textContent = statusFromCurrentAnswers().label;

  if (btnBaixarPdf) {
    btnBaixarPdf.style.display = lastSavedSnapshot ? "inline-block" : "none";
  }
}

function renderQuestionPreview(previewEl, images) {
  if (!images?.length) {
    previewEl.innerHTML = "";
    return;
  }

  previewEl.innerHTML = images.map((img, idx) => `
    <div style="position:relative;">
      <img
        src="${img}"
        alt="Preview ${idx + 1}"
        style="width:90px; height:90px; object-fit:cover; border-radius:10px; border:1px solid rgba(255,255,255,.12);"
      />
    </div>
  `).join("");
}

function bindQuestionEvents() {
  document.querySelectorAll(".q").forEach((qEl) => {
    const key = qEl.getAttribute("data-key");
    const btns = qEl.querySelectorAll(".bin-btn");
    const noteEl = qEl.querySelector(".q-note");
    const filesEl = qEl.querySelector(".q-files");
    const previewEl = qEl.querySelector(".q-preview");

    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const answer = btn.getAttribute("data-answer");
        answers[key].answer = answer;

        btns.forEach((b) => {
          b.classList.remove("btn-primary");
          b.classList.add("btn-ghost");
        });

        btn.classList.remove("btn-ghost");
        btn.classList.add("btn-primary");

        updateUI();
      });
    });

    noteEl.addEventListener("input", () => {
      answers[key].note = noteEl.value || "";
    });

    filesEl.addEventListener("change", async () => {
      const files = Array.from(filesEl.files || []);

      if (files.length > MAX_IMAGES_PER_QUESTION) {
        show(`Cada pergunta permite no máximo ${MAX_IMAGES_PER_QUESTION} imagens.`);
        filesEl.value = "";
        return;
      }

      previewEl.innerHTML = `<span class="muted">Processando imagens...</span>`;

      try {
        const images = [];

        for (const file of files) {
          const base64 = await compressImageToBase64(file);
          images.push(base64);
        }

        answers[key].images = images;
        renderQuestionPreview(previewEl, images);
      } catch (e) {
        console.error(e);
        answers[key].images = [];
        previewEl.innerHTML = "";
        show("Erro ao processar imagem.");
      }
    });
  });
}

function renderQuestions() {
  questionsEl.innerHTML = QUESTIONS.map((text, i) => {
    const key = qKey(i);
    const item = answers[key] || { answer: "", note: "", images: [] };

    return `
      <div class="q" data-key="${key}">
        <div class="q-title"><b>${i + 1}.</b> ${escapeHtml(text)}</div>

        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
          <button
            type="button"
            class="bin-btn ${item.answer === "sim" ? "btn-primary" : "btn-ghost"}"
            data-answer="sim"
          >
            Sim
          </button>

          <button
            type="button"
            class="bin-btn ${item.answer === "nao" ? "btn-primary" : "btn-ghost"}"
            data-answer="nao"
          >
            Não
          </button>
        </div>

        <label>Observação</label>
        <textarea class="q-note" placeholder="Escreva uma observação...">${escapeHtml(item.note || "")}</textarea>

        <label>Fotos (até ${MAX_IMAGES_PER_QUESTION})</label>
        <input class="q-files" type="file" accept="image/*" multiple />

        <div class="q-preview" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          ${(item.images || []).map((img, idx) => `
            <img
              src="${img}"
              alt="Preview ${idx + 1}"
              style="width:90px; height:90px; object-fit:cover; border-radius:10px; border:1px solid rgba(255,255,255,.12);"
            />
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  bindQuestionEvents();
  updateUI();
}

/* =========================
   PDF
   ========================= */

async function generatePDF(snapshot) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  const pageWidth = 210;
  const margin = 10;
  const contentWidth = pageWidth - (margin * 2);
  let y = 14;

  function ensureSpace(required = 10) {
    if (y + required > 285) {
      pdf.addPage();
      y = 14;
    }
  }

  function writeLabelValue(label, value) {
    const lines = splitLongText(pdf, `${label}: ${safeText(value)}`, contentWidth);
    ensureSpace(lines.length * 5 + 2);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.text(lines, margin, y);
    y += (lines.length * 5) + 1;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Relatório de Avaliação da Loja", margin, y);
  y += 9;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);

  writeLabelValue("Loja", currentStore?.name || storeTitle.textContent || "-");
  writeLabelValue("Cidade", currentStore?.city || "-");
  writeLabelValue("Categoria", currentStore?.category || "-");
  writeLabelValue("Usuário", currentUser?.email || "-");
  writeLabelValue("Data/Hora", formatDateBR());
  writeLabelValue("Respondidas", `${answeredCount()}/${QUESTIONS.length}`);
  writeLabelValue("Conformidade", `${compliancePct().toFixed(1)}%`);
  writeLabelValue("Status", statusFromCurrentAnswers().label);

  if (snapshot.generalComment) {
    const lines = splitLongText(pdf, `Observação geral: ${snapshot.generalComment}`, contentWidth);
    ensureSpace(lines.length * 5 + 4);
    pdf.text(lines, margin, y);
    y += (lines.length * 5) + 3;
  }

  y += 2;

  for (let i = 0; i < QUESTIONS.length; i++) {
    const key = qKey(i);
    const item = snapshot.answers[key];

    ensureSpace(18);

    pdf.setDrawColor(180, 180, 180);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 5;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    const titleLines = splitLongText(pdf, `${i + 1}. ${QUESTIONS[i]}`, contentWidth);
    ensureSpace(titleLines.length * 5 + 2);
    pdf.text(titleLines, margin, y);
    y += (titleLines.length * 5) + 1;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.text(`Resposta: ${(item?.answer || "-").toUpperCase()}`, margin, y);
    y += 6;

    const noteLines = splitLongText(
      pdf,
      `Observação: ${safeText(item?.note || "-", "-")}`,
      contentWidth
    );
    ensureSpace(noteLines.length * 5 + 2);
    pdf.text(noteLines, margin, y);
    y += (noteLines.length * 5) + 2;

    const images = item?.images || [];
    if (images.length) {
      for (const img of images) {
        ensureSpace(44);
        try {
          pdf.addImage(img, getImageTypeFromBase64(img), margin, y, 55, 40);
          y += 44;
        } catch (e) {
          console.error("Erro ao inserir imagem no PDF:", e);
          pdf.text("[Imagem não pôde ser renderizada]", margin, y);
          y += 8;
        }
      }
    } else {
      pdf.text("Imagens: nenhuma", margin, y);
      y += 7;
    }

    y += 2;
  }

  const fileName = `relatorio-${storeId}-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.pdf`;
  pdf.save(fileName);
}

/* =========================
   DADOS DA LOJA
   ========================= */

async function loadStore() {
  const ref = doc(db, "stores", storeId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    alert("Loja não encontrada.");
    location.href = "stores.html";
    return;
  }

  currentStore = { id: snap.id, ...snap.data() };

  const st = statusFromStore(currentStore);
  storeTitle.textContent = currentStore.name || "Loja";
  storeMeta.textContent =
    `${currentStore.category || ""} • ${currentStore.city || ""} • ` +
    `⭐ ${Number(currentStore.ratingAvg || 0).toFixed(2)} (${Number(currentStore.ratingCount || 0)}) • ` +
    `Críticas: ${Number(currentStore.criticalCount || 0)} • Status: ${st.label}`;
}

/* =========================
   CARREGAR MINHA REVIEW
   reviews/{uid}
   reviews/{uid}/items/{qKey}
   ========================= */

async function loadMyReview(uid) {
  const reviewRef = doc(db, "stores", storeId, "reviews", uid);
  const reviewSnap = await getDoc(reviewRef);

  if (!reviewSnap.exists()) {
    lastSavedSnapshot = null;
    updateUI();
    return;
  }

  const review = reviewSnap.data();
  commentEl.value = review.generalComment || "";

  const itemsSnap = await getDocs(collection(db, "stores", storeId, "reviews", uid, "items"));

  itemsSnap.forEach((itemDoc) => {
    const key = itemDoc.id;
    const item = itemDoc.data();

    if (!answers[key]) return;

    answers[key] = {
      text: item.text || answers[key].text,
      answer: item.answer || "",
      note: item.note || "",
      images: Array.isArray(item.images) ? item.images : []
    };
  });

  lastSavedSnapshot = {
    generalComment: commentEl.value || "",
    answers: deepCloneAnswers()
  };

  renderQuestions();
  updateUI();
}

/* =========================
   AGREGADOS DA LOJA
   Mantém compatibilidade com stores.js e ranking.js
   ========================= */

async function recomputeStoreAggregate() {
  const revCol = collection(db, "stores", storeId, "reviews");
  const snap = await getDocs(revCol);
  const reviews = snap.docs.map((d) => d.data());

  if (reviews.length === 0) {
    await updateDoc(doc(db, "stores", storeId), {
      ratingAvg: 0,
      ratingCount: 0,
      criticalCount: 0,
      updatedAt: serverTimestamp()
    });
    return;
  }

  const sum = reviews.reduce((acc, r) => acc + Number(r.ratingEquivalent || 0), 0);
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
   SALVAR REVIEW + ITEMS + PDF
   ========================= */

btnSalvar.addEventListener("click", async () => {
  show("");

  if (!currentUser) return show("Você precisa estar logado.");

  const filled = answeredCount();
  if (filled < QUESTIONS.length) {
    return show(`Responda todas as ${QUESTIONS.length} perguntas.`);
  }

  setSaveLoading(true);

  try {
    const uid = currentUser.uid;
    const reviewRef = doc(db, "stores", storeId, "reviews", uid);
    const existingReviewSnap = await getDoc(reviewRef);

    const crit = criticalFlagsFromAnswers();
    const reviewPayload = {
      uid,
      userEmail: currentUser.email || "",
      storeId,
      generalComment: (commentEl.value || "").trim(),
      answeredCount: answeredCount(),
      yesCount: yesCount(),
      noCount: noCount(),
      compliancePct: compliancePct(),
      ratingEquivalent: ratingEquivalent(),
      criticalFail: crit.hasCriticalFail,
      failedCritical: crit.failedCritical,
      updatedAt: serverTimestamp()
    };

    if (!existingReviewSnap.exists()) {
      reviewPayload.createdAt = serverTimestamp();
    }

    await setDoc(reviewRef, reviewPayload, { merge: true });

    const batch = writeBatch(db);

    QUESTIONS.forEach((text, i) => {
      const key = qKey(i);
      const itemRef = doc(db, "stores", storeId, "reviews", uid, "items", key);
      const item = answers[key];

      batch.set(itemRef, {
        order: i + 1,
        text,
        answer: item.answer || "",
        note: item.note || "",
        images: Array.isArray(item.images) ? item.images : [],
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    await batch.commit();

    await recomputeStoreAggregate();
    await loadStore();

    lastSavedSnapshot = {
      generalComment: (commentEl.value || "").trim(),
      answers: deepCloneAnswers()
    };

    show("Checklist salvo ✅ Gerando PDF...");
    updateUI();

    await generatePDF(lastSavedSnapshot);

    show("Checklist salvo ✅ PDF gerado com sucesso.");
  } catch (e) {
    console.error(e);
    show("Erro ao salvar: " + (e?.message || e));
  } finally {
    setSaveLoading(false);
  }
});

/* =========================
   BAIXAR ÚLTIMO PDF
   Regenera com os dados carregados
   ========================= */

btnBaixarPdf?.addEventListener("click", async () => {
  show("");

  if (!lastSavedSnapshot) {
    show("Nenhum checklist salvo para gerar PDF.");
    return;
  }

  try {
    btnBaixarPdf.disabled = true;
    btnBaixarPdf.textContent = "Gerando PDF...";
    await generatePDF(lastSavedSnapshot);
    show("PDF gerado ✅");
  } catch (e) {
    console.error(e);
    show("Erro ao gerar PDF.");
  } finally {
    btnBaixarPdf.disabled = false;
    btnBaixarPdf.textContent = "Baixar último PDF";
  }
});

/* =========================
   DENÚNCIA
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
   LOGOUT
   ========================= */

btnSair?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

/* =========================
   AUTH / INIT
   ========================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }

  currentUser = user;
  userEmailEl.textContent = user.email || "(sem email)";

  initAnswers();
  renderQuestions();

  await loadStore();
  await loadMyReview(user.uid);
});