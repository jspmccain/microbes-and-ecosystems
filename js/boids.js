/* ==========================================================================
   Flow field — monochrome particle current for the site background.

   A large swarm of tiny particles drift through a smoothly-evolving 3D
   Perlin noise field (x, y, time), each particle's heading pulled from the
   field at its own position. Trails accumulate via a low-alpha black
   fill each frame rather than being drawn as discrete shapes, which is the
   classic flow-field look: soft, ribbon-like white lines braiding across a
   black canvas. The mouse acts as a local vortex — particles near the
   cursor get pulled into a swirl that blends smoothly back into the
   ambient field as they move away from it.
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

  // ---- Classic 3D Perlin noise (Ken Perlin's reference algorithm) --------
  // Self-contained so the site keeps zero external dependencies. The
  // permutation table is shuffled once per page load for a fresh field
  // each visit.
  var perm = new Uint8Array(512);
  (function initPerlin() {
    var p = new Uint8Array(256);
    for (var i = 0; i < 256; i++) p[i] = i;
    for (var i = 255; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    for (var i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(t, a, b) { return a + t * (b - a); }
  function grad(hash, x, y, z) {
    var h = hash & 15;
    var u = h < 8 ? x : y;
    var v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  function noise3(x, y, z) {
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    var u = fade(x), v = fade(y), w = fade(z);
    var A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    var B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(w,
      lerp(v,
        lerp(u, grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z)),
        lerp(u, grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z))),
      lerp(v,
        lerp(u, grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1))));
  }
  // -------------------------------------------------------------------------

  var NOISE_SCALE = 0.0028;
  var TIME_SCALE = 0.00018;
  var ANGLE_MULT = Math.PI * 4.2;

  var particles = [];
  var mouse = { x: 0, y: 0, active: false };
  var t = 0;
  var running = true;

  function particleCount() {
    var area = window.innerWidth * window.innerHeight;
    var n = Math.round(area / 9000);
    return Math.max(160, Math.min(n, 620));
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

  function Particle() {
    this.reset(true);
  }

  Particle.prototype.reset = function (initial) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0.5 + Math.random() * 1.1;
    this.alpha = 0.12 + Math.random() * 0.28;
    this.width = 0.5 + Math.random() * 0.9;
    this.age = 0;
    this.life = 260 + Math.random() * 420;
    if (initial) this.age = Math.random() * this.life;
  };

  function initParticles() {
    particles = [];
    var count = reduceMotion ? Math.round(particleCount() * 0.35) : particleCount();
    for (var i = 0; i < count; i++) particles.push(new Particle());
  }

  var MARGIN = 20;

  function fieldAngle(x, y) {
    var n = noise3(x * NOISE_SCALE, y * NOISE_SCALE, t);
    return n * ANGLE_MULT;
  }

  function step(p) {
    var angle = fieldAngle(p.x, p.y);
    var tx = Math.cos(angle);
    var ty = Math.sin(angle);

    // Mouse vortex: within range, blend the ambient field direction toward
    // a tangential (swirling) direction around the cursor. Weight falls
    // off smoothly with distance so it melts back into the ambient flow.
    if (mouse.active) {
      var dx = p.x - mouse.x;
      var dy = p.y - mouse.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var radius = 220;
      if (dist < radius && dist > 0.001) {
        var w = 1 - dist / radius;
        w = w * w;
        var swirlX = -dy / dist;
        var swirlY = dx / dist;
        // slight inward pull mixed with the tangential swirl so particles
        // arc around the cursor rather than just brushing past it.
        var pullX = -dx / dist;
        var pullY = -dy / dist;
        var sx = swirlX * 0.82 + pullX * 0.18;
        var sy = swirlY * 0.82 + pullY * 0.18;
        var bx = tx * (1 - w) + sx * w;
        var by = ty * (1 - w) + sy * w;
        var bl = Math.sqrt(bx * bx + by * by) || 1;
        tx = bx / bl;
        ty = by / bl;
      }
    }

    var targetVx = tx * p.speed;
    var targetVy = ty * p.speed;
    p.vx += (targetVx - p.vx) * 0.11;
    p.vy += (targetVy - p.vy) * 0.11;

    p.prevX = p.x;
    p.prevY = p.y;
    p.x += p.vx;
    p.y += p.vy;
    p.age++;

    if (
      p.age > p.life ||
      p.x < -MARGIN || p.x > width + MARGIN ||
      p.y < -MARGIN || p.y > height + MARGIN
    ) {
      p.reset(false);
    }
  }

  function draw() {
    // Low-alpha black fill instead of a hard clear — trails accumulate and
    // dissolve gradually, the signature flow-field look.
    ctx.fillStyle = "rgba(0, 0, 0, 0.07)";
    ctx.fillRect(0, 0, width, height);

    ctx.lineCap = "round";
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!reduceMotion) step(p);
      var dx = p.x - p.prevX;
      var dy = p.y - p.prevY;
      // Skip drawing the long jump that happens the frame a particle
      // respawns, so resets don't draw a stray line across the screen.
      if (Math.sqrt(dx * dx + dy * dy) > 30) continue;
      ctx.strokeStyle = "rgba(255, 255, 255, " + p.alpha + ")";
      ctx.lineWidth = p.width;
      ctx.beginPath();
      ctx.moveTo(p.prevX, p.prevY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    t += TIME_SCALE * 60;
  }

  function loop() {
    if (!running) return;
    if (!reduceMotion) {
      draw();
      requestAnimationFrame(loop);
    } else {
      // Single static-ish frame for reduced-motion users, then stop.
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      ctx.fillRect(0, 0, width, height);
      draw();
    }
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
    initParticles();
  }

  resize();
  initParticles();
  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  ctx.fillRect(0, 0, width, height);

  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("mouseleave", onMouseLeave, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  requestAnimationFrame(loop);
})();
