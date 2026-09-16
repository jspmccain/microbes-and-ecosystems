/* ==========================================================================
   Boids — flowing current swarm for the site background.

   Classic Reynolds flocking (separation / alignment / cohesion), but each
   boid is rendered as a short streak oriented along its own velocity
   rather than a glowing dot — so the swarm reads as drifting current
   lines / flow-field motion rather than a lit-up particle effect.
   Organized into a few loose "schools" by color so it reads as several
   small currents rather than one uniform blob — nodding to
   microbial/planktonic clustering.
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
    { color: "62, 232, 208" }, // cyan
    { color: "255, 95, 209" }, // magenta
    { color: "167, 139, 250" }, // violet
    { color: "124, 255, 178" } // green
  ];

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

  function Boid(schoolIndex) {
    this.school = schoolIndex;
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.4 + Math.random() * 0.5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = 1.4 + Math.random() * 2.2;
    this.depth = 0.4 + Math.random() * 0.6; // affects opacity/size for parallax
    this.flicker = Math.random() * Math.PI * 2;
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
    if (b.x < -margin) b.x = width + margin;
    if (b.x > width + margin) b.x = -margin;
    if (b.y < -margin) b.y = height + margin;
    if (b.y > height + margin) b.y = -margin;
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

    // Slow drifting wander so motion never looks perfectly mechanical
    b.flicker += 0.01;
    ax += Math.sin(b.flicker) * 0.003;
    ay += Math.cos(b.flicker * 0.7) * 0.003;

    b.vx += ax;
    b.vy += ay;
    var v = limit(b.vx, b.vy, MAX_SPEED * (0.7 + b.depth * 0.6));
    b.vx = v[0];
    b.vy = v[1];

    b.x += b.vx;
    b.y += b.vy;
    wrap(b);
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

  function draw() {
    // Trailing fade instead of a hard clear. A slightly lower fade rate
    // than a plain dot effect needs, since each streak already implies
    // motion on its own — this just lets successive streaks blend into a
    // continuous, current-like flow instead of a sharp dash.
    ctx.fillStyle = "rgba(5, 11, 20, 0.24)";
    ctx.fillRect(0, 0, width, height);

    var gridInfo = buildGrid();

    for (var i = 0; i < boids.length; i++) {
      var b = boids[i];
      var neighbors = neighborsFor(b, gridInfo);
      if (!reduceMotion) step(b, neighbors);

      var school = SCHOOLS[b.school];
      var alpha = 0.15 + b.depth * 0.24;
      var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      var lineWidth = b.size * (0.55 + b.depth * 0.35);
      // Streak length follows current speed, so faster-moving boids draw
      // a longer flow line and slow ones read as a soft, short dash —
      // no bloom/halo, just a barely-blurred edge to avoid hard aliasing.
      var len = 2.5 + speed * 7 + b.depth * 2;
      var color = "rgba(" + school.color + ", " + alpha + ")";

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 1 + b.depth * 1.5;
      ctx.moveTo(b.x - b.vx * len, b.y - b.vy * len);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
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
