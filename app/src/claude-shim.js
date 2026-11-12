// Stands in for claude.ai's `sample` connection, so the Homework Lens page runs unchanged
// as a desktop app. Every request goes to the Homework Lens server (see config.js),
// which holds the API key and calls Claude.
(function () {
  "use strict";
  var CFG = window.HL_CONFIG || {};
  var SERVER = String(CFG.server || "").replace(/\/+$/, "");
  var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  var MAX_IMAGES = 5;
  var MAX_INPUT_BYTES = 20e6;
  var MAX_PIXELS = 1.2e6; // images are downsized before sending, like claude.ai does

  function err(code, message, text) {
    var e = { code: code, message: message || code };
    if (text) e.text = text;
    return e;
  }

  // ----- answer cache (same rules as claude.ai: on by default, 5 minutes) -----
  var cache = new Map();
  function cacheWindow(opt) {
    if (opt === false) return 0;
    if (opt && typeof opt === "object") return Math.min(opt.gcTime || 300000, 86400000);
    return 300000;
  }

  // ----- images: downsize to ~1.2 megapixels, send as JPEG (or PNG for transparency) -----
  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }
  async function prepImage(blob) {
    if (!(blob instanceof Blob)) throw err("invalid_request", "images must be Blobs or Files.");
    if (!IMAGE_TYPES.includes(blob.type) || blob.size > MAX_INPUT_BYTES) throw err("image_rejected", "Use a JPEG, PNG, WebP or GIF under 20 MB.");
    var bmp;
    try { bmp = await createImageBitmap(blob); } catch (e) { throw err("image_rejected", "That image could not be opened."); }
    var scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bmp.width * bmp.height)));
    var w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    var g = canvas.getContext("2d");
    var type = blob.type === "image/png" ? "image/png" : "image/jpeg";
    if (type === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    var out = await new Promise(function (res) { canvas.toBlob(res, type, 0.88); });
    return { media_type: type, data: await toBase64(out) };
  }

  async function call(input, options, asJson) {
    options = options || {};
    if (options === null || typeof options !== "object" || Array.isArray(options)) throw err("invalid_request", "options must be a plain object.");
    if (typeof input !== "string" && !Array.isArray(input)) throw err("invalid_request", "input must be a string or a list of turns.");
    if (typeof input === "string" && !input.trim()) throw err("invalid_request", "input is empty.");
    if (options.tools) throw err("tools_unavailable", "Page tools are not supported in the desktop app.");
    var signal = options.signal;
    if (signal && signal.aborted) throw err("cancelled", "Cancelled before it started.");
    if (!SERVER) throw err("sampling_disabled", "No server is set in config.js.");

    var list = options.images ? (options.images instanceof Blob ? [options.images] : Array.from(options.images)) : [];
    if (list.length > MAX_IMAGES) throw err("image_rejected", "At most " + MAX_IMAGES + " images.");

    var key = list.length ? null : JSON.stringify([input, options.modelTier || "", options.effort || "", !!asJson]);
    var win = cacheWindow(options.cache);
    if (key && win && !(options.cache && options.cache.refresh)) {
      var hit = cache.get(key);
      if (hit && Date.now() - hit.at < win) {
        await Promise.resolve();
        if (typeof options.onText === "function") try { options.onText({ text: hit.text, delta: hit.text }); } catch (e) { console.error(e); }
        return { text: hit.text, truncated: hit.truncated, modelTierApplied: options.modelTier || "default" };
      }
    }

    var images = [];
    for (var i = 0; i < list.length; i++) images.push(await prepImage(list[i]));
    if (signal && signal.aborted) throw err("cancelled", "Cancelled.");

    var res;
    try {
      res = await fetch(SERVER + "/v1/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Key": CFG.appKey || "" },
        body: JSON.stringify({ input: input, images: images, json: !!asJson, modelTier: options.modelTier, effort: options.effort }),
        signal: signal,
      });
    } catch (e) {
      if (signal && signal.aborted) throw err("cancelled", "Cancelled.");
      throw err("upstream_error", "Could not reach the Homework Lens server. Check your internet connection.");
    }
    if (!res.ok) {
      var info = {};
      try { info = await res.json(); } catch (e) {}
      throw err(info.code || (res.status === 429 ? "rate_limited" : "upstream_error"), info.message || ("Server error " + res.status));
    }

    var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", text = "", truncated = false, finished = false;
    try {
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split("\n");
        buf = lines.pop();
        for (var j = 0; j < lines.length; j++) {
          if (!lines[j].trim()) continue;
          var ev = JSON.parse(lines[j]);
          if (ev.t === "delta" && ev.text) {
            text += ev.text;
            if (typeof options.onText === "function" && text.trim()) {
              try { options.onText({ text: text, delta: ev.text }); } catch (e) { console.error(e); }
            }
          } else if (ev.t === "done") {
            truncated = !!ev.truncated; finished = true;
          } else if (ev.t === "error") {
            throw err(ev.code || "upstream_error", ev.message, ev.code === "refused" ? undefined : text || undefined);
          }
        }
      }
    } catch (e) {
      if (signal && signal.aborted) throw err("cancelled", "Cancelled.", text || undefined);
      if (e && e.code) throw e;
      throw err("upstream_error", "The connection dropped.", text || undefined);
    }
    if (!finished) throw err("upstream_error", "The answer was cut off.", text || undefined);
    if (!text.trim()) throw err("empty_completion", "Claude produced no text.");
    if (key && win) cache.set(key, { text: text, truncated: truncated, at: Date.now() });
    return { text: text, truncated: truncated, modelTierApplied: options.modelTier || "default" };
  }

  function parseJson(raw) {
    try { return JSON.parse(raw); } catch (e) {}
    var fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) try { return JSON.parse(fence[1]); } catch (e) {}
    var a = raw.search(/[\[{]/), b = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
    if (a >= 0 && b > a) try { return JSON.parse(raw.slice(a, b + 1)); } catch (e) {}
    return undefined;
  }

  function sample(input, options) { return call(input, options, false); }
  sample.json = async function (input, options) {
    var r = await call(input, options, true);
    var v = r.truncated ? undefined : parseJson(r.text);
    if (v === undefined) {
      throw err("invalid_json", r.truncated ? "The answer was cut short." : "The reply held no JSON.", r.text);
    }
    return v;
  };
  sample.limits = async function () {
    return {
      maxPromptBytes: 262144,
      images: { maxCount: MAX_IMAGES, maxInputBytes: MAX_INPUT_BYTES, mediaTypes: IMAGE_TYPES.slice() },
      modelTiers: ["default", "complex", "quick"],
    };
  };
  Object.freeze(sample);

  window.claude = Object.freeze({
    use: async function (name) { return name === "sample" ? sample : null; },
  });
})();
