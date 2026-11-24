/**
 * The last part of the page script (see client.ts): the header and NOW strip (with trouble in plain words),
 * the background agents, the Terminal and Timeline tabs, the clocks and the live connection. It closes the function client-start.ts opens.
 */
export const CLIENT_END = `  // ---- the header and the NOW strip ----
  function renderTop(view) {
    document.title = "Spyglass · " + (view.name || view.project);
    ui.title.textContent = "Spyglass · " + (view.name || view.project);
    ui.where.textContent = [view.repo, view.folder, view.branch].filter(Boolean).join(" · ");

    var alert = view.alerts && view.alerts[0];
    var agents = view.agents || [], many = agentsWorking(agents), newest = agents.filter(function (a) { return a.active; })[0];
    ui.nowbar.className = "nowbar" + (alert ? " alert" : view.now.length || many ? "" : " idle");
    ui.nowTag.textContent = alert ? "STOPPED" : "NOW";
    ui.nowWhat.textContent = "";
    ui.nowStep.textContent = "";
    ui.nowClock.dataset.since = "";
    var also = many ? " · " + many : "";
    if (alert) {
      var waiting = alert.reason === "usage_limit" && alert.resetsAt && new Date(alert.resetsAt).getTime() > Date.now();
      ui.nowWhat.textContent = troubleLine(alert) + (waiting ? ". Nothing is lost; it can continue after the reset." : ".");
    } else if (view.now.length) ui.nowWhat.textContent = view.now[0].who + " · " + view.now[0].what + also;
    else if (newest) { ui.nowWhat.textContent = many + " · " + newest.name + ": " + (newest.step || "starting"); ui.nowClock.dataset.since = newest.startedAt || ""; }
    else ui.nowWhat.textContent = "Nothing running in this project. Steps show here as soon as a session starts.";
  }

  /** Trouble in plain words, with the reset time and how long until it for a usage limit. */
  var WHY = { usage_limit: "Paused: usage limit", connection: "Waiting on Claude: connection trouble", login: "Logged out: run /login in Claude Code", api: "Stopped: an API error" };
  function troubleLine(tr) {
    var line = (WHY[tr.reason] || WHY.api) + " since " + hhmm(tr.since);
    if (tr.resetsAt) {
      var mins = Math.round((new Date(tr.resetsAt).getTime() - Date.now()) / 60000);
      // Once the reset has passed, an interactive session waits for the person: say so instead of promising.
      line += mins > 0
        ? " · resets " + hhmm(tr.resetsAt) + " (in " + (mins >= 60 ? Math.floor(mins / 60) + " h " : "") + (mins % 60) + " min)"
        : " · reset passed at " + hhmm(tr.resetsAt) + ": send a message to continue";
    }
    return line;
  }

  // ---- Board tab: the background agents ----
  function renderAgents(view) {
    var list = view.agents || [];
    ui.agents.textContent = "";
    var h = el("h2", null, "Background agents");
    ui.agents.append(h);
    if (!list.length) { ui.agents.append(el("p", "empty", "No background agent in this project yet.")); return; }
    h.append(el("span", "count", agentsWorking(list) || "all finished"));
    list.forEach(function (a) {
      var row = el("div", "agent" + (a.active ? " live" : "")), dot = el("span", "dot");
      var name = el("b", null, a.name + (a.worktree ? " (worktree)" : ""));
      row.append(dot, name, el("span", "step", a.active ? a.step || "Starting" : "finished " + hhmm(a.lastAt)), el("span", "when", hhmm(a.lastAt)));
      ui.agents.append(row);
    });
  }

  // ---- Terminal: one block per step, the running one marked ----
  var SPIN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", spinAt = 0, termKey = "";
  function buildTerminal(panel) {
    var w = el("div", "window"), bar = el("div", "titlebar");
    ui.wtabs = el("div", "titlebar-tabs");
    ui.wtabs.style.display = "flex";
    ui.wtabs.style.gap = "2px";
    ui.winClock = el("span", "clock");
    bar.append(ui.wtabs, ui.winClock);
    ui.blocks = el("div", "blocks");
    ui.blocks.setAttribute("role", "log");
    ui.blocks.setAttribute("aria-label", "What the agents are doing");
    var input = el("div", "inputbar");
    ui.inputText = el("span", "text");
    ui.inputChip = el("span", "chip");
    input.append(el("span", null, "❯"), ui.inputText, el("span", "cursor"), ui.inputChip);
    w.append(bar, ui.blocks, input);
    panel.append(w);
  }
  function block(time, who, cmd, running, where) {
    var b = el("div", "blk" + (running ? " run" : "")), meta = el("div", "meta"), state = el("span");
    if (running) { state.append(el("span", "spin", SPIN[0]), " running"); state.firstChild.dataset.spin = "1"; }
    else state.append(el("span", "ok", "✓"));
    meta.append(el("span", null, [time, who].filter(Boolean).join(" · ")), state);
    var prompt = el("div", "prompt");
    prompt.append(el("span", "cwd", where.folder || "~"), el("span", "br", where.branch || ""), el("span", "car", "❯"), el("span", "cmd", cmd));
    b.append(meta, prompt);
    return b;
  }
  function renderTerminal(view) {
    var key = JSON.stringify([view.now, (view.agents || []).map(function (a) { return [a.agentId, a.recent, a.active]; })]);
    ui.wtabs.textContent = "";
    var on = el("span", "wtab on");
    on.append(el("span", "dot"), view.project);
    ui.wtabs.append(on);
    var latest = view.now[0] ? view.now[0].what : "";
    ui.inputText.textContent = latest || "waiting for the next step";
    ui.inputChip.textContent = view.branch || "idle";
    if (key === termKey) return;
    termKey = key;
    var stick = ui.blocks.scrollHeight - ui.blocks.scrollTop - ui.blocks.clientHeight < 80;
    ui.blocks.textContent = "";
    var banner = el("div", "banner");
    banner.append(el("b", null, "Spyglass")," · " + view.project + (view.branch ? " · " + view.branch : ""));
    ui.blocks.append(banner);
    view.now.forEach(function (r) { ui.blocks.append(block(hhmm(r.at), r.who, r.what, true, view)); });
    (view.agents || []).forEach(function (a) {
      if (!a.active) return;
      (a.recent || []).forEach(function (st, i, all) {
        var lastOne = i === all.length - 1;
        ui.blocks.append(block(lastOne ? hhmm(a.lastAt) : "", a.name, st, lastOne, view));
      });
    });
    if (ui.blocks.children.length === 1) ui.blocks.append(el("div", "banner", "No steps yet. They show here as the agents work."));
    if (stick || !ui.blocks.dataset.seen) { ui.blocks.scrollTop = ui.blocks.scrollHeight; ui.blocks.dataset.seen = "1"; }
  }

  // ---- Timeline: one row per hour, a bar per background agent ----
  function buildTimeline(panel) {
    var box = el("div", "timeline"), head = el("div", "tl-head");
    head.append(el("h3", null, "Timeline"), el("span", "eyebrow", "one row per hour · background agents in the order they ran"));
    ui.tlSum = el("div", "tl-sum");
    ui.hours = el("div", "hours");
    var legend = el("div", "legend");
    [["var(--live)", "working"], ["var(--done)", "done"]].forEach(function (k) {
      var s = el("span"), i = el("i");
      i.style.background = k[0];
      s.append(i, k[1]);
      legend.append(s);
    });
    box.append(head, ui.tlSum, ui.hours, legend);
    panel.append(box);
  }
  function renderTimeline(view) {
    var nowMs = Date.now();
    ui.hours.textContent = "";
    ui.tlSum.textContent = "";
    var agentSegs = agentSegments(view.agents || [], nowMs);
    if (!agentSegs.length) { ui.hours.append(el("p", "empty", "No background agent has run in this project yet.")); return; }
    var begin = Math.min.apply(null, agentSegs.map(function (g) { return g.from; }));
    var parts = [["On shift", durationText(nowMs - begin)], ["Agents", agentsWorking(view.agents) || agentSegs.length + " finished"]];
    parts.forEach(function (p) { var s = el("span"); s.append(p[0] + " ", el("b", null, p[1])); ui.tlSum.append(s); });
    var headRow = el("div", "hr head"), marks = el("div");
    [":00", ":15", ":30", ":45"].forEach(function (m) { marks.append(el("span", null, m)); });
    headRow.append(el("span"), marks);
    ui.hours.append(headRow);
    hourRows(begin, nowMs, agentSegs).forEach(function (r) {
      var row = el("div", "hr"), lane = el("div", "row");
      r.bars.forEach(function (b) {
        var bar = el("span", "bar " + b.kind, b.first && b.width > 5 ? b.label : "");
        bar.style.left = b.left + "%";
        bar.style.width = b.width + "%";
        bar.title = b.label;
        lane.append(bar);
      });
      if (r.nowAt !== null) { var line = el("span", "nowline"); line.style.left = r.nowAt + "%"; lane.append(line); }
      row.append(el("span", null, hhmm(new Date(r.at).toISOString())), lane);
      ui.hours.append(row);
    });
  }

  function render(view) {
    if (!built) build();
    last = view;
    renderTop(view);
    renderAgents(view);
    renderTerminal(view);
    if (!ui.panels.timeline.hidden) renderTimeline(view);
    tick();
  }

  // ---- the clocks: every second, from the start times the board already holds ----
  function tick() {
    if (!built) return;
    root.querySelectorAll("[data-since]").forEach(function (n) { n.textContent = n.dataset.since ? since(n.dataset.since) : ""; });
    ui.winClock.textContent = new Date().toLocaleTimeString([], { hour12: false });
  }

  // ---- the live connection ----
  var source = new EventSource("/events?project=" + encodeURIComponent(project));
  source.addEventListener("projects", function (e) { renderProjects(JSON.parse(e.data)); });
  source.addEventListener("board", function (e) { render(JSON.parse(e.data)); });
  function connection(live) {
    if (!ui.conn) return;
    ui.connText.textContent = live ? "LIVE" : "RECONNECTING…";
    ui.conn.classList.toggle("off", !live);
    root.querySelector(".top").classList.toggle("off", !live);
  }
  source.onopen = function () { connection(true); };
  source.onerror = function () { connection(false); };
  setInterval(tick, 1000);
  setInterval(function () { spinAt = (spinAt + 1) % SPIN.length; root.querySelectorAll("[data-spin]").forEach(function (n) { n.textContent = SPIN[spinAt]; }); }, 120);
  setInterval(function () { if (last && built) { renderTop(last); if (!ui.panels.timeline.hidden) renderTimeline(last); } }, 15000);
})();
`;
