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
  var resumeBox = document.querySelector('.resume-match');
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // World layout, in px before zoom.
  var TOPIC_RADIUS = 280;
  var DETAIL_RADIUS = 220;
  var DETAIL_SPREAD = Math.PI * 0.8;
  var MIN_SCALE = 0.3;
  var MAX_SCALE = 2.5;
  var SUB_RADIUS = 175;
  var SUB_SPREAD = Math.PI * 0.85;
  var FOCUS_MAX_SCALE = 1.3;
  var GAP = 14;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Read the outline -------------------------------------------------

  // Each item's own text is its label, <small> its note, and a nested <ul> its branches.
  function readItems(list) {
    if (!list) return [];
    return Array.prototype.map.call(list.children, function (item) {
      var small = item.querySelector(':scope > small');
      return {
        label: item.firstChild.textContent.trim(),
        note: small ? small.textContent.trim() : '',
        // Ids of the resume lines this item comes from; [] means not on the resume, null means untagged.
        source: item.hasAttribute('data-source') ? item.dataset.source.split(/\s+/).filter(Boolean) : null,
        items: readItems(item.querySelector(':scope > ul'))
      };
    });
  }

  var topics = Array.prototype.map.call(source.children, function (li) {
    return {
      id: li.dataset.topic,
      group: li.dataset.group,
      label: li.firstChild.textContent.trim(),
      details: readItems(li.querySelector(':scope > ul'))
    };
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

  // On tall, narrow screens squeeze the ring into an upright oval so the map can zoom in further.
  var portrait = viewport.clientWidth < viewport.clientHeight;
  var rx = TOPIC_RADIUS * (portrait ? 0.62 : 1);
  var ry = TOPIC_RADIUS * (portrait ? 1.1 : 1);

  var labels = {};
  topics.forEach(function (topic, i) {
    labels[topic.id] = topic.label;
    var angle = -Math.PI / 2 + (i / topics.length) * Math.PI * 2;
    topic.x = Math.cos(angle) * rx;
    topic.y = Math.sin(angle) * ry;

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

      var branches = detail.items.length > 0;
      // Every detail is clickable: it shows its resume lines and, if it has any, its branches.
      var el = document.createElement('button');
      el.type = 'button';
      el.tabIndex = -1;
      el.className = 'node node-detail node-' + topic.group;
      el.style.transitionDelay = j * 40 + 'ms';
      el.innerHTML = '<strong></strong>' + (detail.note ? '<span></span>' : '');
      el.querySelector('strong').textContent = detail.label;
      if (detail.note) el.querySelector('span').textContent = detail.note;
      if (branches) {
        el.classList.add('has-branches');
        el.setAttribute('aria-expanded', 'false');
        var mark = document.createElement('i');
        mark.className = 'branch-mark';
        mark.setAttribute('aria-hidden', 'true');
        el.appendChild(mark);
      }
      // Details start tucked behind their topic and slide out when it opens.
      place(el, topic.x, topic.y);
      world.appendChild(el);
      detail.node = el;
      detail.topic = topic;

      // Third level: what each detail is about. Positions are set in relax().
      detail.items.forEach(function (sub, k) {
        sub.path = addPath('', 'sub-line', topic.group);
        var subEl = document.createElement('div');
        subEl.className = 'node node-sub node-' + topic.group;
        subEl.style.transitionDelay = k * 40 + 'ms';
        subEl.innerHTML = '<strong></strong>' + (sub.note ? '<span></span>' : '');
        subEl.querySelector('strong').textContent = sub.label;
        if (sub.note) subEl.querySelector('span').textContent = sub.note;
        world.appendChild(subEl);
        sub.node = subEl;
      });
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

  // Push the movable boxes apart from each other and off the fixed ones.
  function spread(boxes, fixed) {
    for (var pass = 0; pass < 200; pass++) {
      var moved = false;
      for (var i = 0; i < boxes.length; i++) {
        for (var j = i + 1; j < boxes.length; j++) {
          moved = separate(boxes[i], boxes[j], false) || moved;
        }
        for (var f = 0; f < fixed.length; f++) {
          moved = separate(fixed[f], boxes[i], true) || moved;
        }
      }
      if (!moved) return true;
    }
    return false;
  }

  function boxFor(item, x, y) {
    var s = size(item.node);
    return { x: x, y: y, w: s.w, h: s.h, item: item };
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
    // Keep topic sizes so framing the map can use them.
    topics.forEach(function (t, i) {
      t.w = fixed[i + 1].w;
      t.h = fixed[i + 1].h;
    });
    topics.forEach(function (topic) {
      var boxes = topic.details.map(function (d) {
        return boxFor(d, d.x, d.y);
      });
      spread(boxes, fixed);
      boxes.forEach(function (box) {
        var d = box.item;
        d.x = box.x;
        d.y = box.y;
        d.w = box.w;
        d.h = box.h;
        d.path.setAttribute('d', curve(topic.x, topic.y, d.x, d.y));
      });

      // Sub-branches fan out along the line from the topic through their detail,
      // clear of the topic's other details.
      topic.details.forEach(function (detail) {
        var subs = detail.items;
        if (!subs.length) return;
        var angle = Math.atan2(detail.y - topic.y, detail.x - topic.x);
        var obstacles = fixed.concat(boxes);
        var subBoxes;
        // In tight spots the boxes can get wedged; start them further out until they settle.
        for (var reach = 1; reach <= 2.5; reach += 0.25) {
          subBoxes = subs.map(function (sub, k) {
            var offset = subs.length > 1 ? (k / (subs.length - 1) - 0.5) * SUB_SPREAD : 0;
            var a = angle + offset;
            var r = SUB_RADIUS * reach;
            return boxFor(sub, detail.x + Math.cos(a) * r, detail.y + Math.sin(a) * r);
          });
          if (spread(subBoxes, obstacles)) break;
        }
        subBoxes.forEach(function (box) {
          var sub = box.item;
          sub.x = box.x;
          sub.y = box.y;
          sub.w = box.w;
          sub.h = box.h;
          sub.path.setAttribute('d', curve(detail.x, detail.y, sub.x, sub.y));
          place(sub.node, detail.x, detail.y);
        });
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
    var padY = 56;
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

  function focusOnDetail(detail, animate) {
    fit(boxAround([detail, detail.topic].concat(detail.items), { x: 90, y: 30 }), animate, FOCUS_MAX_SCALE);
  }

  function fitAll(animate) {
    fit(boxAround(topics.concat([{ x: 0, y: 0 }]), { x: 90, y: 40 }), animate, 1.4);
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
  var activeDetail = null;

  function showBranches(detail, open) {
    detail.node.classList.toggle('is-expanded', open);
    if (detail.items.length) detail.node.setAttribute('aria-expanded', open ? 'true' : 'false');
    detail.items.forEach(function (sub) {
      sub.node.classList.toggle('is-open', open);
      sub.path.classList.toggle('is-open', open);
      place(sub.node, open ? sub.x : detail.x, open ? sub.y : detail.y);
    });
  }

  // ---- Resume cross-reference -------------------------------------------

  var sourceLines = [];

  // Where a resume line sits: its role, degree or skill group.
  function contextOf(el) {
    var holder = el.closest('.role, .edu > li');
    if (holder) return holder.querySelector('h3').textContent.replace(/\s+/g, ' ').trim();
    var group = el.previousElementSibling;
    if (group && group.matches('.skill-group')) return 'Skills · ' + group.textContent;
    return '';
  }

  function textOf(el) {
    if (el.matches('ul')) {
      return Array.prototype.map.call(el.children, function (li) { return li.textContent; }).join(' · ');
    }
    return el.textContent.trim();
  }

  function showSource(detail) {
    sourceLines.forEach(function (el) { el.classList.remove('is-source'); });
    sourceLines = [];
    if (!resumeBox) return;
    // The resume card takes the topic panel's place, right under the map.
    panels.forEach(function (panel) {
      panel.hidden = detail ? true : panel.dataset.topicPanel !== (active || 'none');
    });
    resumeBox.innerHTML = '';
    resumeBox.hidden = !detail || !detail.source;
    if (resumeBox.hidden) return;

    var heading = document.createElement('h3');
    heading.textContent = detail.label + ' on my resume';
    resumeBox.appendChild(heading);

    if (!detail.source.length) {
      var none = document.createElement('p');
      none.className = 'resume-none';
      none.textContent = 'Not on my resume yet. This is an additional project, listed under Projects.';
      resumeBox.appendChild(none);
      return;
    }

    detail.source.forEach(function (id) {
      var line = document.getElementById(id);
      if (!line) return;
      line.classList.add('is-source');
      sourceLines.push(line);

      var item = document.createElement('figure');
      item.className = 'resume-line';
      var where = document.createElement('figcaption');
      where.textContent = contextOf(line);
      var quote = document.createElement('blockquote');
      quote.textContent = textOf(line);
      var jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'resume-jump';
      jump.textContent = 'Show it on the page ↓';
      jump.addEventListener('click', function () {
        line.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        line.classList.remove('is-flash');
        // Restart the flash animation even if it ran before.
        void line.offsetWidth;
        line.classList.add('is-flash');
      });
      item.appendChild(where);
      item.appendChild(quote);
      item.appendChild(jump);
      resumeBox.appendChild(item);
    });
  }

  function openDetail(detail) {
    if (activeDetail) showBranches(activeDetail, false);
    activeDetail = activeDetail === detail ? null : detail;
    map.classList.toggle('has-detail', !!activeDetail);
    topics.forEach(function (topic) {
      topic.details.forEach(function (d) {
        d.node.classList.toggle('is-dimmed', !!activeDetail && d !== activeDetail);
        d.path.classList.toggle('is-dimmed', !!activeDetail && d !== activeDetail);
      });
    });
    showSource(activeDetail);
    if (activeDetail) {
      showBranches(activeDetail, true);
      focusOnDetail(activeDetail, true);
    } else {
      focusOn(detail.topic, true);
    }
  }

  function select(id) {
    active = active === id ? null : id;
    if (activeDetail) openDetail(activeDetail);

    topics.forEach(function (topic) {
      var open = topic.id === active;
      topic.node.classList.toggle('is-active', open);
      topic.node.setAttribute('aria-expanded', open ? 'true' : 'false');
      topic.path.classList.toggle('is-active', open);
      topic.details.forEach(function (detail) {
        detail.node.classList.toggle('is-open', open);
        detail.path.classList.toggle('is-open', open);
        detail.node.tabIndex = open ? 0 : -1;
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
    topic.details.forEach(function (detail) {
      detail.node.addEventListener('click', function () {
        if (dragged) return;
        openDetail(detail);
      });
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
    else if (e.key === 'Escape' && activeDetail) openDetail(activeDetail);
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

  // Older browsers without overflow: clip can still scroll the viewport when a node gets focus.
  viewport.addEventListener('scroll', function () {
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
  });

  fitAll(false);
  var pending;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(function () {
      var topic = topics.filter(function (t) { return t.id === active; })[0];
      if (activeDetail) focusOnDetail(activeDetail, false);
      else if (topic) focusOn(topic, false);
      else fitAll(false);
    });
  });
})();
