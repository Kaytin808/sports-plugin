const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, containsAlias, isDedicatedBroadcastChannel, scoreStream, rankStreams } = require('../src/matcher');

const game = {
  date: '2026-08-17T23:10:00Z',
  home: {
    displayName: 'Arizona Diamondbacks',
    shortName: 'Diamondbacks',
    nickname: 'Diamondbacks',
    abbreviation: 'ARI'
  },
  away: {
    displayName: 'Los Angeles Dodgers',
    shortName: 'Dodgers',
    nickname: 'Dodgers',
    abbreviation: 'LAD'
  },
  broadcasts: ['ESPN', 'MLB.TV']
};

test('normalize produces stable word-oriented text', () => {
  assert.equal(normalize('  Dodgers @ D-backs — 4K  '), 'dodgers d backs 4 k');
});

test('team aliases match nicknames and abbreviations on word boundaries', () => {
  assert.equal(containsAlias('MLB: LAD vs ARI', game.home), true);
  assert.equal(containsAlias('MLB: LAD vs ARI', game.away), true);
  assert.equal(containsAlias('Cardinals Pregame', game.home), false);
});

test('a matchup-named channel ranks without EPG data', () => {
  const results = rankStreams([{ id: '1', name: 'MLB 4K | Dodgers at Diamondbacks', categoryName: 'US Sports', epg: [] }], game);
  assert.equal(results.length, 1);
  assert.equal(results[0].stream.id, '1');
  assert.ok(results[0].score >= 100);
});

test('a generic broadcaster is not enough to guess a game', () => {
  const results = rankStreams([{ id: '2', name: 'ESPN', categoryName: 'US Entertainment', epg: [] }], game);
  assert.deepEqual(results, []);
});

test('an officially listed broadcaster in the HD sports folder is a fallback source', () => {
  const results = rankStreams([{ id: 'network-1', name: 'ESPN HD', categoryName: 'US| SPORT HD/RAW 60fps', epg: [] }], game);
  assert.equal(results.length, 1);
  assert.equal(results[0].stream.id, 'network-1');
  assert.match(results[0].reasons.join(' '), /listed broadcaster/);
});

test('abbreviated Net broadcast names match full Network channel names', () => {
  const nflGame = { ...game, broadcasts: ['NFL Net'] };
  const results = rankStreams([{ id: 'network-2', name: 'US: NFL NETWORK HD', categoryName: 'US| SPORT HD/RAW 60fps', epg: [] }], nflGame);
  assert.equal(results.length, 1);
});

test('numbered local broadcaster names match spaced HD affiliate names', () => {
  const nflGame = {
    ...game,
    broadcasts: ['CBS4'],
    home: { displayName: 'Indianapolis Colts', shortName: 'Colts', nickname: 'Colts', abbreviation: 'IND' },
    away: { displayName: 'Atlanta Falcons', shortName: 'Falcons', nickname: 'Falcons', abbreviation: 'ATL' }
  };
  const result = scoreStream({
    id: 'affiliate',
    name: 'US: CBS 4 (WTTV) INDIANAPOLIS HD',
    categoryName: 'US| CBS HD/RAW 60FPS',
    epg: []
  }, nflGame, 'NFL');
  assert.ok(result.score >= 55);
  assert.ok(result.reasons.includes('HD'));

  const unrelated = scoreStream({
    id: 'wrong-cbs4',
    name: 'US: CBS 4 (#) BUFFALO HD',
    categoryName: 'US| CBS HD/RAW 60FPS',
    epg: []
  }, nflGame, 'NFL');
  assert.ok(unrelated.score < 55);
});

test('generic FOX affiliate needs a team market before it qualifies', () => {
  const nflGame = {
    ...game,
    broadcasts: ['FOX'],
    home: { displayName: 'Seattle Seahawks', shortName: 'Seahawks', nickname: 'Seahawks', abbreviation: 'SEA' },
    away: { displayName: 'Tennessee Titans', shortName: 'Titans', nickname: 'Titans', abbreviation: 'TEN' }
  };
  const seattle = scoreStream({
    id: 'seattle',
    name: 'US: FOX 13 HD [SEATTLE]',
    categoryName: 'US| FOX HD/RAW 60FPS',
    epg: []
  }, nflGame, 'NFL');
  const unrelated = scoreStream({
    id: 'boston',
    name: 'US: FOX 25 (WFXT) BOSTON HD',
    categoryName: 'US| FOX HD/RAW 60FPS',
    epg: []
  }, nflGame, 'NFL');
  assert.ok(seattle.score >= 55);
  assert.ok(unrelated.score < 55);

  const regionalSports = scoreStream({
    id: 'regional-sports',
    name: 'US: FOX SPORTS TENNESSEE HD',
    categoryName: 'US| FOX HD/RAW 60FPS',
    epg: []
  }, nflGame, 'NFL');
  assert.ok(regionalSports.score < 55);
});

test('a regional channel containing a broadcaster name is not treated as the exact network', () => {
  assert.equal(isDedicatedBroadcastChannel('US: SPORTSNET LA DODGERS HD', ['Sportsnet']), false);
  const results = rankStreams([{
    id: 'wrong-region',
    name: 'US: SPORTSNET LA DODGERS HD',
    categoryName: 'US| SPORT HD/RAW 60fps',
    epg: []
  }], { ...game, broadcasts: ['Sportsnet'] });
  assert.deepEqual(results, []);
});

test('a single club is accepted only from a dedicated MLB team-feed folder', () => {
  const trusted = rankStreams([{
    id: 'team-1',
    name: 'US: MLB Arizona Diamondbacks',
    categoryName: 'US| MLB TEAM PPV',
    epg: []
  }], game);
  const generic = rankStreams([{
    id: 'team-2',
    name: 'US: MLB Arizona Diamondbacks',
    categoryName: 'US Sports',
    epg: []
  }], game);
  assert.equal(trusted.length, 1);
  assert.equal(generic.length, 0);
});

test('EPG containing both teams qualifies the channel', () => {
  const start = new Date(game.date).getTime() / 1000;
  const results = rankStreams([{
    id: '3',
    name: 'MLB Extra Innings 03',
    categoryName: 'Baseball',
    epg: [{ title: 'Los Angeles Dodgers at Arizona Diamondbacks', description: '', start }]
  }], game);
  assert.equal(results.length, 1);
  assert.equal(results[0].stream.id, '3');
});

test('a channel with a stale embedded event date is rejected', () => {
  const results = rankStreams([{
    id: 'stale',
    name: 'NBA 05 | Raptors vs Heat start:2026-07-17 19:00:00',
    categoryName: 'NBA PPV',
    epg: []
  }], game);
  assert.deepEqual(results, []);
});

test('a stale named-month channel date is rejected', () => {
  const results = rankStreams([{
    id: 'stale-month',
    name: 'NBA Summer League Raptors vs Heat Jul 17',
    categoryName: 'NBA PPV',
    epg: []
  }], game);
  assert.deepEqual(results, []);
});
