// Handwriting: a "Draw" button on every text box. The student writes with the mouse,
// pen or finger; Claude reads it and asks "Did you mean ...?" with up to 3 options;
// the chosen one is typed into the box. Useful without an Arabic/Hebrew/Chinese/...
// keyboard, and for handwritten math.
(function () {
  "use strict";

  var LANG_NAMES = { en: "English", he: "Hebrew", es: "Spanish", pt: "Portuguese", ar: "Arabic", zh: "Chinese", ja: "Japanese", el: "Greek", ru: "Russian" };
  var T = {
    en: {
      draw: "Draw", drawAria: "Write this by hand",
      title: "Write it by hand", hint: "Write with your mouse, pen or finger. Then click Read my writing.",
      undo: "Undo", clear: "Clear", cancel: "Cancel", read: "Read my writing",
      reading: "Reading your writing...", mean: "Did you mean:", none: "None of these, draw again",
      empty: "Write something first.", blank: "I couldn't read that. Try writing a bit bigger.",
      fail: "Couldn't read it right now. Check your internet and try again.",
      padAria: "Drawing pad. Hold the mouse button down to write.",
    },
    he: {
      draw: "כתיבה ביד", drawAria: "לכתוב את זה ביד",
      title: "כתבו ביד", hint: "כתבו עם העכבר, עט או אצבע. אחר כך לחצו על 'קרא את מה שכתבתי'.",
      undo: "בטל", clear: "נקה", cancel: "ביטול", read: "קרא את מה שכתבתי",
      reading: "קורא את הכתב שלך...", mean: "התכוונת ל:", none: "אף אחד מאלה, לכתוב שוב",
      empty: "כתבו משהו קודם.", blank: "לא הצלחתי לקרוא. נסו לכתוב קצת יותר גדול.",
      fail: "לא הצלחתי לקרוא כרגע. בדקו את החיבור לאינטרנט ונסו שוב.",
      padAria: "משטח ציור. החזיקו את כפתור העכבר כדי לכתוב.",
    },
  };
  function lang() { return (document.documentElement.lang || "en").toLowerCase().slice(0, 2); }
  function t() { return T[lang()] || T.en; }

  var css = "" +
    ".hw-btn{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:7px 12px;font-size:14px;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:8px;cursor:pointer}" +
    ".hw-btn:hover{border-color:var(--pen);background:var(--pen-wash)}" +
    ".hw-btn svg{width:16px;height:16px;flex:none}" +
    ".hw-back{position:fixed;inset:0;z-index:90;background:rgba(10,15,25,.5);display:grid;place-items:center;padding:16px}" +
    ".hw-dlg{background:var(--sheet);color:var(--ink);border:1px solid var(--line);border-radius:16px;padding:20px;width:min(760px,100%);display:flex;flex-direction:column;gap:12px;max-height:calc(100vh - 32px);overflow:auto}" +
    ".hw-dlg h2{font:600 22px/1.2 var(--display);margin:0}" +
    ".hw-dlg p{margin:0}" +
    ".hw-pad{position:relative;border:2px solid var(--line);border-radius:12px;background:#fff;touch-action:none;cursor:crosshair;overflow:hidden}" +
    ".hw-pad:focus-visible{outline:3px solid var(--pen);outline-offset:2px}" +
    ".hw-pad canvas{display:block;width:100%;height:260px}" +
    ".hw-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
    ".hw-spacer{flex:1}" +
    ".hw-opts{display:flex;flex-direction:column;gap:8px}" +
    ".hw-opt{display:block;width:100%;text-align:start;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--sheet);color:var(--ink);font:700 20px/1.35 var(--body);cursor:pointer;overflow-wrap:anywhere}" +
    ".hw-opt:hover,.hw-opt:focus-visible{border-color:var(--pen);background:var(--pen-wash)}" +
    ".hw-msg{color:var(--ink-soft)}.hw-err{color:var(--warn)}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var PEN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/></svg>';

  // ---------- one "Draw" button under each text box ----------
  function addButton(ta) {
    if (ta.dataset.hw || ta.closest(".hw-dlg") || ta.closest("[data-no-hw]")) return;
    ta.dataset.hw = "1";
    var b = document.createElement("button");
    b.type = "button"; b.className = "hw-btn";
    b.innerHTML = PEN_ICON + "<span></span>";
    function label() { b.querySelector("span").textContent = t().draw; b.setAttribute("aria-label", t().drawAria); }
    label(); b._label = label;
    b.addEventListener("click", function () { openPad(ta, b); });
    // In a row with a send button (follow-up forms), put it after the row's text box
    ta.insertAdjacentElement("afterend", b);
  }
  function scan() { document.querySelectorAll("textarea").forEach(addButton); }
  function relabel() { document.querySelectorAll(".hw-btn").forEach(function (b) { b._label && b._label(); }); }

  // ---------- the drawing pad ----------
  function openPad(target, opener) {
    var s = t();
    var strokes = [], current = null, busy = false, ctl = null;

    var back = document.createElement("div"); back.className = "hw-back";
    var dlg = document.createElement("div"); dlg.className = "hw-dlg";
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "hwTitle");
    dlg.innerHTML =
      '<h2 id="hwTitle"></h2><p class="hw-msg" id="hwHint"></p>' +
      '<div class="hw-pad" tabindex="0" role="img"><canvas></canvas></div>' +
      '<div class="hw-row"><button type="button" class="ghost small" data-a="undo"></button><button type="button" class="ghost small" data-a="clear"></button><span class="hw-spacer"></span><button type="button" class="ghost" data-a="cancel"></button><button type="button" class="go" data-a="read"></button></div>' +
      '<div id="hwOut" aria-live="polite"></div>';
    back.appendChild(dlg); document.body.appendChild(back);
    dlg.querySelector("#hwTitle").textContent = s.title;
    dlg.querySelector("#hwHint").textContent = s.hint;
    var pad = dlg.querySelector(".hw-pad"); pad.setAttribute("aria-label", s.padAria);
    var btn = function (a) { return dlg.querySelector('[data-a="' + a + '"]'); };
    btn("undo").textContent = s.undo; btn("clear").textContent = s.clear;
    btn("cancel").textContent = s.cancel; btn("read").textContent = s.read;
    var out = dlg.querySelector("#hwOut");

    var canvas = pad.querySelector("canvas"), g = canvas.getContext("2d");
    function size() {
      var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); redraw();
    }
    function guide(ctx, w, h) {
      ctx.strokeStyle = "#CBD5E1"; ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(16, h * 0.72); ctx.lineTo(w - 16, h * 0.72); ctx.stroke(); ctx.setLineDash([]);
    }
    function paint(ctx, list, scale, color, withGuide, w, h) {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      if (withGuide) guide(ctx, w, h);
      ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round";
      list.forEach(function (st) {
        ctx.lineWidth = 4 * scale;
        var p = st;
        if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x * scale, p[0].y * scale, 2 * scale, 0, 7); ctx.fillStyle = color; ctx.fill(); return; }
        ctx.beginPath(); ctx.moveTo(p[0].x * scale, p[0].y * scale);
        for (var i = 1; i < p.length - 1; i++) {
          var mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
          ctx.quadraticCurveTo(p[i].x * scale, p[i].y * scale, mx * scale, my * scale);
        }
        ctx.lineTo(p[p.length - 1].x * scale, p[p.length - 1].y * scale); ctx.stroke();
      });
    }
    function redraw() {
      var r = canvas.getBoundingClientRect();
      paint(g, current ? strokes.concat([current]) : strokes, 1, "#0F172A", true, r.width, r.height);
    }
    function pt(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    canvas.addEventListener("pointerdown", function (e) {
      if (busy) return; e.preventDefault(); canvas.setPointerCapture(e.pointerId);
      current = [pt(e)]; redraw();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!current) return;
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      evs.forEach(function (ev) { current.push(pt(ev)); });
      redraw();
    });
    function end() { if (current) { strokes.push(current); current = null; redraw(); out.innerHTML = ""; } }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    btn("undo").onclick = function () { strokes.pop(); redraw(); };
    btn("clear").onclick = function () { strokes = []; redraw(); out.innerHTML = ""; };
    function close() {
      if (ctl) ctl.abort();
      window.removeEventListener("resize", size); document.removeEventListener("keydown", onKey, true);
      back.remove(); opener && opener.focus();
    }
    btn("cancel").onclick = close;
    back.addEventListener("pointerdown", function (e) { if (e.target === back) close(); });
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); strokes.pop(); redraw(); }
    }
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", size);

    // Export just the writing: cropped, black on white, padded — easiest for Claude to read.
    function snapshot() {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      strokes.forEach(function (st) { st.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }); });
      var pad = 24, w = Math.max(60, maxX - minX) + pad * 2, h = Math.max(60, maxY - minY) + pad * 2;
      var scale = Math.min(2, 1200 / w);
      var c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      var shifted = strokes.map(function (st) { return st.map(function (p) { return { x: p.x - minX + pad, y: p.y - minY + pad }; }); });
      paint(c.getContext("2d"), shifted, scale, "#000", false, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, "image/png"); });
    }

    function prompt() {
      return "This image is a student's handwriting from the drawing pad in Homework Lens, a study app. " +
        "It shows dark pen strokes on a white background.\n\n" +
        "First decide from the shapes of the letters which script it is written in: for example Arabic, Hebrew, Latin (English, Spanish...), Cyrillic, Greek, Chinese, Japanese, digits or math. " +
        "Do not assume any language; students use this app in many languages and often write in a different one from the app's. " +
        "Arabic is written right to left in connected letters with dots; Hebrew right to left in separate square letters; look closely before deciding.\n\n" +
        "Give the 3 most likely readings of exactly what is written, most likely first. If you are unsure which script it is, include readings in each likely script. " +
        "Keep the script the student used. Do not translate, correct, complete, answer or explain it. " +
        "For math, use plain text characters, such as x², √, ×, ÷, ≤ and 3/4. " +
        "If the readings are all the same, give just one. If the image is blank or you cannot read it, reply [].\n\n" +
        'Reply with only a JSON array of strings, for example ["first reading", "second reading", "third reading"].';
    }

    btn("read").onclick = async function () {
      if (busy) return;
      if (!strokes.length) { out.innerHTML = '<p class="hw-err"></p>'; out.firstChild.textContent = s.empty; return; }
      busy = true; btn("read").disabled = true;
      out.innerHTML = '<p class="hw-msg"></p>'; out.firstChild.textContent = s.reading;
      try {
        var sample = window.claude ? await window.claude.use("sample") : null;
        if (!sample) throw { code: "unavailable" };
        var img = await snapshot();
        ctl = new AbortController();
        var list = await sample.json(prompt(), { images: [img], modelTier: "quick", cache: false, signal: ctl.signal });
        var seen = {}, opts = (Array.isArray(list) ? list : [])
          .map(function (x) { return typeof x === "string" ? x.trim() : ""; })
          .filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; })
          .slice(0, 3);
        showOptions(opts);
      } catch (e) {
        if (e && e.code === "cancelled") return;
        out.innerHTML = '<p class="hw-err"></p>'; out.firstChild.textContent = (e && e.code === "invalid_json") ? s.blank : s.fail;
      } finally { busy = false; btn("read").disabled = false; ctl = null; }
    };

    function showOptions(opts) {
      out.innerHTML = "";
      if (!opts.length) { var p = document.createElement("p"); p.className = "hw-err"; p.textContent = s.blank; out.appendChild(p); return; }
      var h = document.createElement("p"); h.className = "label"; h.style.margin = "4px 0"; h.textContent = s.mean; out.appendChild(h);
      var box = document.createElement("div"); box.className = "hw-opts";
      opts.forEach(function (text) {
        var o = document.createElement("button"); o.type = "button"; o.className = "hw-opt"; o.textContent = text;
        o.dir = "auto";
        o.onclick = function () { insert(target, text); close(); };
        box.appendChild(o);
      });
      var again = document.createElement("button"); again.type = "button"; again.className = "ghost small"; again.textContent = s.none;
      again.style.alignSelf = "flex-start";
      again.onclick = function () { strokes = []; redraw(); out.innerHTML = ""; pad.focus(); };
      box.appendChild(again);
      out.appendChild(box);
      box.querySelector(".hw-opt").focus();
    }

    requestAnimationFrame(size);
    pad.focus();
  }

  // Put the text where the cursor was, then tell the app the box changed.
  function insert(ta, text) {
    var v = ta.value, a = ta.selectionStart != null ? ta.selectionStart : v.length, b = ta.selectionEnd != null ? ta.selectionEnd : v.length;
    var before = v.slice(0, a), after = v.slice(b);
    if (before && !/\s$/.test(before)) text = " " + text;
    if (after && !/^\s/.test(after)) text = text + " ";
    ta.value = before + text + after;
    var pos = (before + text).length;
    ta.focus(); try { ta.setSelectionRange(pos, pos); } catch (e) {}
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function start() {
    scan();
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].type === "attributes") { relabel(); return; }
        if (muts[i].addedNodes.length) { scan(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(relabel).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
