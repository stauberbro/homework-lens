// Homework Lens server: holds the Anthropic API key and passes the app's requests to Claude.
// The desktop app never sees the key. Answers stream back as newline-delimited JSON:
//   {"t":"delta","text":"..."}   more of the answer
//   {"t":"done","truncated":false}
//   {"t":"error","code":"rate_limited","message":"..."}
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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Key",
  "Access-Control-Max-Age": "86400",
};

function fail(status, code, message) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

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

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/health") return new Response("ok", { headers: CORS });
    if (req.method !== "POST" || url.pathname !== "/v1/sample") return fail(404, "not_found", "Unknown route.");

    // A light check that the request came from the app. Not a secret (it ships inside the app),
    // so the real protection is the rate limit below and the spend limit on your Anthropic account.
    if (env.APP_KEY && req.headers.get("X-App-Key") !== env.APP_KEY) {
      return fail(403, "not_granted", "This server only answers the Homework Lens app.");
    }

    if (env.LIMITER) {
      const who = req.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.LIMITER.limit({ key: who });
      if (!success) return fail(429, "rate_limited", "Too many requests. Wait a minute and try again.");
    }

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
      headers: { ...CORS, "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
    });
  },
};
