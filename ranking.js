import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const rankingList = document.querySelector("#rankingList");
const showingCountEl = document.querySelector("#showingCount");
const sortLabelEl = document.querySelector("#sortLabel");

const searchInput = document.querySelector("#searchInput");
const cityFilter = document.querySelector("#cityFilter");
const categoryFilter = document.querySelector("#categoryFilter");
const btnClearFilters = document.querySelector("#btnClearFilters");
const btnExportCSV = document.querySelector("#btnExportCSV");

let allStores = [];
let filteredStores = [];

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function norm(v) { return String(v ?? "").trim().toLowerCase(); }
function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

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

function render() {
  showingCountEl.textContent = String(filteredStores.length);
  sortLabelEl.textContent = "Ordenado por ranking (nota + volume, com penalidade se crítico)";

  if (filteredStores.length === 0) {
    rankingList.innerHTML = `<p class="muted">Nenhum resultado encontrado.</p>`;
    return;
  }

  rankingList.innerHTML = filteredStores.map((s, idx) => {
    const st = statusFromStore(s);
    return `
      <div class="item top-item">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <b>${idx + 1}. ${escapeHtml(s.name || "Sem nome")}</b>
            <div class="meta">
              <span class="badge">${escapeHtml(s.category || "Sem categoria")}</span>
              <span class="badge">${escapeHtml(s.city || "Sem cidade")}</span>
              <span class="star">⭐ ${Number(s.ratingAvg || 0).toFixed(2)} (${Number(s.ratingCount || 0)})</span>
              <span class="badge-status ${st.cls}">${st.label}</span>
            </div>
          </div>
          <span class="pill">Score: ${rankingScore(s).toFixed(2)}</span>
        </div>
      </div>
    `;
  }).join("");
}

function populateFilters() {
  const cities = uniqueSorted(allStores.map(s => String(s.city || "").trim()));
  const cats = uniqueSorted(allStores.map(s => String(s.category || "").trim()));

  cityFilter.innerHTML = `<option value="">Todas</option>` + cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  categoryFilter.innerHTML = `<option value="">Todas</option>` + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

function applyFilters() {
  const q = norm(searchInput.value);
  const city = norm(cityFilter.value);
  const cat = norm(categoryFilter.value);

  filteredStores = allStores
    .filter(s => {
      const okName = !q || norm(s.name).includes(q);
      const okCity = !city || norm(s.city) === city;
      const okCat = !cat || norm(s.category) === cat;
      return okName && okCity && okCat;
    })
    .sort((a, b) => rankingScore(b) - rankingScore(a));

  render();
}

function downloadCSV(rows, filename = "ranking.csv") {
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
  const rows = [["rank","id","name","city","category","ratingAvg","ratingCount","criticalCount","status","score"]];
  filteredStores.forEach((s, idx) => {
    rows.push([
      idx + 1,
      s.id,
      s.name || "",
      s.city || "",
      s.category || "",
      Number(s.ratingAvg || 0).toFixed(2),
      Number(s.ratingCount || 0),
      Number(s.criticalCount || 0),
      statusFromStore(s).label,
      rankingScore(s).toFixed(2)
    ]);
  });
  downloadCSV(rows, "ranking_publico.csv");
});

btnClearFilters.addEventListener("click", () => {
  searchInput.value = "";
  cityFilter.value = "";
  categoryFilter.value = "";
  applyFilters();
});

let timer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(applyFilters, 120);
});
cityFilter.addEventListener("change", applyFilters);
categoryFilter.addEventListener("change", applyFilters);

async function load() {
  rankingList.innerHTML = `<p class="muted">Carregando...</p>`;
  const snap = await getDocs(collection(db, "stores"));
  allStores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  populateFilters();
  applyFilters();
}
load().catch(err => {
  console.error(err);
  rankingList.innerHTML = `<p class="muted">Erro ao carregar ranking.</p>`;
});
