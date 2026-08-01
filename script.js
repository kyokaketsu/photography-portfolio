const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxCaption = document.querySelector("#lightbox-caption");
const lightboxContent = document.querySelector(".lightbox-content");
const lightboxBackdrop = document.querySelector(".lightbox-backdrop");
const closeButton = document.querySelector(".lightbox-close");
const previousButton = document.querySelector(".lightbox-prev");
const nextButton = document.querySelector(".lightbox-next");
const photoButtons = Array.from(document.querySelectorAll(".photo-button"));
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
let lightboxCloseTimer = null;
let menuCloseTimer = null;
let headerScrollFrame = null;
const menuCurtainDuration = 520;
const headerScrollThreshold = 18;
const lightboxDismissThreshold = 100;
const lightboxCloseDuration = 320;

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

function setLightboxPhoto(index) {
  if (!photoButtons.length) return;
  activePhotoIndex = (index + photoButtons.length) % photoButtons.length;
  const button = photoButtons[activePhotoIndex];
  const image = button.querySelector("img");
  const title = button.dataset.title || image.alt;
  const category = button.dataset.categoryLabel || "";
  lightboxImage.src = image.getAttribute("src") || image.src;
  lightboxImage.alt = image.alt;
  lightboxCaption.textContent = category ? `${title} — ${category}` : title;
}

function clearLightboxAnimation() {
  if (lightboxAnimationFrame !== null) {
    window.cancelAnimationFrame(lightboxAnimationFrame);
    lightboxAnimationFrame = null;
  }
  window.clearTimeout(lightboxAnimationTimer);
  lightboxAnimationTimer = null;
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
  if (!lightboxImage || (lightboxImage.complete && lightboxImage.naturalWidth > 0)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = () => resolve();
    lightboxImage.addEventListener("load", finish, { once: true });
    lightboxImage.addEventListener("error", finish, { once: true });
  });
}

async function animateLightboxFrom(sourceRect) {
  await waitForLightboxImage();
  if (!lightbox?.classList.contains("is-open") || !lightboxImage) return;

  const finalRect = lightboxImage.getBoundingClientRect();
  if (reducedMotion() || !sourceRect || !finalRect.width || !finalRect.height) {
    lightboxImage.style.opacity = "1";
    return;
  }

  const translateX = sourceRect.left + sourceRect.width / 2 - (finalRect.left + finalRect.width / 2);
  const translateY = sourceRect.top + sourceRect.height / 2 - (finalRect.top + finalRect.height / 2);
  const scale = Math.min(sourceRect.width / finalRect.width, sourceRect.height / finalRect.height);

  lightboxImage.style.transition = "none";
  lightboxImage.style.transformOrigin = "center center";
  lightboxImage.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
  lightboxImage.style.opacity = "0";
  lightboxImage.getBoundingClientRect();

  lightboxAnimationFrame = window.requestAnimationFrame(() => {
    lightboxAnimationFrame = null;
    if (!lightbox.classList.contains("is-open")) return;
    lightboxImage.style.transition = "transform 460ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 220ms ease-out";
    lightboxImage.style.transform = "translate3d(0, 0, 0) scale(1)";
    lightboxImage.style.opacity = "1";
    lightboxAnimationTimer = window.setTimeout(() => {
      if (!lightbox.classList.contains("is-open") || lightbox.classList.contains("is-dragging")) return;
      lightboxImage.style.removeProperty("transition");
      lightboxImage.style.removeProperty("transform");
      lightboxImage.style.removeProperty("transform-origin");
      lightboxImage.style.removeProperty("opacity");
    }, 480);
  });
}

async function openLightbox(button) {
  if (!lightbox) return;
  const clickedImage = button.querySelector("img");
  const sourceRect = clickedImage?.getBoundingClientRect();
  closeMenu();
  lastFocusedElement = document.activeElement;
  window.clearTimeout(lightboxCloseTimer);
  clearLightboxInlineStyles();
  lightboxImage.style.opacity = "0";
  setLightboxPhoto(photoButtons.indexOf(button));
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  lockPageScroll("lightbox");
  closeButton.focus({ preventScroll: true });
  await animateLightboxFrom(sourceRect);
}

function finishLightboxClose() {
  if (!lightbox) return;
  lightbox.classList.remove("is-open", "is-closing", "is-dragging");
  lightbox.setAttribute("aria-hidden", "true");
  const restoreY = unlockPageScroll("lightbox");
  clearLightboxInlineStyles();
  if (!lightbox.classList.contains("is-open")) lightboxImage.src = "";
  if (lastFocusedElement) {
    try { lastFocusedElement.focus({ preventScroll: true }); }
    catch { lastFocusedElement.focus(); restoreScrollPosition(restoreY); }
  }
}

function closeLightbox({ fromDrag = false } = {}) {
  if (!lightbox || !lightbox.classList.contains("is-open") || lightbox.classList.contains("is-closing")) return;
  clearLightboxAnimation();
  lightbox.classList.add("is-closing");

  if (reducedMotion()) {
    finishLightboxClose();
    return;
  }

  lightboxImage.style.transition = "transform 300ms cubic-bezier(0.4, 0, 1, 1), opacity 240ms ease-out";
  lightboxImage.style.transform = fromDrag
    ? `translate3d(0, ${Math.max(dragDistanceY + 140, window.innerHeight * 0.34)}px, 0) scale(0.82)`
    : "translate3d(0, 18px, 0) scale(0.96)";
  lightboxImage.style.opacity = "0";
  lightboxBackdrop.style.transition = "opacity 300ms ease-out";
  lightboxBackdrop.style.opacity = "0";
  lightboxCloseTimer = window.setTimeout(finishLightboxClose, lightboxCloseDuration);
}

function changeLightboxPhoto(direction) {
  if (!lightbox?.classList.contains("is-open") || lightbox.classList.contains("is-closing")) return;
  clearLightboxInlineStyles();
  setLightboxPhoto(activePhotoIndex + direction);
}

function resetTouchTracking() {
  touchStartX = null;
  touchStartY = null;
  touchGesture = null;
}

function reboundLightbox() {
  if (!lightbox?.classList.contains("is-open")) return;
  lightboxImage.style.transition = "transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)";
  lightboxImage.style.transform = "translate3d(0, 0, 0) scale(1)";
  lightboxBackdrop.style.transition = "opacity 260ms ease-out";
  lightboxBackdrop.style.opacity = "1";
  lightboxAnimationTimer = window.setTimeout(() => {
    if (!lightbox.classList.contains("is-open")) return;
    lightbox.classList.remove("is-dragging");
    lightboxImage.style.removeProperty("transition");
    lightboxImage.style.removeProperty("transform");
    lightboxBackdrop.style.removeProperty("transition");
    lightboxBackdrop.style.removeProperty("opacity");
  }, 430);
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
