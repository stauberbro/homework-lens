// "My notes": a sidebar section for pasting and keeping what you studied.
// No AI, no server: notes are saved only on this device (localStorage).
(function () {
  "use strict";
  var KEY = "hl-notes";

  var T = {
    en: {
      nav: "My notes", title: "My notes",
      intro: "Paste or type what you studied. Notes save by themselves and stay on this device.",
      add: "+ New note", search: "Search notes", empty: "No notes yet. Click New note and paste what you studied.",
      noMatch: "No notes match your search.", untitled: "Untitled note",
      titlePh: "Title, e.g. Biology: the cell", bodyPh: "Paste or type your notes here...",
      back: "← All notes", del: "Delete note", delSure: "Yes, delete it", cancel: "Cancel",
      saved: "Saved", saving: "Saving...", chars: function (n) { return n.toLocaleString() + " characters"; },
      edited: "Edited",
      drawingAlt: function (i) { return "Drawing " + i; }, removeDrawing: function (i) { return "Remove drawing " + i; },
      drawings: function (n) { return n === 1 ? "1 drawing" : n + " drawings"; },
      tooFull: "This device is out of space for notes. Delete a drawing or an old note.",
    },
    he: {
      nav: "הסיכומים שלי", title: "הסיכומים שלי",
      intro: "הדביקו או כתבו את מה שלמדתם. הסיכומים נשמרים לבד ונשארים במכשיר הזה.",
      add: "+ סיכום חדש", search: "חיפוש בסיכומים", empty: "אין עדיין סיכומים. לחצו על סיכום חדש והדביקו את מה שלמדתם.",
      noMatch: "אין סיכומים שמתאימים לחיפוש.", untitled: "סיכום בלי שם",
      titlePh: "כותרת, למשל: ביולוגיה - התא", bodyPh: "הדביקו או כתבו כאן את הסיכום...",
      back: "→ כל הסיכומים", del: "מחיקת הסיכום", delSure: "כן, למחוק", cancel: "ביטול",
      saved: "נשמר", saving: "שומר...", chars: function (n) { return n.toLocaleString() + " תווים"; },
      edited: "נערך",
      drawingAlt: function (i) { return "ציור " + i; }, removeDrawing: function (i) { return "הסרת ציור " + i; },
      drawings: function (n) { return n === 1 ? "ציור אחד" : n + " ציורים"; },
      tooFull: "אין מספיק מקום במכשיר לסיכומים. מחקו ציור או סיכום ישן.",
    },
  };
  function lang() { return (document.documentElement.lang || "en").toLowerCase().slice(0, 2); }
  function t() { return T[lang()] || T.en; }

  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
  var notes = load();
  var openId = null, query = "", saveTimer = 0;

  var css = "" +
    ".nt-list{display:flex;flex-direction:column;gap:10px;list-style:none;margin:0;padding:0}" +
    ".nt-item{display:block;width:100%;text-align:start;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:var(--sheet);color:var(--ink);cursor:pointer;font:inherit}" +
    ".nt-item:hover,.nt-item:focus-visible{border-color:var(--pen);background:var(--pen-wash)}" +
    ".nt-item strong{display:block;font:600 18px/1.3 var(--display);overflow-wrap:anywhere}" +
    ".nt-item .nt-prev{display:block;color:var(--ink-soft);font-size:14px;margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}" +
    ".nt-item .nt-date{display:block;font:500 12px/1 var(--mono);color:var(--ink-soft);margin-top:8px}" +
    ".nt-search{font:inherit;font-size:16px;color:var(--ink);background:var(--sheet);border:1px solid var(--line);border-radius:8px;padding:9px 11px;flex:1 1 200px;min-width:0}" +
    ".nt-title{font:600 22px/1.3 var(--display);color:var(--ink);background:var(--sheet);border:1px solid var(--line);border-radius:8px;padding:9px 11px;width:100%}" +
    ".nt-body{min-height:340px;resize:vertical;line-height:1.6}" +
    ".nt-meta{display:flex;gap:12px;flex-wrap:wrap;justify-content:space-between;color:var(--ink-soft);font-size:13px}" +
    ".nt-draws{display:flex;flex-direction:column;gap:12px}.nt-draws:empty{display:none}" +
    ".nt-draw{position:relative;align-self:flex-start;max-width:100%;border:1px solid var(--line);border-radius:10px;background:#fff;padding:6px}" +
    ".nt-draw img{display:block;max-width:100%;max-height:320px;height:auto}" +
    ".nt-draw button{position:absolute;top:-10px;inset-inline-end:-10px;width:28px;height:28px;padding:0;border-radius:50%;background:var(--ink);color:var(--sheet);font-size:17px;display:grid;place-items:center}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var NOTE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h5"/></svg>';

  var nav, panel;

  function build() {
    var settings = document.getElementById("nav-settings");
    var wrap = document.querySelector(".app > .wrap");
    if (!settings || !wrap) return false;

    nav = document.createElement("button");
    nav.type = "button"; nav.className = "nav"; nav.id = "nav-notes";
    nav.innerHTML = NOTE_ICON + "<span></span>";
    settings.parentNode.insertBefore(nav, settings);
    nav.addEventListener("click", show);

    panel = document.createElement("div");
    panel.className = "panel"; panel.id = "panel-notes"; panel.hidden = true;
    wrap.appendChild(panel);

    // Any other menu item hides the notes
    document.querySelectorAll(".side .nav").forEach(function (b) {
      if (b !== nav) b.addEventListener("click", function () { panel.hidden = true; nav.removeAttribute("aria-current"); });
    });
    label();
    return true;
  }

  function label() { if (nav) nav.querySelector("span").textContent = t().nav; }

  function show() {
    document.querySelectorAll(".app > .wrap > .panel").forEach(function (p) { p.hidden = p !== panel; });
    document.querySelectorAll(".side .nav").forEach(function (b) { if (b === nav) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    var side = document.getElementById("side");
    if (side && side.classList.contains("open")) { var scrim = document.getElementById("scrim"); if (scrim) scrim.click(); }
    render();
    window.scrollTo({ top: 0 });
  }

  function find(id) { for (var i = 0; i < notes.length; i++) if (notes[i].id === id) return notes[i]; return null; }
  function when(ms) {
    try { return new Date(ms).toLocaleString(lang() === "he" ? "he-IL" : undefined, { dateStyle: "medium", timeStyle: "short" }); }
    catch (e) { return new Date(ms).toLocaleString(); }
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function render() {
    if (!panel || panel.hidden) return;
    panel.innerHTML = "";
    if (openId && find(openId)) renderEditor(); else { openId = null; renderList(); }
  }

  function renderList() {
    var s = t();
    var desk = el("section", "desk");
    desk.appendChild(el("h2", "panel-title", s.title));
    desk.appendChild(el("p", "hint", s.intro));
    var row = el("div", "actions");
    var add = el("button", "go", s.add); add.type = "button";
    add.addEventListener("click", function () {
      var n = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: "", text: "", updated: Date.now() };
      notes.unshift(n); save(notes); openId = n.id; render();
      var b = panel.querySelector(".nt-body"); if (b) b.focus();
    });
    var search = el("input", "nt-search"); search.type = "search"; search.placeholder = s.search; search.value = query;
    search.setAttribute("aria-label", s.search);
    row.appendChild(add); row.appendChild(search);
    desk.appendChild(row);

    var list = el("ul", "nt-list");
    function fill() {
      list.innerHTML = "";
      var q = query.trim().toLowerCase();
      var shown = notes.slice().sort(function (a, b) { return b.updated - a.updated; })
        .filter(function (n) { return !q || (n.title + "\n" + n.text).toLowerCase().indexOf(q) >= 0; });
      if (!shown.length) { list.appendChild(el("li", "hint", notes.length ? s.noMatch : s.empty)); return; }
      shown.forEach(function (n) {
        var li = el("li");
        var b = el("button", "nt-item"); b.type = "button";
        b.appendChild(el("strong", null, n.title.trim() || s.untitled));
        if (n.text.trim()) b.appendChild(el("span", "nt-prev", n.text.trim().slice(0, 300)));
        var dn = (n.drawings || []).length;
        b.appendChild(el("span", "nt-date", s.edited + " " + when(n.updated) + (dn ? " · " + s.drawings(dn) : "")));
        b.dir = "auto";
        b.addEventListener("click", function () { openId = n.id; render(); });
        li.appendChild(b); list.appendChild(li);
      });
    }
    search.addEventListener("input", function () { query = search.value; fill(); });
    fill();
    desk.appendChild(list);
    panel.appendChild(desk);
  }

  function renderEditor() {
    var s = t(), n = find(openId);
    var desk = el("section", "desk");
    var top = el("div", "actions");
    var back = el("button", "ghost small", s.back); back.type = "button";
    back.addEventListener("click", function () { flush(); dropIfEmpty(); openId = null; render(); });
    top.appendChild(back);
    desk.appendChild(top);

    var title = el("input", "nt-title"); title.type = "text"; title.value = n.title; title.placeholder = s.titlePh; title.dir = "auto";
    title.setAttribute("aria-label", s.titlePh); title.maxLength = 200;
    var body = el("textarea", "nt-body"); body.value = n.text; body.placeholder = s.bodyPh; body.dir = "auto";
    body.setAttribute("aria-label", s.bodyPh);
    var meta = el("div", "nt-meta");
    var status = el("span", null, s.saved); status.setAttribute("aria-live", "polite");
    var count = el("span", null, s.chars(n.text.length));
    meta.appendChild(status); meta.appendChild(count);

    function changed() {
      n.title = title.value; n.text = body.value; n.updated = Date.now();
      status.textContent = s.saving; count.textContent = s.chars(body.value.length);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { status.textContent = save(notes) ? s.saved : "!"; }, 400);
    }
    title.addEventListener("input", changed);
    body.addEventListener("input", changed);

    // Drawings kept from the drawing pad ("Keep my drawing"), saved inside the note
    var draws = el("div", "nt-draws");
    function paintDraws() {
      draws.innerHTML = "";
      (n.drawings || []).forEach(function (d, i) {
        var box = el("div", "nt-draw");
        var img = document.createElement("img"); img.src = d.src; img.alt = s.drawingAlt(i + 1);
        var x = el("button", null, "×"); x.type = "button"; x.setAttribute("aria-label", s.removeDrawing(i + 1));
        x.addEventListener("click", function () {
          n.drawings = n.drawings.filter(function (o) { return o.id !== d.id; });
          n.updated = Date.now(); save(notes); paintDraws();
        });
        box.appendChild(img); box.appendChild(x); draws.appendChild(box);
      });
    }
    body.hwKeep = function (file) {
      var r = new FileReader();
      r.onload = function () {
        n.drawings = (n.drawings || []).concat([{ id: Date.now().toString(36), src: String(r.result) }]);
        n.updated = Date.now();
        if (!save(notes)) { n.drawings.pop(); status.textContent = s.tooFull; return; }
        status.textContent = s.saved; paintDraws();
      };
      r.readAsDataURL(file);
    };
    paintDraws();

    var delRow = el("div", "actions");
    var del = el("button", "ghost small", s.del); del.type = "button";
    del.addEventListener("click", function () {
      delRow.innerHTML = "";
      var yes = el("button", "go small", s.delSure); yes.type = "button";
      yes.addEventListener("click", function () {
        notes = notes.filter(function (x) { return x.id !== n.id; }); save(notes); openId = null; render();
      });
      var no = el("button", "ghost small", s.cancel); no.type = "button";
      no.addEventListener("click", function () { delRow.innerHTML = ""; delRow.appendChild(del); });
      delRow.appendChild(yes); delRow.appendChild(no);
    });
    delRow.appendChild(del);

    desk.appendChild(title); desk.appendChild(body); desk.appendChild(draws); desk.appendChild(meta); desk.appendChild(delRow);
    panel.appendChild(desk);
  }

  function flush() { clearTimeout(saveTimer); save(notes); }
  function dropIfEmpty() {
    var n = find(openId);
    if (n && !n.title.trim() && !n.text.trim() && !(n.drawings || []).length) { notes = notes.filter(function (x) { return x !== n; }); save(notes); }
  }
  window.addEventListener("beforeunload", flush);

  function start() {
    if (!build()) return;
    new MutationObserver(function () { label(); render(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
