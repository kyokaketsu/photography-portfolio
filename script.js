const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxCaption = document.querySelector("#lightbox-caption");
const lightboxContent = document.querySelector(".lightbox-content");
const closeButton = document.querySelector(".lightbox-close");
const previousButton = document.querySelector(".lightbox-prev");
const nextButton = document.querySelector(".lightbox-next");
const photoButtons = Array.from(document.querySelectorAll(".photo-button"));
const menu = document.querySelector("[data-menu]");
const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.querySelector("#primary-navigation");
const navItems = Array.from(document.querySelectorAll(".menu-panel a[href^='#']"));
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileMenuQuery = window.matchMedia("(max-width: 768px), (max-width: 932px) and (max-height: 520px) and (pointer: coarse)");

let activePhotoIndex = -1;
let lastFocusedElement = null;
let lockedScrollY = 0;
let pageScrollLocked = false;
const scrollLockReasons = new Set();
let touchStartX = null;
let touchStartY = null;
let menuCloseTimer = null;
const menuCurtainDuration = 520;

function reducedMotion() {
  return motionQuery.matches;
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

function openLightbox(button) {
  if (!lightbox) return;
  closeMenu();
  lastFocusedElement = document.activeElement;
  setLightboxPhoto(photoButtons.indexOf(button));
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  lockPageScroll("lightbox");
  closeButton.focus({ preventScroll: true });
}

function closeLightbox() {
  if (!lightbox || !lightbox.classList.contains("is-open")) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  const restoreY = unlockPageScroll("lightbox");
  window.setTimeout(() => {
    if (!lightbox.classList.contains("is-open")) lightboxImage.src = "";
    if (lastFocusedElement) {
      try { lastFocusedElement.focus({ preventScroll: true }); }
    catch { lastFocusedElement.focus(); restoreScrollPosition(restoreY); }
    }
  }, reducedMotion() ? 0 : 180);
}

function changeLightboxPhoto(direction) {
  if (!lightbox?.classList.contains("is-open")) return;
  setLightboxPhoto(activePhotoIndex + direction);
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
  if (event.touches.length === 1) {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }
}, { passive: true });

lightboxContent?.addEventListener("touchend", (event) => {
  if (touchStartX === null || touchStartY === null || !event.changedTouches.length) return;
  const distanceX = event.changedTouches[0].clientX - touchStartX;
  const distanceY = event.changedTouches[0].clientY - touchStartY;
  touchStartX = null;
  touchStartY = null;
  if (Math.abs(distanceX) > 52 && Math.abs(distanceX) > Math.abs(distanceY) * 1.2) {
    changeLightboxPhoto(distanceX < 0 ? 1 : -1);
  }
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
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") recoverScrollablePage();
});
