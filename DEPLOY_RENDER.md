# Run Dugout Live without leaving your computer on

The recommended deployment is a paid Render web service using the included Dockerfile and `render.yaml`. It provides an always-available HTTPS address that works from phones and TVs outside your home network. The add-on server handles schedules, artwork, matching, and short playback probes; the selected IPTV stream is played directly by the client.

## Before deploying

1. Put this folder in a **private** GitHub repository. Never commit `.env`; it is already excluded by `.gitignore` and `.dockerignore`.
2. Create a private access token with 32 or more random letters and numbers. For example, a password manager can generate one. It must be 16-128 characters and may use letters, numbers, `_`, and `-`.
3. Have these values ready:
   - `ACCESS_TOKEN`
   - `XTREAM_BASE_URL`
   - `XTREAM_USERNAME`
   - `XTREAM_PASSWORD`

## Deploy

1. Sign in at https://dashboard.render.com and connect the private GitHub repository.
2. Choose **New > Blueprint**, select the repository, and use its root `render.yaml`.
3. When Render prompts for secret values, enter the four values listed above. Do not put them in `render.yaml`.
4. Deploy the Blueprint and wait for `/health` to report a successful check.
5. Copy the service URL, such as `https://dugout-live-sports-hub.onrender.com`.
6. Install this manifest in Nuvio/Stremio:

   `https://dugout-live-sports-hub.onrender.com/YOUR_ACCESS_TOKEN/manifest.json`

Replace both the hostname and token with your actual values. Do not share that complete manifest URL.

## Optional category IDs

The add-on discovers sports categories automatically. If a sport does not find the right channels, add its existing `XTREAM_CATEGORY_IDS_*` value in **Render > Service > Environment**, then choose **Save and deploy**. Do not add `PORT`; Render supplies it automatically. `PUBLIC_URL` is also unnecessary because the app reads Render's public HTTPS URL automatically.

## Verify before installing on every device

1. Open `https://YOUR-HOST/health`; it should return `{"ok":true,...}`.
2. Open the protected manifest URL; it should return version `2.0.0`.
3. Open a currently active event and confirm at least one stream appears and plays.

If schedules load but all stream lists are empty, the IPTV provider may block cloud/datacenter IP addresses. In that case, use a small home appliance (Raspberry Pi or always-on router/NAS) or a residential VPN tunnel instead of a public cloud host.
