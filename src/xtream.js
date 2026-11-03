const { config, xtreamConfigured } = require('./config');
const { TimedCache } = require('./cache');

const xtreamCache = new TimedCache(config.xtreamCacheMs);
const playbackProbeCache = new TimedCache(config.streamProbeCacheMs);
const AUTO_CATEGORY_PATTERN = /(?:^|\b)(mlb|baseball|usa sports?|us sports?|live sports?)(?:\b|$)/i;

function apiUrl(action, extra = {}) {
  if (!xtreamConfigured()) throw new Error('Xtream credentials are not configured');
  const url = new URL(`${config.xtream.baseUrl}/player_api.php`);
  url.searchParams.set('username', config.xtream.username);
  url.searchParams.set('password', config.xtream.password);
  url.searchParams.set('action', action);
  for (const [name, value] of Object.entries(extra)) url.searchParams.set(name, String(value));
  return url;
}

async function request(action, extra = {}, timeoutMs = 12000) {
  const url = apiUrl(action, extra);
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'DugoutLive/0.1' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Xtream API returned HTTP ${response.status}`);
  return response.json();
}

async function getCategories() {
  const key = 'categories';
  const cached = xtreamCache.get(key);
  if (cached) return cached;
  const result = await request('get_live_categories');
  const categories = Array.isArray(result) ? result.map((category) => ({
    id: String(category.category_id),
    name: category.category_name || `Category ${category.category_id}`
  })) : [];
  return xtreamCache.set(key, categories);
}

async function selectedCategoryIds() {
  if (config.xtream.categoryIds.length) return config.xtream.categoryIds;
  const categories = await getCategories();
  return categories.filter((category) => AUTO_CATEGORY_PATTERN.test(category.name)).map((category) => category.id);
}

async function getStreams(categoryIdsOverride) {
  const categoryIds = Array.isArray(categoryIdsOverride) ? categoryIdsOverride : await selectedCategoryIds();
  const key = `streams:${[...categoryIds].sort().join(',')}`;
  const cached = xtreamCache.get(key);
  if (cached) return cached;
  if (!categoryIds.length) return xtreamCache.set(key, []);

  const categories = await getCategories();
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const responses = await Promise.all(categoryIds.map((categoryId) =>
    request('get_live_streams', { category_id: categoryId })
      .then((streams) => ({ categoryId, streams }))
  ));

  const byId = new Map();
  for (const { categoryId, streams } of responses) {
    for (const stream of Array.isArray(streams) ? streams : []) {
      const id = String(stream.stream_id);
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          name: stream.name || `Stream ${id}`,
          categoryId: String(stream.category_id || categoryId),
          categoryName: names.get(String(stream.category_id || categoryId)) || '',
          icon: stream.stream_icon || ''
        });
      }
    }
  }
  return xtreamCache.set(key, [...byId.values()]);
}

function decodeEpgText(value) {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return String(value);
  }
}

async function getShortEpg(streamId) {
  const key = `epg:${streamId}`;
  const cached = xtreamCache.get(key);
  if (cached) return cached;
  try {
    const result = await request('get_short_epg', { stream_id: streamId, limit: 4 }, 8000);
    const listings = (result.epg_listings || []).map((listing) => ({
      title: decodeEpgText(listing.title),
      description: decodeEpgText(listing.description),
      start: Number(listing.start_timestamp || 0) || null,
      end: Number(listing.stop_timestamp || 0) || null
    }));
    return xtreamCache.set(key, listings);
  } catch {
    return xtreamCache.set(key, []);
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function getStreamsWithEpg(categoryIdsOverride) {
  const streams = await getStreams(categoryIdsOverride);
  return mapWithConcurrency(streams, config.epgConcurrency, async (stream) => ({
    ...stream,
    // Static HD network pools are matched against the schedule's official
    // broadcaster and market. Their per-channel EPG calls are both slow and
    // frequently empty, so avoid delaying every source request on them.
    epg: /\b(?:fox|cbs|nbc|abc|prime|peacock|sport)\b/i.test(stream.categoryName || '')
      ? []
      : await getShortEpg(stream.id)
  }));
}

function playbackUrl(streamId) {
  const username = encodeURIComponent(config.xtream.username);
  const password = encodeURIComponent(config.xtream.password);
  return `${config.xtream.baseUrl}/live/${username}/${password}/${encodeURIComponent(streamId)}.${config.xtream.outputExtension}`;
}

function hasTransportStreamSync(bytes) {
  const buffer = Buffer.from(bytes || []);
  if (!buffer.length) return false;
  for (let offset = 0; offset < Math.min(188, buffer.length); offset += 1) {
    if (buffer[offset] !== 0x47) continue;
    if (offset + 188 >= buffer.length || buffer[offset + 188] === 0x47) return true;
  }
  return false;
}

function firstPlaylistUri(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#')) || '';
}

async function firstResponseChunk(response) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  try {
    const result = await reader.read();
    return Buffer.from(result.value || []);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function probeMediaUrl(url, depth = 0) {
  if (depth > 3) return false;
  try {
    const response = await fetch(url, {
      headers: {
        range: 'bytes=0-65535',
        accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, video/mp2t, video/*, */*',
        'user-agent': 'DugoutLive-Probe/1.0'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(config.streamProbeTimeoutMs)
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return false;
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const bytes = await firstResponseChunk(response);
    if (!bytes.length) return false;
    if (hasTransportStreamSync(bytes)) return true;

    const text = bytes.toString('utf8');
    const isPlaylist = text.trimStart().startsWith('#EXTM3U') || contentType.includes('mpegurl');
    if (isPlaylist) {
      const mediaUri = firstPlaylistUri(text);
      if (!mediaUri) return false;
      return probeMediaUrl(new URL(mediaUri, response.url || url).toString(), depth + 1);
    }
    return contentType.startsWith('video/') && bytes.length >= 512;
  } catch {
    return false;
  }
}

async function probePlaybackStream(streamId) {
  const key = `playback:${streamId}:${config.xtream.outputExtension}`;
  const cached = playbackProbeCache.get(key);
  if (cached !== undefined) return cached;
  const playable = await probeMediaUrl(playbackUrl(streamId));
  return playbackProbeCache.set(key, playable);
}

async function filterPlayableEntries(entries) {
  const limited = entries.slice(0, config.streamProbeLimit);
  const results = await mapWithConcurrency(
    limited,
    config.streamProbeConcurrency,
    (entry) => probePlaybackStream(entry.stream.id)
  );
  return limited.filter((_entry, index) => results[index]);
}

async function connectionSummary() {
  if (!xtreamConfigured()) {
    return { configured: false, connected: false, categories: [], selectedCategoryIds: [] };
  }
  try {
    const categories = await getCategories();
    const selected = await selectedCategoryIds();
    return {
      configured: true,
      connected: true,
      categories,
      selectedCategoryIds: selected,
      selectedByFolder: config.xtream.sportCategoryIds
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      categories: [],
      selectedCategoryIds: config.xtream.categoryIds,
      error: error.message
    };
  }
}

module.exports = {
  AUTO_CATEGORY_PATTERN,
  getCategories,
  selectedCategoryIds,
  getStreams,
  getStreamsWithEpg,
  playbackUrl,
  hasTransportStreamSync,
  firstPlaylistUri,
  probePlaybackStream,
  filterPlayableEntries,
  connectionSummary,
  decodeEpgText,
  mapWithConcurrency
};
