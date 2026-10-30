// Settings panel: greeting/brand, per-agent name/room/model/lean, room order and names.
// Self-contained on purpose (own styles, own markup) so it can be dropped into any tab container.
// cwd and tool permissions are intentionally not editable here: they are the security boundary.

const CSS = `
.st-wrap { display: grid; gap: 14px; padding: 4px 2px 24px; max-width: 980px; }
.st-card { background: var(--paper); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px;
           box-shadow: 0 10px 26px rgba(var(--shadow-rgb), .1); }
.st-card h3 { margin: 0 0 2px; font-size: 15px; letter-spacing: .02em; color: var(--ink); }
.st-card p.st-hint { margin: 0 0 12px; font-size: 12px; color: var(--muted); }
.st-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr .9fr auto; gap: 8px; align-items: center;
          padding: 8px 0; border-top: 1px dashed var(--line-soft); }
.st-row:first-of-type { border-top: 0; }
.st-row.st-head { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-2);
                  border: 0; padding-bottom: 4px; }
.st-room { grid-template-columns: 1.2fr 1fr 1.6fr 44px auto; }
.st-field { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
.st-field input[type=text], .st-field select {
  width: 100%; box-sizing: border-box; padding: 7px 9px; border-radius: 9px; border: 1px solid var(--line);
  background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; }
.st-field input[type=text]:focus, .st-field select:focus { outline: 2px solid rgba(var(--coral-rgb), .35); border-color: var(--coral); }
.st-field input:disabled { background: var(--paper-soft); color: var(--muted-2); }
.st-field input[type=checkbox] { width: 16px; height: 16px; justify-self: start; accent-color: var(--coral); }
.st-key { font-weight: 600; color: var(--ink-2); font-size: 13px; }
.st-key small { display: block; font-weight: 400; color: var(--muted-2); font-size: 11px; }
.st-actions { display: flex; gap: 10px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.st-btn { border: 0; border-radius: 10px; padding: 9px 16px; font: inherit; font-size: 13px; cursor: pointer;
          white-space: nowrap;
          background: var(--coral); color: #fff; font-weight: 600; }
.st-btn[data-variant=ghost] { background: var(--paper-soft); color: var(--ink-2); font-weight: 500; }
.st-btn[data-variant=icon] { background: transparent; color: var(--muted); padding: 6px 8px; font-size: 15px; }
.st-btn:disabled { opacity: .45; cursor: not-allowed; }
.st-note { font-size: 12px; color: var(--muted); }
.st-note[data-tone=ok] { color: var(--green); }
.st-note[data-tone=error] { color: var(--red); }
.st-agents { color: var(--muted-2); font-size: 12px; white-space: nowrap; }
.st-new { border: 1px dashed var(--line); border-radius: 12px; padding: 12px; margin-top: 10px;
          background: var(--paper-soft); display: grid; gap: 8px; }
.st-new .st-grid { display: grid; gap: 8px; grid-template-columns: 1fr 1fr 1fr 1fr; }
.st-new h4 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-2); }
.st-projects { display: grid; gap: 4px; margin-top: 10px; max-height: 220px; overflow: auto; }
.st-project { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; padding: 6px 8px; border-radius: 8px;
              background: var(--paper-warm); border: 1px solid var(--line); font-size: 12.5px; align-items: center; }
.st-project-name { font-weight: 600; color: var(--ink); }
.st-color { width: 34px; height: 26px; padding: 2px; border-radius: 8px; border: 1px solid var(--line);
            background: var(--paper); cursor: pointer; }
.st-badge { font-size: 10px; padding: 1px 6px; border-radius: 999px; background: var(--paper-deep); color: var(--muted); }
.st-project-path { grid-column: 1 / -1; font-size: 10.5px; color: var(--muted-2); font-family: ui-monospace, monospace; }
`;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export function renderSettings(root) {
  if (!document.getElementById("settingsStyle")) {
    const style = el("style");
    style.id = "settingsStyle";
    style.textContent = CSS;
    document.head.append(style);
  }

  const wrap = el("div", "st-wrap");
  root.replaceChildren(wrap);
  const note = el("span", "st-note", "");

  const state = { data: null, rooms: [], agents: [] };

  function say(text, tone) {
    note.textContent = text;
    note.dataset.tone = tone || "";
  }

  async function load() {
    wrap.replaceChildren(el("p", "st-note", "Loading settings…"));
    try {
      state.data = await api("/api/settings");
      state.rooms = state.data.rooms.map((r) => ({ ...r }));
      state.agents = state.data.agents.map((a) => ({ ...a }));
      draw();
    } catch (err) {
      wrap.replaceChildren(el("p", "st-note", `Settings could not be loaded: ${err.message}`));
    }
  }

  function textField(labelText, value, maxLength, placeholder) {
    const field = el("label", "st-field");
    field.append(el("span", null, labelText));
    const input = el("input");
    input.type = "text";
    input.maxLength = maxLength;
    if (placeholder) input.placeholder = placeholder;
    input.value = value || "";
    field.append(input);
    field.input = input;
    return field;
  }

  function checkField(labelText, checked) {
    const field = el("label", "st-field");
    field.append(el("span", null, labelText));
    const box = el("input");
    box.type = "checkbox";
    box.checked = Boolean(checked);
    field.append(box);
    field.input = box;
    return field;
  }

  function generalCard() {
    const card = el("section", "st-card");
    const settings = state.data.settings;
    card.append(el("h3", null, "General"));
    card.append(el("p", "st-hint", "Greeting card, brand and what the welcome card shows."));

    const row = el("div", "st-row");
    row.style.gridTemplateColumns = "1fr 1fr";
    const user = textField("Your name", settings.user, 40, "Your name");
    const brand = textField("Brand", settings.brand, 40, "MyOffice");
    row.append(user, brand);

    const row2 = el("div", "st-row");
    row2.style.gridTemplateColumns = "1fr 1fr";
    const greeting = textField("Greeting (empty = automatic by time of day)", settings.greeting, 80,
      "Automatic by time of day");
    const note = textField("Line under the summary", settings.note, 200, "Nothing needs you right now.");
    row2.append(greeting, note);

    const row3 = el("div", "st-row");
    row3.style.gridTemplateColumns = "1fr 1fr";
    const tokens = checkField("Show today's token total", settings.show_token_summary);
    const sessions = checkField("Mention my open terminal sessions", settings.show_sessions);
    row3.append(tokens, sessions);

    card.append(row, row2, row3);
    card.userField = user;
    card.brandField = brand;
    card.greetingField = greeting;
    card.noteField = note;
    card.tokensField = tokens;
    card.sessionsField = sessions;
    return card;
  }

  function agentsCard() {
    const card = el("section", "st-card");
    card.append(el("h3", null, "Agents"));
    card.append(el("p", "st-hint",
      "Model, room and lean mode. cwd and tool permissions stay in agents.json on purpose."));
    const head = el("div", "st-row st-head");
    ["Agent", "Name", "Room", "Model", "Runtime", "Lean"].forEach((t) => head.append(el("span", null, t)));
    card.append(head);
    for (const agent of state.agents) {
      const row = el("div", "st-row");
      const key = el("div", "st-key", agent.name || agent.id);
      const sub = el("small", null, `${agent.id}${agent.installed ? "" : " · folder missing"}`);
      key.append(sub);
      const name = el("input");
      name.type = "text";
      name.maxLength = 40;
      name.value = agent.name || "";
      name.addEventListener("input", () => { agent.name = name.value; });
      const nameField = el("label", "st-field");
      nameField.append(name);

      const room = el("select");
      for (const r of state.rooms) {
        const option = el("option", null, r.name);
        option.value = r.id;
        room.append(option);
      }
      const current = el("option", null, "CEO desk (centre)");
      current.value = "ceo";
      if (agent.room === "ceo") current.selected = true;
      room.append(current);
      room.value = agent.room;
      room.addEventListener("change", () => { agent.room = room.value; });
      const roomField = el("label", "st-field");
      roomField.append(room);

      const model = el("input");
      model.type = "text";
      model.setAttribute("list", "settingsModels");
      model.maxLength = 60;
      model.value = agent.model || "";
      model.addEventListener("input", () => { agent.model = model.value.trim(); });
      const modelField = el("label", "st-field");
      modelField.append(model);

      const runtime = el("select");
      for (const [value, label] of [["claude", "Claude Code"], ["opencode", "OpenCode"]]) {
        const option = el("option", null, label);
        option.value = value;
        runtime.append(option);
      }
      runtime.value = agent.runtime || "claude";
      runtime.addEventListener("change", () => { agent.runtime = runtime.value; });
      const runtimeField = el("label", "st-field");
      runtimeField.append(runtime);

      const lean = el("input");
      lean.type = "checkbox";
      lean.checked = Boolean(agent.lean);
      lean.addEventListener("change", () => { agent.lean = lean.checked; });
      const leanField = el("label", "st-field");
      leanField.append(lean);

      row.append(key, nameField, roomField, modelField, runtimeField, leanField);
      card.append(row);
    }
    const list = el("datalist");
    list.id = "settingsModels";
    for (const m of state.data.models) {
      const option = el("option");
      option.value = m;
      list.append(option);
    }
    card.append(list);
    card.append(newAgentBox());
    return card;
  }

  function newAgentBox() {
    const box = el("div", "st-new");
    box.append(el("h4", null, "Add an agent"));
    const id = el("input");
    id.type = "text";
    id.placeholder = "agent-id";
    id.maxLength = 40;
    const name = el("input");
    name.type = "text";
    name.placeholder = "Name";
    name.maxLength = 40;
    const cwd = el("input");
    cwd.type = "text";
    cwd.placeholder = "~/Projeler/your-project";
    cwd.maxLength = 300;
    const model = el("input");
    model.type = "text";
    model.maxLength = 80;
    model.value = "sonnet";
    model.setAttribute("list", "settingsModels");

    const room = el("select");
    for (const r of state.rooms) {
      const option = el("option", null, r.name);
      option.value = r.id;
      room.append(option);
    }
    const general = el("option", null, "General");
    general.value = "general";
    room.append(general);

    const profile = el("select");
    for (const p of (state.data.profiles || ["read", "review", "build", "research"])) {
      const option = el("option", null, `${p} permissions`);
      option.value = p;
      profile.append(option);
    }

    const runtime = el("select");
    for (const [value, label] of [["claude", "Claude Code (claude -p)"], ["opencode", "OpenCode (opencode run)"]]) {
      const option = el("option", null, label);
      option.value = value;
      runtime.append(option);
    }

    const gridA = el("div", "st-grid");
    const idField = el("label", "st-field");
    idField.append(el("span", null, "Id"), id);
    const nameField = el("label", "st-field");
    nameField.append(el("span", null, "Name"), name);
    const roomField = el("label", "st-field");
    roomField.append(el("span", null, "Room"), room);
    const profileField = el("label", "st-field");
    profileField.append(el("span", null, "Tools"), profile);
    gridA.append(idField, nameField, roomField, profileField);

    const gridB = el("div", "st-grid");
    const cwdField = el("label", "st-field");
    cwdField.append(el("span", null, "Folder (cwd)"), cwd);
    const modelField = el("label", "st-field");
    modelField.append(el("span", null, "Model"), model);
    const runtimeField = el("label", "st-field");
    runtimeField.append(el("span", null, "Runtime"), runtime);
    const add = el("button", "st-btn", "Add agent");
    add.style.alignSelf = "end";
    add.addEventListener("click", async () => {
      const agentId = id.value.trim().toLowerCase();
      if (!/^[a-z0-9-]{1,40}$/.test(agentId)) return say("Agent id may use a-z, 0-9 and - (max 40).", "error");
      if (!cwd.value.trim()) return say("A folder is required: the agent runs there.", "error");
      add.disabled = true;
      say("Adding…");
      try {
        const data = await api("/api/settings", {
          new_agents: [{
            id: agentId,
            name: name.value.trim() || agentId,
            cwd: cwd.value.trim(),
            room: room.value,
            model: model.value.trim() || "sonnet",
            profile: profile.value,
            runtime: runtime.value,
          }],
        });
        state.data = data;
        state.rooms = data.rooms.map((r) => ({ ...r }));
        state.agents = data.agents.map((a) => ({ ...a }));
        draw();
        say(`Agent ${agentId} added. It appears on the scene after the next refresh.`, "ok");
      } catch (err) {
        say(err.message, "error");
        add.disabled = false;
      }
    });
    gridB.append(cwdField, modelField, runtimeField, add);

    box.append(gridA, gridB);
    return box;
  }

  function projectsCard() {
    const card = el("section", "st-card");
    card.append(el("h3", null, "Projects"));
    card.append(el("p", "st-hint",
      "Tasks can run inside any folder under this root. Pick the folder per task in the agent panel."));
    const row = el("div", "st-row");
    row.style.gridTemplateColumns = "1fr auto";
    const root = textField("Projects root", state.data.projects_root, 300, "~/Projeler");
    const save = el("button", "st-btn", "Save root");
    save.style.alignSelf = "end";
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const data = await api("/api/settings", { projects_root: root.input.value.trim() });
        state.data = data;
        draw();
        say("Projects root saved.", "ok");
      } catch (err) {
        say(err.message, "error");
        save.disabled = false;
      }
    });
    row.append(root, save);
    card.append(row);

    const list = el("div", "st-projects");
    list.append(el("p", "st-note", "Loading…"));
    card.append(list);
    api("/api/projects").then((data) => {
      list.replaceChildren();
      if (!data.projects.length) {
        list.append(el("p", "st-note", "No folders found under this root."));
        return;
      }
      for (const p of data.projects) {
        const item = el("div", "st-project");
        item.append(el("span", "st-project-name", p.name));
        if (p.git) item.append(el("span", "st-badge", "git"));
        item.append(el("span", "st-project-path", p.path));
        list.append(item);
      }
    }).catch(() => list.replaceChildren(el("p", "st-note", "Projects could not be listed.")));
    return card;
  }

  function roomsCard() {
    const card = el("section", "st-card");
    card.append(el("h3", null, "Rooms"));
    card.append(el("p", "st-hint",
      "Order here is the order on the scene. A room with agents cannot be removed; move them first. " +
      "Room ids are permanent."));
    const head = el("div", "st-row st-room st-head");
    ["Room", "Id", "Description", "Agents", ""].forEach((t) => head.append(el("span", null, t)));
    card.append(head);

    state.rooms.forEach((room, index) => {
      const row = el("div", "st-row st-room");
      const name = el("input");
      name.type = "text";
      name.maxLength = 40;
      name.value = room.name || "";
      name.addEventListener("input", () => { room.name = name.value; });
      const nameField = el("label", "st-field");
      nameField.append(name);

      const id = el("input");
      id.type = "text";
      id.value = room.id;
      id.disabled = true;
      const idField = el("label", "st-field");
      idField.append(id);

      const description = el("input");
      description.type = "text";
      description.maxLength = 200;
      description.value = room.description || "";
      description.addEventListener("input", () => { room.description = description.value; });
      const descField = el("label", "st-field");
      descField.append(description);

      const count = el("span", "st-agents", String(room.agents));
      const tools = el("div", "st-field");
      tools.style.gridAutoFlow = "column";
      tools.style.justifyContent = "start";
      const up = el("button", "st-btn", "↑");
      up.dataset.variant = "icon";
      up.title = "Move up";
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        const list = state.rooms;
        [list[index - 1], list[index]] = [list[index], list[index - 1]];
        draw();
      });
      const down = el("button", "st-btn", "↓");
      down.dataset.variant = "icon";
      down.title = "Move down";
      down.disabled = index === state.rooms.length - 1;
      down.addEventListener("click", () => {
        const list = state.rooms;
        [list[index + 1], list[index]] = [list[index], list[index + 1]];
        draw();
      });
      const remove = el("button", "st-btn", "✕");
      remove.dataset.variant = "icon";
      remove.title = room.agents ? "Move its agents to another room first" : "Remove room";
      remove.disabled = room.agents > 0;
      remove.addEventListener("click", () => {
        state.rooms = state.rooms.filter((r) => r.id !== room.id);
        persist("Room removed.");
      });
      tools.append(up, down, remove);
      row.append(nameField, idField, descField, count, tools);
      card.append(row);
    });

    const addRow = el("div", "st-row st-room");
    addRow.style.gridTemplateColumns = "1.2fr 1fr 1.6fr 44px auto";
    const newName = el("input");
    newName.type = "text";
    newName.placeholder = "New room name";
    newName.maxLength = 40;
    const newId = el("input");
    newId.type = "text";
    newId.placeholder = "new-room-id";
    newId.maxLength = 40;
    const spacer = el("span", "st-note", "Lowercase letters, digits, - and _");
    const add = el("button", "st-btn", "Add room");
    add.dataset.variant = "ghost";
    add.addEventListener("click", () => {
      const id = newId.value.trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,40}$/.test(id)) return say("Room id may use a-z, 0-9, - and _ (max 40).", "error");
      if (state.rooms.some((r) => r.id === id)) return say("That room id already exists.", "error");
      state.rooms.push({ id, name: newName.value.trim() || id, description: "", agents: 0, declared: true });
      persist("Room added.");
      newName.value = "";
      newId.value = "";
    });
    const nameField = el("label", "st-field");
    nameField.append(newName);
    const idField = el("label", "st-field");
    idField.append(newId);
    addRow.append(nameField, idField, spacer, add);
    card.append(addRow);
    return card;
  }

  async function persist(doneText) {
    const general = state.currentGeneral;
    if (!general) return;
    say("Saving…");
    const before = state.agents.map((a) => a.id).join() + "|" + state.rooms.map((r) => r.id).join();
    try {
      const data = await api("/api/settings", {
        user: general.userField.input.value,
        brand: general.brandField.input.value,
        greeting: general.greetingField.input.value,
        note: general.noteField.input.value,
        show_token_summary: general.tokensField.input.checked,
        show_sessions: general.sessionsField.input.checked,
        rooms: state.rooms.map((r) => ({ id: r.id, name: r.name, description: r.description,
                                          color: r.color || "" })),
        agents: state.agents.map((a) => ({ id: a.id, name: a.name, room: a.room, model: a.model, lean: a.lean })),
      });
      const after = data.agents.map((a) => a.id).join() + "|" + data.rooms.map((r) => r.id).join();
      state.data = data;
      state.rooms = data.rooms.map((r) => ({ ...r }));
      state.agents = data.agents.map((a) => ({ ...a }));
      draw();
      say(doneText || ("Saved to " + (data.config_file || "agents.json") + "."), "ok");
      if (before !== after) setTimeout(() => location.reload(), 1100);
    } catch (err) {
      say(err.message, "error");
    }
  }

  function draw() {
    const general = generalCard();
    state.currentGeneral = general;
    wrap.replaceChildren(general, agentsCard(), roomsCard(), projectsCard());

    const actions = el("div", "st-actions");
    const save = el("button", "st-btn", "Save");
    save.addEventListener("click", () => persist());
    const reload = el("button", "st-btn", "Reload");
    reload.dataset.variant = "ghost";
    reload.addEventListener("click", () => load());
    actions.append(save, reload, note);
    wrap.append(actions);
  }

  load();
}
