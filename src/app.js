(() => {
"use strict";
const DATA = JSON.parse(document.getElementById("data").textContent);
const TYPES = __TYPES__;
const DISTRICT_ALIASES = __ALIASES__;
const TYPE_WORDS = {
  hospital:"hospital hospitals emergency er surgery inpatient mustashfa",
  clinic:"clinic clinics doctor polyclinic consultation outpatient eyada",
  laboratory:"lab labs laboratory laboratories blood test analysis tahalil",
  pharmacy:"pharmacy pharmacies drug drugs medicine saydaleya",
  optical:"optical optics optician glasses eye eyes lenses",
  dental:"dental dentist teeth tooth",
  "radiology-centre":"radiology scan scans xray x-ray mri ct ultrasound sonar asha3a",
  "physical-therapy-centre":"physio physiotherapy physical therapy rehab rehabilitation",
  "diagnostic-centre":"diagnostic diagnosis check-up checkup"
};
const LS_PREFIX = "cgmn.";
(() => { // one-time migration of data saved by earlier versions of the file (old key prefix)
  try {
    if (localStorage.getItem(LS_PREFIX + "migrated")) return;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("bupaCG.")) { const nk = LS_PREFIX + k.slice(7); if (localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k)); }
    }
    localStorage.setItem(LS_PREFIX + "migrated", "1");
  } catch(e) {}
})();
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(LS_PREFIX + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); }catch(e){} }
};
const AREA = "__AREA__", SLUG = "__SLUG__";
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- normalisation for tolerant search ---------- */
function norm(s){
  return " " + String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/&/g," and ").replace(/['’`]/g,"").replace(/[^a-z0-9]+/g," ")
    .replace(/\bma+d[iy]\b/g,"m9di")
    .replace(/\b(el|al|the|of|madinet|madinat|medinet)\b/g," ")
    .replace(/ph/g,"f").replace(/kh/g,"k").replace(/q/g,"k").replace(/z/g,"s").replace(/ou/g,"o").replace(/w/g,"o")
    .replace(/[eiy]+/g,"i").replace(/[ou]+/g,"o")
    .replace(/([a-z])\1+/g,"$1")
    .replace(/\s+/g," ").trim() + " ";
}

const favs = new Set(LS.get("favs", []));
let notes = LS.get("notes", {});
let tags = LS.get("tags", {});          // facility id -> [tag, ...]
let recent = LS.get("recent", []);      // [{id, a, ts}] newest first
const RECENT_MAX = 20;
const openCards = new Set();            // expanded rows in list view
const mapUrl = f => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(f.n + ", " + f.a);
function tagCounts(){ const c = {}; for (const id in tags) for (const t of tags[id]) c[t] = (c[t] || 0) + 1; return c; }
function tagClass(t){ let h = 0; for (const ch of t.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return "u" + (h % 8); }
function ago(ts){
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 172800) return "yesterday";
  if (s < 604800) return Math.floor(s / 86400) + " days ago";
  return new Date(ts).toLocaleDateString(undefined, {day:"numeric", month:"short", year:"numeric"});
}
const ACT_LABEL = {call:"Called", map:"Opened map", copy:"Copied", share:"Shared"};

DATA.forEach((f, i) => {
  f.i = i;
  f.tl = TYPES[f.t] ? TYPES[f.t].label : f.t;
  f.hay = norm([f.n, f.a, f.d, f.r, f.b, f.tl, TYPE_WORDS[f.t] || "", DISTRICT_ALIASES[f.d] || ""].join(" "));
  f.digits = (f.tel || "").replace(/\D/g, "");
  f.letter = (f.n.match(/[A-Za-z0-9]/) || ["#"])[0].toUpperCase();
  if (/[0-9]/.test(f.letter)) f.letter = "#";
});

const ALL_DISTRICTS = [...new Set(DATA.map(f => f.d))];
const GOV_OF = {}; DATA.forEach(f => { if (!f.d.startsWith("Other")) GOV_OF[f.d] = f.r; else GOV_OF[f.d] = f.d.replace("Other ", ""); });
const ALL_BRANDS = [...new Set(DATA.map(f => f.b).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const TYPE_ORDER = Object.keys(TYPES);

/* ---------- state ---------- */
const state = { q:"", type:new Set(), gov:new Set(), dist:new Set(), brand:new Set(), tag:new Set(), show:"all", group:"district", sort:"name", view:LS.get("view", "cards") };
const collapsed = new Set();

function readURL(){
  const p = new URLSearchParams(location.search);
  state.q = p.get("q") || "";
  const set = (k) => new Set((p.get(k) || "").split("|").filter(Boolean));
  state.type = set("type"); state.gov = set("gov"); state.dist = set("dist"); state.brand = set("brand"); state.tag = set("tag");
  state.show = ["fav","notes","recent"].includes(p.get("show")) ? p.get("show") : "all";
  state.group = p.get("group") || LS.get("group", "district");
  state.sort = p.get("sort") || "name";
}
function writeURL(){
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  for (const k of ["type","gov","dist","brand","tag"]) if (state[k].size) p.set(k, [...state[k]].join("|"));
  if (state.show !== "all") p.set("show", state.show);
  if (state.group !== "district") p.set("group", state.group);
  if (state.sort !== "name") p.set("sort", state.sort);
  const s = p.toString();
  history.replaceState(null, "", s ? "?" + s : location.pathname);
}

/* ---------- filtering ---------- */
function queryMatcher(){
  const raw = state.q.trim();
  if (!raw) return null;
  const terms = raw.split(/\s+/).filter(Boolean).map(t => {
    const d = t.replace(/\D/g, "");
    return { n: norm(t).trim(), d: d.length >= 3 && d.length === t.replace(/[\s+()-]/g,"").length ? d : "" };
  }).filter(t => t.n || t.d);
  terms.forEach(t => { if (t.n) t.n = " " + t.n; });
  const userHay = {};
  for (const id in tags) userHay[id] = (userHay[id] || "") + " " + tags[id].join(" ");
  for (const id in notes) userHay[id] = (userHay[id] || "") + " " + notes[id];
  for (const id in userHay) userHay[id] = norm(userHay[id]);
  return f => terms.every(t => (t.d && f.digits.includes(t.d)) || (t.n && (f.hay.includes(t.n) || (userHay[f.id] || "").includes(t.n))));
}
function passes(f, m, skip){
  if (skip !== "type" && state.type.size && !state.type.has(f.t)) return false;
  if (skip !== "gov" && state.gov.size && !state.gov.has(f.r)) return false;
  if (skip !== "dist" && state.dist.size && !state.dist.has(f.d)) return false;
  if (skip !== "brand" && state.brand.size && !state.brand.has(f.b || "—")) return false;
  if (skip !== "tag" && state.tag.size && !(tags[f.id] || []).some(t => state.tag.has(t))) return false;
  if (state.show === "fav" && !favs.has(f.id)) return false;
  if (state.show === "notes" && !notes[f.id]) return false;
  if (state.show === "recent" && !recent.some(r => r.id === f.id)) return false;
  if (m && !m(f)) return false;
  return true;
}
function facetCounts(key, m, getter){
  const c = {};
  for (const f of DATA) if (passes(f, m, key)) { const v = getter(f); c[v] = (c[v] || 0) + 1; }
  return c;
}

/* ---------- rendering: sidebar ---------- */
function optHTML(name, value, label, count, checked, extra=""){
  const id = "o-" + name + "-" + value.replace(/[^a-z0-9]+/gi, "_");
  return `<label class="opt${count ? "" : " zero"}" for="${id}"${extra}>
    <input type="checkbox" id="${id}" data-f="${name}" value="${esc(value)}"${checked ? " checked" : ""}>
    ${label}<span class="ct" aria-label="${count} results">${count}</span></label>`;
}
function renderSidebar(m){
  const tc = facetCounts("type", m, f => f.t);
  $("#f-type").innerHTML = TYPE_ORDER.map(t => optHTML("type", t,
    `<span class="dot" style="--tc:var(--t-${t})" aria-hidden="true"><svg class="i"><use href="#i-${t}"/></svg></span><span class="nm">${TYPES[t].label}</span>`,
    tc[t] || 0, state.type.has(t))).join("");

  const gc = facetCounts("gov", m, f => f.r);
  $("#f-gov").innerHTML = ["Cairo","Giza"].map(g => optHTML("gov", g, `<span class="nm">${g}</span>`, gc[g] || 0, state.gov.has(g))).join("");

  const dc = facetCounts("dist", m, f => f.d);
  const dq = norm($("#distSearch").value).trim();
  let dh = "";
  for (const g of ["Cairo","Giza"]) {
    const list = ALL_DISTRICTS.filter(d => GOV_OF[d] === g && (!dq || norm(d + " " + (DISTRICT_ALIASES[d]||"")).includes(dq)))
      .sort((a,b) => (a.startsWith("Other") - b.startsWith("Other")) || a.localeCompare(b));
    if (!list.length) continue;
    dh += `<div class="subhead">${g}</div>` + list.map(d => optHTML("dist", d, `<span class="nm">${esc(d)}</span>`, dc[d] || 0, state.dist.has(d))).join("");
  }
  $("#f-dist").innerHTML = dh || `<p class="nophone">No district matches.</p>`;

  const bc = facetCounts("brand", m, f => f.b || "—");
  const bq = norm($("#brandSearch").value).trim();
  const brands = ALL_BRANDS.filter(b => !bq || norm(b).includes(bq)).sort((a,b) => (bc[b]||0) === (bc[a]||0) ? a.localeCompare(b) : (bc[b]||0) - (bc[a]||0));
  let bh = brands.map(b => optHTML("brand", b, `<span class="nm">${esc(b)}</span>`, bc[b] || 0, state.brand.has(b))).join("");
  if (!bq || norm("independent other").includes(bq)) bh += optHTML("brand", "—", `<span class="nm"><em>Independent / other</em></span>`, bc["—"] || 0, state.brand.has("—"));
  $("#f-brand").innerHTML = bh;

  const allT = tagCounts(); const tnames = Object.keys(allT).sort((a,b) => a.localeCompare(b));
  const tcount = {}; for (const f of DATA) if (tags[f.id] && passes(f, m, "tag")) for (const t of tags[f.id]) tcount[t] = (tcount[t] || 0) + 1;
  $("#f-tag").innerHTML = tnames.length
    ? tnames.map(t => optHTML("tag", t, `<span class="nm"><span class="utag ${tagClass(t)}"><span class="ut-n">#${esc(t)}</span></span></span>`, tcount[t] || 0, state.tag.has(t))).join("")
    : `<p class="nophone">No tags yet. Open <b>⋯ More → Add tag</b> on any facility to label it (e.g. “my lab”, “kids”).</p>`;
  $("#tagList").innerHTML = tnames.map(t => `<option value="${esc(t)}">`).join("");

  $("#favCount").textContent = favs.size ? `(${favs.size})` : "";
  const nc = Object.keys(notes).length; $("#noteCount").textContent = nc ? `(${nc})` : "";
  $("#recentCount").textContent = recent.length ? `(${recent.length})` : "";
  $$('input[name="show"]').forEach(r => r.checked = r.value === state.show);
}

/* ---------- rendering: type strip + chips ---------- */
function renderTypeStrip(m){
  const tc = facetCounts("type", m, f => f.t);
  $("#typestrip").innerHTML = TYPE_ORDER.filter(t => tc[t] || state.type.has(t)).map(t =>
    `<button type="button" class="tcard" style="--tc:var(--t-${t})" data-type="${t}" aria-pressed="${state.type.has(t)}">
      <span class="dot" aria-hidden="true"><svg class="i"><use href="#i-${t}"/></svg></span>
      <span>${TYPES[t].plural}<small>${tc[t] || 0} places</small></span></button>`).join("");
}
function renderChips(){
  const c = [];
  if (state.q) c.push(["q", "", `Search: “${esc(state.q)}”`]);
  if (state.show !== "all") c.push(["show", "", {fav:"★ Favourites only", notes:"With notes only", recent:"Recently used"}[state.show]]);
  state.tag.forEach(v => c.push(["tag", v, "#" + esc(v)]));
  state.gov.forEach(v => c.push(["gov", v, v]));
  state.type.forEach(v => c.push(["type", v, TYPES[v] ? TYPES[v].label : v]));
  state.dist.forEach(v => c.push(["dist", v, v]));
  state.brand.forEach(v => c.push(["brand", v, v === "—" ? "Independent" : v]));
  $("#chips").innerHTML = c.map(([k, v, l]) =>
    `<span class="chip">${l}<button type="button" data-rm="${k}" data-v="${esc(v)}" aria-label="Remove filter ${esc(l.replace(/<[^>]+>/g,""))}"><svg class="i"><use href="#i-x"/></svg></button></span>`).join("")
    + (c.length > 1 ? `<button type="button" class="chip clear" id="clearAll">Clear all</button>` : "");
}

/* ---------- rendering: results ---------- */
function hl(text, terms){
  let s = esc(text);
  if (!terms.length) return s;
  const rx = new RegExp("(" + terms.map(t => esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return s.replace(rx, "<mark>$1</mark>");
}
function cardHTML(f, terms, rec){
  const fav = favs.has(f.id), note = notes[f.id] || "", ut = tags[f.id] || [], open = openCards.has(f.id);
  const p0 = f.p[0];
  const phones = f.p.length
    ? `<div class="info"><svg class="i" aria-hidden="true"><use href="#i-phone"/></svg><span class="phs">${f.p.map(p => `<a href="tel:${esc(p.href)}">${hl(p.label, terms)}</a>`).join("")}</span></div>`
    : `<p class="info nophone"><svg class="i" aria-hidden="true"><use href="#i-phone"/></svg>No phone listed</p>`;
  const recLine = rec ? `<p class="c-recent"><svg class="i" aria-hidden="true"><use href="#i-clock"/></svg>  ${ACT_LABEL[rec.a] || "Used"} · ${ago(rec.ts)}</p>` : "";
    const sub = [f.d, f.b].filter(Boolean).map(esc).join(" · ") + (rec ? ` · ${ago(rec.ts)}` : "");
  return `<article class="card${fav ? " fav" : ""}${open ? " open" : ""}" style="--tc:var(--t-${f.t})" data-id="${f.id}" aria-labelledby="h-${f.id}">
    <div class="c-head" data-act="expand">
      <span class="c-ico" aria-hidden="true"><svg class="i"><use href="#i-${f.t}"/></svg></span>
      <div class="c-title">
        <span class="badge"><svg class="i" aria-hidden="true"><use href="#i-${f.t}"/></svg>${esc(f.tl)}</span>
        <h3 id="h-${f.id}">${hl(f.n, terms)}</h3>
        <span class="c-sub">${esc(f.tl)} · ${sub}</span>
      </div>
      ${p0 ? `<a class="c-quick" href="tel:${esc(p0.href)}" aria-label="Call ${esc(f.n)} on ${esc(p0.label)}" title="Call ${esc(p0.label)}"><svg class="i" aria-hidden="true"><use href="#i-phone"/></svg></a>` : ""}
      <button type="button" class="star" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? "Remove from" : "Add to"} favourites: ${esc(f.n)}" title="${fav ? "Remove from" : "Add to"} favourites"><svg class="i"><use href="#i-star"/></svg></button>
      <button type="button" class="c-expand" data-act="expand" aria-expanded="${open}" aria-controls="cb-${f.id}" aria-label="${open ? "Hide" : "Show"} details of ${esc(f.n)}"><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button>
    </div>
    <div class="c-body" id="cb-${f.id}">
      ${recLine}
      <div class="meta">
        <button type="button" class="tag" data-act="dist" data-v="${esc(f.d)}" title="Show only ${esc(f.d)}"><svg class="i" aria-hidden="true"><use href="#i-pin"/></svg>${esc(f.d)} · ${f.r}</button>
        ${f.b ? `<button type="button" class="tag brand" data-act="brand" data-v="${esc(f.b)}" title="Show all ${esc(f.b)} branches">${esc(f.b)}</button>` : ""}
      </div>
      ${ut.length ? `<div class="utags" aria-label="Your tags">${ut.map(t => `<span class="utag ${tagClass(t)}"><button type="button" data-act="tagf" data-v="${esc(t)}" title="Show everything tagged #${esc(t)}">#${esc(t)}</button><button type="button" class="x" data-act="untag" data-v="${esc(t)}" aria-label="Remove tag ${esc(t)}"><svg class="i"><use href="#i-x"/></svg></button></span>`).join("")}</div>` : ""}
      <p class="info"><svg class="i" aria-hidden="true"><use href="#i-pin"/></svg><span>${hl(f.a, terms)}</span></p>
      ${phones}
      ${note ? `<p class="note-prev"><span class="sr-only">Your note: </span>${esc(note)}</p>` : ""}
      <div class="note-box" id="nb-${f.id}"><label class="sr-only" for="nt-${f.id}">Note for ${esc(f.n)}</label><textarea id="nt-${f.id}" data-note="${f.id}" placeholder="Your private note (saved automatically)…">${esc(note)}</textarea></div>
      <div class="tag-box" id="tb-${f.id}"></div>
      <div class="actions">
        ${p0 ? `<a class="act call" href="tel:${esc(p0.href)}" aria-label="Call ${esc(f.n)} on ${esc(p0.label)}"><svg class="i" aria-hidden="true"><use href="#i-phone"/></svg>Call</a>`
             : `<span class="act call off" aria-disabled="true"><svg class="i" aria-hidden="true"><use href="#i-phone"/></svg>No phone</span>`}
        <a class="act" href="${mapUrl(f)}" target="_blank" rel="noopener" data-track="map" aria-label="Open ${esc(f.n)} in Google Maps (new tab)"><svg class="i" aria-hidden="true"><use href="#i-pin"/></svg>Map</a>
        <button type="button" class="act more" data-act="more" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${esc(f.n)}" title="More: share, copy, note, tag"><svg class="i" aria-hidden="true"><use href="#i-more"/></svg></button>
      </div>
    </div>
  </article>`;
}
function groupKey(f){
  switch (state.group) {
    case "type": return f.tl;
    case "brand": return f.b || "Independent / other";
    case "gov": return f.r;
    case "az": return f.letter;
    case "none": return "All results";
    default: return f.d;
  }
}
function groupOrder(keys, counts){
  if (state.group === "type") return keys.sort((a,b) => TYPE_ORDER.findIndex(t => TYPES[t].label === a) - TYPE_ORDER.findIndex(t => TYPES[t].label === b));
  if (state.group === "brand") return keys.sort((a,b) => (a.startsWith("Independent") - b.startsWith("Independent")) || counts[b] - counts[a] || a.localeCompare(b));
  if (state.group === "district") return keys.sort((a,b) => (GOV_OF[a] || "").localeCompare(GOV_OF[b] || "") || (a.startsWith("Other") - b.startsWith("Other")) || a.localeCompare(b));
  return keys.sort((a,b) => (a === "#") - (b === "#") || a.localeCompare(b));
}
function sorter(){
  const byName = (a,b) => a.n.localeCompare(b.n, undefined, {sensitivity:"base", numeric:true});
  switch (state.sort) {
    case "name-desc": return (a,b) => -byName(a,b);
    case "type": return (a,b) => TYPE_ORDER.indexOf(a.t) - TYPE_ORDER.indexOf(b.t) || byName(a,b);
    case "fav": return (a,b) => (favs.has(b.id) - favs.has(a.id)) || byName(a,b);
    default: return byName;
  }
}
const slug = s => "g-" + s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function render(opts = {}){
  const m = queryMatcher();
  const recIdx = {}; recent.forEach((r, i) => recIdx[r.id] = i);
  const list = DATA.filter(f => passes(f, m)).sort(state.show === "recent" ? (a,b) => recIdx[a.id] - recIdx[b.id] : sorter());
  const terms = state.q.trim().split(/\s+/).filter(t => t.length > 1);
  renderSidebar(m); renderTypeStrip(m); renderChips();
  const res = $("#results");
  res.classList.toggle("list-view", state.view === "list");
  $$("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === state.view));

  const total = DATA.length;
  $("#count").innerHTML = list.length === total
    ? `<strong>${total.toLocaleString()}</strong> facilities in ${esc(AREA)}`
    : `Showing <strong>${list.length.toLocaleString()}</strong> of ${total.toLocaleString()} facilities`;

  if (!list.length) {
    const sugg = [];
    if (state.q) sugg.push(`<li><button type="button" class="btn" data-rm="q">Clear search “${esc(state.q)}”</button></li>`);
    if (state.type.size) sugg.push(`<li><button type="button" class="btn" data-rm="type" data-v="*">Remove type filter</button></li>`);
    if (state.dist.size) sugg.push(`<li><button type="button" class="btn" data-rm="dist" data-v="*">Remove district filter</button></li>`);
    if (state.brand.size) sugg.push(`<li><button type="button" class="btn" data-rm="brand" data-v="*">Remove brand filter</button></li>`);
    if (state.gov.size) sugg.push(`<li><button type="button" class="btn" data-rm="gov" data-v="*">Remove governorate filter</button></li>`);
    if (state.tag.size) sugg.push(`<li><button type="button" class="btn" data-rm="tag" data-v="*">Remove tag filter</button></li>`);
    if (state.show !== "all") sugg.push(`<li><button type="button" class="btn" data-rm="show">Show all, not only ${{fav:"favourites", notes:"notes", recent:"recent"}[state.show]}</button></li>`);
    const emptyMsg = state.show === "fav" && !favs.size ? "You haven’t starred any facility yet — tap the ☆ on a card to save it."
      : state.show === "recent" && !recent.length ? "Nothing here yet — facilities you call, map, copy or share will appear here, newest first."
      : state.show === "notes" && !Object.keys(notes).length ? "No notes yet — use ⋯ More → Add note on any facility."
      : "Try fewer words, a different spelling, or loosen a filter:";
    res.innerHTML = `<div class="empty" role="status"><svg class="i" style="width:48px;height:48px;color:var(--muted)" aria-hidden="true"><use href="#i-search"/></svg>
      <h2>No facilities match</h2><p>${emptyMsg}</p>
      <ul>${sugg.join("")}</ul></div>`;
    $("#jumpbar").innerHTML = "";
    announce("No results");
    writeURL();
    return;
  }

  if (state.show === "recent") {
    res.innerHTML = `<div class="group"><div class="recent-head"><h2><svg class="i" aria-hidden="true"><use href="#i-clock"/></svg>Recently used <span class="gcount">${list.length}</span></h2>
      <button type="button" class="btn" id="clearRecent"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg>Clear history</button>
      <p>The last ${RECENT_MAX} facilities you called, mapped, copied or shared — newest first. Stored only on this device.</p></div>
      <div class="grid">${list.map(f => cardHTML(f, terms, recent[recIdx[f.id]])).join("")}</div></div>`;
    $("#jumpbar").innerHTML = "";
    announce(`${list.length} recent`); writeURL();
    if (opts.toTop) window.scrollTo({top: 0, behavior: "auto"});
    return;
  }

  const groups = new Map();
  for (const f of list) { const k = groupKey(f); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  const counts = {}; groups.forEach((v,k) => counts[k] = v.length);
  const keys = groupOrder([...groups.keys()], counts);
  const forceOpen = !!state.q.trim();
  const showGov = state.group === "district";

  res.innerHTML = keys.map(k => {
    const items = groups.get(k);
    const tcount = {}; items.forEach(f => tcount[f.t] = (tcount[f.t] || 0) + 1);
    const dots = state.group === "type" ? "" : `<span class="gdots" aria-hidden="true">${TYPE_ORDER.filter(t => tcount[t]).map(t => `<span title="${TYPES[t].label}" style="--tc:var(--t-${t})"><i></i>${tcount[t]}</span>`).join("")}</span>`;
    const open = forceOpen || !collapsed.has(k);
    return `<details class="group" id="${slug(k)}" data-key="${esc(k)}"${open ? " open" : ""}>
      <summary><svg class="i chev" aria-hidden="true"><use href="#i-chev"/></svg>
        <h2>${esc(k)}${showGov && GOV_OF[k] && !k.startsWith("Other") ? ` <span class="gov">${GOV_OF[k]}</span>` : ""}</h2>
        ${dots}<span class="gcount">${items.length}<span class="sr-only"> facilities</span></span></summary>
      <div class="grid">${items.map(f => cardHTML(f, terms)).join("")}</div></details>`;
  }).join("");

  $("#jumpbar").innerHTML = keys.length > 1
    ? `<span class="lbl" aria-hidden="true">Jump to</span>` + keys.map(k => `<a href="#${slug(k)}" data-jump="${esc(k)}">${esc(k)} <b>${counts[k]}</b></a>`).join("")
    : "";

  announce(`${list.length} result${list.length === 1 ? "" : "s"}`);
  writeURL();
  if (!opts.keepScroll && opts.toTop) window.scrollTo({top: 0, behavior: "auto"});
}

/* ---------- helpers ---------- */
let annT;
function announce(msg){ clearTimeout(annT); annT = setTimeout(() => { $("#announcer").textContent = msg; }, 400); }
let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1800); }
async function copyText(txt){
  try { await navigator.clipboard.writeText(txt); return true; }
  catch(e){
    const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch(_){}
    ta.remove(); return ok;
  }
}
function download(name, content, type){
  const b = new Blob([content], {type}); const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function setHeaderH(){ document.documentElement.style.setProperty("--header-h", $(".app-header").offsetHeight + "px"); }

/* ---------- events ---------- */
let qT;
$("#q").addEventListener("input", e => {
  $("#clearQ").classList.toggle("show", !!e.target.value);
  clearTimeout(qT); qT = setTimeout(() => { state.q = e.target.value; render({toTop:true}); }, 140);
});
$("#clearQ").addEventListener("click", () => { $("#q").value = ""; state.q = ""; $("#clearQ").classList.remove("show"); render(); $("#q").focus(); });
$("#distSearch").addEventListener("input", () => renderSidebar(queryMatcher()));
$("#brandSearch").addEventListener("input", () => renderSidebar(queryMatcher()));

$("#sidebar").addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.f) { const s = state[t.dataset.f]; t.checked ? s.add(t.value) : s.delete(t.value); render({toTop:true}); restoreFocus(t.id); }
  if (t.name === "show") { state.show = t.value; render({toTop:true}); }
});
function restoreFocus(id){ const el = document.getElementById(id); if (el) el.focus({preventScroll:true}); }

$$("[data-clear]").forEach(b => b.addEventListener("click", () => { state[b.dataset.clear].clear(); render(); }));
function clearAll(){
  state.q = ""; $("#q").value = ""; $("#clearQ").classList.remove("show");
  ["type","gov","dist","brand","tag"].forEach(k => state[k].clear()); state.show = "all";
  $("#distSearch").value = ""; $("#brandSearch").value = "";
  render({toTop:true}); toast("All filters cleared");
}
$("#clearAll2").addEventListener("click", clearAll);

document.addEventListener("click", e => {
  const rm = e.target.closest("[data-rm]");
  if (rm) {
    const k = rm.dataset.rm, v = rm.dataset.v;
    if (k === "q") { state.q = ""; $("#q").value = ""; $("#clearQ").classList.remove("show"); }
    else if (k === "show") state.show = "all";
    else if (v === "*") state[k].clear();
    else state[k].delete(v);
    render(); $("#results").focus({preventScroll:true}); return;
  }
  if (e.target.closest("#clearAll")) { clearAll(); return; }
  const tc = e.target.closest(".tcard");
  if (tc) { const t = tc.dataset.type; state.type.has(t) ? state.type.delete(t) : state.type.add(t); render({toTop:true}); const n = $(`.tcard[data-type="${t}"]`); if (n) n.focus({preventScroll:true}); return; }
  const j = e.target.closest("[data-jump]");
  if (j) { const d = document.getElementById(slug(j.dataset.jump)); if (d) { d.open = true; collapsed.delete(j.dataset.jump); } return; }

  if (e.target.closest("#clearRecent")) { recent = []; LS.set("recent", recent); render(); toast("Recent history cleared"); return; }
  const vb = e.target.closest("[data-view]");
  if (vb) { state.view = vb.dataset.view; LS.set("view", state.view); render({keepScroll:true}); return; }
  const mi = e.target.closest("[data-mact]");
  if (mi) { menuAction(mi.dataset.mact); return; }
  const sg = e.target.closest("[data-addtag]");
  if (sg) { addTag(sg.closest(".card").dataset.id, sg.dataset.addtag); return; }

  const link = e.target.closest('a[href^="tel:"], a[data-track]');
  if (link) { const c = link.closest(".card"); const lf = c && DATA.find(x => x.id === c.dataset.id); if (lf) track(lf, link.dataset.track || "call"); return; }

  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest(".card"); const f = card ? DATA.find(x => x.id === card.dataset.id) : null;
  const act = btn.dataset.act;
  if (act === "dist" || act === "brand" || act === "tagf") {
    const k = act === "tagf" ? "tag" : act;
    state[k].clear(); state[k].add(btn.dataset.v); render({toTop:true});
    toast(`Filtered to ${act === "tagf" ? "#" : ""}${btn.dataset.v}`); return;
  }
  if (!f) return;
  if (act === "expand") {
    if (state.view !== "list") return;
    if (btn.classList.contains("c-head") && e.target.closest("button, a")) return;
    const open = !card.classList.contains("open");
    card.classList.toggle("open", open); open ? openCards.add(f.id) : openCards.delete(f.id);
    const xb = card.querySelector(".c-expand"); xb.setAttribute("aria-expanded", open); xb.setAttribute("aria-label", `${open ? "Hide" : "Show"} details of ${f.n}`);
    return;
  }
  if (act === "fav") {
    favs.has(f.id) ? favs.delete(f.id) : favs.add(f.id); LS.set("favs", [...favs]);
    const on = favs.has(f.id);
    btn.setAttribute("aria-pressed", on); btn.setAttribute("aria-label", `${on ? "Remove from" : "Add to"} favourites: ${f.n}`); btn.title = `${on ? "Remove from" : "Add to"} favourites`;
    card.classList.toggle("fav", on);
    $("#favCount").textContent = favs.size ? `(${favs.size})` : "";
    toast(on ? "★ Added to favourites" : "Removed from favourites");
    if (state.show === "fav" && !on) render({keepScroll:true});
  } else if (act === "more") {
    menuOpenFor && menuOpenFor.btn === btn ? closeMenu(true) : openMenu(btn, f);
  } else if (act === "untag") {
    removeTag(f.id, btn.dataset.v);
  }
});

/* ---------- card "More" menu ---------- */
const menu = $("#cardMenu"); let menuOpenFor = null;
function openMenu(btn, f){
  closeMenu(false);
  const note = notes[f.id];
  menu.innerHTML = `<div class="m-title" aria-hidden="true">${esc(f.n)}</div>
    <button type="button" role="menuitem" data-mact="share"><svg class="i" aria-hidden="true"><use href="#i-share"/></svg>Share…</button>
    <button type="button" role="menuitem" data-mact="copy"><svg class="i" aria-hidden="true"><use href="#i-copy"/></svg>Copy details</button>
    <hr>
    <button type="button" role="menuitem" data-mact="note"><svg class="i" aria-hidden="true"><use href="#i-note"/></svg>${note ? "Edit note" : "Add note"}</button>
    <button type="button" role="menuitem" data-mact="tag"><svg class="i" aria-hidden="true"><use href="#i-tag"/></svg>Add tag</button>
    <hr>
    <a role="menuitem" href="https://www.bupaglobal.com/" target="_blank" rel="noopener" data-mact="src"><svg class="i" aria-hidden="true"><use href="#i-ext"/></svg>Insurer website</a>`;
  menu.setAttribute("aria-label", `Actions for ${f.n}`);
  menu.hidden = false;
  const r = btn.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = Math.min(r.right - mw, innerWidth - mw - 8); left = Math.max(8, left);
  let top = r.bottom + 6; if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.left = left + "px"; menu.style.top = top + "px";
  btn.setAttribute("aria-expanded", "true");
  menuOpenFor = {btn, f};
  menu.querySelector("[role=menuitem]").focus();
}
function closeMenu(focusBack){
  if (!menuOpenFor) return;
  menu.hidden = true; menuOpenFor.btn.setAttribute("aria-expanded", "false");
  if (focusBack && document.contains(menuOpenFor.btn)) menuOpenFor.btn.focus({preventScroll:true});
  menuOpenFor = null;
}
function menuAction(a){
  const {f, btn} = menuOpenFor || {}; if (!f) return;
  const card = btn.closest(".card");
  if (a === "src") { closeMenu(false); return; }
  closeMenu(a === "share" || a === "copy");
  if (state.view === "list" && !card.classList.contains("open")) { card.classList.add("open"); openCards.add(f.id); card.querySelector(".c-expand").setAttribute("aria-expanded", "true"); }
  if (a === "share") shareFacility(f);
  else if (a === "copy") copyText(shareText(f)).then(ok => { toast(ok ? "Details copied" : "Copy failed"); if (ok) track(f, "copy"); });
  else if (a === "note") { const box = $("#nb-" + f.id); box.classList.add("open"); box.querySelector("textarea").focus(); }
  else if (a === "tag") openTagBox(f.id);
}
menu.addEventListener("keydown", e => {
  const items = $$("[role=menuitem]", menu); const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
  else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
  else if (e.key === "Tab") closeMenu(false);
});
document.addEventListener("pointerdown", e => { if (menuOpenFor && !menu.contains(e.target) && !menuOpenFor.btn.contains(e.target)) closeMenu(false); });
window.addEventListener("scroll", () => closeMenu(false), {passive:true});
window.addEventListener("resize", () => closeMenu(false));

/* ---------- share / recent ---------- */
function shareText(f){ return `${f.n} (${f.tl})\n📍 ${f.a}\n📞 ${f.tel || "—"}\nArea: ${f.d}, ${f.r}\n🗺️ ${mapUrl(f)}`; }
async function shareFacility(f){
  if (navigator.share) {
    try { await navigator.share({title: f.n, text: shareText(f)}); track(f, "share"); return; }
    catch(err){ if (err && err.name === "AbortError") return; }
  }
  const ok = await copyText(shareText(f));
  toast(ok ? "Share text copied — paste it in WhatsApp or anywhere" : "Copy failed");
  if (ok) track(f, "share");
}
function track(f, a){
  recent = [{id: f.id, a, ts: Date.now()}].concat(recent.filter(r => r.id !== f.id)).slice(0, RECENT_MAX);
  LS.set("recent", recent);
  $("#recentCount").textContent = `(${recent.length})`;
  if (state.show === "recent") setTimeout(() => render({keepScroll:true}), 300);
}

/* ---------- personal tags ---------- */
const cleanTag = t => String(t).replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, 30);
function openTagBox(id){
  const box = $("#tb-" + id); if (!box) return;
  const mine = (tags[id] || []).map(t => t.toLowerCase());
  const sugg = Object.entries(tagCounts()).filter(([t]) => !mine.includes(t.toLowerCase())).sort((a,b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  const starters = ["my lab", "kids", "near home", "near work", "trusted", "24h"].filter(t => !mine.includes(t) && !sugg.some(s => s.toLowerCase() === t));
  const chips = sugg.concat(sugg.length < 4 ? starters.slice(0, 6 - sugg.length) : []);
  box.innerHTML = `<form data-tagform="${id}"><label class="sr-only" for="ti-${id}">New tag</label>
      <input id="ti-${id}" list="tagList" maxlength="30" autocomplete="off" placeholder="Type a tag, e.g. my lab">
      <button type="submit" class="btn primary">Add</button><button type="button" class="btn" data-closetag aria-label="Close tag editor"><svg class="i"><use href="#i-x"/></svg></button></form>
    ${chips.length ? `<div class="tag-sugg" aria-label="Suggestions">${chips.map(t => `<button type="button" data-addtag="${esc(t)}">+ ${esc(t)}</button>`).join("")}</div>` : ""}`;
  box.classList.add("open");
  $("#ti-" + id).focus();
}
function addTag(id, raw){
  const t = cleanTag(raw); if (!t) return;
  const list = tags[id] || [];
  const existing = Object.keys(tagCounts()).find(x => x.toLowerCase() === t.toLowerCase());
  const name = existing || t;
  if (!list.some(x => x.toLowerCase() === name.toLowerCase())) list.push(name);
  tags[id] = list; LS.set("tags", tags);
  render({keepScroll:true}); openTagBox(id);
  toast(`Tagged #${name}`);
}
function removeTag(id, t){
  tags[id] = (tags[id] || []).filter(x => x !== t); if (!tags[id].length) delete tags[id];
  LS.set("tags", tags);
  if (state.tag.has(t) && !tagCounts()[t]) state.tag.delete(t);
  render({keepScroll:true}); toast(`Removed #${t}`);
}
document.addEventListener("submit", e => {
  const fm = e.target.closest("[data-tagform]"); if (!fm) return;
  e.preventDefault(); addTag(fm.dataset.tagform, fm.querySelector("input").value);
});
document.addEventListener("click", e => {
  const c = e.target.closest("[data-closetag]"); if (!c) return;
  const box = c.closest(".tag-box"); box.classList.remove("open"); box.innerHTML = "";
});
let noteT;
document.addEventListener("input", e => {
  const ta = e.target.closest("[data-note]"); if (!ta) return;
  clearTimeout(noteT);
  noteT = setTimeout(() => {
    const v = ta.value.trim(); if (v) notes[ta.dataset.note] = v; else delete notes[ta.dataset.note];
    LS.set("notes", notes);
    const card = ta.closest(".card"); let prev = card.querySelector(".note-prev");
    if (v) { if (!prev) { prev = document.createElement("p"); prev.className = "note-prev"; card.querySelector(".note-box").before(prev); } prev.textContent = v; }
    else if (prev) prev.remove();
    const nc = Object.keys(notes).length; $("#noteCount").textContent = nc ? `(${nc})` : "";
    announce("Note saved");
  }, 400);
});
$("#results").addEventListener("toggle", e => {
  const d = e.target; if (!d.matches || !d.matches("details.group")) return;
  d.open ? collapsed.delete(d.dataset.key) : collapsed.add(d.dataset.key);
}, true);
$("#expandAll").addEventListener("click", () => { collapsed.clear(); $$("details.group").forEach(d => d.open = true); announce("All groups expanded"); });
$("#collapseAll").addEventListener("click", () => { $$("details.group").forEach(d => { d.open = false; collapsed.add(d.dataset.key); }); announce("All groups collapsed"); });
$("#groupBy").addEventListener("change", e => { state.group = e.target.value; LS.set("group", state.group); collapsed.clear(); render({toTop:true}); });
$("#sortBy").addEventListener("change", e => { state.sort = e.target.value; render(); });
$("#copyLink").addEventListener("click", () => copyText(location.href).then(ok => toast(ok ? "Link to this view copied" : "Copy failed")));
$("#printBtn").addEventListener("click", () => window.print());
window.addEventListener("beforeprint", () => $$("details.group").forEach(d => { d.dataset.wasOpen = d.open; d.open = true; }));
window.addEventListener("afterprint", () => $$("details.group").forEach(d => { d.open = d.dataset.wasOpen === "true"; }));

$("#exportCsv").addEventListener("click", () => {
  const m = queryMatcher(); const recIdx = {}; recent.forEach((r, i) => recIdx[r.id] = i);
  const list = DATA.filter(f => passes(f, m)).sort(state.show === "recent" ? (a,b) => recIdx[a.id] - recIdx[b.id] : sorter());
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Name","Type","District","Governorate","Brand","Address","Phone","Favourite","My tags","My note","Google Maps"]]
    .concat(list.map(f => [f.n, f.tl, f.d, f.r, f.b, f.a, f.tel, favs.has(f.id) ? "Yes" : "", (tags[f.id] || []).join(", "), notes[f.id] || "", mapUrl(f)]));
  download(`medical-network-${SLUG}-${list.length}.csv`, "\ufeff" + rows.map(r => r.map(q).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  toast(`Exported ${list.length} rows`);
});
$("#exportData").addEventListener("click", () => {
  download(`medical-network-${SLUG}-my-data.json`, JSON.stringify({favs:[...favs], notes, tags, recent, exported:new Date().toISOString()}, null, 2), "application/json");
  toast("Backup downloaded");
});
$("#importLbl").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#importFile").click(); } });
$("#importFile").addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    (d.favs || []).forEach(id => favs.add(id)); notes = Object.assign({}, notes, d.notes || {});
    for (const id in (d.tags || {})) {
      const cur = tags[id] || [];
      for (const t of d.tags[id]) if (!cur.some(x => x.toLowerCase() === String(t).toLowerCase())) cur.push(cleanTag(t));
      if (cur.length) tags[id] = cur;
    }
    if (Array.isArray(d.recent)) {
      const seen = new Set();
      recent = recent.concat(d.recent).filter(r => r && r.id && r.ts).sort((a,b) => b.ts - a.ts).filter(r => !seen.has(r.id) && seen.add(r.id)).slice(0, RECENT_MAX);
    }
    LS.set("favs", [...favs]); LS.set("notes", notes); LS.set("tags", tags); LS.set("recent", recent);
    render({keepScroll:true}); toast("Favourites, notes, tags & recent restored");
  } catch(err) { toast("That file couldn’t be read"); }
  e.target.value = "";
});

/* @@include pdf.js@@ */

/* theme */
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  $("#themeBtn").setAttribute("aria-pressed", t === "dark");
  $("#themeBtn").innerHTML = `<svg class="i" aria-hidden="true"><use href="#i-${t === "dark" ? "sun" : "moon"}"/></svg>`;
  $("#themeBtn").setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
}
applyTheme(LS.get("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("#themeBtn").addEventListener("click", () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; LS.set("theme", t); applyTheme(t); });

/* text size */
const SIZES = [87.5, 100, 112.5, 125, 137.5, 150];
let fsIdx = SIZES.indexOf(LS.get("fontSize", 100)); if (fsIdx < 0) fsIdx = 1;
function applyFont(){ document.documentElement.style.fontSize = SIZES[fsIdx] + "%"; LS.set("fontSize", SIZES[fsIdx]); setHeaderH(); $("#fontDown").disabled = fsIdx === 0; $("#fontUp").disabled = fsIdx === SIZES.length - 1; }
$("#fontDown").addEventListener("click", () => { if (fsIdx > 0) { fsIdx--; applyFont(); announce(`Text size ${SIZES[fsIdx]}%`); } });
$("#fontUp").addEventListener("click", () => { if (fsIdx < SIZES.length - 1) { fsIdx++; applyFont(); announce(`Text size ${SIZES[fsIdx]}%`); } });
$("#fontReset").addEventListener("click", () => { fsIdx = 1; applyFont(); announce("Text size reset"); });

/* mobile drawer */
function drawer(open){
  $("#sidebar").classList.toggle("open", open); $("#backdrop").classList.toggle("show", open);
  $("#openFilters").setAttribute("aria-expanded", open);
  if (open) $("#sidebar").querySelector("input, button").focus(); else $("#openFilters").focus();
}
$("#openFilters").addEventListener("click", () => drawer(true));
$("#closeFilters").addEventListener("click", () => drawer(false));
$("#backdrop").addEventListener("click", () => drawer(false));

/* help */
const dlg = $("#helpDlg");
$("#helpBtn").addEventListener("click", () => dlg.showModal());
dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });

/* back to top */
const toTop = $("#toTop");
function goTop(){ window.scrollTo({top:0, behavior: reduceMotion() ? "auto" : "smooth"}); $("#q").focus({preventScroll:true}); }
toTop.addEventListener("click", goTop);

/* keyboard */
document.addEventListener("keydown", e => {
  const tag = (e.target.tagName || "").toLowerCase();
  const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
  if (e.key === "Escape") {
    if (dlg.open) return;
    if (menuOpenFor) { closeMenu(true); return; }
    if ($("#sidebar").classList.contains("open")) { drawer(false); return; }
    if (e.target === $("#q") && $("#q").value) { $("#clearQ").click(); return; }
    if (typing) { e.target.blur(); return; }
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); $("#q").focus(); $("#q").select(); }
  else if (e.key === "?") { e.preventDefault(); dlg.showModal(); }
  else if (e.key === "t" || e.key === "T") { e.preventDefault(); goTop(); }
});

/* scroll: back-to-top visibility + memory */
let scT;
window.addEventListener("scroll", () => {
  toTop.classList.toggle("show", window.scrollY > 600);
  clearTimeout(scT); scT = setTimeout(() => LS.set("scroll", {k: location.search, y: Math.round(window.scrollY)}), 200);
}, {passive:true});
window.addEventListener("resize", setHeaderH);

/* ---------- init ---------- */
readURL();
$("#q").value = state.q; $("#clearQ").classList.toggle("show", !!state.q);
$("#groupBy").value = state.group; $("#sortBy").value = state.sort;
applyFont(); setHeaderH();
$("#footStats").innerHTML = `<strong>${DATA.length.toLocaleString()}</strong> facilities · <strong>${ALL_DISTRICTS.filter(d => !d.startsWith("Other")).length}</strong> districts · <strong>${TYPE_ORDER.length}</strong> facility types · ${esc(AREA)} · snapshot __SNAPSHOT__`;

/* unofficial notice (dismissible, shown again when the data snapshot changes) */
if (LS.get("noticeSeen", "") !== "__SNAPSHOT__") $("#notice").hidden = false;
$("#noticeClose").addEventListener("click", () => { $("#notice").hidden = true; LS.set("noticeSeen", "__SNAPSHOT__"); $("#q").focus({preventScroll:true}); });

/* installable app (only when served over http/https, e.g. GitHub Pages) */
if (/^https?:$/.test(location.protocol)) {
  const man = document.createElement("link"); man.rel = "manifest"; man.href = "manifest.webmanifest"; document.head.appendChild(man);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("#installBtn").hidden = false; });
  $("#installBtn").addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; $("#installBtn").hidden = true;
    if (r && r.outcome === "accepted") toast("Installed — find it on your home screen");
  });
  window.addEventListener("appinstalled", () => { $("#installBtn").hidden = true; });
}
render();
const sc = LS.get("scroll", null);
if (sc && sc.k === location.search && sc.y > 0 && !location.hash) {
  requestAnimationFrame(() => window.scrollTo({top: sc.y, behavior: "auto"}));
}
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
})();
