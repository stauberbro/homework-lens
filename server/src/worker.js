// Homework Lens server.
//  - POST /v1/sample          the app's Claude requests (holds the Anthropic API key)
//  - POST /v1/reviews         a review written in the app (13+ only)
//  - GET  /v1/reviews/picked  reviews you chose to show on the download page (public)
//  - GET  /v1/admin/reviews           every review       (needs ADMIN_KEY)
//  - POST /v1/admin/reviews/:id       {action: "pick"|"unpick"|"hide"|"delete"}  (needs ADMIN_KEY)
// Claude answers stream back as newline-delimited JSON:
//   {"t":"delta","text":"..."}  {"t":"done","truncated":false}  {"t":"error","code":"...","message":"..."}
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MAX_PROMPT_BYTES = 262144;
const MAX_IMAGES = 5;
const MAX_IMAGE_BASE64 = 7_000_000; // ~5 MB per image after the app downsizes it
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const SYSTEM =
  "You are the assistant inside Homework Lens, a study app for students. " +
  "Each request comes from the app and contains its own instructions, the student's material and the format to answer in. Follow them.";
const JSON_NOTE =
  "Your reply will be read by a program as one JSON value. Reply with only that JSON value, with no text before or after it.";

// Effort per request: the app may ask for "low"; tiers map onto effort for this one model.
const TIER_EFFORT = { quick: "low", default: "medium", complex: "high" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Key, Authorization",
  "Access-Control-Max-Age": "86400",
};

// Basic hardening headers on every response.
const SEC = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};
// Only your website may call the admin routes from a browser.
const ADMIN_ORIGIN = "https://stauberbro.github.io";

function json(status, data, extra) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, ...SEC, "Content-Type": "application/json", ...(extra || {}) },
  });
}
function fail(status, code, message) {
  return json(status, { code, message });
}

// ---------------------------------------------------------------- Claude

// Accepts a prompt string or user/assistant turns; returns Messages API turns.
function toMessages(input, images) {
  let turns;
  if (typeof input === "string") turns = [{ role: "user", content: input }];
  else if (Array.isArray(input)) turns = input;
  else return null;

  const merged = [];
  let bytes = 0;
  for (const t of turns) {
    if (!t || (t.role !== "user" && t.role !== "assistant")) return null;
    if (typeof t.content !== "string" || !t.content.trim()) return null;
    bytes += new TextEncoder().encode(t.content).length;
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.text += "\n\n" + t.content;
    else merged.push({ role: t.role, text: t.content });
  }
  if (!merged.length || merged[0].role !== "user" || merged[merged.length - 1].role !== "user") return null;
  if (bytes > MAX_PROMPT_BYTES) return "too_large";

  return merged.map((m, i) => {
    if (i === merged.length - 1 && images.length) {
      return {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image",
            source: { type: "base64", media_type: img.media_type, data: img.data },
          })),
          { type: "text", text: m.text },
        ],
      };
    }
    return { role: m.role, content: m.text };
  });
}

function errorCode(err) {
  if (err instanceof Anthropic.APIUserAbortError) return "cancelled";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.AuthenticationError) return "sampling_disabled";
  if (err instanceof Anthropic.BadRequestError) return "invalid_request";
  return "upstream_error";
}

async function handleSample(req, env, ctx) {
  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_request", "The request was not valid JSON.");
  }

  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > MAX_IMAGES) return fail(400, "image_rejected", `At most ${MAX_IMAGES} images per request.`);
  for (const img of images) {
    if (!img || !IMAGE_TYPES.includes(img.media_type) || typeof img.data !== "string" || img.data.length > MAX_IMAGE_BASE64) {
      return fail(400, "image_rejected", "An image was the wrong type or too large.");
    }
  }

  const messages = toMessages(body.input, images);
  if (messages === "too_large") return fail(413, "prompt_too_large", "The request was too long.");
  if (!messages) return fail(400, "invalid_request", "The input must be text, or turns that start and end with the user.");

  const effort =
    ["low", "medium", "high"].includes(body.effort) ? body.effort : TIER_EFFORT[body.modelTier] || "medium";

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 32000,
      system: body.json ? SYSTEM + "\n\n" + JSON_NOTE : SYSTEM,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort },
      // If the model declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal: req.signal },
  );

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (obj) => writer.write(enc.encode(JSON.stringify(obj) + "\n")).catch(() => {});

  ctx.waitUntil(
    (async () => {
      try {
        stream.on("text", (delta) => send({ t: "delta", text: delta }));
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") send({ t: "error", code: "refused", message: "Claude declined this request." });
        else send({ t: "done", truncated: msg.stop_reason === "max_tokens" });
      } catch (err) {
        send({ t: "error", code: errorCode(err), message: "The answer could not be finished." });
      } finally {
        writer.close().catch(() => {});
      }
    })(),
  );

  return new Response(readable, {
    headers: { ...CORS, ...SEC, "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}

// ---------------------------------------------------------------- Reviews

// Reviews live in Workers KV under "r:<id>". Nothing is public until you pick it.
// No emails, no full names, no IP addresses are stored. A one-way hash of the IP
// is kept for one hour only, to stop the same device posting again and again.

function cleanText(s, max) {
  return String(s || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function allReviews(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.REVIEWS.list({ prefix: "r:", cursor });
    const vals = await Promise.all(page.keys.map((k) => env.REVIEWS.get(k.name, "json")));
    for (const v of vals) if (v) out.push(v);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  out.sort((a, b) => b.created - a.created);
  return out;
}

async function handleNewReview(req, env) {
  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_request", "The review was not valid JSON.");
  }
  const stars = Number(body.stars);
  const text = cleanText(body.text, 500);
  const name = cleanText(body.name, 24);
  if (body.age13 !== true) return fail(403, "not_allowed", "Reviews are for users 13 and older.");
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail(400, "invalid_request", "Pick 1 to 5 stars.");
  if (text.length < 3) return fail(400, "invalid_request", "Write a few words.");

  const ipKey = "ip:" + (await sha256((req.headers.get("CF-Connecting-IP") || "unknown") + "|homework-lens"));
  if (await env.REVIEWS.get(ipKey)) return fail(429, "rate_limited", "You already sent a review. Thanks!");

  const id = Date.now().toString(36) + "-" + crypto.randomUUID().slice(0, 8);
  const review = { id, stars, text, name, created: Date.now(), status: "new" };
  await env.REVIEWS.put("r:" + id, JSON.stringify(review));
  await env.REVIEWS.put(ipKey, "1", { expirationTtl: 3600 });
  return json(201, { ok: true });
}

async function handlePicked(env) {
  const picked = (await allReviews(env))
    .filter((r) => r.status === "picked")
    .map((r) => ({ stars: r.stars, text: r.text, name: r.name || "", created: r.created }));
  return json(200, { reviews: picked }, { "Cache-Control": "public, max-age=60" });
}

// Compares the password in constant time (hash both, then compare every byte).
async function isAdmin(req, env) {
  const got = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.ADMIN_KEY || !got) return false;
  const [a, b] = await Promise.all([sha256(got), sha256(String(env.ADMIN_KEY).trim())]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const MAX_FAILS = 10; // wrong passwords per device per hour before a lockout

async function handleAdmin(req, env, path) {
  if (!env.ADMIN_KEY) return fail(503, "not_set_up", "Add the ADMIN_KEY secret and deploy again.");

  const failKey = "fail:" + (await sha256((req.headers.get("CF-Connecting-IP") || "unknown") + "|admin"));
  const fails = Number((await env.REVIEWS.get(failKey)) || 0);
  if (fails >= MAX_FAILS) return fail(429, "locked", "Too many wrong passwords. Try again in an hour.");
  if (!(await isAdmin(req, env))) {
    await env.REVIEWS.put(failKey, String(fails + 1), { expirationTtl: 3600 });
    return fail(401, "wrong_password", "Wrong password.");
  }

  if (req.method === "GET" && path === "/v1/admin/reviews") return json(200, { reviews: await allReviews(env) }, { "Cache-Control": "no-store" });

  const m = path.match(/^\/v1\/admin\/reviews\/([a-z0-9-]{6,40})$/);
  if (req.method === "POST" && m) {
    const key = "r:" + m[1];
    const review = await env.REVIEWS.get(key, "json");
    if (!review) return fail(404, "not_found", "That review no longer exists.");
    let body = {};
    try { body = await req.json(); } catch {}
    const action = body.action;
    if (action === "delete") {
      await env.REVIEWS.delete(key);
      return json(200, { ok: true, deleted: true });
    }
    const next = { pick: "picked", unpick: "new", hide: "hidden" }[action];
    if (!next) return fail(400, "invalid_request", "Unknown action.");
    review.status = next;
    await env.REVIEWS.put(key, JSON.stringify(review));
    return json(200, { ok: true, review });
  }
  return fail(404, "not_found", "Unknown route.");
}

// ---------------------------------------------------------------- Router

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    const isAdminPath = path.startsWith("/v1/admin/");
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: { ...CORS, ...SEC, ...(isAdminPath ? { "Access-Control-Allow-Origin": ADMIN_ORIGIN, Vary: "Origin" } : {}) },
      });
    }
    if (path === "/health") return new Response("ok", { headers: { ...CORS, ...SEC } });

    const who = req.headers.get("CF-Connecting-IP") || "unknown";

    // Public: picked reviews for the download page (cached at Cloudflare for a minute).
    if (req.method === "GET" && path === "/v1/reviews/picked") {
      if (!env.REVIEWS) return json(200, { reviews: [] });
      const cache = caches.default;
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await handlePicked(env);
      ctx.waitUntil(cache.put(req, res.clone()));
      return res;
    }

    // Admin: your review manager page. Rate limited and only answered for your website.
    if (isAdminPath) {
      if (!env.REVIEWS) return fail(503, "not_set_up", "The reviews database is not connected yet.");
      if (env.LIMITER) {
        const { success } = await env.LIMITER.limit({ key: "admin:" + who });
        if (!success) return fail(429, "rate_limited", "Too many requests. Wait a minute.");
      }
      const res = await handleAdmin(req, env, path);
      const h = new Headers(res.headers);
      h.set("Access-Control-Allow-Origin", ADMIN_ORIGIN);
      h.set("Vary", "Origin");
      return new Response(res.body, { status: res.status, headers: h });
    }

    // Everything else is only for the app.
    // A light check that the request came from the app. Not a secret (it ships inside the app),
    // so the real protection is the rate limit below and the spend limit on your Anthropic account.
    if (env.APP_KEY && req.headers.get("X-App-Key") !== env.APP_KEY) {
      return fail(403, "not_granted", "This server only answers the Homework Lens app.");
    }
    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: who });
      if (!success) return fail(429, "rate_limited", "Too many requests. Wait a minute and try again.");
    }

    if (req.method === "POST" && path === "/v1/sample") return handleSample(req, env, ctx);
    if (req.method === "POST" && path === "/v1/reviews") {
      if (!env.REVIEWS) return fail(503, "not_set_up", "Reviews are not set up yet.");
      return handleNewReview(req, env);
    }
    return fail(404, "not_found", "Unknown route.");
  },
};
