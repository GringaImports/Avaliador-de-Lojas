import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

/* ---------------- ELEMENTOS ---------------- */
const userEmailEl = document.querySelector("#userEmail");
const btnSair = document.querySelector("#btnSair");
const msg = document.querySelector("#msg");

const nameEl = document.querySelector("#storeName");
const cityEl = document.querySelector("#storeCity");
const catEl = document.querySelector("#storeCategory");
const btnCriar = document.querySelector("#btnCriar");

const listEl = document.querySelector("#storesList");
const top5El = document.querySelector("#top5List");

const countEl = document.querySelector("#storesCount");
const totalReviewsEl = document.querySelector("#totalReviews");
const showingCountEl = document.querySelector("#showingCount");

const kpiAvgEl = document.querySelector("#kpiAvg");
const kpiTopCityEl = document.querySelector("#kpiTopCity");
const kpiApprovedEl = document.querySelector("#kpiApproved");
const kpiCriticalEl = document.querySelector("#kpiCritical");

const cityInsightsEl = document.querySelector("#cityInsights");
const catInsightsEl = document.querySelector("#catInsights");

const searchInput = document.querySelector("#searchInput");
const cityFilter = document.querySelector("#cityFilter");
const categoryFilter = document.querySelector("#categoryFilter");
const btnClearFilters = document.querySelector("#btnClearFilters");
const btnExportCSV = document.querySelector("#btnExportCSV");

const sortNameBtn = document.querySelector("#sortName");
const sortAvgBtn = document.querySelector("#sortAvg");
const sortCountBtn = document.querySelector("#sortCount");
const sortLabelEl = document.querySelector("#sortLabel");

/* ---------------- ESTADO ---------------- */
let allStores = [];
let filteredStores = [];
let sortKey = "createdAt";
let sortDir = "desc";

/* ---------------- UTIL ---------------- */
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

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/* Status inteligente (usa criticalCount se existir) */
function statusFromStore(store) {
  const avg = Number(store.ratingAvg || 0);
  const cnt = Number(store.ratingCount || 0);
  const critical = Number(store.criticalCount || 0);

  if (cnt === 0) return { label: "Sem avaliações", cls: "status-neutral" };
  if (critical > 0) return { label: "Crítica", cls: "status-bad" };
  if (avg >= 4.2) return { label: "Aprovada", cls: "status-ok" };
  if (avg >= 3.2) return { label: "Atenção", cls: "status-warn" };
  return { label: "Crítica", cls: "status-bad" };
}

function rankingScore(store) {
  const avg = Number(store.ratingAvg || 0);
  const cnt = Number(store.ratingCount || 0);
  const volumeBoost = Math.log10(cnt + 1) * 0.25;
  const penalty = Number(store.criticalCount || 0) > 0 ? 0.35 : 0;
  return (avg + volumeBoost) - penalty;
}

function compare(a, b) {
  const dir = sortDir === "asc" ? 1 : -1;

  if (sortKey === "name") {
    return (a.name || "").localeCompare(b.name || "") * dir;
  }
  if (sortKey === "ratingAvg") {
    return (Number(a.ratingAvg || 0) - Number(b.ratingAvg || 0)) * dir;
  }
  if (sortKey === "ratingCount") {
    return (Number(a.ratingCount || 0) - Number(b.ratingCount || 0)) * dir;
  }
  const aT = a._createdAtMs || 0;
  const bT = b._createdAtMs || 0;
  return (aT - bT) * dir;
}

/* ---------------- DELETE LOJA (com cascade simples) ----------------
   - apaga todas as reviews (subcoleção)
   - apaga o doc da loja
*/
async function deleteStore(storeId, storeName) {
  const ok = confirm(
    `Tem certeza que deseja APAGAR a loja "${storeName}"?\n\nIsso vai apagar também as avaliações desta loja.`
  );
  if (!ok) return;

  try {
    show("Apagando loja...");

    // 1) apagar reviews da subcoleção
    const revSnap = await getDocs(collection(db, "stores", storeId, "reviews"));
    for (const d of revSnap.docs) {
      await deleteDoc(doc(db, "stores", storeId, "reviews", d.id));
    }

    // 2) apagar a loja
    await deleteDoc(doc(db, "stores", storeId));

    show("Loja apagada ✅");
    await carregarLojas();
  } catch (e) {
    console.error(e);
    show("Erro ao apagar: " + (e?.message || e));
  }
}

/* ---------------- RENDER ---------------- */
function renderStoreItem(s, isTop = false) {
  const avg = Number(s.ratingAvg || 0);
  const cnt = Number(s.ratingCount || 0);
  const st = statusFromStore(s);
  const crit = Number(s.criticalCount || 0);

  return `
    <div class="item ${isTop ? "top-item" : ""}">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div>
          <b>${escapeHtml(s.name || "Sem nome")}</b>

          <div class="meta">
            <span class="badge">${escapeHtml(s.category || "Sem categoria")}</span>
            <span class="badge">${escapeHtml(s.city || "Sem cidade")}</span>
            <span class="star">⭐ ${avg.toFixed(2)} (${cnt})</span>
            <span class="badge-status ${st.cls}">${st.label}</span>
            ${crit > 0 ? `<span class="badge-status status-bad">⚠ Crítico: ${crit}</span>` : ""}
          </div>

          <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
            <a class="pill" href="./store.html#id=${encodeURIComponent(s.id)}">Avaliar</a>
            <button class="btn-danger" data-del="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name || "Sem nome")}">
              Apagar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLists() {
  showingCountEl.textContent = String(filteredStores.length);

  if (filteredStores.length === 0) {
    listEl.innerHTML = `<p class="muted">Nenhum resultado encontrado.</p>`;
  } else {
    listEl.innerHTML = filteredStores.map(s => renderStoreItem(s, false)).join("");

    // liga eventos dos botões apagar
    document.querySelectorAll("button[data-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        const nm = btn.getAttribute("data-name") || "Loja";
        await deleteStore(id, nm);
      });
    });
  }

  const top5 = [...allStores]
    .filter(s => Number(s.ratingCount || 0) > 0)
    .sort((a, b) => rankingScore(b) - rankingScore(a))
    .slice(0, 5);

  if (top5.length === 0) {
    top5El.innerHTML = `<p class="muted">Ainda não há ranking (faça a 1ª avaliação em alguma loja).</p>`;
  } else {
    top5El.innerHTML = top5.map((s, idx) => `
      <div class="item top-item">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <b>${idx + 1}. ${escapeHtml(s.name || "Sem nome")}</b>
            <div class="meta">
              <span class="badge">${escapeHtml(s.category || "Sem categoria")}</span>
              <span class="badge">${escapeHtml(s.city || "Sem cidade")}</span>
              <span class="star">⭐ ${Number(s.ratingAvg || 0).toFixed(2)} (${Number(s.ratingCount || 0)})</span>
              <span class="badge-status ${statusFromStore(s).cls}">${statusFromStore(s).label}</span>
            </div>
          </div>
          <a class="pill" href="./store.html#id=${encodeURIComponent(s.id)}">Abrir</a>
        </div>
      </div>
    `).join("");
  }

  sortLabelEl.textContent = `Ordenando por: ${sortKey} (${sortDir})`;
}

function computeKPIsAndInsights() {
  countEl.textContent = String(allStores.length);

  const totalReviews = allStores.reduce((acc, s) => acc + Number(s.ratingCount || 0), 0);
  totalReviewsEl.textContent = String(totalReviews);

  let weightedSum = 0;
  let weight = 0;
  for (const s of allStores) {
    const cnt = Number(s.ratingCount || 0);
    const avg = Number(s.ratingAvg || 0);
    if (cnt > 0) {
      weightedSum += avg * cnt;
      weight += cnt;
    }
  }
  const globalAvg = weight > 0 ? (weightedSum / weight) : 0;
  kpiAvgEl.textContent = globalAvg.toFixed(2);

  let approved = 0;
  let critical = 0;
  for (const s of allStores) {
    const st = statusFromStore(s).label;
    if (st === "Aprovada") approved++;
    if (st === "Crítica") critical++;
  }
  kpiApprovedEl.textContent = String(approved);
  kpiCriticalEl.textContent = String(critical);

  const byCity = new Map();
  const byCat = new Map();

  function addAgg(map, key, avg, cnt) {
    if (!key) return;
    if (!map.has(key)) map.set(key, { weightedSum: 0, weight: 0 });
    const obj = map.get(key);
    obj.weightedSum += avg * cnt;
    obj.weight += cnt;
  }

  for (const s of allStores) {
    const city = String(s.city || "").trim();
    const cat = String(s.category || "").trim();
    const cnt = Number(s.ratingCount || 0);
    const avg = Number(s.ratingAvg || 0);
    addAgg(byCity, city, avg, cnt);
    addAgg(byCat, cat, avg, cnt);
  }

  function topList(map) {
    return [...map.entries()]
      .map(([k, v]) => ({
        key: k,
        avg: v.weight > 0 ? v.weightedSum / v.weight : 0,
        weight: v.weight
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
  }

  const topCities = topList(byCity);
  const topCats = topList(byCat);

  kpiTopCityEl.textContent = topCities[0]?.key || "-";

  cityInsightsEl.innerHTML = topCities.length ? topCities.map(x => `
    <div class="mini-row">
      <span>${escapeHtml(x.key)}</span>
      <span class="muted">⭐ ${x.avg.toFixed(2)} • ${x.weight} reviews</span>
    </div>
  `).join("") : `<div class="muted">Sem dados</div>`;

  catInsightsEl.innerHTML = topCats.length ? topCats.map(x => `
    <div class="mini-row">
      <span>${escapeHtml(x.key)}</span>
      <span class="muted">⭐ ${x.avg.toFixed(2)} • ${x.weight} reviews</span>
    </div>
  `).join("") : `<div class="muted">Sem dados</div>`;
}

function populateFilters() {
  const cities = uniqueSorted(allStores.map(s => String(s.city || "").trim()));
  const cats = uniqueSorted(allStores.map(s => String(s.category || "").trim()));

  const currentCity = cityFilter.value;
  const currentCat = categoryFilter.value;

  cityFilter.innerHTML = `<option value="">Todas</option>` + cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  categoryFilter.innerHTML = `<option value="">Todas</option>` + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  if (cities.includes(currentCity)) cityFilter.value = currentCity;
  if (cats.includes(currentCat)) categoryFilter.value = currentCat;
}

function applyFiltersAndSort() {
  const q = norm(searchInput.value);
  const city = norm(cityFilter.value);
  const cat = norm(categoryFilter.value);

  filteredStores = allStores.filter(s => {
    const okName = !q || norm(s.name).includes(q);
    const okCity = !city || norm(s.city) === city;
    const okCat = !cat || norm(s.category) === cat;
    return okName && okCity && okCat;
  });

  filteredStores.sort(compare);
  renderLists();
}

/* ---------------- FIRESTORE ---------------- */
async function carregarLojas() {
  listEl.innerHTML = `<p class="muted">Carregando...</p>`;
  top5El.innerHTML = `<p class="muted">Carregando...</p>`;
  show("");

  try {
    const q = query(collection(db, "stores"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    allStores = snap.docs.map((d) => {
      const data = d.data();
      const ms = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0;
      return { id: d.id, ...data, _createdAtMs: ms };
    });

    populateFilters();
    computeKPIsAndInsights();
    applyFiltersAndSort();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="muted">Erro ao carregar lojas.</p>`;
    top5El.innerHTML = "";
    show("Erro Firestore: " + (e?.message || e));
  }
}

/* ---------------- CRIAR LOJA ---------------- */
btnCriar.addEventListener("click", async () => {
  show("");

  const name = (nameEl.value || "").trim();
  const city = (cityEl.value || "").trim();
  const category = (catEl.value || "").trim();

  if (!name || !city || !category) return show("Preencha nome, cidade e categoria.");

  btnCriar.disabled = true;
  btnCriar.textContent = "Criando...";

  try {
    await addDoc(collection(db, "stores"), {
      name,
      city,
      category,
      ratingAvg: 0,
      ratingCount: 0,
      criticalCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    nameEl.value = "";
    cityEl.value = "";
    catEl.value = "";

    show("Loja criada ✅");
    await carregarLojas();
  } catch (e) {
    console.error(e);
    show("Erro ao criar loja: " + (e?.message || e));
  } finally {
    btnCriar.disabled = false;
    btnCriar.textContent = "Criar loja";
  }
});

/* ---------------- FILTROS ---------------- */
let searchTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFiltersAndSort, 120);
});
cityFilter.addEventListener("change", applyFiltersAndSort);
categoryFilter.addEventListener("change", applyFiltersAndSort);

btnClearFilters.addEventListener("click", () => {
  searchInput.value = "";
  cityFilter.value = "";
  categoryFilter.value = "";
  applyFiltersAndSort();
});

/* ---------------- ORDENAÇÃO ---------------- */
function toggleSort(nextKey) {
  if (sortKey === nextKey) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = nextKey;
    sortDir = (nextKey === "name") ? "asc" : "desc";
  }
  applyFiltersAndSort();
}
sortNameBtn.addEventListener("click", () => toggleSort("name"));
sortAvgBtn.addEventListener("click", () => toggleSort("ratingAvg"));
sortCountBtn.addEventListener("click", () => toggleSort("ratingCount"));

/* ---------------- EXPORT CSV ---------------- */
function downloadCSV(rows, filename = "avaliador-lojas.csv") {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

btnExportCSV.addEventListener("click", () => {
  const rows = [["id","name","city","category","ratingAvg","ratingCount","criticalCount","status"]];
  filteredStores.forEach(s => {
    rows.push([
      s.id,
      s.name || "",
      s.city || "",
      s.category || "",
      Number(s.ratingAvg || 0).toFixed(2),
      Number(s.ratingCount || 0),
      Number(s.criticalCount || 0),
      statusFromStore(s).label
    ]);
  });
  downloadCSV(rows, "avaliador-lojas_export.csv");
});

/* ---------------- LOGOUT ---------------- */
btnSair.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

/* ---------------- AUTH ---------------- */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  userEmailEl.textContent = user.email || "(sem email)";
  carregarLojas();
});
