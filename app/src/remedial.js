// "Teach me what I got wrong": from a quiz's results, build a Teach me lesson aimed at
// exactly the questions the student missed, then offer an exam on what they learned.
// Uses the app's own functions and state (quiz, learn, els, startLesson, buildQuiz, ...).
(function () {
  "use strict";
  if (typeof quiz === "undefined" || typeof learn === "undefined" || typeof startLesson !== "function") return;

  var T = {
    en: {
      learnMissed: "Teach me what I got wrong",
      retake: "Take an exam on what I learned",
      lessonTopic: function (n) { return "Fixing what I got wrong on my quiz (" + n + (n === 1 ? " question)" : " questions)"); },
    },
    he: {
      learnMissed: "תלמד אותי את מה שטעיתי בו",
      retake: "מבחן על מה שלמדתי",
      lessonTopic: function (n) { return "לתקן את מה שטעיתי בו בבוחן (" + (n === 1 ? "שאלה אחת" : n + " שאלות") + ")"; },
    },
  };
  function s() { var l = (document.documentElement.lang || "en").slice(0, 2); return T[l] || T.en; }

  var pending = null;   // remedial context waiting for the next lesson prompt
  var active = null;    // the remedial lesson now in Teach me: { diff, focus }
  var starting = false;

  // ----- what the student got wrong -----
  function missedItems() {
    var L = "ABCD", out = [];
    quiz.questions.forEach(function (x, i) {
      var picked = quiz.answers[i];
      if (picked === x.answer) return;
      var lines = [
        (out.length + 1) + ". " + x.q + (x.photo ? " (This problem was in the student's photo.)" : ""),
        "Options: " + x.options.map(function (o, j) { return L[j] + ") " + o; }).join("   "),
        "Right answer: " + L[x.answer] + ") " + x.options[x.answer],
        picked === null || picked === undefined ? "The student left it blank." : "The student answered: " + L[picked] + ") " + x.options[picked],
      ];
      if (x.why) lines.push("Why the right answer is right: " + x.why);
      var extra = quiz.extra && quiz.extra[i];
      if (extra && extra.explain) lines.push("Explanation of the mistake the student already saw:\n" + String(extra.explain).slice(0, 1500));
      out.push(lines.join("\n"));
    });
    return out;
  }

  function sourceMaterial() {
    if (quiz.lesson) return String(quiz.lesson).slice(0, 6000);
    var m = els.material && els.material.value.trim();
    return m ? m.slice(0, 6000) : "";
  }

  // ----- the lesson prompt: the app's own format, with the quiz results in front -----
  var origLessonPrompt = lessonPrompt;
  window.lessonPrompt = function (usePhoto) {
    var base = origLessonPrompt(usePhoto);
    if (!pending) return base;
    var ctx = pending; pending = null;
    var right = ctx.total - ctx.missed.length;
    return "This lesson is a follow-up to a quiz the student just took. They got " + right + " of " + ctx.total +
      " right (difficulty: " + ctx.diff + "). Teach them exactly what they got wrong, so they can retake the exam and do better.\n\n" +
      "The questions they got wrong:\n\"\"\"\n" + ctx.missed.join("\n\n") + "\n\"\"\"\n\n" +
      (ctx.source ? "What the exam was about:\n\"\"\"\n" + ctx.source + "\n\"\"\"\n\n" : "") +
      "How to build this lesson:\n" +
      "- First work out which ideas the wrong answers have in common, and group them. Teach one idea per step, starting with the most basic misunderstanding.\n" +
      "- In each step, name the mistake gently (for example: \"A common slip is to add instead of subtract here\"), explain the right idea simply, and show one fully worked example that is similar to a missed question but uses different numbers or examples.\n" +
      "- Make every step's quick check a practice question like the ones they missed, at about the same difficulty, never a copy of a quiz question.\n" +
      "- End with a step that mixes the ideas together, like a mini test.\n" +
      "- The summary should list what to remember for the retake.\n\n" + base;
  };

  // A lesson the student starts themselves is a normal lesson again.
  var origStartLesson = startLesson;
  window.startLesson = function () {
    if (!starting) active = null;
    return origStartLesson.apply(this, arguments);
  };

  function teachMissed() {
    if (!sample || learn.busy || quiz.state !== "done") return;
    var missed = missedItems();
    if (!missed.length) return;
    pending = { missed: missed, total: quiz.questions.length, diff: quiz.diff || "medium", source: sourceMaterial() };
    active = {
      diff: quiz.diff || "medium",
      focus: quiz.questions.filter(function (x, i) { return quiz.answers[i] !== x.answer; })
        .map(function (x) { return x.q + " (right answer: " + x.options[x.answer] + ")"; }),
    };
    showTab("learn");
    window.scrollTo({ top: 0 });
    els.learnTopic.value = s().lessonTopic(missed.length);
    starting = true;
    try { startLesson(); } finally { starting = false; }
  }

  function examOnLesson() {
    if (!active) return;
    var focus = active.focus.length
      ? "\n\nThe student had got these questions wrong before this lesson. Test the same ideas again with new questions:\n- " + active.focus.join("\n- ")
      : "";
    showTab("exam");
    window.scrollTo({ top: 0 });
    buildQuiz({ diff: active.diff, lesson: lessonForQuiz() + focus });
  }

  // ----- buttons -----
  var missBtn = document.createElement("button");
  missBtn.type = "button"; missBtn.id = "learnMissedGo";
  missBtn.addEventListener("click", teachMissed);
  var resultActions = els.resultSheet && els.resultSheet.querySelector(".actions");
  if (resultActions) resultActions.insertBefore(missBtn, resultActions.firstChild);

  var retakeBtn = document.createElement("button");
  retakeBtn.type = "button"; retakeBtn.className = "alt"; retakeBtn.id = "learnRetakeGo";
  retakeBtn.addEventListener("click", examOnLesson);
  var endActions = els.lessonEnd && els.lessonEnd.querySelector(".actions");
  if (endActions) endActions.insertBefore(retakeBtn, endActions.firstChild);

  function update() {
    var lbl = s();
    // Results: shown when anything was missed; highlighted under 70%
    var n = quiz.questions.length;
    var right = quiz.questions.filter(function (x, i) { return quiz.answers[i] === x.answer; }).length;
    var anyMissed = quiz.state === "done" && n > 0 && right < n;
    missBtn.hidden = !anyMissed;
    missBtn.className = right / (n || 1) < 0.7 ? "alt" : "ghost";
    missBtn.textContent = lbl.learnMissed;
    missBtn.disabled = !sample || learn.busy;
    // End of lesson: only after a "what I got wrong" lesson
    retakeBtn.textContent = lbl.retake;
    retakeBtn.hidden = !active || els.lessonEnd.hidden;
    retakeBtn.disabled = !sample || (typeof exam !== "undefined" && exam.busy) || quiz.state === "loading" || quiz.state === "active";
    // The usual "quiz on this lesson" button would be a duplicate here
    if (els.learnQuiz) els.learnQuiz.hidden = !retakeBtn.hidden;
  }

  var mo = new MutationObserver(update);
  if (els.review) mo.observe(els.review, { childList: true });
  ["resultSheet", "lessonEnd", "learnGo"].forEach(function (k) {
    if (els[k]) mo.observe(els[k], { attributes: true, attributeFilter: ["hidden", "disabled"] });
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  update();
})();
