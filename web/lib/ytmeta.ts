/**
 * Public title and channel of a YouTube video via oEmbed (no API key, CORS-enabled). The indexer only knows video IDs,
 * so live clip lists use this for display. Never used for anything paid: view counts come from the oracle only.
 */
export interface YtMeta {
  title: string;
  channel: string;
}

const cache = new Map<string, Promise<YtMeta | null>>();

export function ytMeta(videoId: string): Promise<YtMeta | null> {
  let hit = cache.get(videoId);
  if (!hit) {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/shorts/${videoId}`)}`;
    hit = fetch(url, { next: { revalidate: 86_400 } })
      .then(async (res) => {
        if (!res.ok) return null; // private, deleted or not processed yet
        const j = (await res.json()) as { title?: string; author_name?: string };
        return j.title ? { title: j.title, channel: j.author_name ?? "" } : null;
      })
      .catch(() => null);
    cache.set(videoId, hit);
  }
  return hit;
}
