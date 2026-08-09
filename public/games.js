/* Мини-игры: змейка, сапёр, динозаврик. Без зависимостей. */
window.MiniGames = (() => {
  const stage = document.getElementById('gameStage');
  const info = document.getElementById('gameInfo');
  const hint = document.getElementById('gameHint');
  const tabs = document.getElementById('gameTabs');
  const btnRestart = document.getElementById('gameRestart');

  let current = null;
  let currentName = 'snake';

  const setInfo = (t) => { info.textContent = t; };
  const setHint = (t) => { hint.textContent = t; };
  const isTyping = (e) => /input|textarea/i.test(e.target.tagName || '');

  /* ════════════ Змейка ════════════ */
  function createSnake() {
    const N = 20, CELL = 20;
    const canvas = document.createElement('canvas');
    canvas.width = N * CELL;
    canvas.height = N * CELL;
    stage.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let snake, dir, nextDir, food, score, dead, speed, timer = null;
    let best = Number(localStorage.getItem('mg_snake_best') || 0);

    function placeFood() {
      do {
        food = { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 };
      } while (snake.some(s => s.x === food.x && s.y === food.y));
    }
    function restartTimer() {
      clearInterval(timer);
      timer = setInterval(step, speed);
    }
    function reset() {
      snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
      dir = { x: 1, y: 0 };
      nextDir = dir;
      score = 0;
      dead = false;
      speed = 140;
      placeFood();
      setInfo(`Счёт: 0 · Рекорд: ${best}`);
      restartTimer();
      draw();
    }
    function step() {
      if (dead) return;
      dir = nextDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N ||
          snake.some(s => s.x === head.x && s.y === head.y)) {
        dead = true;
        if (score > best) { best = score; localStorage.setItem('mg_snake_best', String(best)); }
        setInfo(`Игра окончена · Счёт: ${score} · Рекорд: ${best}`);
        draw();
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score++;
        speed = Math.max(70, speed - 3);
        restartTimer();
        placeFood();
        setInfo(`Счёт: ${score} · Рекорд: ${Math.max(best, score)}`);
      } else {
        snake.pop();
      }
      draw();
    }
    function draw() {
      ctx.fillStyle = '#070a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(31,42,56,0.45)';
      ctx.lineWidth = 1;
      for (let i = 1; i < N; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL + .5, 0); ctx.lineTo(i * CELL + .5, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * CELL + .5); ctx.lineTo(canvas.width, i * CELL + .5); ctx.stroke();
      }
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 3, 0, Math.PI * 2);
      ctx.fill();
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#d7dee8' : '#9aa5b3';
        ctx.fillRect(s.x * CELL + 1.5, s.y * CELL + 1.5, CELL - 3, CELL - 3);
      });
      if (dead) overlay('Игра окончена', 'Space или клик — заново');
    }
    function overlay(title, sub) {
      ctx.fillStyle = 'rgba(7,10,15,0.72)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e5edf5';
      ctx.font = '700 20px sans-serif';
      ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillStyle = '#7c8ea1';
      ctx.font = '13px sans-serif';
      ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + 16);
    }
    function onKey(e) {
      if (isTyping(e)) return;
      if (e.key === ' ' && dead) { e.preventDefault(); reset(); return; }
      const dirs = {
        ArrowUp: [0, -1], w: [0, -1], 'ц': [0, -1],
        ArrowDown: [0, 1], s: [0, 1], 'ы': [0, 1],
        ArrowLeft: [-1, 0], a: [-1, 0], 'ф': [-1, 0],
        ArrowRight: [1, 0], d: [1, 0], 'в': [1, 0]
      };
      const nd = dirs[e.key] || dirs[e.key.toLowerCase()];
      if (!nd) return;
      e.preventDefault();
      if (nd[0] === -dir.x && nd[1] === -dir.y) return;
      nextDir = { x: nd[0], y: nd[1] };
    }
    function onClick() { if (dead) reset(); }

    addEventListener('keydown', onKey);
    canvas.addEventListener('click', onClick);
    setHint('Стрелки / WASD — движение · Space — заново после проигрыша');
    reset();
    return {
      destroy() {
        clearInterval(timer);
        removeEventListener('keydown', onKey);
        canvas.remove();
      }
    };
  }

  /* ════════════ Сапёр ════════════ */
  function createMines() {
    const levels = {
      easy: { n: 9, mines: 10, label: 'Лёгкий' },
      normal: { n: 12, mines: 22, label: 'Нормальный' },
      hard: { n: 16, mines: 45, label: 'Сложный' }
    };
    let levelName = localStorage.getItem('mg_mines_level') || 'easy';
    if (!levels[levelName]) levelName = 'easy';

    const shell = document.createElement('div');
    shell.className = 'game-shell';
    const options = document.createElement('div');
    options.className = 'game-options';
    options.innerHTML = `
      <label><span>Сложность</span><select id="minesLevel">
        <option value="easy">Лёгкий 9x9</option>
        <option value="normal">Нормальный 12x12</option>
        <option value="hard">Сложный 16x16</option>
      </select></label>
    `;
    const grid = document.createElement('div');
    grid.className = 'ms-grid';
    shell.append(options, grid);
    stage.appendChild(shell);
    const levelSelect = options.querySelector('#minesLevel');
    levelSelect.value = levelName;

    let N, MINES, cells, started, over, flags, opened, bestKey;

    function reset() {
      const level = levels[levelName];
      N = level.n;
      MINES = level.mines;
      bestKey = `mg_mines_best_${levelName}`;
      cells = Array.from({ length: N * N }, () => ({ mine: false, open: false, flag: false, count: 0 }));
      started = false;
      over = false;
      flags = 0;
      opened = 0;
      grid.style.gridTemplateColumns = `repeat(${N}, minmax(24px, 32px))`;
      setInfo(`${level.label} · Мины: ${MINES} · Флаги: 0 · Побед: ${localStorage.getItem(bestKey) || 0}`);
      render();
    }
    function neighbors(i) {
      const x = i % N, y = (i / N) | 0, out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < N && ny < N) out.push(ny * N + nx);
      }
      return out;
    }
    function plant(safeIdx) {
      const safe = new Set([safeIdx, ...neighbors(safeIdx)]);
      let placed = 0;
      while (placed < MINES) {
        const i = (Math.random() * N * N) | 0;
        if (safe.has(i) || cells[i].mine) continue;
        cells[i].mine = true;
        placed++;
      }
      for (let i = 0; i < N * N; i++) {
        cells[i].count = neighbors(i).filter(j => cells[j].mine).length;
      }
    }
    function revealAll() {
      cells.forEach(c => { if (c.mine) c.open = true; });
    }
    function win() {
      over = true;
      cells.forEach(c => { if (c.mine) c.flag = true; });
      flags = MINES;
      const safeCount = N * N - MINES;
      const wins = Number(localStorage.getItem(bestKey) || 0) + 1;
      localStorage.setItem(bestKey, String(wins));
      setInfo(`Победа! Открыто: ${safeCount}/${safeCount} · Флаги: ${flags} · Побед: ${wins}`);
    }
    function open(i) {
      const c = cells[i];
      if (c.open || c.flag || over) return;
      c.open = true;
      opened++;
      if (c.mine) {
        over = true;
        revealAll();
        setInfo(`Поражение · Мины: ${MINES} · ↻ — заново`);
        render();
        return;
      }
      if (c.count === 0) neighbors(i).forEach(open);
      if (opened === N * N - MINES) {
        win();
      } else {
        setInfo(`Мины: ${MINES} · Флаги: ${flags} · Открыто: ${opened}/${N * N - MINES}`);
      }
      render();
    }
    function toggleFlag(i) {
      const c = cells[i];
      if (c.open || over) return;
      c.flag = !c.flag;
      flags += c.flag ? 1 : -1;
      setInfo(`Мины: ${MINES} · Флаги: ${flags} · Открыто: ${opened}/${N * N - MINES}`);
      render();
    }
    function render() {
      grid.innerHTML = '';
      cells.forEach((c, i) => {
        const d = document.createElement('div');
        d.className = 'ms-cell';
        if (c.open) {
          d.classList.add('open');
          if (c.mine) { d.classList.add('mine'); d.textContent = '💣'; }
          else if (c.count) { d.classList.add('n' + c.count); d.textContent = c.count; }
        } else if (c.flag) {
          d.classList.add('flag');
          d.textContent = '🚩';
        }
        d.addEventListener('click', () => {
          if (!started) { started = true; plant(i); }
          open(i);
        });
        d.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleFlag(i); });
        grid.appendChild(d);
      });
    }
    levelSelect.addEventListener('change', () => {
      levelName = levelSelect.value;
      localStorage.setItem('mg_mines_level', levelName);
      reset();
    });
    grid.addEventListener('contextmenu', (e) => e.preventDefault());

    setHint('ЛКМ — открыть клетку · ПКМ — флаг · первый клик и соседние клетки безопасны');
    reset();
    return { destroy() { shell.remove(); } };
  }

  /* ════════════ Динозаврик ════════════ */
  function createDino() {
    const W = 720, H = 200, GROUND = H - 34;
    const themes = {
      classic: { label: 'Классика', sky: '#05070a', ground: '#566170', dino: '#d7dee8', obstacle: '#9aa5b3', bird: '#c9d3df' },
      desert: { label: 'Графит', sky: '#070708', ground: '#5f5a52', dino: '#d6d1c4', obstacle: '#8f8a81', bird: '#c8c0b3' },
      neon: { label: 'Серый неон', sky: '#05060a', ground: '#aeb8c5', dino: '#f1f5f9', obstacle: '#8893a2', bird: '#cbd5e1' }
    };
    let themeName = localStorage.getItem('mg_dino_theme') || 'classic';
    let obstacleMode = localStorage.getItem('mg_dino_obstacles') || 'mixed';
    let difficulty = localStorage.getItem('mg_dino_difficulty') || 'normal';
    if (!themes[themeName]) themeName = 'classic';

    const shell = document.createElement('div');
    shell.className = 'game-shell';
    const options = document.createElement('div');
    options.className = 'game-options';
    options.innerHTML = `
      <label><span>Стиль</span><select id="dinoTheme">
        <option value="classic">Классика</option>
        <option value="desert">Графит</option>
        <option value="neon">Серый неон</option>
      </select></label>
      <label><span>Объекты</span><select id="dinoObstacles">
        <option value="mixed">Смешанные</option>
        <option value="cactus">Только кактусы</option>
        <option value="birds">Летающие</option>
        <option value="blocks">Блоки</option>
      </select></label>
      <label><span>Темп</span><select id="dinoDifficulty">
        <option value="calm">Спокойный</option>
        <option value="normal">Обычный</option>
        <option value="fast">Быстрый</option>
      </select></label>
    `;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    shell.append(options, canvas);
    stage.appendChild(shell);
    const ctx = canvas.getContext('2d');
    const themeSelect = options.querySelector('#dinoTheme');
    const obstacleSelect = options.querySelector('#dinoObstacles');
    const difficultySelect = options.querySelector('#dinoDifficulty');
    themeSelect.value = themeName;
    obstacleSelect.value = obstacleMode;
    difficultySelect.value = difficulty;

    let dino, obs, clouds, speed, score, dead, spawnIn, frame, shown;
    let best = Number(localStorage.getItem('mg_dino_best') || 0);
    let raf = null, last = 0;

    function reset() {
      dino = { x: 46, y: GROUND, w: 26, h: 34, vy: 0, grounded: true };
      obs = [];
      clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 160 + Math.random() * 80, y: 24 + Math.random() * 42, s: 0.35 + Math.random() * 0.5 }));
      speed = difficulty === 'fast' ? 6.2 : difficulty === 'calm' ? 4.2 : 5;
      score = 0;
      dead = false;
      spawnIn = 46;
      frame = 0;
      shown = -1;
      setInfo(`Счёт: 0 · Рекорд: ${best}`);
    }
    function jump() {
      if (dead) { reset(); return; }
      if (dino.grounded) { dino.vy = -11.5; dino.grounded = false; }
    }
    function makeObstacle() {
      const variants = obstacleMode === 'mixed' ? ['cactus', 'bird', 'block'] :
        obstacleMode === 'birds' ? ['bird'] :
        obstacleMode === 'blocks' ? ['block'] : ['cactus'];
      const type = variants[(Math.random() * variants.length) | 0];
      if (type === 'bird') {
        const high = Math.random() > 0.45;
        return { type, x: W + 28, y: high ? GROUND - 70 : GROUND - 42, w: 30, h: 18, flap: Math.random() * 10 };
      }
      if (type === 'block') return { type, x: W + 24, w: 18 + Math.random() * 18, h: 18 + Math.random() * 18 };
      return { type, x: W + 24, w: 14 + Math.random() * 12, h: 24 + Math.random() * 24 };
    }
    function update(dt) {
      frame++;
      score += speed * dt * 0.1;
      const cap = difficulty === 'fast' ? 15 : difficulty === 'calm' ? 10.5 : 13;
      speed = Math.min(cap, speed + 0.0035 * dt);

      dino.vy += 0.62 * dt;
      dino.y += dino.vy * dt;
      if (dino.y >= GROUND) { dino.y = GROUND; dino.vy = 0; dino.grounded = true; }

      spawnIn -= dt;
      if (spawnIn <= 0) {
        obs.push(makeObstacle());
        const spread = difficulty === 'fast' ? 48 : difficulty === 'calm' ? 76 : 60;
        spawnIn = (spread + Math.random() * 72) * (6 / speed);
      }
      obs.forEach(o => { o.x -= speed * dt; });
      obs = obs.filter(o => o.x + o.w > -10);
      clouds.forEach(c => {
        c.x -= c.s * dt;
        if (c.x < -60) { c.x = W + Math.random() * 80; c.y = 24 + Math.random() * 42; }
      });

      for (const o of obs) {
        const shrink = 3;
        const ox = o.x, oy = o.type === 'bird' ? o.y : GROUND - o.h;
        if (dino.x + shrink < ox + o.w && dino.x + dino.w - shrink > ox &&
            dino.y - dino.h + shrink < oy + o.h && dino.y > oy + shrink) {
          dead = true;
          const s = Math.floor(score);
          if (s > best) { best = s; localStorage.setItem('mg_dino_best', String(best)); }
          setInfo(`Игра окончена · Счёт: ${s} · Рекорд: ${best} · Space — заново`);
        }
      }
      const s = Math.floor(score);
      if (!dead && s !== shown) {
        shown = s;
        setInfo(`Счёт: ${s} · Рекорд: ${best}`);
      }
    }
    function draw() {
      const theme = themes[themeName];
      ctx.fillStyle = theme.sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(229,237,245,0.16)';
      clouds.forEach(c => {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 22, 7, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + 19, c.y + 3, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = theme.ground;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, GROUND + .5); ctx.lineTo(W, GROUND + .5); ctx.stroke();
      obs.forEach(o => {
        if (o.type === 'bird') {
          ctx.fillStyle = theme.bird;
          const wing = Math.sin((frame + o.flap) / 4) * 5;
          ctx.fillRect(o.x, o.y + 5, o.w, 8);
          ctx.fillRect(o.x + 7, o.y + wing, 14, 5);
          ctx.fillRect(o.x + o.w - 2, o.y + 7, 6, 3);
        } else if (o.type === 'block') {
          ctx.fillStyle = theme.obstacle;
          ctx.fillRect(o.x, GROUND - o.h, o.w, o.h);
          ctx.fillStyle = 'rgba(7,10,15,0.25)';
          ctx.fillRect(o.x + 3, GROUND - o.h + 3, o.w - 6, 4);
        } else {
          ctx.fillStyle = theme.obstacle;
          ctx.fillRect(o.x, GROUND - o.h, o.w, o.h);
          ctx.fillRect(o.x - 4, GROUND - o.h + 6, 4, 10);
          ctx.fillRect(o.x + o.w, GROUND - o.h + 10, 4, 10);
        }
      });
      const top = dino.y - dino.h;
      ctx.fillStyle = dead ? '#f87171' : theme.dino;
      ctx.fillRect(dino.x, top, dino.w, dino.h);
      ctx.fillStyle = '#070a0f';
      ctx.fillRect(dino.x + dino.w - 8, top + 6, 4, 4);
      ctx.fillStyle = dead ? '#f87171' : theme.obstacle;
      const stepPhase = Math.floor(frame / 6) % 2;
      if (stepPhase === 0) {
        ctx.fillRect(dino.x + 3, dino.y, 6, 7);
      } else {
        ctx.fillRect(dino.x + dino.w - 9, dino.y, 6, 7);
      }
      if (dead) {
        ctx.fillStyle = 'rgba(7,10,15,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e5edf5';
        ctx.font = '700 20px sans-serif';
        ctx.fillText('Игра окончена', W / 2, H / 2 - 10);
        ctx.fillStyle = '#7c8ea1';
        ctx.font = '13px sans-serif';
        ctx.fillText('Space или клик — заново', W / 2, H / 2 + 16);
      }
    }
    function loop(t) {
      raf = requestAnimationFrame(loop);
      if (!last) last = t;
      const dt = Math.min(32, t - last) / 16.666;
      last = t;
      if (!dead) update(dt);
      draw();
    }
    function onKey(e) {
      if (isTyping(e)) return;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'ц') {
        e.preventDefault();
        jump();
      }
    }
    function onClick() { jump(); }
    function onOptionChange() {
      themeName = themeSelect.value;
      obstacleMode = obstacleSelect.value;
      difficulty = difficultySelect.value;
      localStorage.setItem('mg_dino_theme', themeName);
      localStorage.setItem('mg_dino_obstacles', obstacleMode);
      localStorage.setItem('mg_dino_difficulty', difficulty);
      reset();
    }

    addEventListener('keydown', onKey);
    canvas.addEventListener('click', onClick);
    themeSelect.addEventListener('change', onOptionChange);
    obstacleSelect.addEventListener('change', onOptionChange);
    difficultySelect.addEventListener('change', onOptionChange);
    setHint('Space / ↑ / клик — прыжок · кастомизируй стиль, темп и тип препятствий');
    reset();
    raf = requestAnimationFrame(loop);
    return {
      destroy() {
        cancelAnimationFrame(raf);
        removeEventListener('keydown', onKey);
        shell.remove();
      }
    };
  }

  /* ════════════ Менеджер ════════════ */
  const games = { snake: createSnake, mines: createMines, dino: createDino };

  function mount(name) {
    unmount();
    currentName = name;
    tabs.querySelectorAll('button[data-game]').forEach(b => {
      b.classList.toggle('active', b.dataset.game === name);
    });
    stage.innerHTML = '';
    info.textContent = '—';
    hint.textContent = '';
    current = games[name]();
  }
  function unmount() {
    if (current) { current.destroy(); current = null; }
    stage.innerHTML = '';
  }

  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-game]');
    if (b) mount(b.dataset.game);
  });
  btnRestart.addEventListener('click', () => mount(currentName));

  return {
    show() { if (!current) mount(currentName); },
    hide() { unmount(); }
  };
})();
