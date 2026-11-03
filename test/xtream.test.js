const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTO_CATEGORY_PATTERN,
  decodeEpgText,
  mapWithConcurrency,
  hasTransportStreamSync,
  firstPlaylistUri
} = require('../src/xtream');

test('automatic category selection recognizes baseball-oriented folders', () => {
  assert.match('MLB Extra Innings', AUTO_CATEGORY_PATTERN);
  assert.match('USA Sports', AUTO_CATEGORY_PATTERN);
  assert.doesNotMatch('Kids', AUTO_CATEGORY_PATTERN);
});

test('base64 EPG fields decode to readable text', () => {
  assert.equal(decodeEpgText(Buffer.from('Yankees at Red Sox').toString('base64')), 'Yankees at Red Sox');
});

test('bounded mapper preserves input order', async () => {
  const values = await mapWithConcurrency([3, 1, 2], 2, async (value) => value * 2);
  assert.deepEqual(values, [6, 2, 4]);
});

test('transport stream probe recognizes sync bytes', () => {
  const packet = Buffer.alloc(376);
  packet[0] = 0x47;
  packet[188] = 0x47;
  assert.equal(hasTransportStreamSync(packet), true);
  assert.equal(hasTransportStreamSync(Buffer.from('not media')), false);
});

test('HLS probe selects the first media URI', () => {
  const playlist = '#EXTM3U\n#EXT-X-VERSION:3\nsegment-001.ts\nsegment-002.ts\n';
  assert.equal(firstPlaylistUri(playlist), 'segment-001.ts');
});
