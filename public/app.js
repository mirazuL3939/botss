/* global io */

const socket = io();
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
  logCount: $('logCount'),
  logs: $('logs'),
  chatBotSelect: $('chatBotSelect'),
  chatSendInput: $('chatSendInput'),
  chatSendBtn: $('chatSendBtn'),
  openLinksPanel: $('openLinksPanel'),
  linksModal: $('linksModal'),
  linksList: $('linksList'),
  copyAllLinks: $('copyAllLinks'),
  closeLinksModal: $('closeLinksModal'),
  toast: $('toast')
};

const state = {
  bots: [],
  logs: [],      // сегодняшние (живые)
  history: [],   // все прошлые дни
  inited: false,
  historyLoaded: false,
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

function extractLinksFromText(text) {
  if (!text) return [];

  const patterns = [
    /(?:https?:\/\/|[A-Za-z0-9-]+:\/\/)[^\s<>'")]+/gi,
    /(?:https?:\/\/|[A-Za-z0-9-]+:\/\/)[A-Za-z0-9.-]+\.[A-Za-zА-Яа-я]{2,}[^\s<>'")]*/gi,
    /(?:www\.)[A-Za-z0-9.-]+\.[A-Za-zА-Яа-я]{2,}[^\s<>'")]*/gi
  ];

  const unique = [];
  const seen = new Set();

  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const rawLink of matches) {
      const clean = rawLink
        .replace(/[),.;]+$/, '')
        .replace(/[\u2018\u2019\u201C\u201D]+$/g, '')
        .trim();

      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      unique.push(clean);
    }
  }

  if (unique.length) return unique;

  const fallback = text.match(/[A-Za-z0-9.-]+\.[A-Za-zА-Яа-я]{2,}(?:\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/gi) || [];
  for (const rawLink of fallback) {
    const clean = rawLink.replace(/[),.;]+$/, '').trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    unique.push(clean);
  }

  return unique;
}

function getVisibleLinkItems() {
  const q = state.logSearch.trim().toLowerCase();
  const all = state.logs.concat(state.history);
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

  const items = [];
  filtered.forEach(entry => {
    const urls = extractLinksFromText(entry.text || '');
    urls.forEach(url => {
      items.push({
        url,
        bot: entry.bot || 'system',
        username: entry.username || '',
        source: entry.text || ''
      });
    });
  });
  return items;
}

function renderLinkPanel() {
  const items = getVisibleLinkItems();
  els.linksList.innerHTML = '';

  if (!items.length) {
    const empty = el('div', 'link-empty', 'Ссылок в текущем фильтре не найдено.');
    els.linksList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(({ url, bot, username }, index) => {
    const item = el('div', 'link-item');
    const meta = el('div', 'link-meta');
    meta.textContent = `${bot}${username ? ` · ${username}` : ''}`;

    const urlEl = el('a', 'link-value', url);
    urlEl.href = url;
    urlEl.target = '_blank';
    urlEl.rel = 'noopener noreferrer';

    const actions = el('div', 'link-actions');
    const copyBtn = el('button', 'link-copy', 'Копировать');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        showToast(`Ссылка скопирована (${index + 1}/${items.length})`);
      } catch {
        showToast('Не удалось скопировать ссылку');
      }
    });

    actions.appendChild(copyBtn);
    item.append(meta, urlEl, actions);
    fragment.appendChild(item);
  });

  els.linksList.appendChild(fragment);
}

function openLinksPanel() {
  renderLinkPanel();
  els.linksModal.hidden = false;
}

function closeLinksPanel() {
  els.linksModal.hidden = true;
}

els.openLinksPanel.addEventListener('click', openLinksPanel);
els.closeLinksModal.addEventListener('click', closeLinksPanel);
els.linksModal.addEventListener('click', (event) => {
  if (event.target === els.linksModal) closeLinksPanel();
});
els.copyAllLinks.addEventListener('click', async () => {
  const items = getVisibleLinkItems();
  if (!items.length) {
    showToast('Ссылок нет');
    return;
  }
  const text = [...new Set(items.map(item => item.url))].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Скопировано ${new Set(items.map(item => item.url)).size} ссылок`);
  } catch {
    showToast('Не удалось скопировать все ссылки');
  }
});

function renderLogs() {
  els.logs.innerHTML = '';
  const q = state.logSearch.trim().toLowerCase();
  const all = state.logs.concat(state.history);
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
    line.append(
      el('span', 'log-time', timeLabel),
      el('span', 'log-bot', `${entry.bot} `),
      document.createTextNode(entry.text || '')
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
    opt.disabled = b.status !== 'online';
    els.chatBotSelect.appendChild(opt);
  });
  if (prev && [...els.chatBotSelect.options].some(o => o.value === prev)) {
    els.chatBotSelect.value = prev;
  }
}

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
  if (!state.inited) {
    state.inited = true;
    state.logs = payload.logs || [];
  }
  state.config = payload.config || {};
  setInputVal(els.hostInput, state.config.host || '');
  setInputVal(els.tgTemplate, state.config.tgTemplate || '');
  els.serverLine.textContent = `${state.config.host || '—'}:${state.config.port || '—'} · ${state.config.version || '—'}`;

  // История за все дни грузится один раз при открытии страницы
  if (!state.historyLoaded) {
    state.historyLoaded = true;
    fetch('/api/logs/history')
      .then(r => r.json())
      .then(h => {
        if (Array.isArray(h)) {
          state.history = h;
          renderPlayerTabs();
          renderLogs();
        }
      })
      .catch(() => {});
  }

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
  if (state.logs.length > 5000) state.logs.pop(); // полные данные дня всё равно в файле
  renderPlayerTabs();
  renderLogs();
});

socket.on('clearLogs', () => {
  state.logs = []; // чистим только сегодняшние, история прошлых дней остаётся
  renderPlayerTabs();
  renderLogs();
});

socket.on('send_command_result', (data) => {
  if (data.success) showToast(`✅ Отправлено (${data.username}): ${data.text}`);
  else showToast(`❌ Не отправлено: ${data.reason || 'бот оффлайн'}`);
});
