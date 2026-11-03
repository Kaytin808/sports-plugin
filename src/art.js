const { formatTime, formatDateTime } = require('./espn');
const { TimedCache } = require('./cache');

const imageCache = new TimedCache(14 * 24 * 60 * 60 * 1000);

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function imageDataUri(url) {
  if (!url) return '';
  const cached = imageCache.get(url);
  if (cached) return cached;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return '';
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/png';
    return imageCache.set(url, `data:${contentType};base64,${bytes.toString('base64')}`);
  } catch {
    return '';
  }
}

function logoMarkup(dataUri, x, y, size, fallback) {
  if (dataUri) {
    return `<image href="${dataUri}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return `<text x="${x + size / 2}" y="${y + size * 0.62}" text-anchor="middle" class="abbr">${escapeXml(fallback)}</text>`;
}

function fieldLines(width, height, opacity = 0.16) {
  const cx = width / 2;
  return `<g fill="none" stroke="#fff" stroke-width="5" opacity="${opacity}">
    <path d="M ${cx} ${height * 0.79} L ${width * 0.18} ${height * 0.48} L ${cx} ${height * 0.18} L ${width * 0.82} ${height * 0.48} Z"/>
    <path d="M ${cx} ${height * 0.79} Q ${width * 0.12} ${height * 0.35} ${cx} ${height * 0.08}"/>
    <path d="M ${cx} ${height * 0.79} Q ${width * 0.88} ${height * 0.35} ${cx} ${height * 0.08}"/>
    <circle cx="${cx}" cy="${height * 0.48}" r="${width * 0.035}"/>
  </g>`;
}

function fittedFontSize(value, maxSize, minSize, availableWidth) {
  const length = Math.max(1, String(value || '').length);
  return Math.max(minSize, Math.min(maxSize, Math.floor(availableWidth / (length * 0.58))));
}

function dateOnlyLabel(iso) {
  if (!iso) return '';
  const datePart = String(iso).slice(0, 10);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(`${datePart}T12:00:00Z`));
}

function eventScheduleLabel(event, timeZone) {
  if (!event.allDay) return formatDateTime(event.date, timeZone);
  const start = dateOnlyLabel(event.date);
  const end = dateOnlyLabel(event.endDate);
  return end && end !== start ? `${start} – ${end}` : start;
}

async function posterSvg(game, timeZone, leagueLabel = 'MLB') {
  const [awayLogo, homeLogo] = await Promise.all([
    imageDataUri(game.away.logo),
    imageDataUri(game.home.logo)
  ]);
  const scheduled = escapeXml(formatDateTime(game.date, timeZone).toUpperCase());
  const awayName = game.away.nickname.toUpperCase();
  const homeName = game.home.nickname.toUpperCase();
  const awayFontSize = fittedFontSize(awayName, 37, 17, 500);
  const homeFontSize = fittedFontSize(homeName, 37, 17, 500);
  const eventLabel = game.eventName
    ? `<text x="300" y="48" class="event-label" text-anchor="middle">${escapeXml(game.eventName.toUpperCase())}</text>`
    : '';
  const timeBlock = game.timeQualifier
    ? `<text x="300" y="798" class="qualifier" text-anchor="middle">${escapeXml(game.timeQualifier)}</text><text x="300" y="850" class="time" text-anchor="middle">${scheduled}</text>`
    : `<text x="300" y="835" class="time" text-anchor="middle">${scheduled}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A1728"/><stop offset=".6" stop-color="#06101D"/><stop offset="1" stop-color="#02050A"/></linearGradient>
    <linearGradient id="timeOverlay" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#02050A" stop-opacity=".7"/><stop offset="1" stop-color="#02050A"/></linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity=".6"/></filter>
    <filter id="badgeShadow"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000" flood-opacity=".65"/></filter>
  </defs>
  <rect width="600" height="900" rx="26" fill="url(#shade)"/>
  ${eventLabel}
  <rect x="0" y="72" width="300" height="8" fill="#${game.away.color}"/><rect x="300" y="72" width="300" height="8" fill="#${game.home.color}"/>
  <rect x="34" y="104" width="532" height="310" rx="28" fill="#fff" fill-opacity=".055" stroke="#fff" stroke-opacity=".12"/>
  <rect x="34" y="445" width="532" height="310" rx="28" fill="#fff" fill-opacity=".055" stroke="#fff" stroke-opacity=".12"/>
  <rect x="34" y="104" width="10" height="310" rx="5" fill="#${game.away.color}"/><rect x="556" y="445" width="10" height="310" rx="5" fill="#${game.home.color}"/>
  ${fieldLines(600, 840, 0.055)}
  <g filter="url(#shadow)">${logoMarkup(awayLogo, 180, 125, 240, game.away.abbreviation)}</g>
  <text x="300" y="396" class="team" font-size="${awayFontSize}" text-anchor="middle">${escapeXml(awayName)}</text>
  <g transform="translate(300 430)" filter="url(#badgeShadow)"><circle r="41" fill="#050A12" stroke="#fff" stroke-width="5"/><text y="11" class="vs" text-anchor="middle">VS</text></g>
  <g filter="url(#shadow)">${logoMarkup(homeLogo, 180, 470, 240, game.home.abbreviation)}</g>
  <text x="300" y="735" class="team" font-size="${homeFontSize}" text-anchor="middle">${escapeXml(homeName)}</text>
  <path d="M0 760 H600 V900 H0Z" fill="url(#timeOverlay)"/>${timeBlock}
  <style>
    text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#fff}.event-label{font-size:16px;font-weight:900;letter-spacing:1px}.team{font-weight:950;letter-spacing:1px}.vs{font-size:27px;font-weight:950}.qualifier{font-size:16px;font-weight:900;letter-spacing:4px;opacity:.7}.time{font-size:23px;font-weight:900;letter-spacing:.2px}.abbr{font-family:Impact,Arial Black,sans-serif;font-size:84px;font-weight:900;fill:#fff}
  </style>
  </svg>`;
}

async function landscapeSvg(game, timeZone, leagueLabel = 'MLB') {
  const [awayLogo, homeLogo] = await Promise.all([
    imageDataUri(game.away.logo),
    imageDataUri(game.home.logo)
  ]);
  const scheduled = escapeXml(formatDateTime(game.date, timeZone).toUpperCase());
  const awayName = game.away.nickname.toUpperCase();
  const homeName = game.home.nickname.toUpperCase();
  const awayFontSize = fittedFontSize(awayName, 54, 22, 620);
  const homeFontSize = fittedFontSize(homeName, 54, 22, 620);
  const eventLabel = game.eventName
    ? `<text x="960" y="55" text-anchor="middle" class="event-label">${escapeXml(game.eventName.toUpperCase())}</text>`
    : '';
  const timeBlock = game.timeQualifier
    ? `<text x="960" y="905" text-anchor="middle" class="qualifier">${escapeXml(game.timeQualifier)}</text><text x="960" y="990" text-anchor="middle" class="time">${scheduled}</text>`
    : `<text x="960" y="970" text-anchor="middle" class="time">${scheduled}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0A1728"/><stop offset=".5" stop-color="#06101D"/><stop offset="1" stop-color="#02050A"/></linearGradient><linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#02050A" stop-opacity=".65"/><stop offset="1" stop-color="#02050A"/></linearGradient><radialGradient id="awayGlow" cx="0" cy=".5" r=".75"><stop stop-color="#${game.away.color}" stop-opacity=".32"/><stop offset="1" stop-color="#${game.away.color}" stop-opacity="0"/></radialGradient><radialGradient id="homeGlow" cx="1" cy=".5" r=".75"><stop stop-color="#${game.home.color}" stop-opacity=".32"/><stop offset="1" stop-color="#${game.home.color}" stop-opacity="0"/></radialGradient><filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".65"/></filter></defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <rect width="1920" height="1080" fill="url(#awayGlow)"/><rect width="1920" height="1080" fill="url(#homeGlow)"/>
  ${eventLabel}
  ${fieldLines(1920, 1000, 0.045)}
  <rect x="110" y="80" width="650" height="675" rx="46" fill="#fff" fill-opacity=".05" stroke="#fff" stroke-opacity=".12"/><rect x="1160" y="80" width="650" height="675" rx="46" fill="#fff" fill-opacity=".05" stroke="#fff" stroke-opacity=".12"/>
  <rect x="110" y="80" width="14" height="675" rx="7" fill="#${game.away.color}"/><rect x="1796" y="80" width="14" height="675" rx="7" fill="#${game.home.color}"/>
  <g filter="url(#shadow)">${logoMarkup(awayLogo, 255, 125, 370, game.away.abbreviation)}${logoMarkup(homeLogo, 1295, 125, 370, game.home.abbreviation)}</g>
  <g transform="translate(960 405)"><circle r="72" fill="#050A12" stroke="#fff" stroke-width="6"/><text y="22" text-anchor="middle" class="vs">VS</text></g>
  <text x="435" y="690" text-anchor="middle" class="team" font-size="${awayFontSize}">${escapeXml(awayName)}</text><text x="1485" y="690" text-anchor="middle" class="team" font-size="${homeFontSize}">${escapeXml(homeName)}</text>
  <path d="M0 835 H1920 V1080 H0Z" fill="url(#overlay)"/>${timeBlock}
  <style>text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#fff}.event-label{font-size:26px;font-weight:900;letter-spacing:2px}.vs{font-size:58px;font-weight:950}.qualifier{font-size:25px;font-weight:900;letter-spacing:8px;opacity:.72}.time{font-size:54px;font-weight:950}.team{font-weight:950}.abbr{font-family:Impact,Arial Black,sans-serif;font-size:140px;font-weight:900}</style>
  </svg>`;
}

function schedulePosterSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
  <defs><radialGradient id="glow" cx="50%" cy="32%" r="74%"><stop stop-color="#153d76"/><stop offset=".55" stop-color="#090f19"/><stop offset="1" stop-color="#020305"/></radialGradient></defs>
  <rect width="600" height="900" rx="26" fill="url(#glow)"/><circle cx="300" cy="300" r="164" fill="#f8f3e8" stroke="#fff" stroke-width="10"/>
  <path d="M184 195 Q258 300 184 405 M416 195 Q342 300 416 405" fill="none" stroke="#c82b3d" stroke-width="8" stroke-dasharray="18 15"/>
  <rect x="95" y="244" width="410" height="112" rx="18" fill="#071a35" stroke="#fff" stroke-width="7"/><text x="300" y="319" text-anchor="middle" class="mlb">MLB</text>
  <path d="M80 555 H520" stroke="#c82b3d" stroke-width="7"/><text x="300" y="650" text-anchor="middle" class="title">UPCOMING</text><text x="300" y="725" text-anchor="middle" class="title">SCHEDULE</text>
  <text x="300" y="810" text-anchor="middle" class="hint">FULL REMAINING SEASON</text>
  <style>text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#fff}.mlb{font-size:76px;font-weight:950;letter-spacing:8px}.title{font-size:56px;font-weight:950;letter-spacing:2px}.hint{font-size:23px;font-weight:750;letter-spacing:5px;opacity:.65}</style>
  </svg>`;
}

function scheduleLandscapeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080"><defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#020407"/><stop offset="1" stop-color="#0a2d62"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#bg)"/>${fieldLines(1920, 1080, 0.14)}<circle cx="1500" cy="300" r="205" fill="#f7f2e7" opacity=".95"/><path d="M1370 140 Q1480 300 1370 460 M1630 140 Q1520 300 1630 460" fill="none" stroke="#c82b3d" stroke-width="12" stroke-dasharray="24 20"/><text x="120" y="435" class="small">MAJOR LEAGUE BASEBALL</text><text x="120" y="570" class="title">UPCOMING</text><text x="120" y="690" class="title">SCHEDULE</text><style>text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#fff}.small{font-size:34px;font-weight:800;letter-spacing:7px;opacity:.7}.title{font-size:105px;font-weight:950;letter-spacing:2px}</style></svg>`;
}

function leagueLogoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="18" y="116" width="476" height="280" rx="55" fill="#071d3d" stroke="#fff" stroke-width="18"/><circle cx="138" cy="256" r="82" fill="#f8f3e8"/><path d="M86 193 Q140 256 86 319 M190 193 Q136 256 190 319" fill="none" stroke="#c42b3c" stroke-width="7" stroke-dasharray="15 12"/><text x="304" y="293" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="96" font-weight="950" fill="#fff">MLB</text></svg>`;
}

function folderIcon(folderId) {
  const common = 'fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"';
  const icons = {
    baseball: `<circle cx="820" cy="255" r="135" fill="#fff" opacity=".94"/><path d="M725 160 Q820 255 725 350 M915 160 Q820 255 915 350" fill="none" stroke="#D52A42" stroke-width="12" stroke-dasharray="22 18"/>`,
    nfl: `<path d="M665 255 Q820 105 975 255 Q820 405 665 255Z" ${common}/><path d="M760 255 H880 M790 220 V290 M820 210 V300 M850 220 V290" ${common}/>`,
    'college-football': `<path d="M665 255 Q820 105 975 255 Q820 405 665 255Z" ${common}/><path d="M760 255 H880 M790 220 V290 M820 210 V300 M850 220 V290" ${common}/>`,
    nba: `<circle cx="820" cy="255" r="145" ${common}/><path d="M675 255 H965 M820 110 V400 M715 150 Q820 255 715 360 M925 150 Q820 255 925 360" ${common}/>`,
    wnba: `<circle cx="820" cy="255" r="145" ${common}/><path d="M675 255 H965 M820 110 V400 M715 150 Q820 255 715 360 M925 150 Q820 255 925 360" ${common}/>`,
    hockey: `<ellipse cx="850" cy="325" rx="145" ry="55" fill="#060B12" stroke="#fff" stroke-width="16"/><path d="M690 95 L805 310 M960 95 L885 270" ${common}/>`,
    soccer: `<circle cx="820" cy="255" r="145" ${common}/><path d="M820 190 L875 230 L855 295 H785 L765 230 Z M820 190 L820 110 M875 230 L950 205 M855 295 L900 365 M785 295 L740 365 M765 230 L690 205" ${common}/>`,
    golf: `<path d="M790 90 V350 M790 100 L940 150 L790 205" ${common}/><circle cx="700" cy="360" r="24" fill="#fff"/><path d="M640 395 Q790 350 980 395" ${common}/>`,
    ufc: `<path d="M735 115 H905 L985 195 V315 L905 395 H735 L655 315 V195 Z" ${common}/><text x="820" y="285" text-anchor="middle" font-family="Arial Black,Arial" font-size="88" font-weight="900" fill="#fff">UFC</text>`,
    f1: `<path d="M660 130 H940 L875 200 H720 M660 225 H865 L800 295 H660 M660 320 H790 L745 380 H660" ${common}/><path d="M895 225 H980" stroke="#fff" stroke-width="18" stroke-dasharray="22 16"/>`,
    tennis: `<circle cx="820" cy="255" r="145" ${common}/><path d="M700 160 Q820 255 700 350 M940 160 Q820 255 940 350" ${common}/>`
  };
  return icons[folderId] || icons.baseball;
}

async function folderSvg(folder) {
  const logos = await Promise.all((folder.logoUrls || []).map((url) => imageDataUri(url)));
  const validLogos = logos.filter(Boolean);
  const fullCoverLogos = validLogos.length > 1
    ? validLogos.slice(0, 2).map((logo, index) => (
      `<image href="${logo}" x="${30 + index * 585}" y="35" width="555" height="605" preserveAspectRatio="xMidYMid meet"/>`
    )).join('')
    : validLogos.length === 1
      ? `<image href="${validLogos[0]}" x="35" y="25" width="1130" height="625" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="600" y="365" text-anchor="middle" class="fallback">${escapeXml(folder.subtitle.toUpperCase())}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675"><rect width="1200" height="675" fill="#FFFFFF"/>${fullCoverLogos}<style>.fallback{font-family:Inter,Segoe UI,Arial,sans-serif;font-size:86px;font-weight:950;fill:#08101C}</style></svg>`;
}

function wrapTitle(value, max = 24) {
  const words = String(value || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

async function eventPosterSvg(event, folder, timeZone) {
  const lines = wrapTitle(event.name);
  const title = lines.map((line, index) => `<text x="300" y="${330 + index * 66}" text-anchor="middle" class="title">${escapeXml(line.toUpperCase())}</text>`).join('');
  const participants = (event.participants || []).slice(0, 2).map((entry) => entry.name).join(' • ');
  const logo = await imageDataUri((folder.logoUrls || [])[0]);
  const mark = logo
    ? `<image href="${logo}" x="190" y="92" width="220" height="190" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="300" y="218" text-anchor="middle" class="mark">${escapeXml(event.leagueName.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase())}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${folder.colors[0]}"/><stop offset="1" stop-color="${folder.colors[1]}"/></linearGradient></defs><rect width="600" height="900" rx="26" fill="url(#bg)"/><g transform="translate(-520 30) scale(.95)" opacity=".12">${folderIcon(folder.id)}</g><text x="32" y="58" class="eyebrow">${escapeXml(event.leagueName.toUpperCase())} • SCHEDULE</text>${mark}${title}<text x="300" y="665" text-anchor="middle" class="participants">${escapeXml(participants)}</text><path d="M0 760 H600 V900 H0Z" fill="#03070D" fill-opacity=".88"/><text x="300" y="838" text-anchor="middle" class="time">${escapeXml(eventScheduleLabel(event, timeZone).toUpperCase())}</text><style>text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#fff}.eyebrow{font-size:20px;font-weight:850;letter-spacing:3px}.mark{font-size:40px;font-weight:950}.title{font-size:49px;font-weight:950}.participants{font-size:20px;font-weight:700;opacity:.8}.time{font-size:23px;font-weight:900}</style></svg>`;
}

async function eventLandscapeSvg(event, folder, timeZone) {
  const lines = wrapTitle(event.name, 38);
  const title = lines.map((line, index) => `<text x="600" y="${285 + index * 74}" text-anchor="middle" class="title">${escapeXml(line.toUpperCase())}</text>`).join('');
  const logo = await imageDataUri((folder.logoUrls || [])[0]);
  const mark = logo
    ? `<image href="${logo}" x="475" y="105" width="250" height="130" preserveAspectRatio="xMidYMid meet"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${folder.colors[0]}"/><stop offset="1" stop-color="${folder.colors[1]}"/></linearGradient></defs><rect width="1200" height="675" rx="34" fill="url(#bg)"/><g opacity=".1">${folderIcon(folder.id)}</g><rect x="45" y="40" width="1110" height="595" rx="26" fill="#02050A" fill-opacity=".28" stroke="#fff" stroke-opacity=".18"/><text x="80" y="92" class="eyebrow">${escapeXml(event.leagueName.toUpperCase())} • SCHEDULE</text>${mark}${title}<path d="M45 515 H1155 V635 H45Z" fill="#02050A" fill-opacity=".72"/><text x="600" y="585" text-anchor="middle" class="time">${escapeXml(eventScheduleLabel(event, timeZone).toUpperCase())}</text><style>text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#fff}.eyebrow{font-size:24px;font-weight:850;letter-spacing:5px}.title{font-size:58px;font-weight:950}.time{font-size:30px;font-weight:900;letter-spacing:2px}</style></svg>`;
}

module.exports = {
  escapeXml,
  imageDataUri,
  eventScheduleLabel,
  posterSvg,
  landscapeSvg,
  schedulePosterSvg,
  scheduleLandscapeSvg,
  leagueLogoSvg,
  folderSvg,
  eventPosterSvg,
  eventLandscapeSvg
};
