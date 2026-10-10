/* Falling-icon playground: a tiny circle-physics world plus a DOM renderer.
   The physics half has no DOM access so tests/drop.test.js can run it in Node. */
(function (global) {
  "use strict";

  var GRAVITY = 2400;
  var MAX_BODIES = 40;
  var LIFETIME = 7000;
  var MAX_THROW = 1800;
  // Fresh bodies ignore pointers briefly so a quick second tap reaches the trigger they spawned over.
  var GRAB_DELAY = 300;
  var TRAIL_LIFE = 0.7;
  var LETTER_LIFE = 3.2;
  var MAX_LETTERS = 60;
  var REST_SPEED = 30;
  var SUBSTEPS = 3;
  var ITERATIONS = 4;

  // gravity is a multiplier of GRAVITY; mass drives who pushes whom.
  // upright: keep the icon level (dogs and sauna-goers should never tumble). faces: -1 when the art looks left.
  // settle: may tumble in the air but lies flat once it lands.
  // orient: noses along its velocity (the plane glyph points up-right, hence +45deg).
  // flex: flexes three times after landing, the last one throwing nearby bodies into the air.
  // spill: the book opens and letters pour out on landing. trail: leaves a contrail while airborne.
  // run: trots along the floor (toward a bone if there is one), hopping over whatever blocks it.
  // steam: puffs steam while sitting. companion: a kind that tags along once per burst.
  var KINDS = {
    // App icons are rounded squares; a radius between the inscribed and circumscribed circle keeps corners from sinking into each other.
    app: { gravity: 1, bounce: 0.28, mass: 1, roll: true, radius: 0.58, size: [52, 84] },
    reading: { gravity: 0.9, bounce: 0.12, mass: 1.2, settle: true, spill: true, size: [50, 72] },
    travel: { gravity: 0.16, bounce: 0.2, mass: 0.7, drag: 0.35, glide: 260, orient: Math.PI / 4, settle: true, trail: true, size: [46, 68] },
    basketball: { gravity: 1, bounce: 0.8, mass: 0.8, roll: true, size: [56, 84] },
    sauna: { gravity: 1, bounce: 0.15, mass: 1.1, upright: true, steam: true, size: [56, 80] },
    training: { gravity: 1.6, bounce: 0.02, mass: 6, settle: true, flex: true, size: [62, 90] },
    dog: { gravity: 1, bounce: 0.3, mass: 1.2, upright: true, faces: -1, run: 230, hop: 0.35, companion: "bone", size: [56, 80] },
    bone: { gravity: 1, bounce: 0.3, mass: 0.6, settle: true, size: [42, 58] }
  };
  var FLEX_POWER = [0.25, 0.4, 1];
  var FLEX_RANGE = [0.55, 0.7, 1.2];
  var FLEX_AT = [0.3, 0.8, 1.3];

  function createWorld(opts) {
    return {
      width: opts.width,
      height: opts.height,
      gravity: opts.gravity != null ? opts.gravity : GRAVITY,
      rand: opts.rand || Math.random,
      time: 0,
      shake: 0,
      quakes: [],
      events: [],
      letters: [],
      bodies: []
    };
  }

  function createBody(o) {
    var k = KINDS[o.kind] || KINDS.app;
    return {
      kind: o.kind,
      k: k,
      x: o.x,
      y: o.y,
      vx: o.vx || 0,
      vy: o.vy || 0,
      size: o.size,
      // Interest emoji fill most of their box but not its corners.
      r: o.size * (k.radius || 0.42),
      a: o.a || 0,
      w: o.w || 0,
      delay: o.delay || 0,
      expires: (o.now || 0) + LIFETIME,
      born: (o.now || 0) + (o.delay || 0) * 1000,
      phase: o.phase || 0,
      held: false,
      grounded: false,
      squash: 0,
      flexT: -1,
      flexPower: 0,
      flexReady: false,
      open: false,
      trail: [],
      facing: 1,
      wander: 0,
      runDir: 0,
      blocked: false,
      puffIn: 0,
      flexes: null,
      flexN: 0,
      data: o.data
    };
  }

  // Phones get smaller icons and fewer of them, so a screenful stays readable and cheap to render.
  function sizeScale(width) {
    return Math.max(0.65, Math.min(1, 0.65 + (width - 390) / (900 - 390) * 0.35));
  }

  function maxBodiesFor(width) {
    return width < 600 ? 24 : MAX_BODIES;
  }

  function add(world, body) {
    world.bodies.push(body);
    var evicted = [];
    var cap = maxBodiesFor(world.width);
    for (var i = 0; world.bodies.length > cap && i < world.bodies.length; ) {
      if (world.bodies[i].held) { i++; continue; }
      evicted.push(world.bodies.splice(i, 1)[0]);
    }
    return evicted;
  }

  // Shortest signed angle from a to b, so headings near +/-PI don't spin the long way round.
  function turn(a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function integrate(world, b, dt) {
    var k = b.k;
    var onGround = b.grounded;
    b.grounded = false;
    b.vy += world.gravity * k.gravity * dt;
    if (k.drag) {
      var f = Math.max(0, 1 - k.drag * dt);
      b.vx *= f;
      b.vy *= f;
    }
    if (k.glide) b.vx += Math.cos(world.time * 2.2 + b.phase) * k.glide * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (k.orient && !onGround) {
      b.w = 0;
      b.a += turn(b.a, Math.atan2(b.vy, b.vx) + k.orient) * Math.min(1, 30 * dt);
    } else if (k.upright) {
      b.w = 0;
      b.a *= Math.max(0, 1 - 10 * dt);
    } else {
      b.a += b.w * dt;
    }
  }

  function collideWalls(world, b) {
    var W = world.width, H = world.height, k = b.k;
    if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx * Math.max(k.bounce, 0.2); }
    if (b.x + b.r > W) { b.x = W - b.r; b.vx = -b.vx * Math.max(k.bounce, 0.2); }
    if (b.y - b.r < 0) {
      b.y = b.r;
      if (b.vy < 0) b.vy = -b.vy * k.bounce;
    }
    if (b.y + b.r > H) {
      b.y = H - b.r;
      if (b.vy > 0) {
        b.squash = Math.max(b.squash, Math.min(1, b.vy / 1600));
        if (k.flex || k.spill) land(world, b);
        b.vy = b.vy < REST_SPEED ? 0 : -b.vy * k.bounce;
      }
      b.grounded = true;
      // Runners supply their own footing; floor friction would stall them.
      if (!k.run) b.vx *= 0.9;
      if (k.roll) b.w = b.vx / b.r;
      else if (!k.upright) b.w *= 0.8;
    }
  }

  function collidePairs(world) {
    var bodies = world.bodies;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (b.delay > 0) continue;
      for (var j = i + 1; j < bodies.length; j++) {
        var c = bodies[j];
        if (c.delay > 0) continue;
        var dx = c.x - b.x, dy = c.y - b.y;
        var min = b.r + c.r;
        var d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        // A held body acts as an immovable wall: inverse mass 0.
        var ib = b.held ? 0 : 1 / b.k.mass;
        var ic = c.held ? 0 : 1 / c.k.mass;
        var sum = ib + ic;
        if (!sum) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        var overlap = min - d;
        b.x -= nx * overlap * ib / sum; b.y -= ny * overlap * ib / sum;
        c.x += nx * overlap * ic / sum; c.y += ny * overlap * ic / sum;
        if (ny > 0.5) b.grounded = true;
        if (ny < -0.5) c.grounded = true;
        // A runner pressing sideways into anything but its bone is blocked and should hop.
        if (b.runDir * nx > 0.6 && c.kind !== "bone") b.blocked = true;
        if (c.runDir * -nx > 0.6 && b.kind !== "bone") c.blocked = true;
        var vn = (c.vx - b.vx) * nx + (c.vy - b.vy) * ny;
        // Landing on top of the pile counts as a landing too, not just hitting the floor.
        if (vn < 0) {
          if ((b.k.flex || b.k.spill) && ny > 0.3) land(world, b);
          if ((c.k.flex || c.k.spill) && ny < -0.3) land(world, c);
        }
        if (vn < 0) {
          var e = Math.min(b.k.bounce, c.k.bounce);
          var jn = -(1 + e) * vn / sum;
          b.vx -= jn * nx * ib; b.vy -= jn * ny * ib;
          c.vx += jn * nx * ic; c.vy += jn * ny * ic;
        }
        if (!b.held) { b.vx *= 0.985; b.vy *= 0.985; }
        if (!c.held) { c.vx *= 0.985; c.vy *= 0.985; }
        b.w *= 0.96; c.w *= 0.96;
      }
    }
  }

  function settle(b, dt) {
    var level = Math.round(b.a / (Math.PI * 2)) * (Math.PI * 2);
    b.w = 0;
    b.a += (level - b.a) * Math.min(1, 12 * dt);
  }

  // Only the drop right after spawning counts; later bumps, throws and flex-launched
  // biceps landing again would otherwise chain into endless bouncing.
  function land(world, source) {
    if (source.landed || source.held) return;
    source.landed = true;
    if (source.k.spill) {
      source.open = true;
      var letters = [];
      for (var i = 0; i < 5; i++) {
        letters.push(addLetter(world, {
          x: source.x + (world.rand() - 0.5) * source.r * 0.6,
          y: source.y - source.r * 0.4,
          vx: (world.rand() - 0.5) * 520,
          vy: -(320 + world.rand() * 280),
          w: (world.rand() - 0.5) * 14,
          r: 9 + world.rand() * 3
        }));
      }
      world.events.push({ type: "spill", body: source, letters: letters });
    }
    // Flexing waits for the biceps to come to rest (see flex), so a mid-air bump never starts it.
    if (source.k.flex) source.flexReady = true;
  }

  function flex(world, b) {
    if (b.flexReady && !b.flexes) {
      if (b.grounded && !b.held && Math.hypot(b.vx, b.vy) < 60) b.flexes = FLEX_AT.map(function (t) { return world.time + t; });
      return;
    }
    if (!b.flexes || b.flexN >= b.flexes.length || b.held || world.time < b.flexes[b.flexN]) return;
    var power = FLEX_POWER[b.flexN];
    world.quakes.push({ x: b.x, y: b.y, power: power, range: FLEX_RANGE[b.flexN], source: b });
    world.events.push({ type: "flex", body: b, power: power, t: world.time });
    b.flexT = world.time;
    b.flexPower = power;
    b.flexN++;
  }

  // Swell fast, hold the pose, then ease back: reads as a deliberate flex rather than a jitter.
  function flexScale(t, power) {
    if (t < 0 || t >= 0.6) return 1;
    var amp = 0.3 + 0.25 * power;
    if (t < 0.12) return 1 + amp * (1 - Math.pow(1 - t / 0.12, 3));
    if (t < 0.25) return 1 + amp;
    var u = (t - 0.25) / 0.35;
    return 1 + amp * (1 - u * u * (3 - 2 * u));
  }

  function shockwave(world) {
    var QUAKE_RANGE = 380;
    for (var q = 0; q < world.quakes.length; q++) {
      var quake = world.quakes[q];
      world.shake = Math.max(world.shake, quake.power);
      for (var i = 0; i < world.bodies.length; i++) {
        var c = world.bodies[i];
        if (c === quake.source || c.held || c.delay > 0) continue;
        var dx = c.x - quake.x;
        var near = 1 - Math.hypot(dx, c.y - quake.y) / (QUAKE_RANGE * (quake.range || 1));
        if (near <= 0) continue;
        var f = Math.sqrt(near) * quake.power;
        var dir = dx < 0 ? -1 : 1;
        // The same impulse hits everyone, so light icons fly and other biceps barely budge.
        var lift = Math.min(2600, 2100 * f / c.k.mass);
        c.vy = Math.min(c.vy, 0) - lift * (0.85 + world.rand() * 0.3);
        c.vx += dir * lift * 0.38;
        c.w += dir * 10 * f / c.k.mass;
      }
    }
    world.quakes.length = 0;
  }

  function nearest(world, b, kind) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < world.bodies.length; i++) {
      var c = world.bodies[i];
      if (c.kind !== kind || c.delay > 0) continue;
      var d = Math.abs(c.x - b.x);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  function jump(world, b, dir, scale) {
    if (b.vy < -REST_SPEED) return;
    b.vy = -(560 + world.rand() * 260) * scale;
    if (dir) b.vx = dir * b.k.run * 1.15;
  }

  function trot(world, b, dt) {
    var k = b.k;
    if (Math.abs(b.vx) > 20) b.facing = b.vx > 0 ? 1 : -1;
    if (b.held || !b.grounded) { b.blocked = false; return; }
    var bone = nearest(world, b, "bone");
    var dir;
    if (bone) {
      var dx = bone.x - b.x;
      dir = Math.abs(dx) < b.r + bone.r ? 0 : (dx > 0 ? 1 : -1);
    } else {
      if (!b.wander || world.rand() < 0.35 * dt) b.wander = world.rand() < 0.5 ? -1 : 1;
      if (b.x - b.r < 4) b.wander = 1;
      if (b.x + b.r > world.width - 4) b.wander = -1;
      dir = b.wander;
    }
    b.runDir = dir;
    b.vx += (dir * k.run - b.vx) * Math.min(1, 8 * dt);
    if (b.blocked && dir) jump(world, b, dir, 1);
    else if (world.rand() < (bone && !dir ? 2.2 : k.hop) * dt) jump(world, b, dir, 0.75);
    b.blocked = false;
  }

  function puff(world, b, dt) {
    if (b.held || !b.grounded) return;
    b.puffIn -= dt;
    if (b.puffIn > 0) return;
    b.puffIn = 0.35 + world.rand() * 0.4;
    world.events.push({ type: "steam", x: b.x + (world.rand() - 0.5) * b.r * 0.6, y: b.y - b.r * 0.95 });
  }

  // Letter tiles are light debris: they bounce off icons and each other but never push an icon.
  function addLetter(world, o) {
    var l = { x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, r: o.r || 10, a: 0, w: o.w || 0, born: world.time, dead: false, asleep: false, still: 0 };
    world.letters.push(l);
    while (world.letters.length > MAX_LETTERS) world.letters.shift().dead = true;
    return l;
  }

  function stepLetters(world, h) {
    var W = world.width, H = world.height, list = world.letters, i, j, l;
    for (i = list.length - 1; i >= 0; i--) {
      if (world.time - list[i].born > LETTER_LIFE) {
        list[i].dead = true;
        list.splice(i, 1);
      }
    }
    for (i = 0; i < list.length; i++) {
      l = list[i];
      var supported = false;
      // A sleeping tile whose footing vanished (icon expired, tile below faded) has to fall again.
      if (l.asleep && !hasSupport(world, l)) {
        l.asleep = false;
        l.still = 0;
      }
      if (!l.asleep) {
        l.vy += world.gravity * h;
        l.x += l.vx * h;
        l.y += l.vy * h;
        l.a += l.w * h;
      }
      for (j = 0; j < world.bodies.length; j++) {
        var b = world.bodies[j];
        if (b.delay > 0) continue;
        var dx = l.x - b.x, dy = l.y - b.y, min = b.r + l.r, d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        // Only a real shove wakes a tile or restarts its settle timer; resting contact overlaps by float error.
        if (min - d >= 0.5) {
          l.asleep = false;
          l.still = 0;
        } else if (l.asleep) {
          continue;
        }
        // A tile caught under an icon can't go down through the floor, so squeeze it out sideways.
        if (ny > 0.3) {
          nx = dx < 0 ? -1 : 1;
          ny = 0;
          l.vx += nx * 240;
        }
        l.x = b.x + nx * min;
        l.y = b.y + ny * min;
        var vn = l.vx * nx + l.vy * ny;
        if (vn < 0) { l.vx -= 1.3 * vn * nx; l.vy -= 1.3 * vn * ny; }
        // Nudge tiles off the top of round icons so they end up scattered on the floor.
        if (ny < -0.5) l.vx += (nx < 0 ? -1 : 1) * 900 * h;
        l.w *= 0.9;
      }
      if (l.asleep) continue;
      // Sleeping tiles act as fixed ground; only the awake tile gives way, so a settled pile can't jitter.
      for (j = 0; j < list.length; j++) {
        var m = list[j];
        if (m === l) continue;
        var ex = l.x - m.x, ey = l.y - m.y, mm = l.r + m.r, e2 = ex * ex + ey * ey;
        if (e2 >= mm * mm || e2 === 0) continue;
        var e = Math.sqrt(e2), ox = ex / e, oy = ey / e;
        var share = m.asleep ? 1 : 0.5;
        l.x += ox * (mm - e) * share;
        l.y += oy * (mm - e) * share;
        if (!m.asleep) { m.x -= ox * (mm - e) * 0.5; m.y -= oy * (mm - e) * 0.5; }
        var vo = l.vx * ox + l.vy * oy;
        if (vo < 0) { l.vx -= vo * ox; l.vy -= vo * oy; }
      }
      if (l.x - l.r < 0) { l.x = l.r; l.vx = Math.abs(l.vx) * 0.4; }
      if (l.x + l.r > W) { l.x = W - l.r; l.vx = -Math.abs(l.vx) * 0.4; }
      if (l.y - l.r < 0) { l.y = l.r; l.vy = Math.abs(l.vy) * 0.4; }
      if (l.y + l.r > H) {
        l.y = H - l.r;
        if (l.vy > 0) l.vy = l.vy < REST_SPEED ? 0 : -l.vy * 0.35;
        supported = true;
      }
      supported = supported || hasSupport(world, l);
      if (supported) {
        l.vx *= 0.85;
        l.w = 0;
        var level = Math.round(l.a / (Math.PI / 2)) * (Math.PI / 2);
        l.a += (level - l.a) * Math.min(1, 12 * h);
      }
      l.still = supported && Math.abs(l.vx) + Math.abs(l.vy) < 25 ? (l.still || 0) + h : 0;
      if (l.still > 0.2) {
        l.asleep = true;
        l.vx = l.vy = l.w = 0;
        l.a = Math.round(l.a / (Math.PI / 2)) * (Math.PI / 2);
      }
    }
  }

  // Floor, a tile squarely underneath, or a wedge between two things holds a tile up.
  // A single round icon or a tile's corner does not: the tile slides off instead of perching.
  function hasSupport(world, l) {
    var TOUCH = 1.5, contacts = 0, i;
    if (l.y + l.r >= world.height - TOUCH) return true;
    for (i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      if (b.delay > 0 || b.y <= l.y) continue;
      if (Math.hypot(l.x - b.x, l.y - b.y) <= b.r + l.r + TOUCH) contacts++;
    }
    for (i = 0; i < world.letters.length; i++) {
      var m = world.letters[i];
      if (m === l || m.y <= l.y) continue;
      if (Math.hypot(l.x - m.x, l.y - m.y) > m.r + l.r + TOUCH) continue;
      if (Math.abs(l.x - m.x) < (l.r + m.r) * 0.45) return true;
      contacts++;
    }
    return contacts >= 2;
  }

  function companionsFor(items) {
    var seen = {}, out = [];
    for (var i = 0; i < items.length; i++) {
      var k = KINDS[items[i].kind];
      if (k && k.companion && !seen[k.companion]) {
        seen[k.companion] = true;
        out.push({ kind: k.companion });
      }
    }
    return out;
  }

  function step(world, dt) {
    var h = dt / SUBSTEPS;
    for (var s = 0; s < SUBSTEPS; s++) {
      world.time += h;
      var bodies = world.bodies, i, b;
      for (i = 0; i < bodies.length; i++) {
        b = bodies[i];
        if (b.delay > 0) { b.delay -= h; continue; }
        b.squash *= Math.max(0, 1 - 9 * h);
        if (b.held) { b.w *= 0.9; continue; }
        integrate(world, b, h);
      }
      for (var it = 0; it < ITERATIONS; it++) {
        collidePairs(world);
        for (i = 0; i < bodies.length; i++) {
          b = bodies[i];
          if (b.delay <= 0 && !b.held) collideWalls(world, b);
        }
      }
      shockwave(world);
      world.shake *= Math.max(0, 1 - 8 * h);
      for (i = 0; i < bodies.length; i++) {
        b = bodies[i];
        if (b.delay > 0) continue;
        if (b.k.settle && b.grounded && !b.held) settle(b, h);
        if (b.k.flex) flex(world, b);
        if (b.k.run) trot(world, b, h);
        if (b.k.steam) puff(world, b, h);
      }
      stepLetters(world, h);
    }
    for (var t = 0; t < world.bodies.length; t++) {
      if (world.bodies[t].k.trail) contrail(world, world.bodies[t]);
    }
  }

  // Points are dropped from the tail (opposite the velocity), then age out.
  function contrail(world, b) {
    var trail = b.trail;
    while (trail.length && world.time - trail[0].t > TRAIL_LIFE) trail.shift();
    var speed = Math.hypot(b.vx, b.vy);
    if (b.delay > 0 || b.grounded || speed < 120) return;
    var back = b.r * 0.85 / speed;
    trail.push({ x: b.x - b.vx * back, y: b.y - b.vy * back, t: world.time });
  }

  function expire(world, now) {
    var removed = [];
    for (var i = world.bodies.length - 1; i >= 0; i--) {
      var b = world.bodies[i];
      if (b.held) continue;
      if (now >= b.expires) removed.unshift(world.bodies.splice(i, 1)[0]);
    }
    return removed;
  }

  function grab(b) {
    b.held = true;
    b.landed = true;
    b.delay = 0;
    b.vx = b.vy = 0;
  }

  function release(b, now) {
    b.held = false;
    var v = Math.hypot(b.vx, b.vy);
    if (v > MAX_THROW) { b.vx *= MAX_THROW / v; b.vy *= MAX_THROW / v; }
    b.expires = now + LIFETIME;
  }

  // A burst's companions (a dog's bone) only join when none is on screen; an existing one is kept around instead.
  function companionsNeeded(world, items, now) {
    var wanted = companionsFor(items), out = [];
    for (var i = 0; i < wanted.length; i++) {
      var existing = null;
      for (var j = 0; j < world.bodies.length; j++) if (world.bodies[j].kind === wanted[i].kind) existing = world.bodies[j];
      if (existing) existing.expires = Math.max(existing.expires, now + LIFETIME);
      else out.push(wanted[i]);
    }
    return out;
  }

  function drainEvents(world) {
    return world.events.splice(0, world.events.length);
  }

  function isGrabbable(b, now) {
    return now >= b.born + GRAB_DELAY;
  }

  function isCalm(world) {
    if (world.letters.length) return false;
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      if (b.held || b.delay > 0 || b.k.run || b.k.steam || b.trail.length) return false;
      if ((b.flexReady && b.flexN < FLEX_AT.length) || world.time - b.flexT < 0.6) return false;
      if (Math.abs(b.vx) + Math.abs(b.vy) > REST_SPEED) return false;
    }
    return true;
  }

  var Drop = {
    KINDS: KINDS,
    MAX_BODIES: MAX_BODIES,
    LIFETIME: LIFETIME,
    MAX_THROW: MAX_THROW,
    GRAB_DELAY: GRAB_DELAY,
    TRAIL_LIFE: TRAIL_LIFE,
    LETTER_LIFE: LETTER_LIFE,
    createWorld: createWorld,
    createBody: createBody,
    add: add,
    step: step,
    expire: expire,
    grab: grab,
    release: release,
    isCalm: isCalm,
    isGrabbable: isGrabbable,
    drainEvents: drainEvents,
    addLetter: addLetter,
    companionsNeeded: companionsNeeded,
    sizeScale: sizeScale,
    maxBodiesFor: maxBodiesFor,
    flexScale: flexScale
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Drop;
    return;
  }

  // ---------- DOM renderer ----------

  var doc = global.document;
  var layer = null;
  var trails = null;
  // Read once per burst: getComputedStyle every frame forced a full style recalc on each tick.
  var trailColor = "rgba(255,255,255,.6)";
  var ctx = null;
  var world = null;
  var running = false;
  var lastT = 0;
  var calmFrames = 0;
  var expireTimer = null;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function ensureLayer() {
    if (layer) return;
    layer = doc.createElement("div");
    layer.className = "drop-layer";
    layer.setAttribute("aria-hidden", "true");
    trails = doc.createElement("canvas");
    trails.className = "drop-trails";
    layer.appendChild(trails);
    ctx = trails.getContext("2d");
    doc.body.appendChild(layer);
    world = createWorld({ width: layer.clientWidth, height: layer.clientHeight });
    sizeTrails();
    layer.addEventListener("pointerdown", onGrab);
    layer.addEventListener("pointermove", onDrag);
    layer.addEventListener("pointerup", onDrop);
    layer.addEventListener("pointercancel", onDrop);
    global.addEventListener("resize", function () {
      world.width = layer.clientWidth;
      world.height = layer.clientHeight;
      sizeTrails();
      if (world.bodies.length) start();
    });
  }

  function bodyOf(el) {
    for (var i = 0; i < world.bodies.length; i++) if (world.bodies[i].data === el) return world.bodies[i];
    return null;
  }

  function onGrab(e) {
    var b = bodyOf(e.target);
    if (!b) return;
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    grab(b);
    b.drag = { id: e.pointerId, ox: b.x - e.clientX, oy: b.y - e.clientY, t: performance.now() };
    b.data.classList.add("is-held");
    start();
  }

  function onDrag(e) {
    var b = bodyOf(e.target);
    if (!b || !b.drag || b.drag.id !== e.pointerId) return;
    var now = performance.now();
    var dt = Math.max((now - b.drag.t) / 1000, 1 / 240);
    var nx = e.clientX + b.drag.ox, ny = e.clientY + b.drag.oy;
    b.vx = b.vx * 0.5 + (nx - b.x) / dt * 0.5;
    b.vy = b.vy * 0.5 + (ny - b.y) / dt * 0.5;
    b.w = b.vx / 400;
    b.x = Math.min(Math.max(nx, b.r), world.width - b.r);
    b.y = Math.min(Math.max(ny, b.r), world.height - b.r);
    b.drag.t = now;
  }

  function onDrop(e) {
    var b = bodyOf(e.target);
    if (!b || !b.drag || b.drag.id !== e.pointerId) return;
    b.drag = null;
    b.data.classList.remove("is-held");
    release(b, performance.now());
    start();
  }

  function fadeOut(b) {
    var el = b.data;
    el.style.pointerEvents = "none";
    var anim = el.animate(
      [{ opacity: el.style.opacity || 1 }, { opacity: 0, transform: el.style.transform + " scale(.4)" }],
      { duration: 420, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }
    );
    anim.onfinish = function () { el.remove(); };
  }

  function sweep() {
    var removed = expire(world, performance.now());
    for (var i = 0; i < removed.length; i++) fadeOut(removed[i]);
    if (removed.length && !running) drawTrails();
    if (!world.bodies.length) { clearInterval(expireTimer); expireTimer = null; }
  }

  function sizeTrails() {
    var dpr = global.devicePixelRatio || 1;
    trails.width = Math.round(world.width * dpr);
    trails.height = Math.round(world.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Twin engine streaks that thin out and fade with age.
  function drawTrails() {
    ctx.clearRect(0, 0, world.width, world.height);
    ctx.strokeStyle = trailColor;
    // Butt caps: round caps overlap at every joint and read as a dotted line.
    ctx.lineCap = "butt";
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      var pts = b.trail;
      if (pts.length < 2) continue;
      var spread = b.r * 0.22;
      for (var side = -1; side <= 1; side += 2) {
        for (var j = 1; j < pts.length; j++) {
          var p0 = pts[j - 1], p1 = pts[j];
          var life = 1 - (world.time - p1.t) / TRAIL_LIFE;
          if (life <= 0) continue;
          var dx = p1.x - p0.x, dy = p1.y - p0.y;
          var len = Math.hypot(dx, dy) || 1;
          var ox = -dy / len * spread * side, oy = dx / len * spread * side;
          ctx.globalAlpha = life * life;
          ctx.lineWidth = 0.8 + 2.6 * life;
          ctx.beginPath();
          ctx.moveTo(p0.x + ox, p0.y + oy);
          ctx.lineTo(p1.x + ox, p1.y + oy);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function makeElement(item, size) {
    var el;
    if (item.src) {
      el = doc.createElement("img");
      el.src = item.src;
      el.alt = "";
      el.draggable = false;
      el.className = "drop-item drop-app";
    } else {
      el = doc.createElement("span");
      el.className = "drop-item drop-token";
      el.setAttribute("data-kind", item.kind);
      if (item.variant) el.setAttribute("data-variant", item.variant);
    }
    el.style.width = el.style.height = size + "px";
    el.style.opacity = 0;
    return el;
  }

  function render(now) {
    // A damped vertical bounce reads as a thud; random per-frame jitter read as buzzing.
    var j = world.shake > 0.02 ? world.shake * 9 : 0;
    layer.style.transform = j ? "translate3d(0," + Math.sin(world.time * 30) * j + "px,0)" : "";
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      var el = b.data;
      if (b.delay > 0) { el.style.opacity = 0; continue; }
      el.style.pointerEvents = isGrabbable(b, now) ? "auto" : "none";
      var s = b.squash * 0.22;
      var grow = b.flexT >= 0 ? flexScale(world.time - b.flexT, b.flexPower) : 1;
      // Mirror runners so the art looks where they are heading.
      var flip = b.k.run ? b.facing * (b.k.faces || 1) : 1;
      el.style.opacity = "";
      el.style.transform =
        "translate3d(" + (b.x - b.size / 2) + "px," + (b.y - b.size / 2) + "px,0)" +
        " scale(" + (1 + s) * flip * grow + "," + (1 - s) * grow + ")" +
        " rotate(" + b.a + "rad)";
    }
  }

  var GLYPHS = ["あ", "か", "本", "読", "文", "字", "A", "b", "Q", "Z", "?", "!"];

  var tiles = [];

  function spill(ev) {
    ev.body.data.classList.add("is-open");
    for (var i = 0; i < ev.letters.length; i++) {
      var l = ev.letters[i];
      var el = doc.createElement("span");
      el.className = "drop-letter";
      el.setAttribute("data-kind", ev.body.kind);
      el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      el.style.fontSize = Math.round(l.r * 1.3) + "px";
      layer.appendChild(el);
      l.el = el;
      tiles.push(l);
    }
  }

  function renderTiles() {
    for (var i = tiles.length - 1; i >= 0; i--) {
      var l = tiles[i];
      if (l.dead) {
        l.el.remove();
        tiles.splice(i, 1);
        continue;
      }
      var age = world.time - l.born;
      l.el.style.opacity = Math.max(0, Math.min(1, age / 0.08, (LETTER_LIFE - age) / 0.5));
      l.el.style.transform = "translate3d(" + l.x + "px," + l.y + "px,0) translate(-50%,-50%) rotate(" + l.a + "rad)";
    }
  }

  // Effect sprites sit under the icons, just above the contrail canvas.
  function sprite(className, size) {
    var el = doc.createElement("span");
    el.className = className;
    el.style.width = el.style.height = size + "px";
    layer.insertBefore(el, trails.nextSibling);
    return el;
  }

  function steamPuff(e) {
    var size = Math.round(rand(18, 28));
    var el = sprite("drop-steam", size);
    var x = e.x - size / 2, y = e.y - size / 2;
    var rise = rand(70, 120), sway = rand(8, 16) * (Math.random() < 0.5 ? -1 : 1);
    el.animate([
      { transform: "translate3d(" + x + "px," + y + "px,0) scale(.5)", opacity: 0 },
      { transform: "translate3d(" + (x + sway) + "px," + (y - rise * 0.35) + "px,0) scale(.9)", opacity: 0.9, offset: 0.3 },
      { transform: "translate3d(" + (x - sway) + "px," + (y - rise * 0.7) + "px,0) scale(1.05)", opacity: 0.6, offset: 0.65 },
      { transform: "translate3d(" + x + "px," + (y - rise) + "px,0) scale(1.15)", opacity: 0 }
    ], { duration: rand(1500, 2100), easing: "ease-out" }).onfinish = function () { el.remove(); };
  }

  function tick(now) {
    var dt = Math.min((now - lastT) / 1000, 1 / 30);
    lastT = now;
    step(world, dt);
    drawTrails();
    var events = drainEvents(world);
    for (var e = 0; e < events.length; e++) {
      var ev = events[e];
      if (ev.type === "spill") spill(ev);
      else if (ev.type === "steam") steamPuff(ev);
    }
    render(now);
    renderTiles();
    calmFrames = isCalm(world) ? calmFrames + 1 : 0;
    if (calmFrames > 40 || (!world.bodies.length && !world.letters.length)) { running = false; return; }
    global.requestAnimationFrame(tick);
  }

  function start() {
    calmFrames = 0;
    if (running) return;
    running = true;
    lastT = performance.now();
    global.requestAnimationFrame(tick);
  }

  function originOf(from) {
    if (from && from.getBoundingClientRect) {
      var r = from.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return from;
  }

  // items: [{ kind, src? }]; each spawned body picks one at random, then companions (a dog's bone) join once.
  // With count === "each", every item spawns exactly once instead.
  function burst(from, items, count) {
    if (!items.length) return;
    ensureLayer();
    trailColor = global.getComputedStyle(layer).getPropertyValue("--trail").trim() || trailColor;
    var o = originOf(from);
    var now = performance.now();
    var picks = [];
    if (count === "each") picks = items.slice();
    else for (var p = 0; p < (count || 10); p++) picks.push(items[Math.floor(Math.random() * items.length)]);
    var extras = companionsNeeded(world, picks, now);
    for (var c = 0; c < extras.length; c++) picks.push(extras[c]);
    var n = picks.length;
    // Lean the fan toward the screen centre so a trigger near an edge doesn't pile everything against it.
    var tilt = Math.max(-0.5, Math.min(0.5, (world.width / 2 - o.x) / world.width)) * 0.9;
    for (var i = 0; i < n; i++) {
      var item = picks[i];
      if (item.kind === "dog" && Math.random() < 0.5) item = { kind: "dog", variant: "poodle" };
      var k = KINDS[item.kind] || KINDS.app;
      var size = Math.round(rand(k.size[0], k.size[1]) * sizeScale(world.width));
      var angle = rand(-Math.PI * 0.9, -Math.PI * 0.1) + tilt;
      var speed = rand(420, 950);
      var el = makeElement(item, size);
      layer.appendChild(el);
      var body = createBody({
        kind: item.kind,
        x: Math.min(Math.max(o.x + rand(-8, 8), size / 2), world.width - size / 2),
        y: Math.min(Math.max(o.y + rand(-8, 8), size / 2), world.height - size / 2),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: size,
        w: rand(-8, 8),
        delay: i * 0.035,
        phase: rand(0, Math.PI * 2),
        now: now,
        data: el
      });
      var evicted = add(world, body);
      for (var e = 0; e < evicted.length; e++) fadeOut(evicted[e]);
    }
    if (!expireTimer) expireTimer = setInterval(sweep, 250);
    start();
  }

  Drop.burst = burst;
  global.Drop = Drop;
})(typeof window !== "undefined" ? window : globalThis);
