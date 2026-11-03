const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUfcBouts, normalizeF1Sessions, normalizeTennisMatches } = require('../src/sports-data');
const { eventScheduleLabel } = require('../src/art');

test('UFC cards expand a fight card into fighter matchups with stable artwork', () => {
  const league = { id: 'ufc', name: 'UFC' };
  const raw = {
    id: 'event-1',
    name: 'UFC Fight Night: Alpha vs. Beta',
    date: '2026-08-23T00:00:00Z',
    competitions: [{
      id: 'bout-1',
      date: '2026-08-23T00:00:00Z',
      competitors: [
        { athlete: { id: '11', displayName: 'Alex Alpha', shortName: 'A. Alpha' } },
        { athlete: { id: '22', displayName: 'Blake Beta', shortName: 'B. Beta' } }
      ]
    }]
  };
  const [bout] = normalizeUfcBouts(raw, league);
  assert.equal(bout.id, 'bout-1');
  assert.equal(bout.name, 'Alex Alpha vs Blake Beta');
  assert.equal(bout.kind, 'matchup');
  assert.match(bout.away.logo, /headshots\/mma\/players\/full\/11\.png$/);
  assert.equal(bout.home.displayName, 'Blake Beta');
  assert.equal(bout.timeQualifier, 'CARD START');
});

test('Formula 1 weekends expand into dated session cards', () => {
  const league = { id: 'f1', name: 'Formula 1' };
  const raw = {
    id: 'gp-1',
    name: 'Dutch Grand Prix',
    shortName: 'Dutch GP',
    competitions: [
      { id: 'session-1', date: '2026-08-21T10:30:00Z', type: { abbreviation: 'FP1' } },
      { id: 'session-2', date: '2026-08-23T13:00:00Z', type: { abbreviation: 'Race' } }
    ]
  };
  const sessions = normalizeF1Sessions(raw, league);
  assert.deepEqual(sessions.map((event) => event.session), ['Practice 1', 'Race']);
  assert.equal(sessions[1].name, 'Dutch GP — Race');
  assert.equal(sessions[1].date, '2026-08-23T13:00:00Z');
});

test('tennis draws expand into player matchups and omit unconfirmed times', () => {
  const league = { id: 'wta', name: 'WTA Tennis' };
  const raw = {
    id: 'tournament-1',
    name: 'Cincinnati Open',
    competitions: [{
      id: 'match-1',
      date: '2026-08-17T16:30:00Z',
      timeValid: true,
      round: { description: 'Round 3' },
      court: { description: 'Stadium Court' },
      competitors: [
        { id: '3730', name: 'Iga Swiatek' },
        { id: '3018', name: 'Maria Sakkari' }
      ]
    }, {
      id: 'match-tbd',
      date: '2026-08-18T04:00:00Z',
      timeValid: false,
      competitors: [{ id: '0', name: 'TBD' }, { id: '0', name: 'TBD' }]
    }]
  };
  const matches = normalizeTennisMatches(raw, league, '20260817', '20260823');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'Iga Swiatek vs Maria Sakkari');
  assert.equal(matches[0].venue, 'Stadium Court');
  assert.equal(matches[0].timeQualifier, 'ROUND 3');
  assert.match(matches[0].away.logo, /headshots\/tennis\/players\/full\/3730\.png$/);
});

test('all-day tournament cards show source dates without a fake timezone-shifted start time', () => {
  assert.equal(eventScheduleLabel({
    allDay: true,
    date: '2026-08-20T04:00:00Z',
    endDate: '2026-08-23T04:00:00Z'
  }, 'America/Phoenix'), 'Thu, Aug 20 – Sun, Aug 23');
});
