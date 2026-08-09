// bot.js
const { TelegramBot } = require('node-telegram-bot-api');
const mineflayer = require('mineflayer');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// Время в консоли (cmd)
const _origLog = console.log;
const _origError = console.error;
function consoleTs() { return new Date().toLocaleTimeString('ru-RU', { timeZone: process.env.TZ || 'Asia/Yekaterinburg' }); }
console.log = (...args) => _origLog(`[${consoleTs()}]`, ...args);
console.error = (...args) => _origError(`[${consoleTs()}]`, ...args);

// Хелпер для форматирования даты/времени в нужной таймзоне
const TZ = process.env.TZ || 'Asia/Yekaterinburg';
function fmtDate(d) { return d.toLocaleDateString('ru-RU', { timeZone: TZ }); }
function fmtTime(d) { return d.toLocaleTimeString('ru-RU', { timeZone: TZ }); }
const CONFIG_PATH = path.join(__dirname, 'config.json');
const LOGS_DIR = path.join(__dirname, 'logs');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function getLogFileName(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getLogFilePath(date = new Date(), extension = '.json') {
  return path.join(LOGS_DIR, `${getLogFileName(date)}${extension}`);
}

function loadTodayLogs() {
  const filePath = getLogFilePath(new Date(), '.json');
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }
  return [];
}

function saveTodayLogs(logsArray) {
  const filePath = getLogFilePath(new Date(), '.json');
  fs.writeFileSync(filePath, JSON.stringify(logsArray, null, 2), 'utf8');
}

function formatTextLogEntry(entry) {
  const now = entry?.timestamp ? new Date(entry.timestamp) : new Date();
  const date = entry?.date || fmtDate(now);
  const time = entry?.time || fmtTime(now);
  const bot = entry?.bot || 'system';
  const type = entry?.type || 'info';
  const user = entry?.username ? `${entry.username}: ` : '';
  const text = entry?.text || '';
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

function ensureTextArchive(logsArray) {
  if (!Array.isArray(logsArray) || !logsArray.length) return;
  const filePath = getLogFilePath(new Date(), '.txt');
  try {
    const lines = logsArray.map(formatTextLogEntry);
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8').trim() !== lines.join('\n').trim()) {
      fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
    }
  } catch (err) {
    console.error('[LOGS] Plain-text archive sync failed:', err.message);
  }
}

//Лузарим ботик
const DEFAULT_TG_TEMPLATE = '{emoji} Нарушение\n📅 Дата: {date}, {time}\n🎮 Режим: {mode}\n👤 Игрок: {player}\n⚖️ Правило: {rule}\n📋 Описание: {desc}\n💬 Сообщение: {message}\n🚨 Наказание: {punishment}';

const defaultConfig = {
  host: 'eu.cheatmine.net',
  port: 25565,
  password: 'Твой_ПЭССВАРД',
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
      spamWindowMs: 1500,
      minMessageLength: 2,
      floodThreshold: 3
    },
    '2.9': {
      title: 'Разжигание розни',
      words: ['ниггер','нигга','хохол','фашист','нацист','расист','антисемит','черножопый','чурка','армянин','кацап','nigger','niga','нигер','white trash','угнетатель','расизм','нацизм']
    },
    '2.10': {
      title: 'Введение в заблуждение',
      words: ['я админ','я создатель','я владелец','я хелпер','раздача','бесплатный донат','вас взломали','обновление','новая версия','скачать','это официальный сайт','админ разрешил','модер разрешил']
    },
    '2.13': {
      title: 'Реклама',
      words: [],
      advertisingPattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b|(?:[a-zA-Z0-9-]+\\.)+(?:com|ru|net|org|me|gg|su|рф|online|site|xyz)\\b|www\\.|https?://',
      scamExtra: '(?:бесплатн|free|scam|раздач|халява|click|перейди|забери)'
    },
    '2.14': {
      title: 'Угрозы',
      words: ['убью','зарежу','приеду','найду','поколочу','изобью','тебе конец','ты покойник','тебе крышка','уничтожу','уничтожу тебя','kill you','убью тебя','задушу','сломаю','переломаю','сожгу','взорву','затоплю','тебе не жить','готовься','берегись']
    }
  }
};

let config;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      config = JSON.parse(raw);
      if (config.rules && config.rules['2.13']) {
        const rule = config.rules['2.13'];
        if (typeof rule.advertisingPattern === 'string') {
          rule.advertisingPattern = new RegExp(rule.advertisingPattern, 'i');
        }
        if (typeof rule.scamExtra === 'string') {
          rule.scamExtra = new RegExp(rule.scamExtra, 'i');
        }
      }
    } else {
      config = JSON.parse(JSON.stringify(defaultConfig));
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[CONFIG] Error loading config, using defaults:', err.message);
    config = JSON.parse(JSON.stringify(defaultConfig));
  }
}
loadConfig();

// Переопределяем пароль из переменной окружения если задана
if (process.env.MC_PASSWORD) config.password = process.env.MC_PASSWORD;

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
    tgBot.sendMessage(msg.chat.id, '⚡ *Модер-бот*\n\n/status — статус\n/players — игроки\n/chat _текст_ — чат\n/restart — перезапуск ботов\n/clear — очистить логи\n/logs — последние нарушения');
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
    alive.chat(match[1]);
    tgBot.sendMessage(msg.chat.id, `✅ Отправлено: ${match[1]}`);
  });

  tgBot.onText(/\/restart/, (msg) => {
    if (!isAdmin(msg)) return;
    startBots();
    tgBot.sendMessage(msg.chat.id, '🔄 Боты перезапущены.');
  });

  tgBot.onText(/\/clear/, (msg) => {
    if (!isAdmin(msg)) return;
    logs = [];
    saveTodayLogs(logs);
    if (io) io.emit('clearLogs');
    tgBot.sendMessage(msg.chat.id, '🧹 Логи очищены.');
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

//Переменные
let logs = loadTodayLogs();
let logsDirty = false;
let io;

// Сохраняем логи на диск не чаще раза в 3 секунды
setInterval(() => {
  if (logsDirty) {
    logsDirty = false;
    saveTodayLogs(logs);
  }
}, 3000);

const recentMessages = new Map();

function isDuplicate(username, message) {
  const key = `${username}:${cleanText(message)}`;
  const now = Date.now();
  const lastTime = recentMessages.get(key) || 0;
  if (now - lastTime < 2000) {
    return true;
  }
  recentMessages.set(key, now);
  if (Math.random() < 0.1) {
    const cutoff = Date.now() - 5000;
    for (const [k, time] of recentMessages) {
      if (time < cutoff) recentMessages.delete(k);
    }
  }
  return false;
}

function addPanelLog(type, text, botLabel, username) {
  const now = new Date();
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
  appendTextLogEntry(entry);
  if (io) io.emit('log', entry);
  console.log(`[${entry.bot}][${type.toUpperCase()}] ${text}`);
  logsDirty = true;
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
  addPanelLog('chat', `${username}: ${message}`, botLabel, username);
}

function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight - now;
  setTimeout(() => {
    // Дописываем логи в файл истёкшего дня (имя считаем от "вчера")
    const prev = new Date(Date.now() - 1000);
    const y = prev.getFullYear();
    const m = String(prev.getMonth() + 1).padStart(2, '0');
    const d = String(prev.getDate()).padStart(2, '0');
    const prevLogFile = path.join(LOGS_DIR, `${y}-${m}-${d}.json`);
    const prevTextFile = path.join(LOGS_DIR, `${y}-${m}-${d}.txt`);
    try {
      fs.writeFileSync(prevLogFile, JSON.stringify(logs, null, 2), 'utf8');
      if (logs.length) {
        fs.writeFileSync(prevTextFile, `${logs.map(formatTextLogEntry).join('\n')}\n`, 'utf8');
      }
    } catch (err) {
      console.error('[LOGS] Rotation save failed:', err.message);
    }
    logs = [];
    logsDirty = false;
    // Историю на клиентах не стираем — логи хранятся за всё время
    console.log('[LOGS] New day started, logs rotated.');
    scheduleMidnightReset();
  }, msUntilMidnight);
}
scheduleMidnightReset();

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

function isAdvertising(text) {
  const pattern = config.rules['2.13'].advertisingPattern;
  if (!pattern) return false;
  try { return pattern.test(text); } catch { return false; }
}

function isScamLink(text) {
  const rule = config.rules['2.13'];
  if (!rule.scamExtra) return isAdvertising(text);
  try { return isAdvertising(text) && rule.scamExtra.test(text); } catch { return isAdvertising(text); }
}

const playerMsgTimes = new Map();

//ну кста спам не логирует, т.к хуй знает криво косо ну да

function isFlood(username, message) {
  const rule = config.rules['2.7'];
  const now = Date.now();
  if (message.length < (rule.minMessageLength || 2)) return false;
  if (!playerMsgTimes.has(username)) playerMsgTimes.set(username, []);
  const times = playerMsgTimes.get(username);
  const windowMs = rule.spamWindowMs || 1500;   // используется для окна флуда
  const floodThreshold = rule.floodThreshold || 3;
  const recent = times.filter(entry => now - entry.time < windowMs);
  if (recent.length < floodThreshold) return false;
  const lastN = recent.slice(-floodThreshold);
  const firstText = lastN[0].text;
  return lastN.every(entry => entry.text === firstText);
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



//Контекст
function isClanAdvertisement(message) {
  const lower = message.toLowerCase();
  const adMarkers = [
    'вступай', 'join', 'клан', 'розыгрыш', 'донат кейс', 'зарплата', 'помощь',
    '@daily', '@help', '/warp', '/c join', 'выдаем', 'выдаём', 'предоставляем',
    'раздаём', 'даём', 'даем', 'вам дадим', 'получите', 'промокод', 'скидка',
    'реклама', 'акция', 'спецпредложение', 'набор в клан', 'приглашаем'
  ];
  const personalRequestMarkers = ['мне', 'я хочу', 'хочу', 'нужно', 'прошу', 'give me', 'plz', 'pls'];
  const hasAdMarker = adMarkers.some(marker => lower.includes(marker));
  const hasPersonalRequest = personalRequestMarkers.some(m => lower.includes(m));
  return hasAdMarker && !hasPersonalRequest;
}

//Проверка нарушений
function checkViolations(username, message, botLabel) {
  if (isDuplicate(username, message)) return;
  const cleaned = cleanText(message);
  let violation = null;
  const rules = config.rules;

  if (containsAny(cleaned, rules['2.14'].words)) {
    violation = '2.14 (Угрозы) — бан 5ч';
  } else if (containsAny(cleaned, rules['2.9'].words)) {
    violation = '2.9 (Разжигание розни) — бан 2д';
  } else if (isAdvertising(message)) {
    if (isScamLink(message)) {
      violation = '2.13 (Скам-реклама) — пермаментный бан';
    } else {
      violation = '2.13 (Реклама) — бан 3ч';
    }
  } else if (containsAny(cleaned, rules['2.3'].words) && containsAny(cleaned, rules['2.1'].words)) {
    violation = '2.3 (Личная жизнь + оскорбление) — мут 1д';
  } else if (containsAny(cleaned, rules['2.1'].words)) {
    violation = '2.1 (Оскорбление) — мут 1ч';
  } else if (containsAny(cleaned, rules['2.4'].words)) {
    violation = '2.4 (Провокация) — мут 45м';
  } else if (containsAny(cleaned, rules['2.5'].words)) {
    if (!isClanAdvertisement(message)) {
      violation = '2.5 (Попрошайничество) — мут 45м';
    }
  } else if (containsAny(cleaned, rules['2.10'].words)) {
    violation = '2.10 (Введение в заблуждение) — мут 45м';
  } else if (countUpperCaseWords(message) >= (rules['2.7'].capsThreshold || 4)) {
    violation = '2.7 (Капс) — мут 30м';
  } else if (isFlood(username, message)) {
    violation = '2.7 (Флуд) — мут 20м';
  }

  if (violation) {
    const logText = `[${username}]: ${message} → ${violation}`;
    addPanelLog('action', logText, botLabel);
    tgNotify(tgFormatted(username, message, violation, botLabel));
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
    bot.chat(`/l ${config.password}`);
    setTimeout(() => {
      bot.chat(botInfo.command);
      console.log(`[${botInfo.label}] Sent ${botInfo.command}`);
      if (config.warpCommand?.trim()) {
        setTimeout(() => {
          bot.chat(config.warpCommand.trim());
          console.log(`[${botInfo.label}] Sent warp command: ${config.warpCommand.trim()}`);
        }, 2000);
      }
    }, 8000);

    clearInterval(ciInterval);
    ciInterval = setInterval(() => {
      const s = getBotState(botInfo.username);
      if (bot?.player && s.ciEnabled) bot.chat('/ci');
    }, 5 * 60 * 1000);
  });

  bot.on('chat', (username, message) => {
  if (username === bot.username) return;
  logChatMessage(botInfo.label, username, message);
  checkViolations(username, message, botInfo.label);
});


  bot.on('message', (jsonMsg) => {
    const msgText = toText(jsonMsg);
    if (!msgText) return;
    console.log(`[${botInfo.label}][SERVER] ${msgText}`);

    if (/регистрация|зарегистрируйтесь|войдите|введите пароль|\/login|\/register|авторизуйтесь/i.test(msgText)) {
      bot.chat(`/l ${config.password}`);
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
      setTimeout(() => { bot.chat(warpCmd); }, 1500);
      console.log(`[${botInfo.label}] Teleport detected, warping back: ${warpCmd}`);
    }

    if (/^\[(?:Rcon|Server|Info|Admin|Mod|System)\]/i.test(msgText)) return;

    const arrowPos = msgText.indexOf('⇨');
if (arrowPos === -1) return;

const afterArrow = msgText.substring(arrowPos + 1).trim();

let username = findUsername(jsonMsg);
if (!username) username = extractUsername(msgText);

if (username && username !== bot.username) {
    logChatMessage(botInfo.label, username, afterArrow);
    checkViolations(username, afterArrow, botInfo.label);
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
io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/logs', (req, res) => {
  res.json(logs);
});

// Вся история логов за все дни (кроме сегодняшнего — он приходит живым через сокет)
app.get('/api/logs/history', (req, res) => {
  const today = getLogFileName();
  let files;
  try {
    files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.json') && f !== `${today}.json`)
      .sort()
      .reverse(); // свежие даты первыми
  } catch { return res.json([]); }

  const all = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, file), 'utf8'));
      if (!Array.isArray(data)) continue;
      const dateShort = `${file.slice(8, 10)}.${file.slice(5, 7)}`; // DD.MM из YYYY-MM-DD.json
      for (let i = data.length - 1; i >= 0; i--) {
        const e = data[i];
        if (e && typeof e === 'object') {
          e.date = e.date || dateShort;
          all.push(e);
        }
      }
    } catch { /* пропускаем повреждённый файл */ }
  }
  res.json(all);
});

app.get('/api/config', (req, res) => res.json(config));

app.post('/api/clear', (req, res) => {
  logs = [];
  saveTodayLogs(logs);
  if (io) io.emit('clearLogs');
  res.json({ success: true });
});

app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  if (newConfig && typeof newConfig === 'object') {
    if (newConfig.host) config.host = newConfig.host;
    if (newConfig.port) config.port = newConfig.port;
    if (newConfig.password) config.password = newConfig.password;
    if (newConfig.version) config.version = newConfig.version;
    if (newConfig.warpCommand !== undefined) config.warpCommand = newConfig.warpCommand;
    if (newConfig.bots) config.bots = newConfig.bots;
    if (newConfig.rules) {
      for (const [ruleId, rule] of Object.entries(newConfig.rules)) {
        if (config.rules[ruleId]) {
          if (rule.words) config.rules[ruleId].words = rule.words;
          if (ruleId === '2.7') {
            if (rule.capsThreshold !== undefined) config.rules['2.7'].capsThreshold = rule.capsThreshold;
            if (rule.spamThreshold !== undefined) config.rules['2.7'].spamThreshold = rule.spamThreshold;
            if (rule.spamWindowMs !== undefined) config.rules['2.7'].spamWindowMs = rule.spamWindowMs;
            if (rule.minMessageLength !== undefined) config.rules['2.7'].minMessageLength = rule.minMessageLength;
            if (rule.floodThreshold !== undefined) config.rules['2.7'].floodThreshold = rule.floodThreshold;
          }
          if (ruleId === '2.13') {
            if (typeof rule.advertisingPattern === 'string') {
              config.rules['2.13'].advertisingPattern = new RegExp(rule.advertisingPattern, 'i');
            }
            if (typeof rule.scamExtra === 'string') {
              config.rules['2.13'].scamExtra = new RegExp(rule.scamExtra, 'i');
            }
          }
        }
      }
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, (key, value) => {
      if (value instanceof RegExp) return value.source;
      return value;
    }, 2), 'utf8');
    startBots();
    io.emit('configUpdated', config);
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
    logs: [...logs].slice(-400).reverse(),
    config: {
      host: config.host,
      port: config.port,
      version: config.version,
      warpCommand: config.warpCommand || '',
      panelPort: config.panelPort,
      tgTemplate: (typeof config.tgTemplate === 'string' && config.tgTemplate.trim()) ? config.tgTemplate : DEFAULT_TG_TEMPLATE
    },
    rules: config.rules || {}
  };
}

io.on('connection', (socket) => {
  socket.emit('init', buildInitPayload());

  socket.on('command', (cmd) => {
    if (cmd === 'restart') startBots();
    else if (cmd === 'clear') { logs = []; saveTodayLogs(logs); io.emit('clearLogs'); }
  });

  socket.on('send_command', (payload) => {
    const { username, text } = payload || {};
    if (!text) return;
    const bot = activeBots.find(b => b.username === username);
    if (bot?.player) {
      bot.chat(text);
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

  function saveConfigFile() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, (key, value) => value instanceof RegExp ? value.source : value, 2), 'utf8');
  }

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

  socket.on('update_rules', (rules) => {
    if (!rules || typeof rules !== 'object') return;
    for (const [id, rule] of Object.entries(rules)) {
      if (config.rules[id] && Array.isArray(rule.words)) {
        config.rules[id].words = rule.words.filter(w => String(w).trim());
      }
    }
    saveConfigFile();
    io.emit('init', buildInitPayload());
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[WEB] Порт ${config.panelPort || 4218} занят.`);
  }
});
server.listen(config.panelPort || 4218, () => {
  console.log(`[WEB] Panel ready: http://localhost:${config.panelPort || 4218}`);
});

startBots();