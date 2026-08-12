/* global io */

const socket = io({ transports: ['websocket'] });
const $ = (id) => document.getElementById(id);

const els = {
  socketState: $('socketState'),
  serverLine: $('serverLine'),
  clock: $('clock'),
  hostInput: $('hostInput'),
  ipState: $('ipState'),
  tgTemplate: $('tgTemplate'),
  tgState: $('tgState'),
  logTabs: $('logTabs'),
  playerFilterChips: $('playerFilterChips'),
  playerFilterInput: $('playerFilterInput'),
  addPlayerFilter: $('addPlayerFilter'),
  clearPlayerFilters: $('clearPlayerFilters'),
  logSearch: $('logSearch'),
  logDate: $('logDate'),
  downloadDayLog: $('downloadDayLog'),
  logCount: $('logCount'),
  logs: $('logs'),
  chatBotSelect: $('chatBotSelect'),
  chatSendInput: $('chatSendInput'),
  chatSendBtn: $('chatSendBtn'),
  botToggleBtn: $('botToggleBtn'),
  botRestartBtn: $('botRestartBtn'),
  toast: $('toast')
};

const state = {
  bots: [],
  logs: [],
  selectedDayLogs: [],
  currentLogDate: '',
  selectedLogDate: '',
  logDays: [],
  inited: false,
  config: {},
  logFilters: new Set(),
  playerFilters: new Set(),
  logSearch: ''
};

/* ── Helpers ─────────────────────────────── */

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { els.toast.hidden = true; }, 2400);
}

function setInputVal(input, value) {
  if (document.activeElement !== input) input.value = value ?? '';
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function debounce(fn, ms) {
  let t = null;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  d.flush = (...args) => {
    if (!t) return;
    clearTimeout(t);
    t = null;
    fn(...args);
  };
  return d;
}

function markEditing(badge) {
  badge.textContent = 'editing…';
  badge.classList.remove('ok');
}
function markSaved(badge) {
  badge.textContent = 'saved ✓';
  badge.classList.add('ok');
}

/* Часы в шапке */
const tickClock = () => { els.clock.textContent = new Date().toLocaleTimeString('ru-RU'); };
setInterval(tickClock, 1000);
tickClock();

/* ── Автосохранение настроек ─────────────── */

const saveHost = debounce(() => {
  const host = els.hostInput.value.trim();
  if (!host || host === state.config.host) { markSaved(els.ipState); return; }
  socket.emit('update_settings', { host });
  state.config.host = host;
  els.serverLine.textContent = `${host}:${state.config.port || '—'} · ${state.config.version || '—'}`;
  markSaved(els.ipState);
  showToast('IP сохранён, боты переподключаются');
}, 600);

els.hostInput.addEventListener('input', () => { markEditing(els.ipState); saveHost(); });
els.hostInput.addEventListener('blur', () => saveHost.flush());

const saveTg = debounce(() => {
  const tpl = els.tgTemplate.value;
  if (tpl === state.config.tgTemplate) { markSaved(els.tgState); return; }
  socket.emit('update_settings', { tgTemplate: tpl });
  state.config.tgTemplate = tpl;
  markSaved(els.tgState);
  showToast('Шаблон TG сохранён');
}, 600);

els.tgTemplate.addEventListener('input', () => { markEditing(els.tgState); saveTg(); });
els.tgTemplate.addEventListener('blur', () => saveTg.flush());

/* ── Логи: вкладки, поиск, рендер ────────── */

function renderLogTabs() {
  const labels = [];
  state.bots.forEach(b => {
    const l = b.label || b.username;
    if (l && !labels.includes(l)) labels.push(l);
  });
  for (const id of [...state.logFilters]) {
    if (!labels.includes(id)) state.logFilters.delete(id);
  }

  els.logTabs.innerHTML = '';
  const mk = (id, text, active) => {
    const b = el('button', active ? 'active' : '', text);
    b.type = 'button';
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.addEventListener('click', () => {
      if (id === 'all') state.logFilters.clear();
      else if (state.logFilters.has(id)) state.logFilters.delete(id);
      else state.logFilters.add(id);
      renderLogTabs();
      renderLogs();
    });
    return b;
  };
  els.logTabs.appendChild(mk('all', 'Все', state.logFilters.size === 0));
  labels.forEach(l => els.logTabs.appendChild(mk(l, l, state.logFilters.has(l))));
}

function renderPlayerTabs() {
  els.playerFilterChips.innerHTML = '';
  if (!state.playerFilters.size) {
    els.playerFilterChips.appendChild(el('span', 'player-filter-empty', 'Все игроки'));
    return;
  }

  [...state.playerFilters]
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .forEach(player => {
      const b = el('button', 'player-chip active', player);
      b.type = 'button';
      b.title = 'Убрать игрока из фильтра';
      b.setAttribute('aria-label', `Убрать ${player}`);
      b.addEventListener('click', () => {
        state.playerFilters.delete(player);
        renderPlayerTabs();
        renderLogs();
      });
      els.playerFilterChips.appendChild(b);
    });
}

function addPlayerFilter(value) {
  value
    .split(/[\s,;]+/)
    .map(nick => nick.trim())
    .filter(Boolean)
    .forEach(nick => {
      const existing = [...state.playerFilters].find(player => player.toLowerCase() === nick.toLowerCase());
      state.playerFilters.add(existing || nick);
    });
  els.playerFilterInput.value = '';
  renderPlayerTabs();
  renderLogs();
}

function playerMatchesFilter(username) {
  if (!state.playerFilters.size) return true;
  const lowerUsername = String(username || '').toLowerCase();
  return [...state.playerFilters].some(player => player.toLowerCase() === lowerUsername);
}

function bindPlayerFilterControls() {
  els.addPlayerFilter.addEventListener('click', () => addPlayerFilter(els.playerFilterInput.value));
  els.clearPlayerFilters.addEventListener('click', () => {
    state.playerFilters.clear();
    renderPlayerTabs();
    renderLogs();
  });
  els.playerFilterInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      event.preventDefault();
      addPlayerFilter(els.playerFilterInput.value);
    }
  });
  els.playerFilterInput.addEventListener('paste', () => {
    setTimeout(() => {
      if (/[\s,;]/.test(els.playerFilterInput.value)) addPlayerFilter(els.playerFilterInput.value);
    }, 0);
  });
}

function getDisplayedLogs() {
  return state.selectedLogDate === state.currentLogDate ? state.logs : state.selectedDayLogs;
}

async function refreshLogDays() {
  try {
    const response = await fetch('/api/logs/days');
    if (!response.ok) return;
    const payload = await response.json();
    state.logDays = Array.isArray(payload.days) ? payload.days : [];
    if (!state.currentLogDate && payload.currentDate) state.currentLogDate = payload.currentDate;
    if (!state.selectedLogDate && state.currentLogDate) {
      state.selectedLogDate = state.currentLogDate;
      els.logDate.value = state.currentLogDate;
    }
  } catch {
    // Дневной список обновится при следующем подключении сокета.
  }
}

async function selectLogDate(day) {
  if (!day) return;
  state.selectedLogDate = day;
  els.logDate.value = day;

  if (day === state.currentLogDate) {
    state.selectedDayLogs = [];
    renderPlayerTabs();
    renderLogs();
    return;
  }

  state.selectedDayLogs = [];
  renderPlayerTabs();
  renderLogs();
  try {
    const response = await fetch(`/api/logs/day/${encodeURIComponent(day)}`);
    if (!response.ok) throw new Error('Log day is unavailable');
    const payload = await response.json();
    if (state.selectedLogDate !== day) return;
    state.selectedDayLogs = Array.isArray(payload.logs) ? payload.logs : [];
  } catch {
    if (state.selectedLogDate === day) {
      state.selectedDayLogs = [];
      showToast('Не удалось загрузить логи за выбранный день');
    }
  }
  renderPlayerTabs();
  renderLogs();
}

els.logDate.addEventListener('change', () => selectLogDate(els.logDate.value));
els.downloadDayLog.addEventListener('click', () => {
  const day = state.selectedLogDate || state.currentLogDate;
  if (!day) return;
  window.location.assign(`/api/logs/download/${encodeURIComponent(day)}`);
});

function renderLogs() {
  els.logs.innerHTML = '';
  const q = state.logSearch.trim().toLowerCase();
  const all = getDisplayedLogs();
  const filtered = all.filter(entry => {
    if (state.logFilters.size && !state.logFilters.has(entry.bot)) return false;
    if (!playerMatchesFilter(entry.username)) return false;
    if (!q) return true;
    const searchText = [
      entry.text || '',
      entry.username || '',
      entry.bot || '',
      entry.type || '',
      entry.date || '',
      entry.time || '',
      entry.date && entry.time ? `${entry.date} ${entry.time}` : ''
    ].join(' ').toLowerCase();
    return searchText.includes(q);
  });
  els.logCount.textContent = filtered.length;

  if (!filtered.length) {
    const hasFilters = q || state.logFilters.size || state.playerFilters.size;
    els.logs.appendChild(el('div', 'log-empty', hasFilters ? 'Ничего не найдено.' : 'Логов пока нет…'));
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.slice(0, 300).forEach(entry => {
    const line = el('div', 'log-line ' + (entry.type || ''));
    const timeLabel = entry.date ? `[${entry.date} ${entry.time}] ` : `[${entry.time}] `;
    const text = entry.text || '';
    const message = entry.username && !text.startsWith(`${entry.username}:`)
      ? `${entry.username}: ${text}`
      : text;
    line.append(
      el('span', 'log-time', timeLabel),
      el('span', 'log-bot', `${entry.bot} `),
      document.createTextNode(message)
    );
    frag.appendChild(line);
  });
  els.logs.appendChild(frag);
}

bindPlayerFilterControls();

/* ── Отправка сообщений от бота ──────────── */

function renderChatBotSelect() {
  const prev = els.chatBotSelect.value;
  els.chatBotSelect.innerHTML = '';
  state.bots.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.username;
    opt.textContent = `${b.label || b.username} (${b.status === 'online' ? '🟢' : '🔴'})`;
    els.chatBotSelect.appendChild(opt);
  });
  if (prev && [...els.chatBotSelect.options].some(o => o.value === prev)) {
    els.chatBotSelect.value = prev;
  }
  updateBotButtons();
}

function updateBotButtons() {
  const username = els.chatBotSelect.value;
  const bot = state.bots.find(b => b.username === username);
  const online = bot?.status === 'online';
  els.botToggleBtn.textContent = online ? '⏹ Стоп' : '▶ Старт';
  els.botToggleBtn.style.color = online ? 'var(--red)' : 'var(--accent)';
  els.chatSendInput.disabled = !online;
  els.chatSendBtn.disabled = !online;
}

els.chatBotSelect.addEventListener('change', updateBotButtons);

els.botToggleBtn.addEventListener('click', () => {
  const username = els.chatBotSelect.value;
  const bot = state.bots.find(b => b.username === username);
  if (!bot) return;
  if (bot.status === 'online') {
    socket.emit('bot_stop', { username });
    showToast(`⏹ Останавливаю ${username}...`);
  } else {
    socket.emit('bot_start', { username });
    showToast(`▶ Запускаю ${username}...`);
  }
});

els.botRestartBtn.addEventListener('click', () => {
  const username = els.chatBotSelect.value;
  if (!username) return;
  socket.emit('bot_restart', { username });
  showToast(`↺ Перезапускаю ${username}...`);
});

function sendChatMessage() {
  const text = els.chatSendInput.value.trim();
  const username = els.chatBotSelect.value;
  if (!text) { showToast('Введите сообщение'); return; }
  if (!username) { showToast('Нет доступных ботов'); return; }
  if (!socket.connected) { showToast('Нет соединения с сервером'); return; }
  socket.emit('send_command', { username, text });
  els.chatSendInput.value = '';
}

els.chatSendBtn.addEventListener('click', sendChatMessage);
els.chatSendInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

els.logSearch.addEventListener('input', () => {
  state.logSearch = els.logSearch.value;
  renderLogs();
});

/* ── Вкладки: Панель / Игры ──────────────── */

const viewMain = $('viewMain');
const viewGames = $('viewGames');
const btnViewMain = $('btnViewMain');
const btnViewGames = $('btnViewGames');

function switchView(name) {
  const games = name === 'games';
  viewMain.hidden = games;
  viewGames.hidden = !games;
  btnViewMain.classList.toggle('active', !games);
  btnViewGames.classList.toggle('active', games);
  if (window.MiniGames) {
    if (games) MiniGames.show();
    else MiniGames.hide();
  }
}

btnViewMain.addEventListener('click', () => switchView('main'));
btnViewGames.addEventListener('click', () => switchView('games'));

/* ── Socket events ───────────────────────── */

socket.on('connect', () => {
  els.socketState.textContent = 'online';
  els.socketState.classList.add('good');
  els.socketState.classList.remove('bad');
});
socket.on('disconnect', () => {
  els.socketState.textContent = 'offline';
  els.socketState.classList.remove('good');
  els.socketState.classList.add('bad');
});

socket.on('init', (payload) => {
  state.bots = payload.bots || [];
  const previousCurrentDate = state.currentLogDate;
  state.currentLogDate = payload.logDate || state.currentLogDate;
  state.logs = payload.logs || [];
  if (!state.inited) {
    state.inited = true;
    state.selectedLogDate = state.currentLogDate;
  } else if (state.selectedLogDate === previousCurrentDate && state.currentLogDate !== previousCurrentDate) {
    state.selectedLogDate = state.currentLogDate;
    state.selectedDayLogs = [];
  }
  if (state.currentLogDate) {
    els.logDate.max = state.currentLogDate;
    els.logDate.value = state.selectedLogDate || state.currentLogDate;
  }
  state.config = payload.config || {};
  setInputVal(els.hostInput, state.config.host || '');
  setInputVal(els.tgTemplate, state.config.tgTemplate || '');
  els.serverLine.textContent = `${state.config.host || '—'}:${state.config.port || '—'} · ${state.config.version || '—'}`;

  void refreshLogDays();
  renderLogTabs();
  renderPlayerTabs();
  renderLogs();
  renderChatBotSelect();
});

socket.on('status', (data) => {
  state.bots = data;
  renderLogTabs();
  renderChatBotSelect();
});

socket.on('log', (entry) => {
  state.logs.unshift(entry);
  if (state.logs.length > 5000) state.logs.pop();
  if (state.selectedLogDate === state.currentLogDate) {
    renderPlayerTabs();
    renderLogs();
  }
});

socket.on('logs_day_changed', (payload) => {
  const wasCurrentDaySelected = state.selectedLogDate === state.currentLogDate;
  state.currentLogDate = payload.date || state.currentLogDate;
  state.logs = payload.logs || [];
  els.logDate.max = state.currentLogDate;
  if (wasCurrentDaySelected || !state.selectedLogDate) {
    state.selectedLogDate = state.currentLogDate;
    els.logDate.value = state.currentLogDate;
  }
  void refreshLogDays();
  renderPlayerTabs();
  renderLogs();
});

socket.on('send_command_result', (data) => {
  if (data.success) showToast(`✅ Отправлено (${data.username}): ${data.text}`);
  else showToast(`❌ Не отправлено: ${data.reason || 'бот оффлайн'}`);
});
