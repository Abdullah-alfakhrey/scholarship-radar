const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");
const stageFrame = document.getElementById("stageFrame");
const card = document.getElementById("card");
const playButton = document.getElementById("playButton");
const demoButton = document.getElementById("demoButton");

const scoreValue = document.getElementById("scoreValue");
const comboValue = document.getElementById("comboValue");
const timeValue = document.getElementById("timeValue");
const bestValue = document.getElementById("bestValue");
const cardKicker = document.getElementById("cardKicker");
const cardTitle = document.getElementById("cardTitle");
const cardBody = document.getElementById("cardBody");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GAME_DURATION = 45;
const TARGET_RADIUS = 92;
const COLLECTIBLE_RADIUS = 28;
const HAZARD_RADIUS = 40;

const state = {
  mode: "attract",
  score: 0,
  combo: 0,
  best: Number(localStorage.getItem("jelly-drift-best") || 0),
  timeLeft: GAME_DURATION,
  time: 0,
  flash: 0,
  spawnClock: 0,
  hazardClock: 0,
  pointer: {
    x: WIDTH * 0.5,
    y: HEIGHT * 0.68,
    active: false,
  },
  jelly: createJelly(),
  collectibles: [],
  hazards: [],
  particles: [],
  ripples: [],
  bubbles: makeBubbles(48),
  ambientJellies: makeAmbientJellies(4),
};

updateHud();
setCardForAttractMode();
requestAnimationFrame(tick);

playButton.addEventListener("click", () => {
  startGame();
});

playButton.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

demoButton.addEventListener("click", () => {
  enterAttractMode();
});

demoButton.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

stageFrame.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".card")) {
    return;
  }

  updatePointer(event);

  if (state.mode !== "playing") {
    startGame();
  }

  state.pointer.active = true;
  stageFrame.setPointerCapture(event.pointerId);
});

stageFrame.addEventListener("pointermove", (event) => {
  updatePointer(event);
});

stageFrame.addEventListener("pointerup", (event) => {
  state.pointer.active = false;
  stageFrame.releasePointerCapture(event.pointerId);
});

stageFrame.addEventListener("pointerleave", () => {
  state.pointer.active = false;
});

function createJelly() {
  return {
    x: WIDTH * 0.5,
    y: HEIGHT * 0.68,
    vx: 0,
    vy: 0,
    radius: TARGET_RADIUS,
    tentacles: Array.from({ length: 11 }, (_, index) =>
      createTentacle(index, 14 + (index % 3))
    ),
  };
}

function createTentacle(index, segments) {
  const points = [];
  const startX = WIDTH * 0.5 + (index - 5) * 16;
  const startY = HEIGHT * 0.7;

  for (let i = 0; i < segments; i += 1) {
    points.push({
      x: startX,
      y: startY + i * 28,
    });
  }

  return {
    sway: Math.random() * Math.PI * 2,
    thickness: 3 + Math.random() * 3,
    points,
  };
}

function makeBubbles(count) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT,
    r: 6 + Math.random() * 16,
    speed: 40 + Math.random() * 90,
    drift: Math.random() * Math.PI * 2,
  }));
}

function makeAmbientJellies(count) {
  return Array.from({ length: count }, (_, index) => ({
    x: WIDTH * (0.14 + index * 0.22),
    y: HEIGHT * (0.14 + Math.random() * 0.35),
    scale: 0.45 + Math.random() * 0.4,
    speed: 12 + Math.random() * 12,
    phase: Math.random() * Math.PI * 2,
    hue: 185 + Math.random() * 45,
  }));
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  state.pointer.y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
}

function startGame() {
  state.mode = "playing";
  state.score = 0;
  state.combo = 0;
  state.timeLeft = GAME_DURATION;
  state.flash = 0;
  state.spawnClock = 0;
  state.hazardClock = 0;
  state.collectibles = [];
  state.hazards = [];
  state.particles = [];
  state.ripples = [];
  state.pointer.active = false;
  state.jelly = createJelly();
  card.classList.add("is-hidden");
  updateHud();
}

function enterAttractMode() {
  state.mode = "attract";
  state.score = 0;
  state.combo = 0;
  state.timeLeft = GAME_DURATION;
  state.flash = 0;
  state.spawnClock = 0;
  state.hazardClock = 0;
  state.pointer.active = false;
  state.collectibles = [];
  state.hazards = [];
  state.particles = [];
  state.ripples = [];
  state.jelly = createJelly();
  setCardForAttractMode();
  card.classList.remove("is-hidden");
  updateHud();
}

function endGame() {
  state.mode = "ended";
  state.best = Math.max(state.best, state.score);
  localStorage.setItem("jelly-drift-best", String(state.best));
  bestValue.textContent = `Best ${String(state.best).padStart(3, "0")}`;
  cardKicker.textContent = "Run Complete";
  cardTitle.textContent = `Final score ${String(state.score).padStart(3, "0")}`;
  cardBody.textContent =
    "Replay for another run, or leave it in demo drift mode when you want a clean social clip.";
  playButton.textContent = "Play Again";
  demoButton.textContent = "Back to Demo";
  card.classList.remove("is-hidden");
}

function setCardForAttractMode() {
  cardKicker.textContent = "Interactive Motion Piece";
  cardTitle.textContent = "Tap play and steer the jellyfish.";
  cardBody.textContent =
    "Move with touch or mouse. Catch glowing plankton for combo points before the 45-second run ends.";
  playButton.textContent = "Start Run";
  demoButton.textContent = "Demo Drift";
  bestValue.textContent = `Best ${String(state.best).padStart(3, "0")}`;
}

function tick(timestamp) {
  if (!state.lastTimestamp) {
    state.lastTimestamp = timestamp;
  }

  const delta = Math.min((timestamp - state.lastTimestamp) / 1000, 1 / 30);
  state.lastTimestamp = timestamp;
  state.time += delta;
  update(delta);
  render();
  requestAnimationFrame(tick);
}

function update(delta) {
  state.flash = Math.max(0, state.flash - delta * 2.2);

  updateAmbientJellies(delta);
  updateBubbles(delta);
  updateJelly(delta);
  updateCollectibles(delta);
  updateHazards(delta);
  updateParticles(delta);
  updateRipples(delta);

  if (state.mode === "playing") {
    state.timeLeft = Math.max(0, state.timeLeft - delta);
    state.spawnClock += delta;
    state.hazardClock += delta;

    if (state.spawnClock > 0.55) {
      spawnCollectible();
      state.spawnClock = 0;
    }

    if (state.hazardClock > 1.35) {
      spawnHazard();
      state.hazardClock = 0;
    }

    if (state.timeLeft === 0) {
      endGame();
    }
  } else if (Math.random() < 0.035) {
    spawnCollectible(true);
  }

  updateHud();
}

function updateAmbientJellies(delta) {
  for (const jelly of state.ambientJellies) {
    jelly.phase += delta * 1.4;
    jelly.y += delta * jelly.speed;
    jelly.x += Math.sin(state.time * 0.4 + jelly.phase) * delta * 12;

    if (jelly.y - 180 > HEIGHT) {
      jelly.y = -240;
      jelly.x = WIDTH * (0.1 + Math.random() * 0.8);
    }
  }
}

function updateBubbles(delta) {
  for (const bubble of state.bubbles) {
    bubble.y -= bubble.speed * delta;
    bubble.x += Math.sin(state.time + bubble.drift) * delta * 16;

    if (bubble.y < -40) {
      bubble.y = HEIGHT + 40;
      bubble.x = Math.random() * WIDTH;
    }
  }
}

function updateJelly(delta) {
  const jelly = state.jelly;
  const attractMode = state.mode !== "playing" || !state.pointer.active;
  const targetX = attractMode
    ? WIDTH * 0.5 + Math.sin(state.time * 0.9) * WIDTH * 0.19
    : state.pointer.x;
  const targetY = attractMode
    ? HEIGHT * 0.62 + Math.sin(state.time * 1.3 + 1.4) * 180
    : state.pointer.y;

  const dx = targetX - jelly.x;
  const dy = targetY - jelly.y;

  jelly.vx += dx * delta * 3.8;
  jelly.vy += dy * delta * 3.8;
  jelly.vx *= 0.92;
  jelly.vy *= 0.92;

  const speed = Math.hypot(jelly.vx, jelly.vy);
  const maxSpeed = state.mode === "playing" ? 24 : 14;

  if (speed > maxSpeed) {
    const ratio = maxSpeed / speed;
    jelly.vx *= ratio;
    jelly.vy *= ratio;
  }

  jelly.x = clamp(jelly.x + jelly.vx, TARGET_RADIUS + 50, WIDTH - TARGET_RADIUS - 50);
  jelly.y = clamp(jelly.y + jelly.vy, TARGET_RADIUS + 80, HEIGHT - 220);

  const pulse = state.time * 4.3 + speed * 0.15;
  const bellWidth = TARGET_RADIUS * (1.04 + Math.sin(pulse) * 0.06);
  const bellHeight = TARGET_RADIUS * (0.76 + Math.cos(pulse) * 0.05);

  jelly.bellWidth = bellWidth;
  jelly.bellHeight = bellHeight;
  jelly.rotation = Math.atan2(jelly.vx, 32) * 0.18;

  jelly.tentacles.forEach((tentacle, index) => {
    const anchorOffset = (index - (jelly.tentacles.length - 1) / 2) * (bellWidth * 0.18);
    const anchor = {
      x:
        jelly.x +
        anchorOffset * Math.cos(jelly.rotation) +
        Math.sin(state.time * 3 + index) * 4,
      y: jelly.y + bellHeight * 0.68 + Math.abs(anchorOffset) * 0.04,
    };

    tentacle.sway += delta * (1.8 + index * 0.04);
    let previous = anchor;

    tentacle.points.forEach((point, pointIndex) => {
      const idealDistance = 24 + pointIndex * 1.3;
      const sway =
        Math.sin(tentacle.sway + pointIndex * 0.42) * (8 + pointIndex * 1.25) +
        jelly.vx * 0.8;

      point.x += (previous.x + sway - point.x) * delta * (9 - pointIndex * 0.22);
      point.y += (previous.y + idealDistance - point.y) * delta * (7.8 - pointIndex * 0.16);
      previous = point;
    });
  });
}

function updateCollectibles(delta) {
  for (let index = state.collectibles.length - 1; index >= 0; index -= 1) {
    const item = state.collectibles[index];
    item.y += item.vy * delta;
    item.x += Math.sin(state.time * item.wobble + item.phase) * delta * item.drift;
    item.life += delta;

    if (
      item.y > HEIGHT + 120 ||
      item.x < -120 ||
      item.x > WIDTH + 120 ||
      item.life > item.maxLife
    ) {
      state.collectibles.splice(index, 1);
      continue;
    }

    if (distance(item.x, item.y, state.jelly.x, state.jelly.y) < TARGET_RADIUS + COLLECTIBLE_RADIUS) {
      state.collectibles.splice(index, 1);
      collectItem(item);
    }
  }
}

function updateHazards(delta) {
  for (let index = state.hazards.length - 1; index >= 0; index -= 1) {
    const hazard = state.hazards[index];
    hazard.y += hazard.vy * delta;
    hazard.x += Math.sin(state.time * hazard.wobble + hazard.phase) * delta * hazard.drift;
    hazard.spin += delta * hazard.spinSpeed;

    if (
      hazard.y > HEIGHT + 140 ||
      hazard.x < -140 ||
      hazard.x > WIDTH + 140
    ) {
      state.hazards.splice(index, 1);
      continue;
    }

    if (
      state.mode === "playing" &&
      distance(hazard.x, hazard.y, state.jelly.x, state.jelly.y) <
        TARGET_RADIUS + HAZARD_RADIUS
    ) {
      state.hazards.splice(index, 1);
      hitHazard(hazard);
    }
  }
}

function updateParticles(delta) {
  for (let index = state.particles.length - 1; index >= 0; index -= 1) {
    const particle = state.particles[index];
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vx *= 0.985;
    particle.vy *= 0.985;
    particle.life -= delta;

    if (particle.life <= 0) {
      state.particles.splice(index, 1);
    }
  }
}

function updateRipples(delta) {
  for (let index = state.ripples.length - 1; index >= 0; index -= 1) {
    const ripple = state.ripples[index];
    ripple.life -= delta;
    ripple.radius += ripple.growth * delta;

    if (ripple.life <= 0) {
      state.ripples.splice(index, 1);
    }
  }
}

function spawnCollectible(soft = false) {
  state.collectibles.push({
    x: WIDTH * (0.12 + Math.random() * 0.76),
    y: soft ? HEIGHT * (0.08 + Math.random() * 0.65) : -50,
    vy: soft ? 20 + Math.random() * 25 : 140 + Math.random() * 80,
    drift: 22 + Math.random() * 34,
    wobble: 1.4 + Math.random() * 1.7,
    phase: Math.random() * Math.PI * 2,
    life: 0,
    maxLife: 9 + Math.random() * 3,
    hue: 165 + Math.random() * 45,
  });
}

function spawnHazard() {
  state.hazards.push({
    x: WIDTH * (0.12 + Math.random() * 0.76),
    y: -90,
    vy: 170 + Math.random() * 120,
    drift: 30 + Math.random() * 28,
    wobble: 1.6 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
    spin: Math.random() * Math.PI * 2,
    spinSpeed: 0.8 + Math.random() * 1.6,
  });
}

function collectItem(item) {
  state.combo += 1;
  const comboBonus = Math.min(state.combo, 8);
  state.score += 10 + comboBonus * 4;
  state.ripples.push({
    x: item.x,
    y: item.y,
    radius: 30,
    growth: 180,
    life: 0.55,
    color: `hsla(${item.hue}, 100%, 80%, 0.58)`,
  });

  for (let i = 0; i < 14; i += 1) {
    const angle = (Math.PI * 2 * i) / 14;
    const speed = 90 + Math.random() * 180;
    state.particles.push({
      x: item.x,
      y: item.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.45 + Math.random() * 0.35,
      color: `hsla(${item.hue}, 100%, 78%, 0.92)`,
      radius: 4 + Math.random() * 5,
    });
  }
}

function hitHazard(hazard) {
  state.combo = 0;
  state.score = Math.max(0, state.score - 18);
  state.timeLeft = Math.max(0, state.timeLeft - 3.2);
  state.flash = 1;
  state.ripples.push({
    x: hazard.x,
    y: hazard.y,
    radius: 40,
    growth: 220,
    life: 0.5,
    color: "hsla(12, 100%, 70%, 0.4)",
  });

  for (let i = 0; i < 18; i += 1) {
    const angle = (Math.PI * 2 * i) / 18;
    const speed = 100 + Math.random() * 150;
    state.particles.push({
      x: hazard.x,
      y: hazard.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.38 + Math.random() * 0.26,
      color: "hsla(12, 100%, 68%, 0.92)",
      radius: 4 + Math.random() * 6,
    });
  }
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawAmbientJellies();
  drawBubbles();
  drawCollectibles();
  drawHazards();
  drawRipples();
  drawParticles();
  drawJelly(state.jelly, 1);
  drawForegroundGlow();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#06131d");
  gradient.addColorStop(0.5, "#092033");
  gradient.addColorStop(1, "#02070c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 5; i += 1) {
    const x = WIDTH * (0.15 + i * 0.18) + Math.sin(state.time * 0.4 + i) * 60;
    const beam = ctx.createLinearGradient(x, 0, x, HEIGHT);
    beam.addColorStop(0, "rgba(130, 226, 255, 0.13)");
    beam.addColorStop(0.4, "rgba(130, 226, 255, 0.03)");
    beam.addColorStop(1, "rgba(130, 226, 255, 0)");
    ctx.fillStyle = beam;
    ctx.fillRect(x - 48, 0, 96, HEIGHT);
  }

  ctx.save();
  ctx.strokeStyle = "rgba(162, 233, 255, 0.06)";
  ctx.lineWidth = 3;

  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();

    for (let x = -50; x <= WIDTH + 60; x += 30) {
      const y =
        180 +
        i * 220 +
        Math.sin(x * 0.008 + state.time * 0.7 + i) * 28 +
        Math.cos(x * 0.004 + state.time * 0.35 + i) * 18;

      if (x === -50) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  ctx.restore();
}

function drawAmbientJellies() {
  ctx.save();
  ctx.globalAlpha = 0.14;

  for (const jelly of state.ambientJellies) {
    drawJelly(
      {
        x: jelly.x,
        y: jelly.y,
        bellWidth: TARGET_RADIUS * 0.92 * jelly.scale * (1 + Math.sin(state.time * 2 + jelly.phase) * 0.08),
        bellHeight: TARGET_RADIUS * 0.7 * jelly.scale,
        rotation: Math.sin(state.time * 0.5 + jelly.phase) * 0.08,
        tentacles: Array.from({ length: 7 }, (_, index) => ({
          thickness: 2,
          points: Array.from({ length: 8 }, (_, pointIndex) => ({
            x: jelly.x + (index - 3) * 10 * jelly.scale + Math.sin(state.time * 2 + pointIndex + index) * 6,
            y: jelly.y + 24 * jelly.scale + pointIndex * 24 * jelly.scale,
          })),
        })),
      },
      jelly.scale,
      jelly.hue
    );
  }

  ctx.restore();
}

function drawBubbles() {
  ctx.save();
  ctx.strokeStyle = "rgba(208, 244, 255, 0.22)";
  ctx.fillStyle = "rgba(208, 244, 255, 0.05)";

  for (const bubble of state.bubbles) {
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawCollectibles() {
  for (const item of state.collectibles) {
    const glow = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, 60);
    glow.addColorStop(0, `hsla(${item.hue}, 100%, 82%, 0.9)`);
    glow.addColorStop(0.55, `hsla(${item.hue}, 100%, 68%, 0.24)`);
    glow.addColorStop(1, `hsla(${item.hue}, 100%, 60%, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(item.x - 60, item.y - 60, 120, 120);

    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(state.time * 1.8 + item.phase);
    ctx.fillStyle = `hsla(${item.hue}, 100%, 82%, 0.95)`;
    ctx.beginPath();

    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI * 2 * i) / 6;
      const radius = i % 2 === 0 ? 34 : 16;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawHazards() {
  for (const hazard of state.hazards) {
    ctx.save();
    ctx.translate(hazard.x, hazard.y);
    ctx.rotate(hazard.spin);

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
    glow.addColorStop(0, "rgba(255, 110, 90, 0.3)");
    glow.addColorStop(1, "rgba(255, 110, 90, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-80, -80, 160, 160);

    ctx.fillStyle = "#1e2937";
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 152, 125, 0.92)";
    ctx.lineWidth = 7;

    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 22, Math.sin(angle) * 22);
      ctx.lineTo(Math.cos(angle) * 56, Math.sin(angle) * 56);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawRipples() {
  ctx.save();
  ctx.lineWidth = 5;

  for (const ripple of state.ripples) {
    ctx.globalAlpha = Math.max(0, ripple.life * 1.2);
    ctx.strokeStyle = ripple.color;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = Math.min(1, particle.life * 1.7);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function drawJelly(jelly, scale = 1, hue = 188) {
  ctx.save();
  ctx.translate(jelly.x, jelly.y);
  ctx.rotate(jelly.rotation || 0);

  const bellWidth = jelly.bellWidth || TARGET_RADIUS * scale;
  const bellHeight = jelly.bellHeight || TARGET_RADIUS * 0.72 * scale;
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, bellWidth * 1.9);
  glow.addColorStop(0, `hsla(${hue}, 100%, 76%, 0.24)`);
  glow.addColorStop(0.45, `hsla(${hue}, 100%, 56%, 0.13)`);
  glow.addColorStop(1, `hsla(${hue}, 100%, 56%, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(-bellWidth * 2, -bellWidth * 2, bellWidth * 4, bellWidth * 4);
  ctx.restore();

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const tentacle of jelly.tentacles) {
    ctx.beginPath();
    const points = tentacle.points;
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i += 1) {
      const next = points[i + 1];
      const xc = (points[i].x + next.x) / 2;
      const yc = (points[i].y + next.y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }

    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.strokeStyle = `hsla(${hue}, 100%, 82%, 0.35)`;
    ctx.lineWidth = tentacle.thickness * scale;
    ctx.stroke();

    ctx.strokeStyle = `hsla(${hue + 20}, 100%, 94%, 0.14)`;
    ctx.lineWidth = Math.max(1.2, tentacle.thickness * scale * 0.42);
    ctx.stroke();
  }

  ctx.restore();
  ctx.save();
  ctx.translate(jelly.x, jelly.y);
  ctx.rotate(jelly.rotation || 0);

  ctx.fillStyle = `hsla(${hue}, 92%, 76%, 0.9)`;
  ctx.beginPath();
  ctx.moveTo(-bellWidth, 8);
  ctx.bezierCurveTo(-bellWidth * 0.86, -bellHeight * 1.14, bellWidth * 0.86, -bellHeight * 1.14, bellWidth, 8);
  ctx.bezierCurveTo(
    bellWidth * 0.76,
    bellHeight * 0.92,
    -bellWidth * 0.76,
    bellHeight * 0.92,
    -bellWidth,
    8
  );
  ctx.closePath();
  ctx.fill();

  const capGlow = ctx.createRadialGradient(0, -bellHeight * 0.35, 4, 0, 0, bellWidth * 1.1);
  capGlow.addColorStop(0, "rgba(255, 255, 255, 0.55)");
  capGlow.addColorStop(0.55, `hsla(${hue}, 100%, 80%, 0.18)`);
  capGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = capGlow;
  ctx.fillRect(-bellWidth * 1.2, -bellWidth * 1.2, bellWidth * 2.4, bellWidth * 2.4);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.46)";
  ctx.lineWidth = Math.max(2, 5 * scale);
  ctx.beginPath();
  ctx.moveTo(-bellWidth * 0.64, -bellHeight * 0.22);
  ctx.quadraticCurveTo(0, -bellHeight * 0.85, bellWidth * 0.54, -bellHeight * 0.16);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";

  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.ellipse(i * bellWidth * 0.18, bellHeight * 0.1, bellWidth * 0.12, bellHeight * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawForegroundGlow() {
  if (!state.flash) {
    return;
  }

  ctx.fillStyle = `rgba(255, 102, 81, ${state.flash * 0.18})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function updateHud() {
  scoreValue.textContent = String(state.score).padStart(3, "0");
  comboValue.textContent = `x${Math.max(1, state.combo)}`;
  timeValue.textContent = state.timeLeft.toFixed(1);
  bestValue.textContent = `Best ${String(state.best).padStart(3, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
