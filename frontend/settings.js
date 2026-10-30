// Settings panel: greeting/brand, per-agent name/room/model/lean, room order, names and colours.
// Self-contained on purpose (own styles, own markup) so it can be dropped into any tab container.
// cwd and tool permissions are intentionally not editable here: they are the security boundary.

const CSS = `
.st-wrap{max-width:1040px;padding:2px 2px 84px;color:var(--ink);container-type:inline-size;container-name:st}
.st-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:0 0 22px}
.st-hero h2{margin:0;font-family:"Space Grotesk",sans-serif;font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1.05}
.st-hero p{margin:7px 0 0;font-size:13px;line-height:1.5;color:var(--muted);max-width:48ch}
.st-layout{display:grid;grid-template-columns:176px minmax(0,1fr);gap:28px;align-items:start}
.st-nav{position:sticky;top:0;display:flex;flex-direction:column;gap:2px;padding:2px 0}
.st-nav a{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:9px;font-size:13px;font-weight:500;
          color:var(--muted);text-decoration:none;transition:background .15s,color .15s}
.st-nav a:hover{background:var(--surface-hover);color:var(--ink)}
.st-nav svg{width:15px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.st-sec{margin:0 0 26px;scroll-margin-top:8px}
.st-sec:last-child{margin-bottom:0}
.st-sec-head{margin:0 0 10px}
.st-sec-head h3{margin:0;font-family:"Space Grotesk",sans-serif;font-size:16px;font-weight:700;letter-spacing:-.015em}
.st-sec-head p{margin:3px 0 0;font-size:12.5px;line-height:1.5;color:var(--muted);max-width:66ch}
.st-panel{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px}
.st-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.st-field{display:grid;gap:6px;font-size:12px;color:var(--muted);min-width:0}
.st-field>span{font-weight:500;letter-spacing:.005em}
.st-field input[type=text],.st-field select{width:100%;box-sizing:border-box;height:38px;padding:0 11px;border-radius:10px;
  border:1px solid var(--line);background:var(--paper-soft);color:var(--ink);font:inherit;font-size:13px;
  transition:border-color .15s,box-shadow .15s,background .15s}
.st-field input[type=text]:hover,.st-field select:hover{background:var(--surface-hover)}
.st-field input[type=text]:focus,.st-field select:focus{outline:none;border-color:var(--coral);
  box-shadow:0 0 0 3px rgba(var(--coral-rgb),.14);background:var(--paper)}
.st-field input:disabled{color:var(--muted-2);background:var(--paper-deep);cursor:not-allowed}
.st-field input::placeholder{color:var(--muted-2)}
.st-check{display:flex;align-items:center;gap:10px;min-height:38px;font-size:13px;color:var(--ink-2)}
.st-check input{width:16px;height:16px;flex:none;accent-color:var(--coral)}
.st-switch{display:flex;align-items:center;gap:9px;height:38px;font-size:12px;color:var(--muted);cursor:pointer}
.st-switch input{appearance:none;-webkit-appearance:none;width:34px;height:20px;flex:none;border-radius:99px;
  background:var(--paper-deep);position:relative;cursor:pointer;transition:background .18s}
.st-switch input::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;
  background:var(--paper);box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .18s,background .18s}
.st-switch input:checked{background:var(--coral)}
.st-switch input:checked::after{transform:translateX(14px)}
.st-switch input:focus-visible{outline:2px solid rgba(var(--coral-rgb),.55);outline-offset:2px}
.st-general{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(210px,.9fr);gap:20px}
.st-appearance{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.st-appearance-note{font-size:12px;line-height:1.5;color:var(--muted);max-width:46ch}
.st-segmented{display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:var(--paper-deep);border:1px solid var(--line)}
.st-segmented button{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border:0;border-radius:8px;
  background:transparent;color:var(--muted);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;
  transition:background .15s,color .15s,box-shadow .15s}
.st-segmented button:hover{color:var(--ink)}
.st-segmented button[aria-pressed=true]{background:var(--paper);color:var(--ink);font-weight:600;box-shadow:var(--shadow-1)}
.st-segmented svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.st-preview-label{margin:0 0 8px;font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2)}
.st-preview-card{border:1px solid var(--line-soft);background:var(--paper-soft);border-radius:14px;padding:16px 17px;
  box-shadow:var(--shadow-1)}
.st-preview-card .date{font-size:11px;font-weight:500;color:var(--muted)}
.st-preview-card strong{display:block;margin:4px 0 7px;font-family:"Space Grotesk",sans-serif;font-size:20px;
  font-weight:700;letter-spacing:-.025em;line-height:1.15}
.st-preview-card p{margin:0;font-size:12.5px;line-height:1.5;color:var(--ink-2)}
.st-preview-card .brand-line{display:flex;align-items:center;gap:7px;margin-bottom:12px;font-size:11px;
  font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-2)}
.st-preview-dot{width:16px;height:16px;border-radius:5px;background:var(--coral);flex:none}
.st-agents{display:flex;flex-direction:column}
.st-agent{display:grid;grid-template-columns:minmax(130px,170px) minmax(0,1fr);gap:16px;padding:16px 0;
  border-top:1px solid var(--line-soft)}
.st-agent:first-child{border-top:0;padding-top:2px}
.st-agent-id{display:flex;align-items:flex-start;gap:10px;min-width:0}
.st-agent-dot{width:10px;height:10px;margin-top:5px;border-radius:50%;flex:none;
  box-shadow:inset 0 0 0 1px rgba(var(--ink-rgb),.22)}
.st-agent-id strong{display:block;font-size:13.5px;font-weight:600;letter-spacing:-.01em;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.st-agent-id small{display:block;margin-top:2px;font-size:11.5px;color:var(--muted-2);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.st-agent-fields{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.st-agent-fields .st-field{flex:1 1 130px;min-width:0}
.st-agent-fields .st-field.st-model{flex:2 1 240px}
.st-agent-fields .st-field.st-runtime{flex:0 1 165px}
.st-agent-fields .st-field.st-lean{flex:0 0 auto}
.st-agent-fields .st-field.st-budget{flex:0 1 120px}
.st-rooms{display:flex;flex-direction:column}
.st-room{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;align-items:start;padding:15px 0;
  border-top:1px solid var(--line-soft)}
.st-room:first-child{border-top:0;padding-top:2px}
.st-color{width:38px;height:38px;margin-top:18px;padding:3px;border-radius:10px;border:1px solid var(--line);
  background:var(--paper-soft);cursor:pointer;flex:none}
.st-color::-webkit-color-swatch-wrapper{padding:0}
.st-color::-webkit-color-swatch{border:0;border-radius:6px}
.st-color::-moz-color-swatch{border:0;border-radius:6px}
.st-room-body{display:grid;gap:8px;min-width:0}
.st-room-line{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;min-width:0}
.st-room-line .st-field{flex:1 1 170px;min-width:0}
.st-room-line .st-field.st-id{flex:0 1 104px}
.st-room-line .st-field.st-desc{flex:1 1 150px}
.st-room-count{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:24px;padding:0 7px;
  margin-bottom:7px;border-radius:7px;background:var(--paper-deep);color:var(--muted);font-size:11px;
  font-weight:600;font-variant-numeric:tabular-nums;flex:none}
.st-room-tools{display:flex;gap:2px;align-items:center;margin-top:18px;flex:none}
.st-iconbtn{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;border:1px solid transparent;
  background:transparent;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
.st-iconbtn:hover{background:var(--surface-hover);color:var(--ink)}
.st-iconbtn:disabled{opacity:.28;cursor:not-allowed}
.st-iconbtn svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.st-addrow{margin-top:10px;padding-top:14px;border-top:1px dashed var(--line);display:flex;flex-wrap:wrap;gap:10px;
  align-items:flex-end}
.st-addrow .st-field{flex:1 1 160px}
.st-addrow .st-field.st-id{flex:0 1 120px}
.st-addrow .st-hintline{flex:1 1 100%;font-size:11.5px;color:var(--muted-2)}
.st-new{margin-top:14px;padding:14px;border:1px dashed var(--line);border-radius:12px;background:var(--paper-soft);
  display:grid;gap:10px}
.st-new h4{margin:0;font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2)}
.st-new .st-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.st-projects{display:grid;gap:6px;margin-top:14px;max-height:270px;overflow:auto;padding-right:2px}
.st-project{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:9px 11px;border-radius:10px;
  border:1px solid var(--line-soft);background:var(--paper-soft);align-items:center}
.st-project-name{font-size:12.5px;font-weight:600;letter-spacing:-.005em}
.st-project-path{grid-column:1/-1;font-size:10.5px;color:var(--muted-2);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-badge{font-size:10px;font-weight:600;padding:1px 7px;border-radius:999px;background:var(--paper-deep);
  color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.st-projects-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px}
.st-projects-head span{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2)}
.st-note{font-size:12px;line-height:1.45;color:var(--muted)}
.st-note[data-tone=ok]{color:var(--green)}
.st-note[data-tone=error]{color:var(--red)}
.st-savebar{position:sticky;bottom:0;z-index:3;display:none;align-items:center;justify-content:flex-end;gap:10px;margin:0 -26px;
  padding:13px 26px 11px;background:var(--page-surface);border-top:1px solid var(--line);
  box-shadow:0 -18px 34px -30px rgba(var(--shadow-rgb),.55)}
.st-wrap.is-dirty .st-savebar,.st-wrap.is-saved .st-savebar{display:flex}
.st-savebar .st-note{flex:1;min-width:0}
.st-btn{height:38px;padding:0 16px;border:0;border-radius:10px;background:var(--coral);color:var(--paper);
  font:inherit;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;
  transition:background .15s,transform .15s,opacity .15s}
.st-btn:hover{background:var(--primary-hover)}
.st-btn:active{transform:scale(.98)}
.st-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.st-btn[data-variant=ghost]{background:transparent;border:1px solid var(--line);color:var(--ink-2);font-weight:500}
.st-btn[data-variant=ghost]:hover{background:var(--surface-hover)}
.st-dirty{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;
  background:var(--paper-deep);color:var(--muted);font-size:11px;font-weight:600;white-space:nowrap}
.st-dirty::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.7}
.st-dirty[data-dirty=true]{background:var(--coral-soft);color:var(--coral-dark)}
.st-loading{padding:34px 4px;font-size:13px;color:var(--muted)}
@container st (max-width:900px){
  .st-layout{grid-template-columns:1fr;gap:16px}
  .st-nav{position:static;flex-direction:row;gap:4px;overflow-x:auto;padding:0 0 4px;
    border-bottom:1px solid var(--line-soft);scrollbar-width:none}
  .st-nav::-webkit-scrollbar{display:none}
  .st-nav a{white-space:nowrap;padding:7px 10px}
  .st-general{grid-template-columns:1fr}
  .st-preview{order:-1}
}
@container st (max-width:780px){
  .st-hero{flex-direction:column;align-items:flex-start;gap:10px}
  .st-hero h2{font-size:26px}
  .st-panel{padding:14px}
  .st-savebar{flex-wrap:wrap}
  .st-savebar .st-note{flex:1 0 100%;order:3}
}
@media (max-width:900px){
  .st-savebar{margin-left:-16px;margin-right:-16px;padding-left:16px;padding-right:16px}
}
@container st (max-width:640px){
  .st-projects{max-height:none;overflow:visible}
  .st-agent{grid-template-columns:1fr;gap:10px}
  .st-agent-id strong,.st-agent-id small{white-space:normal}
  .st-agent-fields .st-field.st-model{flex:1 1 100%}
}
.st-health-sum{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 12px}
.st-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:99px;font-size:12px;font-weight:600;
  background:var(--paper-soft);border:1px solid var(--line);color:var(--ink-2)}
.st-chip i{width:8px;height:8px;border-radius:50%;background:var(--dot,#999)}
.st-chip[data-l=ok]{--dot:#3f9a62}.st-chip[data-l=warn]{--dot:#d9a13a}.st-chip[data-l=fail]{--dot:#e0523a}
.st-checks{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.st-check-row{display:grid;grid-template-columns:12px minmax(0,1fr);gap:11px;align-items:start;padding:10px 12px;border-radius:12px;
  background:var(--paper-soft);border:1px solid var(--line)}
.st-check-row>i{width:9px;height:9px;margin-top:5px;border-radius:50%;background:var(--dot,#999)}
.st-check-row[data-l=ok]{--dot:#3f9a62}.st-check-row[data-l=warn]{--dot:#d9a13a}.st-check-row[data-l=fail]{--dot:#e0523a}
.st-check-row[data-l=fail]{border-color:rgba(224,82,58,.45)}
.st-check-row b{display:block;font-size:13px;font-weight:600;color:var(--ink)}
.st-check-row small{display:block;margin-top:2px;font-size:12px;line-height:1.45;color:var(--muted);overflow-wrap:anywhere}
`;

const I = {
  general: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  agents: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7" r="3"/><path d="M21 20v-1.5a4 4 0 0 0-3-3.87M16.5 4.13A3 3 0 0 1 16.5 10"/></svg>',
  rooms: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  health: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.5-6 4 12 2.5-6H21"/></svg>',
  projects: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.4A8.2 8.2 0 0 1 9.6 4 8.5 8.5 0 1 0 20 14.4Z"/></svg>',
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Keep the Appearance control in step when the topbar toggle changes the theme.
if (typeof window !== "undefined" && !window.__officeThemeChoiceSync) {
  window.__officeThemeChoiceSync = true;
  window.addEventListener("myoffice:theme", (event) => {
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === event.detail));
    });
  });
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

function iconButton(name, title) {
  const b = el("button", "st-iconbtn");
  b.type = "button";
  b.title = title;
  b.setAttribute("aria-label", title);
  b.innerHTML = I[name];
  return b;
}

function greetingFor(hour) {
  if (hour < 6) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function renderSettings(root) {
  let style = document.getElementById("settingsStyle");
  if (!style) {
    style = el("style");
    style.id = "settingsStyle";
    document.head.append(style);
  }
  style.textContent = CSS;

  const wrap = el("div", "st-wrap");
  root.replaceChildren(wrap);

  const state = { data: null, rooms: [], agents: [], currentGeneral: null, dirty: false, note: null, dirtyPill: null };

  function say(text, tone) {
    if (!state.note) return;
    state.note.textContent = text;
    state.note.dataset.tone = tone || "";
    if (text) {
      wrap.classList.add("is-saved");
      clearTimeout(state.noteTimer);
      state.noteTimer = setTimeout(() => {
        if (!state.dirty) wrap.classList.remove("is-saved");
      }, tone === "error" ? 6000 : 2200);
    }
  }

  function setDirty(dirty) {
    state.dirty = Boolean(dirty);
    wrap.classList.toggle("is-dirty", state.dirty);
    if (state.dirtyPill) {
      state.dirtyPill.dataset.dirty = String(state.dirty);
      state.dirtyPill.textContent = state.dirty ? "Unsaved changes" : "All changes saved";
    }
  }

  async function load() {
    wrap.replaceChildren(el("p", "st-loading", "Loading settings…"));
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
    input.setAttribute("aria-label", labelText);
    field.append(input);
    field.input = input;
    return field;
  }

  function checkField(labelText, checked) {
    const field = el("label", "st-check");
    const box = el("input");
    box.type = "checkbox";
    box.checked = Boolean(checked);
    box.setAttribute("aria-label", labelText);
    field.append(box, el("span", null, labelText));
    field.input = box;
    return field;
  }

  function roomColor(agent) {
    const room = state.rooms.find((r) => r.id === agent.room);
    return room?.color || "#9a9a94";
  }

  function generalSection() {
    const section = el("section", "st-sec");
    section.id = "st-general";
    const head = el("div", "st-sec-head");
    head.append(el("h3", null, "General"), el("p", null, "Brand, greeting and which summaries the welcome card shows."));
    const panel = el("div", "st-panel");
    const layout = el("div", "st-general");
    const fields = el("div");
    const settings = state.data.settings;

    const grid1 = el("div", "st-grid");
    const user = textField("Your name", settings.user, 40, "Your name");
    const brand = textField("Brand", settings.brand, 40, "MyOffice");
    grid1.append(user, brand);

    const grid2 = el("div", "st-grid");
    grid2.style.marginTop = "14px";
    const greeting = textField("Greeting", settings.greeting, 80, "Automatic by time of day");
    const note = textField("Line under the summary", settings.note, 200, "Nothing needs you right now.");
    grid2.append(greeting, note);

    const grid3 = el("div", "st-grid");
    grid3.style.marginTop = "14px";
    const tokens = checkField("Show today's token total", settings.show_token_summary);
    const sessions = checkField("Mention my open terminal sessions", settings.show_sessions);
    grid3.append(tokens, sessions);

    const grid4 = el("div", "st-grid");
    grid4.style.marginTop = "14px";
    const cap = textField("Daily AI limit for the office (tokens, 0 = no limit)", String(settings.daily_token_cap ?? 2000000), 10, "2000000");
    cap.input.inputMode = "numeric";
    cap.append(el("small", null, "New work is refused once the office has used this many fresh tokens today. Your own terminal sessions do not count."));
    grid4.append(cap);

    fields.append(grid1, grid2, grid3, grid4);

    const preview = el("aside", "st-preview");
    preview.append(el("p", "st-preview-label", "Welcome card"));
    const card = el("div", "st-preview-card");
    const brandLine = el("div", "brand-line");
    brandLine.append(el("span", "st-preview-dot"), el("span", null, settings.brand || "MyOffice"));
    const date = el("div", "date",
      new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
    const title = el("strong");
    const line = el("p");
    card.append(brandLine, date, title, line);
    preview.append(card);

    const sync = () => {
      const who = user.input.value.trim();
      const hour = new Date().getHours();
      title.textContent = `${greeting.input.value.trim() || greetingFor(hour)}${who ? ", " + who : ""}.`;
      line.textContent = note.input.value.trim() || "Nothing needs you right now.";
      brandLine.lastChild.textContent = brand.input.value.trim() || "MyOffice";
    };
    [user.input, brand.input, greeting.input, note.input].forEach((input) => input.addEventListener("input", sync));
    sync();

    layout.append(fields, preview);
    panel.append(layout);
    section.append(head, panel);

    section.userField = user;
    section.brandField = brand;
    section.greetingField = greeting;
    section.noteField = note;
    section.capField = cap;
    section.tokensField = tokens;
    section.sessionsField = sessions;
    return section;
  }

  function appearanceSection() {
    const section = el("section", "st-sec");
    section.id = "st-appearance";
    const head = el("div", "st-sec-head");
    head.append(el("h3", null, "Appearance"),
      el("p", null, "The theme this browser uses. It is remembered on this device, not written to agents.json."));
    const panel = el("div", "st-panel");
    const row = el("div", "st-appearance");
    row.append(el("span", "st-appearance-note",
      "Dark keeps the room colours but lowers the light so long sessions stay easy on the eyes."));
    const seg = el("div", "st-segmented");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Theme");
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    for (const [value, label] of [["light", "Light"], ["dark", "Dark"]]) {
      const button = el("button");
      button.type = "button";
      button.dataset.themeChoice = value;
      button.setAttribute("aria-pressed", String(value === current));
      button.innerHTML = I[value];
      button.append(el("span", null, label));
      button.addEventListener("click", () => {
        document.documentElement.dataset.theme = value;
        try { localStorage.setItem("myoffice-theme", value); } catch (e) {}
        window.dispatchEvent(new CustomEvent("myoffice:theme", { detail: value }));
        document.querySelectorAll("[data-theme-choice]").forEach((b) =>
          b.setAttribute("aria-pressed", String(b.dataset.themeChoice === value)));
      });
      seg.append(button);
    }
    row.append(seg);
    panel.append(row);
    section.append(head, panel);
    return section;
  }

  function agentsSection() {
    const section = el("section", "st-sec");
    section.id = "st-agents";
    const head = el("div", "st-sec-head");
    head.append(el("h3", null, "Agents"),
      el("p", null, "Name, room, model and lean mode. cwd and tool permissions stay in agents.json on purpose."));
    const panel = el("div", "st-panel");
    const list = el("div", "st-agents");

    for (const agent of state.agents) {
      const row = el("div", "st-agent");

      const identity = el("div", "st-agent-id");
      const dot = el("span", "st-agent-dot");
      dot.style.background = roomColor(agent);
      const idText = el("div");
      const strong = el("strong", null, agent.name || agent.id);
      const sub = el("small", null, `${agent.id}${agent.installed ? "" : " · folder missing"}`);
      idText.append(strong, sub);
      identity.append(dot, idText);

      const fields = el("div", "st-agent-fields");
      const name = el("input");
      name.type = "text";
      name.maxLength = 40;
      name.value = agent.name || "";
      name.setAttribute("aria-label", "Name");
      name.addEventListener("input", () => {
        agent.name = name.value;
        strong.textContent = name.value || agent.id;
      });
      const nameField = el("label", "st-field");
      nameField.append(el("span", null, "Name"), name);

      const room = el("select");
      for (const r of state.rooms) {
        const option = el("option", null, r.name);
        option.value = r.id;
        room.append(option);
      }
      if (!state.rooms.some((r) => r.id === "ceo")) {
        const ceo = el("option", null, "CEO desk");
        ceo.value = "ceo";
        room.append(ceo);
      }
      room.value = agent.room;
      room.setAttribute("aria-label", "Room");
      room.addEventListener("change", () => {
        agent.room = room.value;
        dot.style.background = roomColor(agent);
      });
      const roomField = el("label", "st-field");
      roomField.append(el("span", null, "Room"), room);

      const model = el("input");
      model.type = "text";
      model.setAttribute("list", "settingsModels");
      model.maxLength = 60;
      model.value = agent.model || "";
      model.title = model.value;
      model.setAttribute("aria-label", "Model");
      model.addEventListener("input", () => {
        agent.model = model.value.trim();
        model.title = model.value;
      });
      const modelField = el("label", "st-field st-model");
      modelField.append(el("span", null, "Model"), model);

      const runtime = el("select");
      for (const [value, label] of [["claude", "Claude Code"], ["opencode", "OpenCode"]]) {
        const option = el("option", null, label);
        option.value = value;
        runtime.append(option);
      }
      runtime.value = agent.runtime || "claude";
      runtime.setAttribute("aria-label", "Runtime");
      runtime.addEventListener("change", () => { agent.runtime = runtime.value; });
      const runtimeField = el("label", "st-field st-runtime");
      runtimeField.append(el("span", null, "Runtime"), runtime);

      const lean = el("input");
      lean.type = "checkbox";
      lean.checked = Boolean(agent.lean);
      lean.setAttribute("aria-label", "Lean mode");
      lean.addEventListener("change", () => { agent.lean = lean.checked; });
      const leanField = el("label", "st-switch st-lean");
      leanField.append(lean, el("span", null, "Lean"));

      const budget = el("input");
      budget.type = "number";
      budget.min = "0";
      budget.step = "10000";
      budget.placeholder = "no limit";
      budget.value = agent.daily_token_budget ? String(agent.daily_token_budget) : "";
      budget.setAttribute("aria-label", "Daily token limit (empty = none)");
      budget.title = "Most fresh tokens this agent may use per day. Empty means no limit of its own; the office-wide cap still applies.";
      budget.addEventListener("input", () => {
        const n = Number.parseInt(budget.value, 10);
        agent.daily_token_budget = Number.isNaN(n) ? 0 : Math.max(0, n);
      });
      const budgetField = el("label", "st-field st-budget");
      budgetField.append(el("span", null, "Daily limit"), budget);

      fields.append(nameField, roomField, modelField, runtimeField, budgetField, leanField);
      row.append(identity, fields);
      list.append(row);
    }

    const datalist = el("datalist");
    datalist.id = "settingsModels";
    for (const m of state.data.models) {
      const option = el("option");
      option.value = m;
      datalist.append(option);
    }
    panel.append(list, newAgentBox(), datalist);
    section.append(head, panel);
    return section;
  }

  function newAgentBox() {
    const box = el("div", "st-new");
    box.append(el("h4", null, "Add an agent"));

    const id = el("input");
    id.type = "text";
    id.placeholder = "agent-id";
    id.maxLength = 40;
    id.setAttribute("aria-label", "Agent id");
    const name = el("input");
    name.type = "text";
    name.placeholder = "Name";
    name.maxLength = 40;
    name.setAttribute("aria-label", "Agent name");
    const cwd = el("input");
    cwd.type = "text";
    cwd.placeholder = "~/Projeler/your-project";
    cwd.maxLength = 300;
    cwd.setAttribute("aria-label", "Agent folder");
    const model = el("input");
    model.type = "text";
    model.maxLength = 80;
    model.value = "sonnet";
    model.setAttribute("list", "settingsModels");
    model.setAttribute("aria-label", "Agent model");

    const room = el("select");
    for (const r of state.rooms) {
      const option = el("option", null, r.name);
      option.value = r.id;
      room.append(option);
    }
    const general = el("option", null, "General");
    general.value = "general";
    room.append(general);
    room.setAttribute("aria-label", "Agent room");

    const profile = el("select");
    profile.setAttribute("aria-label", "Agent tool permissions");
    for (const p of (state.data.profiles || ["read", "review", "build", "research"])) {
      const option = el("option", null, `${p} permissions`);
      option.value = p;
      profile.append(option);
    }

    const runtime = el("select");
    runtime.setAttribute("aria-label", "Agent runtime");
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
    add.type = "button";
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

  function healthSection() {
    const section = el("section", "st-sec");
    section.id = "st-health";
    const head = el("div", "st-sec-head");
    head.append(el("h3", null, "Health"),
      el("p", null, "A read-only self-check: config, runtimes, tool boundaries, folders and memory notes. Nothing here changes anything."));
    const panel = el("div", "st-panel");
    const summary = el("div", "st-health-sum");
    const list = el("ul", "st-checks");
    const refresh = el("button", "st-btn", "Run checks");
    refresh.type = "button";
    refresh.dataset.variant = "ghost";
    async function run() {
      refresh.disabled = true;
      list.replaceChildren(el("li", "st-check-row", "Checking…"));
      try {
        const data = await api("/api/health");
        const order = { fail: 0, warn: 1, ok: 2 };
        summary.replaceChildren(...["fail", "warn", "ok"].map((level) => {
          const chip = el("span", "st-chip");
          chip.dataset.l = level;
          chip.append(el("i"), document.createTextNode(`${data.summary[level] || 0} ${level === "ok" ? "passing" : level === "warn" ? "warnings" : "failing"}`));
          return chip;
        }), refresh);
        list.replaceChildren(...data.checks.slice().sort((a, b) => order[a.level] - order[b.level]).map((check) => {
          const row = el("li", "st-check-row");
          row.dataset.l = check.level;
          const text = el("div");
          text.append(el("b", null, check.title));
          if (check.detail) text.append(el("small", null, check.detail));
          row.append(el("i"), text);
          return row;
        }));
      } catch (err) {
        list.replaceChildren(el("li", "st-check-row", "Could not run the checks: " + err.message));
      }
      refresh.disabled = false;
    }
    refresh.addEventListener("click", run);
    summary.append(refresh);
    panel.append(summary, list);
    section.append(head, panel);
    run();
    return section;
  }

  function projectsSection() {
    const section = el("section", "st-sec");
    section.id = "st-projects";
    const head = el("div", "st-sec-head");
    head.append(el("h3", null, "Projects"),
      el("p", null, "Tasks can run inside any folder under this root. Pick the folder per task in the agent panel."));
    const panel = el("div", "st-panel");
    const row = el("div");
    row.style.display = "flex";
    row.style.gap = "10px";
    row.style.alignItems = "flex-end";
    row.style.flexWrap = "wrap";
    const root = textField("Projects root", state.data.projects_root, 300, "~/Projeler");
    root.style.flex = "1 1 260px";
    const save = el("button", "st-btn", "Save root");
    save.type = "button";
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
    panel.append(row);

    const list = el("div", "st-projects");
    list.append(el("p", "st-note", "Loading…"));
    panel.append(list);
    api("/api/projects").then((data) => {
      list.replaceChildren();
      if (!data.projects.length) {
        list.append(el("p", "st-note", "No folders found under this root."));
        return;
      }
      const count = el("span", null, `${data.projects.length} folders`);
      const headRow = el("div", "st-projects-head");
      headRow.append(el("span", null, "Under this root"), count);
      list.before(headRow);
      for (const p of data.projects) {
        const item = el("div", "st-project");
        item.append(el("span", "st-project-name", p.name));
        if (p.git) item.append(el("span", "st-badge", "git"));
        item.append(el("span", "st-project-path", p.path));
        list.append(item);
      }
    }).catch(() => list.replaceChildren(el("p", "st-note", "Projects could not be listed.")));
    section.append(head, panel);
    return section;
  }

  function roomsSection() {
    const section = el("section", "st-sec");
    section.id = "st-rooms";
    const head = el("div", "st-sec-head");
    head.append(el("h3", null, "Rooms"),
      el("p", null, "Order here is the order on the scene, and colours repaint after a refresh. " +
        "A room with agents cannot be removed; move them first. Room ids are permanent."));
    const panel = el("div", "st-panel");
    const list = el("div", "st-rooms");

    state.rooms.forEach((room, index) => {
      const row = el("div", "st-room");

      const color = el("input", "st-color");
      color.type = "color";
      color.value = /^#[0-9a-f]{6}$/i.test(room.color || "") ? room.color : "#8a8a84";
      color.title = "Room colour on the scene";
      color.setAttribute("aria-label", `${room.name || room.id} colour`);
      color.addEventListener("input", () => { room.color = color.value; });

      const name = el("input");
      name.type = "text";
      name.maxLength = 40;
      name.value = room.name || "";
      name.setAttribute("aria-label", "Room name");
      name.addEventListener("input", () => { room.name = name.value; });
      const nameField = el("label", "st-field");
      nameField.append(el("span", null, "Name"), name);

      const id = el("input");
      id.type = "text";
      id.value = room.id;
      id.disabled = true;
      id.setAttribute("aria-label", "Room id");
      const idField = el("label", "st-field st-id");
      idField.append(el("span", null, "Id"), id);

      const description = el("input");
      description.type = "text";
      description.maxLength = 200;
      description.value = room.description || "";
      description.setAttribute("aria-label", "Room description");
      description.addEventListener("input", () => { room.description = description.value; });
      const descField = el("label", "st-field st-desc");
      descField.append(el("span", null, "Description"), description);

      const count = el("span", "st-room-count", String(room.agents));
      count.title = `${room.agents} agent${room.agents === 1 ? "" : "s"} in this room`;

      const tools = el("div", "st-room-tools");
      const up = iconButton("up", "Move up");
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        const items = state.rooms;
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
        draw();
        persist("Room order saved.");
      });
      const down = iconButton("down", "Move down");
      down.disabled = index === state.rooms.length - 1;
      down.addEventListener("click", () => {
        const items = state.rooms;
        [items[index + 1], items[index]] = [items[index], items[index + 1]];
        draw();
        persist("Room order saved.");
      });
      const remove = iconButton("trash", room.agents ? "Move its agents to another room first" : "Remove room");
      remove.disabled = room.agents > 0;
      remove.addEventListener("click", () => {
        state.rooms = state.rooms.filter((r) => r.id !== room.id);
        draw();
        persist("Room removed.");
      });
      tools.append(up, down, remove);

      const body = el("div", "st-room-body");
      const topLine = el("div", "st-room-line");
      topLine.append(nameField, count);
      const bottomLine = el("div", "st-room-line");
      bottomLine.append(idField, descField);
      body.append(topLine, bottomLine);
      row.append(color, body, tools);
      list.append(row);
    });

    const addRow = el("div", "st-addrow");
    const newName = el("input");
    newName.type = "text";
    newName.placeholder = "New room name";
    newName.maxLength = 40;
    newName.setAttribute("aria-label", "New room name");
    const newId = el("input");
    newId.type = "text";
    newId.placeholder = "new-room-id";
    newId.maxLength = 40;
    newId.setAttribute("aria-label", "New room id");
    const add = el("button", "st-btn", "Add room");
    add.type = "button";
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
    nameField.append(el("span", null, "New room"), newName);
    const idField = el("label", "st-field st-id");
    idField.append(el("span", null, "Id"), newId);
    addRow.append(nameField, idField, add,
      el("span", "st-hintline", "Lowercase letters, digits, - and _ · the colour is picked after the room is added."));
    panel.append(list, addRow);
    section.append(head, panel);
    return section;
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
        daily_token_cap: Number.isNaN(Number.parseInt(general.capField.input.value, 10)) ? 2000000 : Math.max(0, Number.parseInt(general.capField.input.value, 10)),
        rooms: state.rooms.map((r) => ({ id: r.id, name: r.name, description: r.description,
                                          color: r.color || "" })),
        agents: state.agents.map((a) => ({ id: a.id, name: a.name, room: a.room, model: a.model, lean: a.lean, daily_token_budget: Number(a.daily_token_budget) || 0 })),
      });
      const after = data.agents.map((a) => a.id).join() + "|" + data.rooms.map((r) => r.id).join();
      state.data = data;
      state.rooms = data.rooms.map((r) => ({ ...r }));
      state.agents = data.agents.map((a) => ({ ...a }));
      draw();
      say(doneText || ("Saved to " + (data.config_file || "agents.json") + "."), "ok");
      wrap.classList.add("is-saved");
      setTimeout(() => wrap.classList.remove("is-saved"), 1800);
      if (before !== after) setTimeout(() => location.reload(), 1100);
    } catch (err) {
      say(err.message, "error");
    }
  }

  function draw() {
    const hero = el("header", "st-hero");
    const heroText = el("div");
    heroText.append(el("h2", null, "Settings"),
      el("p", null, "Shape the office: the welcome card, the people in it, the rooms on the floor and the folders they can reach."));
    const dirty = el("span", "st-dirty");
    dirty.dataset.dirty = "false";
    dirty.textContent = "All changes saved";
    state.dirtyPill = dirty;
    hero.append(heroText, dirty);

    const layout = el("div", "st-layout");
    const nav = el("nav", "st-nav");
    for (const [id, label, icon] of [
      ["st-general", "General", "general"],
      ["st-appearance", "Appearance", "light"],
      ["st-agents", "Agents", "agents"],
      ["st-rooms", "Rooms", "rooms"],
      ["st-projects", "Projects", "projects"],
      ["st-health", "Health", "health"],
    ]) {
      const link = el("a");
      link.href = `#${id}`;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      link.innerHTML = I[icon];
      link.append(el("span", null, label));
      nav.append(link);
    }

    const content = el("div", "st-content");
    const general = generalSection();
    state.currentGeneral = general;
    content.append(general, appearanceSection(), agentsSection(), roomsSection(), projectsSection(), healthSection());

    const savebar = el("div", "st-savebar");
    const save = el("button", "st-btn", "Save changes");
    save.type = "button";
    save.addEventListener("click", () => persist());
    const reload = el("button", "st-btn", "Reload");
    reload.type = "button";
    reload.dataset.variant = "ghost";
    reload.addEventListener("click", () => load());
    const note = el("span", "st-note", "");
    state.note = note;
    savebar.append(note, save, reload);

    layout.append(nav, content);
    wrap.replaceChildren(hero, layout, savebar);
    setDirty(false);
  }

  wrap.addEventListener("input", () => setDirty(true));
  wrap.addEventListener("change", () => setDirty(true));

  load();
}
