// Lays the mind map out radially, draws the connecting lines, and links each
// topic to its detail panel and to the roles tagged with it in Experience.
// Without this script the nodes still show as a simple wrapped list.
(function () {
  var map = document.querySelector('[data-mindmap]');
  if (!map) return;

  var svg = map.querySelector('.mindmap-lines');
  var center = map.querySelector('.node-center');
  var nodes = Array.prototype.slice.call(map.querySelectorAll('button.node'));
  var panels = document.querySelectorAll('[data-topic-panel]');
  var roles = document.querySelectorAll('.role[data-topics]');
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var active = null;

  var labels = {};
  nodes.forEach(function (node) {
    labels[node.dataset.topic] = node.textContent;
  });

  // Show each role's topics as small tags, so the link back to the map is visible.
  roles.forEach(function (role) {
    var meta = role.querySelector('.role-meta');
    var list = document.createElement('ul');
    list.className = 'role-topics';
    role.dataset.topics.split(/\s+/).forEach(function (topic) {
      if (!labels[topic]) return;
      var item = document.createElement('li');
      item.textContent = labels[topic];
      list.appendChild(item);
    });
    meta.appendChild(list);
  });

  function layout() {
    map.classList.add('is-radial');
    var width = map.clientWidth;
    var height = map.clientHeight;
    var cx = width / 2;
    var cy = height / 2;
    var maxNodeW = 0;
    var maxNodeH = 0;
    nodes.forEach(function (node) {
      maxNodeW = Math.max(maxNodeW, node.offsetWidth);
      maxNodeH = Math.max(maxNodeH, node.offsetHeight);
    });
    // An ellipse that keeps every node inside the box: wide on desktop, tall on phones.
    var rx = Math.max(cx - maxNodeW / 2 - 8, 60);
    var ry = Math.max(cy - maxNodeH / 2 - 8, 60);

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.innerHTML = '';

    center.style.left = cx + 'px';
    center.style.top = cy + 'px';

    nodes.forEach(function (node, i) {
      // Start at the top and go clockwise.
      var angle = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2;
      var x = cx + rx * Math.cos(angle);
      var y = cy + ry * Math.sin(angle);
      node.style.left = x + 'px';
      node.style.top = y + 'px';

      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', cx);
      line.setAttribute('y1', cy);
      line.setAttribute('x2', x);
      line.setAttribute('y2', y);
      line.dataset.topic = node.dataset.topic;
      if (node.dataset.topic === active) line.classList.add('is-active');
      svg.appendChild(line);
    });
  }

  function select(topic) {
    active = active === topic ? null : topic;

    nodes.forEach(function (node) {
      var on = node.dataset.topic === active;
      node.classList.toggle('is-active', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    svg.querySelectorAll('line').forEach(function (line) {
      line.classList.toggle('is-active', line.dataset.topic === active);
    });
    panels.forEach(function (panel) {
      panel.hidden = panel.dataset.topicPanel !== (active || 'none');
    });
    roles.forEach(function (role) {
      var match = active && role.dataset.topics.split(/\s+/).indexOf(active) !== -1;
      role.classList.toggle('is-highlighted', !!match);
    });
  }

  nodes.forEach(function (node) {
    node.setAttribute('aria-pressed', 'false');
    node.addEventListener('click', function () {
      select(node.dataset.topic);
    });
  });

  layout();
  var pending;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(layout);
  });
})();
