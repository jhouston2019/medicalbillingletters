// Optional enhancements shared across pages.
// Currently used for smooth scrolling on in-page navigation links.

document.addEventListener("DOMContentLoaded", () => {
  const anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href")?.slice(1);
      const target = targetId && document.getElementById(targetId);

      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
});


