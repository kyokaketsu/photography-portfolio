const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxCaption = document.querySelector("#lightbox-caption");
const lightboxContent = document.querySelector(".lightbox-content");
const lightboxBackdrop = document.querySelector(".lightbox-backdrop");
const closeButton = document.querySelector(".lightbox-close");
const previousButton = document.querySelector(".lightbox-prev");
const nextButton = document.querySelector(".lightbox-next");
const photoButtons = Array.from(document.querySelectorAll(".photo-button"));
const siteShell = document.querySelector(".site-shell");
const menu = document.querySelector("[data-menu]");
const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.querySelector("#primary-navigation");
const navItems = Array.from(document.querySelectorAll(".menu-panel a[href^='#']"));
const revealItems = Array.from(document.querySelectorAll(".reveal-item"));
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileMenuQuery = window.matchMedia("(max-width: 768px), (max-width: 932px) and (max-height: 520px) and (pointer: coarse)");

let activePhotoIndex = -1;
let lastFocusedElement = null;
let lockedScrollY = 0;
let pageScrollLocked = false;
const scrollLockReasons = new Set();
let touchStartX = null;
let touchStartY = null;
let touchGesture = null;
let dragDistanceY = 0;
let lightboxAnimationFrame = null;
let lightboxAnimationTimer = null;
let lightboxSettleTimer = null;
let lightboxUpgradeTimer = null;
let pendingLightboxSrcset = "";
let menuCloseTimer = null;
let headerScrollFrame = null;
let lightboxPhotoRequestId = 0;
let cancelLightboxImageWait = null;
const preloadedImageSources = new Set();
const activeImagePreloads = new Map();
const menuCurtainDuration = 300;
const headerScrollThreshold = 18;
const lightboxDismissThreshold = 100;

function reducedMotion() {
  return motionQuery.matches;
}

if (reducedMotion() || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("reveal-visible"));
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("reveal-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0 });
  revealItems.forEach((item) => revealObserver.observe(item));
}

const galleryImages = Array.from(document.querySelectorAll(".photo-button img"));

if (!reducedMotion() && galleryImages.length) {
  // 只有在 JS 真正接管之后才允许隐藏图片,脚本失败时照片仍会正常显示
  document.documentElement.classList.add("js-image-fade");
  galleryImages.forEach((image) => {
    if (image.complete && image.naturalWidth > 0) {
      image.classList.add("is-loaded");
      return;
    }
    const settleImage = () => {
      image.removeEventListener("load", settleImage);
      image.removeEventListener("error", settleImage);
      image.classList.add("is-loaded");
    };
    image.addEventListener("load", settleImage);
    image.addEventListener("error", settleImage);
  });
}

function updateMobileHeaderState() {
  headerScrollFrame = null;
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.classList.toggle("is-header-scrolled", mobileMenuQuery.matches && scrollY > headerScrollThreshold);
}

function requestMobileHeaderUpdate() {
  if (headerScrollFrame !== null) return;
  headerScrollFrame = window.requestAnimationFrame(updateMobileHeaderState);
}

function setMenuOpen(isOpen) {
  if (!menu || !menuToggle || !menuPanel) return;
  const wasOpen = menu.classList.contains("is-open");
  const isMobile = mobileMenuQuery.matches;
  const shouldAnimateClosing = isMobile && !isOpen && wasOpen && !reducedMotion();

  window.clearTimeout(menuCloseTimer);
  menu.classList.toggle("is-open", isOpen);
  menu.classList.toggle("is-closing", shouldAnimateClosing);
  document.documentElement.classList.toggle("is-menu-open", isOpen);
  document.documentElement.classList.toggle("is-menu-closing", shouldAnimateClosing);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  menuPanel.setAttribute("aria-hidden", String(!isOpen));

  if ("inert" in menuPanel) {
    menuPanel.inert = isMobile && !isOpen && !shouldAnimateClosing;
  }

  if (shouldAnimateClosing) {
    menuCloseTimer = window.setTimeout(() => {
      if (menu.classList.contains("is-open")) return;
      menu.classList.remove("is-closing");
      document.documentElement.classList.remove("is-menu-closing");
      if ("inert" in menuPanel && mobileMenuQuery.matches) {
        menuPanel.inert = true;
      }
      unlockPageScroll("menu");
    }, menuCurtainDuration);
  } else if (!isOpen) {
    unlockPageScroll("menu");
  }
}

function closeMenu() {
  setMenuOpen(false);
}

if (mobileMenuQuery.matches) {
  setMenuOpen(false);
}
updateMobileHeaderState();

function lockPageScroll(reason) {
  scrollLockReasons.add(reason);
  if (pageScrollLocked) return;
  lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  pageScrollLocked = true;
  document.documentElement.classList.add("is-scroll-locked");
  document.body.classList.add("is-scroll-locked");
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function restoreScrollPosition(scrollY) {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, scrollY);
  window.requestAnimationFrame(() => {
    window.scrollTo(0, scrollY);
    window.requestAnimationFrame(() => {
      if (previousScrollBehavior) root.style.scrollBehavior = previousScrollBehavior;
      else root.style.removeProperty("scroll-behavior");
    });
  });
}

function unlockPageScroll(reason) {
  scrollLockReasons.delete(reason);
  if (scrollLockReasons.size) return lockedScrollY;
  if (!pageScrollLocked && !document.body.classList.contains("is-scroll-locked") && !document.documentElement.classList.contains("is-scroll-locked")) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  const restoreY = lockedScrollY;
  pageScrollLocked = false;
  document.documentElement.classList.remove("is-scroll-locked");
  document.body.classList.remove("is-scroll-locked");
  document.body.style.removeProperty("position");
  document.body.style.removeProperty("top");
  document.body.style.removeProperty("bottom");
  document.body.style.removeProperty("left");
  document.body.style.removeProperty("right");
  document.body.style.removeProperty("width");
  document.body.style.removeProperty("min-height");
  restoreScrollPosition(restoreY);
  return restoreY;
}

function recoverScrollablePage() {
  if (!lightbox || !lightbox.classList.contains("is-open")) {
    unlockPageScroll("lightbox");
  }
  if (!mobileMenuQuery.matches) {
    closeMenu();
    unlockPageScroll("menu");
  } else if (!menu?.classList.contains("is-open") && !menu?.classList.contains("is-closing")) {
    unlockPageScroll("menu");
  }
}

function preloadImages(index) {
  if (photoButtons.length < 2) return;
  const adjacentIndices = new Set([
    (index + 1) % photoButtons.length,
    (index - 1 + photoButtons.length) % photoButtons.length
  ]);

  adjacentIndices.forEach((adjacentIndex) => {
    const sourceImage = photoButtons[adjacentIndex]?.querySelector("img");
    if (!sourceImage) return;

    const source = sourceImage.getAttribute("src") || sourceImage.src;
    const sourceSet = sourceImage.getAttribute("srcset") || "";
    const cacheKey = `${source}|${sourceSet}`;
    if (!source || preloadedImageSources.has(cacheKey)) return;

    const preload = new Image();
    const releasePreload = (event) => {
      activeImagePreloads.delete(cacheKey);
      if (event.type === "error") preloadedImageSources.delete(cacheKey);
    };

    preloadedImageSources.add(cacheKey);
    activeImagePreloads.set(cacheKey, preload);
    preload.decoding = "async";
    if ("fetchPriority" in preload) preload.fetchPriority = "low";
    preload.addEventListener("load", releasePreload, { once: true });
    preload.addEventListener("error", releasePreload, { once: true });
    if (sourceSet) {
      preload.srcset = sourceSet;
      preload.sizes = "100vw";
    }
    preload.src = source;
  });
}

function setLightboxPhoto(index) {
  if (!photoButtons.length) return null;
  cancelLightboxImageWait?.();
  window.clearTimeout(lightboxUpgradeTimer);
  lightboxUpgradeTimer = null;
  lightboxPhotoRequestId += 1;
  const requestId = lightboxPhotoRequestId;
  activePhotoIndex = (index + photoButtons.length) % photoButtons.length;
  const button = photoButtons[activePhotoIndex];
  const image = button.querySelector("img");
  const title = button.dataset.title || image.alt;
  const category = button.dataset.categoryLabel || "";

  // 先用缩略图已经下载过的那一档,保证展开动画立刻起步;
  // 高清档等动画开始后再换上,网络慢时不会把整个动画堵住。
  const sourceSet = image.getAttribute("srcset") || "";
  const cachedSource = image.complete && image.naturalWidth > 0 ? image.currentSrc : "";

  if (cachedSource && sourceSet) {
    pendingLightboxSrcset = sourceSet;
    lightboxImage.removeAttribute("srcset");
    lightboxImage.removeAttribute("sizes");
    lightboxImage.src = cachedSource;
  } else {
    // 缩略图自己都还没下载完,缓存里没有可复用的档,直接走完整响应式集合
    pendingLightboxSrcset = "";
    if (sourceSet) {
      lightboxImage.sizes = "86vw";
      lightboxImage.srcset = sourceSet;
    } else {
      lightboxImage.removeAttribute("srcset");
      lightboxImage.removeAttribute("sizes");
    }
    lightboxImage.src = cachedSource || image.getAttribute("src") || image.src;
  }

  lightboxImage.alt = image.alt;
  lightboxCaption.textContent = category ? `${title} — ${category}` : title;
  preloadImages(activePhotoIndex);
  return requestId;
}

function upgradeLightboxSource(requestId) {
  if (!pendingLightboxSrcset || !lightboxImage || requestId !== lightboxPhotoRequestId) return;
  const nextSrcset = pendingLightboxSrcset;
  pendingLightboxSrcset = "";
  lightboxImage.sizes = "86vw";
  lightboxImage.srcset = nextSrcset;
}

function clearLightboxSource() {
  cancelLightboxImageWait?.();
  window.clearTimeout(lightboxUpgradeTimer);
  lightboxUpgradeTimer = null;
  pendingLightboxSrcset = "";
  lightboxPhotoRequestId += 1;
  lightboxImage?.removeAttribute("src");
  lightboxImage?.removeAttribute("srcset");
  lightboxImage?.removeAttribute("sizes");
  if (lightboxImage) lightboxImage.alt = "";
  if (lightboxCaption) lightboxCaption.textContent = "";
  activePhotoIndex = -1;
}

function setLightboxBackgroundInert(isInert) {
  if (!siteShell) return;
  if ("inert" in siteShell) siteShell.inert = isInert;
  if (isInert) siteShell.setAttribute("aria-hidden", "true");
  else siteShell.removeAttribute("aria-hidden");
}

function trapLightboxFocus(event) {
  const focusableControls = Array.from(lightbox.querySelectorAll("button:not([disabled])"))
    .filter((control) => control.getClientRects().length > 0);
  if (!focusableControls.length) return;

  const firstControl = focusableControls[0];
  const lastControl = focusableControls[focusableControls.length - 1];
  const activeElement = document.activeElement;

  const atFocusStart = activeElement === firstControl
    || activeElement === lightbox
    || !lightbox.contains(activeElement);

  if (event.shiftKey && atFocusStart) {
    event.preventDefault();
    lastControl.focus({ preventScroll: true });
  } else if (!event.shiftKey && (activeElement === lastControl || !lightbox.contains(activeElement))) {
    event.preventDefault();
    firstControl.focus({ preventScroll: true });
  }
}

function clearLightboxAnimation() {
  if (lightboxAnimationFrame !== null) {
    window.cancelAnimationFrame(lightboxAnimationFrame);
    lightboxAnimationFrame = null;
  }
  window.clearTimeout(lightboxAnimationTimer);
  lightboxAnimationTimer = null;
  window.clearTimeout(lightboxSettleTimer);
  lightboxSettleTimer = null;
}

function clearLightboxInlineStyles() {
  clearLightboxAnimation();
  lightboxImage?.style.removeProperty("transition");
  lightboxImage?.style.removeProperty("transform");
  lightboxImage?.style.removeProperty("transform-origin");
  lightboxImage?.style.removeProperty("opacity");
  lightboxBackdrop?.style.removeProperty("transition");
  lightboxBackdrop?.style.removeProperty("opacity");
  lightbox?.classList.remove("is-dragging", "is-closing");
}

function waitForLightboxImage() {
  cancelLightboxImageWait?.();
  if (!lightboxImage) return Promise.resolve(false);
  if (lightboxImage.complete) return Promise.resolve(lightboxImage.naturalWidth > 0);

  return new Promise((resolve) => {
    let settled = false;
    let cancelWait = null;
    const finish = (didLoad) => {
      if (settled) return;
      settled = true;
      lightboxImage.removeEventListener("load", handleLoad);
      lightboxImage.removeEventListener("error", handleError);
      if (cancelLightboxImageWait === cancelWait) cancelLightboxImageWait = null;
      resolve(didLoad);
    };
    const handleLoad = () => finish(true);
    const handleError = () => finish(false);
    cancelWait = () => finish(false);
    cancelLightboxImageWait = cancelWait;
    lightboxImage.addEventListener("load", handleLoad);
    lightboxImage.addEventListener("error", handleError);

    Promise.resolve().then(() => {
      if (lightboxImage.complete) finish(lightboxImage.naturalWidth > 0);
    });
  });
}

async function openLightbox(button) {
  if (!lightbox) return;
  closeMenu();
  lastFocusedElement = document.activeElement;
  clearLightboxInlineStyles();
  lightboxImage.style.opacity = "1";
  const requestId = setLightboxPhoto(photoButtons.indexOf(button));
  lightbox.classList.add("is-open");
  document.documentElement.classList.add("is-lightbox-open");
  lightbox.setAttribute("aria-hidden", "false");
  lockPageScroll("lightbox");
  // 聚焦对话框本身而不是关闭按钮:后者会在开场第一帧就画出白色焦点框,
  // 那时背景遮罩还没暗下来,看起来像是闪了一下。
  lightbox.focus({ preventScroll: true });
  setLightboxBackgroundInert(true);
  if (await waitForLightboxImage()) upgradeLightboxSource(requestId);
}

function finishLightboxClose() {
  if (!lightbox) return;
  lightbox.classList.remove("is-open", "is-closing", "is-dragging");
  document.documentElement.classList.remove("is-lightbox-open");
  lightbox.setAttribute("aria-hidden", "true");
  const restoreY = unlockPageScroll("lightbox");
  setLightboxBackgroundInert(false);
  clearLightboxInlineStyles();
  clearLightboxSource();
  if (lastFocusedElement) {
    try { lastFocusedElement.focus({ preventScroll: true }); }
    catch { lastFocusedElement.focus(); restoreScrollPosition(restoreY); }
  }
  lastFocusedElement = null;
}

function closeLightbox({ fromDrag = false } = {}) {
  if (!lightbox || !lightbox.classList.contains("is-open") || lightbox.classList.contains("is-closing")) return;
  clearLightboxAnimation();
  finishLightboxClose();
}

function changeLightboxPhoto(direction) {
  if (!lightbox?.classList.contains("is-open") || lightbox.classList.contains("is-closing")) return;
  clearLightboxInlineStyles();
  const requestId = setLightboxPhoto(activePhotoIndex + direction);
  // 翻页没有 FLIP 动画,缓存档先显示,稍后再静默换成高清档
  lightboxUpgradeTimer = window.setTimeout(() => {
    lightboxUpgradeTimer = null;
    upgradeLightboxSource(requestId);
  }, 80);
}

function resetTouchTracking() {
  touchStartX = null;
  touchStartY = null;
  touchGesture = null;
}

function reboundLightbox() {
  if (!lightbox?.classList.contains("is-open")) return;
  lightbox.classList.remove("is-dragging");
  clearLightboxInlineStyles();
}

if (menu && menuToggle) {
  menuToggle.addEventListener("click", () => setMenuOpen(!menu.classList.contains("is-open")));
}

navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    const target = document.querySelector(item.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    const waitForCurtain = mobileMenuQuery.matches && menu?.classList.contains("is-open") && !reducedMotion();
    closeMenu();
    const moveToTarget = () => {
      target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", item.getAttribute("href"));
    };
    if (waitForCurtain) window.setTimeout(moveToTarget, menuCurtainDuration + 20);
    else moveToTarget();
  });
});

photoButtons.forEach((button) => button.addEventListener("click", () => openLightbox(button)));
closeButton?.addEventListener("click", closeLightbox);
previousButton?.addEventListener("click", () => changeLightboxPhoto(-1));
nextButton?.addEventListener("click", () => changeLightboxPhoto(1));
lightbox?.addEventListener("click", (event) => {
  if (event.target.hasAttribute("data-close-lightbox")) closeLightbox();
});

lightboxContent?.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1 || !lightbox?.classList.contains("is-open")) return;
  clearLightboxAnimation();
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
  touchGesture = null;
  dragDistanceY = 0;
}, { passive: true });

lightboxContent?.addEventListener("touchmove", (event) => {
  if (touchStartX === null || touchStartY === null || event.touches.length !== 1) return;
  const distanceX = event.touches[0].clientX - touchStartX;
  const distanceY = event.touches[0].clientY - touchStartY;

  if (!touchGesture && Math.max(Math.abs(distanceX), Math.abs(distanceY)) > 8) {
    if (distanceY > 0 && distanceY > Math.abs(distanceX) * 1.15) touchGesture = "dismiss";
    else if (Math.abs(distanceX) > Math.abs(distanceY) * 1.15) touchGesture = "swipe";
    else if (distanceY < 0) touchGesture = "blocked";
  }

  if (touchGesture !== "dismiss") return;
  event.preventDefault();
  dragDistanceY = Math.max(0, distanceY);
  const scale = Math.max(0.86, 1 - dragDistanceY / 1000);
  const backdropOpacity = Math.max(0.12, 1 - dragDistanceY / 340);
  lightbox.classList.add("is-dragging");
  lightboxImage.style.transition = "none";
  lightboxImage.style.transform = `translate3d(0, ${dragDistanceY}px, 0) scale(${scale})`;
  lightboxBackdrop.style.transition = "none";
  lightboxBackdrop.style.opacity = String(backdropOpacity);
}, { passive: false });

lightboxContent?.addEventListener("touchend", (event) => {
  if (touchStartX === null || touchStartY === null || !event.changedTouches.length) return;
  const distanceX = event.changedTouches[0].clientX - touchStartX;
  const distanceY = event.changedTouches[0].clientY - touchStartY;
  const completedGesture = touchGesture;
  resetTouchTracking();

  if (completedGesture === "dismiss") {
    if (dragDistanceY > lightboxDismissThreshold) closeLightbox({ fromDrag: true });
    else reboundLightbox();
    return;
  }

  if (completedGesture === "swipe" && Math.abs(distanceX) > 52 && Math.abs(distanceX) > Math.abs(distanceY) * 1.2) {
    changeLightboxPhoto(distanceX < 0 ? 1 : -1);
  }
}, { passive: true });

lightboxContent?.addEventListener("touchcancel", () => {
  const shouldRebound = touchGesture === "dismiss";
  resetTouchTracking();
  if (shouldRebound) reboundLightbox();
}, { passive: true });

document.addEventListener("keydown", (event) => {
  if (lightbox?.classList.contains("is-open")) {
    if (event.key === "Tab") { trapLightboxFocus(event); return; }
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") { event.preventDefault(); changeLightboxPhoto(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); changeLightboxPhoto(1); }
    return;
  }
  if (event.key === "Escape") closeMenu();
});

const sectionLinks = navItems.filter((item) => ["#works", "#color", "#monochrome", "#about", "#contact"].includes(item.getAttribute("href")));
const sections = sectionLinks.map((item) => document.querySelector(item.getAttribute("href"))).filter(Boolean);
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      sectionLinks.forEach((link) => link.classList.toggle("is-current", link.getAttribute("href") === `#${entry.target.id}`));
    });
  }, { rootMargin: "-18% 0px -70% 0px", threshold: 0 });
  sections.forEach((section) => observer.observe(section));
}

window.addEventListener("pageshow", recoverScrollablePage);
window.addEventListener("resize", recoverScrollablePage, { passive: true });
window.addEventListener("scroll", requestMobileHeaderUpdate, { passive: true });
mobileMenuQuery.addEventListener?.("change", updateMobileHeaderState);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") recoverScrollablePage();
});
