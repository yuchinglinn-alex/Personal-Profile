// Turns reading the page into running a marathon: a track under the header fills as the
// visitor scrolls, with a checkpoint for each section and the finish flag for Contact.
(function () {
  var course = document.querySelector('[data-course]');
  if (!course) return;

  var MARATHON_KM = 42.2;
  var sections = Array.prototype.slice.call(document.querySelectorAll('main > section[id]'))
    .filter(function (section) { return section.id !== 'top' && section.id !== 'contact'; });

  course.innerHTML =
    '<div class="course-track"><div class="course-fill"></div>' +
    '<span class="course-runner">🏃</span><span class="course-finish">🏁</span></div>' +
    '<span class="course-distance"></span>';
  var track = course.querySelector('.course-track');
  var fill = course.querySelector('.course-fill');
  var runner = course.querySelector('.course-runner');
  var distance = course.querySelector('.course-distance');

  var checkpoints = sections.map(function (section) {
    var dot = document.createElement('span');
    dot.className = 'course-checkpoint';
    var heading = section.querySelector('h2');
    dot.title = heading ? heading.textContent : section.id;
    track.appendChild(dot);
    return { section: section, dot: dot, at: 0 };
  });

  function scrollable() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  // A checkpoint sits where its section reaches the top of the screen.
  function place() {
    var max = scrollable();
    checkpoints.forEach(function (point) {
      var top = point.section.getBoundingClientRect().top + window.scrollY;
      point.at = Math.min(1, Math.max(0, (top - 80) / max));
      point.dot.style.left = (point.at * 100) + '%';
    });
    update();
  }

  function update() {
    var progress = Math.min(1, Math.max(0, window.scrollY / scrollable()));
    fill.style.width = (progress * 100) + '%';
    runner.style.left = (progress * 100) + '%';
    distance.textContent = (progress * MARATHON_KM).toFixed(1) + ' / ' + MARATHON_KM + ' km';
    course.classList.toggle('is-finished', progress > 0.995);
    checkpoints.forEach(function (point) {
      point.dot.classList.toggle('is-passed', progress >= point.at - 0.001);
    });
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      update();
    });
  }, { passive: true });
  window.addEventListener('resize', place);
  window.addEventListener('load', place);
  place();
})();
