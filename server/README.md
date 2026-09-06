# YouTube clip import — deployment pending

The feature is implemented on `feature/youtube-clips`. It is **not enabled on the live Site** until a container host is connected and extraction is verified from its IP address.

## Architecture

The existing Ambient URL remains the interface. Its Sites Worker serves the same static assets and proxies `/api/youtube/*` to a private-token container. The container runs yt-dlp (with Node/EJS) to locate audio, then FFmpeg to extract the requested segment as stereo 44.1 kHz PCM16 WAV. The client downloads the WAV into the existing audio engine. Secrets never appear in client JavaScript.

## Container deployment

Create a Docker service from `OSKRENH/ambient`, branch `feature/youtube-clips`, root directory `/`, Dockerfile `/Dockerfile`. Configure `/healthz` as its health check. Use **one service replica and one Gunicorn worker**: job state is in process memory and the processing pool has two threads. The container respects the injected `PORT` variable. No database or durable volume is needed.

Generate a strong random `YOUTUBE_IMPORT_TOKEN` of at least 32 characters and set it on the container. Keep it in hosting secrets, never in Git, logs, PRs or the browser. Direct API requests without that token are rejected. Keep the Sites app's current private audience.

Set on the existing Sites project:

| Variable | Value |
| --- | --- |
| `YOUTUBE_IMPORT_URL` | The deployed container's HTTPS origin |
| `YOUTUBE_IMPORT_TOKEN` | The same secret as the container |

Run `python3 server/build_worker.py` to produce `dist/server/index.js`. The feature branch's `.openai/hosting.json` retains the existing project ID and switches from static hosting to Worker hosting. Use the Sites build/package/publish workflow for that same project after the container is verified. Do not create a replacement Site. `dist/` remains the authored frontend; `dist/server/` is generated and ignored in Git.

## Required live verification before enabling

1. From the deployed container, import a short public video with a known permitted test segment. Check ready status, downloaded WAV duration, and playback in Ambient.
2. Verify cancellation, bad timestamps, deleted/restricted video errors and API auth. The local tests already cover validation, WAV cutting with real FFmpeg, Worker proxy behavior and audio engine regressions; they do not demonstrate live YouTube extraction.
3. Then save/publish the same Sites project and merge the reviewed feature branch.

Current environment has no yt-dlp installation, container runtime, or connected Docker hosting account. No live YouTube extraction or container build has been claimed. Connection of Railway was identified as the missing deployment capability; hosting costs or plans must be resolved from that account before provisioning.

## Limits and lifecycle

- Accept only canonical YouTube video IDs; discard playlist parameters. No arbitrary download URLs, user cookies or shell arguments.
- Clip duration: 0.1–120 seconds. Start/end within the first 24 hours. Reject live streams and intervals past the end.
- Direct audio URL must be HTTPS on a googlevideo.com subdomain. Server credentials are not forwarded to YouTube.
- At most 8 retained jobs and 2 simultaneous extractions. Active extraction timeout: 180 seconds. Container restarts discard jobs; the UI reports that the clip is unavailable.
- FFmpeg output is capped and checked for PCM16 stereo, 44.1 kHz and selected duration (150 ms tolerance).
- Successful imports delete their temporary file after download. Unclaimed completed files expire after 15 minutes; a minute-by-minute janitor deletes them even with no further requests. Failed/cancelled work cleans up temporary files. There is no permanent audio storage.
- YouTube may reject requests from a hosting IP, require login, throttle media or change extraction behavior. Report those failures; do not claim guaranteed access or substitute random public downloader APIs. The yt-dlp dependency is intentionally refreshed when rebuilding the container; rebuilds should be live-tested before rollout.

## Local checks

`node --test tests/*.test.js`

`python3 -m unittest discover -s server/tests -v`

`python3 server/build_worker.py`

The Python integration test uses a generated local WAV over a temporary loopback HTTP server and real FFmpeg. It does not access YouTube or exercise a browser.

References: [yt-dlp](https://github.com/yt-dlp/yt-dlp), [Railway Dockerfiles](https://docs.railway.com/guides/dockerfiles), [Railway health checks](https://docs.railway.com/deployments/healthchecks).
