/* ---------- PDF export (jsPDF + AutoTable, embedded) ----------
   Not a standalone script: build.py inserts this file into app.js at "@@include pdf.js@@",
   so it shares app.js scope (DATA, state, favs, notes, tags, LS, $, esc, toast, ...). */
const PDFX = (() => {
  const dlgP = $("#pdfDlg"), frame = $("#pdfFrame"), msg = $("#pdfMsg"), info = $("#pdfInfo"), form = $("#pdfOpts");
  const UA = navigator.userAgent;
  const hasViewer = navigator.pdfViewerEnabled !== false && !/Android|iPhone|iPad|iPod|Mobile/i.test(UA);
  let libReady = false, url = null, fname = "medical-network.pdf", tmr = null, ticket = 0;

  const C = { slate:[15,23,42], slate2:[30,41,59], brand:[15,118,110], cyan:[45,212,191], sky:[227,244,241], sky2:[242,250,248], text:[15,30,43],
    muted:[71,91,104], light:[204,240,234], border:[214,226,227], white:[255,255,255], star:[176,120,0], noteBg:[255,246,214] };
  const TYPE_HEX = {hospital:"#C62828", clinic:"#1565C0", laboratory:"#7B1FA2", pharmacy:"#2E7D32", optical:"#6D4C41",
    dental:"#AD1457", "radiology-centre":"#D35400", "physical-therapy-centre":"#5B7F1A", "diagnostic-centre":"#3949AB"};
  const SHORT = {hospital:"HOSPITAL", clinic:"CLINIC", laboratory:"LAB", pharmacy:"PHARMACY", optical:"OPTICAL", dental:"DENTAL",
    "radiology-centre":"RADIOLOGY", "physical-therapy-centre":"PHYSIO", "diagnostic-centre":"DIAGNOSTIC"};
  const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16));
  const tcol = t => hex(TYPE_HEX[t] || "#0F766E");
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  // Helvetica (WinAnsi) can't render arbitrary Unicode; keep Latin-1 + common punctuation
  const clean = s => String(s ?? "").replace(/→/g, "->").replace(/[★☆]/g, "*")
    .replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, " ").replace(/\s+/g, " ").trim();
  const GH = "https://github.com/shawkyebrahim2514", CLI = "https://github.com/features/copilot/cli";

  function loadLib(){
    if (libReady) return true;
    try {
      const s = document.createElement("script"); s.textContent = $("#pdflib").textContent; document.head.appendChild(s);
      libReady = !!(window.jspdf && window.jspdf.jsPDF && window.autoTable);
    } catch(e) { console.error(e); }
    return libReady;
  }
  function curLabel(){
    const p = [];
    if (state.show !== "all") p.push({fav:"Favourites", notes:"With notes", recent:"Recently used"}[state.show]);
    if (state.type.size) p.push([...state.type].map(t => TYPES[t] ? TYPES[t].plural : t).join(", "));
    if (state.gov.size) p.push([...state.gov].join(" & "));
    if (state.dist.size) p.push([...state.dist].join(", "));
    if (state.brand.size) p.push([...state.brand].map(b => b === "—" ? "Independent" : b).join(", "));
    if (state.tag.size) p.push([...state.tag].map(t => "#" + t).join(" "));
    if (state.q.trim()) p.push(`Search "${state.q.trim()}"`);
    return p.length ? p.join(" · ") : "All facilities";
  }
  function currentList(){
    const m = queryMatcher(); const recIdx = {}; recent.forEach((r, i) => recIdx[r.id] = i);
    return DATA.filter(f => passes(f, m)).sort(state.show === "recent" ? (a,b) => recIdx[a.id] - recIdx[b.id] : sorter());
  }
  function gather(scope){
    const list = scope === "all" ? DATA.slice().sort(sorter())
      : scope === "fav" ? DATA.filter(f => favs.has(f.id)).sort(sorter())
      : currentList();
    if (scope === "cur" && state.show === "recent") return [{key:"Recently used", items:list}];
    const g = new Map(); for (const f of list) { const k = groupKey(f); if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
    const counts = {}; g.forEach((v, k) => counts[k] = v.length);
    return groupOrder([...g.keys()], counts).map(k => ({key:k, items:g.get(k)}));
  }
  const groupNoun = n => (state.show === "recent" ? "list" : {district:"districts", type:"types", brand:"brands", gov:"governorates", az:"letters", none:"group"}[state.group] || "groups") + "";
  function getOpts(){
    const e = form.elements;
    return { scope:e.pscope.value, layout:e.playout.value, orient:e.porient.value, cover:e.pcover.checked, extras:e.pextras.checked };
  }

  function build(o){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:o.orient, unit:"mm", format:"a4", compress:true });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12, CW = W - 2 * M;
    const TOP = 19, BOTTOM = H - 14;
    const groups = gather(o.scope); const total = groups.reduce((n, g) => n + g.items.length, 0);
    const scopeText = o.scope === "all" ? "All facilities" : o.scope === "fav" ? "My favourites" : curLabel();
    const dateStr = new Date().toLocaleDateString("en-GB", {day:"2-digit", month:"short", year:"numeric"});
    doc.setProperties({ title:clean(AREA) + " Medical Network (unofficial)", subject:clean(scopeText), author:"Shawky Ebrahim", creator:"GitHub Copilot CLI", keywords:"Egypt, medical network, hospitals, clinics, labs, pharmacies" });
    doc.setLineHeightFactor(1.15);
    const fill = c => doc.setFillColor(...c), stroke = c => doc.setDrawColor(...c), color = c => doc.setTextColor(...c);
    const font = (style, size) => { doc.setFont("helvetica", style); doc.setFontSize(size); };
    const txt = (s, x, y, opt = {}) => doc.text(s, x, y, Object.assign({baseline:"top"}, opt));
    const opacity = a => { try { doc.setGState(new doc.GState({opacity:a})); } catch(e){} };
    const HEAD = clean(AREA) + " Medical Network";
    const logo = (cx, cy, r) => {   // white rounded tile with a teal medical cross
      fill(C.white); doc.roundedRect(cx - r, cy - r, 2 * r, 2 * r, r * 0.32, r * 0.32, "F");
      fill(C.brand); const a = r * 1.1, b = r * 0.36;
      doc.roundedRect(cx - b / 2, cy - a / 2, b, a, b * 0.25, b * 0.25, "F"); doc.roundedRect(cx - a / 2, cy - b / 2, a, b, b * 0.25, b * 0.25, "F");
    };
    const typeCounts = {}; groups.forEach(g => g.items.forEach(f => typeCounts[f.t] = (typeCounts[f.t] || 0) + 1));
    const typesPresent = TYPE_ORDER.filter(t => typeCounts[t]);
    const groupPages = [];

    /* ---- cover ---- */
    let tocPages = 0;
    if (o.cover) {
      const bandH = o.orient === "landscape" ? 96 : 118;
      for (let i = 0, N = 90; i < N; i++) { fill(mix(C.slate2, C.brand, i / (N - 1))); doc.rect(W * i / N, 0, W / N + 0.5, bandH, "F"); }
      opacity(0.07); fill(C.white); doc.circle(W - 28, 18, 58, "F"); doc.circle(W - 4, bandH - 2, 30, "F"); doc.circle(W * 0.55, bandH + 6, 22, "F"); opacity(1);
      fill(C.cyan); doc.rect(0, bandH, W, 1.6, "F");
      logo(M + 9, 22, 9);
      font("bold", 8.5); color(C.light); doc.text("UNOFFICIAL GUIDE  ·  BUPA GLOBAL NETWORK  ·  EGYPT", M + 23, 22.3, {baseline:"middle", charSpace:0.4});
      font("bold", 36); color(C.white); txt(clean(AREA), M, bandH - 60);
      font("normal", 21); color([222,238,250]); txt("Medical Network Directory", M, bandH - 44);
      font("bold", 9.5); const sl = clean(scopeText); const slFit = doc.splitTextToSize(sl, CW - 14)[0];
      const pw = Math.min(doc.getTextWidth(slFit) + 12, CW); fill(C.white); doc.roundedRect(M, bandH - 24, pw, 9, 4.5, 4.5, "F");
      color(C.slate); doc.text(slFit, M + 6, bandH - 19.4, {baseline:"middle"});

      let y = bandH + 11;
      const stats = [[total.toLocaleString("en-US"), total === 1 ? "facility" : "facilities"], [String(groups.length), groups.length === 1 && state.group !== "none" ? groupNoun().replace(/s$/, "") : groupNoun()],
        [String(typesPresent.length), "facility types"], [dateStr, "generated"]];
      const gap = 4, sw = (CW - gap * 3) / 4;
      stats.forEach(([v, l], i) => {
        const x = M + i * (sw + gap); fill(C.sky); doc.roundedRect(x, y, sw, 21, 3, 3, "F"); fill(C.brand); doc.rect(x, y + 4, 1.2, 13, "F");
        font("bold", i === 3 ? 13 : 21); color(C.brand); txt(v, x + 5, y + (i === 3 ? 5.5 : 3.6));
        font("normal", 8.5); color(C.muted); txt(l.toUpperCase(), x + 5, y + 15, {charSpace:0.3});
      });
      y += 31;
      font("bold", 12); color(C.slate); txt("By facility type", M, y); y += 7.5;
      const cols = o.orient === "landscape" ? 5 : 3, tw = (CW - (cols - 1) * 4) / cols, th = 14;
      typesPresent.forEach((t, i) => {
        const x = M + (i % cols) * (tw + 4), yy = y + Math.floor(i / cols) * (th + 4);
        fill(C.white); stroke(C.border); doc.setLineWidth(0.3); doc.roundedRect(x, yy, tw, th, 2.5, 2.5, "FD");
        fill(tcol(t)); doc.roundedRect(x + 3, yy + 3, 8, 8, 2, 2, "F");
        font("bold", 6); color(C.white); doc.text(SHORT[t].slice(0, 3), x + 7, yy + 7.2, {align:"center", baseline:"middle"});
        font("bold", 10); color(C.text); txt(TYPES[t].plural, x + 14, yy + 2.8);
        font("normal", 8.5); color(C.muted); txt(`${typeCounts[t].toLocaleString("en-US")} ${typeCounts[t] === 1 ? "place" : "places"}`, x + 14, yy + 7.6);
      });
      y += Math.ceil(typesPresent.length / cols) * (th + 4) + 4;
      font("bold", 12); color(C.slate); txt("About this document", M, y); y += 7;
      font("normal", 9); color(C.text);
      const about = [
        `Grouped by ${state.show === "recent" && o.scope === "cur" ? "most recent use" : ({district:"district", type:"facility type", brand:"brand / chain", gov:"governorate", az:"first letter", none:"nothing (single list)"}[state.group])}, ${o.layout === "table" ? "table" : "card"} layout${o.extras ? ", including your private notes and tags" : ""}.`,
        "Facility names link to Google Maps; phone numbers are tappable on phones and tablets.",
        `Unofficial - not affiliated with or endorsed by Bupa. Data: public facility list on bupaglobal.com, snapshot __SNAPSHOT__. Districts and brands are inferred automatically - always confirm your cover with your insurer before treatment.`
      ];
      about.forEach(a => { const L = doc.splitTextToSize(a, CW - 6); fill(C.brand); doc.circle(M + 1.2, y + 1.9, 0.8, "F"); txt(L, M + 5, y); y += L.length * 4.1 + 1.6; });
      // credits
      const cy = H - 22;
      stroke(C.border); doc.setLineWidth(0.3); doc.line(M, cy - 6, W - M, cy - 6);
      const pill = (x, label, strong, link) => {
        font("normal", 8.5); const w1 = doc.getTextWidth(label + " "); font("bold", 8.5); const w2 = doc.getTextWidth(strong);
        const w = w1 + w2 + 10; fill(C.sky); doc.roundedRect(x, cy, w, 9, 4.5, 4.5, "F");
        font("normal", 8.5); color(C.muted); doc.text(label, x + 5, cy + 4.7, {baseline:"middle"});
        font("bold", 8.5); color(C.brand); doc.text(strong, x + 5 + w1, cy + 4.7, {baseline:"middle"});
        doc.link(x, cy, w, 9, {url:link}); return w;
      };
      const w1 = pill(M, "Made by", "Shawky Ebrahim", GH);
      pill(M + w1 + 4, "Generated with", "GitHub Copilot CLI", CLI);
      font("normal", 7.5); color(C.muted); doc.text("github.com/shawkyebrahim2514", W - M, cy + 4.7, {align:"right", baseline:"middle"});

      if (groups.length > 1) {
        const first = Math.floor((BOTTOM - 46) / 7), next = Math.floor((BOTTOM - 34) / 7);
        tocPages = groups.length <= first ? 1 : 1 + Math.ceil((groups.length - first) / next);
        for (let i = 0; i < tocPages; i++) doc.addPage();
      }
      doc.addPage();
    }
    const contentStart = doc.getNumberOfPages();

    /* ---- group heading ---- */
    let y = TOP;
    const newPage = () => { doc.addPage(); y = TOP; };
    function groupHead(g, need){
      if (y + 12 + need > BOTTOM) newPage();
      groupPages.push(doc.getCurrentPageInfo().pageNumber);
      fill(C.sky); doc.roundedRect(M, y, CW, 11, 2, 2, "F"); fill(C.brand); doc.rect(M, y, 1.8, 11, "F");
      font("bold", 12.5); color(C.slate); const name = clean(g.key); txt(name, M + 5, y + 3);
      let x = M + 5 + doc.getTextWidth(name) + 3;
      if (state.group === "district" && GOV_OF[g.key] && !g.key.startsWith("Other")) { font("bold", 7.5); color(C.muted); txt(GOV_OF[g.key].toUpperCase(), x, y + 4.4, {charSpace:0.4}); }
      font("bold", 9); color(C.brand); const cnt = `${g.items.length} ${g.items.length === 1 ? "facility" : "facilities"}`;
      doc.text(cnt, W - M - 4, y + 5.6, {align:"right", baseline:"middle"});
      // type dots
      const tc = {}; g.items.forEach(f => tc[f.t] = (tc[f.t] || 0) + 1);
      let dx = W - M - 6 - doc.getTextWidth(cnt) - 3;
      if (state.group !== "type") [...TYPE_ORDER].reverse().filter(t => tc[t]).forEach(t => {
        font("bold", 7.5); const n = String(tc[t]); const nw = doc.getTextWidth(n);
        color(C.muted); doc.text(n, dx, y + 5.6, {align:"right", baseline:"middle"}); dx -= nw + 2.2;
        fill(tcol(t)); doc.circle(dx, y + 5.5, 1.2, "F"); dx -= 4;
      });
      y += 14;
    }

    /* ---- table layout ---- */
    const LH = 8.5 * 1.15 * 25.4 / 72;
    function tableGroup(g){
      const land = o.orient === "landscape";
      const byDistG = state.group === "district" && !g.key.startsWith("Other");
      const typeW = 21, phoneW = land ? 42 : 33, areaW = byDistG ? (land ? 44 : 30) : (land ? 52 : 36), facW = CW - typeW - phoneW - areaW, pad = 2;
      const rows = g.items.map(f => {
        font("bold", 9); const nameL = doc.splitTextToSize(clean(f.n), facW - pad * 2);
        font("normal", 8.5); const addrL = doc.splitTextToSize(clean(f.a), facW - pad * 2);
        let extra = [];
        if (o.extras) {
          if ((tags[f.id] || []).length) extra.push({k:"tag", L:doc.splitTextToSize(tags[f.id].map(t => "#" + clean(t)).join("   "), facW - pad * 2)});
          if (notes[f.id]) extra.push({k:"note", L:doc.splitTextToSize("Note: " + clean(notes[f.id]), facW - pad * 2)});
        }
        const facLines = nameL.concat(addrL, ...extra.map(e => e.L));
        font("bold", 8.5); const phL = f.p.length ? f.p.map(p => ({t:clean(p.label), href:p.href})) : [];
        font("normal", 8.5);
        const aw = areaW - pad * 2, byDist = byDistG;
        const areaL = [];
        if (!byDist) { doc.splitTextToSize(clean(f.d), aw).forEach(t => areaL.push({t, s:"d"})); areaL.push({t:f.r.toUpperCase(), s:"g"}); }
        if (f.b) { font("bold", 8.5); doc.splitTextToSize(clean(f.b), aw).forEach(t => areaL.push({t, s:"b"})); }
        else if (byDist) areaL.push({t:"Independent", s:"i"});
        return [
          {content:"", f},
          {content:facLines.join("\n"), f, nameL, addrL, extra},
          {content:phL.length ? phL.map(p => p.t).join("\n") : "-", f, phL},
          {content:areaL.map(a => a.t).join("\n"), f, areaL}
        ];
      });
      window.autoTable(doc, {
        startY:y, margin:{left:M, right:M, top:TOP, bottom:H - BOTTOM}, theme:"plain",
        head:[["Type", "Facility  (name opens Google Maps)", "Phone", state.group === "district" ? "Brand / chain" : "District / brand"]],
        body:rows, showHead:"everyPage", rowPageBreak:"avoid",
        styles:{font:"helvetica", fontSize:8.5, cellPadding:pad, valign:"top", overflow:"linebreak", textColor:C.text, lineColor:C.border, lineWidth:{bottom:0.2}, minCellHeight:10},
        headStyles:{fillColor:C.slate, textColor:C.white, fontStyle:"bold", fontSize:7.5, cellPadding:{top:2, bottom:2, left:pad, right:pad}, lineWidth:0},
        alternateRowStyles:{fillColor:C.sky2},
        columnStyles:{0:{cellWidth:typeW}, 1:{cellWidth:facW}, 2:{cellWidth:phoneW}, 3:{cellWidth:areaW}},
        willDrawCell:d => { if (d.section === "body") d.cell.text = []; },
        didDrawCell:d => {
          if (d.section !== "body") return;
          const c = d.cell, r = c.raw, f = r.f, x = c.x + pad; let yy = c.y + pad;
          if (d.column.index === 0) {
            fill(tcol(f.t)); doc.rect(c.x, c.y, 1.1, c.height, "F");
            doc.roundedRect(c.x + 2.6, c.y + 2.3, typeW - 4.4, 5, 2.5, 2.5, "F");
            font("bold", 6.3); color(C.white); doc.text(SHORT[f.t] || f.tl.toUpperCase(), c.x + 2.6 + (typeW - 4.4) / 2, c.y + 4.85, {align:"center", baseline:"middle", charSpace:0.2});
          } else if (d.column.index === 1) {
            font("bold", 9); color(C.text); r.nameL.forEach(l => { txt(l, x, yy); yy += LH; });
            const nw = Math.min(Math.max(...r.nameL.map(l => doc.getTextWidth(l))), c.width - pad * 2);
            doc.link(x, c.y + pad, nw, LH * r.nameL.length, {url:mapUrl(f)});
            font("normal", 8.5); color(C.muted); r.addrL.forEach(l => { txt(l, x, yy); yy += LH; });
            r.extra.forEach(e => {
              if (e.k === "tag") { font("bold", 8); color(C.brand); } else { font("italic", 8.5); color(C.star); }
              e.L.forEach(l => { txt(l, x, yy); yy += LH; });
            });
          } else if (d.column.index === 2) {
            if (!r.phL.length) { font("italic", 8.5); color(C.muted); txt("No phone", x, yy); return; }
            font("bold", 8.5); color(C.brand);
            r.phL.forEach(p => { doc.textWithLink(p.t, x, yy, {url:"tel:" + p.href, baseline:"top"}); yy += LH; });
          } else {
            r.areaL.forEach(a => {
              if (a.s === "g") { font("bold", 7); color(C.muted); txt(a.t, x, yy + 0.4, {charSpace:0.3}); }
              else if (a.s === "b") { font("bold", 8.5); color(C.brand); txt(a.t, x, yy); }
              else if (a.s === "i") { font("italic", 8.5); color(C.muted); txt(a.t, x, yy); }
              else { font("normal", 8.5); color(C.text); txt(a.t, x, yy); }
              yy += LH;
            });
          }
        }
      });
      y = doc.lastAutoTable.finalY + 7;
    }

    /* ---- cards layout ---- */
    function cardLayout(f, w){
      const pad = 3.2, iw = w - pad * 2 - 1.5;
      font("bold", 10); const nameL = doc.splitTextToSize(clean(f.n), iw);
      font("normal", 7.8); const subL = doc.splitTextToSize(clean([f.d + ", " + f.r, f.b].filter(Boolean).join("  ·  ")), iw);
      font("normal", 8.2); const addrL = doc.splitTextToSize(clean(f.a), iw);
      font("bold", 8.6); const ph = []; let line = [], lw = 0;
      for (const p of f.p) {
        const t = clean(p.label), w2 = doc.getTextWidth(t);
        if (line.length && lw + 5 + w2 > iw) { ph.push(line); line = []; lw = 0; }
        line.push({t, href:p.href, x:lw ? lw + 5 : 0}); lw += (lw ? 5 : 0) + w2;
      }
      if (line.length) ph.push(line);
      const extra = [];
      if (o.extras) {
        if ((tags[f.id] || []).length) { font("bold", 7.8); extra.push({k:"tag", L:doc.splitTextToSize(tags[f.id].map(t => "#" + clean(t)).join("   "), iw)}); }
        if (notes[f.id]) { font("italic", 8); extra.push({k:"note", L:doc.splitTextToSize(clean(notes[f.id]), iw - 3)}); }
      }
      const L = {type:4.4, name:4.3, sub:3.4, addr:3.55, ph:4.1, ex:3.5};
      let h = pad + L.type + nameL.length * L.name + 0.6 + subL.length * L.sub + 1.6 + addrL.length * L.addr + 1.6 + Math.max(ph.length, 1) * L.ph;
      extra.forEach(e => h += 1.4 + e.L.length * L.ex + (e.k === "note" ? 2 : 0));
      h += pad;
      return { h, draw(x, y0, hh){
        fill(C.white); stroke(C.border); doc.setLineWidth(0.3); doc.roundedRect(x, y0, w, hh, 2.4, 2.4, "FD");
        fill(tcol(f.t)); doc.roundedRect(x, y0, 1.6, hh, 0.8, 0.8, "F");
        let yy = y0 + pad; const xx = x + pad + 1.5;
        fill(tcol(f.t)); doc.circle(xx + 1, yy + 1.45, 1, "F");
        font("bold", 6.8); color(tcol(f.t)); txt(f.tl.toUpperCase(), xx + 3.2, yy, {charSpace:0.35}); yy += L.type;
        font("bold", 10); color(C.text); nameL.forEach(l => { txt(l, xx, yy); yy += L.name; });
        doc.link(xx, yy - L.name * nameL.length, Math.min(iw, Math.max(...nameL.map(l => doc.getTextWidth(l)))), L.name * nameL.length, {url:mapUrl(f)});
        yy += 0.6; font("normal", 7.8); color(C.muted); subL.forEach(l => { txt(l, xx, yy); yy += L.sub; });
        yy += 1.6; font("normal", 8.2); color(C.text); addrL.forEach(l => { txt(l, xx, yy); yy += L.addr; });
        yy += 1.6;
        if (!ph.length) { font("italic", 8.4); color(C.muted); txt("No phone listed", xx, yy); yy += L.ph; }
        else { font("bold", 8.6); color(C.brand); ph.forEach(ln => { ln.forEach(p => doc.textWithLink(p.t, xx + p.x, yy, {url:"tel:" + p.href, baseline:"top"})); yy += L.ph; }); }
        extra.forEach(e => {
          yy += 1.4;
          if (e.k === "tag") { font("bold", 7.8); color(C.brand); e.L.forEach(l => { txt(l, xx, yy); yy += L.ex; }); }
          else { const nh = e.L.length * L.ex + 2; fill(C.noteBg); doc.roundedRect(xx - 0.5, yy - 0.6, iw + 0.5, nh, 1.2, 1.2, "F"); fill(C.star); doc.rect(xx - 0.5, yy - 0.6, 0.8, nh, "F");
            font("italic", 8); color([92,64,0]); e.L.forEach(l => { txt(l, xx + 2, yy + 0.4); yy += L.ex; }); yy += 2; }
        });
      }};
    }
    function cardsGroup(g){
      const cols = o.orient === "landscape" ? 3 : 2, gap = 4, w = (CW - gap * (cols - 1)) / cols;
      const items = g.items.map(f => cardLayout(f, w));
      const rows = []; for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
      rows.forEach((row, ri) => {
        const rh = Math.max(...row.map(c => c.h));
        if (ri === 0) groupHead(g, rh); else if (y + rh > BOTTOM) newPage();
        row.forEach((c, i) => c.draw(M + i * (w + gap), y, rh));
        y += rh + gap;
      });
      y += 3;
    }

    if (!groups.length) { font("normal", 12); color(C.muted); txt("No facilities to show for this selection.", M, TOP + 10); }
    groups.forEach(g => {
      if (o.layout === "cards") cardsGroup(g);
      else { groupHead(g, 22); tableGroup(g); }
    });

    /* ---- contents ---- */
    if (tocPages) {
      let p = 2; doc.setPage(p); let ty = TOP + 4;
      font("bold", 20); color(C.slate); txt("Contents", M, ty); ty += 10;
      font("normal", 9); color(C.muted); txt(`${groups.length} ${groupNoun()} · ${total.toLocaleString("en-US")} facilities · click any row to jump to it`, M, ty); ty += 9;
      groups.forEach((g, i) => {
        if (ty + 7 > BOTTOM) { p++; doc.setPage(p); ty = TOP + 4; }
        const pg = groupPages[i], rowY = ty;
        if (i % 2 === 0) { fill(C.sky2); doc.rect(M, rowY - 1.6, CW, 7, "F"); }
        font("bold", 10); color(C.text); const nm = clean(g.key); txt(nm, M + 3, rowY);
        let nx = M + 3 + doc.getTextWidth(nm) + 2.5;
        if (state.group === "district" && GOV_OF[g.key] && !g.key.startsWith("Other")) { font("bold", 6.8); color(C.muted); txt(GOV_OF[g.key].toUpperCase(), nx, rowY + 1, {charSpace:0.3}); nx += doc.getTextWidth(GOV_OF[g.key].toUpperCase()) + 4; }
        font("normal", 9); color(C.muted); const cnt = String(g.items.length);
        const rx = W - M - 3; font("bold", 10); color(C.brand); doc.text(String(pg - (o.cover ? 0 : 0)), rx, rowY, {align:"right", baseline:"top"});
        font("normal", 8.5); color(C.muted); doc.text(cnt + (g.items.length === 1 ? " facility" : " facilities"), rx - 14, rowY + 0.5, {align:"right", baseline:"top"});
        const lx2 = rx - 16 - doc.getTextWidth(cnt + " facilities");
        stroke([190,205,220]); doc.setLineWidth(0.3); doc.setLineDashPattern([0.3, 1.2], 0); if (lx2 > nx + 2) doc.line(nx + 1, rowY + 3.2, lx2, rowY + 3.2); doc.setLineDashPattern([], 0);
        doc.link(M, rowY - 1.6, CW, 7, {pageNumber:pg});
        ty += 7;
      });
    }

    /* ---- running header & footer ---- */
    const N = doc.getNumberOfPages();
    for (let p = o.cover ? 2 : 1; p <= N; p++) {
      doc.setPage(p);
      fill(C.slate); doc.rect(0, 0, W, 11, "F"); fill(C.brand); doc.rect(0, 11, W, 0.9, "F");
      logo(M + 3.2, 5.5, 3.4);
      font("bold", 9); color(C.white); doc.text(HEAD, M + 8.5, 5.6, {baseline:"middle"});
      const tw0 = doc.getTextWidth(HEAD);
      font("normal", 8); color(C.light);
      const st = doc.splitTextToSize(clean(scopeText), W - 2 * M - tw0 - 50)[0];
      doc.text("·  " + st, M + 10.5 + tw0, 5.6, {baseline:"middle"});
      doc.text(dateStr, W - M, 5.6, {align:"right", baseline:"middle"});
      stroke(C.border); doc.setLineWidth(0.25); doc.line(M, H - 10, W - M, H - 10);
      font("normal", 7); color(C.muted); doc.text("Made by ", M, H - 6, {baseline:"middle"});
      let fx = M + doc.getTextWidth("Made by "); font("bold", 7); color(C.brand);
      doc.textWithLink("Shawky Ebrahim", fx, H - 6, {url:GH, baseline:"middle"}); fx += doc.getTextWidth("Shawky Ebrahim");
      font("normal", 7); color(C.muted); doc.text("  ·  Generated with ", fx, H - 6, {baseline:"middle"}); fx += doc.getTextWidth("  ·  Generated with ");
      font("bold", 7); color(C.brand); doc.textWithLink("GitHub Copilot CLI", fx, H - 6, {url:CLI, baseline:"middle"}); fx += doc.getTextWidth("GitHub Copilot CLI");
      font("bold", 7.5); const pgTxt = `Page ${p} of ${N}`, pgX = W - M - doc.getTextWidth(pgTxt);
      font("normal", 7); color(C.muted);
      const room = pgX - fx - 12;
      const mid = ["Unofficial guide to the Bupa Global network · data snapshot __SNAPSHOT__", "Unofficial guide · Bupa Global network · __SNAPSHOT__", "Unofficial · __SNAPSHOT__"]
        .find(t => doc.getTextWidth(t) <= room);
      if (mid) doc.text(mid, fx + 6 + room / 2, H - 6, {baseline:"middle", align:"center"});
      font("bold", 7.5); color(C.slate); doc.text(pgTxt, W - M, H - 6, {align:"right", baseline:"middle"});
    }
    void contentStart;
    return { doc, pages:N, total };
  }

  function showMsg(html){ msg.innerHTML = html; msg.hidden = false; }
  function setBusy(on){ $("#pdfDownload").disabled = on; $("#pdfOpen").disabled = on; if (on) { showMsg(`<div class="spinner" aria-hidden="true"></div><p>Designing your PDF…</p>`); info.textContent = "Building…"; } }
  function regenerate(){
    clearTimeout(tmr);
    const my = ++ticket; setBusy(true);
    tmr = setTimeout(() => {
      if (!loadLib()) { showMsg(`<p>Sorry — the PDF engine couldn’t load in this browser.</p>`); info.textContent = ""; return; }
      const o = getOpts(); LS.set("pdfOpts", o);
      let res;
      try { res = build(o); } catch(err) { console.error(err); showMsg(`<p>Something went wrong while building the PDF.</p><p><small>${esc(err.message || err)}</small></p>`); info.textContent = ""; return; }
      if (my !== ticket) return;
      const blob = res.doc.output("blob");
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      const d = new Date(); const ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      fname = `medical-network-${SLUG}-${{cur:"view", fav:"favourites", all:"all"}[o.scope]}-${o.layout}-${ds}.pdf`;
      info.innerHTML = `<b>${res.pages}</b> page${res.pages === 1 ? "" : "s"} · <b>${res.total.toLocaleString()}</b> facilit${res.total === 1 ? "y" : "ies"} · ${Math.max(1, Math.round(blob.size / 1024)).toLocaleString()} KB`;
      $("#pdfDownload").disabled = !res.total; $("#pdfOpen").disabled = !res.total;
      if (!res.total) { showMsg(`<p><b>Nothing to export.</b></p><p>${o.scope === "fav" ? "You haven’t starred any facility yet." : "Your current filters show no facilities."}</p>`); return; }
      if (hasViewer) { frame.src = url + "#view=FitH"; msg.hidden = true; }
      else showMsg(`<p><b>Your PDF is ready.</b></p><p>This browser can’t preview PDFs inside the page — tap <b>Open in new tab</b> to view it, or <b>Download PDF</b>.</p>`);
    }, 60);
  }
  function open(){
    const saved = LS.get("pdfOpts", null);
    if (saved) { const e = form.elements; e.playout.value = saved.layout || "table"; e.porient.value = saved.orient || "portrait"; e.pcover.checked = saved.cover !== false; e.pextras.checked = saved.extras !== false; }
    form.elements.pscope.value = "cur";
    $("#pdfCurLbl").textContent = `${currentList().length.toLocaleString()} · ${curLabel()}`;
    $("#pdfFavLbl").textContent = favs.size ? `${favs.size.toLocaleString()} starred` : "None starred yet";
    $("#pdfAllLbl").textContent = `${DATA.length.toLocaleString()} · all ${AREA} facilities`;
    form.querySelector('input[value="fav"]').disabled = !favs.size;
    frame.removeAttribute("src");
    dlgP.showModal();
    regenerate();
  }
  form.addEventListener("change", regenerate);
  $("#pdfDownload").addEventListener("click", () => {
    if (!url) return;
    const a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    toast("PDF downloaded");
  });
  $("#pdfOpen").addEventListener("click", () => { if (url) window.open(url, "_blank", "noopener"); });
  dlgP.addEventListener("click", e => { if (e.target === dlgP || e.target.closest("[data-close]")) dlgP.close(); });
  $("#pdfBtn").addEventListener("click", open);
  return { open };
})();

