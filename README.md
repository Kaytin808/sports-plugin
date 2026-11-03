# Dugout Live Sports Hub

A self-hosted Nuvio/Stremio sports hub. It presents wide sport-folder cards, opens each folder into a rolling seven-day schedule, generates team matchup artwork, and matches events to channels from **your own authorized Xtream subscription**.

For an always-available HTTPS deployment that works on phones and TVs without leaving a computer on, see [`DEPLOY_RENDER.md`](DEPLOY_RENDER.md). Public deployments support a private tokenized manifest path so anonymous visitors cannot enumerate stream endpoints.

It does not provide or redistribute streams.

## What works

- A clean `Sports` row with wide folders for Baseball, NFL, College Football, NBA, WNBA, Hockey, Soccer, Golf, Combat Sports, Motorsport, and Tennis
- A flat, chronological seven-day schedule inside each folder, backed by one hidden compatibility season so Nuvio renders every game card
- The schedule window advances automatically each day and drops dates that have passed
- MLB, NFL, NCAA football, NBA, WNBA, NHL, MLS, Premier League, La Liga, Champions League, PGA Tour, UFC, Formula 1, ATP, and WTA schedule feeds
- Local start times using `TIME_ZONE`
- Full-canvas official league-logo covers for every sports collection folder; no generated backgrounds, frames, captions, or sport icons
- Real team-logo matchup cards fetched from the live schedule feed
- Nuvio-friendly raster PNG cards with a visible scheduled date/time overlay
- UFC is expanded into individual bout cards with fighter-vs-fighter artwork and real ESPN athlete headshots when available
- Formula 1 weekends are expanded into practice, sprint, qualifying, and race session cards
- ATP and WTA draws are expanded into confirmed player-vs-player matches, rounds, courts, and published start times
- Every non-team event card shows the configured local weekday, date, start time, and timezone
- Minimal game tiles with invisible episode labels and no overview overlay, leaving the matchup art unobstructed
- Xtream category discovery and explicit category selection
- Short-EPG lookup with bounded concurrency
- Ranked channel matching using both teams, EPG timing, broadcaster hints, and 4K hints
- Just-in-time IPTV playback validation; only candidates delivering real MPEG-TS or HLS media are returned to the player
- Docker or direct Node.js startup

## Quick start on Windows

Requirements: Node.js 20 or newer and an Xtream subscription you are authorized to use.

```powershell
Copy-Item .env.example .env
notepad .env
npm install
npm test
npm start
```

Open [http://localhost:2323](http://localhost:2323) to see the live preview. Add this custom manifest in Nuvio or Stremio:

```text
http://localhost:2323/manifest.json
```

If Nuvio is on another device, replace `localhost` with this computer’s LAN IP address. You may also need to allow TCP port 2323 through Windows Firewall.

## Xtream configuration

Put the following only in `.env`:

```dotenv
XTREAM_BASE_URL=http://your-provider.example:8080
XTREAM_USERNAME=your_username
XTREAM_PASSWORD=your_password
XTREAM_BASEBALL_CATEGORY_IDS=12,34
XTREAM_CATEGORY_IDS_NFL=56
XTREAM_CATEGORY_IDS_HOCKEY=78,90
```

Start the server and visit `http://localhost:2323/api/status`. Its `categories` list contains category names and IDs but never returns your credentials. Copy the relevant numeric IDs into the sport-specific `XTREAM_CATEGORY_IDS_*` settings and restart.

If the category setting is blank, the add-on automatically chooses folders with names containing `MLB`, `baseball`, `USA Sports`, `US Sports`, or `Live Sports`. Explicit IDs are safer and faster.

Some providers require MPEG-TS playback URLs. If `.m3u8` streams do not play, set:

```dotenv
XTREAM_OUTPUT_EXTENSION=ts
```

## Docker

Create `.env` first, then run:

```powershell
docker compose up -d --build
```

## Useful checks

- Preview UI: `http://localhost:2323/`
- Health: `http://localhost:2323/health`
- Manifest: `http://localhost:2323/manifest.json`
- Today’s catalog: copy the current catalog URL shown by the manifest
- Configuration status and category IDs: `http://localhost:2323/api/status`

## Privacy and deployment

- `.env` is excluded from Git and must remain private.
- Credentials are never placed in the manifest, catalog, metadata, preview page, status response, or logs.
- Xtream playback URLs necessarily contain credentials when returned to the player. Therefore, keep the server and manifest URL private.
- For access outside your home network, use HTTPS behind a reverse proxy and set `PUBLIC_URL` to the public HTTPS origin.

## How matching works

The add-on does not guess from a generic channel such as `ESPN`. A candidate must clear the configured match score, normally by identifying both clubs across its channel name and EPG listing. Exact matchup names rank highest; EPG start-time proximity, listed broadcasters, baseball labels, and 4K labels refine the ordering.

The threshold can be changed with `MATCH_MIN_SCORE`, but lowering it may introduce incorrect streams.

## Expanding beyond baseball

The code is deliberately separated into schedule, artwork, Xtream, and matching modules. Additional league definitions can reuse the same pipeline; only the sport endpoint, team presentation, and art theme need to vary.
