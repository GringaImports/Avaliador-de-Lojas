async function loadHeader() {
  const holder = document.querySelector("[data-include='header']");
  if (!holder) return;

  const res = await fetch("header.html");
  const html = await res.text();
  holder.innerHTML = html;

  // Se a página não tiver auth (ex: login), oculta área da direita
  const hasAuthUI = document.querySelector("#loginForm") == null; // ajuste se quiser
  if (!hasAuthUI) {
    const right = document.querySelector(".topbar__right");
    if (right) right.style.display = "none";
  }
}

loadHeader();
