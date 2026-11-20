/* MEGA//INDEX UI. Classic script; depends on window.MegaIndex (core.js), window.MegaCharts, window.MM_DRAWS. */
(function () {
  "use strict";
  var M = window.MegaIndex, C = window.MegaCharts;
  var G = M.MEGA_MILLIONS;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var IS_HTTP = /^https?:$/.test(location.protocol);
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------ storage (guarded) */
  var store = {
    get: function (k, dflt) {
      try { var v = localStorage.getItem(k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } }
  };
  var K_PREF = "mega-index.prefs.v1", K_HIST = "mega-index.history.v1";

  /* ------------------------------------------------------------ data */
  var draws = null, st = null, dataError = null;
  try {
    draws = M.normalizeDraws(G, window.MM_DRAWS || []);
    st = M.computeStats(G, draws);
  } catch (e) { dataError = e.message; }
  var UPDATED = window.MM_DRAWS_UPDATED || "";

  /* ------------------------------------------------------------ helpers */
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function pad2(n) { return M.pad2(n); }
  function grp(n) { return M.group(n); }
  function vibrate(p) {
    try {
      var ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(p);
    } catch (e) { /* ignore */ }
  }
  function rnd2() { return pad2(M.randbelow(70) + 1); }

  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? okMsg || "COPIED" : "COPY FAILED");
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || "COPIED"); }, fallback);
    } else fallback();
    vibrate(8);
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast("SAVED " + name);
  }

  function exportPlays(plays, fmt) {
    if (!plays.length) { toast("NOTHING TO EXPORT"); return; }
    var stamp = M.utcStamp();
    var name = "mega-index-picks-" + M.fileStamp(stamp) + "." + fmt;
    if (fmt === "csv") download(name, M.exportCsv(G, plays, stamp), "text/csv");
    else download(name, M.exportJson(G, plays, stamp), "application/json");
  }

  function slipText(plays, withLabels) {
    var lines = plays.map(function (p) {
      return p.play + ": " + M.fmtTicket(G, p.whites, p.bonus) + "  index " + p.index + (withLabels && p.label ? "  (" + p.label + ")" : "");
    });
    return lines.concat(M.notes(G)).join("\n") + "\n";
  }

  var canShare = !!(navigator.share && IS_HTTP);
  function sharePlays(plays, withLabels) {
    if (!plays.length) { toast("NOTHING TO SHARE"); return; }
    var text = "MEGA//INDEX\n" + slipText(plays, withLabels);
    var stamp = M.utcStamp();
    var data = { title: "MEGA//INDEX picks", text: text };
    try {
      var file = new File([M.exportCsv(G, plays, stamp)], "mega-index-picks-" + M.fileStamp(stamp) + ".csv", { type: "text/csv" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
    } catch (e) { /* File ctor unsupported */ }
    navigator.share(data).catch(function (e) {
      if (e && e.name === "AbortError") return;
      // some targets reject files: retry text-only
      if (data.files) navigator.share({ title: data.title, text: text }).catch(function () {});
    });
  }

  /* ------------------------------------------------------------ balls + reveal animation */
  function ballEl(n, mb, size) {
    var b = h("span", "ball" + (mb ? " mb" : ""));
    if (size) b.style.setProperty("--s", size + "px");
    var s = h("span", "n"); s.textContent = n == null ? "--" : pad2(n);
    b.appendChild(s);
    b.setAttribute("aria-label", (mb ? "Mega Ball " : "") + (n == null ? "empty" : n));
    return b;
  }
  function ticketBalls(whites, bonus, size) {
    var wrap = h("div", "balls");
    whites.forEach(function (w) { wrap.appendChild(ballEl(w, false, size)); });
    wrap.appendChild(h("span", "plus"));
    wrap.appendChild(ballEl(bonus, true, size));
    return wrap;
  }

  // "drop + decrypt": balls fall in, digits cycle (crypto RNG) until each settles.
  var scrambles = [];
  function reveal(items) {
    // items: [{el: textElement, final: string, at: ms, ball: ballElement?, digits: n}]
    if (reduceMotion) { items.forEach(function (it) { it.el.textContent = it.final; }); return; }
    var t0 = performance.now();
    items.forEach(function (it) {
      if (it.ball) {
        it.ball.style.animationDelay = Math.max(0, it.at - 380) + "ms";
        it.ball.classList.add("drop", "scramble");
      }
    });
    var job = { items: items, t0: t0 };
    scrambles.push(job);
    var tick = function () {
      var now = performance.now() - t0, live = 0;
      items.forEach(function (it) {
        if (it.done) return;
        if (now >= it.at) {
          it.el.textContent = it.final; it.done = true;
          if (it.ball) it.ball.classList.remove("scramble");
        } else {
          live++;
          var s = "";
          for (var i = 0; i < it.final.length; i++) {
            var ch = it.final[i];
            s += /[0-9]/.test(ch) ? String(M.randbelow(10)) : ch;
          }
          it.el.textContent = s;
        }
      });
      if (live) job.raf = requestAnimationFrame(tick);
    };
    job.raf = requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------ PICK */
  var prefs = store.get(K_PREF, {}) || {};
  var state = {
    plays: [1, 2, 3, 4, 5].indexOf(prefs.plays) >= 0 ? prefs.plays : 5,
    mode: M.MODES.indexOf(prefs.mode) >= 0 ? prefs.mode : "uniform",
    slip: [], slipId: null
  };
  if (!st && state.mode !== "uniform") state.mode = "uniform";

  var MODE_DESC = {
    uniform: "Crypto-uniform index over all 290,472,336 tickets, decoded to a ticket. The fair default.",
    hot: "Weighted toward often-drawn numbers (weight = freq + 1), no repeats. For fun only.",
    cold: "Weighted toward rarely-drawn numbers (weight = max - freq + 1). For fun only.",
    mixed: "3 hot-weighted whites + 2 cold-weighted whites; Mega Ball coin-flips hot/cold. For fun only."
  };

  function setSeg(seg, v) {
    $$("button", seg).forEach(function (b) {
      var on = b.getAttribute("data-v") === String(v);
      b.setAttribute(b.getAttribute("role") === "tab" ? "aria-selected" : "aria-checked", on ? "true" : "false");
    });
  }

  function renderConfig() {
    setSeg($("#playsSeg"), state.plays);
    setSeg($("#modeSeg"), state.mode);
    $("#modeDesc").textContent = MODE_DESC[state.mode];
    if (!st) $$("#modeSeg button").forEach(function (b) { if (b.getAttribute("data-v") !== "uniform") b.disabled = true; });
  }

  function playCard(p, i, opts) {
    opts = opts || {};
    var li = h("li", "play");
    li.setAttribute("data-mode", p.mode.replace("guess-", ""));
    var top = h("div", "play-top");
    var lab = h("span", "play-label"); lab.textContent = p.play;
    top.appendChild(lab);
    var balls = ticketBalls(p.whites, p.bonus);
    top.appendChild(balls);
    li.appendChild(top);
    var bot = h("div", "play-bot");
    var idx = h("div", "idx", "INDEX <b></b>");
    var ib = idx.querySelector("b"); ib.textContent = grp(p.index);
    bot.appendChild(idx);
    var tagText = opts.label || p.mode.toUpperCase();
    var tagCls = opts.label ? (opts.label === "HOT" ? "t-hot" : opts.label === "COLD" ? "t-cold" : "t-bal") : "t-" + p.mode;
    var tag = h("span", "tag " + tagCls); tag.textContent = tagText;
    bot.appendChild(tag);
    if (opts.reroll) {
      var rr = h("button", "btn icon-btn");
      rr.type = "button";
      rr.setAttribute("aria-label", "Re-roll play " + p.play);
      rr.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>';
      rr.addEventListener("click", function () { rerollAt(i); });
      bot.appendChild(rr);
    }
    li.appendChild(bot);
    return { li: li, balls: balls, idxEl: ib };
  }

  function revealCard(card, base, p) {
    var items = [], bs = $$(".ball", card.balls);
    var nums = p.whites.concat([p.bonus]);
    bs.forEach(function (b, k) {
      items.push({ el: b.querySelector(".n"), final: pad2(nums[k]), at: base + 160 + k * 85, ball: b });
    });
    items.push({ el: card.idxEl, final: grp(p.index), at: base + 160 + 6 * 85 + 120 });
    reveal(items);
  }

  function renderSlip(animateFrom) {
    var ol = $("#slip");
    ol.innerHTML = "";
    var has = state.slip.length > 0;
    $("#slipEmpty").hidden = has;
    $$("#slipActions .btn").forEach(function (b) {
      if (b.getAttribute("data-act") === "share") b.hidden = !canShare;
      b.disabled = !has;
    });
    $("#slipMeta").textContent = has ? state.slip.length + " PLAY" + (state.slip.length > 1 ? "S" : "") + " · " + state.slip[0].mode.toUpperCase() + (state.slip.some(function (p) { return p.mode !== state.slip[0].mode; }) ? "+" : "") : "EMPTY";
    state.slip.forEach(function (p, i) {
      var card = playCard(p, i, { reroll: true });
      ol.appendChild(card.li);
      if (animateFrom === "all") revealCard(card, i * 140, p);
      else if (animateFrom === i) revealCard(card, 0, p);
    });
  }

  function generate() {
    var btn = $("#genBtn");
    try {
      state.slip = M.makeSlip(G, state.plays, state.mode, st);
    } catch (e) { toast("ERROR: " + e.message); return; }
    state.slipId = M.utcStamp() + "#" + M.randbelow(1e6);
    renderSlip("all");
    vibrate([12, 40, 12, 40, 28]);
    btn.classList.add("busy");
    setTimeout(function () { btn.classList.remove("busy"); }, reduceMotion ? 0 : 700);
    saveHistory();
    if (window.innerWidth < 1100) {
      var panel = $("#slipPanel");
      var y = panel.getBoundingClientRect().top + window.scrollY - 70;
      if (y > window.scrollY + 40) window.scrollTo({ top: y, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  function rerollAt(i) {
    state.slip[i] = M.rerollPlay(G, state.slip, i, state.mode === "uniform" || st ? state.mode : "uniform", st);
    renderSlip(i);
    vibrate(14);
    saveHistory();
  }

  /* ------------------------------------------------------------ history */
  function loadHistory() { var x = store.get(K_HIST, []); return Array.isArray(x) ? x : []; }
  function saveHistory() {
    if (!state.slip.length) return;
    var hist = loadHistory().filter(function (e) { return e && e.id !== state.slipId; });
    hist.unshift({ id: state.slipId, t: M.utcStamp(), plays: state.slip.map(function (p) {
      return { play: p.play, mode: p.mode, whites: p.whites, bonus: p.bonus, index: p.index };
    }) });
    store.set(K_HIST, hist.slice(0, 40));
    renderLog();
  }
  function renderLog() {
    var hist = loadHistory(), ol = $("#logList");
    ol.innerHTML = "";
    $("#logEmpty").hidden = hist.length > 0;
    $("#logClear").disabled = !hist.length;
    $("#logMeta").textContent = hist.length + " / 40";
    hist.forEach(function (e) {
      if (!e || !Array.isArray(e.plays)) return;
      var li = h("li", "log-item");
      var head = h("div", "log-head");
      var when = h("span", "when"); when.textContent = String(e.t || "").replace("T", " ").replace("Z", " UTC");
      head.appendChild(when);
      var restore = h("button", "btn btn-sm"); restore.type = "button"; restore.textContent = "RESTORE";
      restore.addEventListener("click", function () {
        state.slip = e.plays.map(function (p) { return { play: p.play, mode: p.mode, whites: p.whites.slice(), bonus: p.bonus, index: p.index }; });
        state.slipId = e.id;
        location.hash = "#pick";
        renderSlip("all");
        toast("SLIP RESTORED");
      });
      head.appendChild(restore);
      li.appendChild(head);
      e.plays.forEach(function (p) {
        var line = h("div", "log-line");
        line.innerHTML = p.play + ": " + p.whites.map(pad2).join(" ") + ' <span class="mbx">MB ' + pad2(p.bonus) + "</span> <i>#" + p.index + " " + p.mode + "</i>";
        li.appendChild(line);
      });
      ol.appendChild(li);
    });
  }

  /* ------------------------------------------------------------ ENCODE / DECODE */
  var enc = { w: [], mb: null };
  function buildGrids() {
    var gw = $("#gridW"), gb = $("#gridMB");
    for (var n = 1; n <= G.white_max; n++) gw.appendChild(numBtn(n, false));
    for (var m = 1; m <= G.bonus_max; m++) gb.appendChild(numBtn(m, true));
  }
  function numBtn(n, mb) {
    var b = h("button", "num");
    b.type = "button"; b.textContent = pad2(n);
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", (mb ? "Mega Ball " : "White ball ") + n);
    b.addEventListener("click", function () { mb ? toggleMB(n, b) : toggleW(n, b); });
    return b;
  }
  function toggleW(n, b) {
    var i = enc.w.indexOf(n);
    if (i >= 0) enc.w.splice(i, 1);
    else if (enc.w.length >= G.white_count) {
      b.classList.remove("deny"); void b.offsetWidth; b.classList.add("deny");
      vibrate([30, 30, 30]);
      setEncMsg("MAX 5 WHITE BALLS — DESELECT ONE FIRST", "err");
      return;
    } else enc.w.push(n);
    vibrate(8);
    renderEncode(true);
  }
  function toggleMB(n) {
    enc.mb = enc.mb === n ? null : n;
    vibrate(8);
    renderEncode(true);
  }
  function setEncMsg(t, cls) { var m = $("#encMsg"); m.textContent = t; m.className = "enc-msg" + (cls ? " " + cls : ""); }
  var lastEncIdx = null;
  function renderEncode(animate) {
    var ws = enc.w.slice().sort(function (a, b) { return a - b; });
    $$("#gridW .num").forEach(function (b, i) { b.setAttribute("aria-pressed", enc.w.indexOf(i + 1) >= 0 ? "true" : "false"); });
    $$("#gridMB .num").forEach(function (b, i) { b.setAttribute("aria-pressed", enc.mb === i + 1 ? "true" : "false"); });
    var slots = $("#encSlots"); slots.innerHTML = "";
    for (var i = 0; i < 5; i++) {
      var be = ballEl(ws[i] == null ? null : ws[i], false);
      if (ws[i] == null) be.classList.add("empty-slot");
      slots.appendChild(be);
    }
    slots.appendChild(h("span", "plus"));
    var mbe = ballEl(enc.mb, true); if (enc.mb == null) mbe.classList.add("empty-slot");
    slots.appendChild(mbe);
    $("#encCount").textContent = ws.length + "/5 · " + (enc.mb ? 1 : 0) + "/1";
    var complete = ws.length === 5 && enc.mb != null;
    $("#encCopy").disabled = !complete; $("#encToDec").disabled = !complete;
    var idxEl = $("#encIdx");
    if (complete) {
      var err = M.validateTicket(G, ws, enc.mb);
      if (err) { setEncMsg(err, "err"); idxEl.textContent = "—"; lastEncIdx = null; return; }
      var idx = M.encode(G, ws, enc.mb);
      if (idx !== lastEncIdx) {
        lastEncIdx = idx;
        idxEl.textContent = grp(idx);
        if (animate) reveal([{ el: idxEl, final: grp(idx), at: 420 }]);
        vibrate([10, 30, 20]);
      }
      setEncMsg("LOCKED · " + M.fmtTicket(G, ws, enc.mb) + " → " + idx, "ok");
    } else {
      lastEncIdx = null;
      idxEl.textContent = "—";
      var need = [];
      if (ws.length < 5) need.push((5 - ws.length) + " MORE WHITE" + (5 - ws.length > 1 ? "S" : ""));
      if (enc.mb == null) need.push("1 MEGA BALL");
      setEncMsg("NEED " + need.join(" + "), "");
    }
  }
  function setEncodeTicket(whites, bonus) { enc.w = whites.slice(); enc.mb = bonus; lastEncIdx = null; renderEncode(true); }

  function decodeTrace(index) {
    var N = Math.floor(index / G.bonus_max), b = index % G.bonus_max + 1;
    var lines = ['<span class="k">I</span> = ' + index,
      '<span class="k">N</span> = I div 24 = ' + N + "   <span class=\"k\">MB</span> = I mod 24 + 1 = " + b];
    var x = G.white_max - 1, n = N;
    for (var i = G.white_count; i >= 1; i--) {
      while (M.comb(x, i) > n) x--;
      lines.push("c" + i + ": C(" + x + "," + i + ") = " + M.comb(x, i) + " ≤ " + n + " → <b>" + pad2(x + 1) + "</b>");
      n -= M.comb(x, i); x--;
    }
    return lines.join("\n");
  }
  var lastDec = null;
  function doDecode(text, animate) {
    var r = M.parseIndexText(G, text), msg = $("#decMsg"), tk = $("#decTicket"), tr = $("#decTrace");
    if (r.error) {
      msg.textContent = r.error.toUpperCase(); msg.className = "enc-msg err";
      tk.innerHTML = ""; tr.innerHTML = ""; lastDec = null;
      $("#decCopy").disabled = true; $("#decToEnc").disabled = true;
      vibrate([30, 30, 30]);
      return;
    }
    var t = M.decode(G, r.index);
    lastDec = { index: r.index, whites: t.whites, bonus: t.bonus };
    msg.textContent = "DECRYPTED · " + M.fmtTicket(G, t.whites, t.bonus); msg.className = "enc-msg ok";
    tk.innerHTML = "";
    var balls = ticketBalls(t.whites, t.bonus);
    $$(".ball, .plus", balls).forEach(function (e) { tk.appendChild(e); });
    tr.innerHTML = decodeTrace(r.index);
    $("#decCopy").disabled = false; $("#decToEnc").disabled = false;
    if (animate) {
      var nums = t.whites.concat([t.bonus]);
      reveal($$(".ball", tk).map(function (b, k) { return { el: b.querySelector(".n"), final: pad2(nums[k]), at: 160 + k * 85, ball: b }; }));
    }
    vibrate([10, 30, 20]);
  }
  function buildVectors() {
    var v = $("#vectors");
    [[147183154], [200000000], [0], [290472335]].forEach(function (x) {
      var t = M.decode(G, x[0]);
      var b = h("button", "vec");
      b.type = "button";
      b.innerHTML = "<span></span><span></span>";
      b.firstChild.textContent = M.fmtTicket(G, t.whites, t.bonus);
      b.lastChild.textContent = grp(x[0]);
      b.addEventListener("click", function () { $("#decInput").value = String(x[0]); doDecode(String(x[0]), true); });
      v.appendChild(b);
    });
  }

  /* ------------------------------------------------------------ GUESS */
  var guessPlays = [];
  var guessShown = false;
  function renderGuess(animate) {
    var ol = $("#guessList");
    ol.innerHTML = "";
    if (!st) { ol.innerHTML = '<li class="empty">NO DRAW DATA: ' + (dataError || "") + "</li>"; return; }
    guessPlays = M.guessTickets(st);
    $("#guessMeta").textContent = st.D + " DRAWS";
    guessPlays.forEach(function (p, i) {
      var card = playCard(p, i, { label: p.label });
      ol.appendChild(card.li);
      if (animate) revealCard(card, i * 160, p);
    });
  }

  /* ------------------------------------------------------------ STATS */
  var statsBuilt = false, wMetric = "freq", bMetric = "freq", selW = null, selB = null;
  function rankPos(list, n) { return list.indexOf(n) + 1; }
  function lastSeen(gap) { return gap >= st.D ? "never" : draws[st.D - 1 - gap].d; }

  function whiteKind(metric) {
    var hot = st.hotW.slice(0, 10), cold = st.coldW.slice(0, 10), od = st.overW.slice(0, 10);
    return function (n) {
      if (metric === "gap") return od.indexOf(n) >= 0 ? "o" : "n";
      return hot.indexOf(n) >= 0 ? "h" : cold.indexOf(n) >= 0 ? "c" : "n";
    };
  }
  function mbKind(metric) {
    var hot = st.hotB.slice(0, 5), cold = st.coldB.slice(0, 5), od = st.overB.slice(0, 5);
    return function (n) {
      if (metric === "gap") return od.indexOf(n) >= 0 ? "o" : "g";
      return hot.indexOf(n) >= 0 ? "h" : cold.indexOf(n) >= 0 ? "c" : "g";
    };
  }
  function drawWhiteChart() {
    var vals = st.whites.map(function (n) { return wMetric === "gap" ? st.wgap[n] : st.wf[n]; });
    C.barChart($("#chartW"), {
      values: vals, expected: wMetric === "gap" ? null : st.expW, expectedText: st.expWText,
      kind: whiteKind(wMetric), selected: selW, height: 196, labelEvery: 10,
      title: wMetric === "gap" ? "White balls: draws since last seen" : "White ball frequency vs expected",
      onSelect: function (n) { selectWhite(n, "chart"); }
    });
    $("#wLegend").innerHTML = wMetric === "gap"
      ? '<span><i class="lh" style="background:#0048ff"></i>TOP-10 OVERDUE</span><span><i class="ln"></i>OTHER</span><span>BAR = DRAWS SINCE LAST SEEN</span>'
      : '<span><i class="lh"></i>HOT TOP-10</span><span><i class="lc"></i>COLD TOP-10</span><span><i class="ln"></i>OTHER</span><span><i class="le"></i>EXPECTED</span>';
  }
  function drawMBChart() {
    var vals = st.bonuses.map(function (n) { return bMetric === "gap" ? st.bgap[n] : st.bf[n]; });
    C.barChart($("#chartB"), {
      values: vals, expected: bMetric === "gap" ? null : st.expB, expectedText: st.expBText,
      kind: mbKind(bMetric), selected: selB, height: 170, labelEvery: 4,
      title: bMetric === "gap" ? "Mega Ball: draws since last seen" : "Mega Ball frequency vs expected",
      onSelect: function (n) { selectMB(n); }
    });
  }
  function detailHtml(n, mb) {
    var f = mb ? st.bf[n] : st.wf[n], gap = mb ? st.bgap[n] : st.wgap[n];
    var dev = mb ? st.devB(n) : st.devW(n), E = mb ? st.expBText : st.expWText;
    var hot = mb ? st.hotB : st.hotW, cold = mb ? st.coldB : st.coldW, od = mb ? st.overB : st.overW;
    var N = mb ? G.bonus_max : G.white_max;
    return '<div class="dn' + (mb ? " mbn" : "") + '">' + pad2(n) + "</div>" +
      '<div class="dl">' + (mb ? "MB " : "") + "FREQ <b>" + f + '</b> · DEV <b class="' + (dev[0] === "-" ? "neg" : "pos") + '">' + dev + "</b> vs E " + E + "</div>" +
      '<div class="dl">LAST SEEN <b>' + gap + "</b> draw" + (gap === 1 ? "" : "s") + " ago · " + lastSeen(gap) + "</div>" +
      '<div class="dl">HOT <b>#' + rankPos(hot, n) + "</b> · COLD <b>#" + rankPos(cold, n) + "</b> · OVERDUE <b>#" + rankPos(od, n) + "</b> /" + N + "</div>";
  }
  function selectWhite(n, from) {
    selW = n;
    $("#detail").innerHTML = detailHtml(n, false);
    $$("#heatW .cell").forEach(function (c, i) { c.classList.toggle("sel", i + 1 === n); });
    if (from !== "chart") C.select($("#chartW"), n);
    vibrate(5);
  }
  function selectMB(n) { selB = n; $("#detailB").innerHTML = detailHtml(n, true); C.select($("#chartB"), n); vibrate(5); }

  function heatColor(dev, maxAbs) {
    var t = Math.max(-1, Math.min(1, dev / maxAbs));
    // cold: #00a6cf, neutral: #ffffff, hot: #e0008f
    var to = t < 0 ? [0, 166, 207] : [224, 0, 143], a = Math.abs(t);
    var rgb = [255, 255, 255].map(function (c, i) { return Math.round(c + (to[i] - c) * a); });
    return { bg: "rgb(" + rgb.join(",") + ")", fg: a > 0.55 ? "#fff" : "#0a1230" };
  }

  function chiP(x, k) { // Wilson-Hilferty approximation of the chi-square upper tail
    var z = (Math.pow(x / k, 1 / 3) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
    return 1 - normCdf(z);
  }
  function normCdf(z) {
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989422804014327 * Math.exp(-z * z / 2);
    var p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1 - p : p;
  }

  function buildStats() {
    if (!st) {
      $("#kpis").innerHTML = '<div class="kpi wide"><div class="k">ERROR</div><div class="v sm">' + (dataError || "no data") + "</div></div>";
      return;
    }
    statsBuilt = true;
    var last = draws[st.D - 1];
    var upd = UPDATED ? UPDATED.replace("T", " ").replace(/:\d\dZ$/, " UTC").replace("Z", " UTC") : "unknown";
    $("#kpis").innerHTML =
      '<div class="kpi"><div class="k">DRAWS</div><div class="v">' + st.D + "</div></div>" +
      '<div class="kpi"><div class="k">EXPECTED</div><div class="v">' + st.expWText + ' <small>W</small> ' + st.expBText + " <small>MB</small></div></div>" +
      '<div class="kpi wide"><div class="k">RANGE</div><div class="v sm">' + st.first + " → " + st.last + "</div></div>" +
      '<div class="kpi wide"><div class="k">LAST DRAW · ' + last.d + '</div><div class="v" id="lastDraw"></div></div>' +
      '<div class="kpi wide"><div class="k">DATA UPDATED</div><div class="v sm">' + upd + "</div></div>";
    var ld = ticketBalls(last.w, last.m, 34); ld.style.justifyContent = "flex-start"; ld.style.gap = "6px";
    $("#lastDraw").appendChild(ld);

    // heatmap
    var maxAbs = 0;
    st.whites.forEach(function (n) { maxAbs = Math.max(maxAbs, Math.abs(st.wf[n] - st.expW)); });
    var heat = $("#heatW");
    st.whites.forEach(function (n) {
      var c = heatColor(st.wf[n] - st.expW, maxAbs);
      var b = h("button", "cell");
      b.type = "button";
      b.style.background = c.bg; b.style.color = c.fg;
      b.innerHTML = pad2(n) + "<small>×" + st.wf[n] + "</small>";
      b.setAttribute("aria-label", "Number " + n + ", drawn " + st.wf[n] + " times");
      b.addEventListener("click", function () { selectWhite(n); });
      heat.appendChild(b);
    });

    // overdue bars
    function hbars(target, list, gaps, top, mb) {
      var box = $(target), max = gaps[list[0]] || 1;
      list.slice(0, top).forEach(function (n) {
        var row = h("div", "hbar" + (mb ? " mb" : ""));
        row.innerHTML = '<span class="hn">' + pad2(n) + '</span><span class="ht"><span class="hf" style="width:' +
          (100 * gaps[n] / max).toFixed(1) + '%"></span></span><span class="hv"><b>' + gaps[n] + "</b> dr</span>";
        row.title = "last seen " + lastSeen(gaps[n]);
        box.appendChild(row);
      });
    }
    hbars("#odW", st.overW, st.wgap, 12, false);
    hbars("#odB", st.overB, st.bgap, 6, true);

    // chi-square
    function chiRow(name, val, text, df) {
      var p = chiP(val, df), ok = p > 0.05;
      var pos = Math.min(100, 100 * val / (2 * df));
      return '<div class="chi-row"><div class="chi-top"><span class="label" style="margin:0">' + name + '</span>' +
        '<span class="chi-verdict' + (ok ? "" : " warn") + '">' + (ok ? "CONSISTENT WITH RANDOM" : "UNUSUAL (STILL CHANCE)") + "</span></div>" +
        '<div class="chi-v">χ² ' + text + " <small>df " + df + " · p≈" + p.toFixed(2) + "</small></div>" +
        '<div class="chi-gauge"><span class="df" style="left:50%"></span><span class="m" style="left:calc(' + pos.toFixed(1) + '% - 1.5px)"></span></div>' +
        '<div class="chi-sub">Dashed = df (what pure chance averages). Far right = suspicious.</div></div>';
    }
    $("#chi").innerHTML = chiRow("WHITE BALLS", st.chiW, st.chiWText, st.dfW) + chiRow("MEGA BALL", st.chiB, st.chiBText, st.dfB);

    // rankings
    function chips(list, vals, top, cls, mb) {
      return list.slice(0, top).map(function (n) {
        return '<span class="chip ' + cls + (mb ? " mb" : "") + '">' + pad2(n) + "<i>:" + vals[n] + "</i></span>";
      }).join("");
    }
    $("#ranks").innerHTML =
      '<div class="rank-row"><div class="label t-hot">HOT WHITES · NUM:FREQ</div><div class="chips">' + chips(st.hotW, st.wf, 10, "h") + "</div></div>" +
      '<div class="rank-row"><div class="label t-cold">COLD WHITES · NUM:FREQ</div><div class="chips">' + chips(st.coldW, st.wf, 10, "c") + "</div></div>" +
      '<div class="rank-row"><div class="label">OVERDUE WHITES · NUM:GAP</div><div class="chips">' + chips(st.overW, st.wgap, 10, "o") + "</div></div>" +
      '<div class="rank-row"><div class="label t-bal">MEGA BALL · HOT / COLD / OVERDUE</div><div class="chips">' +
        chips(st.hotB, st.bf, 5, "h", true) + "</div><div class=\"chips\" style=\"margin-top:4px\">" + chips(st.coldB, st.bf, 5, "c", true) +
        "</div><div class=\"chips\" style=\"margin-top:4px\">" + chips(st.overB, st.bgap, 5, "o", true) + "</div></div>";

    drawWhiteChart(); drawMBChart();
    selectWhite(st.hotW[0]);
    selectMB(st.hotB[0]);
  }

  /* ------------------------------------------------------------ routing */
  var ROUTES = { pick: "pick", encode: "codec", decode: "codec", guess: "guess", stats: "stats", log: "log" };
  function route() {
    var key = (location.hash || "#pick").slice(1);
    if (!Object.prototype.hasOwnProperty.call(ROUTES, key)) key = "pick";
    var view = ROUTES[key];
    $$(".view").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== view; });
    $$(".tab").forEach(function (t) {
      if (t.getAttribute("data-tab") === view) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    if (view === "codec") {
      var sub = key === "decode" ? "decode" : "encode";
      setSeg($("#codecSeg"), sub);
      $("#encodePane").hidden = sub !== "encode";
      $("#decodePane").hidden = sub !== "decode";
      $(".tab[data-tab=codec]").setAttribute("href", "#" + sub);
    }
    if (view === "stats") {
      if (!statsBuilt) buildStats();
      else { C.redraw($("#chartW")); C.redraw($("#chartB")); }
    }
    if (view === "guess" && !guessShown) { guessShown = true; renderGuess(true); }
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------ install + service worker */
  var deferredPrompt = null;
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var installBtn = $("#installBtn");

  function installHelpHtml() {
    var ua = navigator.userAgent || "";
    var samsung = /SamsungBrowser/i.test(ua), ios = /iPhone|iPad|iPod/i.test(ua), android = /Android/i.test(ua);
    var s = '<div class="install-help">';
    if (!IS_HTTP) {
      s += "<p>You opened the app from a local file. Installing needs the HTTPS address (GitHub Pages): open it on your phone, then use the steps below.</p>";
    } else {
      s += "<p>Your browser didn't offer the one-tap install prompt, so add it by hand:</p>";
    }
    s += "<ol>";
    if (samsung) s += '<li><b>Samsung Internet:</b> tap <span class="kbd">≡</span> menu → <b>Add page to</b> → <b>Home screen</b> (or the <span class="kbd">⤓</span> icon in the address bar).</li>';
    if (!samsung && !ios) s += '<li><b>Chrome (Android):</b> tap <span class="kbd">⋮</span> menu → <b>Install app</b> / <b>Add to Home screen</b>.</li>';
    if (android && !samsung) s += '<li><b>Samsung Internet:</b> <span class="kbd">≡</span> → <b>Add page to</b> → <b>Home screen</b>.</li>';
    if (ios) s += '<li><b>Safari (iPhone):</b> tap <b>Share</b> → <b>Add to Home Screen</b>.</li>';
    if (!android && !ios) s += "<li><b>Desktop Chrome / Edge:</b> click the install icon at the right end of the address bar, or menu → <b>Install MEGA//INDEX</b>.</li>";
    s += "</ol><p>Once installed it launches full-screen and works offline.</p></div>";
    return s;
  }
  function openSheet() {
    $("#installHelp").innerHTML = installHelpHtml();
    $("#sheetBackdrop").hidden = false; $("#installSheet").hidden = false;
    $("#sheetClose").focus();
  }
  function closeSheet() { $("#sheetBackdrop").hidden = true; $("#installSheet").hidden = true; }

  function setupInstall() {
    if (IS_HTTP && !standalone) installBtn.hidden = false;
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (!standalone) installBtn.hidden = false;
    });
    installBtn.addEventListener("click", function () {
      vibrate(10);
      if (deferredPrompt) {
        var p = deferredPrompt; deferredPrompt = null;
        try { p.prompt(); } catch (err) { openSheet(); return; }
        if (p.userChoice) p.userChoice.then(function (c) { if (c && c.outcome === "accepted") installBtn.hidden = true; });
      } else openSheet();
    });
    window.addEventListener("appinstalled", function () { installBtn.hidden = true; deferredPrompt = null; toast("INSTALLED — LAUNCH FROM HOME SCREEN"); });
    if (window.matchMedia) {
      var mq = matchMedia("(display-mode: standalone)");
      var onChange = function () { if (mq.matches) installBtn.hidden = true; };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
    }
    $("#sheetClose").addEventListener("click", closeSheet);
    $("#sheetBackdrop").addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
    $("#installHelpInline").innerHTML = standalone ? '<p class="about-meta">RUNNING AS INSTALLED APP</p>' : "";
  }

  function setupSW() {
    if (!IS_HTTP || !("serviceWorker" in navigator)) return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (hadController) $("#updateBar").hidden = false;
      hadController = true;
    });
    $("#updateReload").addEventListener("click", function () { location.reload(); });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").then(function (reg) {
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") reg.update().catch(function () {});
        });
      }).catch(function () { /* offline-first is best effort */ });
    });
  }

  /* ------------------------------------------------------------ boot */
  function ticker() {
    var parts = ["SYS://ONLINE", "RNG <b>crypto.getRandomValues</b> + REJECTION SAMPLING", "<b>290,472,336</b> TICKETS ↔ <b>0…290,472,335</b>",
      "ODDS <i>1 : 290,472,336</i> PER TICKET"];
    if (st) {
      parts.push("DATA <b>" + st.D + "</b> DRAWS " + st.first + "→" + st.last);
      parts.push("HOT <i>" + st.hotW.slice(0, 5).map(pad2).join(" ") + "</i>");
      parts.push("COLD <b>" + st.coldW.slice(0, 5).map(pad2).join(" ") + "</b>");
      parts.push("χ² " + st.chiWText + " / df " + st.dfW);
    } else parts.push("DATA OFFLINE: " + (dataError || "none"));
    parts.push("HOT/COLD IS FOR FUN");
    $("#ticker").innerHTML = parts.join(" ▸ ") + " ▸ ";
  }

  function boot() {
    // honest notes
    var notes = M.notes(G);
    $$(".note-line[data-note]").forEach(function (p) { p.textContent = notes[+p.getAttribute("data-note")].replace(/^NOTE: /, ""); });
    ticker();
    renderConfig();
    $("#playsSeg").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      state.plays = +b.getAttribute("data-v"); renderConfig(); vibrate(6);
      store.set(K_PREF, { plays: state.plays, mode: state.mode });
    });
    $("#modeSeg").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || b.disabled) return;
      state.mode = b.getAttribute("data-v"); renderConfig(); vibrate(6);
      store.set(K_PREF, { plays: state.plays, mode: state.mode });
    });
    $("#genBtn").addEventListener("click", generate);
    $("#slipActions").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "copy") copyText("MEGA MILLIONS PICK  plays=" + state.slip.length + "\n" + slipText(state.slip), "SLIP COPIED");
      else if (act === "csv" || act === "json") exportPlays(state.slip, act);
      else if (act === "share") sharePlays(state.slip);
      else if (act === "clear") { state.slip = []; state.slipId = null; renderSlip(); toast("SLIP CLEARED"); }
    });
    renderSlip();

    // codec
    buildGrids(); renderEncode(false); buildVectors();
    $("#codecSeg").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      location.replace("#" + b.getAttribute("data-v"));
    });
    $("#encLucky").addEventListener("click", function () {
      var t = M.decode(G, M.randbelow(G.total)); setEncodeTicket(t.whites, t.bonus);
    });
    $("#encClear").addEventListener("click", function () { enc.w = []; enc.mb = null; lastEncIdx = null; renderEncode(false); });
    $("#encCopy").addEventListener("click", function () {
      if (lastEncIdx != null) copyText(M.fmtTicket(G, enc.w, enc.mb) + "  index " + lastEncIdx + "\n", "INDEX COPIED");
    });
    $("#encToDec").addEventListener("click", function () {
      if (lastEncIdx == null) return;
      $("#decInput").value = String(lastEncIdx);
      location.replace("#decode");
      doDecode(String(lastEncIdx), true);
    });
    $("#decForm").addEventListener("submit", function (e) { e.preventDefault(); $("#decInput").blur(); doDecode($("#decInput").value, true); });
    $("#decRandom").addEventListener("click", function () {
      var i = M.randbelow(G.total); $("#decInput").value = String(i); doDecode(String(i), true);
    });
    $("#decCopy").addEventListener("click", function () {
      if (lastDec) copyText(M.fmtTicket(G, lastDec.whites, lastDec.bonus) + "  index " + lastDec.index + "\n", "TICKET COPIED");
    });
    $("#decToEnc").addEventListener("click", function () {
      if (!lastDec) return;
      location.replace("#encode");
      setEncodeTicket(lastDec.whites, lastDec.bonus);
    });

    // guess
    $$("[data-gact]").forEach(function (b) {
      var act = b.getAttribute("data-gact");
      if (act === "share") b.hidden = !canShare;
      b.addEventListener("click", function () {
        if (!guessPlays.length) return;
        if (act === "copy") copyText(M.guessLines(st).join("\n") + "\n", "GUESS COPIED");
        else if (act === "share") sharePlays(guessPlays, true);
        else exportPlays(guessPlays, act);
      });
    });

    // stats toggles
    $("#wMetricSeg").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !st) return;
      wMetric = b.getAttribute("data-v"); setSeg($("#wMetricSeg"), wMetric); drawWhiteChart();
    });
    $("#bMetricSeg").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !st) return;
      bMetric = b.getAttribute("data-v"); setSeg($("#bMetricSeg"), bMetric); drawMBChart();
    });
    var rz = null;
    window.addEventListener("resize", function () {
      clearTimeout(rz);
      rz = setTimeout(function () { if (statsBuilt) { C.redraw($("#chartW")); C.redraw($("#chartB")); } }, 120);
    });

    // log
    renderLog();
    $("#logClear").addEventListener("click", function () {
      if (!window.confirm("Wipe the local slip log?")) return;
      store.set(K_HIST, []); renderLog(); toast("LOG WIPED");
    });
    $("#aboutMeta").textContent = "DATA: " + (st ? st.D + " draws " + st.first + " → " + st.last : "none") +
      " · UPDATED " + (UPDATED || "?") + " · SOURCE: NY State Open Data";

    setupInstall();
    setupSW();
    window.addEventListener("hashchange", route);
    route();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
