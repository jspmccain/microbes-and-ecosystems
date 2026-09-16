/* ==========================================================================
   Boids — flowing current swarm for the site background.

   Classic Reynolds flocking (separation / alignment / cohesion), but each
   boid is rendered as a short, curved ribbon trail — built from a smoothed
   history of its recent positions — that fades from a soft head to
   nothing at the tail, rather than a glowing dot or a straight streak.
   Reads as drifting, organic current lines / bioluminescent plankton
   trails. Organized into a few loose "schools" by color, each with a
   little per-boid hue variation, so it reads as several small currents
   rather than one uniform blob.
   ========================================================================== */

(function () {
  "use strict";

  var canvas = document.getElementById("boids-bg");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var width = 0;
  var height = 0;

  var SCHOOLS = [
    { color: [62, 232, 208] }, // cyan
    { color: [255, 95, 209] }, // magenta
    { color: [167, 139, 250] }, // violet
    { color: [124, 255, 178] } // green
  ];

  var HISTORY_LEN = 12;

  var boids = [];
  var mouse = { x: null, y: null, active: false };
  var lastFrame = 0;
  var running = true;

  function boidCount() {
    var area = window.innerWidth * window.innerHeight;
    var n = Math.round(area / 22000);
    return Math.max(24, Math.min(n, 90));
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * DPR;
    canvas.height = height * DPR;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function clamp255(v) {
    return Math.max(0, Math.min(255, v));
  }

  // Nudge a school's base color a little per-boid so the swarm reads as
  // many related-but-distinct hues rather than four flat, identical colors.
  function jitterColor(base) {
    var jitter = 22;
    return [
      clamp255(Math.round(base[0] + (Math.random() - 0.5) * jitter)),
      clamp255(Math.round(base[1] + (Math.random() - 0.5) * jitter)),
      clamp255(Math.round(base[2] + (Math.random() - 0.5) * jitter))
    ].join(", ");
  }

  function Boid(schoolIndex) {
    this.school = schoolIndex;
    this.color = jitterColor(SCHOOLS[schoolIndex].color);
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.4 + Math.random() * 0.5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = 1.4 + Math.random() * 2.2;
    this.depth = 0.4 + Math.random() * 0.6; // affects opacity/size for parallax
    this.wobble1 = Math.random() * Math.PI * 2;
    this.wobble2 = Math.random() * Math.PI * 2;
    this.history = [{ x: this.x, y: this.y }];
  }

  function initBoids() {
    boids = [];
    var count = reduceMotion ? Math.round(boidCount() * 0.4) : boidCount();
    for (var i = 0; i < count; i++) {
      boids.push(new Boid(i % SCHOOLS.length));
    }
  }

  function wrap(b) {
    var margin = 40;
    var wrapped = false;
    if (b.x < -margin) { b.x = width + margin; wrapped = true; }
    if (b.x > width + margin) { b.x = -margin; wrapped = true; }
    if (b.y < -margin) { b.y = height + margin; wrapped = true; }
    if (b.y > height + margin) { b.y = -margin; wrapped = true; }
    // Reset the trail on wrap so it doesn't draw a line clear across the
    // screen when a boid re-enters on the opposite edge.
    if (wrapped) b.history = [{ x: b.x, y: b.y }];
  }

  var NEIGHBOR_RADIUS = 90;
  var SEPARATION_RADIUS = 26;
  var MAX_SPEED = 1.15;
  var MAX_FORCE = 0.045;

  function limit(vx, vy, max) {
    var mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > max) {
      return [(vx / mag) * max, (vy / mag) * max];
    }
    return [vx, vy];
  }

  function step(b, neighbors) {
    var sepX = 0, sepY = 0;
    var aliX = 0, aliY = 0;
    var cohX = 0, cohY = 0;
    var count = 0;

    for (var i = 0; i < neighbors.length; i++) {
      var other = neighbors[i];
      if (other === b) continue;
      var dx = b.x - other.x;
      var dy = b.y - other.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0 && dist < NEIGHBOR_RADIUS && other.school === b.school) {
        count++;
        aliX += other.vx;
        aliY += other.vy;
        cohX += other.x;
        cohY += other.y;
        if (dist < SEPARATION_RADIUS) {
          sepX += dx / dist;
          sepY += dy / dist;
        }
      }
    }

    var ax = 0, ay = 0;

    if (count > 0) {
      aliX /= count;
      aliY /= count;
      var aliRes = limit(aliX - b.vx, aliY - b.vy, MAX_FORCE);
      ax += aliRes[0] * 1.0;
      ay += aliRes[1] * 1.0;

      cohX = cohX / count - b.x;
      cohY = cohY / count - b.y;
      var cohRes = limit(cohX, cohY, MAX_FORCE);
      ax += cohRes[0] * 0.9;
      ay += cohRes[1] * 0.9;
    }

    var sepRes = limit(sepX, sepY, MAX_FORCE);
    ax += sepRes[0] * 1.6;
    ay += sepRes[1] * 1.6;

    // Gentle cursor interaction: nearby boids drift away from the pointer,
    // like plankton scattering from a disturbance.
    if (mouse.active) {
      var mdx = b.x - mouse.x;
      var mdy = b.y - mouse.y;
      var mdist = Math.sqrt(mdx * mdx + mdy * mdy);
      if (mdist < 140 && mdist > 0) {
        var force = (140 - mdist) / 140 * 0.06;
        ax += (mdx / mdist) * force;
        ay += (mdy / mdist) * force;
      }
    }

    // Layered, out-of-phase wander (two frequencies per axis) so paths
    // curve and loop unpredictably over time instead of tracing a simple
    // single-sine wiggle — reads as organic drifting rather than mechanical.
    b.wobble1 += 0.011;
    b.wobble2 += 0.0037;
    ax += (Math.sin(b.wobble1) * 0.65 + Math.sin(b.wobble2 * 1.7) * 0.35) * 0.0045;
    ay += (Math.cos(b.wobble1 * 0.8) * 0.65 + Math.cos(b.wobble2 * 1.3) * 0.35) * 0.0045;

    b.vx += ax;
    b.vy += ay;
    var v = limit(b.vx, b.vy, MAX_SPEED * (0.7 + b.depth * 0.6));
    b.vx = v[0];
    b.vy = v[1];

    b.x += b.vx;
    b.y += b.vy;
    wrap(b);

    b.history.unshift({ x: b.x, y: b.y });
    if (b.history.length > HISTORY_LEN) b.history.length = HISTORY_LEN;
  }

  // Simple spatial grid to keep neighbor lookups cheap at higher counts.
  function buildGrid() {
    var cell = NEIGHBOR_RADIUS;
    var grid = {};
    var cols = Math.ceil(width / cell) + 1;
    for (var i = 0; i < boids.length; i++) {
      var b = boids[i];
      var cx = Math.floor(b.x / cell);
      var cy = Math.floor(b.y / cell);
      var key = cx + cols * cy;
      if (!grid[key]) grid[key] = [];
      grid[key].push(b);
    }
    return { grid: grid, cell: cell, cols: cols };
  }

  function neighborsFor(b, gridInfo) {
    var cell = gridInfo.cell;
    var cols = gridInfo.cols;
    var cx = Math.floor(b.x / cell);
    var cy = Math.floor(b.y / cell);
    var result = [];
    for (var ox = -1; ox <= 1; ox++) {
      for (var oy = -1; oy <= 1; oy++) {
        var key = (cx + ox) + cols * (cy + oy);
        var bucket = gridInfo.grid[key];
        if (bucket) {
          for (var i = 0; i < bucket.length; i++) result.push(bucket[i]);
        }
      }
    }
    return result;
  }

  // Draw one boid's trail as a smoothed curve through its recent positions,
  // using a gradient stroke that fades from a soft head to fully
  // transparent at the tail — curvy and organic, with no hard edges.
  function drawTrail(b) {
    var h = b.history;
    if (h.length < 2) return;

    var headAlpha = 0.22 + b.depth * 0.3;
    var lineWidth = b.size * (0.55 + b.depth * 0.35);
    var head = h[0];
    var tail = h[h.length - 1];

    var grad = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    grad.addColorStop(0, "rgba(" + b.color + ", " + headAlpha + ")");
    grad.addColorStop(1, "rgba(" + b.color + ", 0)");

    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    if (h.length === 2) {
      ctx.lineTo(tail.x, tail.y);
    } else {
      for (var i = 1; i < h.length - 1; i++) {
        var xc = (h[i].x + h[i + 1].x) / 2;
        var yc = (h[i].y + h[i + 1].y) / 2;
        ctx.quadraticCurveTo(h[i].x, h[i].y, xc, yc);
      }
      ctx.lineTo(tail.x, tail.y);
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(" + b.color + ", " + headAlpha * 0.6 + ")";
    ctx.shadowBlur = 1 + b.depth * 1.5;
    ctx.stroke();

    // A tiny brighter core at the head — like a faint bioluminescent spark
    // where the organism actually is, above the fading wake behind it.
    ctx.beginPath();
    ctx.fillStyle = "rgba(" + b.color + ", " + Math.min(headAlpha * 1.4, 0.85) + ")";
    ctx.arc(head.x, head.y, lineWidth * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    // Trailing fade instead of a hard clear, so old frames dissolve away
    // gradually rather than popping.
    ctx.fillStyle = "rgba(5, 11, 20, 0.24)";
    ctx.fillRect(0, 0, width, height);

    var gridInfo = buildGrid();

    for (var i = 0; i < boids.length; i++) {
      var b = boids[i];
      var neighbors = neighborsFor(b, gridInfo);
      if (!reduceMotion) step(b, neighbors);
      drawTrail(b);
    }
    ctx.shadowBlur = 0;
  }

  function loop(ts) {
    if (!running) return;
    if (!reduceMotion) {
      draw();
    } else if (lastFrame === 0) {
      // Draw a single static frame for reduced-motion users, then stop.
      ctx.fillStyle = "rgba(5, 11, 20, 1)";
      ctx.fillRect(0, 0, width, height);
      draw();
      lastFrame = ts || 1;
      return;
    } else {
      return;
    }
    requestAnimationFrame(loop);
  }

  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  }

  function onMouseLeave() {
    mouse.active = false;
  }

  function onVisibilityChange() {
    running = document.visibilityState !== "hidden";
    if (running && !reduceMotion) requestAnimationFrame(loop);
  }

  function onResize() {
    resize();
    initBoids();
  }

  resize();
  initBoids();
  ctx.fillStyle = "rgba(5, 11, 20, 1)";
  ctx.fillRect(0, 0, width, height);

  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("mouseleave", onMouseLeave, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  requestAnimationFrame(loop);
})();
