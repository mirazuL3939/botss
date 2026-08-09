/* Плавающие кодерские команды: отлетают от курсора, плавно появляются и исчезают */
(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'fx-canvas';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * DPR;
    canvas.height = innerHeight * DPR;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
  }
  resize();
  addEventListener('resize', resize);

  const PRESETS = {
    code: [
    'sudo', '/ban', '/mute', 'git push', 'npm i', '</>', '{ }', '=>', '()=>{}',
    'if (aggro)', 'null', '0x1F', '/ci', '/s1', '/s2', '/warp', 'const', 'await',
    'async', '404', '200 OK', 'SELECT *', 'rm -rf', 'docker', 'JSON', ':::',
    '/kick', 'kill -9', 'ping', 'let', 'return', 'while(true)', 'sudo !!'
    ],
    moderation: [
      '/ban', '/mute', '/warn', '/kick', '/tempban', 'appeal', 'report', 'staff',
      'logs', 'chat', 'rule 1.2', 'rule 2.1', 'check', 'freeze', 'screenshare',
      'clean', 'verified', 'watchlist', 'evidence'
    ],
    minecraft: [
      'diamond', 'nether', 'ender', 'creeper', 'redstone', '/warp', '/spawn',
      'elytra', 'totem', 'obsidian', 'chunk', 'biome', 'xp', 'beacon', 'anvil',
      'portal', 'shulker', 'minecart'
    ],
    symbols: [
      '</>', '{ }', '[]', '::', '=>', '&&', '||', '++', '===', '!=', '#', '@',
      '*', '0xAF', 'λ', 'Σ', 'Δ', 'fn()', '...'
    ]
  };
  PRESETS.mixed = [...PRESETS.code, ...PRESETS.moderation, ...PRESETS.minecraft, ...PRESETS.symbols];
  const PALETTES = {
    mint: ['#c9d3df', '#aeb8c5', '#8793a2', '#e4e9ef', '#9aa5b3', '#707b89'],
    neon: ['#f1f5f9', '#d7dee8', '#aeb8c5', '#8893a2', '#cbd5e1', '#647080'],
    warm: ['#d6d1c4', '#b8b2a6', '#8f8a81', '#eee9dc', '#c8c0b3', '#767169'],
    ice: ['#e6edf5', '#cbd7e5', '#a9b8c9', '#f8fafc', '#94a3b8', '#748196']
  };

  const defaults = {
    enabled: true,
    preset: 'code',
    palette: 'mint',
    density: 46,
    size: 14,
    speed: 100,
    repel: true,
    glow: true
  };
  const settings = { ...defaults };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem('fx_settings') || '{}'));
  } catch (_) {}

  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || min));

  const mouse = { x: -9999, y: -9999 };
  const particles = [];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const words = () => PRESETS[settings.preset] || PRESETS.code;
  const colors = () => PALETTES[settings.palette] || PALETTES.mint;
  const saveSettings = () => localStorage.setItem('fx_settings', JSON.stringify(settings));

  function syncControls() {
    const map = {
      enabled: document.getElementById('fxEnabled'),
      preset: document.getElementById('fxPreset'),
      palette: document.getElementById('fxPalette'),
      density: document.getElementById('fxDensity'),
      size: document.getElementById('fxSize'),
      speed: document.getElementById('fxSpeed'),
      repel: document.getElementById('fxRepel'),
      glow: document.getElementById('fxGlow')
    };
    const name = document.getElementById('fxPresetName');
    if (!map.preset) return;
    map.enabled.checked = settings.enabled !== false;
    map.preset.value = settings.preset;
    map.palette.value = settings.palette;
    map.density.value = settings.density;
    map.size.value = settings.size;
    map.speed.value = settings.speed;
    map.repel.checked = settings.repel;
    map.glow.checked = settings.glow;
    if (name) name.textContent = settings.enabled === false ? 'off' : settings.preset;

    const setControlsState = () => {
      Object.entries(map).forEach(([key, el]) => {
        if (key !== 'enabled') el.disabled = settings.enabled === false;
      });
    };
    const apply = () => {
      settings.enabled = map.enabled.checked;
      settings.preset = map.preset.value;
      settings.palette = map.palette.value;
      settings.density = clamp(map.density.value, 10, 90);
      settings.size = clamp(map.size.value, 8, 24);
      settings.speed = clamp(map.speed.value, 50, 180);
      settings.repel = map.repel.checked;
      settings.glow = map.glow.checked;
      canvas.hidden = !settings.enabled;
      if (name) name.textContent = settings.enabled ? settings.preset : 'off';
      setControlsState();
      saveSettings();
      if (!settings.enabled) {
        particles.length = 0;
      } else {
        while (particles.length > settings.density) particles.shift();
        while (particles.length < Math.min(settings.density, 32)) spawn();
      }
    };
    setControlsState();
    Object.values(map).forEach(el => el.addEventListener('input', apply));
    Object.values(map).forEach(el => el.addEventListener('change', apply));
  }

  function spawn(x, y, burst) {
    if (!settings.enabled) return;
    if (particles.length >= settings.density) particles.shift();
    const angle = rand(0, Math.PI * 2);
    const speedMul = settings.speed / 100;
    const speed = (burst ? rand(1.6, 4.4) : rand(0.12, 0.5)) * speedMul;
    particles.push({
      x: x ?? rand(0, innerWidth),
      y: y ?? rand(0, innerHeight),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (burst ? rand(0.5, 1.6) : 0),
      text: pick(words()),
      color: pick(colors()),
      size: rand(settings.size * 0.75, settings.size * 1.12),
      rot: rand(-0.35, 0.35),
      vr: rand(-0.015, 0.015),
      life: 0,
      maxLife: rand(420, 780)
    });
  }

  // Стартовый фон из плавающих команд
  canvas.hidden = settings.enabled === false;
  for (let i = 0; settings.enabled !== false && i < Math.min(settings.density, 32); i++) spawn();

  let lastSpawn = 0;
  addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (!settings.enabled) return;
    const now = performance.now();
    if (now - lastSpawn > 110) { // изредка бросаем новую команду от курсора
      lastSpawn = now;
      spawn(e.clientX, e.clientY, true);
    }
  }, { passive: true });
  addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!settings.enabled) {
      particles.length = 0;
      requestAnimationFrame(tick);
      return;
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;

      // Отталкивание от курсора — команды "отпрыгивают"
      const repelR = 110 + settings.size * 3;
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (settings.repel && d2 < repelR * repelR && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const force = (1 - d / repelR) * 1.7;
        p.vx += (dx / d) * force;
        p.vy += (dy / d) * force;
        p.vr += rand(-0.012, 0.012);
      }

      // Лёгкая плавучесть + трение
      p.vy -= 0.002 * (settings.speed / 100);
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.vr *= 0.98;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      // Мягкий перенос за края экрана
      if (p.x < -50) p.x = innerWidth + 40;
      if (p.x > innerWidth + 50) p.x = -40;
      if (p.y < -50) p.y = innerHeight + 40;
      if (p.y > innerHeight + 50) p.y = -40;

      // Плавное появление и исчезновение
      const fadeIn = Math.min(1, p.life / 45);
      const fadeOut = Math.min(1, (p.maxLife - p.life) / 70);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.55;

      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        spawn();
        continue;
      }

      ctx.save();
      ctx.translate(p.x * DPR, p.y * DPR);
      ctx.rotate(p.rot);
      ctx.globalAlpha = alpha;
      ctx.font = `600 ${p.size * DPR}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = settings.glow ? 9 * DPR : 0;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    requestAnimationFrame(tick);
  }
  syncControls();
  tick();
})();
