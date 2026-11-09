// The shop sheet: a printable page set in the order you work, plus the
// small diagrams the app panels reuse.
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function textOn(hex) {
    const n = parseInt((hex || '#999999').slice(1), 16);
    const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.55 ? '#111' : '#fff';
  }

  // Short labels (M, W, C…) so diagrams still read in black and white.
  function codes(speciesList, used) {
    const out = {};
    const taken = new Set();
    for (const id of used) {
      const s = CB.species.byId(speciesList, id);
      const words = s.name.split(/\s+/).filter(Boolean);
      const tries = [words.length > 1 ? words[words.length - 1][0] : s.name[0], s.name.slice(0, 2), words.map((w) => w[0]).join(''), s.name.slice(0, 3)];
      let code = tries.find((t) => t && !taken.has(t.toUpperCase()));
      if (!code) code = String(taken.size + 1);
      code = code[0].toUpperCase() + code.slice(1).toLowerCase();
      taken.add(code.toUpperCase());
      out[id] = code;
    }
    return out;
  }

  // Top view of the board, to scale.
  function boardSvg(r, speciesList, code, maxW = 360) {
    const W = r.board.width;
    const L = r.board.length;
    const s = Math.min(maxW / W, 300 / L);
    const blocks = r.blocks
      .map((b) => {
        const sp = CB.species.byId(speciesList, b.species);
        const label = b.w * s > 14 && b.d * s > 12 ? `<text x="${(b.x + b.w / 2) * s}" y="${(b.y + b.d / 2) * s + 4}" fill="${textOn(sp.color)}">${esc(code[b.species] || '')}</text>` : '';
        const acc = b.accent
          ? `<polygon points="${b.accent.poly.map(([x, y]) => `${x * s},${y * s}`).join(' ')}" fill="${CB.species.byId(speciesList, b.accent.species).color}" stroke="#000" stroke-width="0.3"/>`
          : '';
        const shape = b.poly
          ? `<polygon points="${b.poly.map(([x, y]) => `${(x * s).toFixed(2)},${(y * s).toFixed(2)}`).join(' ')}" fill="${sp.color}" stroke="rgba(0,0,0,.25)" stroke-width="0.4"/>`
          : `<rect x="${b.x * s}" y="${b.y * s}" width="${b.w * s}" height="${b.d * s}" fill="${sp.color}" stroke="rgba(0,0,0,.25)" stroke-width="0.4"/>`;
        return `${shape}${acc}${b.accent || r.tiles ? '' : label}`;
      })
      .join('');
    return `<svg class="diagram" viewBox="-1 -1 ${W * s + 2} ${L * s + 2}" width="${W * s + 2}" height="${L * s + 2}" font-size="10" text-anchor="middle">${blocks}<rect x="0" y="0" width="${W * s}" height="${L * s}" fill="none" stroke="#000" stroke-width="1"/></svg>`;
  }

  // A panel's strip order, left to right, with widths.
  function panelSvg(p, speciesList, code, fmt, maxW = 520) {
    const s = Math.min(maxW / p.width, 18);
    const h = 46;
    let x = 0;
    const parts = p.strips
      .map((st, i) => {
        const sp = CB.species.byId(speciesList, st.species);
        const w = st.rip * s;
        const out = `<rect x="${x}" y="0" width="${w}" height="${h}" fill="${sp.color}" stroke="#000" stroke-width="0.8"/>
          ${w > 12 ? `<text x="${x + w / 2}" y="${h / 2 + 4}" fill="${textOn(sp.color)}">${esc(code[st.species] || '')}</text>` : ''}
          <text x="${x + w / 2}" y="${h + 13}" class="num">${i + 1}${st.rot ? ` \u21bb${st.rot}\u00b0` : ''}${st.flip ? ' \u21c4' : ''}</text>`;
        x += w;
        return out;
      })
      .join('');
    return `<svg class="diagram" viewBox="-1 -1 ${x + 2} ${h + 18}" width="${x + 2}" height="${h + 18}" font-size="10" text-anchor="middle">${parts}</svg>`;
  }

  // The slice order for glue-up 2.
  function rowsSvg(r, fmt, maxW = 260) {
    const total = r.board.length;
    const s = Math.min(300 / total, 30);
    let y = 0;
    const shift = r.shift || 0;
    const shiftPx = shift ? 18 : 0;
    const items = r.rows
      .map((row, i) => {
        const h = row.thickness * s;
        const off = row.offset ? shiftPx : 0;
        const out = `<rect x="${off}" y="${y}" width="${140}" height="${h}" fill="#fff" stroke="#000" stroke-width="0.8"/>
          <text x="${off + 70}" y="${y + h / 2 + 4}">${i + 1} · ${esc(row.name)}${row.flip ? ' · flip' : ''}${row.offset ? ' · shift' : ''}</text>`;
        y += h;
        return out;
      })
      .join('');
    return `<svg class="diagram" viewBox="-1 -1 ${142 + shiftPx} ${y + 2}" width="${142 + shiftPx}" height="${y + 2}" font-size="10" text-anchor="middle">${items}</svg>`;
  }

  // "Turn sticks 2, 4 and 6 a quarter turn clockwise…"
  function turnNote(p) {
    const by = {};
    p.strips.forEach((st, i) => {
      if (st.rot) (by[st.rot] = by[st.rot] || []).push(i + 1);
    });
    const words = { 90: 'a quarter turn clockwise (90\u00b0)', 180: 'half a turn (180\u00b0)', 270: 'a quarter turn counter-clockwise (270\u00b0)' };
    const lines = Object.entries(by).map(([deg, list]) => `Turn stick${list.length > 1 ? 's' : ''} ${list.join(', ')} ${words[deg]} on its long axis before gluing, looking at the same end of every stick.`);
    const flips = p.strips.map((st, i) => (st.flip ? i + 1 : 0)).filter(Boolean);
    if (flips.length) lines.unshift(`Flip stick${flips.length > 1 ? 's' : ''} ${flips.join(', ')} end for end first, so ${flips.length > 1 ? 'their' : 'its'} end face is mirrored.`);
    return lines.length ? `<p><b>${lines.join(' ')}</b></p>` : '';
  }

  function accentSection(r, speciesList, fmt) {
    if (!r.accent) return '';
    const A = r.accent;
    const S = r.settings;
    const box = '<span class="box"></span>';
    const rows = r.panels
      .filter((p) => p.accentPrep)
      .map((p) => {
        const per = {};
        for (const sp of p.accentPrep.strips) per[sp] = (per[sp] || 0) + 1;
        const list = Object.entries(per).map(([sp, n]) => `${n} \u00d7 ${esc(CB.species.byId(speciesList, sp).name)}`).join(', ');
        return `<tr><td>${box}</td><td>${esc(p.name)}</td><td>${p.accentPrep.sticks}</td><td>${list}</td><td>${fmt(A.thickness)} \u00d7 ${fmt(p.accentPrep.stripWidth)} \u00d7 ${fmt(p.length)}</td></tr>`;
      })
      .join('');
    const gain = A.thickness - S.kerfRip;
    const note =
      Math.abs(gain) < 0.01
        ? `The ${fmt(A.thickness)} accent fills the ${fmt(S.kerfRip)} kerf exactly, so each stick keeps its size.`
        : gain < 0
        ? `The accent is ${fmt(-gain)} thinner than the kerf, so those sticks are listed oversize to make up for it.`
        : `The accent is ${fmt(gain)} thicker than the kerf, so joint the sticks back to size after gluing.`;
    return `<section class="keep">
        <h2>Before glue-up 1: angled accents</h2>
        <p>Rip each stick lengthwise at <b>${A.angle}\u00b0</b> from its face, ${Math.abs(A.offset) > 0.01 ? `crossing ${Math.round(Math.abs(A.offset) * 100)}% off centre` : 'through the centre'}${A.alternate ? ', mirroring the angle on every other stick' : ''}. Glue the accent strip between the two halves, keep the ends lined up, and let it cure before glue-up 1.</p>
        <table class="grid">
          <thead><tr><th></th><th>Panel</th><th>Sticks to rip</th><th>Accent strips</th><th>Accent size (thick \u00d7 wide \u00d7 long)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="muted">${note}</p>
      </section>`;
  }

  function money(v) {
    return v == null ? '–' : `$${v.toFixed(2)}`;
  }

  // One row panel's end: the sticks in glue order, numbered left to right.
  function rowPanelSvg(pan, speciesList, maxW = 520) {
    const xs = pan.end.flatMap((pc) => pc.poly.map((q) => q[0]));
    const ys = pan.end.flatMap((pc) => pc.poly.map((q) => q[1]));
    const W = Math.max(...xs);
    const H = Math.max(...ys);
    const k = Math.min(maxW / W, 26);
    const hexes = [];
    let num = 0;
    const parts = pan.end
      .map((pc) => {
        if (!pc.border) num += 1;
        const i = num - 1;
        const sp = CB.species.byId(speciesList, pc.species);
        const cx = pc.poly.reduce((a, q) => a + q[0], 0) / pc.poly.length;
        const cy = pc.poly.reduce((a, q) => a + q[1], 0) / pc.poly.length;
        hexes.push(cx);
        return `<polygon points="${pc.poly.map(([x, y]) => `${(x * k).toFixed(1)},${(y * k).toFixed(1)}`).join(' ')}" fill="${sp.color}" stroke="#000" stroke-width="0.7"/>
          ${pc.border ? '' : `<text x="${(cx * k).toFixed(1)}" y="${(cy * k + 4).toFixed(1)}" fill="${textOn(sp.color)}" font-size="${Math.max(8, Math.min(11, k * 0.4))}">${i + 1}</text>`}`;
      })
      .join('');
    return `<svg class="diagram" viewBox="-2 -2 ${W * k + 4} ${H * k + 4}" width="${W * k + 4}" height="${H * k + 4}" text-anchor="middle">${parts}</svg>`;
  }

  // One stick's end, with its sizes, for honeycomb and 3D cubes.
  function stickSvg(t, color, fmt, px = 150) {
    const sh = t.shape;
    const s = t.border ? t.border.coreSide : t.size;
    const k = px / (sh.width + s);
    const pts = t.kind === 'cubes'
      ? [[s / 2, 0], [s * 1.5, 0], [s, sh.thickness], [0, sh.thickness]]
      : [[s / 2, 0], [s * 1.5, 0], [2 * s, sh.thickness / 2], [s * 1.5, sh.thickness], [s / 2, sh.thickness], [0, sh.thickness / 2]];
    const W = (t.kind === 'cubes' ? s * 1.5 : 2 * s) * k;
    const H = sh.thickness * k;
    return `<svg class="diagram" viewBox="-60 -10 ${W + 160} ${H + 44}" width="${W + 160}" height="${H + 44}" font-size="11" text-anchor="middle">
      <polygon points="${pts.map(([x, y]) => `${x * k},${y * k}`).join(' ')}" fill="${color}" stroke="#000" stroke-width="1"/>
      <text x="${s * k}" y="-1">${esc(fmt(s))} side</text>
      <text x="${W / 2}" y="${H + 16}">${esc(fmt(t.kind === 'cubes' ? s : sh.width))} ${t.kind === 'cubes' ? 'along the face' : 'wide'}</text>
      <text x="${W + 8}" y="${H / 2 + 4}" text-anchor="start">${esc(fmt(sh.thickness))} thick</text>
    </svg>`;
  }

  function tileHtml(design, r, speciesList, prefs) {
    const fmt = (mm) => CB.units.format(mm, prefs);
    const S = r.settings;
    const t = r.tiles;
    const cubes = t.kind === 'cubes';
    const code = codes(speciesList, t.woods);
    const box = '<span class="box"></span>';
    const pattern = CB.engine.PATTERNS[design.pattern].label;
    const shape = cubes ? 'diamond' : 'hexagon';
    const lumberRows = r.lumber
      .map((l) =>
        l.pieces
          .map(
            (p, i) => `<tr>${i === 0 ? `<td rowspan="${l.pieces.length}"><i class="sw" style="background:${l.color}"></i>${esc(l.name)}</td>` : ''}
          <td>${esc(p.panel)}</td>
          <td>${fmt(p.thickness)} milled <span class="muted">(${p.rough.laminate ? `${p.rough.layers} × 8/4 laminated` : `${p.rough.quarters}/4 rough`})</span></td>
          <td>${fmt(p.width)}</td><td>${fmt(p.length)}</td>
          ${i === 0 ? `<td rowspan="${l.pieces.length}">${l.bf.toFixed(2)}</td><td rowspan="${l.pieces.length}">${l.bfBuy.toFixed(2)}</td><td rowspan="${l.pieces.length}">${money(l.cost)}</td>` : ''}</tr>`
          )
          .join('')
      )
      .join('');
    const stickRows = r.lumber
      .flatMap((l) => l.rips.map((rp) => `<tr><td>${box}</td><td><i class="sw" style="background:${l.color}"></i>${esc(l.name)}</td><td>${esc(rp.panel)}</td><td>${rp.count}</td><td>${fmt(rp.length)}</td></tr>`))
      .join('');
    const ripSteps = cubes
      ? [
          `Plane each board to ${fmt(t.shape.thickness)} thick. That's the height of a diamond.`,
          'Tilt the blade 30° and rip one edge to set the angle.',
          `Keep the blade tilted and set the fence so each rip makes a diamond ${fmt(t.size)} along the face. Each rip uses ${fmt(t.kerfAngle)} of width at this angle.`,
        ]
      : [
          `Plane each board to ${fmt(t.shape.thickness)} thick (across the flats).`,
          `Rip blanks ${fmt(t.shape.width)} wide (point to point).`,
          `Tilt the blade 30\u00b0 and bevel all four corners, so every side is ${fmt(t.border ? t.border.coreSide : t.size)}.`,
        ];
    const B = t.border;
    const borderSection = B
      ? `<section class="keep">
        <h2>2b. Add the borders</h2>
        <ol>
          <li>Plane ${esc(CB.species.byId(speciesList, B.species).name)} to ${fmt(B.stripWidth)} thick and rip ${B.strips} border strips ${fmt(B.width)} thick off its edge.</li>
          <li>Glue a strip on every other face of each hexagon (three faces that don't touch). Once cured, trim them flush with the faces next to them.</li>
          <li>Glue strips on the other three faces, then bevel the stick back to a hexagon with ${fmt(B.outerSide)} sides.</li>
        </ol>
        <p class="muted">Each hexagon has its own border, so the line between two hexagons is ${fmt(B.width * 2)}.</p>
      </section>`
      : '';
    const panelBlocks = t.panels
      .map(
        (pan) => `<div class="keep">
        <h3>${box} Row ${esc(pan.name)}: glue ${pan.sticks.length} ${shape} sticks in this order</h3>
        <div class="diagram-wrap">${rowPanelSvg(pan, speciesList)}</div>
        <p>About ${fmt(pan.width)} wide × ${fmt(pan.length)} long. Makes ${pan.slices} slice${pan.slices > 1 ? 's' : ''} (${pan.rows} row${pan.rows > 1 ? 's' : ''} per board).</p>
      </div>`
      )
      .join('');
    const crossRows = t.panels
      .map((pan) => `<tr><td>${box}</td><td>Row ${esc(pan.name)}</td><td>${fmt(S.endTrim)}</td><td>${fmt(t.sliceLength)}</td><td>${pan.slices}</td><td>${pan.slices} × ${fmt(S.kerfCross)} = ${fmt(pan.slices * S.kerfCross)}</td></tr>`)
      .join('');
    const order = t.rows.map((row, i) => `<li>Row ${i + 1}: <b>${esc(row.name)}</b>${row.shift ? `, slid ${fmt(t.half)} over so it nests` : ''}</li>`).join('');
    return `<article class="sheet">
      <header class="sheet-head">
        <div>
          <h1>${esc(design.name)}</h1>
          <p>${esc(pattern)} · ${fmt(r.board.width)} × ${fmt(r.board.length)} × ${fmt(r.board.thickness)} · ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="total">${money(r.total.cost)}${r.total.unpriced.length ? '<small>+ unpriced species</small>' : ''}</div>
      </header>
      <section class="keep summary">
        ${boardSvg(r, speciesList, code)}
        <div>
          <h2>Summary</h2>
          <table class="kv">
            <tr><th>Finished size</th><td>${fmt(r.board.width)} wide × ${fmt(r.board.length)} long × ${fmt(r.board.thickness)} thick</td></tr>
            <tr><th>Sticks</th><td>${t.sticks} long ${shape}s, ${fmt(t.size)} sides</td></tr>
            <tr><th>Row panels</th><td>${t.panels.length} (${t.panels.map((p) => p.name).join(', ')}) · ${t.rows.length} rows per board</td></tr>
            <tr><th>Crosscuts</th><td>${r.total.cuts} slices ${fmt(t.sliceLength)} long · ${fmt(r.total.crossKerf)} lost to kerf</td></tr>
            <tr><th>Lumber</th><td>${r.total.bf.toFixed(2)} bf needed · ${r.total.bfBuy.toFixed(2)} bf to buy (+${S.waste}% waste)</td></tr>
          </table>
          ${r.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
        </div>
      </section>
      <section class="keep">
        <h2>1. Lumber needed</h2>
        <table class="grid">
          <thead><tr><th>Species</th><th>For</th><th>Thickness</th><th>Width</th><th>Length</th><th>bf</th><th>bf to buy</th><th>Cost</th></tr></thead>
          <tbody>${lumberRows}</tbody>
        </table>
      </section>
      <section class="keep">
        <h2>2. Make the long sticks</h2>
        <div class="split">
          ${stickSvg(t, CB.species.byId(speciesList, t.woods[0]).color, fmt)}
          <ol>${ripSteps.map((x) => `<li>${x}</li>`).join('')}</ol>
        </div>
        <table class="grid">
          <thead><tr><th></th><th>Species</th><th>For</th><th>Sticks</th><th>Length</th></tr></thead>
          <tbody>${stickRows}</tbody>
        </table>
      </section>
      ${borderSection}
      <section>
        <h2>3. Glue-up 1: row panels</h2>
        ${panelBlocks}
      </section>
      <section class="keep">
        <h2>4. Crosscuts</h2>
        <table class="grid">
          <thead><tr><th></th><th>Panel</th><th>Square end</th><th>Slice length</th><th>Slices</th><th>Kerf lost</th></tr></thead>
          <tbody>${crossRows}</tbody>
        </table>
      </section>
      <section class="keep">
        <h2>5. Glue-up 2: rows, end grain up</h2>
        <ol>${order}</ol>
        <p>Every other row nests into the one before it. Glue a few rows at a time so they stay tight.</p>
      </section>
      <section class="keep">
        <h2>6. Finishing</h2>
        <ul class="checks">
          <li>${box} Trim the ragged edges to ${fmt(r.board.width)} × ${fmt(r.board.length)}.</li>
          <li>${box} Flatten both faces to ${fmt(r.board.thickness)} thick.</li>
        </ul>
      </section>
    </article>`;
  }

  function html(design, r, speciesList, prefs) {
    if (r.tiles) return tileHtml(design, r, speciesList, prefs);
    const fmt = (mm) => CB.units.format(mm, prefs);
    const S = r.settings;
    const used = [...new Set(r.panels.flatMap((p) => p.strips.map((s) => s.species)).concat(r.blocks.filter((b) => b.accent).map((b) => b.accent.species)))];
    const code = codes(speciesList, used);
    const key = used
      .map((id) => {
        const sp = CB.species.byId(speciesList, id);
        return `<span class="key"><i style="background:${sp.color}"></i>${esc(code[id])} = ${esc(sp.name)}</span>`;
      })
      .join('');
    const box = '<span class="box"></span>';
    const pattern = CB.engine.PATTERNS[design.pattern].label;
    const date = new Date().toLocaleDateString();

    const lumberRows = r.lumber
      .map((l) =>
        l.pieces
          .map(
            (p, i) => `<tr>
          ${i === 0 ? `<td rowspan="${l.pieces.length}"><i class="sw" style="background:${l.color}"></i>${esc(l.name)}</td>` : ''}
          <td>${esc(p.panel)}</td>
          <td>${fmt(p.thickness)} milled <span class="muted">(${p.rough.laminate ? `${p.rough.layers} × 8/4 laminated` : `${p.rough.quarters}/4 rough`})</span></td>
          <td>${fmt(p.width)}</td>
          <td>${fmt(p.length)}</td>
          ${i === 0 ? `<td rowspan="${l.pieces.length}">${l.bf.toFixed(2)}</td><td rowspan="${l.pieces.length}">${l.bfBuy.toFixed(2)}</td><td rowspan="${l.pieces.length}">${money(l.cost)}</td>` : ''}
        </tr>`
          )
          .join('')
      )
      .join('');

    const ripRows = r.lumber
      .map((l) =>
        l.rips
          .map(
            (rp) => `<tr><td>${box}</td><td><i class="sw" style="background:${l.color}"></i>${esc(l.name)}</td><td>${esc(rp.panel)}</td><td>${rp.count}</td><td>${fmt(rp.width)}</td><td>${fmt(rp.length)}</td><td>${fmt(rp.thickness)}</td></tr>`
          )
          .join('')
      )
      .join('');

    const panelBlocks = r.panels
      .map(
        (p) => `<div class="keep">
        <h3>${box} Panel ${esc(p.name)}: glue ${p.strips.length} strips in this order</h3>
        ${panelSvg(p, speciesList, code, fmt)}
        <p>Glued width ${fmt(p.width)} · length ${fmt(p.length)} · plane to ${fmt(p.thickness)} thick (from ${fmt(p.milled)}).
        ${p.strips.length > 1 ? `The two outside strips are ${fmt(S.edgeTrim)} wider for trimming the board's edges.` : ''}</p>
        ${turnNote(p)}
      </div>`
      )
      .join('');

    const crossRows = r.panels
      .map(
        (p) => `<tr><td>${box}</td><td>${esc(p.name)}</td><td>${fmt(S.endTrim)}</td><td>${fmt(p.sliceLength)}</td><td>${p.slices}</td><td>${p.cuts} × ${fmt(S.kerfCross)} = ${fmt(p.crossKerf)}</td></tr>`
      )
      .join('');

    const steps = [];
    const K = r.stack;
    if (K) {
      const pre = K.layers.filter((l) => l.loose).map((l) => `${l.loose} slice${l.loose > 1 ? 's' : ''} off panel ${esc(l.name)}`);
      steps.push(`<b>Stack before crosscutting:</b> ${pre.length ? `first cut ${pre.join(' and ')} for the end rows, then ` : ''}plane the panels and glue ${K.layers.map((l, i) => `${esc(l.name)}${i === 0 ? ' (top)' : ''}${l.rollOver ? ' rolled over' : ''}`).join(' onto ')} face to face into one ${fmt(K.thickness)} stack. Crosscut ${K.reps} slices from the stack: each already holds ${K.unit} rows. ${r.total.cuts} crosscuts in all.`);
    }
    steps.push(`Square one end of each panel, then crosscut slices ${fmt(r.panels[0] ? r.panels[0].sliceLength : 0)} long. That's the board thickness of ${fmt(design.thickness)} plus ${fmt(S.flatten)} for flattening.`);
    steps.push('Number each slice in pencil on its top as you cut it, so the order matches the diagram.');
    if (r.grain === 'matched') steps.unshift('Grain is matched: at glue-up 1, set every stick with its growth rings facing the same way (mark the same face of each stick before ripping), except sticks you\u2019re turning on purpose.');
    steps.push(esc(r.method));

    return `<article class="sheet">
      <header class="sheet-head">
        <div>
          <h1>${esc(design.name)}</h1>
          <p>${esc(pattern)} · ${fmt(r.board.width)} × ${fmt(r.board.length)} × ${fmt(r.board.thickness)} · ${date}</p>
        </div>
        <div class="total">${money(r.total.cost)}${r.total.unpriced.length ? '<small>+ unpriced species</small>' : ''}</div>
      </header>

      <section class="keep summary">
        ${boardSvg(r, speciesList, code)}
        <div>
          <h2>Summary</h2>
          <table class="kv">
            <tr><th>Finished size</th><td>${fmt(r.board.width)} wide × ${fmt(r.board.length)} long × ${fmt(r.board.thickness)} thick</td></tr>
            <tr><th>Rip kerf</th><td>${fmt(S.kerfRip)} · ${r.total.rips} rips · ${fmt(r.total.ripKerf)} of width lost</td></tr>
            <tr><th>Crosscut kerf</th><td>${fmt(S.kerfCross)} · ${r.total.cuts} cuts · ${fmt(r.total.crossKerf)} of length lost</td></tr>
            <tr><th>Allowances</th><td>Flattening ${fmt(S.flatten)} · panel planing ${fmt(S.panelPlane)} · end trim ${fmt(S.endTrim)} · edge trim ${fmt(S.edgeTrim)}/side</td></tr>
            <tr><th>Lumber</th><td>${r.total.bf.toFixed(2)} bf needed · ${r.total.bfBuy.toFixed(2)} bf to buy (+${S.waste}% waste)</td></tr>
          </table>
          <p class="keyrow">${key}</p>
          ${r.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
        </div>
      </section>

      <section class="keep">
        <h2>1. Lumber needed</h2>
        <table class="grid">
          <thead><tr><th>Species</th><th>Panel</th><th>Thickness</th><th>Width</th><th>Length</th><th>bf</th><th>bf to buy</th><th>Cost</th></tr></thead>
          <tbody>${lumberRows}</tbody>
        </table>
        <p class="muted">Width includes one ${fmt(S.kerfRip)} kerf per strip. If a thickness isn't available, glue up thinner boards to reach it.</p>
      </section>

      <section class="keep">
        <h2>2. Strip list (rips)</h2>
        <table class="grid">
          <thead><tr><th></th><th>Species</th><th>Panel</th><th>Count</th><th>Width</th><th>Length</th><th>Thickness</th></tr></thead>
          <tbody>${ripRows}</tbody>
        </table>
      </section>

      ${accentSection(r, speciesList, fmt)}
      <section>
        <h2>3. Glue-up 1: strip panels</h2>
        ${panelBlocks}
      </section>

      <section class="keep">
        <h2>4. Crosscuts</h2>
        <table class="grid">
          <thead><tr><th></th><th>Panel</th><th>Square end</th><th>Slice length</th><th>Slices</th><th>Kerf lost</th></tr></thead>
          <tbody>${crossRows}</tbody>
        </table>
        <ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      </section>

      <section class="keep">
        <h2>5. Glue-up 2: slices, end grain up</h2>
        <div class="split">
          ${rowsSvg(r, fmt)}
          <div>
            <p>Lay the slices out top to bottom in this order. <b>Flip</b> means turn the slice end for end before gluing${r.shift ? `; <b>shift</b> means slide it ${fmt(r.shift)} to the side` : ''}.</p>
            ${r.shift ? `<p>Glued width is about ${fmt(r.board.width + r.shift + 2 * S.edgeTrim)} before trimming the ragged edges.</p>` : ''}
          </div>
        </div>
      </section>

      <section class="keep">
        <h2>6. Finishing</h2>
        <ul class="checks">
          <li>${box} Trim ${fmt(S.edgeTrim + (r.shift || 0) / 2)} off each long edge${r.shift ? ' (including the brick overhang)' : ''}, to ${fmt(r.board.width)} wide.</li>
          <li>${box} Flatten both faces to ${fmt(r.board.thickness)} thick (about ${fmt(S.flatten / 2)} per face).</li>
          <li>${box} Square the ends if needed. Finished board: ${fmt(r.board.width)} × ${fmt(r.board.length)} × ${fmt(r.board.thickness)}.</li>
        </ul>
      </section>
    </article>`;
  }

  CB.sheet = { rowPanelSvg, stickSvg, turnNote, html, boardSvg, panelSvg, rowsSvg, codes, esc, textOn, money };
})(typeof window !== 'undefined' ? window : globalThis);
