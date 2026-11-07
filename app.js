// Logo Showdown page: renders the live state the server streams and sends each action back.

const $ = s => document.querySelector(s);
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k in n && typeof v !== "string") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

const REACTIONS = [
  { key: "love", emoji: "😍", label: "Love it" },
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "hmm", emoji: "🤔", label: "Hmm" },
  { key: "yikes", emoji: "😬", label: "Yikes" },
];
const EMOJI_OF = Object.fromEntries(REACTIONS.map(r => [r.key, r.emoji]));
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Random Aussie and British names ----------
const TITLES = ["Sir", "Dame", "Lord", "Lady", "Uncle", "Auntie", "Captain", "Professor"];
const FIRSTS = ["Bazza", "Shazza", "Davo", "Gazza", "Wazza", "Kev", "Bev", "Trev", "Dazza", "Sheila", "Bruce", "Kylie", "Smithy", "Barry",
  "Robbo", "Jonno", "Macca", "Shirl", "Nigel", "Clive", "Mavis", "Gladys", "Reginald", "Agatha", "Percy", "Rupert", "Ethel", "Dougal",
  "Hamish", "Pip", "Tabitha", "Cuthbert", "Prudence", "Noreen", "Muriel", "Winifred", "Algernon", "Bertie", "Dot", "Fenella"];
const SURNAMES = ["Lamington", "Crumpet", "Vegemite", "Pavlova", "Wallaby", "Bickerstaff", "Snodgrass", "Fairdinkum", "Teacake", "Scone",
  "Galah", "Kettleworth", "Biscuit", "Marmite", "Bunyip", "Flannelette", "Pemberton-Smythe", "Muddlecombe", "Thistlewood", "Pikelet",
  "Jaffle", "Trifle", "Wombatson", "Brolly", "Sausage-Sizzle", "Cuppa", "Earl-Grey", "Drongo", "Knickerbocker", "Fish-Finger",
  "Kookaburra", "Yabby", "Wigglesworth", "Fiddlesticks", "Bumbleford", "Puddleby", "Crumble", "Shortbread", "Fairweather", "Snickleway"];
const PLACES = ["from Wagga Wagga", "from Woy Woy", "from Humpty Doo", "from Kangaroo Flat", "from Nowhere Else", "from Bendigo",
  "of Little Snoring", "of Nether Wallop", "of Chipping Sodbury", "of Westward Ho!", "of Great Snoring", "of Much Wenlock"];
const EMOJIS = ["🦘", "🐨", "🦆", "🐑", "🦉", "🐧", "🦔", "🦊", "🐊", "🦜", "🦡", "🐝", "🦢", "🐻", "🦩", "🐸", "🦭", "🐢", "🐙", "🦖"];
const pick = a => a[Math.floor(Math.random() * a.length)];
function makeName() {
  let s = `${pick(FIRSTS)} ${pick(SURNAMES)}`;
  if (Math.random() < .3) s = `${pick(TITLES)} ${s}`;
  if (Math.random() < .45) s += ` ${pick(PLACES)}`;
  return s;
}
// A name someone else already uses is never handed out; if two people still collide, the server adds "II".
function uniqueName() {
  const taken = new Set(S.people.filter(p => p.id !== S.me.id).map(p => p.name));
  let n = makeName();
  for (let i = 0; i < 50 && taken.has(n); i++) n = makeName();
  return n;
}
const firstName = n => String(n).split(" ").find(w => !TITLES.includes(w)) || n;
function hue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return h % 360; }
function ava(person, size = "") {
  return el("span", { class: `ava ${size}`, style: `--h:${hue(person.id || person.name)}`, title: person.name, "aria-hidden": "true", text: person.emoji || "🦘" });
}

// ---------- Identity (per browser) ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
function newToken() { return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join(""); }
let token = store.get("lv-token");
if (!/^[a-f0-9]{32}$/.test(token || "")) { token = newToken(); store.set("lv-token", token); }

const S = {
  config: { title: "", closesAt: null, logos: [] },
  people: [], comments: [], activity: [], closed: false,
  online: [], typing: new Map(),
  me: { id: null, name: store.get("lv-name") || makeName(), emoji: store.get("lv-emoji") || pick(EMOJIS) },
  filter: "all", sort: "recent", replyTo: null, tab: "comments",
  seenComments: null, seenActivity: null, unread: false, ready: false,
  sheetUrl: "",
};
store.set("lv-name", S.me.name); store.set("lv-emoji", S.me.emoji);

const logoById = id => S.config.logos.find(l => l.id === id);
const personById = id => S.people.find(p => p.id === id) || S.online.find(p => p.id === id) || { id, name: "Someone", emoji: "🦘" };
const mine = () => S.people.find(p => p.id === S.me.id) || { pick: null, ratings: {}, reactions: {} };

// ---------- Server calls ----------
// Two backends: the local server (live over /api/stream), or a Google Sheet through Apps Script
// when config.json has a "sheetUrl" (the page then polls for changes).
async function api(path, body = {}) {
  const payload = { token, name: S.me.name, emoji: S.me.emoji, ...body };
  const j = S.sheetUrl ? await sheetPost(path, payload) : await localPost(path, payload);
  // The server has the final say on my name (it may have added "II" to keep names unique).
  if (j.name && j.name !== S.me.name && !rolling) {
    S.me.name = j.name; store.set("lv-name", j.name);
    render();
  }
  return j;
}

async function localPost(path, payload) {
  const r = await fetch("/api/" + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Couldn't reach the server. Is it still running?");
  return j;
}

const SHEET_ACTIONS = { "comment/like": "like", "comment/delete": "delete" };
async function sheetPost(path, payload) {
  if (path === "typing") return { ok: true };
  // A plain-text body keeps this a simple request, so Apps Script needs no CORS preflight.
  const r = await fetch(S.sheetUrl, { method: "POST", body: JSON.stringify({ ...payload, action: SHEET_ACTIONS[path] || path }) });
  const j = await r.json().catch(() => ({ error: "The vote sheet didn't answer. Try again." }));
  if (j.error) throw new Error(j.error);
  if (j.state) applyState(j.state);
  return j;
}

let polling = false;
async function pollSheet() {
  if (polling || document.hidden) return;
  polling = true;
  try {
    const r = await fetch(S.sheetUrl + (S.sheetUrl.includes("?") ? "&" : "?") + "action=state");
    applyState(await r.json());
    lastLost = 0;
  } catch {
    if (S.ready) toastOnce("Can't reach the vote sheet. Retrying…");
  } finally {
    polling = false;
  }
}
async function act(path, body) {
  try { return await api(path, body); }
  catch (e) { toast(e.message, "err"); return null; }
}

// ---------- Tallies ----------
function tallies() {
  const t = Object.fromEntries(S.config.logos.map(l => [l.id, { picks: 0, sum: 0, n: 0, reactions: { love: 0, fire: 0, hmm: 0, yikes: 0 }, pickers: [] }]));
  for (const p of S.people) {
    if (p.pick && t[p.pick]) { t[p.pick].picks++; t[p.pick].pickers.push(p); }
    for (const [k, v] of Object.entries(p.ratings || {})) if (t[k] && v > 0) { t[k].sum += v; t[k].n++; }
    for (const [k, v] of Object.entries(p.reactions || {})) if (t[k] && v in t[k].reactions) t[k].reactions[v]++;
  }
  for (const k in t) { t[k].avg = t[k].n ? t[k].sum / t[k].n : 0; t[k].pickers.sort((a, b) => (b.pickedAt || 0) - (a.pickedAt || 0)); }
  return t;
}
function ranking(t) {
  return [...S.config.logos].sort((a, b) =>
    t[b.id].picks - t[a.id].picks || t[b.id].avg - t[a.id].avg ||
    (t[b.id].reactions.love + t[b.id].reactions.fire) - (t[a.id].reactions.love + t[a.id].reactions.fire) ||
    a.id.localeCompare(b.id));
}

// ---------- Static builds (once per logo set) ----------
let builtFor = "";
function buildForLogos() {
  const key = JSON.stringify(S.config.logos);
  if (key === builtFor) return;
  builtFor = key;
  const logos = S.config.logos;

  // Hero fan
  const fan = $("#fan"); fan.replaceChildren();
  const mid = (logos.length - 1) / 2, step = Math.min(58, 240 / Math.max(1, logos.length - 1));
  logos.forEach((l, i) => {
    const o = i - mid;
    fan.append(el("div", { class: "fc", style: `--x:${o * step}px;--y:${Math.abs(o) * 14}px;--r:${o * step * .16}deg;z-index:${10 - Math.abs(Math.round(o))}` },
      el("b", { text: l.id }), el("img", { src: l.src, alt: "" })));
  });

  // Cards
  const cards = $("#cards"); cards.replaceChildren();
  for (const l of logos) {
    const stars = el("div", { class: "stars", role: "group", "aria-label": `Your rating for ${l.id}` });
    for (let i = 1; i <= 5; i++) {
      const b = el("button", { class: "star", type: "button", "aria-label": `${i} star${i > 1 ? "s" : ""}`, "data-v": i });
      b.innerHTML = STAR;
      b.addEventListener("mouseenter", () => { stars.classList.add("hovering"); for (const s of stars.children) s.classList.toggle("hov", +s.dataset.v <= i); });
      b.addEventListener("click", () => rate(l.id, i));
      stars.append(b);
    }
    stars.addEventListener("mouseleave", () => stars.classList.remove("hovering"));

    const reacts = el("div", { class: "reacts" },
      REACTIONS.map(r => el("button", { class: "react", type: "button", "data-r": r.key, title: r.label, "aria-label": r.label, onclick: e => react(l.id, r.key, e.currentTarget) },
        el("span", { text: r.emoji }), el("b", { text: "0" }))));

    const card = el("article", { class: "card", "data-id": l.id },
      el("button", { class: "stage", type: "button", "aria-label": `Preview ${l.id}, ${l.name}`, onclick: () => openPreview(l.id) },
        el("img", { src: l.src, alt: `Logo ${l.id}: ${l.name}`, onload: e => e.target.classList.toggle("wide", e.target.naturalWidth / e.target.naturalHeight > 1.6) }),
        el("span", { class: "letter", text: l.id }),
        l.sample ? el("span", { class: "sample", text: "Sample" }) : null,
        el("span", { class: "crowned", text: "👑 Your pick", hidden: true }),
        el("span", { class: "zoom", "aria-hidden": "true", text: "⤢" })),
      el("div", { class: "card-body" },
        el("div", { class: "card-title" }, el("h3", { text: l.name }), el("span", { class: "rank-chip" })),
        el("p", { class: "tagline", text: l.tagline || "" }),
        el("div", { class: "rate" }, stars, el("div", { class: "avg" })),
        reacts,
        el("button", { class: "btn crown-btn", type: "button", onclick: () => crown(l.id) }),
        el("div", { class: "pickers" })));
    cards.append(card);
  }

  // Leaderboard rows
  const board = $("#board"); board.replaceChildren();
  for (const l of logos) {
    board.append(el("li", { class: "row", "data-id": l.id, tabindex: 0, onclick: () => scrollToCard(l.id), onkeydown: e => { if (e.key === "Enter") scrollToCard(l.id); } },
      el("span", { class: "pos" }),
      el("span", { class: "thumb" }, el("img", { src: l.src, alt: "" })),
      el("div", { class: "row-main" }, el("div", { class: "row-top" }, el("b", { text: `${l.id} · ${l.name}` }), el("span")), el("div", { class: "bar" }, el("i"))),
      el("div", { class: "row-score" }, el("b", { text: "0" }), el("small", { text: "crowns" }))));
  }

  // Comment filters and composer select
  const chips = $("#filter-chips"); chips.replaceChildren(el("button", { class: "chip all", type: "button", "data-f": "all", text: "All" }));
  for (const l of logos) chips.append(el("button", { class: "chip", type: "button", "data-f": l.id, title: l.name }, el("img", { src: l.src, alt: "" }), l.id));
  const sel = $("#c-logo"); sel.replaceChildren(el("option", { value: "", text: "💬 General" }));
  for (const l of logos) sel.append(el("option", { value: l.id, text: `About ${l.id} · ${l.name}` }));
}

// ---------- Render ----------
function render() {
  buildForLogos();
  const t = tallies();
  const order = ranking(t);
  const me = mine();
  const totalPicks = Object.values(t).reduce((n, x) => n + x.picks, 0);

  // Me
  $("#me-ava").replaceWith(Object.assign(ava(S.me), { id: "me-ava" }));
  $("#composer-ava").replaceWith(Object.assign(ava(S.me, "sm"), { id: "composer-ava" }));
  if (!rolling) $("#me-name").textContent = S.me.name;
  $("#c-text").placeholder = `Write a comment as ${firstName(S.me.name)}…`;

  // Hero
  const eyebrow = document.querySelector(".eyebrow");
  eyebrow.classList.toggle("closed", S.closed);
  eyebrow.lastChild.textContent = S.closed ? " Voting has closed" : " Voting is live";
  $("#st-picks").textContent = totalPicks;
  $("#st-ratings").textContent = Object.values(t).reduce((n, x) => n + x.n, 0);
  $("#st-comments").textContent = S.comments.length;
  $("#st-voters").textContent = S.people.length;

  // Leaderboard with a FLIP slide when the order changes
  const board = $("#board");
  const before = new Map([...board.children].map(r => [r.dataset.id, r.getBoundingClientRect().top]));
  order.forEach((l, i) => {
    const row = board.querySelector(`[data-id="${l.id}"]`); if (!row) return;
    const x = t[l.id];
    const has = x.picks > 0 || x.n > 0;
    const medal = has ? ["first", "second", "third"][i] : null;
    row.className = medal ? `row ${medal}` : "row";
    row.querySelector(".pos").textContent = has && i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1;
    row.querySelector(".row-top span").textContent = x.n ? `★ ${x.avg.toFixed(1)} · ${x.n} rating${x.n > 1 ? "s" : ""}` : "No ratings yet";
    row.querySelector(".bar i").style.width = (totalPicks ? x.picks / totalPicks * 100 : 0) + "%";
    row.querySelector(".row-score b").textContent = x.picks;
    row.querySelector(".row-score small").textContent = x.picks === 1 ? "crown" : "crowns";
    board.append(row);
  });
  if (!reduced) for (const row of board.children) {
    const old = before.get(row.dataset.id), now = row.getBoundingClientRect().top;
    if (old != null && Math.abs(old - now) > 1) row.animate([{ transform: `translateY(${old - now}px)` }, { transform: "none" }], { duration: 550, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  $("#board-meta").textContent = totalPicks ? `${totalPicks} crown${totalPicks > 1 ? "s" : ""} so far · ranked by crowns, then stars` : "No crowns yet. Yours could be the first.";

  // Cards
  for (const card of $("#cards").children) {
    const id = card.dataset.id, x = t[id], rank = order.findIndex(l => l.id === id) + 1;
    const isMine = me.pick === id;
    card.classList.toggle("mine", isMine);
    card.querySelector(".crowned").hidden = !isMine;
    card.querySelector(".rank-chip").textContent = x.picks || x.n ? `#${rank} in the race` : "";
    const myStars = me.ratings?.[id] || 0;
    for (const s of card.querySelectorAll(".star")) { s.classList.toggle("on", +s.dataset.v <= myStars); s.disabled = S.closed; s.setAttribute("aria-pressed", +s.dataset.v === myStars); }
    const avg = card.querySelector(".avg"); avg.replaceChildren();
    if (x.n) avg.append(el("b", { text: `★ ${x.avg.toFixed(1)}` }), `${x.n} rating${x.n > 1 ? "s" : ""}`);
    else avg.append(el("b", { text: "–" }), "Be the first to rate");
    for (const b of card.querySelectorAll(".react")) {
      const k = b.dataset.r;
      b.classList.toggle("mine", me.reactions?.[id] === k);
      b.querySelector("b").textContent = x.reactions[k];
      b.disabled = S.closed;
      b.setAttribute("aria-pressed", me.reactions?.[id] === k);
    }
    const btn = card.querySelector(".crown-btn");
    btn.classList.toggle("is-mine", isMine);
    btn.disabled = S.closed;
    btn.textContent = S.closed ? "Voting has closed" : isMine ? "👑 Crowned · tap to undo" : me.pick ? `👑 Move my crown to ${id}` : `👑 Crown ${id}`;
    const pk = card.querySelector(".pickers"); pk.replaceChildren();
    if (x.picks) {
      pk.append(el("span", { class: "stack" }, x.pickers.slice(0, 5).map(p => ava(p, "xs"))),
        el("span", { text: x.picks === 1 ? `${firstName(x.pickers[0].name)} crowned this` : `${firstName(x.pickers[0].name)} and ${x.picks - 1} other${x.picks > 2 ? "s" : ""} crowned this` }));
    } else pk.append(el("span", { text: "No crowns yet" }));
  }

  renderComments();
  renderActivity();
  renderPresence();
  if ($("#pv").open) fillPreview();
}

function renderPresence() {
  const st = $("#online-stack"); st.replaceChildren();
  for (const p of S.online.slice(0, 5)) st.append(ava(p, "xs"));
  $("#online-count").textContent = S.online.length;
}

// ---------- Comments ----------
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return Math.round(s / 60) + "m";
  if (s < 86400) return Math.round(s / 3600) + "h";
  if (s < 86400 * 7) return Math.round(s / 86400) + "d";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function commentNode(c, fresh) {
  const author = personById(c.author), isMine = c.author === S.me.id, liked = c.likes.includes(S.me.id);
  const logo = c.logoId && logoById(c.logoId);
  const bubble = el("div", { class: "bubble" },
    el("div", { class: "who" }, author.name, isMine ? el("span", { class: "you", text: "You" }) : null),
    logo ? el("button", { class: "ltag", type: "button", onclick: () => scrollToCard(logo.id), title: `Go to ${logo.name}` }, el("img", { src: logo.src, alt: "" }), `on ${logo.id} · ${logo.name}`) : null,
    el("p", { class: "txt", text: c.text }),
    c.likes.length ? el("span", { class: "likes", title: c.likes.map(id => personById(id).name).join(", ") }, el("i", { text: "❤️" }), String(c.likes.length)) : null);
  const actions = el("div", { class: "cmt-actions" },
    el("time", { datetime: new Date(c.at).toISOString(), "data-at": c.at, text: ago(c.at) }),
    el("button", { type: "button", class: liked ? "liked" : "", text: liked ? "Liked" : "Like", onclick: () => act("comment/like", { id: c.id }) }),
    el("button", { type: "button", text: "Reply", onclick: () => startReply(c) }),
    isMine ? el("button", { type: "button", text: "Delete", onclick: () => act("comment/delete", { id: c.id }) }) : null);
  return el("div", { class: `cmt${isMine ? " mine" : ""}${fresh ? " fresh" : ""}`, "data-id": c.id }, ava(author), el("div", { class: "cmt-main" }, bubble, actions));
}

function renderComments() {
  const thread = $("#thread");
  const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 60;
  const prevTop = thread.scrollTop;
  const first = S.seenComments === null;
  const seen = S.seenComments || new Set();
  const top = S.comments.filter(c => !c.parentId && (S.filter === "all" || c.logoId === S.filter));
  const replies = new Map();
  for (const c of S.comments) if (c.parentId) (replies.get(c.parentId) || replies.set(c.parentId, []).get(c.parentId)).push(c);
  if (S.sort === "top") top.sort((a, b) => b.likes.length - a.likes.length || b.at - a.at);
  else top.sort((a, b) => a.at - b.at);

  thread.replaceChildren();
  for (const c of top) {
    const node = commentNode(c, !first && !seen.has(c.id));
    const rs = (replies.get(c.id) || []).sort((a, b) => a.at - b.at);
    if (rs.length) node.querySelector(".cmt-main").append(el("div", { class: "replies" }, rs.map(r => commentNode(r, !first && !seen.has(r.id)))));
    thread.append(node);
  }
  if (!top.length) {
    const l = S.filter !== "all" && logoById(S.filter);
    thread.append(el("div", { class: "empty" }, el("span", { text: "💬" }),
      el("b", { text: l ? `Nothing about ${l.id} yet` : "No comments yet" }),
      l ? `Be the first to say something about ${l.name}.` : "Start the conversation. Which one would you put on a mug?"));
  }

  const newOnes = S.comments.filter(c => !seen.has(c.id));
  const newFromOthers = !first && newOnes.some(c => c.author !== S.me.id);
  if (S.ready) S.seenComments = new Set(S.comments.map(c => c.id));
  if (S.sort === "recent" && (nearBottom || first || newOnes.some(c => c.author === S.me.id))) thread.scrollTop = thread.scrollHeight;
  else thread.scrollTop = prevTop;

  const n = S.comments.length;
  $("#c-count").textContent = n; $("#fab-count").textContent = n;
  if (newFromOthers && !sideVisible()) { S.unread = true; }
  $("#fab-badge").hidden = !S.unread;
  for (const ch of $("#filter-chips").children) ch.classList.toggle("on", ch.dataset.f === S.filter);
  for (const b of $("#sort").children) b.classList.toggle("on", b.dataset.sort === S.sort);
}

function startReply(c) {
  S.replyTo = { id: c.parentId || c.id, name: personById(c.author).name };
  $("#replying").hidden = false;
  $("#replying-text").textContent = `Replying to ${S.replyTo.name}`;
  $("#c-text").focus();
}
function cancelReply() { S.replyTo = null; $("#replying").hidden = true; }

// ---------- Activity ----------
function activityText(a) {
  const l = logoById(a.logoId), name = l ? `${a.logoId}` : "";
  switch (a.kind) {
    case "pick": return ["crowned ", el("b", { text: name }), " 👑"];
    case "rate": return ["gave ", el("b", { text: name }), ` ${"★".repeat(a.value)}`];
    case "react": return ["reacted ", EMOJI_OF[a.value] || "", " to ", el("b", { text: name })];
    case "reply": return ["replied to a comment"];
    case "comment": return l ? ["commented on ", el("b", { text: name })] : ["left a comment"];
    default: return ["did something"];
  }
}
function renderActivity() {
  const ol = $("#activity");
  const first = S.seenActivity === null, seen = S.seenActivity || new Set();
  ol.replaceChildren();
  for (const a of S.activity) {
    ol.append(el("li", { class: `act${!first && !seen.has(a.id) ? " fresh" : ""}` },
      ava({ id: a.by, name: a.name, emoji: a.emoji }),
      el("p", {}, el("b", { text: a.name }), " ", ...activityText(a)),
      el("time", { "data-at": a.at, text: ago(a.at) })));
  }
  if (!S.activity.length) ol.append(el("li", { class: "empty" }, el("span", { text: "📡" }), el("b", { text: "Quiet so far" }), "Crowns, ratings and reactions show up here the moment they happen."));
  if (S.ready) S.seenActivity = new Set(S.activity.map(a => a.id));
}

// ---------- Actions ----------
async function crown(id) {
  const was = mine().pick;
  const next = was === id ? null : id;
  const ok = await act("pick", { logoId: next });
  if (!ok) return;
  if (next) {
    confetti();
    toast(was ? `Crown moved to ${id}. Bold move, ${firstName(S.me.name)}.` : `${id} has your crown. Cheers, ${firstName(S.me.name)}! 👑`);
  } else toast("Crown taken back. Still deciding?");
}
async function rate(id, stars) {
  const cur = mine().ratings?.[id] || 0;
  const ok = await act("rate", { logoId: id, stars: cur === stars ? 0 : stars });
  if (ok && stars === 5 && cur !== 5) burstAt(document.querySelector(`.card[data-id="${id}"] .stars`), "⭐");
}
async function react(id, key, btn) {
  const cur = mine().reactions?.[id];
  const next = cur === key ? null : key;
  if (next) burstAt(btn, EMOJI_OF[key]);
  await act("react", { logoId: id, reaction: next });
}

// ---------- Effects ----------
function burstAt(target, emoji, count = 5) {
  if (reduced || !target) return;
  const r = target.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const f = el("span", { class: "floaty", text: emoji, "aria-hidden": "true",
      style: `left:${r.left + r.width / 2 + (Math.random() - .5) * r.width * .6}px;top:${r.top}px;--dx:${(Math.random() - .5) * 120}px;--rot:${(Math.random() - .5) * 60}deg;animation-delay:${i * 70}ms;font-size:${22 + Math.random() * 14}px` });
    document.body.append(f);
    setTimeout(() => f.remove(), 1600 + i * 70);
  }
}

function confetti() {
  if (reduced) return;
  const cv = $("#confetti"), ctx = cv.getContext("2d");
  const dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const colors = ["#2DD4BF", "#14B8A6", "#F6C453", "#FF7A6B", "#F3F9F7", "#5B8DEF"];
  const parts = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .55,
    vx: (Math.random() - .5) * 16, vy: -Math.random() * 18 - 6,
    s: 5 + Math.random() * 7, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .4, c: pick(colors),
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += .45; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (t - t0 < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

function toast(msg, kind = "", who = null) {
  const t = el("div", { class: `toast ${kind}` }, who ? ava(who, "sm") : null, el("span", { text: msg }));
  $("#toasts").append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, 3800);
  while ($("#toasts").children.length > 3) $("#toasts").firstChild.remove();
}

// ---------- Name roll ----------
let rolling = false;
async function reroll() {
  if (rolling) return;
  rolling = true;
  const nameEl = $("#me-name"); nameEl.classList.add("rolling");
  const steps = reduced ? 1 : 12;
  for (let i = 0; i < steps; i++) { nameEl.textContent = makeName(); await new Promise(r => setTimeout(r, 45 + i * 6)); }
  S.me.name = uniqueName(); S.me.emoji = pick(EMOJIS);
  store.set("lv-name", S.me.name); store.set("lv-emoji", S.me.emoji);
  rolling = false; nameEl.classList.remove("rolling");
  render();
  toast(`G'day, ${S.me.name}!`, "", S.me);
  // Only people who've already done something have a record to rename.
  if (S.people.some(p => p.id === S.me.id)) act("profile");
}

// ---------- Preview dialog ----------
let pvId = null;
function openPreview(id) { pvId = id; fillPreview(); const d = $("#pv"); if (!d.open) d.showModal(); }
function fillPreview() {
  const logos = S.config.logos, i = logos.findIndex(l => l.id === pvId), l = logos[i];
  if (!l) return $("#pv").close();
  $("#pv-letter").textContent = l.id; $("#pv-title").textContent = l.name; $("#pv-tag").textContent = l.tagline || "";
  for (const s of ["#pv-light", "#pv-dark", "#pv-fav", "#pv-app", "#pv-slide"]) $(s).src = l.src;
  $("#pv-light").alt = `${l.name} on white`;
  const prev = logos[(i - 1 + logos.length) % logos.length], next = logos[(i + 1) % logos.length];
  $("#pv-prev").textContent = `← ${prev.id} · ${prev.name}`; $("#pv-prev").onclick = () => { pvId = prev.id; fillPreview(); };
  $("#pv-next").textContent = `${next.id} · ${next.name} →`; $("#pv-next").onclick = () => { pvId = next.id; fillPreview(); };
  const isMine = mine().pick === l.id, btn = $("#pv-crown");
  btn.classList.toggle("is-mine", isMine); btn.disabled = S.closed;
  btn.textContent = S.closed ? "Voting has closed" : isMine ? "👑 Crowned · tap to undo" : `👑 Crown ${l.id}`;
  btn.onclick = () => crown(l.id);
}
function scrollToCard(id) {
  const c = document.querySelector(`.card[data-id="${id}"]`);
  if (!c) return;
  closeSide();
  c.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  if (!reduced) c.animate([{ boxShadow: "0 0 0 0 var(--teal)" }, { boxShadow: "0 0 0 6px var(--teal)" }, { boxShadow: "0 0 0 0 var(--teal)" }], { duration: 1200, delay: 300 });
}

// ---------- Countdown ----------
function tickCountdown() {
  const box = $("#countdown");
  const end = Date.parse(S.config.closesAt || "");
  if (!Number.isFinite(end)) { box.replaceChildren(); return; }
  let s = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const when = new Date(end).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  if (!s) { box.replaceChildren(el("span", { class: "cd-note", text: `Voting closed ${when}.` })); return; }
  const parts = [["days", 86400], ["hrs", 3600], ["mins", 60], ["secs", 1]].map(([k, v]) => { const n = Math.floor(s / v); s -= n * v; return [k, n]; });
  box.replaceChildren(...parts.map(([k, n]) => el("div", { class: "cd" }, el("b", { text: String(n).padStart(2, "0") }), el("small", { text: k }))),
    el("span", { class: "cd-note", text: `until voting closes · ${when}` }));
}

// ---------- Side panel (drawer on narrow screens) ----------
const narrow = matchMedia("(max-width: 980px)");
const sideVisible = () => !narrow.matches || $("#side").classList.contains("open");
function openSide() { $("#side").classList.add("open"); $("#scrim").hidden = false; $("#fab").hidden = true; S.unread = false; $("#fab-badge").hidden = true; const th = $("#thread"); th.scrollTop = th.scrollHeight; }
function closeSide() { $("#side").classList.remove("open"); $("#scrim").hidden = true; $("#fab").hidden = false; }
function setTab(tab) {
  S.tab = tab;
  $("#tab-comments").setAttribute("aria-selected", tab === "comments");
  $("#tab-activity").setAttribute("aria-selected", tab === "activity");
  $("#panel-comments").hidden = tab !== "comments";
  $("#panel-activity").hidden = tab !== "activity";
}

// ---------- Live connection ----------
function connect() {
  const q = new URLSearchParams({ id: S.me.id || "", name: S.me.name, emoji: S.me.emoji });
  const es = new EventSource("/api/stream?" + q);
  es.addEventListener("state", e => applyState(JSON.parse(e.data)));
  es.addEventListener("presence", e => { S.online = JSON.parse(e.data); renderPresence(); });
  es.addEventListener("burst", e => {
    const d = JSON.parse(e.data);
    if (d.by === S.me.id) return;
    burstAt(document.querySelector(`.card[data-id="${d.logoId}"] .react[data-r="${d.reaction}"]`), EMOJI_OF[d.reaction], 3);
  });
  es.addEventListener("activity", e => {
    const a = JSON.parse(e.data);
    if (a.by === S.me.id) return;
    if (a.kind === "pick") announce(a);
    S.typing.delete(a.by); renderTyping();
  });
  es.addEventListener("typing", e => {
    const d = JSON.parse(e.data);
    if (d.id === S.me.id) return;
    S.typing.set(d.id, { ...d, until: Date.now() + 4000 });
    renderTyping();
  });
  es.onerror = () => { if (S.ready) toastOnce("Lost the live connection. Reconnecting…"); };
  es.onopen = () => { lastLost = 0; };
}
let lastLost = 0;
function toastOnce(msg) { if (Date.now() - lastLost > 15000) { lastLost = Date.now(); toast(msg, "err"); } }

function applyState(d) {
  // The sheet has no live push, so other people's new crowns and reactions are found by comparing polls.
  const fresh = S.ready && S.sheetUrl && S.seenActivity ? d.activity.filter(a => a.by !== S.me.id && !S.seenActivity.has(a.id)) : [];
  Object.assign(S, { people: d.people, comments: d.comments, activity: d.activity, closed: d.closed });
  if (d.config) S.config = d.config;
  // Before my first vote, swap my name if someone else has just taken it.
  if (!rolling && !S.people.some(p => p.id === S.me.id) && S.people.some(p => p.name === S.me.name)) {
    S.me.name = uniqueName(); store.set("lv-name", S.me.name);
  }
  S.ready = true;
  render(); tickCountdown();
  for (const a of fresh.reverse()) announce(a);
}

function announce(a) {
  if (a.kind === "pick") toast(`${a.name} just crowned ${a.logoId} 👑`, "", { id: a.by, name: a.name, emoji: a.emoji });
  if (a.kind === "react") burstAt(document.querySelector(`.card[data-id="${a.logoId}"] .react[data-r="${a.value}"]`), EMOJI_OF[a.value], 3);
}

function renderTyping() {
  const now = Date.now();
  for (const [k, v] of S.typing) if (v.until < now) S.typing.delete(k);
  const names = [...S.typing.values()].map(v => firstName(v.name));
  $("#typing").hidden = !names.length;
  $("#typing-text").textContent = names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : `${names.length} people are typing…`;
}

// ---------- Wire up ----------
let lastTyping = 0;
function bind() {
  $("#reroll").addEventListener("click", reroll);
  $("#theme").addEventListener("click", () => {
    const dark = getComputedStyle(document.documentElement).colorScheme.includes("dark");
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next; store.set("lv-theme", next);
  });
  $("#tab-comments").addEventListener("click", () => setTab("comments"));
  $("#tab-activity").addEventListener("click", () => setTab("activity"));
  $("#filter-chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; S.filter = b.dataset.f; if (S.filter !== "all") $("#c-logo").value = S.filter; renderComments(); });
  $("#sort").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; S.sort = b.dataset.sort; renderComments(); if (S.sort === "top") $("#thread").scrollTop = 0; });
  $("#reply-cancel").addEventListener("click", cancelReply);
  $("#fab").addEventListener("click", openSide);
  $("#side-close").addEventListener("click", closeSide);
  $("#scrim").addEventListener("click", closeSide);
  $("#pv-close").addEventListener("click", () => $("#pv").close());
  $("#pv").addEventListener("click", e => { if (e.target === $("#pv")) $("#pv").close(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSide();
    if ($("#pv").open && (e.key === "ArrowRight" || e.key === "ArrowLeft")) $(e.key === "ArrowRight" ? "#pv-next" : "#pv-prev").click();
  });

  const ta = $("#c-text");
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; $("#c-send").disabled = !ta.value.trim(); };
  ta.addEventListener("input", () => {
    grow();
    if (ta.value.trim() && Date.now() - lastTyping > 2500) { lastTyping = Date.now(); api("typing").catch(() => {}); }
  });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); } });
  $("#composer").addEventListener("submit", async e => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    $("#c-send").disabled = true;
    const ok = await act("comment", { text, logoId: S.replyTo ? null : ($("#c-logo").value || null), parentId: S.replyTo?.id || null });
    if (ok) { ta.value = ""; cancelReply(); if (S.sort !== "recent") { S.sort = "recent"; renderComments(); } }
    grow();
  });
  grow();

  setInterval(() => {
    tickCountdown(); renderTyping();
    for (const t of document.querySelectorAll("time[data-at]")) t.textContent = ago(+t.dataset.at);
  }, 1000);
}

async function start() {
  bind();
  try {
    const c = await (await fetch("config.json", { cache: "no-store" })).json();
    S.config = { title: c.title, closesAt: c.closesAt, logos: c.logos };
    S.sheetUrl = c.sheetUrl || "";
  } catch {}
  render(); tickCountdown();
  try { S.me.id = (await api("whoami")).id; }
  catch (e) { toast(e.message, "err"); }
  if (!S.sheetUrl) return connect();
  $("#online").hidden = true;  // the sheet can't tell who has the page open
  pollSheet();
  setInterval(pollSheet, 6000);
  document.addEventListener("visibilitychange", pollSheet);
}
start();
