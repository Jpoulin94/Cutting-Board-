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
        return `<rect x="${b.x * s}" y="${b.y * s}" width="${b.w * s}" height="${b.d * s}" fill="${sp.color}"/>${label}`;
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
          <text x="${x + w / 2}" y="${h + 13}" class="num">${i + 1}</text>`;
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

  function money(v) {
    return v == null ? '–' : `$${v.toFixed(2)}`;
  }

  function html(design, r, speciesList, prefs) {
    const fmt = (mm) => CB.units.format(mm, prefs);
    const S = r.settings;
    const used = [...new Set(r.panels.flatMap((p) => p.strips.map((s) => s.species)))];
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
      </div>`
      )
      .join('');

    const crossRows = r.panels
      .map(
        (p) => `<tr><td>${box}</td><td>${esc(p.name)}</td><td>${fmt(S.endTrim)}</td><td>${fmt(p.sliceLength)}</td><td>${p.slices}</td><td>${p.cuts} × ${fmt(S.kerfCross)} = ${fmt(p.crossKerf)}</td></tr>`
      )
      .join('');

    const steps = [];
    steps.push(`Square one end of each panel, then crosscut slices ${fmt(r.panels[0] ? r.panels[0].sliceLength : 0)} long. That's the board thickness of ${fmt(design.thickness)} plus ${fmt(S.flatten)} for flattening.`);
    steps.push('Number each slice in pencil on its top as you cut it, so the order matches the diagram.');
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

  CB.sheet = { html, boardSvg, panelSvg, rowsSvg, codes, esc, textOn, money };
})(typeof window !== 'undefined' ? window : globalThis);
