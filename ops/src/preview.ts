/**
 * GET /yt/preview?id=&code= (playbook I-3.3). Live, unverified numbers for the UI; the oracle is what pays.
 * Uses its own API key (YT_API_KEY_PREVIEW), separate from the oracle's quota.
 */
import { HttpError, type Env } from "./env";
import type { YtVideo } from "./logic";

const CACHE_SECS = 60;

/**
 * One video from videos.list, cached for 60 s with the Cache API (per data centre). The cache holds the raw
 * item, so previews for different claim codes share it. Returns null when YouTube doesn't know the video.
 */
export async function fetchVideo(
  env: Env,
  videoId: string,
  ctx?: ExecutionContext,
  opts: { fresh?: boolean } = {},
): Promise<YtVideo | null> {
  const cacheKey = new Request(`https://ops-cache.cliprail/yt/${env.NETWORK}/${videoId}`);
  const cache = caches.default;
  if (!opts.fresh) {
    const hit = await cache.match(cacheKey);
    if (hit) return (await hit.json()) as YtVideo | null;
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,statistics,contentDetails,status");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", env.YT_API_KEY_PREVIEW);
  const res = await fetch(url);
  if (!res.ok) {
    // Never echo the response: on a bad key it repeats the request URL, key included.
    console.error(`videos.list failed: HTTP ${res.status}`);
    throw new HttpError(502, "YouTube didn't answer. Try again.");
  }
  const body = (await res.json()) as { items?: YtVideo[] };
  const video = body.items?.[0] ?? null;

  const put = cache.put(
    cacheKey,
    new Response(JSON.stringify(video), {
      headers: { "content-type": "application/json", "cache-control": `max-age=${CACHE_SECS}` },
    }),
  );
  if (ctx) ctx.waitUntil(put);
  else await put;
  return video;
}
