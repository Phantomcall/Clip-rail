/**
 * Cliprail ops Worker (PRD §5.5, playbook I-3.x).
 *   GET  /health                 network, addresses, relayer balance
 *   GET  /yt/preview?id=&code=   live, unverified preview of a Short (cached 60 s)
 *   POST /relay/register         gasless clip registration (RegisterClip signature)
 *   POST /relay/payout-address   gasless payout-address change (SetPayout signature)
 *   POST /relay/transfer         gasless USDC send-out (EIP-3009 signature)
 *   cron, every 5 minutes        keeper: release, autoResolve, expirePending, sweep
 */
import { BaseError, formatEther, type Hex } from "viem";
import { clients, shortError } from "./chain";
import { deployment, type Env, HttpError } from "./env";
import { runKeeper } from "./keeper";
import { CLAIM_CODE, originAllowed, toPreview } from "./logic";
import { fetchVideo } from "./preview";
import { relayPayoutAddress, relayRegister, relayTransfer, type RelayContext } from "./relay";
import { YT_ID } from "@cliprail/shared";

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!originAllowed(origin, env.WEB_ORIGINS)) return {};
  return {
    "access-control-allow-origin": origin!,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers, ...extra },
  });
}

/** A relay body is a few hundred bytes; ERC-1271 signatures can be a few KB. */
const MAX_BODY = 16_384;

const RELAYS: Record<string, (rc: RelayContext, body: unknown) => Promise<Hex>> = {
  "/relay/register": relayRegister,
  "/relay/payout-address": relayPayoutAddress,
  "/relay/transfer": relayTransfer,
};

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method === "GET" && url.pathname === "/health") {
    if (!(await env.PREVIEW_LIMIT.limit({ key: ip })).success) return json({ error: "Too many requests" }, 429, cors);
    const dep = deployment(env);
    const c = clients(env);
    try {
      const [rpcChainId, block, balance] = await Promise.all([
        c.publicClient.getChainId(),
        c.publicClient.getBlockNumber(),
        c.publicClient.getBalance({ address: c.address }),
      ]);
      // A wrong RPC_URL would sign for one chain and send to another: report it as unhealthy.
      const ok = dep !== null && rpcChainId === c.chain.id;
      return json(
        {
          ok,
          network: env.NETWORK,
          chainId: rpcChainId,
          block: block.toString(),
          vault: dep?.vault ?? null,
          lens: dep?.lens ?? null,
          relayer: c.address,
          relayerBalance: formatEther(balance),
        },
        ok ? 200 : 503,
        cors,
      );
    } catch {
      return json({ ok: false, network: env.NETWORK, error: "RPC unreachable" }, 503, cors);
    }
  }

  if (req.method === "GET" && url.pathname === "/yt/preview") {
    const id = url.searchParams.get("id") ?? "";
    const code = url.searchParams.get("code");
    if (!YT_ID.test(id)) return json({ error: "id: expected an 11-character YouTube video id" }, 400, cors);
    if (code !== null && code !== "" && !CLAIM_CODE.test(code)) return json({ error: "code: expected CR- and 16 hex characters" }, 400, cors);
    if (!(await env.PREVIEW_LIMIT.limit({ key: ip })).success) return json({ error: "Too many requests" }, 429, cors);
    const video = await fetchVideo(env, id, ctx);
    if (!video) return json({ error: "Video not found" }, 404, cors);
    return json(toPreview(video, code || null), 200, cors, { "cache-control": "public, max-age=60" });
  }

  const relay = RELAYS[url.pathname];
  if (relay && req.method === "POST") {
    if (!(await env.RELAY_LIMIT.limit({ key: ip })).success) return json({ error: "Too many requests" }, 429, cors);
    if (!(await env.RELAY_GLOBAL_LIMIT.limit({ key: "all" })).success) {
      return json({ error: "The relayer is busy. Try again in a minute." }, 429, cors);
    }
    const dep = deployment(env);
    if (!dep) return json({ error: `Cliprail isn't deployed on ${env.NETWORK} yet.` }, 503, cors);
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: "Body too large." }, 413, cors);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Body must be JSON." }, 400, cors);
    }
    const txHash = await relay({ env, dep, c: clients(env), ctx, nowMs: Date.now() }, body);
    console.log(`${url.pathname} sent ${txHash}`);
    return json({ txHash }, 200, cors);
  }

  return json({ error: "Not found" }, 404, cors);
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (err) {
      const cors = corsHeaders(req, env);
      if (err instanceof HttpError) return json({ error: err.message }, err.status, cors);
      if (err instanceof BaseError) {
        // viem: the RPC failed or timed out on a read.
        console.error("rpc", shortError(err));
        return json({ error: "The network didn't answer. Try again." }, 502, cors);
      }
      console.error("unhandled", err instanceof Error ? err.stack : err);
      return json({ error: "Something went wrong. Try again." }, 500, cors);
    }
  },

  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(runKeeper(env).catch((err) => console.error("keeper failed", err instanceof Error ? err.stack : err)));
  },
} satisfies ExportedHandler<Env>;
