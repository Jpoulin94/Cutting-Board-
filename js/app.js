// User interface.
(function () {
  'use strict';
  const { units, engine, storage, sheet } = CB;
  const IN = engine.IN;
  const esc = sheet.esc;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  let prefs = storage.loadPrefs();
  let speciesList = storage.loadSpecies();
  // Add woods that joined the starting list since this browser last saved it.
  if ((prefs.speciesVersion || 1) < 2) {
    const missing = CB.species.defaults().filter((x) => !speciesList.some((y) => y.id === x.id));
    if (missing.length) {
      speciesList = speciesList.concat(missing);
      storage.saveSpecies(speciesList);
    }
    prefs.speciesVersion = 2;
    storage.savePrefs(prefs);
  }
  // Zebrawood gained its dark stripes.
  if ((prefs.speciesVersion || 1) < 3) {
    const z = speciesList.find((x) => x.id === 'sp_zebrawood');
    if (z && !z.streak && z.color.toLowerCase() === '#c9a46c') {
      const def = CB.species.defaults().find((x) => x.id === 'sp_zebrawood');
      z.color = def.color;
      z.streak = def.streak;
      storage.saveSpecies(speciesList);
    }
    prefs.speciesVersion = 3;
    storage.savePrefs(prefs);
  }
  let design = storage.loadCurrent() || freshDesign('My first board');
  let result = null;
  let selected = null;
  let undo = [];
  let redo = [];
  let lastSaved = savedSnapshotFor(design);
  let pristine = null; // a new board nobody has changed yet

  function freshDesign(name) {
    return engine.normalizeDesign({ ...engine.newDesign(name), settings: { ...engine.DEFAULT_SETTINGS, ...(prefs.defaults || {}) } });
  }
  function snapshot(d = design) {
    const { savedAt, ...rest } = d;
    return JSON.stringify(rest);
  }
  function savedSnapshotFor(d) {
    return storage.listDesigns().some((x) => x.id === d.id) ? snapshot(storage.loadDesign(d.id)) : null;
  }

  // ---------- formatting and inputs ----------
  const fmt = (mm, unit = true) => units.format(mm, prefs, unit);
  const unitLabel = () => (prefs.units === 'mm' ? 'mm' : 'in');

  function lenInput(key, value, opts = {}) {
    const v = value == null || Number.isNaN(value) ? '' : fmt(value, false);
    return `<div class="inp"><input type="text" inputmode="decimal" data-len="${key}" value="${esc(v)}" placeholder="${esc(opts.placeholder || '')}" aria-label="${esc(opts.label || key)}" /><span>${unitLabel()}</span></div>`;
  }
  function numInput(key, value, opts = {}) {
    return `<div class="inp"><input type="number" data-num="${key}" value="${value}" min="${opts.min ?? 1}" max="${opts.max ?? 99}" step="${opts.step ?? 1}" aria-label="${esc(opts.label || key)}" />${opts.suffix ? `<span>${opts.suffix}</span>` : ''}</div>`;
  }
  function field(label, control, help) {
    return `<div class="field"><label>${label}${help ? `<small>${help}</small>` : ''}</label>${control}</div>`;
  }
  function speciesSelect(key, value) {
    const sp = CB.species.byId(speciesList, value);
    return `<div class="sp-select"><i class="sw" style="background:${sp.color}"></i><select data-sp="${key}" aria-label="Species">${speciesList
      .map((s) => `<option value="${s.id}"${s.id === value ? ' selected' : ''}>${esc(s.name)}</option>`)
      .join('')}${speciesList.some((s) => s.id === value) ? '' : `<option value="${esc(value)}" selected>Unknown species</option>`}</select></div>`;
  }

  // ---------- changes, undo, autosave ----------
  function commit(fn) {
    const before = snapshot();
    fn(design);
    design = engine.normalizeDesign({ ...design, savedAt: design.savedAt });
    if (snapshot() !== before) {
      undo.push(before);
      if (undo.length > 200) undo.shift();
      redo = [];
    }
    update();
  }
  function restoreSnap(s) {
    const savedAt = design.savedAt;
    design = engine.normalizeDesign(JSON.parse(s));
    design.savedAt = savedAt;
    if (selected && !refStrip(selected)) selected = null;
    update();
  }
  function doUndo() {
    if (!undo.length) return;
    redo.push(snapshot());
    restoreSnap(undo.pop());
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(snapshot());
    restoreSnap(redo.pop());
  }

  function update() {
    result = engine.compute(design, speciesList);
    if (selected && !refStrip(selected)) selected = null;
    renderLeft();
    renderRight();
    renderPicker();
    preview.set(result, speciesList, selected);
    $('#dims').textContent = `${fmt(result.board.width)} × ${fmt(result.board.length)} × ${fmt(result.board.thickness)}`;
    $('#designName').value = design.name;
    $$('.units button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.units === prefs.units)));
    $('#btnUndo').disabled = !undo.length;
    $('#btnRedo').disabled = !redo.length;
    const s = snapshot();
    $('#saveState').textContent = lastSaved === null ? 'Not saved yet' : lastSaved === s ? 'Saved' : 'Unsaved changes';
    storage.saveCurrent(design);
    document.title = `${design.name} · Cutting Board Designer`;
  }

  // ---------- strips ----------
  function stripsOf(ctx) {
    if (ctx === 'main') return design.strips;
    const p = design.panels.find((x) => x.id === ctx);
    return p ? p.strips : [];
  }
  function refStrip(ref) {
    if (!ref) return null;
    if (ref.strip != null) return design.strips[ref.strip] || null;
    const p = design.panels.find((x) => x.id === ref.panel);
    return p ? p.strips[ref.index] || null : null;
  }
  function refOf(ctx, i) {
    return ctx === 'main' ? { strip: i } : { panel: ctx, index: i };
  }
  function resize(list, n) {
    while (list.length < n) {
      const prev = list[list.length - 2] || list[list.length - 1] || { width: IN, species: 'sp_maple' };
      list.push({ width: list[list.length - 1] ? list[list.length - 1].width : IN, species: prev.species });
    }
    list.length = n;
  }

  function stripsHtml(ctx, strips) {
    const sel = selected && CB.preview.sameRef;
    const rows = strips
      .map((s, i) => {
        const isSel = sel && CB.preview.sameRef(selected, refOf(ctx, i));
        return `<div class="strip-row${isSel ? ' sel' : ''}">
          <span class="n">${i + 1}</span>
          ${speciesSelect(`${ctx}:${i}`, s.species)}
          ${lenInput(`strip:${ctx}:${i}`, s.width, { label: `Strip ${i + 1} width` })}
          <button class="turn${s.rot ? ' on' : ''}" data-act="turnStrip" data-ctx="${ctx}" data-i="${i}" title="Turn this stick on its long axis" aria-label="Turn strip ${i + 1}, now ${s.rot || 0} degrees">↻${s.rot || 0}°</button>
          <button class="x" data-act="delStrip" data-ctx="${ctx}" data-i="${i}" title="Remove strip" aria-label="Remove strip ${i + 1}"${strips.length < 2 ? ' disabled' : ''}>✕</button>
        </div>`;
      })
      .join('');
    const opts = speciesList.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    const [a, b] = [strips[0] ? strips[0].species : speciesList[0].id, (strips.find((s) => s.species !== strips[0].species) || strips[1] || strips[0] || {}).species];
    const optsSel = (v) => speciesList.map((s) => `<option value="${s.id}"${s.id === v ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    return `<div class="strip-list">${rows}</div>
      <div class="row-actions">
        <button class="small" data-act="addStrip" data-ctx="${ctx}">+ Strip</button>
        <button class="small" data-act="reverse" data-ctx="${ctx}">Reverse order</button>
        <button class="small" data-act="mirror" data-ctx="${ctx}">Mirror</button>
      </div>
      <div class="fill">Turn
        <select class="plain" data-turn-which="${ctx}"><option value="checker">in a checkerboard</option><option value="even">every other strip</option><option value="all">all strips</option></select> by
        <select class="plain" data-turn-deg="${ctx}"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option><option value="0">0° (reset)</option></select>
        <button class="small" data-act="turnBulk" data-ctx="${ctx}">Apply</button>
      </div>
      <div class="fill">Alternate
        <select class="plain" data-fill-a="${ctx}">${optsSel(a)}</select> and
        <select class="plain" data-fill-b="${ctx}">${optsSel(b)}</select>
        <button class="small" data-act="alternate" data-ctx="${ctx}">Apply</button>
      </div>`;
  }

  // ---------- left panel ----------
  function patternIcon(p) {
    const c = ['#ead9b8', '#4b3428'];
    let cells = '';
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 6; k++) {
        let fill;
        let x = k * 7;
        let w = 7;
        let h = 7;
        let y = r * 7;
        if (p === 'stripes') fill = c[k % 2];
        else if (p === 'checker') fill = c[(k + r) % 2];
        else if (p === 'brick') {
          fill = c[k % 2];
          if (r % 2) x += 3.5;
        } else {
          fill = r % 3 === 2 ? ['#a8603c', '#ead9b8'][k % 2] : c[k % 2];
          h = r % 3 === 2 ? 4 : 7;
          y = [0, 7, 14, 18][r];
        }
        cells += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
      }
    return `<svg viewBox="0 0 42 28" aria-hidden="true"><clipPath id="c${p}"><rect width="42" height="${p === 'plaid' ? 25 : 28}"/></clipPath><g clip-path="url(#c${p})">${cells}</g></svg>`;
  }

  function renderLeft() {
    const el = $('#leftPanel');
    const focus = document.activeElement && el.contains(document.activeElement) ? focusKey(document.activeElement) : null;
    const d = design;
    const S = d.settings;
    const plaid = d.pattern === 'plaid';
    const widths = d.strips.map((s) => s.width);
    const uniform = widths.every((w) => Math.abs(w - widths[0]) < 1e-6);

    let html = `<section class="section"><h2>Pattern <button class="small" data-act="stock">Stock designs</button></h2>
      <div class="patterns">${Object.entries(engine.PATTERNS)
        .map(([k, p]) => `<button data-pattern="${k}" aria-pressed="${d.pattern === k}">${patternIcon(k)}${esc(p.label)}</button>`)
        .join('')}</div>
      <p class="blurb">${esc(engine.PATTERNS[d.pattern].blurb)}</p></section>`;

    html += `<section class="section"><h2>Board <button class="small" data-act="fit">Fit to a size</button></h2>
      ${field('Thickness', lenInput('thickness', d.thickness), 'Finished, after flattening')}`;
    if (!plaid) {
      html += `${field('Strips', numInput('stripCount', d.strips.length, { max: 60 }), 'Columns across the width')}
        ${field('Strip width', lenInput('stripWidthAll', uniform ? widths[0] : NaN, { placeholder: 'mixed' }), 'Sets every strip')}
        ${field('Rows', numInput('rows', d.rows, { max: 80 }), 'Slices along the length')}
        ${field('Row depth', lenInput('rowDepth', d.rowDepth), 'The strip panel’s thickness')}`;
      if (d.pattern === 'stripes') {
        html += `<label class="check"><input type="checkbox" data-row-turn${d.rowTurn ? ' checked' : ''}/> Turn every other row end for end</label>`;
      }
      if (d.pattern === 'brick') {
        const opts = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
        const labels = ['1/4', '1/3', '1/2', '2/3', '3/4'];
        html += field(
          'Brick shift',
          `<div class="inp"><select data-brick-shift>${opts
            .map((o, i) => `<option value="${o}"${Math.abs(o - d.brickShift) < 0.01 ? ' selected' : ''}>${labels[i]} strip</option>`)
            .join('')}</select></div>`,
          'Part of the widest strip that every other row slides'
        );
        html += `<label class="check"><input type="checkbox" data-brick-flip${d.brickFlip ? ' checked' : ''}/> Also flip the shifted rows end for end</label>`;
      }
    }
    html += field(
      'Grain',
      `<div class="inp"><select data-grain><option value="matched"${d.grain !== 'random' ? ' selected' : ''}>Matched</option><option value="random"${d.grain === 'random' ? ' selected' : ''}>Random</option></select></div>`,
      'Matched: every stick faces the same way'
    );
    html += `<div class="readout">Finished board: <b>${fmt(result.board.width)} × ${fmt(result.board.length)} × ${fmt(result.board.thickness)}</b></div></section>`;

    if (!plaid) {
      html += `<section class="section"><h2>Strips <span class="muted">left to right</span></h2>${stripsHtml('main', d.strips)}</section>`;
    } else {
      html += `<section class="section"><h2>Panels <button class="small" data-act="addPanel">+ Panel</button></h2>
        ${d.panels
          .map(
            (p) => `<div class="panel-card">
            <h3><span>Panel <input class="plain" style="width:52px" data-panel-name="${p.id}" value="${esc(p.name)}" aria-label="Panel name"/></span>
              <button class="x" data-act="delPanel" data-panel="${p.id}" title="Delete panel"${d.panels.length < 2 ? ' disabled' : ''}>✕</button></h3>
            ${field('Row depth', lenInput(`panelT:${p.id}`, p.thickness), 'This panel’s thickness')}
            ${stripsHtml(p.id, p.strips)}
          </div>`
          )
          .join('')}
      </section>
      <section class="section"><h2>Row order <span class="muted">top to bottom</span></h2>
        <div class="rowplan">${d.rowPlan
          .map(
            (r, i) => `<div class="r"><b>${i + 1}</b>
            <select data-row-panel="${i}" aria-label="Row ${i + 1} panel">${d.panels.map((p) => `<option value="${p.id}"${p.id === r.panel ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
            <label title="Flip end for end"><input type="checkbox" data-row-flip="${i}"${r.flip ? ' checked' : ''}/>flip</label>
            <button class="x" data-act="delRow" data-i="${i}" aria-label="Remove row"${d.rowPlan.length < 2 ? ' disabled' : ''}>✕</button></div>`
          )
          .join('')}</div>
        <div class="row-actions">
          <button class="small" data-act="addRow">+ Row</button>
          <button class="small" data-act="flipAlt">Flip every other row</button>
        </div>
        <div class="fill">Quick order <input class="plain" style="width:120px" data-row-text placeholder="e.g. AABAAB" value="${esc(d.rowPlan.map((r) => (d.panels.find((p) => p.id === r.panel) || {}).name || '?').join(''))}"/>
          <button class="small" data-act="rowText">Apply</button></div>
      </section>`;
    }

    const A = d.accent;
    const usedSp = [...new Set((plaid ? d.panels.flatMap((p) => p.strips) : d.strips).map((x) => x.species))];
    const spOpt = (v, list) => list.map((id) => `<option value="${id}"${id === v ? ' selected' : ''}>${esc(CB.species.byId(speciesList, id).name)}</option>`).join('');
    html += `<section class="section"><h2>Angled accent</h2>
      <label class="check"><input type="checkbox" data-acc="enabled"${A.enabled ? ' checked' : ''}/> Glue a thin accent line across each square</label>
      ${
        A.enabled
          ? `${field('Accent wood', `<div class="inp"><select data-acc="species"><option value="contrast"${A.species === 'contrast' ? ' selected' : ''}>Contrasting wood</option>${spOpt(A.species, speciesList.map((x) => x.id))}</select></div>`)}
        ${field('Accent thickness', lenInput('acc:thickness', A.thickness), 'Same as the kerf keeps sizes unchanged')}
        ${field('Angle', numInput('acc:angle', A.angle, { min: 10, max: 80, suffix: '\u00b0' }), 'From the board\u2019s width')}
        ${field('Off centre', numInput('acc:offset', Math.round(A.offset * 100), { min: -45, max: 45, suffix: '%' }), 'Of the strip width; 0 is centred')}
        ${field('Squares', `<div class="inp"><select data-acc="on"><option value="all"${A.on === 'all' ? ' selected' : ''}>All</option>${spOpt(A.on, usedSp)}</select></div>`, 'Which wood gets a line')}
        ${field('Direction', `<div class="inp"><select data-acc="alternate"><option value="0"${!A.alternate ? ' selected' : ''}>All the same</option><option value="1"${A.alternate ? ' selected' : ''}>Alternate strips</option></select></div>`)}
        <p class="blurb">Each stick is ripped lengthwise at this angle and glued back together with the accent between, before glue-up 1.</p>`
          : ''
      }
    </section>`;

    const X = d.details;
    const bevels = prefs.units === 'mm' ? [0, 3, 6, 10, 13, 19, 25] : [0, 1 / 8, 1 / 4, 3 / 8, 1 / 2, 3 / 4, 1].map((x) => x * IN);
    if (X.bevel && !bevels.some((b) => Math.abs(b - X.bevel) < 0.01)) bevels.push(X.bevel);
    html += `<section class="section"><h2>Edges and handles <span class="muted">look only</span></h2>
      <label class="check"><input type="checkbox" data-det="groove"${X.groove ? ' checked' : ''}/> Juice groove</label>
      ${X.groove ? `${field('Groove from edge', lenInput('det:grooveInset', X.grooveInset))}${field('Groove width', lenInput('det:grooveWidth', X.grooveWidth))}` : ''}
      ${field('Bevel', `<div class="inp"><select data-det="bevel">${bevels
        .sort((a, b) => a - b)
        .map((b) => `<option value="${b}"${Math.abs(b - X.bevel) < 0.01 ? ' selected' : ''}>${b ? fmt(b) : 'None'}</option>`)
        .join('')}</select></div>`, '45\u00b0 on the top edges')}
      ${field('Hand holds', `<div class="inp"><select data-det="handles">
        <option value="none"${X.handles === 'none' ? ' selected' : ''}>None</option>
        <option value="grips"${X.handles === 'grips' ? ' selected' : ''}>Finger grips under the ends</option>
        <option value="holes"${X.handles === 'holes' ? ' selected' : ''}>Hand holes through the ends</option></select></div>`)}
    </section>`;

    html += `<details class="section" ${prefs.allowOpen ? 'open' : ''} data-allow><summary>Kerf and allowances</summary>
      ${field('Rip kerf', lenInput('set:kerfRip', S.kerfRip), 'Blade width for ripping strips')}
      ${field('Crosscut kerf', lenInput('set:kerfCross', S.kerfCross), 'Blade width for the final crosscuts')}
      ${field('Flattening', lenInput('set:flatten', S.flatten), 'Added to each slice’s length')}
      ${field('Panel planing', lenInput('set:panelPlane', S.panelPlane), 'Extra stock thickness')}
      ${field('End trim', lenInput('set:endTrim', S.endTrim), 'Squaring each panel’s ends')}
      ${field('Edge trim', lenInput('set:edgeTrim', S.edgeTrim), 'Per long edge of the board')}
      ${field('Waste factor', numInput('set:waste', S.waste, { min: 0, max: 100, suffix: '%' }), 'Added to lumber to buy')}
      ${field('Round inches to', `<div class="inp"><select data-precision><option value="16"${prefs.precision === 16 ? ' selected' : ''}>1/16"</option><option value="32"${prefs.precision === 32 ? ' selected' : ''}>1/32"</option></select></div>`)}
      <div class="row-actions">
        <button class="small" data-act="saveDefaults">Use these for new boards</button>
        <button class="small" data-act="resetDefaults">Reset to standard</button>
      </div>
    </details>`;

    el.innerHTML = html;
    if (focus) {
      const f = $(focus, el);
      if (f) {
        f.focus();
        if (f.select && f.type === 'text') f.select();
      }
    }
  }

  function focusKey(node) {
    for (const a of node.getAttributeNames()) if (a.startsWith('data-')) return `[${a}="${CSS.escape(node.getAttribute(a))}"]`;
    return null;
  }

  // ---------- right panel ----------
  function renderRight() {
    const r = result;
    const S = r.settings;
    const used = [...new Set(r.panels.flatMap((p) => p.strips.map((s) => s.species)))];
    const code = sheet.codes(speciesList, used);
    const money = sheet.money;
    const lumberRows = r.lumber
      .map(
        (l) => `<tr><td><i class="sw" style="background:${l.color}"></i>${esc(l.name)}</td>
        <td>${l.pieces.map((p) => `${fmt(p.thickness)} <span class="muted">(${p.rough.laminate ? `${p.rough.layers}×8/4` : `${p.rough.quarters}/4`})</span><br><span class="muted">${fmt(p.width)} × ${fmt(p.length)}</span>`).join('<br>')}</td>
        <td class="r">${l.bfBuy.toFixed(2)}</td><td class="r">${money(l.cost)}</td></tr>`
      )
      .join('');
    const kerfLines = r.panels
      .map((p) => `${r.panels.length > 1 ? `Panel ${esc(p.name)}: ` : ''}<b>${p.cuts} crosscuts × ${fmt(S.kerfCross)} = ${fmt(p.crossKerf)}</b> of length lost`)
      .join('<br>');

    $('#rightPanel').innerHTML = `
      <section class="section"><h2>Finished board</h2>
        <div class="big">${fmt(r.board.width)} × ${fmt(r.board.length)} × ${fmt(r.board.thickness)}</div>
        <div class="stats" style="margin-top:10px">
          <div class="stat"><small>Strips to rip</small><b>${r.total.rips}</b></div>
          <div class="stat"><small>Slices to crosscut</small><b>${r.total.cuts}</b></div>
          <div class="stat"><small>Lumber to buy</small><b>${r.total.bfBuy.toFixed(2)} bf</b></div>
          <div class="stat"><small>Cost</small><b>${money(r.total.cost)}</b>${r.total.unpriced.length ? '<small>some prices missing</small>' : ''}</div>
        </div>
        <p class="kerf-line">${kerfLines}<br>${r.total.rips} rips × ${fmt(S.kerfRip)} = ${fmt(r.total.ripKerf)} of width lost${r.total.angleRips ? ` (including ${r.total.angleRips} angled rips for accents)` : ''}</p>
        ${r.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
      </section>
      <section class="section"><h2>Lumber needed</h2>
        <table class="t"><thead><tr><th>Species</th><th>Milled thickness, width × length</th><th class="r">bf</th><th class="r">Cost</th></tr></thead>
        <tbody>${lumberRows}</tbody>
        <tfoot><tr><td colspan="2">Total (+${S.waste}% waste)</td><td class="r">${r.total.bfBuy.toFixed(2)}</td><td class="r">${money(r.total.cost)}</td></tr></tfoot></table>
        ${r.total.unpriced.length ? `<p class="warn">No price yet for ${esc(r.total.unpriced.join(', '))}. <button class="small" data-act="species">Add prices</button></p>` : ''}
      </section>
      <section class="section"><h2>Glue-up 1: strip panels</h2>
        ${r.panels
          .map(
            (p) => `<div><b>Panel ${esc(p.name)}</b> <span class="muted">· ${p.strips.length} strips · ${fmt(p.width)} wide × ${fmt(p.length)} long · plane to ${fmt(p.thickness)}</span>
            <div class="diagram-wrap">${sheet.panelSvg(p, speciesList, code, fmt, 320)}</div>${sheet.turnNote(p).replace('<p>', '<p class="method">')}</div>`
          )
          .join('')}
        <h2 style="margin-top:6px">Glue-up 2: slices</h2>
        <p class="method">Crosscut slices <b>${fmt(r.panels[0] ? r.panels[0].sliceLength : 0)}</b> long (${fmt(design.thickness)} + ${fmt(S.flatten)} flattening). ${esc(r.method)}${r.shift ? ` Shift: <b>${fmt(r.shift)}</b>.` : ''}</p>
        <p class="row-actions" style="margin-top:12px"><button class="primary" data-act="plan">Build steps</button><button data-act="sheet">Shop sheet</button></p>
      </section>`;
  }

  // ---------- strip picker (from the 3D preview) ----------
  function renderPicker() {
    const el = $('#picker');
    const s = refStrip(selected);
    if (!s) {
      el.hidden = true;
      return;
    }
    const ref = selected;
    const panel = ref.strip == null ? design.panels.find((p) => p.id === ref.panel) : null;
    const index = ref.strip != null ? ref.strip : ref.index;
    const count = result.blocks.filter((b) => CB.preview.sameRef(b.ref, ref)).length;
    el.hidden = false;
    el.innerHTML = `<h4>Strip ${index + 1}${panel ? ` · panel ${esc(panel.name)}` : ''}</h4>
      <p>${count} blocks on the board come from this strip. Pick a species to change them all.</p>
      <div class="swatches">${speciesList
        .map((sp) => `<button data-pick="${sp.id}" aria-pressed="${sp.id === s.species}"><i class="sw" style="background:${sp.color}"></i>${esc(sp.name)}</button>`)
        .join('')}</div>
      <div class="field" style="margin:10px 0 0">${'<label>Width</label>'}${lenInput(`pickW`, s.width)}</div>
      <div class="turns"><span>Turn stick</span>${[0, 90, 180, 270]
        .map((deg) => `<button class="small" data-act="turnPick" data-deg="${deg}" aria-pressed="${(s.rot || 0) === deg}">${deg}°</button>`)
        .join('')}</div>
      <div class="row-actions"><button class="small" data-act="closePicker">Done</button></div>`;
  }

  // ---------- events ----------
  function onChange(e) {
    const t = e.target;
    const ds = t.dataset;
    if (ds.len !== undefined) {
      const v = units.parseLength(t.value, prefs.units);
      const key = ds.len;
      const allowZero = key.startsWith('set:');
      if (!Number.isFinite(v) || v < 0 || (!allowZero && v === 0)) {
        t.classList.add('bad');
        toast('Enter a size like 1-1/2, 1.5 or 38mm.');
        return;
      }
      t.classList.remove('bad');
      commit((d) => {
        if (key === 'thickness') d.thickness = v;
        else if (key === 'rowDepth') d.rowDepth = v;
        else if (key === 'stripWidthAll') d.strips.forEach((s) => (s.width = v));
        else if (key.startsWith('set:')) d.settings[key.slice(4)] = v;
        else if (key.startsWith('panelT:')) d.panels.find((p) => p.id === key.slice(7)).thickness = v;
        else if (key.startsWith('strip:')) {
          const [, ctx, i] = key.split(':');
          stripsOf(ctx)[Number(i)].width = v;
        } else if (key === 'pickW') refStrip(selected).width = v;
        else if (key === 'acc:thickness') d.accent.thickness = v;
        else if (key.startsWith('det:')) d.details[key.slice(4)] = v;
      });
      return;
    }
    if (ds.num !== undefined) {
      const n = Number(t.value);
      if (!Number.isFinite(n)) return;
      commit((d) => {
        if (ds.num === 'stripCount') resize(d.strips, Math.max(1, Math.min(60, Math.round(n))));
        else if (ds.num === 'rows') d.rows = Math.max(1, Math.min(80, Math.round(n)));
        else if (ds.num === 'set:waste') d.settings.waste = Math.max(0, Math.min(100, n));
        else if (ds.num === 'acc:angle') d.accent.angle = n;
        else if (ds.num === 'acc:offset') d.accent.offset = n / 100;
      });
      return;
    }
    if (ds.sp !== undefined) {
      const [ctx, i] = ds.sp.split(':');
      commit(() => (stripsOf(ctx)[Number(i)].species = t.value));
      return;
    }
    if (ds.acc !== undefined) {
      return commit((d) => {
        if (ds.acc === 'enabled') d.accent.enabled = t.checked;
        else if (ds.acc === 'alternate') d.accent.alternate = t.value === '1';
        else d.accent[ds.acc] = t.value;
      });
    }
    if (ds.det !== undefined) {
      return commit((d) => {
        if (ds.det === 'groove') d.details.groove = t.checked;
        else if (ds.det === 'bevel') d.details.bevel = Number(t.value);
        else d.details[ds.det] = t.value;
      });
    }
    if (ds.brickShift !== undefined) return commit((d) => (d.brickShift = Number(t.value)));
    if (ds.grain !== undefined) return commit((d) => (d.grain = t.value));
    if (ds.rowTurn !== undefined) return commit((d) => (d.rowTurn = t.checked));
    if (ds.brickFlip !== undefined) return commit((d) => (d.brickFlip = t.checked));
    if (ds.panelName !== undefined) return commit((d) => (d.panels.find((p) => p.id === ds.panelName).name = t.value.trim() || '?'));
    if (ds.rowPanel !== undefined) return commit((d) => (d.rowPlan[Number(ds.rowPanel)].panel = t.value));
    if (ds.rowFlip !== undefined) return commit((d) => (d.rowPlan[Number(ds.rowFlip)].flip = t.checked));
    if (ds.precision !== undefined) {
      prefs.precision = Number(t.value);
      storage.savePrefs(prefs);
      update();
    }
  }

  function onClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const ds = btn.dataset;
    if (ds.pattern) {
      selected = null;
      return commit((d) => (d.pattern = ds.pattern));
    }
    if (ds.pick) return commit(() => (refStrip(selected).species = ds.pick));
    const act = ds.act;
    if (!act) return;
    const ctx = ds.ctx;
    switch (act) {
      case 'turnStrip':
        return commit(() => {
          const st = stripsOf(ctx)[Number(ds.i)];
          st.rot = ((st.rot || 0) + 90) % 360;
        });
      case 'turnBulk': {
        const which = $(`[data-turn-which="${ctx}"]`).value;
        const deg = Number($(`[data-turn-deg="${ctx}"]`).value);
        const list = stripsOf(ctx);
        if (which === 'checker') {
          // Turn every other stick, then turn every other row end for end:
          // with an even strip count that moves the turned squares over one
          // column on alternate rows, like a checkerboard.
          if (ctx !== 'main' || !['stripes', 'checker'].includes(design.pattern)) {
            return toast('Checkerboard turning works with End grain stripes or Checkerboard.');
          }
          if (list.length % 2) return toast('Use an even number of strips so the turned squares alternate on every row.');
          return commit((d) => {
            list.forEach((st, i) => (st.rot = i % 2 === 1 ? deg : 0));
            if (d.pattern === 'stripes') d.rowTurn = true;
          });
        }
        return commit(() => list.forEach((st, i) => {
          if (which === 'all' || i % 2 === 1) st.rot = deg;
        }));
      }
      case 'turnPick':
        return commit(() => (refStrip(selected).rot = Number(ds.deg)));
      case 'addStrip':
        return commit(() => resize(stripsOf(ctx), stripsOf(ctx).length + 1));
      case 'delStrip':
        selected = null;
        return commit(() => stripsOf(ctx).splice(Number(ds.i), 1));
      case 'reverse':
        return commit(() => stripsOf(ctx).reverse());
      case 'mirror':
        return commit(() => {
          const s = stripsOf(ctx);
          const m = s.slice(0, -1).reverse().map((x) => ({ ...x }));
          s.push(...m);
        });
      case 'alternate': {
        const a = $(`[data-fill-a="${ctx}"]`).value;
        const b = $(`[data-fill-b="${ctx}"]`).value;
        return commit(() => stripsOf(ctx).forEach((s, i) => (s.species = i % 2 ? b : a)));
      }
      case 'addPanel':
        return commit((d) => {
          const name = String.fromCharCode(65 + d.panels.length);
          const src = d.panels[d.panels.length - 1];
          d.panels.push({ id: engine.uid('p'), name, thickness: src.thickness, strips: src.strips.map((s) => ({ ...s })) });
        });
      case 'delPanel':
        selected = null;
        return commit((d) => {
          d.panels = d.panels.filter((p) => p.id !== ds.panel);
          d.rowPlan = d.rowPlan.filter((r) => r.panel !== ds.panel);
        });
      case 'addRow':
        return commit((d) => d.rowPlan.push({ ...d.rowPlan[d.rowPlan.length - 1] }));
      case 'delRow':
        return commit((d) => d.rowPlan.splice(Number(ds.i), 1));
      case 'flipAlt':
        return commit((d) => d.rowPlan.forEach((r, i) => (r.flip = i % 2 === 1)));
      case 'rowText': {
        const text = $('[data-row-text]').value.replace(/[\s,]/g, '').toUpperCase();
        const byName = Object.fromEntries(design.panels.map((p) => [p.name.toUpperCase(), p.id]));
        const plan = [...text].map((ch) => byName[ch]);
        if (!plan.length || plan.some((x) => !x)) return toast(`Use panel names: ${design.panels.map((p) => p.name).join(', ')}.`);
        return commit((d) => (d.rowPlan = plan.map((panel, i) => ({ panel, flip: d.rowPlan[i] ? d.rowPlan[i].flip : false }))));
      }
      case 'saveDefaults':
        prefs.defaults = { ...design.settings };
        storage.savePrefs(prefs);
        return toast('New boards will start with these settings.');
      case 'resetDefaults':
        prefs.defaults = null;
        storage.savePrefs(prefs);
        return commit((d) => (d.settings = { ...engine.DEFAULT_SETTINGS }));
      case 'closePicker':
        selected = null;
        return update();
      case 'species':
        return openSpecies();
      case 'stock':
        return openStock();
      case 'fit':
        return openFit();
      case 'sheet':
        return openSheet();
      case 'plan':
        return openPlan();
    }
  }

  // ---------- dialogs ----------
  function dialog(title, bodyHtml, buttons, onOpen) {
    const dlg = $('#dialog');
    $('#dialogTitle').textContent = title;
    $('#dialogBody').innerHTML = bodyHtml;
    $('#dialogButtons').innerHTML = buttons
      .map((b) => `<button value="${b.value}" class="${b.cls || ''}">${esc(b.label)}</button>`)
      .join('');
    return new Promise((resolve) => {
      dlg.onclose = () => resolve(dlg.returnValue);
      dlg.returnValue = '';
      dlg.showModal();
      if (onOpen) onOpen(dlg);
    });
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  async function confirmDialog(title, text, ok = 'OK') {
    return (await dialog(title, `<p>${esc(text)}</p>`, [{ label: 'Cancel', value: 'cancel', cls: 'ghost' }, { label: ok, value: 'ok', cls: 'primary' }])) === 'ok';
  }

  function save() {
    if (storage.saveDesign(design)) {
      lastSaved = snapshot();
      toast(`Saved “${design.name}” in this browser.`);
    } else toast('Couldn’t save. The browser’s storage may be full or blocked.');
    update();
  }

  async function guardUnsaved() {
    if (lastSaved === snapshot() || pristine === snapshot()) return true;
    return confirmDialog('Leave this board?', `“${design.name}” has changes that aren’t saved. Its latest state is still kept until you open another board.`, 'Continue without saving');
  }

  function load(d) {
    design = d;
    undo = [];
    redo = [];
    selected = null;
    lastSaved = savedSnapshotFor(design);
    update();
  }

  async function openSaved() {
    const list = storage.listDesigns();
    if (!list.length) return toast('No saved boards yet. Use Save to keep one.');
    const render = () =>
      storage
        .listDesigns()
        .map(
          (x) => `<div class="item"><div><b>${esc(x.name)}</b><small>${esc(engine.PATTERNS[x.pattern] ? engine.PATTERNS[x.pattern].label : '')} · ${x.savedAt ? new Date(x.savedAt).toLocaleString() : ''}</small></div>
          <button type="button" class="small primary" data-open="${x.id}">Open</button>
          <button type="button" class="small danger" data-del="${x.id}">Delete</button></div>`
        )
        .join('') || '<p class="muted">No saved boards.</p>';
    let chosen = null;
    await dialog('Saved boards', `<div class="saved-list">${render()}</div>`, [{ label: 'Close', value: 'close', cls: 'ghost' }], (dlg) => {
      $('.saved-list', dlg).onclick = async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.open) {
          chosen = b.dataset.open;
          dlg.close('open');
        } else if (b.dataset.del) {
          if (b.dataset.armed !== '1') {
            b.dataset.armed = '1';
            b.textContent = 'Tap again to delete';
            return;
          }
          {
            storage.deleteDesign(b.dataset.del);
            $('.saved-list', dlg).innerHTML = render();
            if (b.dataset.del === design.id) lastSaved = null;
            update();
          }
        }
      };
    });
    if (chosen && chosen !== design.id) {
      if (!(await guardUnsaved())) return;
      load(storage.loadDesign(chosen));
    }
  }

  async function openStock() {
    const settings = { ...engine.DEFAULT_SETTINGS, ...(prefs.defaults || {}) };
    const cards = CB.presets.PRESETS.map((p, i) => {
      const d = CB.presets.make(p, settings);
      const r = engine.compute(d, speciesList);
      const code = sheet.codes(speciesList, []);
      return `<button type="button" class="stock-card" data-stock="${i}">
        ${sheet.boardSvg(r, speciesList, code, 150).replace(/<text[^>]*>[^<]*<\/text>/g, '')}
        <b>${esc(p.name)}</b>
        <small>${fmt(r.board.width)} × ${fmt(r.board.length)} · ${esc(engine.PATTERNS[d.pattern].label)}</small>
        <span>${esc(p.blurb)}</span>
      </button>`;
    }).join('');
    let chosen = null;
    await dialog('Stock designs', `<p class="muted" style="margin:0 0 12px">Pick one to start a new board. Your kerf and allowance settings carry over, and you can change anything after.</p><div class="stock-grid">${cards}</div>`, [{ label: 'Close', value: 'close', cls: 'ghost' }], (dlg) => {
      $('.stock-grid', dlg).onclick = (e) => {
        const b = e.target.closest('[data-stock]');
        if (!b) return;
        chosen = CB.presets.PRESETS[Number(b.dataset.stock)];
        dlg.close('pick');
      };
    });
    if (!chosen) return;
    if (!(await guardUnsaved())) return;
    const made = CB.presets.make(chosen, settings);
    const needed = [...new Set([...made.strips, ...made.panels.flatMap((p) => p.strips)].map((x) => x.species).concat(made.accent.enabled ? [made.accent.species] : []))];
    const missing = CB.species.defaults().filter((x) => needed.includes(x.id) && !speciesList.some((y) => y.id === x.id));
    if (missing.length) {
      speciesList = speciesList.concat(missing);
      storage.saveSpecies(speciesList);
    }
    load(made);
    pristine = snapshot();
    toast(`Started \u201c${chosen.name}\u201d. Save it to keep it.`);
  }

  // ---------- strip fitter ----------
  async function openFit() {
    const plaid = design.pattern === 'plaid';
    const step = prefs.units === 'mm' ? 1 : IN / 16;
    const round = (v) => Math.round(v / step) * step;
    const widths = design.strips.map((x) => x.width);
    const uniform = !plaid && widths.every((w) => Math.abs(w - widths[0]) < 1e-6);
    const squares = uniform && Math.abs(design.rowDepth - widths[0]) < 1e-6;
    const target = { width: round(result.board.width), length: round(result.board.length), stripWidth: plaid ? 0 : widths.reduce((a, b) => a + b, 0) / widths.length, square: squares };
    let options = [];
    const inp = (key, v) => `<div class="inp"><input type="text" inputmode="decimal" data-fit="${key}" value="${esc(fmt(v, false))}" /><span>${unitLabel()}</span></div>`;
    const body = `<p class="muted" style="margin:0 0 12px">Type the finished size you want. Pick one of the options to use it; your woods and pattern stay the same.</p>
      <div class="fit-fields">
        ${field('Width', inp('width', target.width), 'Across the strips')}
        ${field('Length', inp('length', target.length), 'Along the board')}
        ${plaid ? '' : field('Strip width about', inp('stripWidth', target.stripWidth), 'Sets how many strips')}
      </div>
      ${squares ? '<label class="check"><input type="checkbox" data-fit-square checked/> Keep the squares square</label>' : ''}
      <div class="fit-list"></div>`;
    const list = () => {
      const code = sheet.codes(speciesList, []);
      if (!options.length) return '<p class="warn">Enter a width and length.</p>';
      return options
        .map((o, i) => {
          const r = engine.compute(engine.normalizeDesign(o.design), speciesList);
          const what = plaid
            ? `Same layout, strips and rows scaled`
            : `${o.n} strips${o.stripWidth ? ` at ${fmt(o.stripWidth)}` : ''} \u00b7 ${o.rows} rows${o.rowDepth ? ` at ${fmt(o.rowDepth)}` : ''}`;
          return `<button type="button" class="fit-card${o.best ? ' best' : ''}" data-fit-pick="${i}">
            ${sheet.boardSvg(r, speciesList, code, 96).replace(/<text[^>]*>[^<]*<\/text>/g, '')}
            <span><b>${fmt(o.board.width)} \u00d7 ${fmt(o.board.length)}</b>${o.best ? ' <em>closest</em>' : ''}${o.keep && !plaid ? ' <em>same count</em>' : ''}<br><small>${what}</small></span>
          </button>`;
        })
        .join('');
    };
    let chosen = null;
    await dialog('Fit to a size', body, [{ label: 'Cancel', value: 'cancel', cls: 'ghost' }], (dlg) => {
      const refresh = () => {
        options = engine.fitOptions(design, speciesList, { ...target, step });
        $('.fit-list', dlg).innerHTML = list();
      };
      dlg.querySelectorAll('[data-fit]').forEach((el) =>
        el.addEventListener('change', () => {
          const v = units.parseLength(el.value, prefs.units);
          if (!Number.isFinite(v) || v <= 0) {
            el.classList.add('bad');
            return;
          }
          el.classList.remove('bad');
          target[el.dataset.fit] = v;
          refresh();
        })
      );
      const sq = $('[data-fit-square]', dlg);
      if (sq) sq.onchange = () => ((target.square = sq.checked), refresh());
      $('.fit-list', dlg).onclick = (e) => {
        const b = e.target.closest('[data-fit-pick]');
        if (!b) return;
        chosen = options[Number(b.dataset.fitPick)];
        dlg.close('pick');
      };
      refresh();
    });
    if (!chosen) return;
    selected = null;
    commit((d) => {
      const x = chosen.design;
      if (plaid) d.panels = x.panels;
      else {
        d.strips = x.strips;
        d.rows = x.rows;
        d.rowDepth = x.rowDepth;
      }
    });
    toast(`Now ${fmt(result.board.width)} \u00d7 ${fmt(result.board.length)}.`);
  }

  async function openSpecies() {
    let work = speciesList.map((s) => ({ ...s }));
    const used = new Set(result.panels.flatMap((p) => p.strips.map((s) => s.species)));
    const row = (s) => `<tr data-id="${s.id}">
      <td><input type="color" data-f="color" value="${s.color}" aria-label="Colour"/></td>
      <td class="streak-cell"><label title="Dark stripes or streaks in the grain"><input type="checkbox" data-f="hasStreak"${s.streak ? ' checked' : ''}/></label><input type="color" data-f="streak" value="${s.streak || '#3a2414'}" aria-label="Stripe colour"${s.streak ? '' : ' disabled'}/></td>
      <td><input class="plain" data-f="name" value="${esc(s.name)}" style="width:140px" aria-label="Name"/></td>
      <td><div class="inp" style="width:96px"><span style="padding:0 0 0 7px">$</span><input type="number" step="0.01" min="0" data-f="price" value="${s.price ?? ''}" placeholder="0.00" aria-label="Price per board foot"/></div></td>
      <td><input class="plain" data-f="supplier" value="${esc(s.supplier)}" style="width:170px" placeholder="Where you bought it" aria-label="Last purchased from"/></td>
      <td><input class="plain" type="date" data-f="lastBought" value="${esc(s.lastBought)}" aria-label="Last purchase date"/></td>
      <td><input class="plain" data-f="notes" value="${esc(s.notes)}" style="width:140px" aria-label="Notes"/></td>
      <td><button type="button" class="x" data-del title="${used.has(s.id) ? 'Used in this board' : 'Delete'}"${used.has(s.id) ? ' disabled' : ''}>✕</button></td></tr>`;
    const body = () => `<div class="species-wrap"><table class="species-table"><thead><tr><th>Colour</th><th>Stripes</th><th>Species</th><th>$ / bf</th><th>Last purchased from</th><th>Date</th><th>Notes</th><th></th></tr></thead>
      <tbody>${work.map(row).join('')}</tbody></table></div>
      <div class="row-actions"><button type="button" class="small" data-add>+ Add species</button></div>`;
    const res = await dialog('Species library', body(), [{ label: 'Cancel', value: 'cancel', cls: 'ghost' }, { label: 'Save', value: 'save', cls: 'primary' }], (dlg) => {
      const wrap = $('#dialogBody', dlg);
      wrap.oninput = (e) => {
        const tr = e.target.closest('tr');
        if (!tr) return;
        const s = work.find((x) => x.id === tr.dataset.id);
        const f = e.target.dataset.f;
        if (f === 'price') s.price = e.target.value === '' ? null : Number(e.target.value);
        else if (f === 'hasStreak') {
          const picker = tr.querySelector('[data-f="streak"]');
          picker.disabled = !e.target.checked;
          s.streak = e.target.checked ? picker.value : '';
        }
        else s[f] = e.target.value;
      };
      wrap.onclick = (e) => {
        if (e.target.closest('[data-add]')) {
          work.push(CB.species.newSpecies());
          wrap.innerHTML = body();
          const inputs = $$('input[data-f="name"]', wrap);
          inputs[inputs.length - 1].select();
        } else if (e.target.closest('[data-del]')) {
          const id = e.target.closest('tr').dataset.id;
          work = work.filter((x) => x.id !== id);
          wrap.innerHTML = body();
        }
      };
    });
    if (res === 'save') {
      speciesList = CB.species.normalize(work);
      storage.saveSpecies(speciesList);
      update();
      toast('Species saved.');
    }
  }

  // ---------- build steps ----------
  const PROGRESS = 'cutting-board-designer.progress';
  function readProgress() {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS)) || {};
    } catch (e) {
      return {};
    }
  }
  function writeProgress(all) {
    try {
      localStorage.setItem(PROGRESS, JSON.stringify(all));
    } catch (e) {
      /* ticks just won't be remembered */
    }
  }
  let planSteps = [];
  let planPics = {};
  function drawPics() {
    requestAnimationFrame(() =>
      $$('#planTrack canvas[data-pic]').forEach((c) => {
        const pic = planPics[c.dataset.pic];
        CB.illustrate.draw(c, pic.boxes, speciesList, { labels: pic.labels, yaw: pic.yaw, pitch: pic.pitch });
      })
    );
  }
  let planIndex = 0;

  function openPlan() {
    planSteps = CB.planner.steps(design, result, speciesList, prefs);
    planPics = CB.illustrate.stages(design, result);
    const done = readProgress()[design.id] || {};
    $('#planTitle').textContent = design.name;
    $('#planTrack').innerHTML = planSteps
      .map(
        (st, i) => `<section class="plan-step" data-i="${i}"><div class="plan-card">
          <p class="eyebrow">Step ${i + 1} of ${planSteps.length}</p>
          <h2>${esc(st.title)}</h2>
          <p class="lead">${esc(st.lead)}</p>
          ${planPics[st.key] ? `<canvas class="pic" data-pic="${st.key}" aria-label="Picture of this step"></canvas>` : ''}
          ${st.body}
          <label class="done"><input type="checkbox" data-done="${st.key}"${done[st.key] ? ' checked' : ''}/> Done</label>
        </div></section>`
      )
      .join('');
    $('#planView').hidden = false;
    drawPics();
    // Start at the first step that isn't ticked.
    const first = planSteps.findIndex((st) => !done[st.key]);
    goStep(first < 0 ? 0 : first, false);
  }

  function renderPlanNav() {
    const done = readProgress()[design.id] || {};
    $('#planDots').innerHTML = planSteps
      .map((st, i) => `<button class="${i === planIndex ? 'on' : ''}${done[st.key] ? ' done' : ''}" data-go="${i}" aria-label="Step ${i + 1}: ${esc(st.title)}"></button>`)
      .join('');
    const n = Object.keys(done).filter((k) => planSteps.some((st) => st.key === k)).length;
    $('#planCount').textContent = `${n} of ${planSteps.length} done`;
    $('#btnPlanPrev').disabled = planIndex === 0;
    $('#btnPlanNext').textContent = planIndex === planSteps.length - 1 ? 'Close' : 'Next';
  }

  function goStep(i, smooth = true) {
    planIndex = Math.max(0, Math.min(planSteps.length - 1, i));
    const track = $('#planTrack');
    track.scrollTo({ left: planIndex * track.clientWidth, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    const step = $$('.plan-step', track)[planIndex];
    if (step) step.scrollTop = 0;
    renderPlanNav();
  }

  function openSheet() {
    $('#sheetBody').innerHTML = sheet.html(design, result, speciesList, prefs);
    $('#sheetView').hidden = false;
    $('#sheetView').scrollTop = 0;
  }

  async function fileAction(kind) {
    $('#fileMenu').hidden = true;
    if (kind === 'new') {
      if (!(await guardUnsaved())) return;
      load(freshDesign('Untitled board'));
      pristine = snapshot();
    } else if (kind === 'stock') openStock();
    else if (kind === 'open') openSaved();
    else if (kind === 'duplicate') {
      design = engine.normalizeDesign({ ...JSON.parse(JSON.stringify(design)), id: engine.uid('bd'), name: `${design.name} copy` });
      storage.saveDesign(design);
      lastSaved = snapshot();
      update();
      toast('Saved a copy. You’re now editing the copy.');
    } else if (kind === 'exportDesign') {
      storage.download(`${slug(design.name)}.board.json`, JSON.stringify(storage.backup(design), null, 2));
    } else if (kind === 'exportAll') {
      storage.download(`cutting-boards-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(storage.backup(), null, 2));
    } else if (kind === 'import') $('#fileInput').click();
  }
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';

  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const res = storage.restore(data);
      speciesList = storage.loadSpecies();
      prefs = storage.loadPrefs();
      if (res.designs.length === 1) {
        if (await guardUnsaved()) load(res.designs[0]);
      } else update();
      toast(`Loaded ${res.designs.length} board${res.designs.length === 1 ? '' : 's'} and ${res.species} species.`);
    } catch (e) {
      toast(e.message && e.message.includes('Cutting Board') ? e.message : 'That file couldn’t be read.');
    }
  }

  // ---------- wire up ----------
  const preview = new CB.Preview($('#preview'), {
    onPick: (b) => {
      selected = b ? b.ref : null;
      update();
    },
  });

  $('#leftPanel').addEventListener('change', onChange);
  $('#leftPanel').addEventListener('click', onClick);
  $('#leftPanel').addEventListener('toggle', (e) => {
    if (e.target.matches('[data-allow]')) {
      prefs.allowOpen = e.target.open;
      storage.savePrefs(prefs);
    }
  }, true);
  $('#leftPanel').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[data-row-text]')) $('[data-act="rowText"]').click();
  });
  $('#rightPanel').addEventListener('click', onClick);
  $('#picker').addEventListener('change', onChange);
  $('#picker').addEventListener('click', onClick);

  $('#designName').addEventListener('change', (e) => commit((d) => (d.name = e.target.value.trim() || 'Untitled board')));
  $('#btnUndo').onclick = doUndo;
  $('#btnRedo').onclick = doRedo;
  $('#btnSave').onclick = save;
  $('#btnSpecies').onclick = openSpecies;
  $('#btnSheet').onclick = openSheet;
  $('#btnPlan').onclick = openPlan;
  $('#btnClosePlan').onclick = () => ($('#planView').hidden = true);
  $('#btnPlanPrev').onclick = () => goStep(planIndex - 1);
  $('#btnPlanNext').onclick = () => (planIndex === planSteps.length - 1 ? ($('#planView').hidden = true) : goStep(planIndex + 1));
  $('#planDots').onclick = (e) => {
    const b = e.target.closest('[data-go]');
    if (b) goStep(Number(b.dataset.go));
  };
  $('#btnPlanReset').onclick = () => {
    const all = readProgress();
    delete all[design.id];
    writeProgress(all);
    $$('[data-done]').forEach((x) => (x.checked = false));
    renderPlanNav();
  };
  $('#planTrack').addEventListener('change', (e) => {
    const key = e.target.dataset.done;
    if (!key) return;
    const all = readProgress();
    const mine = (all[design.id] = all[design.id] || {});
    if (e.target.checked) mine[key] = true;
    else delete mine[key];
    writeProgress(all);
    renderPlanNav();
  });
  $('#planTrack').addEventListener('scroll', () => {
    const track = $('#planTrack');
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i !== planIndex) {
      planIndex = i;
      renderPlanNav();
    }
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (!$('#planView').hidden) {
      goStep(planIndex, false);
      drawPics();
    }
  });
  $('#btnPrint').onclick = () => window.print();
  $('#btnCloseSheet').onclick = () => ($('#sheetView').hidden = true);
  $$('.units button').forEach(
    (b) =>
      (b.onclick = () => {
        prefs.units = b.dataset.units;
        storage.savePrefs(prefs);
        update();
      })
  );
  $$('.views button').forEach((b) => {
    b.onclick = () => {
      preview.setView(b.dataset.view);
      $$('.views button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    };
  });
  $('.views button[data-view="angle"]').setAttribute('aria-checked', 'true');
  $('#btnFile').onclick = (e) => {
    e.stopPropagation();
    $('#fileMenu').hidden = !$('#fileMenu').hidden;
  };
  $('#fileMenu').onclick = (e) => {
    const b = e.target.closest('[data-file]');
    if (b) fileAction(b.dataset.file);
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) $('#fileMenu').hidden = true;
  });
  $('#fileInput').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importFile(f);
  };
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target.matches('input, select, textarea');
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (document.activeElement) document.activeElement.blur();
      save();
    } else if (mod && !typing && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
    } else if (mod && !typing && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      doRedo();
    } else if (!$('#planView').hidden && !typing && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      goStep(planIndex + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'Escape') {
      if (!$('#planView').hidden) $('#planView').hidden = true;
      else if (!$('#sheetView').hidden) $('#sheetView').hidden = true;
      else if (selected) {
        selected = null;
        update();
      }
    }
  });
  window.addEventListener('beforeprint', () => {
    if ($('#sheetView').hidden) openSheet();
  });

  if (window.CB_PREVIEW) {
    $('#btnPrint').hidden = true;
    $('.sheet-bar .muted').textContent = 'Printing and PDF work in the downloaded app.';
    $$('[data-file="exportDesign"], [data-file="exportAll"]').forEach((b) => (b.hidden = true));
  }

  update();
})();
