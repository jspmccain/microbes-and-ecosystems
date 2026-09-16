/* ==========================================================================
   Flow field — a lazy winding river running through the site background.

   A large swarm of tiny particles drift through a smoothly-evolving 3D
   Perlin noise field (x, y, time), each particle's heading pulled from the
   field at its own position — but layered underneath that ambient drift is
   a slow, meandering "river": a gently curving path (a couple of broad
   bends plus smaller wiggles, like a lazy river or the Amazon seen from
   above) that particles near it are swept along, left to right, at a
   noticeably faster pace than the calmer water off to its sides. The two
   behaviors blend smoothly with distance from the river's centerline, so
   there's no hard edge between "current" and "still water." Trails
   accumulate via a low-alpha black fill each frame rather than being drawn
   as discrete shapes, which is the classic flow-field look: soft,
   ribbon-like white lines braiding across a black canvas. The mouse acts
   as a local vortex — particles near the cursor get pulled into a swirl
   that blends smoothly back into the ambient flow as they move away.
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

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smoothstep(edge0, edge1, x) {
    var tt = clamp01((x - edge0) / (edge1 - edge0));
    return tt * tt * (3 - 2 * tt);
  }
  // -------------------------------------------------------------------------

  var NOISE_SCALE = 0.0028;
  var TIME_SCALE = 0.00018;
  var ANGLE_MULT = Math.PI * 4.2;

  // ---- The river ------------------------------------------------------
  // A couple of broad, slow sine bends plus a smaller/faster one layered on
  // top gives a lazy, organic meander rather than a single clean wave —
  // reads like a river winding across the screen (a bit of an Amazon
  // river vibe) instead of a sine graph. `riverPhase` drifts very slowly
  // over time so the bends themselves shift subtly, like a river easing
  // its course over ages, without ever looking like it's "moving" fast.
  var riverPhase = Math.random() * Math.PI * 2;
  var RIVER_DRIFT_RATE = 0.00022;
  var RIVER_SPAWN_BIAS = 0.68; // fraction of particles that ride the river

  function riverFreqs() {
    var f1 = (Math.PI * 2) / (width * 1.15);
    return { f1: f1, f2: f1 * 2.3 };
  }

  function riverY(x) {
    var f = riverFreqs();
    return height * 0.52 +
      height * 0.16 * Math.sin(x * f.f1 + riverPhase) +
      height * 0.065 * Math.sin(x * f.f2 - riverPhase * 1.3);
  }

  function riverSlope(x) {
    var f = riverFreqs();
    return height * 0.16 * f.f1 * Math.cos(x * f.f1 + riverPhase) +
      height * 0.065 * f.f2 * Math.cos(x * f.f2 - riverPhase * 1.3);
  }

  function channelHalfWidth() {
    return Math.max(60, Math.min(height * 0.09, 150));
  }
  // -----------------------------------------------------------------------

  var particles = [];
  var mouse = { x: 0, y: 0, active: false };
  var t = 0;
  var running = true;

  function particleCount() {
    // Fewer, thicker, longer-tailed particles read as bolder ribbons rather
    // than a dense mesh — density is lowered here to compensate for the
    // heavier stroke width and much longer fade below.
    var area = window.innerWidth * window.innerHeight;
    var n = Math.round(area / 15000);
    return Math.max(90, Math.min(n, 340));
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
    var inRiver = Math.random() < RIVER_SPAWN_BIAS;
    if (inRiver) {
      // On first load, scatter river particles across the whole width so
      // the current reads fully-formed right away. On every later respawn,
      // bring them back in from the left ("upstream") so the river reads
      // as a continuous current flowing in from off-screen rather than
      // particles just blinking back in wherever they happen to expire.
      this.x = initial ? Math.random() * width : Math.random() * width * 0.16 - 20;
      var centerY = riverY(this.x);
      var spread = channelHalfWidth() * 1.05;
      // Rough bounded bell curve (sum of uniforms) so particles cluster
      // toward the centerline with a soft falloff toward the banks.
      var offset = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5 * spread;
      this.y = centerY + offset;
    } else {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
    }
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0.16 + Math.random() * 0.34;
    this.alpha = 0.16 + Math.random() * 0.3;
    this.width = 2.2 + Math.random() * 2.2;
    this.age = 0;
    this.life = 700 + Math.random() * 900;
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
    // How close is this particle to the river's centerline right now, and
    // which way does the river flow there? `riverInfluence` is 1 deep in
    // the channel and fades smoothly to 0 a couple of channel-widths out —
    // that's what makes the sides drift slowly while the river itself
    // moves with purpose, with no hard seam between the two.
    var centerY = riverY(p.x);
    var slope = riverSlope(p.x);
    var distToRiver = p.y - centerY;
    var halfW = channelHalfWidth();
    var riverInfluence = 1 - smoothstep(halfW, halfW * 2.4, Math.abs(distToRiver));

    // River current direction: always downstream (+x), following the
    // curve's slope, with a gentle pull back toward the centerline so
    // particles snake along the actual bends instead of drifting off in
    // a straight line parallel to them.
    var rtx = 1;
    var rty = slope - distToRiver * 0.0032;
    var rl = Math.sqrt(rtx * rtx + rty * rty) || 1;
    rtx /= rl; rty /= rl;

    // Ambient noise-field direction — what governs motion off to the
    // sides of the river, and blends in even inside the channel for a
    // touch of texture.
    var angle = fieldAngle(p.x, p.y);
    var atx = Math.cos(angle);
    var aty = Math.sin(angle);

    var tx = atx * (1 - riverInfluence) + rtx * riverInfluence;
    var ty = aty * (1 - riverInfluence) + rty * riverInfluence;
    var tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;

    // Mouse vortex: within range, blend the current direction toward a
    // tangential (swirling) direction around the cursor. Weight falls off
    // smoothly with distance so it melts back into whatever was already
    // driving the particle — river or ambient — further away.
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

    // Particles in the river's current move at this particle's own lazy
    // base pace; off to the sides, in the calmer water, they move at
    // roughly a third of that — a clear, smoothly-blended slowdown away
    // from the channel.
    var speedNow = p.speed * (0.32 + 0.68 * riverInfluence);
    var targetVx = tx * speedNow;
    var targetVy = ty * speedNow;
    p.vx += (targetVx - p.vx) * 0.06;
    p.vy += (targetVy - p.vy) * 0.06;

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
    // Very low-alpha black fill instead of a hard clear — the lower this
    // is, the longer trails linger before dissolving.
    ctx.fillStyle = "rgba(0, 0, 0, 0.025)";
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
    riverPhase += RIVER_DRIFT_RATE;
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
