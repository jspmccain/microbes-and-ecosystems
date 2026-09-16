/* ==========================================================================
   Shared site behavior: mobile nav toggle + active link highlighting.
   ========================================================================== */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.querySelector(".nav-toggle");
    var links = document.querySelector(".nav-links");

    if (toggle && links) {
      toggle.addEventListener("click", function () {
        var isOpen = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });

      links.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          links.classList.remove("open");
          toggle.setAttribute("aria-expanded", "false");
        });
      });
    }

    // Highlight current page in nav
    var current = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      var href = a.getAttribute("href");
      if (href === current || (current === "" && href === "index.html")) {
        a.classList.add("active");
      }
    });

    // Set current year in footer
    var yearEls = document.querySelectorAll("[data-year]");
    yearEls.forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  });
})();
