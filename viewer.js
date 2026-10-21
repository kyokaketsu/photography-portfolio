// 桌面端单张浏览。只在 769px 以上启用，手机端完全沿用原页面。
(() => {
  const desktop = window.matchMedia("(min-width: 769px)");
  const seriesIds = ["field-color", "field-monochrome", "color", "monochrome"];
  const root = document.documentElement;
  const main = document.querySelector("main");
  const nav = document.querySelector(".menu-panel");
  if (!main || !nav) return;

  // 从原页面收集每个系列的照片（FC–05 作为 Field / Color 第一张）
  const toItem = (img, title) => ({
    src: img.getAttribute("src"),
    srcset: img.getAttribute("srcset") || "",
    width: img.getAttribute("width"),
    height: img.getAttribute("height"),
    alt: img.getAttribute("alt") || "",
    title,
  });
  const series = {};
  for (const id of seriesIds) {
    const section = document.getElementById(id);
    if (!section) continue;
    series[id] = [...section.querySelectorAll(".photo-button")].map((b) => toItem(b.querySelector("img"), b.dataset.title));
  }
  const opening = document.querySelector(".photo-first-card .photo-button");
  if (opening && series["field-color"]) series["field-color"].unshift(toItem(opening.querySelector("img"), opening.dataset.title));

  // 右侧舞台
  const viewer = document.createElement("section");
  viewer.className = "viewer";
  viewer.setAttribute("aria-label", "Photograph viewer");
  viewer.innerHTML = `<figure class="viewer-figure"><div class="viewer-stage"><img class="viewer-image" alt="" decoding="async" /></div><figcaption class="viewer-caption"><span class="viewer-title"></span><span class="viewer-count"></span></figcaption></figure>`;
  main.prepend(viewer);
  const stage = viewer.querySelector(".viewer-stage");
  const image = viewer.querySelector(".viewer-image");
  const titleEl = viewer.querySelector(".viewer-title");
  const countEl = viewer.querySelector(".viewer-count");

  // 侧栏底部：邮箱与 Instagram 图标
  const links = document.createElement("div");
  links.className = "viewer-links";
  links.innerHTML = `<a href="mailto:gongjiajie5@icloud.com" aria-label="Email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg></a><a href="https://www.instagram.com/kyokaketsu/" target="_blank" rel="noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor" stroke="none"/></svg></a>`;
  nav.after(links);

  let current = "field-color";
  let index = 0;

  const preload = (item) => { if (!item) return; const i = new Image(); i.sizes = image.sizes; i.srcset = item.srcset; i.src = item.src; };
  const render = () => {
    const list = series[current] || [];
    const item = list[index];
    if (!item) return;
    image.srcset = item.srcset;
    image.sizes = "100vw"; // 让固有宽度不小于可用宽度，再由 max-width / max-height 等比收缩
    image.src = item.src;
    image.width = item.width;
    image.height = item.height;
    image.alt = item.alt;
    titleEl.textContent = item.title;
    countEl.textContent = `${index + 1} / ${list.length}`;
    for (const a of nav.querySelectorAll(".nav-sub")) a.classList.toggle("is-current", a.getAttribute("href") === `#${current}`);
    preload(list[index + 1]);
    preload(list[index - 1]);
    updateCursor(lastSide);
  };
  const go = (step) => {
    const list = series[current] || [];
    const next = index + step;
    if (next < 0 || next >= list.length) return; // 到头不再反应
    index = next;
    render();
  };
  const openSeries = (id) => {
    if (!series[id]) return;
    current = id;
    index = 0;
    history.replaceState(null, "", `#${id}`);
    render();
  };

  // 左半边上一张，右半边下一张
  let lastSide = "next";
  const sideOf = (event) => {
    const r = stage.getBoundingClientRect();
    return event.clientX - r.left < r.width / 2 ? "prev" : "next";
  };
  const updateCursor = (side) => {
    const list = series[current] || [];
    const atEnd = side === "prev" ? index === 0 : index === list.length - 1;
    stage.classList.toggle("is-prev", side === "prev" && !atEnd);
    stage.classList.toggle("is-next", side === "next" && !atEnd);
    stage.classList.toggle("is-end", atEnd);
  };
  stage.addEventListener("mousemove", (e) => { lastSide = sideOf(e); updateCursor(lastSide); });
  stage.addEventListener("click", (e) => go(sideOf(e) === "prev" ? -1 : 1));

  // 目录点击切换系列（不再滚动页面）
  document.addEventListener("click", (e) => {
    if (!root.classList.contains("is-viewer")) return;
    const a = e.target.closest(".menu-panel a, .brand");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    const id = href === "#top" ? "field-color" : href.slice(1);
    if (!series[id]) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openSeries(id);
    a.blur(); // 之后按方向键时不显示目录上的焦点框
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!root.classList.contains("is-viewer")) return;
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  });

  const apply = () => {
    root.classList.toggle("is-viewer", desktop.matches);
    if (desktop.matches) {
      const id = location.hash.slice(1);
      if (series[id]) current = id;
      render();
    }
  };
  desktop.addEventListener("change", apply);
  apply();
})();
