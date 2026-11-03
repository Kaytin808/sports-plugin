const { config } = require('./config');
const { TimedCache } = require('./cache');

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';
const scheduleCache = new TimedCache(config.scheduleCacheMs);

function ymd(date, timeZone = config.timeZone, separator = '') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return [get('year'), get('month'), get('day')].join(separator);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function cleanTeamName(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length % 2 === 0) {
    const middle = words.length / 2;
    const first = words.slice(0, middle).join(' ').toLowerCase();
    const second = words.slice(middle).join(' ').toLowerCase();
    if (first === second) return words.slice(0, middle).join(' ');
  }
  return words.join(' ');
}

function teamFrom(competition, side) {
  const competitor = (competition.competitors || []).find((entry) => entry.homeAway === side) || {};
  const team = competitor.team || {};
  return {
    id: String(team.id || '0'),
    displayName: cleanTeamName(team.displayName || team.shortDisplayName || side),
    shortName: cleanTeamName(team.shortDisplayName || team.name || team.displayName || side),
    nickname: cleanTeamName(team.name || team.shortDisplayName || side),
    location: team.location || '',
    abbreviation: team.abbreviation || '',
    logo: team.logo || '',
    color: normalizeColor(team.color, side === 'home' ? '0b3a82' : 'bb1020'),
    alternateColor: normalizeColor(team.alternateColor, side === 'home' ? '56a8ff' : 'ff6372'),
    record: competitor.records?.[0]?.summary || ''
  };
}

function normalizeColor(value, fallback) {
  const clean = String(value || '').replace('#', '');
  return /^[0-9a-f]{6}$/i.test(clean) ? clean.toUpperCase() : fallback.toUpperCase();
}

function normalizeEvent(event) {
  const competition = event.competitions?.[0] || {};
  const home = teamFrom(competition, 'home');
  const away = teamFrom(competition, 'away');
  const broadcasts = [...new Set(
    (competition.broadcasts || []).flatMap((broadcast) => broadcast.names || [])
  )];
  const venue = competition.venue?.fullName || '';
  const status = event.status?.type || {};

  return {
    id: String(event.id),
    name: `${away.displayName} at ${home.displayName}`,
    shortName: event.shortName || `${away.abbreviation} @ ${home.abbreviation}`,
    date: event.date,
    home,
    away,
    broadcasts,
    venue,
    status: status.detail || status.description || 'Scheduled',
    state: status.state || 'pre'
  };
}

async function requestSchedule(dateExpression) {
  const key = `scoreboard:${dateExpression}`;
  const cached = scheduleCache.get(key);
  if (cached) return cached;

  const url = new URL(SCOREBOARD_URL);
  url.searchParams.set('dates', dateExpression);
  url.searchParams.set('limit', '1000');
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'DugoutLive/0.1 (private self-hosted addon)'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Schedule service returned HTTP ${response.status}`);
  const json = await response.json();
  return scheduleCache.set(key, (json.events || []).map(normalizeEvent));
}

async function getTodayGames(timeZone = config.timeZone) {
  const today = ymd(new Date(), timeZone);
  const games = await requestSchedule(today);
  return games
    .filter((game) => ymd(new Date(game.date), timeZone) === today)
    .sort((left, right) => new Date(left.date) - new Date(right.date));
}

async function getUpcomingGames(timeZone = config.timeZone, limit = 20, lookaheadDays = 45) {
  const now = new Date();
  const expression = `${ymd(now, timeZone)}-${ymd(addDays(now, lookaheadDays), timeZone)}`;
  const games = await requestSchedule(expression);
  const todayKey = ymd(now, timeZone);
  const upcoming = games
    .filter((game) => game.date && ymd(new Date(game.date), timeZone) >= todayKey)
    .sort((left, right) => new Date(left.date) - new Date(right.date));
  return Number.isFinite(limit) ? upcoming.slice(0, limit) : upcoming;
}

async function getFullUpcomingSchedule(timeZone = config.timeZone) {
  return getUpcomingGames(timeZone, Number.POSITIVE_INFINITY, 120);
}

async function getGame(id, timeZone = config.timeZone) {
  const today = await getTodayGames(timeZone);
  const fromToday = today.find((game) => game.id === String(id));
  if (fromToday) return fromToday;
  const upcoming = await getUpcomingGames(timeZone, 100);
  return upcoming.find((game) => game.id === String(id)) || null;
}

function formatDateTime(iso, timeZone = config.timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(iso));
}

function formatTime(iso, timeZone = config.timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(iso));
}

function calendarReleaseDate(iso, timeZone = config.timeZone, preserveSourceDate = false) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sourceDate = String(iso).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const calendarDate = preserveSourceDate && sourceDate
    ? sourceDate
    : ymd(date, timeZone, '-');
  return `${calendarDate}T12:00:00.000Z`;
}

module.exports = {
  SCOREBOARD_URL,
  getTodayGames,
  getUpcomingGames,
  getFullUpcomingSchedule,
  getGame,
  formatDateTime,
  formatTime,
  calendarReleaseDate,
  ymd,
  normalizeEvent,
  cleanTeamName
};
