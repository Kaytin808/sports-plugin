const LEAGUES = {
  mlb: { id: 'mlb', name: 'MLB', path: 'baseball/mlb', mode: 'team', lookaheadDays: 120 },
  nfl: { id: 'nfl', name: 'NFL', path: 'football/nfl', mode: 'team', lookaheadDays: 180 },
  ncaaf: { id: 'ncaaf', name: 'College Football', path: 'football/college-football', mode: 'team', lookaheadDays: 180, params: { groups: '80' } },
  nba: { id: 'nba', name: 'NBA', path: 'basketball/nba', mode: 'team', lookaheadDays: 210 },
  wnba: { id: 'wnba', name: 'WNBA', path: 'basketball/wnba', mode: 'team', lookaheadDays: 210 },
  nhl: { id: 'nhl', name: 'NHL', path: 'hockey/nhl', mode: 'team', lookaheadDays: 210 },
  mls: { id: 'mls', name: 'MLS', path: 'soccer/usa.1', mode: 'team', lookaheadDays: 210 },
  epl: { id: 'epl', name: 'Premier League', path: 'soccer/eng.1', mode: 'team', lookaheadDays: 210 },
  laliga: { id: 'laliga', name: 'La Liga', path: 'soccer/esp.1', mode: 'team', lookaheadDays: 210 },
  ucl: { id: 'ucl', name: 'Champions League', path: 'soccer/uefa.champions', mode: 'team', lookaheadDays: 210 },
  pga: { id: 'pga', name: 'PGA Tour', path: 'golf/pga', mode: 'event', lookaheadDays: 210 },
  ufc: { id: 'ufc', name: 'UFC', path: 'mma/ufc', mode: 'event', lookaheadDays: 210 },
  f1: { id: 'f1', name: 'Formula 1', path: 'racing/f1', mode: 'event', lookaheadDays: 210 },
  atp: { id: 'atp', name: 'ATP Tennis', path: 'tennis/atp', mode: 'event', lookaheadDays: 210 },
  wta: { id: 'wta', name: 'WTA Tennis', path: 'tennis/wta', mode: 'event', lookaheadDays: 210 }
};

const FOLDERS = [
  { id: 'baseball', name: 'Baseball', subtitle: 'MLB', leagues: ['mlb'], colors: ['#B51228', '#081D3A'], logoUrls: ['https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png'] },
  { id: 'nfl', name: 'NFL', subtitle: 'Professional Football', leagues: ['nfl'], colors: ['#0B4F8A', '#10233C'], logoUrls: ['https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png'] },
  { id: 'college-football', name: 'College Football', subtitle: 'NCAA Football', leagues: ['ncaaf'], colors: ['#A84617', '#32170C'], logoUrls: ['https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/NCAA_logo.svg/500px-NCAA_logo.svg.png'] },
  { id: 'nba', name: 'NBA', subtitle: 'Professional Basketball', leagues: ['nba'], colors: ['#C94D15', '#1A2F54'], logoUrls: ['https://a.espncdn.com/i/teamlogos/leagues/500/nba.png'] },
  { id: 'wnba', name: 'WNBA', subtitle: 'Women’s Basketball', leagues: ['wnba'], colors: ['#E45D21', '#3E164F'], logoUrls: ['https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png'] },
  { id: 'hockey', name: 'Hockey', subtitle: 'NHL', leagues: ['nhl'], colors: ['#08799D', '#071D35'], logoUrls: ['https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png'] },
  { id: 'soccer', name: 'Soccer', subtitle: 'MLS • EPL • La Liga • UCL', leagues: ['mls', 'epl', 'laliga', 'ucl'], colors: ['#07825D', '#082E25'], logoUrls: ['https://a.espncdn.com/i/teamlogos/leagues/500/mls.png'] },
  { id: 'golf', name: 'Golf', subtitle: 'PGA Tour', leagues: ['pga'], colors: ['#168F46', '#0B3320'], logoUrls: ['https://a.espncdn.com/i/teamlogos/leagues/500/pgatour.png'] },
  { id: 'ufc', name: 'Combat Sports', subtitle: 'UFC', leagues: ['ufc'], colors: ['#B5162C', '#26070D'], logoUrls: ['https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png'] },
  { id: 'f1', name: 'Motorsport', subtitle: 'Formula 1', leagues: ['f1'], colors: ['#D3182E', '#270B0F'], logoUrls: ['https://a.espncdn.com/i/teamlogos/leagues/500/f1.png'] },
  { id: 'tennis', name: 'Tennis', subtitle: 'ATP • WTA', leagues: ['atp', 'wta'], colors: ['#9AAE22', '#29330B'], logoUrls: ['https://www.atptour.com/-/media/sites/atp-tour/header/logo-atptour-dark_1.png', 'https://photoresources.wtatennis.com/wta/document/2025/12/04/5da42b69-828e-4814-9ef9-daa4c8f68b2e/WTA_Logo_Core_Purple_RGB.svg'] }
];

const foldersById = new Map(FOLDERS.map((folder) => [folder.id, folder]));

module.exports = { LEAGUES, FOLDERS, foldersById };
