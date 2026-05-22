function closeNav(nav) {
  const links = nav.querySelector(".site-nav-links");
  const toggle = nav.querySelector(".site-nav-toggle");
  if (links) links.classList.remove("is-open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

export function initMobileNav() {
  document.querySelectorAll(".site-nav").forEach((nav) => {
    const toggle = nav.querySelector(".site-nav-toggle");
    const links = nav.querySelector(".site-nav-links");
    if (!toggle || !links) return;

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => closeNav(nav));
    });
  });

  document.addEventListener("click", (e) => {
    document.querySelectorAll(".site-nav").forEach((nav) => {
      if (!nav.contains(e.target)) closeNav(nav);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMobileNav);
} else {
  initMobileNav();
}
