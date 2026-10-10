const test = require("node:test");
const assert = require("node:assert/strict");
const Drop = require("../assets/drop.js");

const W = 800;
const H = 600;
const FPS = 60;

function seeded(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function world() {
  return Drop.createWorld({ width: W, height: H, rand: seeded(1) });
}

function run(w, seconds, onFrame) {
  const frames = Math.round(seconds * FPS);
  for (let i = 0; i < frames; i++) {
    Drop.step(w, 1 / FPS);
    if (onFrame) onFrame(i);
  }
}

function drop(w, kind, opts) {
  const body = Drop.createBody(Object.assign({ kind: kind, x: W / 2, y: 100, size: 60, now: 0 }, opts));
  Drop.add(w, body);
  return body;
}

function firstReboundHeight(kind) {
  const w = world();
  const b = drop(w, kind, { y: 100 });
  let landed = false;
  let peak = Infinity;
  let prevVy = 0;
  // Bounces happen mid-frame, so detect the landing from the velocity flipping upward.
  run(w, 3, function () {
    if (!landed && prevVy > 0 && b.vy <= 0) landed = true;
    if (landed) peak = Math.min(peak, b.y);
    prevVy = b.vy;
  });
  return H - b.r - peak;
}

test("exposes every interest kind and the app kind", function () {
  for (const kind of ["app", "reading", "travel", "basketball", "sauna", "training", "dog", "bone"]) {
    assert.ok(Drop.KINDS[kind], kind + " is missing");
  }
});

test("interest icons collide by their glyph, tighter than their box", function () {
  const glyph = Drop.createBody({ kind: "dog", x: 0, y: 0, size: 100, now: 0 });
  const app = Drop.createBody({ kind: "app", x: 0, y: 0, size: 100, now: 0 });
  assert.ok(Math.abs(glyph.r - 42) < 1e-9);
  assert.ok(Math.abs(app.r - 58) < 1e-9);
});

test("a dropped body comes to rest on the floor", function () {
  const w = world();
  const b = drop(w, "app");
  run(w, 4);
  assert.ok(Math.abs(b.y + b.r - H) < 1, "rests at y=" + b.y);
  assert.ok(Math.abs(b.vy) < 25);
});

test("walls keep bodies inside the viewport", function () {
  const w = world();
  const b = drop(w, "app", { x: 50, vx: -3000 });
  run(w, 2, function () {
    assert.ok(b.x - b.r >= -0.001 && b.x + b.r <= W + 0.001, "x=" + b.x);
  });
});

test("stacked bodies do not stay overlapped", function () {
  const w = world();
  const a = drop(w, "app", { x: W / 2, y: 100 });
  const c = drop(w, "app", { x: W / 2 + 2, y: 30 });
  run(w, 4);
  const d = Math.hypot(a.x - c.x, a.y - c.y);
  assert.ok(d >= a.r + c.r - 1, "overlap: d=" + d);
});

test("a basketball rebounds higher than a book", function () {
  assert.ok(firstReboundHeight("basketball") > firstReboundHeight("reading") * 3);
});

test("a barbell barely bounces", function () {
  assert.ok(firstReboundHeight("training") < 5);
});

test("an airplane falls slower than an app icon", function () {
  const w = world();
  const plane = drop(w, "travel", { x: 150 });
  const app = drop(w, "app", { x: 650 });
  run(w, 0.4);
  assert.ok(plane.y - 100 < (app.y - 100) / 2);
});

test("an airplane flying left never spins around the -180/180 seam", function () {
  // Weak gravity makes vy cross zero while flying left, i.e. atan2 flips between +PI and -PI.
  const w = Drop.createWorld({ width: W, height: H, rand: seeded(1), gravity: 300 });
  const plane = drop(w, "travel", { x: 700, y: 300, vx: -600, vy: -20 });
  run(w, 0.15);
  let maxStep = 0;
  let prev = plane.a;
  run(w, 0.6, function () {
    maxStep = Math.max(maxStep, Math.abs(plane.a - prev));
    prev = plane.a;
  });
  assert.ok(maxStep < 0.3, "turned " + maxStep + " rad in one frame");
});

test("a book spills letters once, on the landing right after it spawns", function () {
  const w = world();
  const book = drop(w, "reading", { x: 300 });
  drop(w, "app", { x: 600 });
  assert.equal(book.open, false);
  run(w, 1.5);
  const spills = Drop.drainEvents(w);
  assert.deepEqual(spills.map(function (e) { return e.type; }), ["spill"]);
  assert.equal(spills[0].body, book);
  assert.equal(book.open, true);
  run(w, Drop.LETTER_LIFE + 1);
  Drop.grab(book);
  book.y = 80;
  Drop.release(book, 0);
  run(w, 3);
  assert.deepEqual(Drop.drainEvents(w), []);
  assert.equal(w.letters.length, 0);
});

test("spilled letter tiles pour out and settle on the floor", function () {
  const w = world();
  drop(w, "reading", { x: 400 });
  run(w, 0.9);
  assert.equal(w.letters.length, 5);
  run(w, 1.5);
  // Resting on the floor or wedged on two tiles below are both fine; hanging in mid-air is not.
  for (const l of w.letters) assert.ok(l.asleep && l.y + l.r > H - 3 * l.r, "letter not resting at y=" + l.y);
  assert.equal(Drop.isCalm(w), false, "letters keep the world awake until they fade");
});

test("settled letter tiles stay perfectly still, even piled up", function () {
  const w = world();
  for (let i = 0; i < 4; i++) drop(w, "reading", { x: 340 + i * 40, y: 100 + i * 30 });
  run(w, 2.4);
  assert.ok(w.letters.length >= 15);
  const before = w.letters.map(function (l) { return [l.x, l.y, l.a]; });
  run(w, 0.8);
  w.letters.forEach(function (l, i) {
    const moved = Math.hypot(l.x - before[i][0], l.y - before[i][1]);
    assert.ok(moved < 0.01 && Math.abs(l.a - before[i][2]) < 0.001, "tile " + i + " drifted " + moved);
  });
});

test("a resting tile wakes up when an icon lands on it", function () {
  const w = world();
  const tile = Drop.addLetter(w, { x: 400, y: H - 10 });
  run(w, 1);
  drop(w, "app", { x: 400, y: 100 });
  const x0 = tile.x;
  run(w, 1.5);
  assert.ok(Math.abs(tile.x - x0) > 5, "tile should be shoved aside");
});

test("a resting tile falls again when the icons under it disappear", function () {
  const w = world();
  // Tiles slide off a single round icon, so they come to rest wedged in the valley between two.
  const left = drop(w, "app", { x: 360, y: H - 40, size: 70 });
  const right = drop(w, "app", { x: 440, y: H - 40, size: 70 });
  run(w, 1);
  const tile = Drop.addLetter(w, { x: (left.x + right.x) / 2, y: H - 160 });
  run(w, 1.5);
  assert.ok(tile.asleep && tile.y + tile.r < H - 20, "tile should be resting between the icons");
  w.bodies.length = 0;
  run(w, 1);
  assert.ok(Math.abs(tile.y + tile.r - H) < 2, "tile hangs in the air at y=" + tile.y);
});

test("a resting tile falls again when the tile under it fades", function () {
  const w = world();
  const lower = Drop.addLetter(w, { x: 400, y: H - 10 });
  run(w, 1);
  const upper = Drop.addLetter(w, { x: 401, y: H - 60 });
  run(w, 1);
  assert.ok(upper.y < lower.y - lower.r, "upper tile should sit on the lower one");
  w.letters.splice(w.letters.indexOf(lower), 1);
  run(w, 1);
  assert.ok(Math.abs(upper.y + upper.r - H) < 2, "tile hangs in the air at y=" + upper.y);
});

test("letter tiles bounce off icons without pushing them", function () {
  const w = world();
  const app = drop(w, "app", { x: 400, y: H - 40, size: 70 });
  run(w, 1);
  const x0 = app.x, y0 = app.y;
  const tile = Drop.addLetter(w, { x: 400, y: 200, vx: 0, vy: 0 });
  run(w, 1.5, function () {
    const d = Math.hypot(tile.x - app.x, tile.y - app.y);
    assert.ok(d >= app.r + tile.r - 2, "tile sank into the icon: d=" + d);
  });
  assert.ok(Math.abs(app.x - x0) < 0.5 && Math.abs(app.y - y0) < 0.5, "the icon was pushed");
});

test("letter tiles fade out after their life", function () {
  const w = world();
  drop(w, "reading", { x: 400 });
  run(w, 1);
  assert.ok(w.letters.length > 0);
  const tiles = w.letters.slice();
  run(w, Drop.LETTER_LIFE + 0.5);
  assert.equal(w.letters.length, 0);
  for (const t of tiles) assert.equal(t.dead, true);
});

test("a flying airplane leaves a contrail from its tail", function () {
  const w = world();
  const plane = drop(w, "travel", { x: 100, vx: 600 });
  run(w, 0.3);
  assert.ok(plane.trail.length >= 5, "points=" + plane.trail.length);
  const last = plane.trail[plane.trail.length - 1];
  assert.ok(last.x < plane.x, "the newest point sits behind the plane");
});

test("a contrail fades away after the plane lands and keeps the world awake until then", function () {
  const w = world();
  const plane = drop(w, "travel", { x: 100, y: H - 60, vx: 300 });
  run(w, 3);
  assert.equal(plane.trail.length, 0);
  assert.equal(Drop.isCalm(w), true);
});

test("only airplanes leave contrails", function () {
  const w = world();
  const app = drop(w, "app", { vx: 600 });
  run(w, 0.3);
  assert.equal(app.trail.length, 0);
});

test("an airplane points where it is flying", function () {
  const w = world();
  const plane = drop(w, "travel", { x: 100, vx: 600 });
  run(w, 0.2);
  const heading = Math.atan2(plane.vy, plane.vx) + Math.PI / 4;
  assert.ok(Math.abs(plane.a - heading) < 0.2, "a=" + plane.a + " heading=" + heading);
});

test("a landing barbell knocks nearby bodies into the air", function () {
  const w = world();
  const app = drop(w, "app", { x: 520, y: H - 30 });
  run(w, 1);
  drop(w, "training", { x: 400, y: 80 });
  let launched = false;
  run(w, 3, function () {
    if (app.vy < -200) launched = true;
  });
  assert.ok(launched);
});

test("a barbell landing on a packed pile still blasts the pile apart", function () {
  const w = world();
  const pile = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      pile.push(drop(w, "app", { x: 220 + col * 52 + (row % 2) * 26, y: H - 30 - row * 50, size: 50 }));
    }
  }
  run(w, 2);
  const barbell = drop(w, "training", { x: 400, y: 60, size: 80 });
  const launched = new Set();
  run(w, 3, function () {
    for (const b of pile) if (b.vy < -400) launched.add(b);
  });
  const near = pile.filter(function (b) { return Math.abs(b.x - barbell.x) < 200; });
  const hit = near.filter(function (b) { return launched.has(b); });
  assert.ok(hit.length >= near.length * 0.7, hit.length + "/" + near.length + " launched");
});

test("a quake launches bodies in inverse proportion to their mass", function () {
  const w = world();
  const app = drop(w, "app", { x: 250, y: H - 40, size: 60 });
  const heavy = drop(w, "training", { x: 550, y: H - 40, size: 60 });
  // The bystander biceps flexes too; let that finish and everything land before measuring.
  run(w, 4);
  const appRest = app.y;
  const heavyRest = heavy.y;
  let appPeak = appRest;
  let heavyPeak = heavyRest;
  drop(w, "training", { x: 400, y: 60, size: 80 });
  run(w, 3, function () {
    appPeak = Math.min(appPeak, app.y);
    heavyPeak = Math.min(heavyPeak, heavy.y);
  });
  const appRise = appRest - appPeak;
  const heavyRise = heavyRest - heavyPeak;
  assert.ok(appRise > 80, "app rose " + appRise);
  assert.ok(heavyRise < appRise / 4, "barbell rose " + heavyRise + " vs app " + appRise);
});

test("a barbell only quakes on the landing right after it spawns", function () {
  const w = world();
  const barbell = drop(w, "training", { x: 400, y: 80 });
  run(w, 2);
  const app = drop(w, "app", { x: 520, y: H - 30 });
  run(w, 1);
  Drop.grab(barbell);
  barbell.y = 80;
  Drop.release(barbell, 0);
  let launched = false;
  run(w, 2, function () {
    if (app.vy < -200) launched = true;
  });
  assert.equal(launched, false);
});

test("barbells don't keep launching each other forever", function () {
  const w = world();
  for (let i = 0; i < 6; i++) drop(w, "training", { x: 250 + i * 60, y: 80 + (i % 2) * 120 });
  run(w, 5);
  assert.equal(Drop.isCalm(w), true);
});

test("a freshly spawned body can't be grabbed so taps reach the trigger beneath it", function () {
  const b = Drop.createBody({ kind: "app", x: 0, y: 0, size: 40, now: 1000, delay: 0.1 });
  assert.equal(Drop.isGrabbable(b, 1000), false);
  assert.equal(Drop.isGrabbable(b, 1100 + Drop.GRAB_DELAY - 1), false);
  assert.equal(Drop.isGrabbable(b, 1100 + Drop.GRAB_DELAY), true);
});

test("a sauna-goer sits on the floor and keeps puffing steam above its head", function () {
  const w = world();
  const sauna = drop(w, "sauna");
  run(w, 1);
  Drop.drainEvents(w);
  const puffs = [];
  run(w, 3, function () {
    for (const e of Drop.drainEvents(w)) if (e.type === "steam") puffs.push(e);
  });
  assert.ok(Math.abs(sauna.y + sauna.r - H) < 1, "sits at y=" + sauna.y);
  assert.ok(puffs.length >= 4, "puffs=" + puffs.length);
  for (const e of puffs) assert.ok(e.y < sauna.y, "steam rises from above the head");
  assert.equal(Drop.isCalm(w), false);
});

test("a heavier body pushes a lighter one more than it gets pushed", function () {
  const w = Drop.createWorld({ width: W, height: H, rand: seeded(1), gravity: 0 });
  const heavy = drop(w, "training", { x: 300, y: 300 });
  const light = drop(w, "app", { x: 340, y: 300 });
  run(w, 0.05);
  assert.ok(light.x - 340 > 300 - heavy.x);
});

test("a landed dog trots along the floor and faces where it runs", function () {
  const w = world();
  const dog = drop(w, "dog");
  run(w, 1);
  const x0 = dog.x;
  let farthest = 0;
  let facedRun = 0;
  let frames = 0;
  run(w, 3, function () {
    farthest = Math.max(farthest, Math.abs(dog.x - x0));
    if (Math.abs(dog.vx) > 40) {
      frames++;
      if (Math.sign(dog.vx) === dog.facing) facedRun++;
    }
  });
  assert.ok(farthest > 150, "moved " + farthest);
  assert.ok(facedRun >= frames * 0.9, facedRun + "/" + frames + " frames faced the run");
});

test("dogs run to a bone", function () {
  const w = world();
  const dog = drop(w, "dog", { x: 120, y: H - 40 });
  const bone = drop(w, "bone", { x: 680, y: H - 30, size: 50 });
  run(w, 4);
  assert.ok(Math.abs(dog.x - bone.x) < 120, "dog at " + dog.x + ", bone at " + bone.x);
});

test("a dog hops over a heavy icon between it and the bone", function () {
  const w = world();
  const wall = drop(w, "training", { x: 400, y: H - 40, size: 70 });
  run(w, 3);
  const dog = drop(w, "dog", { x: 120, y: H - 40 });
  drop(w, "bone", { x: 720, y: H - 30, size: 50 });
  let crossed = false;
  run(w, 5, function () {
    if (dog.x > wall.x + wall.r) crossed = true;
  });
  assert.ok(crossed, "dog stuck at " + dog.x + ", obstacle at " + wall.x);
});

test("dropping dogs brings along a bone only when none is on screen", function () {
  const w = world();
  assert.deepEqual(Drop.companionsNeeded(w, [{ kind: "dog" }, { kind: "dog" }, { kind: "app" }], 0), [{ kind: "bone" }]);
  assert.deepEqual(Drop.companionsNeeded(w, [{ kind: "app" }, { kind: "travel" }], 0), []);
  const bone = drop(w, "bone", { now: 0 });
  assert.deepEqual(Drop.companionsNeeded(w, [{ kind: "dog" }], 4000), []);
  assert.equal(bone.expires, 4000 + Drop.LIFETIME, "the existing bone stays for the new dogs");
});

test("a biceps flexes three times after landing, each flex stronger", function () {
  const w = world();
  drop(w, "training", { x: 400, y: 80 });
  const flexes = [];
  run(w, 3.5, function () {
    for (const e of Drop.drainEvents(w)) if (e.type === "flex") flexes.push(e);
  });
  assert.equal(flexes.length, 3);
  assert.ok(flexes[0].power < flexes[1].power && flexes[1].power < flexes[2].power);
  assert.ok(flexes[1].t - flexes[0].t >= 0.4 && flexes[2].t - flexes[1].t >= 0.4, "flexes should be spaced out to read");
});

test("a biceps only starts flexing once it has come to rest, not when bumped mid-air", function () {
  const w = world();
  drop(w, "training", { x: 400, y: 120 });
  drop(w, "training", { x: 405, y: 40, vy: 700 });
  const first = new Map();
  let count = 0;
  run(w, 4, function () {
    for (const e of Drop.drainEvents(w)) {
      if (e.type !== "flex") continue;
      count++;
      if (!first.has(e.body)) first.set(e.body, { speed: Math.hypot(e.body.vx, e.body.vy), grounded: e.body.grounded });
    }
  });
  assert.equal(count, 6);
  assert.equal(first.size, 2);
  for (const f of first.values()) assert.ok(f.grounded && f.speed < 80, JSON.stringify(f));
});

test("a flex swells clearly and settles back", function () {
  assert.equal(Drop.flexScale(0, 1), 1);
  assert.ok(Drop.flexScale(0.15, 1) > 1.45, "peak " + Drop.flexScale(0.15, 1));
  assert.ok(Drop.flexScale(0.15, 0.25) < Drop.flexScale(0.15, 1), "the last flex swells the most");
  assert.equal(Drop.flexScale(0.7, 1), 1);
});

test("the first flexes only nudge neighbours and the last one launches them", function () {
  const w = world();
  const app = drop(w, "app", { x: 520, y: H - 30 });
  run(w, 1);
  drop(w, "training", { x: 400, y: 80 });
  let flexes = 0;
  let beforeLast = 0;
  let afterLast = 0;
  run(w, 3.5, function () {
    for (const e of Drop.drainEvents(w)) if (e.type === "flex") flexes++;
    if (flexes < 3) beforeLast = Math.min(beforeLast, app.vy);
    else afterLast = Math.min(afterLast, app.vy);
  });
  assert.ok(beforeLast > -800, "early flexes launched at " + beforeLast);
  assert.ok(afterLast < -1000, "last flex only reached " + afterLast);
});

test("only dogs and steam keep the world awake once things settle", function () {
  const w = world();
  drop(w, "app");
  run(w, 4);
  assert.equal(Drop.isCalm(w), true);
  drop(w, "dog", { x: 100 });
  run(w, 3);
  assert.equal(Drop.isCalm(w), false);
});

test("the oldest bodies are evicted beyond MAX_BODIES", function () {
  const w = world();
  const first = drop(w, "app");
  let evicted = [];
  for (let i = 0; i < Drop.MAX_BODIES; i++) {
    evicted = evicted.concat(Drop.add(w, Drop.createBody({ kind: "app", x: 100, y: 100, size: 40, now: 0 })));
  }
  assert.equal(w.bodies.length, Drop.MAX_BODIES);
  assert.deepEqual(evicted, [first]);
});

test("bodies expire after LIFETIME unless they are held", function () {
  const w = world();
  const held = drop(w, "app", { now: 0 });
  const loose = drop(w, "app", { now: 0, x: 100 });
  Drop.grab(held);
  assert.deepEqual(Drop.expire(w, Drop.LIFETIME - 1), []);
  assert.deepEqual(Drop.expire(w, Drop.LIFETIME), [loose]);
  assert.deepEqual(w.bodies, [held]);
});

test("a held body ignores gravity", function () {
  const w = world();
  const b = drop(w, "app", { y: 200 });
  Drop.grab(b);
  run(w, 1);
  assert.equal(b.y, 200);
});

test("releasing caps the throw speed and restarts the lifetime", function () {
  const w = world();
  const b = drop(w, "app", { now: 0 });
  Drop.grab(b);
  b.vx = 6000;
  b.vy = 8000;
  Drop.release(b, 5000);
  assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - Drop.MAX_THROW) < 1e-6);
  assert.equal(b.expires, 5000 + Drop.LIFETIME);
});
