/* MEGA//INDEX charts: hand-drawn inline SVG, no libraries. Classic script -> window.MegaCharts.
 * Colors can be themed per app with CSS custom properties on the page (--chart-h, --chart-c, --chart-n,
 * --chart-g, --chart-o, --chart-grid, --chart-axis, --chart-label, --chart-halo, --chart-cursor).
 * Unset properties fall back to the MEGA//INDEX defaults below. */
(function (root) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var FILL = {
    h: "#ff1fae",   // hot
    c: "#00c2ea",   // cold
    n: "#b8c5e3",   // neutral
    g: "#f2b705",   // gold (mega ball neutral)
    o: "#0048ff"    // overdue / gap emphasis
  };
  var INK = { grid: "#dbe3f4", axis: "#0a1230", label: "#5f6a8c", halo: "#fff", cursor: "#ff1fae" };

  function theme(container) {
    var cs = window.getComputedStyle ? getComputedStyle(container) : null, t = { fill: {} }, k;
    function v(name, dflt) { var x = cs ? cs.getPropertyValue("--chart-" + name).trim() : ""; return x || dflt; }
    for (k in FILL) if (Object.prototype.hasOwnProperty.call(FILL, k)) t.fill[k] = v(k, FILL[k]);
    for (k in INK) if (Object.prototype.hasOwnProperty.call(INK, k)) t[k] = v(k, INK[k]);
    return t;
  }

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceMax(v) {
    if (v <= 5) return 5;
    var step = v <= 20 ? 5 : v <= 50 ? 10 : v <= 100 ? 20 : 50;
    return Math.ceil(v / step) * step;
  }

  // 4 gridline steps that are whole, round numbers (POWER//INDEX's bigger counts: 0/40/80/120/160).
  function evenMax(v) {
    var steps = [5, 10, 20, 25, 40, 50, 100, 200, 250, 500], q = Math.max(v, 1) / 4;
    for (var i = 0; i < steps.length; i++) if (steps[i] >= q) return steps[i] * 4;
    return Math.ceil(q / 500) * 2000;
  }

  /**
   * Vertical bar chart, one bar per number 1..N, sized to the container's pixel width
   * so text renders at real size. Tap or drag across it to scrub; calls onSelect(number).
   * opts: values[] (index i -> number i+1), expected, evenTicks, kind(num)->'h'|'c'|'n'|'g'|'o',
   *       selected, onSelect, height, labelEvery, unit, title
   */
  function barChart(container, opts) {
    container._chartOpts = opts;
    draw(container);
    if (!container._chartBound) {
      container._chartBound = true;
      var scrubbing = false;
      function pick(ev) {
        var o = container._chartOpts, g = container._geom;
        if (!o || !g) return;
        var r = container.getBoundingClientRect();
        var x = (ev.clientX - r.left) * (g.W / r.width);
        var i = Math.floor((x - g.left) / g.slot);
        i = Math.max(0, Math.min(o.values.length - 1, i));
        if (o.selected !== i + 1) {
          o.selected = i + 1;
          markSelected(container);
          if (o.onSelect) o.onSelect(i + 1);
        }
      }
      container.addEventListener("pointerdown", function (ev) {
        scrubbing = true; pick(ev);
        // let vertical page scrolling continue on touch; we only scrub horizontally
      });
      container.addEventListener("pointermove", function (ev) {
        if (scrubbing || ev.pointerType === "mouse") { if (scrubbing) pick(ev); }
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) {
        container.addEventListener(t, function () { scrubbing = false; });
      });
    }
  }

  function draw(container) {
    var o = container._chartOpts, T = theme(container);
    var W = Math.max(280, Math.round(container.clientWidth || 320));
    var H = o.height || 190;
    var n = o.values.length;
    var left = 26, right = 6, top = 14, bottom = 22;
    var plotW = W - left - right, plotH = H - top - bottom;
    var slot = plotW / n;
    var barW = Math.max(1.5, slot * (n > 40 ? 0.72 : 0.68));
    var vmax = 0;
    o.values.forEach(function (v) { if (v > vmax) vmax = v; });
    if (o.expected != null && o.expected > vmax) vmax = o.expected;
    var ymax = o.evenTicks ? evenMax(vmax) : niceMax(vmax);
    container._geom = { W: W, left: left, slot: slot };
    function y(v) { return top + plotH - (v / ymax) * plotH; }

    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img",
      "aria-label": o.title || "bar chart" });
    // grid + y ticks
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var v = (ymax / ticks) * t, yy = y(v);
      el("line", { x1: left, x2: W - right, y1: yy, y2: yy, stroke: t === 0 ? T.axis : T.grid,
        "stroke-width": t === 0 ? 1.2 : 1, "stroke-dasharray": t === 0 ? "" : "2 3" }, svg);
      var lab = el("text", { x: left - 5, y: yy + 3.5, "text-anchor": "end", "font-size": 9.5, fill: T.label }, svg);
      lab.textContent = Math.round(v);
    }
    // bars
    var bars = el("g", {}, svg);
    container._bars = [];
    for (var i = 0; i < n; i++) {
      var val = o.values[i], k = o.kind ? o.kind(i + 1) : "n";
      var x = left + i * slot + (slot - barW) / 2;
      var yv = y(val);
      var r = el("rect", { x: x.toFixed(2), y: yv.toFixed(2), width: barW.toFixed(2),
        height: Math.max(0, top + plotH - yv).toFixed(2), fill: T.fill[k] || T.fill.n, "data-k": k }, bars);
      if (k === "h" || k === "c" || k === "o") r.setAttribute("stroke", T.axis), r.setAttribute("stroke-width", "0.6");
      container._bars.push(r);
    }
    // expected line
    if (o.expected != null) {
      var ey = y(o.expected);
      el("line", { x1: left, x2: W - right, y1: ey, y2: ey, stroke: T.axis, "stroke-width": 1.4, "stroke-dasharray": "5 3" }, svg);
      var et = el("text", { x: W - right, y: ey - 4, "text-anchor": "end", "font-size": 10, "font-weight": 800, fill: T.axis,
        stroke: T.halo, "stroke-width": 3, "paint-order": "stroke" }, svg);
      et.textContent = "EXPECTED " + o.expectedText;
    }
    // x labels
    var every = o.labelEvery || (n > 40 ? 10 : n > 20 ? 4 : 1);
    for (var j = 1; j <= n; j++) {
      if (j !== 1 && j % every !== 0) continue;
      var tx = left + (j - 1) * slot + slot / 2;
      var xt = el("text", { x: tx, y: H - 7, "text-anchor": "middle", "font-size": 9.5, fill: T.label }, svg);
      xt.textContent = j < 10 ? "0" + j : String(j);
      el("line", { x1: tx, x2: tx, y1: top + plotH, y2: top + plotH + 3, stroke: T.axis }, svg);
    }
    // selection marker (cursor)
    var cur = el("g", { class: "cursor", visibility: "hidden" }, svg);
    el("line", { y1: top - 6, y2: top + plotH, stroke: T.axis, "stroke-width": 1, "stroke-dasharray": "1 2" }, cur);
    el("path", { d: "M-5,-7 L5,-7 L0,-1 Z", fill: T.cursor }, cur);
    container._cursor = cur;
    container._y = y;
    container.innerHTML = "";
    container.appendChild(svg);
    markSelected(container);
  }

  function markSelected(container) {
    var o = container._chartOpts, g = container._geom, cur = container._cursor;
    if (!o || !g || !cur) return;
    container._bars.forEach(function (b, i) {
      b.setAttribute("opacity", o.selected && o.selected !== i + 1 ? "0.55" : "1");
    });
    if (!o.selected) { cur.setAttribute("visibility", "hidden"); return; }
    var cx = g.left + (o.selected - 1) * g.slot + g.slot / 2;
    var ty = container._y(o.values[o.selected - 1]);
    cur.setAttribute("visibility", "visible");
    cur.setAttribute("transform", "translate(" + cx.toFixed(2) + ",0)");
    cur.lastChild.setAttribute("transform", "translate(0," + ty.toFixed(2) + ")");
  }

  function select(container, num) {
    if (!container._chartOpts) return;
    container._chartOpts.selected = num;
    markSelected(container);
  }

  function redraw(container) { if (container._chartOpts && container.clientWidth) draw(container); }

  root.MegaCharts = { barChart: barChart, select: select, redraw: redraw, FILL: FILL };
})(typeof window !== "undefined" ? window : this);
