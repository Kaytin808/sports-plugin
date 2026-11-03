const { config } = require('./config');
const { TimedCache } = require('./cache');
const { LEAGUES } = require('./sports');
const { normalizeEvent, ymd } = require('./espn');

const cache = new TimedCache(config.scheduleCacheMs);

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function athleteImage(athlete, league) {
  const supplied = typeof athlete?.headshot === 'string'
    ? athlete.headshot
    : athlete?.headshot?.href;
  if (supplied) return supplied;
  if (league.id === 'ufc' && athlete?.id) {
    return `https://a.espncdn.com/i/headshots/mma/players/full/${athlete.id}.png`;
  }
  return '';
}

function normalizeParticipant(competitor, league) {
  const athlete = competitor.athlete || {};
  const team = competitor.team || {};
  return {
    id: String(athlete.id || team.id || competitor.id || ''),
    name: athlete.displayName || team.displayName || competitor.displayName || '',
    shortName: athlete.shortName || team.shortDisplayName || competitor.displayName || '',
    logo: athleteImage(athlete, league) || team.logo || ''
  };
}

function statusFrom(raw, competition = {}) {
  const status = competition.status?.type || raw.status?.type || {};
  return {
    status: status.detail || status.description || 'Scheduled',
    state: status.state || 'pre'
  };
}

function matchupSide(participant, color, alternateColor) {
  const words = participant.name.split(/\s+/).filter(Boolean);
  const initials = words.map((word) => word[0]).join('').slice(0, 3).toUpperCase();
  return {
    id: participant.id,
    displayName: participant.name,
    shortName: participant.shortName || participant.name,
    nickname: participant.name,
    abbreviation: initials,
    logo: participant.logo,
    color,
    alternateColor,
    record: ''
  };
}

function normalizeUfcBouts(raw, league) {
  const bouts = (raw.competitions || []).flatMap((competition, index) => {
    const participants = (competition.competitors || [])
      .map((competitor) => normalizeParticipant(competitor, league))
      .filter((participant) => participant.name);
    if (participants.length < 2) return [];
    const [left, right] = participants;
    return [{
      id: String(competition.id || `${raw.id}-${index}`),
      parentId: String(raw.id),
      kind: 'matchup',
      leagueId: league.id,
      leagueName: league.name,
      eventName: raw.name || raw.shortName || league.name,
      name: `${left.name} vs ${right.name}`,
      shortName: `${left.shortName || left.name} vs ${right.shortName || right.name}`,
      date: competition.date || raw.date,
      participants,
      away: matchupSide(left, '1B4E9B', '6EA8FF'),
      home: matchupSide(right, 'B51228', 'FF6B7C'),
      venue: competition.venue?.fullName || raw.competitions?.[0]?.venue?.fullName || '',
      ...statusFrom(raw, competition),
      timeQualifier: 'CARD START'
    }];
  });
  return bouts;
}

const F1_SESSION_NAMES = {
  FP1: 'Practice 1',
  FP2: 'Practice 2',
  FP3: 'Practice 3',
  SS: 'Sprint Qualifying',
  SR: 'Sprint',
  Qual: 'Qualifying',
  Race: 'Race'
};

function normalizeF1Sessions(raw, league) {
  return (raw.competitions || []).map((competition, index) => {
    const abbreviation = competition.type?.abbreviation || '';
    const session = F1_SESSION_NAMES[abbreviation] || abbreviation || `Session ${index + 1}`;
    return {
      id: String(competition.id || `${raw.id}-${index}`),
      parentId: String(raw.id),
      kind: 'event',
      leagueId: league.id,
      leagueName: league.name,
      eventName: raw.name || raw.shortName || league.name,
      name: `${raw.shortName || raw.name || league.name} — ${session}`,
      shortName: `${raw.shortName || raw.name || league.name} — ${session}`,
      date: competition.date || raw.date,
      participants: [],
      venue: competition.venue?.fullName || raw.competitions?.[0]?.venue?.fullName || '',
      session,
      ...statusFrom(raw, competition)
    };
  });
}

function normalizeTennisMatches(raw, league, startDate, endDate) {
  return (raw.competitions || []).flatMap((competition) => {
    if (!competition.date || competition.timeValid === false) return [];
    const dateKey = ymd(new Date(competition.date), config.timeZone);
    if (dateKey < startDate || dateKey > endDate) return [];
    const participants = (competition.competitors || []).map((competitor) => {
      const name = competitor.name || '';
      const id = String(competitor.id || '');
      const hasIndividualImage = id && id !== '2147483647' && !name.includes('/');
      return {
        id,
        name,
        shortName: name,
        logo: hasIndividualImage
          ? `https://a.espncdn.com/i/headshots/tennis/players/full/${id}.png`
          : ''
      };
    }).filter((participant) => participant.name && participant.name !== 'TBD');
    if (participants.length < 2) return [];
    const [left, right] = participants;
    const round = competition.round?.description || competition.type?.text || 'Match';
    const court = competition.court?.description || competition.venue?.address?.summary || '';
    return [{
      id: String(competition.id || `${raw.id}-${dateKey}`),
      parentId: String(raw.id),
      kind: 'matchup',
      leagueId: league.id,
      leagueName: league.name,
      eventName: raw.name || raw.shortName || league.name,
      name: `${left.name} vs ${right.name}`,
      shortName: `${left.shortName} vs ${right.shortName}`,
      date: competition.date,
      participants,
      away: matchupSide(left, '758B16', 'C9DC54'),
      home: matchupSide(right, '4A246B', 'A86BDD'),
      venue: court,
      status: 'Scheduled',
      state: 'pre',
      timeQualifier: round.toUpperCase()
    }];
  });
}

function normalizeGeneralEvent(raw, league) {
  if (league.mode === 'team') {
    return { ...normalizeEvent(raw), kind: 'team', leagueId: league.id, leagueName: league.name };
  }
  const competition = raw.competitions?.[0] || {};
  const participants = (competition.competitors || [])
    .map((competitor) => normalizeParticipant(competitor, league))
    .filter((participant) => participant.name);
  return {
    id: String(raw.id),
    kind: 'event',
    leagueId: league.id,
    leagueName: league.name,
    name: raw.name || raw.shortName || league.name,
    shortName: raw.shortName || raw.name || league.name,
    date: raw.date,
    endDate: raw.endDate || '',
    allDay: ['pga', 'atp', 'wta'].includes(league.id),
    participants,
    venue: competition.venue?.fullName || '',
    ...statusFrom(raw, competition)
  };
}

function normalizeGeneralEvents(raw, league) {
  if (league.id === 'ufc') {
    const bouts = normalizeUfcBouts(raw, league);
    if (bouts.length) return bouts;
  }
  if (league.id === 'f1') {
    const sessions = normalizeF1Sessions(raw, league);
    if (sessions.length) return sessions;
  }
  return [normalizeGeneralEvent(raw, league)];
}

async function requestLeague(leagueId, startDate, endDate = startDate) {
  const league = LEAGUES[leagueId];
  if (!league) return [];
  const expression = endDate === startDate ? startDate : `${startDate}-${endDate}`;
  const key = `${leagueId}:${expression}`;
  const cached = cache.get(key);
  if (cached) return cached;

  if (league.id === 'atp' || league.id === 'wta') {
    const expressions = [...new Set([startDate, expression])];
    const scoreboards = await Promise.all(expressions.map(async (dates) => {
      const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/${league.path}/scoreboard`);
      url.searchParams.set('dates', dates);
      url.searchParams.set('limit', '1000');
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'DugoutLive/1.0' },
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error(`${league.name} schedule returned HTTP ${response.status}`);
      return response.json();
    }));
    const rawById = new Map(scoreboards.flatMap((json) => json.events || []).map((event) => [String(event.id), event]));
    const expanded = await Promise.all([...rawById.values()].map(async (raw) => {
      try {
        const coreUrl = `https://sports.core.api.espn.com/v2/sports/tennis/leagues/${league.id}/events/${encodeURIComponent(raw.id)}?lang=en&region=us`;
        const response = await fetch(coreUrl, {
          headers: { accept: 'application/json', 'user-agent': 'DugoutLive/1.0' },
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const details = await response.json();
        const matches = normalizeTennisMatches(details, league, startDate, endDate);
        if (matches.length) return matches;
      } catch {
        // Keep a tournament-level fallback when detailed draws are temporarily unavailable.
      }
      const fallback = normalizeGeneralEvent(raw, league);
      const fallbackKey = fallback.date ? ymd(new Date(fallback.date), config.timeZone) : '';
      return fallbackKey >= startDate && fallbackKey <= endDate ? [fallback] : [];
    }));
    return cache.set(key, expanded.flat());
  }

  const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/${league.path}/scoreboard`);
  url.searchParams.set('dates', expression);
  url.searchParams.set('limit', '1000');
  for (const [name, value] of Object.entries(league.params || {})) url.searchParams.set(name, value);
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'DugoutLive/1.0' },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`${league.name} schedule returned HTTP ${response.status}`);
  const json = await response.json();
  return cache.set(key, (json.events || []).flatMap((event) => normalizeGeneralEvents(event, league)));
}

async function getRemainingLeagueSchedule(leagueId, timeZone = config.timeZone) {
  const league = LEAGUES[leagueId];
  if (!league) return [];
  const now = new Date();
  const chunkDays = 45;
  const requests = [];
  for (let offset = 0; offset < league.lookaheadDays; offset += chunkDays) {
    const chunkStart = ymd(addDays(now, offset), timeZone);
    const chunkEnd = ymd(addDays(now, Math.min(offset + chunkDays, league.lookaheadDays)), timeZone);
    requests.push(requestLeague(leagueId, chunkStart, chunkEnd));
  }
  const chunks = await Promise.all(requests);
  const byId = new Map(chunks.flat().map((event) => [event.id, event]));
  const todayKey = ymd(now, timeZone);
  return [...byId.values()]
    .filter((event) => event.date && ymd(new Date(event.date), timeZone) >= todayKey)
    .sort((left, right) => new Date(left.date) - new Date(right.date));
}

async function getLeagueScheduleWindow(leagueId, timeZone = config.timeZone, days = 7) {
  const league = LEAGUES[leagueId];
  if (!league || !Number.isInteger(days) || days < 1) return [];
  const now = new Date();
  const startKey = ymd(now, timeZone);
  const endKey = ymd(addDays(now, days - 1), timeZone);
  const events = await requestLeague(leagueId, startKey, endKey);
  return events
    .filter((event) => {
      if (!event.date) return false;
      const eventKey = ymd(new Date(event.date), timeZone);
      return eventKey >= startKey && eventKey <= endKey;
    })
    .sort((left, right) => new Date(left.date) - new Date(right.date));
}

async function getLeagueEvent(leagueId, eventId, timeZone = config.timeZone) {
  const currentWindow = await getLeagueScheduleWindow(leagueId, timeZone, 7);
  const current = currentWindow.find((event) => event.id === String(eventId));
  if (current) return current;
  const events = await getRemainingLeagueSchedule(leagueId, timeZone);
  return events.find((event) => event.id === String(eventId)) || null;
}

module.exports = {
  athleteImage,
  normalizeParticipant,
  normalizeGeneralEvent,
  normalizeGeneralEvents,
  normalizeUfcBouts,
  normalizeF1Sessions,
  normalizeTennisMatches,
  requestLeague,
  getRemainingLeagueSchedule,
  getLeagueScheduleWindow,
  getLeagueEvent
};
