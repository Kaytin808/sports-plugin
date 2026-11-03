const test = require('node:test');
const assert = require('node:assert/strict');
const { calendarReleaseDate } = require('../src/espn');

test('Nuvio release date follows the configured calendar date instead of UTC', () => {
  assert.equal(
    calendarReleaseDate('2026-08-23T02:00:00Z', 'America/Phoenix'),
    '2026-08-22T12:00:00.000Z'
  );
});

test('calendar release date leaves invalid source values unchanged', () => {
  assert.equal(calendarReleaseDate('not-a-date', 'America/Phoenix'), 'not-a-date');
});

test('all-day events retain the schedule feed calendar date', () => {
  assert.equal(
    calendarReleaseDate('2026-08-20T04:00:00Z', 'America/Phoenix', true),
    '2026-08-20T12:00:00.000Z'
  );
});
