// Turns the nested outline in #map into a zoomable, draggable mind map.
// Topics sit in a ring around the center; opening one flies the camera in and
// branches out its details. Selecting a topic also shows its panel and
// highlights the roles tagged with it in Experience.
// Without this script the outline stays as a plain readable list.
(function () {
  var map = document.querySelector('[data-mindmap]');
  if (!map) return;
  var source = map.querySelector('[data-mindmap-source]');
  var controls = map.querySelector('.map-controls');
  var hint = map.querySelector('.map-hint');
  var panels = document.querySelectorAll('[data-topic-panel]');
  var roles = document.querySelectorAll('.role[data-topics]');
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // World layout, in px before zoom.
  var TOPIC_RADIUS = 320;
  var DETAIL_RADIUS = 220;
  var DETAIL_SPREAD = Math.PI * 0.8;
  var MIN_SCALE = 0.3;
  var MAX_SCALE = 2.5;
  var FOCUS_MAX_SCALE = 1.3;
  var GAP = 14;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Read the outline -------------------------------------------------

  var topics = Array.prototype.map.call(source.children, function (li) {
    var label = li.firstChild.textContent.trim();
    var details = Array.prototype.map.call(li.querySelectorAll('li'), function (item) {
      var small = item.querySelector('small');
      return {
        label: item.firstChild.textContent.trim(),
        note: small ? small.textContent.trim() : ''
      };
    });
    return { id: li.dataset.topic, group: li.dataset.group, label: label, details: details };
  });

  // ---- Build the canvas -------------------------------------------------

  var viewport = document.createElement('div');
  viewport.className = 'mindmap-viewport';
  var world = document.createElement('div');
  world.className = 'mindmap-world';
  var svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'mindmap-lines');
  svg.setAttribute('aria-hidden', 'true');
  world.appendChild(svg);
  viewport.appendChild(world);
  map.insertBefore(viewport, source);
  source.hidden = true;
  controls.hidden = false;
  hint.hidden = false;
  map.classList.add('is-ready');

  function place(el, x, y) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  function curve(x1, y1, x2, y2) {
    // A gentle bend so branches look drawn rather than ruled.
    var mx = (x1 + x2) / 2;
    var my = (y1 + y2) / 2;
    var bend = 0.15;
    var cx = mx - (y2 - y1) * bend;
    var cy = my + (x2 - x1) * bend;
    return 'M' + x1 + ' ' + y1 + ' Q' + cx + ' ' + cy + ' ' + x2 + ' ' + y2;
  }

  function addPath(d, className, group) {
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className + ' line-' + group);
    svg.appendChild(path);
    return path;
  }

  var center = document.createElement('button');
  center.type = 'button';
  center.className = 'node node-center';
  center.textContent = 'Alex';
  center.setAttribute('aria-label', 'Alex. Show the whole map');
  place(center, 0, 0);
  world.appendChild(center);

  var labels = {};
  topics.forEach(function (topic, i) {
    labels[topic.id] = topic.label;
    var angle = -Math.PI / 2 + (i / topics.length) * Math.PI * 2;
    topic.x = Math.cos(angle) * TOPIC_RADIUS;
    topic.y = Math.sin(angle) * TOPIC_RADIUS;

    topic.path = addPath(curve(0, 0, topic.x, topic.y), 'topic-line', topic.group);

    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'node node-topic node-' + topic.group;
    node.dataset.topic = topic.id;
    node.setAttribute('aria-expanded', 'false');
    node.textContent = topic.label;
    place(node, topic.x, topic.y);
    world.appendChild(node);
    topic.node = node;

    // Details fan outward, away from the center.
    var count = topic.details.length;
    topic.details.forEach(function (detail, j) {
      var offset = count > 1 ? (j / (count - 1) - 0.5) * DETAIL_SPREAD : 0;
      var a = angle + offset;
      detail.x = topic.x + Math.cos(a) * DETAIL_RADIUS;
      detail.y = topic.y + Math.sin(a) * DETAIL_RADIUS;

      detail.path = addPath(curve(topic.x, topic.y, detail.x, detail.y), 'detail-line', topic.group);

      var el = document.createElement('div');
      el.className = 'node node-detail node-' + topic.group;
      el.style.transitionDelay = j * 40 + 'ms';
      el.innerHTML = '<strong></strong>' + (detail.note ? '<span></span>' : '');
      el.querySelector('strong').textContent = detail.label;
      if (detail.note) el.querySelector('span').textContent = detail.note;
      // Details start tucked behind their topic and slide out when it opens.
      place(el, topic.x, topic.y);
      world.appendChild(el);
      detail.node = el;
    });
  });

  // Detail boxes have different widths, so nudge any that overlap apart.
  // Sizes come from layout (offsetWidth), which zoom transforms don't affect.
  function size(el) {
    return { w: el.offsetWidth, h: el.offsetHeight };
  }

  function separate(a, b, moveB) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var ox = (a.w + b.w) / 2 + GAP - Math.abs(dx);
    var oy = (a.h + b.h) / 2 + GAP - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return false;
    var share = moveB ? 1 : 0.5;
    if (oy < ox) {
      var sy = (dy >= 0 ? 1 : -1) * oy * share;
      b.y += sy;
      if (!moveB) a.y -= sy;
    } else {
      var sx = (dx >= 0 ? 1 : -1) * ox * share;
      b.x += sx;
      if (!moveB) a.x -= sx;
    }
    return true;
  }

  function relax() {
    var fixed = [{ x: 0, y: 0, el: center }].concat(topics.map(function (t) {
      return { x: t.x, y: t.y, el: t.node };
    }));
    fixed.forEach(function (f) {
      var s = size(f.el);
      f.w = s.w;
      f.h = s.h;
    });
    topics.forEach(function (topic) {
      var boxes = topic.details.map(function (d) {
        var s = size(d.node);
        return { x: d.x, y: d.y, w: s.w, h: s.h, detail: d };
      });
      for (var pass = 0; pass < 40; pass++) {
        var moved = false;
        for (var i = 0; i < boxes.length; i++) {
          for (var j = i + 1; j < boxes.length; j++) {
            moved = separate(boxes[i], boxes[j], false) || moved;
          }
          fixed.forEach(function (f) {
            moved = separate(f, boxes[i], true) || moved;
          });
        }
        if (!moved) break;
      }
      boxes.forEach(function (box) {
        var d = box.detail;
        d.x = box.x;
        d.y = box.y;
        d.w = box.w;
        d.h = box.h;
        d.path.setAttribute('d', curve(topic.x, topic.y, d.x, d.y));
      });
    });
  }

  relax();

  // Show each role's topics as small tags, so the link back to the map is visible.
  roles.forEach(function (role) {
    var list = document.createElement('ul');
    list.className = 'role-topics';
    role.dataset.topics.split(/\s+/).forEach(function (id) {
      if (!labels[id]) return;
      var item = document.createElement('li');
      item.textContent = labels[id];
      list.appendChild(item);
    });
    if (list.children.length) role.querySelector('.role-meta').appendChild(list);
  });

  // ---- Camera -----------------------------------------------------------

  var cam = { x: 0, y: 0, scale: 1 };

  function clampScale(s) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  function apply(animate) {
    world.classList.toggle('is-animating', !!animate && !reduceMotion);
    world.style.transform = 'translate(' + cam.x + 'px,' + cam.y + 'px) scale(' + cam.scale + ')';
    map.style.setProperty('--zoom', cam.scale);
  }

  // Frame a world-space box, centered in the viewport.
  function fit(box, animate, maxScale) {
    var w = viewport.clientWidth;
    var h = viewport.clientHeight;
    // Leave room for the zoom buttons and the hint.
    var padX = 24;
    var padY = 44;
    var s = clampScale(Math.min((w - padX * 2) / (box.maxX - box.minX), (h - padY * 2) / (box.maxY - box.minY)));
    if (maxScale) s = Math.min(s, maxScale);
    cam.scale = s;
    cam.x = -((box.minX + box.maxX) / 2) * s;
    cam.y = -((box.minY + box.maxY) / 2) * s;
    apply(animate);
  }

  // Points with w/h use their own size; others use the margin.
  function boxAround(points, margin) {
    var box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    points.forEach(function (p) {
      var mx = p.w ? p.w / 2 : margin.x;
      var my = p.h ? p.h / 2 : margin.y;
      box.minX = Math.min(box.minX, p.x - mx);
      box.maxX = Math.max(box.maxX, p.x + mx);
      box.minY = Math.min(box.minY, p.y - my);
      box.maxY = Math.max(box.maxY, p.y + my);
    });
    return box;
  }

  function focusOn(topic, animate) {
    fit(boxAround([topic].concat(topic.details), { x: 90, y: 30 }), animate, FOCUS_MAX_SCALE);
  }

  function fitAll(animate) {
    fit(boxAround(topics.concat([{ x: 0, y: 0 }]), { x: 90, y: 40 }), animate);
  }

  // Zoom by a factor while keeping the point (px, py), relative to the viewport center, still.
  function zoomAt(factor, px, py, animate) {
    var s = clampScale(cam.scale * factor);
    var k = s / cam.scale;
    cam.x = px - (px - cam.x) * k;
    cam.y = py - (py - cam.y) * k;
    cam.scale = s;
    apply(animate);
  }

  // ---- Selecting topics -------------------------------------------------

  var active = null;

  function select(id) {
    active = active === id ? null : id;

    topics.forEach(function (topic) {
      var open = topic.id === active;
      topic.node.classList.toggle('is-active', open);
      topic.node.setAttribute('aria-expanded', open ? 'true' : 'false');
      topic.path.classList.toggle('is-active', open);
      topic.details.forEach(function (detail) {
        detail.node.classList.toggle('is-open', open);
        detail.path.classList.toggle('is-open', open);
        place(detail.node, open ? detail.x : topic.x, open ? detail.y : topic.y);
      });
    });
    map.classList.toggle('has-active', !!active);

    panels.forEach(function (panel) {
      panel.hidden = panel.dataset.topicPanel !== (active || 'none');
    });
    roles.forEach(function (role) {
      var match = active && role.dataset.topics.split(/\s+/).indexOf(active) !== -1;
      role.classList.toggle('is-highlighted', !!match);
    });

    var topic = topics.filter(function (t) { return t.id === active; })[0];
    if (topic) {
      focusOn(topic, true);
    } else {
      fitAll(true);
    }
  }

  topics.forEach(function (topic) {
    topic.node.addEventListener('click', function () {
      if (dragged) return;
      select(topic.id);
    });
  });

  center.addEventListener('click', function () {
    if (dragged) return;
    if (active) select(active);
    else fitAll(true);
  });

  controls.addEventListener('click', function (e) {
    var button = e.target.closest('[data-zoom]');
    if (!button) return;
    var action = button.dataset.zoom;
    if (action === 'in') zoomAt(1.3, 0, 0, true);
    if (action === 'out') zoomAt(1 / 1.3, 0, 0, true);
    if (action === 'reset') {
      if (active) select(active);
      else fitAll(true);
    }
  });

  map.addEventListener('keydown', function (e) {
    if (e.key === '+' || e.key === '=') zoomAt(1.3, 0, 0, true);
    else if (e.key === '-') zoomAt(1 / 1.3, 0, 0, true);
    else if (e.key === 'Escape' && active) select(active);
  });

  // ---- Drag, pinch and wheel -------------------------------------------

  function toViewport(clientX, clientY) {
    var rect = viewport.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  var pointers = {};
  var dragged = false;
  var start = null;
  var lastPinch = null;

  viewport.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    start = { x: e.clientX, y: e.clientY };
    dragged = false;
    lastPinch = null;
  });

  viewport.addEventListener('pointermove', function (e) {
    var prev = pointers[e.pointerId];
    if (!prev) return;
    var ids = Object.keys(pointers);

    if (!dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) {
      dragged = true;
      // Capture only once it is a real drag, so plain taps still click the node under them.
      viewport.setPointerCapture(e.pointerId);
      map.classList.add('is-dragging');
    }

    if (ids.length === 2) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var a = pointers[ids[0]];
      var b = pointers[ids[1]];
      var dist = Math.hypot(a.x - b.x, a.y - b.y);
      var mid = toViewport((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (lastPinch) {
        zoomAt(dist / lastPinch.dist, mid.x, mid.y, false);
        cam.x += mid.x - lastPinch.mid.x;
        cam.y += mid.y - lastPinch.mid.y;
        apply(false);
      }
      lastPinch = { dist: dist, mid: mid };
      dragged = true;
      return;
    }

    if (dragged) {
      cam.x += e.clientX - prev.x;
      cam.y += e.clientY - prev.y;
      apply(false);
    }
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  });

  function release(e) {
    delete pointers[e.pointerId];
    lastPinch = null;
    if (!Object.keys(pointers).length) {
      map.classList.remove('is-dragging');
      // Let the click that follows a drag see `dragged`, then reset.
      setTimeout(function () { dragged = false; }, 0);
    }
  }
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);

  // Plain scrolling keeps scrolling the page; Ctrl + scroll and trackpad pinches zoom.
  viewport.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    var p = toViewport(e.clientX, e.clientY);
    zoomAt(Math.exp(-e.deltaY * 0.01), p.x, p.y, false);
  }, { passive: false });

  // ---- Start --------------------------------------------------------------

  fitAll(false);
  var pending;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(function () {
      var topic = topics.filter(function (t) { return t.id === active; })[0];
      if (topic) focusOn(topic, false);
      else fitAll(false);
    });
  });
})();
