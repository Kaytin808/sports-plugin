const test = require('node:test');
const assert = require('node:assert/strict');
const { LEAGUES, FOLDERS } = require('../src/sports');

test('sports hub folders have unique ids and valid leagues', () => {
  assert.equal(new Set(FOLDERS.map((folder) => folder.id)).size, FOLDERS.length);
  for (const folder of FOLDERS) {
    assert.ok(folder.leagues.length > 0);
    for (const leagueId of folder.leagues) assert.ok(LEAGUES[leagueId], `${folder.id} references ${leagueId}`);
  }
});

test('requested core folders are present', () => {
  const ids = new Set(FOLDERS.map((folder) => folder.id));
  for (const id of ['baseball', 'nfl', 'hockey', 'soccer', 'golf']) assert.ok(ids.has(id));
});
