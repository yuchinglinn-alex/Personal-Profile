// Fades sections, roles and cards in as they scroll into view.
// Skipped when the visitor prefers reduced motion or the browser lacks IntersectionObserver.
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var items = document.querySelectorAll('.section > h2, .section > p, .role, .card, .edu > li, .tags, .contact-links');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px' });

  items.forEach(function (item) {
    item.classList.add('reveal');
    observer.observe(item);
  });
})();
