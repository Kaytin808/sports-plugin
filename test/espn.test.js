const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanTeamName } = require('../src/espn');

test('duplicate temporary team labels are collapsed', () => {
  assert.equal(cleanTeamName('Athletics Athletics'), 'Athletics');
  assert.equal(cleanTeamName('Boston Red Sox'), 'Boston Red Sox');
});
