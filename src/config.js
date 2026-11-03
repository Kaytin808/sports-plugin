const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function integer(name, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const value = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizedBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function accessToken(value) {
  const token = String(value || '').trim();
  if (token && !/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    throw new Error('ACCESS_TOKEN must be 16-128 characters using only letters, numbers, underscores, or hyphens.');
  }
  return token;
}

const config = {
  port: integer('PORT', 2323, 1, 65535),
  timeZone: process.env.TIME_ZONE || 'America/Phoenix',
  publicUrl: normalizedBaseUrl(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL),
  accessToken: accessToken(process.env.ACCESS_TOKEN),
  mikeAccessToken: accessToken(process.env.ACCESS_TOKEN_MIKE),
  familyAccessToken: accessToken(process.env.ACCESS_TOKEN_FAMILY),
  scheduleCacheMs: integer('SCHEDULE_CACHE_SECONDS', 300, 30, 86400) * 1000,
  xtreamCacheMs: integer('XTREAM_CACHE_SECONDS', 300, 30, 86400) * 1000,
  epgConcurrency: integer('EPG_CONCURRENCY', 8, 1, 20),
  matchMinScore: integer('MATCH_MIN_SCORE', 55, 1, 500),
  streamProbeTimeoutMs: integer('STREAM_PROBE_TIMEOUT_MS', 8000, 1000, 30000),
  streamProbeLimit: integer('STREAM_PROBE_LIMIT', 6, 1, 20),
  streamProbeConcurrency: integer('STREAM_PROBE_CONCURRENCY', 3, 1, 8),
  streamProbeCacheMs: integer('STREAM_PROBE_CACHE_SECONDS', 60, 5, 900) * 1000,
  xtream: {
    baseUrl: normalizedBaseUrl(process.env.XTREAM_BASE_URL),
    username: process.env.XTREAM_USERNAME || '',
    password: process.env.XTREAM_PASSWORD || '',
    categoryIds: (process.env.XTREAM_BASEBALL_CATEGORY_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    outputExtension: (process.env.XTREAM_OUTPUT_EXTENSION || 'm3u8').replace(/^\./, ''),
    sportCategoryIds: {
      baseball: ids('XTREAM_CATEGORY_IDS_BASEBALL', process.env.XTREAM_BASEBALL_CATEGORY_IDS),
      nfl: ids('XTREAM_CATEGORY_IDS_NFL'),
      'college-football': ids('XTREAM_CATEGORY_IDS_COLLEGE_FOOTBALL'),
      nba: ids('XTREAM_CATEGORY_IDS_NBA'),
      wnba: ids('XTREAM_CATEGORY_IDS_WNBA'),
      hockey: ids('XTREAM_CATEGORY_IDS_HOCKEY'),
      soccer: ids('XTREAM_CATEGORY_IDS_SOCCER'),
      golf: ids('XTREAM_CATEGORY_IDS_GOLF'),
      ufc: ids('XTREAM_CATEGORY_IDS_UFC'),
      f1: ids('XTREAM_CATEGORY_IDS_F1'),
      tennis: ids('XTREAM_CATEGORY_IDS_TENNIS')
    }
  }
};

function ids(name, fallback = '') {
  return (process.env[name] || fallback || '').split(',').map((value) => value.trim()).filter(Boolean);
}

function xtreamConfigured() {
  return Boolean(config.xtream.baseUrl && config.xtream.username && config.xtream.password);
}

module.exports = { config, xtreamConfigured };
