// Desktop-app additions to the Homework Lens page:
//  - first-launch age question (with a parent screen for under-13s)
//  - "Rate Homework Lens" in Settings (13+ only), sent to the Homework Lens server
//  - "Don't include your name or face" reminder on photo areas
//  - "Delete my data" in Settings
(function () {
  "use strict";
  var CFG = window.HL_CONFIG || {};
  var SERVER = String(CFG.server || "").replace(/\/+$/, "");
  var AGE_KEY = "hl_age";            // "13plus" | "under13"
  var REVIEWED_KEY = "hl_reviewed";

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var T = {
    en: {
      welcome: "Welcome to Homework Lens",
      howOld: "How old are you?",
      over: "13 or older", under: "Under 13",
      parentTitle: "Please ask a parent or guardian to read this",
      parentBody: [
        "Homework Lens helps with schoolwork. To answer, it sends the student's questions and homework photos to Claude, an AI made by Anthropic, through the Homework Lens server.",
        "There are no accounts. Nothing is saved on our server. Lessons, quizzes and settings stay on this computer, and you can delete them any time in Settings.",
        "Photos should show only the homework, not the student's name or face.",
        "AI answers can be wrong. Use Homework Lens to learn, and follow the school's rules about homework help.",
      ],
      parentAgree: "I'm the parent or guardian, and I agree to my child using Homework Lens.",
      cont: "Continue", back: "Back",
      photoTip: "Only photograph the homework. Don't include your name or face.",
      rateTitle: "Rate Homework Lens",
      rateHint: "Tell us what you think. We may show some reviews on our website with your first name.",
      rateStars: "Your rating", rateText: "Your review", rateTextPh: "What helped you? What could be better?",
      rateName: "First name (optional)", rateNamePh: "e.g. Maya",
      rateNote: "Don't write your last name, school or anything private.",
      rateSend: "Send review", rateSending: "Sending...", rateThanks: "Thanks for your review!",
      rateUnder: "Reviews are for users 13 and older.",
      rateNeedStars: "Pick 1 to 5 stars.", rateNeedText: "Write a few words first.",
      rateFail: "Couldn't send it. Check your internet and try again.",
      ageLine: function (a) { return "Age setting: " + (a === "13plus" ? "13 or older" : "under 13 (parent approved)"); },
      ageChange: "Change",
      delTitle: "Your data",
      delHint: "Lessons, quizzes, photos and settings are saved only on this computer.",
      delBtn: "Delete my data", delSure: "Yes, delete everything", delCancel: "Cancel",
      delWarn: "This deletes everything Homework Lens saved on this computer. It can't be undone.",
    },
    he: {
      welcome: "ברוכים הבאים ל-Homework Lens",
      howOld: "בן/בת כמה את/ה?",
      over: "13 ומעלה", under: "מתחת ל-13",
      parentTitle: "בקשו מהורה או אפוטרופוס לקרוא את זה",
      parentBody: [
        "Homework Lens עוזר בשיעורי הבית. כדי לענות, האפליקציה שולחת את השאלות ואת תמונות שיעורי הבית ל-Claude, בינה מלאכותית של Anthropic, דרך השרת של Homework Lens.",
        "אין חשבונות. שום דבר לא נשמר בשרת שלנו. שיעורים, מבחנים והגדרות נשמרים רק במחשב הזה, ואפשר למחוק אותם בכל רגע בהגדרות.",
        "בתמונות צריכים להופיע רק שיעורי הבית, בלי השם או הפנים של התלמיד/ה.",
        "תשובות של בינה מלאכותית יכולות להיות שגויות. השתמשו ב-Homework Lens כדי ללמוד, ופעלו לפי כללי בית הספר.",
      ],
      parentAgree: "אני ההורה או האפוטרופוס, ואני מסכים/ה שהילד/ה ישתמש/תשתמש ב-Homework Lens.",
      cont: "המשך", back: "חזרה",
      photoTip: "צלמו רק את שיעורי הבית. בלי השם או הפנים שלכם.",
      rateTitle: "דרגו את Homework Lens",
      rateHint: "ספרו לנו מה דעתכם. ייתכן שנציג חלק מהביקורות באתר שלנו עם השם הפרטי שלכם.",
      rateStars: "הדירוג שלך", rateText: "הביקורת שלך", rateTextPh: "מה עזר לך? מה אפשר לשפר?",
      rateName: "שם פרטי (לא חובה)", rateNamePh: "למשל: מאיה",
      rateNote: "אל תכתבו שם משפחה, בית ספר או משהו פרטי.",
      rateSend: "שליחת ביקורת", rateSending: "שולח...", rateThanks: "תודה על הביקורת!",
      rateUnder: "ביקורות מיועדות למשתמשים בני 13 ומעלה.",
      rateNeedStars: "בחרו 1 עד 5 כוכבים.", rateNeedText: "כתבו קודם כמה מילים.",
      rateFail: "השליחה נכשלה. בדקו את החיבור לאינטרנט ונסו שוב.",
      ageLine: function (a) { return "הגדרת גיל: " + (a === "13plus" ? "13 ומעלה" : "מתחת ל-13 (באישור הורה)"); },
      ageChange: "שינוי",
      delTitle: "הנתונים שלך",
      delHint: "שיעורים, מבחנים, תמונות והגדרות נשמרים רק במחשב הזה.",
      delBtn: "מחיקת הנתונים שלי", delSure: "כן, למחוק הכול", delCancel: "ביטול",
      delWarn: "פעולה זו מוחקת את כל מה ש-Homework Lens שמר במחשב הזה. אי אפשר לבטל אותה.",
    },
  };
  function t() {
    var l = (document.documentElement.lang || "").toLowerCase();
    return l.indexOf("he") === 0 ? T.he : T.en;
  }

  // ---------- styles (use the app's own color tokens, so light and dark both work) ----------
  var css = "" +
    ".hlx-gate{position:fixed;inset:0;z-index:100;background:var(--paper);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px;display:grid;place-items:center;padding:24px;overflow:auto}" +
    ".hlx-card{background:var(--sheet);border:1px solid var(--line);border-radius:16px;padding:28px;max-width:560px;width:100%;display:flex;flex-direction:column;gap:16px;box-shadow:0 2px 0 var(--line)}" +
    ".hlx-card h1{font:800 32px/1.1 var(--display);margin:0}.hlx-card h1 mark{background:linear-gradient(transparent 55%,var(--highlight) 55%);color:inherit}" +
    ".hlx-card h2{font:600 22px/1.25 var(--display);margin:0}" +
    ".hlx-card p{margin:0;color:var(--ink-soft)}" +
    ".hlx-row{display:flex;gap:10px;flex-wrap:wrap}" +
    ".hlx-check{display:flex;gap:10px;align-items:flex-start;font-weight:700;cursor:pointer}.hlx-check input{width:20px;height:20px;margin-top:2px;accent-color:var(--pen);flex:none}" +
    ".hlx-tip{margin:6px 0 0;font-size:13px;color:var(--ink-soft)}" +
    ".hlx-stars{display:flex;gap:4px;border:0;padding:0;margin:0}.hlx-stars legend{padding:0}" +
    ".hlx-stars label{cursor:pointer;font-size:30px;line-height:1;color:var(--line);padding:2px}.hlx-stars input{position:absolute;opacity:0;pointer-events:none}" +
    ".hlx-stars label.lit{color:var(--pen)}.hlx-stars input:focus-visible+span{outline:3px solid var(--pen);outline-offset:2px;border-radius:4px}" +
    ".hlx-field{display:flex;flex-direction:column;gap:6px}.hlx-field input{font:inherit;font-size:16px;color:var(--ink);background:var(--sheet);border:1px solid var(--line);border-radius:8px;padding:9px 11px}" +
    ".hlx-ok{color:var(--good);font-weight:700;margin:0}.hlx-err{color:var(--warn);margin:0}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "on") for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  // ---------- 1. age question at first launch ----------
  function showGate() {
    var s = t();
    var gate = el("div", { class: "hlx-gate", role: "dialog", "aria-modal": "true", "aria-labelledby": "hlxTitle" });
    function askAge() {
      gate.innerHTML = "";
      var title = el("h1", { id: "hlxTitle" }); title.innerHTML = "Homework <mark>Lens</mark>";
      gate.appendChild(el("div", { class: "hlx-card" }, [
        title,
        el("h2", { text: s.howOld }),
        el("div", { class: "hlx-row" }, [
          el("button", { class: "go", type: "button", text: s.over, on: { click: function () { store(AGE_KEY, "13plus"); done(); } } }),
          el("button", { class: "ghost", type: "button", text: s.under, on: { click: askParent } }),
        ]),
      ]));
      gate.querySelector("button").focus();
    }
    function askParent() {
      gate.innerHTML = "";
      var box = el("input", { type: "checkbox", id: "hlxAgree" });
      var go = el("button", { class: "go", type: "button", text: s.cont, disabled: "disabled", on: { click: function () { store(AGE_KEY, "under13"); done(); } } });
      box.addEventListener("change", function () { go.disabled = !box.checked; });
      gate.appendChild(el("div", { class: "hlx-card" }, [
        el("h2", { id: "hlxTitle", text: s.parentTitle }),
      ].concat(s.parentBody.map(function (p) { return el("p", { text: p }); })).concat([
        el("label", { class: "hlx-check", for: "hlxAgree" }, [box, el("span", { text: s.parentAgree })]),
        el("div", { class: "hlx-row" }, [go, el("button", { class: "ghost", type: "button", text: s.back, on: { click: askAge } })]),
      ])));
      box.focus();
    }
    function done() { gate.remove(); buildSettings(); }
    document.body.appendChild(gate);
    askAge();
  }

  // ---------- 2. photo reminder ----------
  function addPhotoTips() {
    var s = t();
    document.querySelectorAll(".drop, .photos").forEach(function (area) {
      var next = area.nextElementSibling;
      if (next && next.classList.contains("hlx-tip")) { next.textContent = s.photoTip; return; }
      area.insertAdjacentElement("afterend", el("p", { class: "hlx-tip", text: s.photoTip }));
    });
  }

  // ---------- 3. settings: age, rate, delete ----------
  function buildSettings() {
    var panel = document.getElementById("panel-settings");
    if (!panel) return;
    var old = document.getElementById("hlxSettings");
    if (old) old.remove();
    var s = t(), age = store(AGE_KEY);
    var wrap = el("div", { id: "hlxSettings", style: "display:flex;flex-direction:column;gap:24px" });

    // Rate Homework Lens
    var rate = el("section", { class: "desk", "aria-labelledby": "hlxRateT" }, [el("h2", { class: "panel-title", id: "hlxRateT", text: s.rateTitle })]);
    if (age !== "13plus") {
      rate.appendChild(el("p", { class: "hint", text: s.rateUnder }));
    } else if (store(REVIEWED_KEY)) {
      rate.appendChild(el("p", { class: "hlx-ok", text: s.rateThanks }));
    } else {
      var stars = 0;
      var fs = el("fieldset", { class: "hlx-stars" }, [el("legend", { class: "label", text: s.rateStars })]);
      var labels = [];
      for (var i = 1; i <= 5; i++) (function (n) {
        var inp = el("input", { type: "radio", name: "hlxStars", value: String(n), "aria-label": n + " / 5" });
        var lab = el("label", {}, [inp, el("span", { "aria-hidden": "true", text: "★" })]);
        inp.addEventListener("change", function () { stars = n; labels.forEach(function (l, j) { l.classList.toggle("lit", j < n); }); });
        labels.push(lab); fs.appendChild(lab);
      })(i);
      var txt = el("textarea", { id: "hlxText", rows: "3", maxlength: "500", placeholder: s.rateTextPh });
      var nm = el("input", { id: "hlxName", type: "text", maxlength: "24", autocomplete: "off", placeholder: s.rateNamePh });
      var msg = el("p", { class: "hlx-err", "aria-live": "polite" });
      var send = el("button", { class: "go", type: "button", text: s.rateSend });
      send.addEventListener("click", async function () {
        msg.className = "hlx-err"; msg.textContent = "";
        if (!stars) { msg.textContent = s.rateNeedStars; return; }
        if (txt.value.trim().length < 3) { msg.textContent = s.rateNeedText; return; }
        send.disabled = true; send.textContent = s.rateSending;
        try {
          var res = await fetch(SERVER + "/v1/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-App-Key": CFG.appKey || "" },
            body: JSON.stringify({ stars: stars, text: txt.value, name: nm.value, age13: true }),
          });
          var data = {}; try { data = await res.json(); } catch (e) {}
          if (res.ok || data.code === "rate_limited") { store(REVIEWED_KEY, "1"); buildSettings(); return; }
          msg.textContent = data.message || s.rateFail;
        } catch (e) { msg.textContent = s.rateFail; }
        send.disabled = false; send.textContent = s.rateSend;
      });
      rate.appendChild(el("p", { class: "hint", text: s.rateHint }));
      rate.appendChild(fs);
      rate.appendChild(el("div", { class: "hlx-field" }, [el("label", { class: "label", for: "hlxText", text: s.rateText }), txt]));
      rate.appendChild(el("div", { class: "hlx-field" }, [el("label", { class: "label", for: "hlxName", text: s.rateName }), nm, el("p", { class: "hint", text: s.rateNote })]));
      rate.appendChild(el("div", { class: "actions" }, [send]));
      rate.appendChild(msg);
    }
    wrap.appendChild(rate);

    // Your data: age setting + delete
    var data = el("section", { class: "desk", "aria-labelledby": "hlxDataT" }, [el("h2", { class: "panel-title", id: "hlxDataT", text: s.delTitle })]);
    if (age) {
      data.appendChild(el("div", { class: "actions" }, [
        el("span", { class: "hint", text: s.ageLine(age) }),
        el("button", { class: "ghost small", type: "button", text: s.ageChange, on: { click: function () { try { localStorage.removeItem(AGE_KEY); } catch (e) {} showGate(); } } }),
      ]));
    }
    data.appendChild(el("p", { class: "hint", text: s.delHint }));
    var row = el("div", { class: "actions" });
    var del = el("button", { class: "ghost", type: "button", text: s.delBtn });
    del.addEventListener("click", function () {
      row.innerHTML = "";
      row.appendChild(el("p", { class: "hlx-err", text: s.delWarn }));
      row.appendChild(el("button", { class: "go", type: "button", text: s.delSure, on: { click: function () {
        try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
        try { if (window.indexedDB && indexedDB.databases) indexedDB.databases().then(function (dbs) { dbs.forEach(function (d) { indexedDB.deleteDatabase(d.name); }); }); } catch (e) {}
        try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
        setTimeout(function () { location.reload(); }, 150);
      } } }));
      row.appendChild(el("button", { class: "ghost", type: "button", text: s.delCancel, on: { click: function () { row.innerHTML = ""; row.appendChild(del); } } }));
    });
    row.appendChild(del);
    data.appendChild(row);
    wrap.appendChild(data);

    panel.appendChild(wrap);
  }

  function refresh() { addPhotoTips(); buildSettings(); }

  function start() {
    refresh();
    if (!store(AGE_KEY)) showGate();
    // Re-label when the app switches language
    new MutationObserver(function () { refresh(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
