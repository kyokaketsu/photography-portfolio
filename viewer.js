// 单张浏览：桌面和手机都是一次一张，点照片左半边上一张、右半边下一张。
(() => {
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
  viewer.innerHTML = `<figure class="viewer-figure"><div class="viewer-stage"><img class="viewer-image" alt="" decoding="async" /></div><figcaption class="viewer-caption"><span class="viewer-title"></span><span class="viewer-count"></span></figcaption><div class="viewer-note"><p class="viewer-note-title"></p><p class="viewer-note-text"></p></div></figure>`;
  main.prepend(viewer);
  const stage = viewer.querySelector(".viewer-stage");
  let image = viewer.querySelector(".viewer-image");
  const titleEl = viewer.querySelector(".viewer-title");
  const countEl = viewer.querySelector(".viewer-count");
  const noteTitle = viewer.querySelector(".viewer-note-title");
  const noteText = viewer.querySelector(".viewer-note-text");
  // 开场文字：取原 About 的标题和第一段，只放在打开网站时的第一张（Field / Color 第 1 张）下面
  const about = document.querySelector("#about");
  const openingText = {
    title: about?.querySelector("h2")?.textContent || "",
    text: about?.querySelector(".text-block p")?.textContent.trim() || "",
  };

  // 侧栏底部：邮箱与 Instagram 图标
  const links = document.createElement("div");
  links.className = "viewer-links";
  links.innerHTML = `<a href="mailto:gongjiajie5@icloud.com" aria-label="Email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg></a><a href="https://www.instagram.com/kyokaketsu/" target="_blank" rel="noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor" stroke="none"/></svg></a>`;
  nav.after(links);

  let current = "field-color";
  let index = 0;

  const preload = (item) => { if (!item) return; const i = new Image(); i.sizes = "100vw"; i.srcset = item.srcset; i.src = item.src; };
  // 预览（翻页稳定）：先在后台把下一张解码好，再连同编号、页码一起换上；
  // 解码前旧照片和旧编号保持不动，不会出现「编号已变、照片未到」或中间一帧空白
  let renderToken = 0;
  const render = () => {
    const list = series[current] || [];
    const item = list[index];
    if (!item) return;
    const token = ++renderToken;
    const shownIndex = index;
    const shownSeries = current;
    for (const a of nav.querySelectorAll(".nav-sub")) a.classList.toggle("is-current", a.getAttribute("href") === `#${current}`);
    const next = new Image();
    next.className = "viewer-image";
    next.decoding = "async";
    next.sizes = "100vw"; // 让固有宽度不小于可用宽度，再由 max-width / max-height 等比收缩
    next.srcset = item.srcset;
    next.src = item.src;
    next.width = item.width;
    next.height = item.height;
    next.alt = item.alt;
    const decoded = next.decode ? next.decode().catch(() => {}) : new Promise((done) => { next.onload = next.onerror = done; });
    // 网络太慢时最多等 2.5 秒，之后照常换上（浏览器边下边显示）
    Promise.race([decoded, new Promise((done) => setTimeout(done, 2500))]).then(() => {
      if (token !== renderToken) return; // 期间又翻了页，以最新一次为准
      image.replaceWith(next);
      image = next;
      titleEl.textContent = item.title;
      countEl.textContent = `${shownIndex + 1} / ${list.length}`;
      // 开场文字只在 Field / Color 第 1 张出现（手机端显示，桌面端隐藏）
      const isOpening = shownSeries === "field-color" && shownIndex === 0;
      noteTitle.textContent = isOpening ? openingText.title : "";
      noteText.textContent = isOpening ? openingText.text : "";
      viewer.classList.toggle("has-note", isOpening);
      updateCursor(lastSide);
      // 预览（网址记第几张）：第 1 张仍是 #color，之后写成 #color/3；只替换、不新增返回记录
      // 首页那张（Field / Color 第 1 张）保持不带井号的网址
      const hash = shownSeries === "field-color" && !shownIndex ? "" : `#${shownSeries}${shownIndex ? "/" + (shownIndex + 1) : ""}`;
      history.replaceState(null, "", hash || location.pathname + location.search);
    });
    // 预加载前后各一张，再多备一张下一张（连点时少等）
    preload(list[index + 1]);
    preload(list[index + 2]);
    preload(list[index - 1]);
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
    // 手机菜单开着时，选完系列顺手关上
    if (document.querySelector(".site-sidebar")?.classList.contains("is-open")) document.querySelector(".menu-toggle")?.click();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!root.classList.contains("is-viewer")) return;
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  });

  root.classList.add("is-viewer");
  // 打开时读 #系列/第几张；编号不存在就从该系列第 1 张开始
  const [startId, startNo] = location.hash.slice(1).split("/");
  if (series[startId]) {
    current = startId;
    const n = parseInt(startNo, 10);
    if (n >= 1 && n <= series[startId].length) index = n - 1;
  }
  render();
})();
