// bot.js
const { TelegramBot } = require('node-telegram-bot-api');
const mineflayer = require('mineflayer');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const TZ = process.env.TZ || 'Europe/Moscow';

// Время в консоли (cmd)
const _origLog = console.log;
const _origError = console.error;
function consoleTs() { return new Date().toLocaleTimeString('ru-RU', { timeZone: TZ }); }
console.log = (...args) => _origLog(`[${consoleTs()}]`, ...args);
console.error = (...args) => _origError(`[${consoleTs()}]`, ...args);

// Хелперы для даты и хранения. DATA_DIR на Render должен указывать на persistent disk.
function fmtDate(d) { return d.toLocaleDateString('ru-RU', { timeZone: TZ }); }
function fmtTime(d) { return d.toLocaleTimeString('ru-RU', { timeZone: TZ }); }
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const CONFIG_PATH = path.resolve(process.env.CONFIG_PATH || path.join(DATA_DIR, 'config.json'));
const CONFIG_TEMPLATE_PATH = path.join(__dirname, 'config.example.json');
const LOGS_DIR = path.resolve(process.env.LOGS_DIR || path.join(DATA_DIR, 'logs'));

fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
fs.mkdirSync(LOGS_DIR, { recursive: true });

const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function getDateParts(date = new Date()) {
  const parts = datePartsFormatter.formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function getLogFileName(date = new Date()) {
  const { year, month, day } = getDateParts(date);
  return `${year}-${month}-${day}`;
}

function getLogFilePath(dateOrDay = new Date(), extension = '.jsonl') {
  const day = typeof dateOrDay === 'string' ? dateOrDay : getLogFileName(dateOrDay);
  return path.join(LOGS_DIR, `${day}${extension}`);
}

function isLogDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function readJsonLogFile(day) {
  const filePath = getLogFilePath(day, '.json');
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data.filter(entry => entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
}

function readJsonlLogFile(day) {
  const filePath = getLogFilePath(day, '.jsonl');
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap(line => {
        try {
          const entry = JSON.parse(line);
          return entry && typeof entry === 'object' ? [entry] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function loadLogsForDay(day) {
  if (!isLogDay(day)) return [];
  // Старые JSON-файлы остаются доступными, а новые записи дописываются в JSONL.
  return [...readJsonLogFile(day), ...readJsonlLogFile(day)];
}

function formatTextLogEntry(entry) {
  const now = entry?.timestamp ? new Date(entry.timestamp) : new Date();
  const date = entry?.date || fmtDate(now);
  const time = entry?.time || fmtTime(now);
  const bot = entry?.bot || 'system';
  const type = entry?.type || 'info';
  const text = entry?.text || '';
  const user = entry?.username && !text.startsWith(`${entry.username}:`)
    ? `${entry.username}: `
    : '';
  return `[${date} ${time}] [${bot}] [${type}] ${user}${text}`;
}

function appendTextLogEntry(entry) {
  if (!entry || !entry.text && !entry.username) return;
  const filePath = getLogFilePath(new Date(entry.timestamp || Date.now()), '.txt');
  try {
    fs.appendFileSync(filePath, `${formatTextLogEntry(entry)}\n`, 'utf8');
  } catch (err) {
    console.error('[LOGS] Plain-text log append failed:', err.message);
  }
}

function appendJsonlLogEntry(entry) {
  const filePath = getLogFilePath(new Date(entry.timestamp || Date.now()), '.jsonl');
  try {
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (err) {
    console.error('[LOGS] JSONL log append failed:', err.message);
  }
}

//Лузарим ботик
const DEFAULT_TG_TEMPLATE = '{emoji} Нарушение\n📅 Дата: {date}, {time}\n🎮 Режим: {mode}\n👤 Игрок: {player}\n⚖️ Правило: {rule}\n📋 Описание: {desc}\n💬 Сообщение: {message}\n🚨 Наказание: {punishment}';

const defaultConfig = {
  host: 'eu.cheatmine.net',
  port: 25565,
  password: '',
  version: '1.12.2',
  panelPort: 4218,
  warpCommand: '',
  tgTemplate: DEFAULT_TG_TEMPLATE,
  bots: [
    { username: 'tribunal', command: '/s1', label: 'S1' },
    { username: 'lanubirt', command: '/s2', label: 'S2' }
  ],
  rules: {
    '2.1': {
      title: 'Оскорбления',
      words: ['лох','дура','дурак','идиот','дебил','тупой','глупый','убогий','ничтожество','чмо','мудак','урод','козел','noob','нуб','fool','retard','loser','лузер','петух','дно','тряпка','слабак','чепушило','чушпан','чурбан','петушок','сыкло','ссыкло','clown','клоун','нищий']
    },
    '2.3': {
      title: 'Личная жизнь',
      words: ['мать','мамку','матери','отца','отцу','семью','семья','родители','родителей','родных','mamku','otca','otcu','папу','папашу','брата','сестру','деда','бабку','твою мать','твою мамку','твою семью']
    },
    '2.4': {
      title: 'Провокации',
      words: ['убей себя','убейся','убей сeбя','прыгни в лаву','удались с сервера','удались','закрой игру','выпей яд','повесься','вали отсюда','уходи','лизни','свали','ez','easy','изи','l2p','learn to play','get good','get rekt','rekt','rip','потный','слит','слился','слив','ты слился']
    },
    '2.5': {
      title: 'Попрошайничество',
      words: ['дай','дайте','денег','деньги','подай','одолжи','разбань','размут','/gm 1','gamemode 1','хочу денег','нужны деньги','дай алмаз','дай ресурсы','подари донат','dai','daite','deneg','dengi','giv','give me','plz','pls','need money','donate please','хочу оп','give op','дай опку','дайте админку','хелп','help me','money']
    },
    '2.7': {
      title: 'Спам/флуд/капс',
      words: [],
      capsThreshold: 4,
      spamThreshold: 3,
      spamWindowMs: 60000,
      minMessageLength: 2,
      floodThreshold: 3
    },
    '2.9': {
      title: 'Разжигание розни',
      words: ['ниггер','нигга','хохол','фашист','нацист','расист','антисемит','черножопый','чурка','армянин','кацап','nigger','niga','нигер','white trash','угнетатель','расизм','нацизм']
    },
    '2.14': {
      title: 'Угрозы',
      words: ['убью','зарежу','приеду','найду','поколочу','изобью','тебе конец','ты покойник','тебе крышка','уничтожу','уничтожу тебя','kill you','убью тебя','задушу','сломаю','переломаю','сожгу','взорву','затоплю','тебе не жить','готовься','берегись']
    }
  }
};

let config;

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(defaultConfig));
}

function readConfigFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeConfigFile() {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = readConfigFile(CONFIG_PATH);
    } else {
      config = fs.existsSync(CONFIG_TEMPLATE_PATH)
        ? readConfigFile(CONFIG_TEMPLATE_PATH)
        : cloneDefaultConfig();
      writeConfigFile();
    }
  } catch (err) {
    console.error('[CONFIG] Error loading config, using defaults:', err.message);
    config = cloneDefaultConfig();
  }

  if (!config.rules || typeof config.rules !== 'object') config.rules = {};
  delete config.rules['2.10'];
  delete config.rules['2.13'];
}
loadConfig();

function getMinecraftPassword() {
  return process.env.MC_PASSWORD || config.password;
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROUP_CHAT_ID = -5346668750;
const ADMIN_USERNAMES = ['WhyLuzarim'];
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(Number).filter(Boolean);

let tgBot;

function isAdmin(msg) {
  if (ADMIN_IDS.includes(msg.from.id)) return true;
  if (msg.from.username && ADMIN_USERNAMES.some(
    (u) => u.toLowerCase() === msg.from.username.toLowerCase()
  )) return true;
  return false;
}

function tgNotify(text) {
  if (tgBot) tgBot.sendMessage(GROUP_CHAT_ID, text).catch(() => {});
}

// ── Контекст нарушения: 15 до + 15 после ─────────────────────
const CHAT_BUFFER_SIZE = 10;
const chatBuffers = new Map(); // буфер на каждый botLabel отдельно
const moderationHistories = new Map(); // недавние участники чата для локальной проверки

function addToChatBuffer(botLabel, username, message) {
  if (!chatBuffers.has(botLabel)) chatBuffers.set(botLabel, []);
  const buf = chatBuffers.get(botLabel);
  const now = new Date();
  buf.push(`[${fmtTime(now)}] [${botLabel}] ${username}: ${message}`);
  if (buf.length > 25) buf.shift();

  if (!moderationHistories.has(botLabel)) moderationHistories.set(botLabel, []);
  const history = moderationHistories.get(botLabel);
  history.push({ username, message, timestamp: now.getTime() });
  if (history.length > 12) history.shift();
}

function getKnownParticipants(botLabel) {
  return (moderationHistories.get(botLabel) || [])
    .map(({ username }) => String(username || '').toLowerCase())
    .filter(Boolean);
}

const pendingContexts = [];

function onChatMessageForContext(botLabel, username, message) {
  const line = `[${fmtTime(new Date())}] [${botLabel}] ${username}: ${message}`;
  for (const ctx of pendingContexts) {
    if (ctx.botLabel !== botLabel) continue;
    ctx.after.push(line);
    if (ctx.after.length >= 25) {
      clearTimeout(ctx._timer);
      ctx._send();
    }
  }
}

function truncateLine(line, max = 80) {
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

function buildContextText(before, violationLine, after) {
  const header1 = '— до —';
  const header2 = '\n▶ НАРУШЕНИЕ ◀';
  const header3 = after && after.length ? '\n— после —' : '';
  const vLine = truncateLine(violationLine, 120);

  const beforeTrunc = before.map(l => truncateLine(l, 80));
  const afterTrunc = (after || []).map(l => truncateLine(l, 80));

  let text = `${header1}\n${beforeTrunc.join('\n')}${header2}\n${vLine}${header3}\n${afterTrunc.join('\n')}`.trim();

  // Пока текст не влезает в лимит Telegram (оставляем запас для заголовка)
  while (text.length > 3800 && (beforeTrunc.length > 0 || afterTrunc.length > 0)) {
    if (beforeTrunc.length > afterTrunc.length) {
      beforeTrunc.shift(); // удаляем самое старое из "до"
    } else {
      afterTrunc.pop(); // удаляем самое новое из "после"
    }
    text = `${header1}\n${beforeTrunc.join('\n')}${header2}\n${vLine}${header3}\n${afterTrunc.join('\n')}`.trim();
  }

  return text;
}

function tgNotifyViolation(violationText, username, message, botLabel) {
  if (!tgBot) return;
  const before = [...(chatBuffers.get(botLabel) || [])];
  const violationLine = `[${fmtTime(new Date())}] [${botLabel}] ${username}: ${message}`;

  // Убираем само сообщение-нарушение из контекста "до", если оно туда уже попало
  if (before.length > 0 && before[before.length - 1].endsWith(`${username}: ${message}`)) {
    before.pop();
  }

  const after = [];
  const ctx = { before, violationLine, botLabel, after, violationText };

  const send = () => {
    const idx = pendingContexts.indexOf(ctx);
    if (idx !== -1) pendingContexts.splice(idx, 1);
    
    const contextBlock = buildContextText(ctx.before, ctx.violationLine, ctx.after);
    const full = `${ctx.violationText}\n\n${contextBlock}`;
    
    tgBot.sendMessage(GROUP_CHAT_ID, full.slice(0, 4096)).catch((err) => {
      console.error('[TG] Ошибка отправки уведомления:', err.message);
    });
  };

  // Ждем 30 секунд или до 25 сообщений после нарушения
  ctx._timer = setTimeout(send, 30 * 1000);
  ctx._send = send;
  pendingContexts.push(ctx);

  addPanelLog('action', `[${username}]: ${message}`, botLabel);
}

function tgFormatted(username, message, rule, botLabel) {
  const now = new Date();
  const date = fmtDate(now);
  const time = fmtTime(now);
  const ruleNum = rule.match(/^[\d.]+/)?.[0] || '';
  const desc = rule.replace(/^[\d.]+\s*/, '').replace(/\s*—.*$/, '');
  const punishment = rule.match(/—\s*(.+)$/)?.[1] || '';
  const emoji = punishment.includes('бан') ? '🔨' : '🔇';
  const tpl = (typeof config.tgTemplate === 'string' && config.tgTemplate.trim())
    ? config.tgTemplate
    : DEFAULT_TG_TEMPLATE;
  return tpl
    .replaceAll('{emoji}', emoji)
    .replaceAll('{date}', date)
    .replaceAll('{time}', time)
    .replaceAll('{mode}', botLabel)
    .replaceAll('{player}', username)
    .replaceAll('{rule}', ruleNum)
    .replaceAll('{desc}', desc)
    .replaceAll('{message}', message)
    .replaceAll('{punishment}', punishment);
}

if (BOT_TOKEN) {
  tgBot = new TelegramBot(BOT_TOKEN, { polling: true });

  tgBot.onText(/\/start/, (msg) => {
    tgBot.sendMessage(msg.chat.id, '⚡ *Модер-бот*\n\n/status — статус\n/players — игроки\n/chat _текст_ — чат\n/restart — перезапуск ботов\n/logs — последние нарушения');
  });

  tgBot.onText(/\/status/, (msg) => {
    if (!isAdmin(msg)) return;
    const botsOnline = activeBots.filter(b => b?.player).length;
    tgBot.sendMessage(msg.chat.id, `📡 Сервер: \`${config.host}:${config.port}\`\n🤖 Ботов онлайн: ${botsOnline}/${activeBots.length}\n🌐 Панель: http://localhost:${config.panelPort || 1000}`);
  });

  tgBot.onText(/\/players/, (msg) => {
    if (!isAdmin(msg)) return;
    const all = [];
    activeBots.forEach(b => {
      if (b?.player) {
        const players = Object.keys(b.players || {}).filter(n => n !== b.username).join(', ') || '—';
        all.push(`*${b.username}*: ${players}`);
      }
    });
    if (!all.length) return tgBot.sendMessage(msg.chat.id, 'Боты не на сервере.');
    tgBot.sendMessage(msg.chat.id, all.join('\n'));
  });

  tgBot.onText(/\/chat (.+)/, (msg, match) => {
    if (!isAdmin(msg)) return;
    const alive = activeBots.find(b => b?.player);
    if (!alive) return tgBot.sendMessage(msg.chat.id, 'Нет активных ботов.');
    alive.sendLoggedChat?.(match[1]);
    tgBot.sendMessage(msg.chat.id, `✅ Отправлено: ${match[1]}`);
  });

  tgBot.onText(/\/restart/, (msg) => {
    if (!isAdmin(msg)) return;
    startBots();
    tgBot.sendMessage(msg.chat.id, '🔄 Боты перезапущены.');
  });

  tgBot.onText(/\/logs/, (msg) => {
    if (!isAdmin(msg)) return;
    const recent = logs.filter(l => l.type === 'action').slice(-10);
    if (!recent.length) return tgBot.sendMessage(msg.chat.id, 'Нарушений не зафиксировано.');
    tgBot.sendMessage(msg.chat.id, recent.map(l => `[${l.time}] ${l.text}`).join('\n'));
  });
} else {
  console.log('[TG] BOT_TOKEN не задан, Telegram-бот отключён.');
}

let connectedBots = 0;
let totalBots = 0;
let allOnlineNotified = false;
let maintenanceFailures = 0;
let quickReconnect = true;

function onBotOnline() {
  connectedBots++;
  maintenanceFailures = 0;
  quickReconnect = true;
  emitStatus();
  if (connectedBots >= totalBots && totalBots > 0 && !allOnlineNotified) {
    allOnlineNotified = true;
    tgNotify('✅ Боты успешно вошли на сервер.');
  }
}

function onBotOffline() {
  connectedBots = Math.max(0, connectedBots - 1);
  emitStatus();
  if (connectedBots <= 0 && totalBots > 0) {
    allOnlineNotified = false;
  }
}

function getReconnectDelay() {
  if (quickReconnect) return 5000;
  if (maintenanceFailures <= 2) return 10000;
  if (maintenanceFailures <= 6) return 30000;
  return 5 * 60 * 1000;
}

// Логи дописываются синхронно в JSONL и TXT, поэтому переживают рестарт процесса.
let activeLogDay = getLogFileName();
let logs = loadLogsForDay(activeLogDay);
let io;

function rotateLogsIfNeeded(now = new Date()) {
  const nextDay = getLogFileName(now);
  if (nextDay === activeLogDay) return false;

  activeLogDay = nextDay;
  logs = loadLogsForDay(activeLogDay);
  if (io) {
    io.emit('logs_day_changed', {
      date: activeLogDay,
      logs: [...logs].slice(-400).reverse()
    });
  }
  console.log(`[LOGS] New day started: ${activeLogDay}`);
  return true;
}

setInterval(() => rotateLogsIfNeeded(), 30 * 1000);

const recentMessages = new Map();

function isDuplicate(username, message, botLabel, source) {
  const key = `${botLabel}:${username}:${cleanText(message)}`;
  const now = Date.now();
  const previous = recentMessages.get(key);

  // Одно сообщение приходит и через chat, и через message. Повтор от того же
  // источника считаем новым сообщением, чтобы не пропускать настоящий флуд.
  if (previous && now - previous.time < 1500 && previous.source !== source) {
    return true;
  }
  recentMessages.set(key, { time: now, source });
  if (Math.random() < 0.1) {
    const cutoff = now - 60000;
    for (const [k, entry] of recentMessages) {
      if (entry.time < cutoff) recentMessages.delete(k);
    }
  }
  return false;
}

function addPanelLog(type, text, botLabel, username) {
  const now = new Date();
  rotateLogsIfNeeded(now);
  const entry = {
    timestamp: now.getTime(),
    date: fmtDate(now),
    time: fmtTime(now),
    type,
    text,
    bot: botLabel || 'system'
  };
  if (username) entry.username = username;
  logs.push(entry);
  appendJsonlLogEntry(entry);
  appendTextLogEntry(entry);
  if (io) io.emit('log', entry);
  console.log(`[${entry.bot}][${type.toUpperCase()}] ${text}`);
}

// Дедупликация: одно сообщение может прийти и через 'chat', и через 'message'
const chatLogDedup = new Map();
function logChatMessage(botLabel, username, message) {
  const key = `${botLabel}|${username}|${message}`;
  const now = Date.now();
  const last = chatLogDedup.get(key) || 0;
  if (now - last < 1200) return;
  chatLogDedup.set(key, now);
  if (Math.random() < 0.05) {
    const cutoff = now - 10000;
    for (const [k, t] of chatLogDedup) {
      if (t < cutoff) chatLogDedup.delete(k);
    }
  }
  addToChatBuffer(botLabel, username, message);
  onChatMessageForContext(botLabel, username, message);
  addPanelLog('chat', `${username}: ${message}`, botLabel, username);
}

const rawMessageLogDedup = new Map();
function logServerMessage(botLabel, message) {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return;
  const key = `${botLabel}|${normalized}`;
  const now = Date.now();
  const last = rawMessageLogDedup.get(key) || 0;
  if (now - last < 1200) return;
  rawMessageLogDedup.set(key, now);
  if (Math.random() < 0.05) {
    const cutoff = now - 10000;
    for (const [entryKey, timestamp] of rawMessageLogDedup) {
      if (timestamp < cutoff) rawMessageLogDedup.delete(entryKey);
    }
  }
  addPanelLog('server', normalized, botLabel);
}

//Обработка (функции)
function cleanText(text) {
  return text
    .toLowerCase()
    .replace(/0/g, 'o').replace(/3/g, 'e').replace(/4/g, 'a')
    .replace(/1/g, 'i').replace(/5/g, 's').replace(/6/g, 'g')
    .replace(/7/g, 't').replace(/8/g, 'b').replace(/@/g, 'a')
    .replace(/\$/g, 's').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/'/g, '').replace(/\s+/g, ' ').trim();
}

function containsAny(cleanedText, words) {
  const textWords = cleanedText.split(/\s+/);
  for (const word of words) {
    const lowerWord = word.toLowerCase();
    if (lowerWord.includes(' ')) {
      if (cleanedText.includes(lowerWord)) return true;
    } else {
      if (textWords.includes(lowerWord)) return true;
    }
  }
  return false;
}

function countUpperCaseWords(text) {
  const words = text.split(/\s+/);
  let c = 0;
  for (const w of words) {
    if (w.length > 1 && w === w.toUpperCase() && /[А-ЯЁA-Z]/.test(w)) c++;
  }
  return c;
}

const playerMessageHistory = new Map();

function isFlood(username, message, botLabel) {
  const rule = config.rules['2.7'];
  const now = Date.now();
  if (message.length < (rule.minMessageLength || 2)) return false;
  const key = `${botLabel}:${username}`;
  const windowMs = rule.spamWindowMs || 60000;
  const floodThreshold = rule.floodThreshold || rule.spamThreshold || 3;
  const normalizedMessage = cleanText(message);
  const history = (playerMessageHistory.get(key) || [])
    .filter(entry => now - entry.time < windowMs);

  history.push({ time: now, text: normalizedMessage });
  playerMessageHistory.set(key, history);

  const repeats = history.filter(entry => entry.text === normalizedMessage).length;
  // Сообщаем только когда достигнут порог, а не на каждом последующем повторе.
  return repeats === floodThreshold;
}

function toText(message) {
  const seen = new Set();
  function walk(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(walk).join('');
    if (typeof value !== 'object') return '';
    if (seen.has(value)) return '';
    seen.add(value);
    if (typeof value.text === 'string') {
      const extra = Array.isArray(value.extra) ? value.extra.map(walk).join('') : '';
      return `${value.text}${extra}`;
    }
    if (value.value !== undefined) return walk(value.value);
    if (value.extra) return walk(value.extra);
    for (const key of ['text','extra','translate','with']) {
      if (value[key] !== undefined) return walk(value[key]);
    }
    return '';
  }
  try {
    return walk(message).trim() || String(message || '');
  } catch { return ''; }
}

//Извлечение ника
function extractUsername(raw) {
  if (!raw) return null;

  // Убираем ANSI и Minecraft-цвета
  raw = raw
    .replace(/§./g, '')
    .replace(/&[#a-zA-Z0-9]/g, '')
    .replace(/#[0-9A-Fa-f]{6}/g, '');

  // Ник после значка [донат]
  let match = raw.match(/\]\s*([A-Za-z0-9_]{3,16})\s+\[/);
  if (match) return match[1];

  // Ник перед "~"
  match = raw.match(/\]\s*([A-Za-z0-9_]{3,16})\s+~/);
  if (match) return match[1];

  // Ник после "~"
  match = raw.match(/~([A-Za-z0-9_]{3,16})/);
  if (match) return match[1];

  // Последний возможный ник
  const names = raw.match(/[A-Za-z0-9_]{3,16}/g);
  if (names && names.length)
    return names[names.length - 1];

  return null;
}

function findUsername(component) {
    if (!component) return null;

    if (Array.isArray(component)) {
        for (const c of component) {
            const r = findUsername(c);
            if (r) return r;
        }
        return null;
    }

    if (typeof component !== "object")
        return null;

    if (component.clickEvent?.value) {
        const m = component.clickEvent.value.match(/\/(?:msg|tell|w|whisper) ([A-Za-z0-9_]+)/);
        if (m) return m[1];
        const c = component.clickEvent.value.match(/^([A-Za-z0-9_]{3,16})$/);
        if (c) return c[1];
    }

    if (component.extra) {
        const r = findUsername(component.extra);
        if (r) return r;
    }

    return null;
}



// ── Смысловые фильтры ─────────────────────────────────────────
function getMatchedWords(cleanedText, words = []) {
  const textWords = new Set(cleanedText.split(/\s+/));
  return [...new Set(words.map(word => String(word).toLowerCase()).filter(word => {
    return word.includes(' ') ? cleanedText.includes(word) : textWords.has(word);
  }))];
}

function hasTokenPrefix(tokens, prefixes) {
  return tokens.some(token => prefixes.some(prefix => token.startsWith(prefix)));
}

function isSelfDirectedInsult(cleaned, insultWords) {
  const matched = getMatchedWords(cleaned, insultWords);
  if (!matched.length) return false;

  const insultSet = new Set(matched.filter(word => !word.includes(' ')));
  const tokens = cleaned.split(/\s+/);
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] !== 'я') continue;
    for (let offset = 1; offset <= 4; offset++) {
      if (insultSet.has(tokens[index + offset])) return true;
    }
  }
  return false;
}

function isQuotedOrDiscussedInsult(cleaned) {
  return /(^|\s)(?:слово|оскорбление|оскорблять|оскорбляй|называть|называй|называл|цитата|правило)(\s|$)/.test(cleaned);
}

function isTargetedInsult(cleaned, insultWords, knownParticipants) {
  if (!getMatchedWords(cleaned, insultWords).length) return false;
  if (isSelfDirectedInsult(cleaned, insultWords) || isQuotedOrDiscussedInsult(cleaned)) return false;

  const tokens = cleaned.split(/\s+/);
  const targetWords = new Set([
    'ты', 'тебе', 'тебя', 'твой', 'твоя', 'твое', 'твои',
    'вы', 'вам', 'вас', 'ваш', 'ваша', 'ваше', 'ваши'
  ]);
  if (tokens.some(token => targetWords.has(token))) return true;

  const participants = new Set((knownParticipants || []).map(name => String(name).toLowerCase()));
  return tokens.some(token => participants.has(token));
}

function isGiveawayAnnouncement(cleaned) {
  const tokens = cleaned.split(/\s+/);
  return hasTokenPrefix(tokens, [
    'разда', 'выда', 'дарю', 'подар', 'отдам', 'прода', 'обменя', 'предостав'
  ]);
}

function isBeggingCandidate(cleaned, beggingWords) {
  if (!getMatchedWords(cleaned, beggingWords).length || isGiveawayAnnouncement(cleaned)) return false;
  const tokens = cleaned.split(/\s+/);
  return hasTokenPrefix(tokens, [
    'ден', 'deneg', 'dengi', 'money', 'ресурс', 'алмаз', 'донат', 'donat',
    'админ', 'опк', 'оп', 'op', 'gm', 'gamemode', 'разбан', 'размут'
  ]);
}

function isBeggingRequest(cleaned, beggingWords) {
  if (!isBeggingCandidate(cleaned, beggingWords)) return false;
  const tokens = cleaned.split(/\s+/);
  const asksSomeoneElse = tokens.some(token => ['тебе', 'вам', 'вас', 'игроку', 'ему', 'ей'].includes(token));
  const hasFirstPerson = tokens.some(token => ['я', 'мне', 'меня'].includes(token));
  if (asksSomeoneElse && !hasFirstPerson) return false;

  return hasTokenPrefix(tokens, [
    'дай', 'дайте', 'закин', 'задонат', 'подай', 'одолж', 'разбан', 'размут',
    'подари', 'give', 'giv', 'dai', 'daite', 'хочу', 'нуж', 'прошу', 'можно',
    'need', 'plz', 'pls'
  ]);
}

function getContextualCandidates(cleaned, rules) {
  const candidates = [];
  const insultWords = rules['2.1']?.words || [];
  const hasInsult = getMatchedWords(cleaned, insultWords).length > 0;
  const isSelfInsult = isSelfDirectedInsult(cleaned, insultWords);
  const isInsultDiscussion = isQuotedOrDiscussedInsult(cleaned);

  if (containsAny(cleaned, rules['2.14']?.words || [])) candidates.push('2.14');
  if (containsAny(cleaned, rules['2.9']?.words || [])) candidates.push('2.9');
  if (hasInsult && !isSelfInsult && !isInsultDiscussion) {
    if (containsAny(cleaned, rules['2.3']?.words || [])) candidates.push('2.3');
    candidates.push('2.1');
  }
  if (containsAny(cleaned, rules['2.4']?.words || [])) candidates.push('2.4');
  if (isBeggingCandidate(cleaned, rules['2.5']?.words || [])) candidates.push('2.5');
  return candidates;
}

function getFallbackViolation(cleaned, rules, candidateRules, knownParticipants) {
  const hasCandidate = rule => candidateRules.includes(rule);
  if (hasCandidate('2.14')) return '2.14 (Угрозы) — бан 5ч';
  if (hasCandidate('2.9')) return '2.9 (Разжигание розни) — бан 2д';
  if (hasCandidate('2.3') && isTargetedInsult(cleaned, rules['2.1']?.words || [], knownParticipants)) {
    return '2.3 (Личная жизнь + оскорбление) — мут 1д';
  }
  if (hasCandidate('2.1') && isTargetedInsult(cleaned, rules['2.1']?.words || [], knownParticipants)) {
    return '2.1 (Оскорбление) — мут 1ч';
  }
  if (hasCandidate('2.4')) return '2.4 (Провокация) — мут 45м';
  if (hasCandidate('2.5') && isBeggingRequest(cleaned, rules['2.5']?.words || [])) {
    return '2.5 (Попрошайничество) — мут 45м';
  }
  return null;
}

function reportViolation(username, message, botLabel, violation) {
  const logText = `[${username}]: ${message} → ${violation}`;
  addPanelLog('action', logText, botLabel);
  tgNotifyViolation(tgFormatted(username, message, violation, botLabel), username, message, botLabel);
}

// Проверка нарушений работает только на локальных правилах и истории чата.
function checkViolations(username, message, botLabel, source) {
  if (isDuplicate(username, message, botLabel, source)) return;
  const cleaned = cleanText(message);
  const rules = config.rules;
  const floodDetected = isFlood(username, message, botLabel);

  if (floodDetected) {
    reportViolation(username, message, botLabel, '2.7 (Флуд) — мут 20м');
    return;
  }

  const candidateRules = getContextualCandidates(cleaned, rules);
  const fallbackViolation = getFallbackViolation(cleaned, rules, candidateRules, getKnownParticipants(botLabel));

  if (fallbackViolation) {
    reportViolation(username, message, botLabel, fallbackViolation);
  } else if (countUpperCaseWords(message) >= (rules['2.7'].capsThreshold || 4)) {
    reportViolation(username, message, botLabel, '2.7 (Капс) — мут 30м');
  }
}

//Боты настройка ебаная кароче создание там хуяние
function createBot(botInfo) {
  const bot = mineflayer.createBot({
    host: botInfo.host || config.host,
    port: botInfo.port || config.port,
    username: botInfo.username,
    version: botInfo.version || config.version,
    auth: 'offline',
    keepAliveTimeout: 60000,
    checkTimeoutInterval: 60000,
  });

  bot._host = botInfo.host || config.host;
  bot._port = botInfo.port || config.port;
  bot._version = botInfo.version || config.version;

  let ciInterval;
  let teleportCooldown = 0;
  const rec = getBotReconnect(botInfo.username);
  clearTimeout(rec.timer);
  rec.reconnecting = false;

  function sendBotChat(text, { sensitive = false } = {}) {
    const command = String(text || '').trim();
    if (!command) return false;
    const logText = sensitive ? '/l [hidden]' : command;
    addPanelLog('outgoing', logText, botInfo.label, bot.username);
    bot.chat(command);
    return true;
  }

  function sendLogin() {
    const password = getMinecraftPassword();
    if (!password) {
      addPanelLog('error', 'MC_PASSWORD не задан', botInfo.label);
      return false;
    }
    return sendBotChat(`/l ${password}`, { sensitive: true });
  }

  bot.sendLoggedChat = sendBotChat;

  function scheduleReconnect(delay) {
    if (rec.reconnecting) return;
    rec.reconnecting = true;
    rec.timer = setTimeout(() => {
      rec.reconnecting = false;
      // Берём актуальные настройки: host/port/версия могли измениться в панели
      const current = (config.bots || botsConfig).find(c => c.username === botInfo.username);
      if (!current) return; // бота удалили — не переподключаем
      const idx = activeBots.findIndex(b => b.username === botInfo.username);
      const newBot = createBot(current);
      if (idx >= 0) activeBots[idx] = newBot;
      else activeBots.push(newBot);
    }, delay);
  }

  bot.on('login', () => {
    console.log(`[${botInfo.label}] Connected. Authorizing...`);
    onBotOnline();
    sendLogin();
    setTimeout(() => {
      sendBotChat(botInfo.command);
      console.log(`[${botInfo.label}] Sent ${botInfo.command}`);
      if (config.warpCommand?.trim()) {
        setTimeout(() => {
          sendBotChat(config.warpCommand.trim());
          console.log(`[${botInfo.label}] Sent warp command: ${config.warpCommand.trim()}`);
        }, 2000);
      }
    }, 8000);

    clearInterval(ciInterval);
    ciInterval = setInterval(() => {
      const s = getBotState(botInfo.username);
      if (bot?.player && s.ciEnabled) sendBotChat('/ci');
    }, 5 * 60 * 1000);
  });

  // Сервер иногда шлёт одно и то же сообщение через несколько chat-пакетов:
  // один раз с настоящим ником (но текст вида "Ник: текст"), второй раз —
  // с кланом/привилегией вместо ника, а настоящий ник спрятан в тексте
  // перед стрелкой "⇨"/"⇒" (например "CheatMine: Luzarim ⇨ текст").
  // Приводим оба варианта к одному чистому нику, чтобы в логах и панели
  // отображался только реальный ник игрока, без дублей.
  function normalizeChatEvent(username, message) {
    if (!message) return { username, message: '' };

    const arrowMatch = message.match(/[⇨⇒]/);
    if (arrowMatch) {
      const idx = arrowMatch.index;
      const beforeArrow = message.slice(0, idx);
      const afterArrow = message.slice(idx + 1).trim();
      // Реальный ник — последнее слово перед стрелкой (клан/ранг и значки
      // вроде "✓" перед стрелкой в результат не попадают)
      const nickTokens = beforeArrow.match(/[A-Za-zА-Яа-яЁё0-9_]{3,16}/g);
      const realNick = nickTokens && nickTokens.length ? nickTokens[nickTokens.length - 1] : null;
      return {
        username: realNick || username,
        message: afterArrow
      };
    }

    // Убираем дублирование ника в начале сообщения: "Ник: текст" -> "текст"
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const dupPrefix = new RegExp('^' + escaped + '\\s*:\\s*');
    return { username, message: message.replace(dupPrefix, '').trim() };
  }

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    const normalized = normalizeChatEvent(username, message);
    if (!normalized.username) return;
    logChatMessage(botInfo.label, normalized.username, normalized.message);
    checkViolations(normalized.username, normalized.message, botInfo.label, 'chat');
  });


  bot.on('message', (jsonMsg) => {
    const msgText = toText(jsonMsg);
    if (!msgText) return;
    console.log(`[${botInfo.label}][SERVER] ${msgText}`);

    if (/регистрация|зарегистрируйтесь|войдите|введите пароль|\/login|\/register|авторизуйтесь/i.test(msgText)) {
      sendLogin();
    }

    const warpCmd = config.warpCommand?.trim() || '/warp tribunal';
    const now = Date.now();
    const s = getBotState(botInfo.username);
    if (
      s.antiteleportEnabled &&
      now - teleportCooldown > 5000 &&
      /телепортировал вас|Телепортирование\.\.\.|Перемещение на/i.test(msgText)
    ) {
      teleportCooldown = now;
      setTimeout(() => { sendBotChat(warpCmd); }, 1500);
      console.log(`[${botInfo.label}] Teleport detected, warping back: ${warpCmd}`);
    }

    const arrowPos = msgText.indexOf('⇨');
    if (arrowPos === -1) {
      logServerMessage(botInfo.label, msgText);
      return;
    }

    const afterArrow = msgText.substring(arrowPos + 1).trim();
    let username = findUsername(jsonMsg);
    if (!username) username = extractUsername(msgText);

    if (username && username !== bot.username) {
      logChatMessage(botInfo.label, username, afterArrow);
      checkViolations(username, afterArrow, botInfo.label, 'message');
    } else {
      logServerMessage(botInfo.label, msgText);
    }
  });

  bot.on('end', (reason) => {
    clearInterval(ciInterval);
    // Бота убрали из activeBots (stop/restart/remove/save) — не переподключаем
    if (!activeBots.includes(bot)) return;
    onBotOffline();
    addPanelLog('error', `Disconnected: ${reason}`, botInfo.label);

    const isConnectionRefused = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|connect/i.test(reason);
    const isKicked = /kick|бан|ban/i.test(reason);

    if (isConnectionRefused && !isKicked) {
      maintenanceFailures++;
      quickReconnect = false;
    }

    const delay = isKicked ? 10000 : getReconnectDelay();
    console.log(`[${botInfo.label}] Reconnecting in ${delay / 1000}s... (failures: ${maintenanceFailures})`);
    scheduleReconnect(delay);
  });

  bot.on('error', (err) => {
    if (!activeBots.includes(bot)) return;
    addPanelLog('error', err.message, botInfo.label);
    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH/i.test(err.message)) {
      maintenanceFailures++;
      quickReconnect = false;
      scheduleReconnect(getReconnectDelay());
    }
  });

  return bot;
}

const botsConfig = config.bots || [
  { username: 'tribunal', command: '/s1', label: 'S1' },
  { username: 'lanubirt', command: '/s2', label: 'S2' },
];
let activeBots = [];

function startBots() {
  const cfg = config.bots || botsConfig;
  for (const c of cfg) {
    const rec = getBotReconnect(c.username);
    clearTimeout(rec.timer);
    rec.reconnecting = false;
  }
  for (const b of activeBots) {
    try { b.quit(); } catch(e) {}
  }
  activeBots = [];
  connectedBots = 0;
  totalBots = cfg.length;
  allOnlineNotified = false;
  maintenanceFailures = 0;
  quickReconnect = true;
  for (const c of cfg) {
    const bot = createBot(c);
    activeBots.push(bot);
  }
}

//Веб серв аштимиель кароч
const app = express();
const server = http.createServer(app);
io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/logs', (req, res) => {
  const day = typeof req.query.date === 'string' ? req.query.date : activeLogDay;
  if (!isLogDay(day)) return res.status(400).json({ error: 'Некорректная дата' });
  res.json({ date: day, logs: (day === activeLogDay ? logs : loadLogsForDay(day)).slice().reverse() });
});

function listLogDays() {
  try {
    const days = new Set();
    for (const file of fs.readdirSync(LOGS_DIR)) {
      const match = file.match(/^(\d{4}-\d{2}-\d{2})\.(?:json|jsonl|txt)$/);
      if (match) days.add(match[1]);
    }
    days.add(activeLogDay);
    return [...days].sort().reverse();
  } catch {
    return [activeLogDay];
  }
}

app.get('/api/logs/days', (req, res) => {
  res.json({ currentDate: activeLogDay, days: listLogDays() });
});

app.get('/api/logs/day/:date', (req, res) => {
  const { date } = req.params;
  if (!isLogDay(date)) return res.status(400).json({ error: 'Некорректная дата' });
  const dayLogs = date === activeLogDay ? logs : loadLogsForDay(date);
  res.json({ date, logs: dayLogs.slice().reverse() });
});

app.get('/api/logs/download/:date', (req, res) => {
  const { date } = req.params;
  if (!isLogDay(date)) return res.status(400).send('Некорректная дата');

  const textPath = getLogFilePath(date, '.txt');
  if (fs.existsSync(textPath)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="moderbot-${date}.txt"`);
    return fs.createReadStream(textPath).pipe(res);
  }

  const dayLogs = date === activeLogDay ? logs : loadLogsForDay(date);
  if (!dayLogs.length) return res.status(404).send('За этот день логов нет');
  const body = `${dayLogs.map(formatTextLogEntry).join('\n')}\n`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="moderbot-${date}.txt"`);
  res.send(body);
});

function getPublicConfig() {
  const { password, rules, ...publicConfig } = config;
  return publicConfig;
}

app.get('/api/config', (req, res) => res.json(getPublicConfig()));

app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  if (newConfig && typeof newConfig === 'object') {
    if (newConfig.host) config.host = newConfig.host;
    if (newConfig.port) config.port = newConfig.port;
    if (newConfig.password) config.password = newConfig.password;
    if (newConfig.version) config.version = newConfig.version;
    if (newConfig.warpCommand !== undefined) config.warpCommand = newConfig.warpCommand;
    if (newConfig.bots) config.bots = newConfig.bots;
    writeConfigFile();
    startBots();
    io.emit('configUpdated', getPublicConfig());
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Invalid config' });
  }
});

const botStates = new Map();
const botReconnects = new Map();
function getBotReconnect(username) {
  if (!botReconnects.has(username)) botReconnects.set(username, { timer: null, reconnecting: false });
  return botReconnects.get(username);
}
function getBotState(username) {
  if (!botStates.has(username)) botStates.set(username, { ciEnabled: true, antiteleportEnabled: true });
  return botStates.get(username);
}

function getBotsStatus() {
  const cfg = config.bots || botsConfig;
  return cfg.map(c => {
    const s = getBotState(c.username);
    const running = activeBots.find(b => b.username === c.username);
    return {
      username: c.username,
      label: c.label || '',
      command: c.command || '/s1',
      version: c.version || config.version || '',
      host: c.host || config.host || '',
      port: c.port || config.port || 0,
      status: running?.player ? 'online' : 'offline',
      ciEnabled: s.ciEnabled,
      antiteleportEnabled: s.antiteleportEnabled
    };
  });
}

function emitStatus() {
  io.emit('status', getBotsStatus());
}

function buildInitPayload() {
  return {
    bots: getBotsStatus(),
    logDate: activeLogDay,
    logs: [...logs].slice(-400).reverse(),
    config: {
      host: config.host,
      port: config.port,
      version: config.version,
      warpCommand: config.warpCommand || '',
      panelPort: config.panelPort,
      tgTemplate: (typeof config.tgTemplate === 'string' && config.tgTemplate.trim()) ? config.tgTemplate : DEFAULT_TG_TEMPLATE
    }
  };
}

io.on('connection', (socket) => {
  socket.emit('init', buildInitPayload());

  socket.on('command', (cmd) => {
    if (cmd === 'restart') startBots();
  });

  socket.on('send_command', (payload) => {
    const { username, text } = payload || {};
    if (!text) return;
    const bot = activeBots.find(b => b.username === username);
    if (bot?.player) {
      bot.sendLoggedChat?.(text);
      socket.emit('send_command_result', { success: true, username, text });
    } else {
      socket.emit('send_command_result', { success: false, reason: 'Бот оффлайн' });
    }
  });

  socket.on('toggle_ci', (payload) => {
    const { username } = payload || {};
    const s = getBotState(username);
    s.ciEnabled = !s.ciEnabled;
    emitStatus();
  });

  socket.on('toggle_antiteleport', (payload) => {
    const { username } = payload || {};
    const s = getBotState(username);
    s.antiteleportEnabled = !s.antiteleportEnabled;
    emitStatus();
  });

  socket.on('bot_start', (payload) => {
    const { username } = payload || {};
    const cfg = (config.bots || botsConfig).find(c => c.username === username);
    if (!cfg) return;
    const existing = activeBots.find(b => b.username === username);
    if (existing) return;
    const bot = createBot(cfg);
    activeBots.push(bot);
    emitStatus();
  });

  socket.on('bot_restart', (payload) => {
    const { username } = payload || {};
    const cfg = (config.bots || botsConfig).find(c => c.username === username);
    if (!cfg) return;
    restartBot(cfg);
    emitStatus();
  });

  socket.on('bot_stop', (payload) => {
    const { username } = payload || {};
    const rec = getBotReconnect(username);
    clearTimeout(rec.timer);
    rec.reconnecting = false;
    const idx = activeBots.findIndex(b => b.username === username);
    if (idx === -1) { emitStatus(); return; }
    try { activeBots[idx].quit(); } catch(e) {}
    activeBots.splice(idx, 1);
    onBotOffline();
    emitStatus();
  });

  function botUsesGlobal(cfg, key) {
    return !cfg[key] || cfg[key] === 0;
  }

  function restartBot(cfg) {
    const rec = getBotReconnect(cfg.username);
    clearTimeout(rec.timer);
    rec.reconnecting = false;
    const idx = activeBots.findIndex(b => b.username === cfg.username);
    if (idx >= 0) {
      try { activeBots[idx].quit(); } catch(e) {}
      activeBots.splice(idx, 1);
      onBotOffline();
    }
    const bot = createBot(cfg);
    activeBots.push(bot);
  }

  socket.on('save_bot', (payload) => {
    const u = (payload?.username || '').trim();
    if (!u) return;
    if (!config.bots) config.bots = [];
    const idx = config.bots.findIndex(b => b.username === u);
    const entry = {
      username: u,
      command: payload.command || '/s1',
      label: payload.label || 'S1',
      password: payload.password || '',
      version: payload.version || '',
      host: payload.host || '',
      port: payload.port || 0
    };
    if (idx >= 0) config.bots[idx] = entry;
    else config.bots.push(entry);
    saveConfigFile();

    // Бот запущен или ждёт переподключения — перезапускаем с новыми host/port/версией
    const rec = getBotReconnect(u);
    if (activeBots.some(b => b.username === u) || rec.reconnecting) {
      restartBot(entry);
    }

    emitStatus();
    io.emit('init', buildInitPayload());
  });

  socket.on('remove_bot', (payload) => {
    const u = (payload?.username || '').trim();
    const rec = getBotReconnect(u);
    clearTimeout(rec.timer);
    rec.reconnecting = false;
    const idx = activeBots.findIndex(b => b.username === u);
    if (idx >= 0) { try { activeBots[idx].quit(); } catch(e) {} activeBots.splice(idx, 1); }
    config.bots = (config.bots || []).filter(b => b.username !== u);
    onBotOffline();
    saveConfigFile();
    emitStatus();
    io.emit('init', buildInitPayload());
  });

  socket.on('update_settings', (patch) => {
    if (!patch) return;
    let changed = false;
    let restartAll = false;

    if (patch.host && patch.host !== config.host) { config.host = patch.host; changed = true; restartAll = true; }
    if (patch.port && Number(patch.port) !== config.port) { config.port = Number(patch.port); changed = true; restartAll = true; }
    if (patch.version && patch.version !== config.version) { config.version = patch.version; changed = true; restartAll = true; }
    if (patch.password && patch.password !== config.password) { config.password = patch.password; changed = true; }
    if (patch.warpCommand !== undefined && patch.warpCommand !== config.warpCommand) { config.warpCommand = patch.warpCommand; changed = true; }
    if (patch.tgTemplate !== undefined && patch.tgTemplate !== config.tgTemplate) { config.tgTemplate = patch.tgTemplate; changed = true; }

    if (!changed) return;
    saveConfigFile();

    if (restartAll) {
      const cfg = config.bots || botsConfig;
      for (const c of cfg) {
        if (botUsesGlobal(c, 'host') || botUsesGlobal(c, 'port') || botUsesGlobal(c, 'version')) {
          restartBot(c);
        }
      }
    }

    io.emit('init', buildInitPayload());
  });

});

app.get('/health', (req, res) => res.send('OK'));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[WEB] Порт ${process.env.PORT || config.panelPort || 4218} занят.`);
  }
});
server.listen(process.env.PORT || config.panelPort || 4218, '0.0.0.0', () => {
  console.log(`[WEB] Panel ready on port ${process.env.PORT || config.panelPort || 4218}`);
});

startBots();
