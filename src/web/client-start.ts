/**
 * The first part of the page script (see client.ts): helpers, the start page and the frame of a project's board
 * (header, NOW strip, tabs, the three panels). It opens the function client-end.ts closes.
 */
export const CLIENT_START = `
(function () {
  "use strict";
  var TABS = [["board", "Board"], ["terminal", "Terminal"], ["timeline", "Timeline"]];
  var project = "";
  try { project = decodeURIComponent(location.pathname.slice(1)); } catch (e) { project = location.pathname.slice(1); }
  var root = document.getElementById("app");
  var last = null, built = false, ui = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function hhmm(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d) ? "" : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function since(iso) { return iso ? durationText(Date.now() - new Date(iso).getTime()) : "–"; }

  // ---- the start page: projects with something going on ----
  function renderProjects(rows) {
    root.textContent = "";
    var head = el("header", "top"), brand = el("div", "brand");
    brand.append(el("span", "led"), el("h1", null, "Spyglass"));
    head.append(brand);
    root.append(head);
    if (!rows.length) { root.append(el("p", "empty", "No projects yet. Add one to ~/.nightshift/projects.json.")); return; }
    var grid = el("div", "projects");
    rows.forEach(function (r) {
      var a = el("a", r.active ? "project" : "project idle");
      a.href = "/" + encodeURIComponent(r.project);
      a.append(el("b", null, r.name || r.project), el("span", null, r.folder));
      var last = r.lastAt ? "last active " + (new Date(r.lastAt).toDateString() === new Date().toDateString() ? "" : new Date(r.lastAt).toLocaleDateString([], { month: "short", day: "numeric" }) + " ") + hhmm(r.lastAt) : "no activity yet";
      a.append(el("span", null, (r.agents ? r.agents + (r.agents === 1 ? " agent" : " agents") + " working · " : "") + last));
      grid.append(a);
    });
    root.append(grid);
  }

  // ---- one project's board: built once, then only painted ----
  function build() {
    root.textContent = "";
    var head = el("header", "top"), brand = el("div", "brand"), name = el("div");
    ui.title = el("h1", null, "Spyglass · " + project);
    ui.where = el("div", "where");
    name.append(ui.title, ui.where);
    brand.append(el("span", "led"), name);
    var stats = el("div", "stats");
    ui.conn = el("span", "conn");
    ui.conn.setAttribute("role", "status");
    ui.connText = el("span", null, "LIVE");
    ui.conn.append(el("span", "led"), ui.connText);
    stats.append(ui.conn);
    head.append(brand, stats);

    ui.nowbar = el("div", "nowbar idle");
    ui.nowbar.setAttribute("aria-live", "polite");
    ui.nowTag = el("span", "tag", "NOW");
    ui.nowWhat = el("span", "what");
    ui.nowStep = el("span");
    ui.nowClock = el("b");
    var meta = el("span", "meta");
    meta.append(ui.nowStep, ui.nowClock);
    ui.nowbar.append(ui.nowTag, ui.nowWhat, meta);

    var tabs = el("nav", "tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Views");
    ui.tabs = {};
    ui.panels = {};
    TABS.forEach(function (t) {
      var b = el("button", null, t[1]);
      b.type = "button";
      b.id = "tab-" + t[0];
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "panel-" + t[0]);
      b.addEventListener("click", function () { show(t[0]); });
      ui.tabs[t[0]] = b;
      tabs.append(b);
      var p = el("section", "panel");
      p.id = "panel-" + t[0];
      p.setAttribute("role", "tabpanel");
      p.setAttribute("aria-labelledby", b.id);
      ui.panels[t[0]] = p;
    });

    ui.agents = el("section", "agents");
    ui.agents.setAttribute("aria-label", "Background agents");
    ui.panels.board.append(ui.agents);
    buildTerminal(ui.panels.terminal);
    buildTimeline(ui.panels.timeline);

    var keys = el("footer", "keys");
    keys.append(el("span", "keys-note", "read only · nothing leaves this computer"));
    root.append(head, ui.nowbar, tabs, ui.panels.board, ui.panels.terminal, ui.panels.timeline, keys);
    var saved = null;
    try { saved = localStorage.getItem("nightshift:tab"); } catch (e) { saved = null; }
    show(ui.tabs[saved] ? saved : "board");
    built = true;
  }

  function show(name) {
    TABS.forEach(function (t) {
      var on = t[0] === name;
      ui.tabs[t[0]].setAttribute("aria-selected", String(on));
      ui.tabs[t[0]].tabIndex = on ? 0 : -1;
      ui.panels[t[0]].hidden = !on;
    });
    try { localStorage.setItem("nightshift:tab", name); } catch (e) { /* private mode: the tab is not remembered */ }
    if (last && name === "timeline") renderTimeline(last);
    if (name === "terminal" && ui.blocks) ui.blocks.scrollTop = ui.blocks.scrollHeight;
  }

`;
