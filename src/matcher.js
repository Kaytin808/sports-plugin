const { config } = require('./config');

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function aliases(team) {
  const displayName = normalize(team.displayName);
  const nickname = normalize(team.nickname || team.shortName);
  const location = nickname && displayName.endsWith(` ${nickname}`)
    ? displayName.slice(0, -(nickname.length + 1))
    : '';
  const candidates = [
    team.displayName,
    team.shortName,
    team.nickname,
    team.abbreviation,
    location
  ];
  return [...new Set(candidates.map(normalize).filter((value) => value.length >= 3))]
    .sort((left, right) => right.length - left.length);
}

function containsAlias(text, team) {
  const normalized = ` ${normalize(text)} `;
  return aliases(team).some((alias) => normalized.includes(` ${alias} `));
}

function closestListing(epg, gameDate) {
  if (!Array.isArray(epg) || !epg.length) return null;
  const gameSeconds = new Date(gameDate).getTime() / 1000;
  return [...epg].sort((left, right) => {
    const leftDistance = left.start ? Math.abs(left.start - gameSeconds) : Number.MAX_SAFE_INTEGER;
    const rightDistance = right.start ? Math.abs(right.start - gameSeconds) : Number.MAX_SAFE_INTEGER;
    return leftDistance - rightDistance;
  })[0];
}

function containsBroadcast(text, broadcasts) {
  const normalized = ` ${normalize(text)} `;
  return broadcasts.some((broadcast) => {
    const alias = normalize(broadcast);
    if (alias.length < 3) return false;
    const expanded = alias.replace(/\bnet\b/g, 'network');
    const compact = expanded.replace(/\b(?:tv|network|channel)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const meaningfulWords = compact.split(' ').filter(Boolean);
    return normalized.includes(` ${alias} `) ||
      normalized.includes(` ${expanded} `) ||
      (meaningfulWords.length > 1 && meaningfulWords.every((word) => normalized.includes(` ${word} `)));
  });
}

function cleanChannelIdentity(value) {
  return normalize(value)
    .split(' ')
    .filter((word) => !['us', 'hd', 'fhd', 'uhd', 'raw', '4k', '8k', '60fps'].includes(word))
    .join(' ')
    .trim();
}

function isDedicatedBroadcastChannel(name, broadcasts) {
  const channel = cleanChannelIdentity(name);
  return broadcasts.some((broadcast) => {
    const alias = normalize(broadcast);
    if (alias.length < 3) return false;
    const expanded = alias.replace(/\bnet\b/g, 'network');
    return channel === alias ||
      channel === expanded ||
      channel === `${alias} network` ||
      channel === `${expanded} network`;
  });
}

function isSpecificBroadcastChannel(name, broadcasts) {
  const normalizedName = ` ${normalize(name)} `;
  const genericNetworks = new Set(['abc', 'cbs', 'fox', 'nbc', 'espn', 'prime video', 'peacock']);
  return broadcasts.some((broadcast) => {
    const rawBroadcast = String(broadcast || '');
    const alias = normalize(broadcast).replace(/\bnet\b/g, 'network');
    const compact = alias.replace(/\b(?:tv|network|channel)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (compact.length < 3 || genericNetworks.has(compact)) return false;
    const words = compact.split(' ').filter(Boolean);
    const callSign = (rawBroadcast.match(/\b[A-Z]{3,5}\d*\b/g) || [])
      .some((word) => !['ABC', 'CBS', 'ESPN', 'FOX', 'NBC', 'NFL'].includes(word.replace(/\d+$/, '')));
    const numberedGenericNetwork = ['abc', 'cbs', 'fox', 'nbc'].includes(words[0]) &&
      words.length > 1 && words.slice(1).every((word) => /^\d+$/.test(word));
    if (numberedGenericNetwork && !callSign) return false;
    if (words.length < 2 && !/\d/.test(compact) && !callSign) return false;
    return words.length > 0 && words.every((word) => normalizedName.includes(` ${word} `));
  });
}

function scoreStream(stream, game, leagueName = 'MLB') {
  const listing = closestListing(stream.epg, game.date);
  const epgText = listing ? `${listing.title} ${listing.description}` : '';
  const name = stream.name || '';
  const combined = `${name} ${epgText}`;

  const homeInName = containsAlias(name, game.home);
  const awayInName = containsAlias(name, game.away);
  const homeInEpg = containsAlias(epgText, game.home);
  const awayInEpg = containsAlias(epgText, game.away);
  const homeAnywhere = homeInName || homeInEpg;
  const awayAnywhere = awayInName || awayInEpg;

  let score = 0;
  const reasons = [];
  const embeddedDate = name.match(/(?:start:|\()\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/i);
  if (embeddedDate) {
    const channelTime = new Date(`${embeddedDate[1]}T${embeddedDate[2]}Z`).getTime();
    const gameTime = new Date(game.date).getTime();
    const distanceHours = Math.abs(channelTime - gameTime) / 3600000;
    if (distanceHours > 18) {
      return { stream, listing, score: -500, reasons: ['embedded event date does not match'] };
    }
    score += 12;
    reasons.push('embedded event time is current');
  }
  const namedMonthDate = name.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i);
  if (!embeddedDate && namedMonthDate) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const gameDate = new Date(game.date);
    const channelDate = Date.UTC(gameDate.getUTCFullYear(), months.indexOf(namedMonthDate[1].slice(0, 3).toLowerCase()), Number(namedMonthDate[2]));
    const distanceDays = Math.abs(channelDate - gameDate.getTime()) / 86400000;
    if (distanceDays > 2) return { stream, listing, score: -500, reasons: ['embedded calendar date does not match'] };
  }
  if (homeInName && awayInName) {
    score += 100;
    reasons.push('both teams in channel name');
  } else if (homeInEpg && awayInEpg) {
    score += 85;
    reasons.push('both teams in EPG');
  } else if (homeAnywhere && awayAnywhere) {
    score += 70;
    reasons.push('both teams across channel and EPG');
  } else {
    if (homeInName || awayInName) {
      score += 28;
      reasons.push('one team in channel name');
    }
    if (homeInEpg || awayInEpg) {
      score += 18;
      reasons.push('one team in EPG');
    }
  }

  const regionalSportsMismatch = /\b(?:abc|cbs|fox|nbc)\s+sports\b/i.test(name) &&
    !game.broadcasts.some((broadcast) => /\bsports\b/i.test(broadcast));
  if (!regionalSportsMismatch && containsBroadcast(name, game.broadcasts)) {
    const categoryWords = ` ${normalize(stream.categoryName || '')} `;
    const trustedBroadcastFolder = /\s(?:sports?|fox|cbs|nbc|abc|prime|peacock)\s/.test(categoryWords);
    const dedicatedBroadcast = trustedBroadcastFolder && (
      isDedicatedBroadcastChannel(name, game.broadcasts) ||
      isSpecificBroadcastChannel(name, game.broadcasts)
    );
    score += dedicatedBroadcast ? 60 : 24;
    reasons.push(dedicatedBroadcast ? 'specific listed broadcaster in HD network folder' : 'listed broadcaster');
  }
  const oneTeamInName = homeInName !== awayInName;
  const categoryWords = normalize(stream.categoryName || '');
  const trustedTeamFolder = categoryWords.includes(' team ') || categoryWords.endsWith(' team ppv') || categoryWords.includes(`${normalize(leagueName)} team`);
  if (oneTeamInName && trustedTeamFolder) {
    score += 35;
    reasons.push(`dedicated ${leagueName} team feed`);
  }
  if (/\b(?:mlb|baseball)\b/i.test(combined)) score += 5;
  if (/\b4k\b/i.test(combined)) {
    score += 8;
    reasons.push('4K');
  } else if (
    /\b(?:hd|fhd|uhd|60fps)\b/i.test(combined) &&
    /\b(?:fox|cbs|nbc|abc|prime|peacock)\b/i.test(stream.categoryName || '')
  ) {
    score += 4;
    reasons.push('HD');
  }

  if (listing?.start) {
    const gameSeconds = new Date(game.date).getTime() / 1000;
    const distanceHours = Math.abs(listing.start - gameSeconds) / 3600;
    if (distanceHours <= 1) score += 12;
    else if (distanceHours <= 3) score += 6;
  }

  return { stream, listing, score, reasons };
}

function rankStreams(streams, game, minimumScore = config.matchMinScore, leagueName = 'MLB') {
  const ranked = streams
    .map((stream) => scoreStream(stream, game, leagueName))
    .filter((entry) => entry.score >= minimumScore)
    .sort((left, right) => right.score - left.score || left.stream.name.localeCompare(right.stream.name));

  const seen = new Set();
  return ranked.filter((entry) => {
    const key = entry.stream.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankEventStreams(streams, event) {
  const eventWords = new Set(normalize(event.name).split(' ').filter((word) => word.length >= 4));
  return streams.filter((stream) => !/no event|offline|not active|test channel/i.test(stream.name || '')).map((stream) => {
    const epgText = (stream.epg || []).map((entry) => `${entry.title} ${entry.description}`).join(' ');
    const searchable = normalize(`${stream.name} ${epgText}`);
    const overlap = [...eventWords].filter((word) => searchable.includes(word)).length;
    const score = overlap * 20 + (/\b4k\b/i.test(`${stream.name} ${epgText}`) ? 8 : 0);
    return { stream, score, reasons: overlap ? [`${overlap} event-title matches`] : ['sport-folder channel'] };
  }).sort((left, right) => right.score - left.score || left.stream.name.localeCompare(right.stream.name));
}

module.exports = {
  normalize,
  aliases,
  containsAlias,
  closestListing,
  isDedicatedBroadcastChannel,
  isSpecificBroadcastChannel,
  scoreStream,
  rankStreams,
  rankEventStreams
};
