// Shared page behavior — mobile nav toggle + scroll-reveal.
// Plain vanilla JS, no build step, matches the rest of this repo's convention.

document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav__toggle');
  var drawer = document.querySelector('.nav__drawer');
  if (toggle && drawer) {
    toggle.addEventListener('click', function () {
      drawer.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', drawer.classList.contains('is-open') ? 'true' : 'false');
    });
  }

  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }
});
