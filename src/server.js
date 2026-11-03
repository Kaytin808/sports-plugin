const path = require('path');
const express = require('express');
const { config, xtreamConfigured } = require('./config');
const { getTodayGames, getUpcomingGames, getFullUpcomingSchedule, getGame, formatDateTime, formatTime, calendarReleaseDate, ymd } = require('./espn');
const { getStreamsWithEpg, playbackUrl, filterPlayableEntries, connectionSummary } = require('./xtream');
const { rankStreams, rankEventStreams } = require('./matcher');
const { LEAGUES, FOLDERS, foldersById } = require('./sports');
const { getLeagueScheduleWindow, getLeagueEvent } = require('./sports-data');
const {
  posterSvg,
  landscapeSvg,
  schedulePosterSvg,
  scheduleLandscapeSvg,
  leagueLogoSvg,
  folderSvg,
  eventPosterSvg,
  eventLandscapeSvg
} = require('./art');
const { svgToPng } = require('./raster');

const app = express();
const ART_VERSION = '11';
// Nuvio can retain catalog/meta responses even when they are served with
// no-store. Change this namespace whenever the shape or calendar semantics of
// scheduled items changes so clients cannot reuse stale game metadata.
const DATA_VERSION = '15';
const accessPrefix = config.accessToken ? `/${config.accessToken}` : '';
const accessProfiles = [
  config.accessToken && { prefix: `/${config.accessToken}`, profile: 'default' },
  config.mikeAccessToken && { prefix: `/${config.mikeAccessToken}`, profile: 'mike' },
  config.familyAccessToken && { prefix: `/${config.familyAccessToken}`, profile: 'family' }
].filter(Boolean);
app.set('trust proxy', true);
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  if (!accessProfiles.length || req.path === '/health') return next();
  const accessProfile = accessProfiles.find(({ prefix }) => (
    req.url === prefix || req.url.startsWith(`${prefix}/`)
  ));
  if (!accessProfile) {
    return res.status(404).send('Not found');
  }
  req.accessPrefix = accessProfile.prefix;
  req.addonProfile = accessProfile.profile;
  req.url = req.url.slice(accessProfile.prefix.length) || '/';
  return next();
});
app.use(express.static(path.resolve(__dirname, '..', 'public')));

function hostFor(req) {
  const origin = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  return `${origin}${req.accessPrefix || accessPrefix}`;
}

function sendJson(res, body, cacheControl = 'no-store') {
  res.set('Cache-Control', cacheControl);
  res.type('application/json').send(JSON.stringify(body));
}

function gameId(eventId) {
  return `dugout:mlb:${eventId}`;
}

function gameDescription(game) {
  const recordLine = [
    game.away.record ? `${game.away.shortName} ${game.away.record}` : '',
    game.home.record ? `${game.home.shortName} ${game.home.record}` : ''
  ].filter(Boolean).join('  •  ');
  return [
    `${game.away.displayName} at ${game.home.displayName}`,
    formatDateTime(game.date, config.timeZone),
    game.venue,
    recordLine,
    game.broadcasts.length ? `Broadcasts: ${game.broadcasts.join(', ')}` : '',
    game.status
  ].filter(Boolean).join('\n');
}

function metaForGame(game, host) {
  return {
    id: gameId(game.id),
    type: 'sports',
    name: game.name,
    poster: `${host}/art/poster/mlb/${encodeURIComponent(game.id)}.png?v=${ART_VERSION}`,
    background: `${host}/art/background/mlb/${encodeURIComponent(game.id)}.png?v=${ART_VERSION}`,
    logo: `${host}/art/logo/mlb.png?v=${ART_VERSION}`,
    description: gameDescription(game)
  };
}

function scheduleMeta(host, description = 'View the complete remaining MLB schedule in your configured timezone.') {
  return {
    id: gameId('schedule'),
    type: 'sports',
    name: 'Upcoming Schedule',
    poster: `${host}/art/poster/mlb/schedule.png?v=${ART_VERSION}`,
    background: `${host}/art/background/mlb/schedule.png?v=${ART_VERSION}`,
    logo: `${host}/art/logo/mlb.png?v=${ART_VERSION}`,
    description
  };
}

function fullScheduleDescription(games) {
  if (!games.length) return 'No upcoming MLB games were found.';
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timeZone,
    hour: 'numeric',
    minute: '2-digit'
  });
  const groups = new Map();
  for (const game of games) {
    const date = new Date(game.date);
    const day = dayFormatter.format(date);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(`${timeFormatter.format(date)} — ${game.away.shortName} at ${game.home.shortName}`);
  }
  const sections = [...groups.entries()].map(([day, entries]) => `${day.toUpperCase()}\n${entries.join('\n')}`);
  return `Full Remaining MLB Schedule (${config.timeZone})\n${games.length} games\n\n${sections.join('\n\n')}`;
}

app.get('/health', (_req, res) => sendJson(res, { ok: true, service: 'Dugout Live' }, 'no-cache'));

app.get('/manifest.json', (req, res) => {
  const host = hostFor(req);
  const manifestIdentity = {
    mike: {
      id: 'local.dugout-live.sports.v2.mike',
      name: 'Dugout Live Sports Hub (Mike)'
    },
    family: {
      id: 'local.dugout-live.sports.v2.family',
      name: 'Dugout Live Sports Hub (Family)'
    }
  }[req.addonProfile] || {
    id: 'local.dugout-live.sports.v2',
    name: 'Dugout Live Sports Hub'
  };
  sendJson(res, {
    id: manifestIdentity.id,
    version: '2.2.3',
    name: manifestIdentity.name,
    description: 'A clean sports hub with rolling seven-day schedules and private Xtream playback.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['other', 'sports'],
    catalogs: [{
      type: 'other',
      id: `sports-hub-${DATA_VERSION}`,
      name: 'Sports'
    }],
    logo: `${host}/art/folder/baseball.png?v=${ART_VERSION}`,
    behaviorHints: { configurable: false, configurationRequired: false }
  });
});

app.get([
  '/catalog/other/sports-hub.json',
  '/catalog/channel/sports-hub.json',
  '/catalog/series/sports-hub.json',
  `/catalog/other/sports-hub-${DATA_VERSION}.json`,
  `/catalog/channel/sports-hub-${DATA_VERSION}.json`,
  `/catalog/series/sports-hub-${DATA_VERSION}.json`
], (req, res) => {
  const host = hostFor(req);
  const metas = FOLDERS.map((folder) => ({
    id: `folder:${folder.id}:${DATA_VERSION}`,
    type: 'other',
    name: folder.name,
    poster: `${host}/art/folder/${folder.id}.png?v=${ART_VERSION}`,
    posterShape: 'landscape',
    background: `${host}/art/folder/${folder.id}.png?v=${ART_VERSION}`,
    description: `${folder.subtitle}. Open for every scheduled event in the rolling seven-day window.`
  }));
  sendJson(res, { metas });
});

app.get(['/meta/other/:id.json', '/meta/channel/:id.json', '/meta/series/:id.json'], async (req, res, next) => {
  try {
    const [prefix, folderId] = req.params.id.split(':');
    const folder = prefix === 'folder' ? foldersById.get(folderId) : null;
    if (!folder) return sendJson(res, { meta: {} });
    const host = hostFor(req);
    const results = await Promise.allSettled(folder.leagues.map((leagueId) => getLeagueScheduleWindow(leagueId, config.timeZone, 7)));
    const scheduledEvents = [];
    results.forEach((result, leagueIndex) => {
      const league = LEAGUES[folder.leagues[leagueIndex]];
      if (result.status !== 'fulfilled') return;
      result.value.forEach((event) => scheduledEvents.push({ event, league }));
    });
    scheduledEvents.sort((left, right) => new Date(left.event.date) - new Date(right.event.date));

    const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: config.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const dayLabelFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timeZone,
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    const dayKeys = [];
    const dayLabels = new Map();
    for (const { event } of scheduledEvents) {
      const date = new Date(event.date);
      const key = dayKeyFormatter.format(date);
      if (!dayLabels.has(key)) {
        dayKeys.push(key);
        dayLabels.set(key, dayLabelFormatter.format(date));
      }
    }
    const videos = scheduledEvents.map(({ event, league }, index) => {
      const date = new Date(event.date);
      return {
          id: `dugout:${league.id}:${event.id}:${DATA_VERSION}`,
          title: '\u200B',
          // Nuvio renders this as a date-only label. Anchoring the event's
          // Phoenix calendar date at noon UTC prevents evening games from
          // appearing one day late because their real start is next-day UTC.
          released: calendarReleaseDate(event.date, config.timeZone, event.allDay),
          season: 1,
          episode: index + 1,
          thumbnail: `${host}/art/background/${league.id}/${event.id}.png?v=${ART_VERSION}`
      };
    });
    const today = new Date();
    const lastDay = new Date(today.getTime() + 6 * 86400000);
    const windowLabelFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const windowLabel = `${windowLabelFormatter.format(today)} – ${windowLabelFormatter.format(lastDay)}`;
    const dateGuide = dayKeys.map((key) => dayLabels.get(key)).join(' • ');
    sendJson(res, {
      meta: {
        id: req.params.id,
        type: 'other',
        name: folder.name,
        poster: `${host}/art/folder/${folder.id}.png?v=${ART_VERSION}`,
        posterShape: 'landscape',
        background: `${host}/art/folder/${folder.id}.png?v=${ART_VERSION}`,
        description: `${folder.subtitle}\n\nRolling seven-day schedule: ${windowLabel} (${config.timeZone}). Games are shown in one chronological list with no season tabs. The window advances automatically each day.\n\n${videos.length} events across ${dayKeys.length} active dates.${dateGuide ? `\n\nGame dates: ${dateGuide}` : ''}`,
        videos
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get(['/stream/other/:id.json', '/stream/channel/:id.json', '/stream/series/:id.json'], async (req, res, next) => {
  try {
    const [prefix, leagueId, eventId] = req.params.id.split(':');
    const league = LEAGUES[leagueId];
    const folder = FOLDERS.find((candidate) => candidate.leagues.includes(leagueId));
    if (prefix !== 'dugout' || !league || !folder || !eventId || !xtreamConfigured()) return sendJson(res, { streams: [] });
    const event = await getLeagueEvent(leagueId, eventId, config.timeZone);
    if (!event) return sendJson(res, { streams: [] });
    const categoryIds = config.xtream.sportCategoryIds[folder.id] || [];
    const candidates = await getStreamsWithEpg(categoryIds);
    const ranked = event.kind === 'team'
      ? rankStreams(candidates, event, config.matchMinScore, league.name)
      : rankEventStreams(candidates, event);
    const playable = await filterPlayableEntries(ranked);
    const streams = playable.map((entry) => ({
      name: entry.stream.name,
      title: [`${league.name} • ${entry.stream.categoryName || folder.name}`, `Match score ${entry.score}`, entry.reasons.join(' • ')].join('\n'),
      url: playbackUrl(entry.stream.id),
      behaviorHints: { notWebReady: true }
    }));
    sendJson(res, { streams });
  } catch (error) {
    next(error);
  }
});

app.get('/catalog/sports/:catalogId.json', async (req, res, next) => {
  try {
    const host = hostFor(req);
    const games = await getTodayGames(config.timeZone);
    const metas = games.map((game) => metaForGame(game, host));
    metas.push(scheduleMeta(
      host,
      games.length ? 'See the complete remaining MLB schedule.' : 'No MLB games today. Open this card for the complete schedule.'
    ));
    sendJson(res, { metas });
  } catch (error) {
    next(error);
  }
});

app.get('/meta/sports/:id.json', async (req, res, next) => {
  try {
    const host = hostFor(req);
    const [, league, eventId] = req.params.id.split(':');
    if (league !== 'mlb' || !eventId) return sendJson(res, { meta: {} });

    if (eventId === 'schedule') {
      const upcoming = await getFullUpcomingSchedule(config.timeZone);
      const description = fullScheduleDescription(upcoming);
      return sendJson(res, { meta: scheduleMeta(host, description) });
    }

    const game = await getGame(eventId, config.timeZone);
    return sendJson(res, { meta: game ? metaForGame(game, host) : {} });
  } catch (error) {
    next(error);
  }
});

app.get('/stream/sports/:id.json', async (req, res, next) => {
  try {
    const [, league, eventId] = req.params.id.split(':');
    if (league !== 'mlb' || !eventId || eventId === 'schedule' || !xtreamConfigured()) {
      return sendJson(res, { streams: [] });
    }
    const game = await getGame(eventId, config.timeZone);
    if (!game) return sendJson(res, { streams: [] });

    const candidates = await getStreamsWithEpg();
    const ranked = rankStreams(candidates, game);
    const playable = await filterPlayableEntries(ranked);
    const streams = playable.map((entry) => ({
      name: entry.stream.name,
      title: [
        `⚾ ${entry.stream.categoryName || 'MLB'}`,
        `Match score ${entry.score}`,
        entry.reasons.join(' • ')
      ].filter(Boolean).join('\n'),
      url: playbackUrl(entry.stream.id),
      behaviorHints: { notWebReady: true }
    }));
    return sendJson(res, { streams });
  } catch (error) {
    next(error);
  }
});

async function sendPng(res, svg, cacheKey, width, height, maxAge = 300) {
  const png = await svgToPng(svg, `${ART_VERSION}:${cacheKey}`, width, height);
  res.set('Cache-Control', `public, max-age=${maxAge}`).type('image/png').send(png);
}

app.get('/art/poster/mlb/schedule.png', async (_req, res, next) => {
  try {
    await sendPng(res, schedulePosterSvg(), 'poster:mlb:schedule', 600, 900, 3600);
  } catch (error) {
    next(error);
  }
});

app.get('/art/background/mlb/schedule.png', async (_req, res, next) => {
  try {
    await sendPng(res, scheduleLandscapeSvg(), 'background:mlb:schedule', 1200, 675, 3600);
  } catch (error) {
    next(error);
  }
});

app.get('/art/logo/mlb.png', async (_req, res, next) => {
  try {
    await sendPng(res, leagueLogoSvg(), 'logo:mlb', 512, 512, 86400);
  } catch (error) {
    next(error);
  }
});

app.get('/art/folder/:folderId.png', async (req, res, next) => {
  try {
    const folder = foldersById.get(req.params.folderId);
    if (!folder) return res.status(404).send('Folder not found');
    await sendPng(res, await folderSvg(folder), `folder:${folder.id}`, 1200, 675, 86400);
  } catch (error) {
    next(error);
  }
});

app.get('/art/poster/mlb/:eventId.png', async (req, res, next) => {
  try {
    const game = await getLeagueEvent('mlb', req.params.eventId, config.timeZone);
    if (!game) return res.status(404).send('Game not found');
    await sendPng(
      res,
      await posterSvg(game, config.timeZone, 'MLB'),
      `poster:mlb:${game.id}:${game.date}:${game.status}`,
      600,
      900
    );
  } catch (error) {
    next(error);
  }
});

app.get('/art/background/mlb/:eventId.png', async (req, res, next) => {
  try {
    const game = await getLeagueEvent('mlb', req.params.eventId, config.timeZone);
    if (!game) return res.status(404).send('Game not found');
    await sendPng(
      res,
      await landscapeSvg(game, config.timeZone, 'MLB'),
      `background:mlb:${game.id}:${game.date}:${game.status}`,
      1200,
      675
    );
  } catch (error) {
    next(error);
  }
});

app.get('/art/poster/:leagueId/:eventId.png', async (req, res, next) => {
  try {
    const league = LEAGUES[req.params.leagueId];
    const folder = FOLDERS.find((candidate) => candidate.leagues.includes(req.params.leagueId));
    if (!league || !folder) return res.status(404).send('League not found');
    const event = await getLeagueEvent(league.id, req.params.eventId, config.timeZone);
    if (!event) return res.status(404).send('Event not found');
    const svg = event.kind === 'team' || event.kind === 'matchup'
      ? await posterSvg(event, config.timeZone, league.name)
      : await eventPosterSvg(event, folder, config.timeZone);
    await sendPng(res, svg, `poster:${league.id}:${event.id}:${event.date}:${event.status}`, 600, 900);
  } catch (error) {
    next(error);
  }
});

app.get('/art/background/:leagueId/:eventId.png', async (req, res, next) => {
  try {
    const league = LEAGUES[req.params.leagueId];
    const folder = FOLDERS.find((candidate) => candidate.leagues.includes(req.params.leagueId));
    if (!league || !folder) return res.status(404).send('League not found');
    const event = await getLeagueEvent(league.id, req.params.eventId, config.timeZone);
    if (!event) return res.status(404).send('Event not found');
    const svg = event.kind === 'team' || event.kind === 'matchup'
      ? await landscapeSvg(event, config.timeZone, league.name)
      : await eventLandscapeSvg(event, folder, config.timeZone);
    await sendPng(res, svg, `background:${league.id}:${event.id}:${event.date}:${event.status}`, 1200, 675);
  } catch (error) {
    next(error);
  }
});

app.get('/art/poster/mlb/schedule.svg', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600').type('image/svg+xml').send(schedulePosterSvg());
});

app.get('/art/background/mlb/schedule.svg', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600').type('image/svg+xml').send(scheduleLandscapeSvg());
});

app.get('/art/logo/mlb.svg', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400').type('image/svg+xml').send(leagueLogoSvg());
});

app.get('/art/folder/:folderId.svg', async (req, res, next) => {
  try {
    const folder = foldersById.get(req.params.folderId);
    if (!folder) return res.status(404).send('Folder not found');
    res.set('Cache-Control', 'public, max-age=86400').type('image/svg+xml').send(await folderSvg(folder));
  } catch (error) {
    next(error);
  }
});

app.get('/art/poster/mlb/:eventId.svg', async (req, res, next) => {
  try {
    const game = await getLeagueEvent('mlb', req.params.eventId, config.timeZone);
    if (!game) return res.status(404).send('Game not found');
    const svg = await posterSvg(game, config.timeZone, 'MLB');
    res.set('Cache-Control', 'public, max-age=300').type('image/svg+xml').send(svg);
  } catch (error) {
    next(error);
  }
});

app.get('/art/background/mlb/:eventId.svg', async (req, res, next) => {
  try {
    const game = await getLeagueEvent('mlb', req.params.eventId, config.timeZone);
    if (!game) return res.status(404).send('Game not found');
    const svg = await landscapeSvg(game, config.timeZone, 'MLB');
    res.set('Cache-Control', 'public, max-age=300').type('image/svg+xml').send(svg);
  } catch (error) {
    next(error);
  }
});

app.get('/art/poster/:leagueId/:eventId.svg', async (req, res, next) => {
  try {
    const league = LEAGUES[req.params.leagueId];
    const folder = FOLDERS.find((candidate) => candidate.leagues.includes(req.params.leagueId));
    if (!league || !folder) return res.status(404).send('League not found');
    const event = await getLeagueEvent(league.id, req.params.eventId, config.timeZone);
    if (!event) return res.status(404).send('Event not found');
    const svg = event.kind === 'team' || event.kind === 'matchup'
      ? await posterSvg(event, config.timeZone, league.name)
      : await eventPosterSvg(event, folder, config.timeZone);
    res.set('Cache-Control', 'public, max-age=300').type('image/svg+xml').send(svg);
  } catch (error) {
    next(error);
  }
});

app.get('/art/background/:leagueId/:eventId.svg', async (req, res, next) => {
  try {
    const league = LEAGUES[req.params.leagueId];
    const folder = FOLDERS.find((candidate) => candidate.leagues.includes(req.params.leagueId));
    if (!league || !folder) return res.status(404).send('League not found');
    const event = await getLeagueEvent(league.id, req.params.eventId, config.timeZone);
    if (!event) return res.status(404).send('Event not found');
    const svg = event.kind === 'team' || event.kind === 'matchup'
      ? await landscapeSvg(event, config.timeZone, league.name)
      : await eventLandscapeSvg(event, folder, config.timeZone);
    res.set('Cache-Control', 'public, max-age=300').type('image/svg+xml').send(svg);
  } catch (error) {
    next(error);
  }
});

app.get('/api/preview', async (req, res, next) => {
  try {
    const host = hostFor(req);
    const [today, upcoming] = await Promise.all([
      getTodayGames(config.timeZone),
      getUpcomingGames(config.timeZone, 8)
    ]);
    sendJson(res, {
      date: ymd(new Date(), config.timeZone, '-'),
      timeZone: config.timeZone,
      folders: FOLDERS.map((folder) => ({
        id: folder.id,
        name: folder.name,
        subtitle: folder.subtitle,
        art: `${host}/art/folder/${folder.id}.png?v=${ART_VERSION}`
      })),
      games: today.map((game) => ({
        id: game.id,
        name: game.name,
        time: formatTime(game.date, config.timeZone),
        status: game.status,
        poster: `${host}/art/poster/mlb/${game.id}.png?v=${ART_VERSION}`
      })),
      scheduleCard: `${host}/art/poster/mlb/schedule.png?v=${ART_VERSION}`,
      upcoming: upcoming.map((game) => ({
        id: game.id,
        label: `${formatDateTime(game.date, config.timeZone)} — ${game.away.shortName} at ${game.home.shortName}`
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/status', async (_req, res) => {
  const xtream = await connectionSummary();
  sendJson(res, {
    schedule: { connected: true, source: 'MLB schedule feed', timeZone: config.timeZone },
    xtream,
    manifestPath: '/manifest.json',
    privacy: 'Credentials are read from .env and are never returned by this endpoint.'
  });
});

app.use((error, req, res, _next) => {
  console.error(`[${req.method} ${req.path}] ${error.message}`);
  if (req.path.startsWith('/catalog/')) return sendJson(res.status(502), { metas: [] });
  if (req.path.startsWith('/meta/')) return sendJson(res.status(502), { meta: {} });
  if (req.path.startsWith('/stream/')) return sendJson(res.status(502), { streams: [] });
  return sendJson(res.status(502), { error: 'The upstream service could not be reached.' });
});

if (require.main === module) {
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Dugout Live is ready at http://localhost:${config.port}`);
    console.log(`Manifest: ${config.accessToken ? 'protected path enabled' : `http://localhost:${config.port}/manifest.json`}`);
    console.log(`Xtream: ${xtreamConfigured() ? 'configured' : 'not configured'}`);
  });
}

module.exports = { app, gameId, gameDescription, metaForGame, scheduleMeta };
