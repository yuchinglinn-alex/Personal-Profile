// Turns the nested outline in #map into a zoomable, draggable mind map, drawn as a street map.
// Topics are districts in a ring of avenues around a roundabout; opening one flies the camera
// in and branches out its details along side streets, each detail a place on the map. Selecting a topic also shows its panel and
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
  var MIN_SCALE = 0.15;
  var MAX_SCALE = 2.5;
  var SUB_RADIUS = 175;
  var SUB_SPREAD = Math.PI * 0.85;
  var FOCUS_MAX_SCALE = 1.3;
  // With everything expanded, topics move this much further out to make room.
  // Each step is [ring, local]: how much further topics move out, and how much further
  // details and branches sit from their parent.
  var ALL_SPREAD = [[1.8, 1.1], [2.1, 1.1], [2.4, 1.15], [2.7, 1.2], [3, 1.2], [3.4, 1.25]];
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
        place: item.dataset.place || '',
        icon: item.dataset.icon || '',
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
      place: li.dataset.place || '',
      icon: li.dataset.icon || '',
      details: readItems(li.querySelector(':scope > ul'))
    };
  });

  // ---- Map icons ----------------------------------------------------------

  // Line icons on a 24px grid, one per kind of place (data-icon in the outline).
  var ICONS = {
    university: 'M2 9l10-5 10 5-10 5z M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5 M22 9v6',
    campus: 'M4 21V10l8-5 8 5v11 M9 21v-6h6v6 M2 21h20',
    library: 'M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z M12 6v14',
    medal: 'M8 3l4 6 4-6 M12 9a6 6 0 1 1 0 12a6 6 0 1 1 0-12 M12 13v4',
    chip: 'M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',
    lab: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3 M7 15h10',
    certificate: 'M4 4h16v12H4z M8 8h8 M8 12h5 M15 15l-1 6 3-2 3 2-1-6',
    factory: 'M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17z M3 21h18',
    tools: 'M15 4a5 5 0 0 0-4 7l-7 7 2 2 7-7a5 5 0 0 0 7-4l-3 1-2-2z',
    bank: 'M3 9l9-5 9 5z M5 11v7 M9.5 11v7 M14.5 11v7 M19 11v7 M3 21h18',
    vault: 'M4 4h16v15H4z M12 8.5a3 3 0 1 1 0 6a3 3 0 1 1 0-6 M12 6.5v2 M12 14.5v2 M7 19v2 M17 19v2',
    weather: 'M7 15h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.4A3.3 3.3 0 0 0 7 15z M8 18l-1 3 M12 18l-1 3 M16 18l-1 3',
    toll: 'M4 21V6h4v15 M8 10h13v3H8 M12 10l-2 3 M16 10l-2 3 M20 10l-2 3 M2 21h8',
    stadium: 'M3 9c0-2 4-4 9-4s9 2 9 4v6c0 2-4 4-9 4s-9-2-9-4z M3 9c0 2 4 4 9 4s9-2 9-4',
    server: 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.5 M8 17h.5',
    tower: 'M9 21l1-10h4l1 10 M7 11h10l-1-4H8z M12 7V3 M7 21h10',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
    telescope: 'M3 12l13-6 2 4-13 6z M10 14l-3 7 M12 14l3 7 M16 6l2-1 2 4-2 1',
    exchange: 'M3 20h18 M5 16l4-5 4 3 6-8 M15 6h4v4',
    ship: 'M3 15h18l-3 5H6z M6 15V9h12v6 M10 9V5h4v4',
    broadcast: 'M12 10v11 M9 21h6 M8.5 4.5a5 5 0 0 0 0 7 M15.5 4.5a5 5 0 0 1 0 7 M5.5 1.5a9 9 0 0 0 0 13 M18.5 1.5a9 9 0 0 1 0 13 M12 8h.5',
    mail: 'M3 6h18v12H3z M3 6l9 7 9-7',
    square: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
    flag: 'M5 21V4 M5 4h14l-3 4 3 4H5',
    film: 'M3 5h18v14H3z M7 5v14 M17 5v14 M3 9h4 M3 15h4 M17 9h4 M17 15h4',
    shop: 'M3 9l2-5h14l2 5 M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0 M5 12v9h14v-9 M10 21v-5h4v5',
    pharmacy: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
    store: 'M4 10h16v11H4z M3 10l2-6h14l2 6 M9 21v-6h6v6',
    radio: 'M4 9h16v12H4z M7 9l10-5 M15 12.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5 M7 13h4 M7 17h4'
  };

  // A round map marker holding the place's icon.
  function marker(name) {
    var badge = document.createElement('i');
    badge.className = 'place-icon';
    badge.setAttribute('aria-hidden', 'true');
    if (ICONS[name]) {
      badge.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + ICONS[name] + '"/></svg>';
    }
    return badge;
  }

  // Fills a node with its marker, label, note and place name.
  function fillNode(el, item) {
    if (item.icon) el.appendChild(marker(item.icon));
    var text = document.createElement('span');
    text.className = 'node-text';
    var label = document.createElement('strong');
    label.textContent = item.label;
    text.appendChild(label);
    if (item.note) {
      var note = document.createElement('span');
      note.className = 'node-note';
      note.textContent = item.note;
      text.appendChild(note);
    }
    if (item.place) {
      var place = document.createElement('em');
      place.className = 'node-place';
      place.textContent = item.place;
      text.appendChild(place);
    }
    el.appendChild(text);
  }

  // ---- Build the canvas -------------------------------------------------

  var viewport = document.createElement('div');
  viewport.className = 'mindmap-viewport';
  var world = document.createElement('div');
  world.className = 'mindmap-world';
  var svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'mindmap-lines');
  svg.setAttribute('aria-hidden', 'true');
  world.appendChild(svg);
  drawTerrain();
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

  function svgEl(name, attrs, parent) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach(function (key) {
      el.setAttribute(key, attrs[key]);
    });
    (parent || svg).appendChild(el);
    return el;
  }

  // The city under the roads: blocks of side streets, a river, a lake and a few parks.
  // Drawn once, far wider than the map, so panning never runs off the edge.
  function drawTerrain() {
    var EXTENT = 4000;
    var defs = svgEl('defs', {});
    var pattern = svgEl('pattern', { id: 'map-blocks', width: 150, height: 150, patternUnits: 'userSpaceOnUse' }, defs);
    svgEl('path', { d: 'M0 0H150 M0 0V150 M0 75H150', class: 'terrain-street' }, pattern);
    var land = svgEl('g', { class: 'terrain' });
    svgEl('rect', { x: -EXTENT, y: -EXTENT, width: EXTENT * 2, height: EXTENT * 2, fill: 'url(#map-blocks)' }, land);
    [
      [-430, -260, 150, 110], [300, 140, 190, 120], [-240, 330, 130, 150],
      [520, -420, 220, 140], [-900, 520, 260, 180], [880, 300, 200, 260]
    ].forEach(function (p) {
      svgEl('rect', { x: p[0], y: p[1], width: p[2], height: p[3], rx: 26, class: 'terrain-park' }, land);
    });
    svgEl('path', {
      d: 'M-760 -4000 C-700 -1400 -420 -900 -560 -380 S-820 420 -640 900 S-560 2200 -700 4000',
      class: 'terrain-river'
    }, land);
    svgEl('ellipse', { cx: 760, cy: 760, rx: 230, ry: 140, class: 'terrain-water' }, land);
  }

  // Roads are three strokes on one curve: the curb, the asphalt and the center line.
  // Each kind of stroke has its own layer, so where roads meet they merge like a real junction
  // instead of their curbs crossing over each other.
  var layers = ['road-edge', 'road-fill', 'road-mark'].map(function (part) {
    return svgEl('g', { class: part });
  });

  function addPath(d, className, group) {
    var parts = layers.map(function (layer) {
      return svgEl('path', { d: d, class: 'road ' + className + ' line-' + group }, layer);
    });
    // Callers treat a road like one element, so class changes go to all three strokes.
    return {
      parts: parts,
      classList: {
        toggle: function (name, on) {
          parts.forEach(function (part) { part.classList.toggle(name, on); });
        },
        remove: function (name) {
          parts.forEach(function (part) { part.classList.remove(name); });
        }
      }
    };
  }

  function setRoad(road, d) {
    road.parts.forEach(function (part) {
      part.setAttribute('d', d);
    });
  }

  // A roundabout where every avenue meets, with Alex in the middle.
  layers.forEach(function (layer) {
    svgEl('circle', { cx: 0, cy: 0, r: 64, class: 'road roundabout' }, layer);
  });

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
    fillNode(node, topic);
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
      fillNode(el, detail);
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
        // A stop along the side street.
        var stop = document.createElement('i');
        stop.className = 'stop-dot';
        stop.setAttribute('aria-hidden', 'true');
        subEl.appendChild(stop);
        fillNode(subEl, sub);
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
    // Still nudging after all passes: fine as long as nothing actually overlaps.
    return !boxes.some(function (a, i) {
      return boxes.slice(i + 1).concat(fixed).some(function (b) {
        return touching(a, b);
      });
    });
  }

  function touching(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
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
        setRoad(d.path, curve(topic.x, topic.y, d.x, d.y));
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
          setRoad(sub.path, curve(detail.x, detail.y, sub.x, sub.y));
          place(sub.node, detail.x, detail.y);
        });
      });
    });
  }

  relax();

  // A second layout for "Expand all": every detail and branch on screen at once,
  // spread across the whole map instead of just around one topic.
  function relaxAll(ring, local) {
    topics.forEach(function (t) {
      t.ax = t.x * ring;
      t.ay = t.y * ring;
    });
    var c = size(center);
    var fixed = [{ x: 0, y: 0, w: c.w, h: c.h }].concat(topics.map(function (t) {
      return { x: t.ax, y: t.ay, w: t.w, h: t.h };
    }));
    var detailBoxes = [];
    topics.forEach(function (t) {
      t.details.forEach(function (d) {
        detailBoxes.push(boxFor(d, t.ax + (d.x - t.x) * local, t.ay + (d.y - t.y) * local));
      });
    });
    var settled = spread(detailBoxes, fixed);
    detailBoxes.forEach(function (box) {
      box.item.ax = box.x;
      box.item.ay = box.y;
    });
    var subBoxes = [];
    topics.forEach(function (t) {
      t.details.forEach(function (d) {
        d.items.forEach(function (sub) {
          subBoxes.push(boxFor(sub, d.ax + (sub.x - d.x) * local, d.ay + (sub.y - d.y) * local));
        });
      });
    });
    // Details and branches settle together so details can make room for crowded branches.
    settled = spread(detailBoxes.concat(subBoxes), fixed);
    detailBoxes.forEach(function (box) {
      box.item.ax = box.x;
      box.item.ay = box.y;
    });
    subBoxes.forEach(function (box) {
      box.item.ax = box.x;
      box.item.ay = box.y;
    });
    return settled && staysHome();
  }

  // Each topic's details and branches should sit nearer their own topic than any other,
  // so the clusters read as separate groups.
  function staysHome() {
    return topics.every(function (t) {
      return t.details.every(function (d) {
        return [d].concat(d.items).every(function (item) {
          var own = Math.hypot(item.ax - t.ax, item.ay - t.ay);
          return topics.every(function (other) {
            return other === t || Math.hypot(item.ax - other.ax, item.ay - other.ay) > own;
          });
        });
      });
    });
  }

  // Widen the ring until every box settles without overlapping.
  for (var f = 0; f < ALL_SPREAD.length; f++) {
    if (relaxAll(ALL_SPREAD[f][0], ALL_SPREAD[f][1])) break;
  }

  function setPaths(all) {
    topics.forEach(function (t) {
      var tx = all ? t.ax : t.x;
      var ty = all ? t.ay : t.y;
      setRoad(t.path, curve(0, 0, tx, ty));
      t.details.forEach(function (d) {
        var dx = all ? d.ax : d.x;
        var dy = all ? d.ay : d.y;
        setRoad(d.path, curve(tx, ty, dx, dy));
        d.items.forEach(function (sub) {
          setRoad(sub.path, curve(dx, dy, all ? sub.ax : sub.x, all ? sub.ay : sub.y));
        });
      });
    });
  }

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
  function fit(box, animate, maxScale, minScale) {
    var w = viewport.clientWidth;
    var h = viewport.clientHeight;
    // Leave room for the zoom buttons and the hint.
    var padX = 24;
    var padY = 56;
    var s = clampScale(Math.min((w - padX * 2) / (box.maxX - box.minX), (h - padY * 2) / (box.maxY - box.minY)));
    if (maxScale) s = Math.min(s, maxScale);
    if (minScale) s = Math.max(s, minScale);
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

  function fitExpanded(animate) {
    var points = [{ x: 0, y: 0 }];
    topics.forEach(function (t) {
      points.push({ x: t.ax, y: t.ay, w: t.w, h: t.h });
      t.details.forEach(function (d) {
        points.push({ x: d.ax, y: d.ay, w: d.w, h: d.h });
        d.items.forEach(function (sub) {
          points.push({ x: sub.ax, y: sub.ay, w: sub.w, h: sub.h });
        });
      });
    });
    fit(boxAround(points, { x: 90, y: 40 }), animate);
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

  // ---- Expand all -------------------------------------------------------

  var allMode = false;
  var allPicked = null;
  var expandButton = map.querySelector('.map-expand');

  function setAll(on) {
    if (on) {
      if (activeDetail) openDetail(activeDetail);
      if (active) select(active);
    }
    allMode = on;
    map.classList.toggle('is-all', on);
    expandButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    expandButton.textContent = on ? 'Collapse all' : 'Expand all';
    if (allPicked) allPicked.node.classList.remove('is-expanded');
    allPicked = null;
    showSource(null);
    setPaths(on);

    topics.forEach(function (t) {
      place(t.node, on ? t.ax : t.x, on ? t.ay : t.y);
      t.details.forEach(function (d) {
        d.node.classList.toggle('is-open', on);
        d.node.classList.remove('is-dimmed');
        d.path.classList.toggle('is-open', on);
        d.path.classList.remove('is-dimmed');
        d.node.tabIndex = on ? 0 : -1;
        place(d.node, on ? d.ax : t.x, on ? d.ay : t.y);
        d.items.forEach(function (sub) {
          sub.node.classList.toggle('is-open', on);
          sub.path.classList.toggle('is-open', on);
          place(sub.node, on ? sub.ax : d.x, on ? sub.ay : d.y);
        });
      });
    });

    if (on) fitExpanded(true);
    else fitAll(true);
  }

  // With everything open, tapping a detail just shows its resume lines.
  function pickInAll(detail) {
    if (allPicked) allPicked.node.classList.remove('is-expanded');
    allPicked = allPicked === detail ? null : detail;
    if (allPicked) allPicked.node.classList.add('is-expanded');
    showSource(allPicked);
  }

  expandButton.hidden = false;
  expandButton.addEventListener('click', function () {
    setAll(!allMode);
  });

  function select(id) {
    if (allMode) setAll(false);
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
        if (allMode) pickInAll(detail);
        else openDetail(detail);
      });
    });
  });

  center.addEventListener('click', function () {
    if (dragged) return;
    if (allMode) setAll(false);
    else if (active) select(active);
    else fitAll(true);
  });

  controls.addEventListener('click', function (e) {
    var button = e.target.closest('[data-zoom]');
    if (!button) return;
    var action = button.dataset.zoom;
    if (action === 'in') zoomAt(1.3, 0, 0, true);
    if (action === 'out') zoomAt(1 / 1.3, 0, 0, true);
    if (action === 'reset') {
      if (allMode) setAll(false);
      else if (active) select(active);
      else fitAll(true);
    }
  });

  map.addEventListener('keydown', function (e) {
    if (e.key === '+' || e.key === '=') zoomAt(1.3, 0, 0, true);
    else if (e.key === '-') zoomAt(1 / 1.3, 0, 0, true);
    else if (e.key === 'Escape' && allMode) setAll(false);
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
      if (allMode) fitExpanded(false);
      else if (activeDetail) focusOnDetail(activeDetail, false);
      else if (topic) focusOn(topic, false);
      else fitAll(false);
    });
  });
})();
