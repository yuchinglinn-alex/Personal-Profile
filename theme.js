// Light / System / Dark switch in the header. Light is the default; the choice is remembered
// in this browser. The inline script in <head> applies a saved choice before the page paints.
(function () {
  var group = document.querySelector('[data-theme-switch]');
  if (!group) return;
  var buttons = group.querySelectorAll('[data-theme-option]');

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.themeOption === theme));
    });
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var theme = button.dataset.themeOption;
      apply(theme);
      try { localStorage.setItem('theme', theme); } catch (e) {}
    });
  });

  apply(document.documentElement.dataset.theme || 'light');
})();
