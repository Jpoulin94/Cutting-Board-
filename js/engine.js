// Patterns and the cut list engine.
//
// Every Phase 1 board is built in two stages:
//   1. Rip strips and glue them edge to edge into a panel. Strip widths set
//      the board's columns; the panel's milled thickness sets a row's depth.
//   2. Crosscut the panel into slices. Each slice's length becomes the
//      board's thickness. Turn the slices end grain up (flipping or shifting
//      some) and glue them together; each slice is one row of the board.
//
// All lengths are in millimetres.
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});
  const IN = 25.4;

  const PATTERNS = {
    stripes: { label: 'End grain stripes', blurb: 'Every row the same, so the strips run the full length of the board.' },
    checker: { label: 'Checkerboard', blurb: 'Every other row flipped end for end, so the colours alternate.' },
    brick: { label: 'Brick / offset', blurb: 'Every other row shifted sideways; the ragged edges are trimmed off.' },
    plaid: { label: 'Plaid / custom grid', blurb: 'Two or more panels milled to different thicknesses, stacked in any order.' },
  };

  const DEFAULT_SETTINGS = {
    kerfRip: IN / 8,
    kerfCross: IN / 8,
    flatten: IN / 4,
    panelPlane: IN / 16,
    endTrim: IN,
    edgeTrim: IN / 4,
    waste: 15,
  };

  let counter = 0;
  function uid(prefix) {
    counter += 1;
    return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function alternate(n, a, b, width) {
    return Array.from({ length: n }, (_, i) => ({ width, species: i % 2 ? b : a }));
  }

  function newDesign(name = 'Untitled board', settings = DEFAULT_SETTINGS) {
    const w = 1.5 * IN;
    return {
      id: uid('bd'),
      name,
      pattern: 'checker',
      thickness: 1.5 * IN,
      strips: alternate(8, 'sp_maple', 'sp_walnut', w),
      rows: 10,
      rowDepth: w,
      brickShift: 0.5,
      brickFlip: false,
      panels: [
        { id: 'pA', name: 'A', thickness: w, strips: alternate(8, 'sp_maple', 'sp_walnut', w) },
        { id: 'pB', name: 'B', thickness: 0.75 * IN, strips: alternate(8, 'sp_cherry', 'sp_maple', w) },
      ],
      rowPlan: ['pA', 'pB', 'pA', 'pA', 'pB', 'pA', 'pA', 'pB', 'pA'].map((panel, i) => ({ panel, flip: i % 2 === 1 })),
      settings: { ...DEFAULT_SETTINGS, ...settings },
    };
  }

  const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
  const pos = (v, d) => (num(v, d) > 0 ? num(v, d) : d);
  const nonneg = (v, d) => (num(v, d) >= 0 ? num(v, d) : d);

  function normStrips(list, fallback) {
    if (!Array.isArray(list) || !list.length) return fallback;
    return list.map((s) => ({ width: pos(s && s.width, IN), species: String((s && s.species) || 'sp_maple') }));
  }

  function normalizeDesign(d) {
    if (!d || typeof d !== 'object') throw new Error('Not a board design');
    const base = newDesign();
    const out = {
      id: typeof d.id === 'string' ? d.id : base.id,
      name: String(d.name || 'Untitled board'),
      pattern: PATTERNS[d.pattern] ? d.pattern : 'checker',
      thickness: pos(d.thickness, base.thickness),
      strips: normStrips(d.strips, base.strips),
      rows: Math.max(1, Math.round(pos(d.rows, base.rows))),
      rowDepth: pos(d.rowDepth, base.rowDepth),
      brickShift: Math.min(0.9, Math.max(0.1, num(d.brickShift, 0.5))),
      brickFlip: !!d.brickFlip,
      panels: Array.isArray(d.panels) && d.panels.length
        ? d.panels.map((p, i) => ({
            id: typeof p.id === 'string' ? p.id : uid('p'),
            name: String(p.name || String.fromCharCode(65 + i)),
            thickness: pos(p.thickness, IN),
            strips: normStrips(p.strips, base.panels[0].strips),
          }))
        : base.panels,
      rowPlan: [],
      settings: { ...DEFAULT_SETTINGS },
      savedAt: d.savedAt,
    };
    const ids = new Set(out.panels.map((p) => p.id));
    out.rowPlan = (Array.isArray(d.rowPlan) ? d.rowPlan : base.rowPlan)
      .filter((r) => r && ids.has(r.panel))
      .map((r) => ({ panel: r.panel, flip: !!r.flip }));
    if (!out.rowPlan.length) out.rowPlan = [{ panel: out.panels[0].id, flip: false }];
    const s = d.settings || {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) out.settings[k] = nonneg(s[k], DEFAULT_SETTINGS[k]);
    return out;
  }

  // Turns a design into panels and a row plan. Each strip carries `ref`, the
  // design setting its species comes from, so clicking it in the preview
  // changes the right thing everywhere.
  function generate(d) {
    const notes = [];
    if (d.pattern === 'plaid') {
      const panels = d.panels.map((p) => ({
        id: p.id,
        name: p.name,
        thickness: p.thickness,
        strips: p.strips.map((s, i) => ({ ...s, ref: { panel: p.id, index: i } })),
      }));
      const rows = d.rowPlan.map((r) => ({ panel: r.panel, flip: r.flip, offset: 0 }));
      const widths = new Set(panels.filter((p) => rows.some((r) => r.panel === p.id)).map((p) => Math.round(sum(p.strips.map((s) => s.width)) * 100)));
      if (widths.size > 1) notes.push('The panels are different widths, so the wider ones get trimmed to the narrowest.');
      return { panels, rows, notes, method: 'Glue up each panel, crosscut them all, then lay the slices out in the row order shown.' };
    }

    const strips = d.strips.map((s, i) => ({ ...s, ref: { strip: i } }));
    const A = { id: 'A', name: 'A', thickness: d.rowDepth, strips };
    const rows = [];
    let method;
    let panels = [A];

    if (d.pattern === 'stripes') {
      for (let r = 0; r < d.rows; r++) rows.push({ panel: 'A', flip: false, offset: 0 });
      method = 'Crosscut the panel and turn every slice end grain up, all facing the same way.';
    } else if (d.pattern === 'checker') {
      if (strips.length % 2 === 0) {
        for (let r = 0; r < d.rows; r++) rows.push({ panel: 'A', flip: r % 2 === 1, offset: 0 });
        method = 'Crosscut the panel, then flip every other slice end for end so the colours alternate.';
      } else {
        // With an odd strip count, flipping a slice gives the same order back,
        // so a second panel is made with every strip moved over by one.
        const B = {
          id: 'B',
          name: 'B',
          thickness: d.rowDepth,
          strips: strips.map((s, i) => {
            const from = i === 0 ? Math.min(1, strips.length - 1) : i - 1;
            return { width: s.width, species: strips[from].species, ref: { strip: from } };
          }),
        };
        panels = [A, B];
        for (let r = 0; r < d.rows; r++) rows.push({ panel: r % 2 ? 'B' : 'A', flip: false, offset: 0 });
        method = 'With an odd number of strips, flipping a slice doesn’t change its colour order. Make two panels instead (B has the colours moved over by one strip) and alternate their slices.';
        notes.push('Odd strip count: this uses two panels. Use an even count to make it from one panel.');
      }
    } else if (d.pattern === 'brick') {
      const shift = d.brickShift * Math.max(...strips.map((s) => s.width));
      for (let r = 0; r < d.rows; r++) rows.push({ panel: 'A', flip: d.brickFlip && r % 2 === 1, offset: r % 2 ? shift : 0 });
      method = `Crosscut the panel, then slide every other slice sideways by the brick shift${d.brickFlip ? ' and flip it end for end' : ''}. Trim the ragged edges after glue-up.`;
    }
    return { panels, rows, notes, method };
  }

  function sum(a) {
    return a.reduce((x, y) => x + y, 0);
  }

  // Rough lumber thickness needed for a milled thickness (inches), using
  // usual yard sizes: [quarters, thickest it mills to].
  const ROUGH = [
    [4, 0.8125],
    [5, 1.0625],
    [6, 1.3125],
    [8, 1.75],
    [10, 2.25],
    [12, 2.75],
    [16, 3.75],
  ];
  function roughFor(milledMm) {
    const inches = milledMm / IN;
    for (const [q, max] of ROUGH) if (inches <= max + 1e-6) return { quarters: q, inches: q / 4, laminate: false };
    // Thicker than 16/4: assume laminating 8/4 boards.
    const layers = Math.ceil(inches / 1.75);
    return { quarters: layers * 8, inches: layers * 2, laminate: true, layers };
  }

  function compute(design, speciesList) {
    const d = design;
    const S = d.settings;
    const g = generate(d);
    const warnings = [...g.notes];

    const panelById = Object.fromEntries(g.panels.map((p) => [p.id, p]));
    const width = (p) => sum(p.strips.map((s) => s.width));

    // Finished board footprint: the part every row covers.
    let start = -Infinity;
    let end = Infinity;
    let gluedStart = Infinity;
    let gluedEnd = -Infinity;
    for (const r of g.rows) {
      const w = width(panelById[r.panel]);
      start = Math.max(start, r.offset);
      end = Math.min(end, r.offset + w);
      gluedStart = Math.min(gluedStart, r.offset);
      gluedEnd = Math.max(gluedEnd, r.offset + w);
    }
    const boardWidth = Math.max(0, end - start);
    const boardLength = sum(g.rows.map((r) => panelById[r.panel].thickness));

    // Blocks for the preview, clipped to the finished footprint.
    const blocks = [];
    let y = 0;
    g.rows.forEach((r, ri) => {
      const p = panelById[r.panel];
      const seq = r.flip ? [...p.strips].reverse() : p.strips;
      let x = r.offset;
      seq.forEach((s) => {
        const x0 = Math.max(x, start);
        const x1 = Math.min(x + s.width, end);
        if (x1 - x0 > 1e-6) blocks.push({ x: x0 - start, y, w: x1 - x0, d: p.thickness, species: s.species, ref: s.ref, row: ri, panel: p.id });
        x += s.width;
      });
      y += p.thickness;
    });

    const sliceLength = d.thickness + S.flatten;
    const panels = [];
    for (const p of g.panels) {
      const slices = g.rows.filter((r) => r.panel === p.id).length;
      if (!slices) continue;
      const n = p.strips.length;
      const strips = p.strips.map((s, i) => ({
        ...s,
        rip: s.width + (i === 0 || i === n - 1 ? S.edgeTrim : 0) + (n === 1 && i === 0 ? S.edgeTrim : 0),
      }));
      const length = S.endTrim + slices * (sliceLength + S.kerfCross);
      panels.push({
        id: p.id,
        name: p.name,
        thickness: p.thickness,
        milled: p.thickness + S.panelPlane,
        strips,
        width: sum(strips.map((s) => s.rip)),
        designWidth: width(p),
        length,
        slices,
        cuts: slices,
        sliceLength,
        crossKerf: slices * S.kerfCross,
        ripKerf: n * S.kerfRip,
      });
    }

    // Rip list and lumber, per species.
    const spMap = {};
    for (const p of panels) {
      for (const s of p.strips) {
        const e = (spMap[s.species] = spMap[s.species] || { species: s.species, rips: [], pieces: [] });
        const key = `${p.id}|${s.rip.toFixed(3)}`;
        let rip = e.rips.find((x) => x.key === key);
        if (!rip) e.rips.push((rip = { key, panel: p.name, width: s.rip, length: p.length, thickness: p.milled, count: 0 }));
        rip.count += 1;
      }
    }
    const lumber = [];
    for (const e of Object.values(spMap)) {
      const sp = CB.species ? CB.species.byId(speciesList || [], e.species) : { name: e.species, price: null };
      let bf = 0;
      const pieces = [];
      const byPanel = {};
      for (const r of e.rips) (byPanel[r.panel] = byPanel[r.panel] || []).push(r);
      for (const [panelName, rips] of Object.entries(byPanel)) {
        const stockWidth = sum(rips.map((r) => (r.width + S.kerfRip) * r.count));
        const { length, thickness } = rips[0];
        const rough = roughFor(thickness);
        const pbf = (rough.inches * (stockWidth / IN) * (length / IN)) / 144;
        bf += pbf;
        pieces.push({ panel: panelName, width: stockWidth, length, thickness, rough, bf: pbf });
      }
      const bfBuy = bf * (1 + S.waste / 100);
      lumber.push({
        species: e.species,
        name: sp.name,
        color: sp.color,
        price: sp.price,
        rips: e.rips,
        pieces,
        bf,
        bfBuy,
        cost: sp.price == null ? null : bfBuy * sp.price,
        volumeM3: bfBuy * 0.00235974,
      });
    }
    lumber.sort((a, b) => b.bf - a.bf);

    const priced = lumber.filter((l) => l.cost != null);
    const total = {
      bf: sum(lumber.map((l) => l.bf)),
      bfBuy: sum(lumber.map((l) => l.bfBuy)),
      cost: sum(priced.map((l) => l.cost)),
      unpriced: lumber.filter((l) => l.cost == null).map((l) => l.name),
      cuts: sum(panels.map((p) => p.cuts)),
      crossKerf: sum(panels.map((p) => p.crossKerf)),
      ripKerf: sum(panels.map((p) => p.ripKerf)),
      rips: sum(panels.map((p) => p.strips.length)),
    };

    if (boardWidth <= 0) warnings.push('The rows don’t overlap, so there’s no board left after trimming.');

    return {
      pattern: d.pattern,
      method: g.method,
      rows: g.rows.map((r) => ({ ...r, name: panelById[r.panel].name, thickness: panelById[r.panel].thickness })),
      shift: d.pattern === 'brick' ? g.rows[1] && g.rows[1].offset : 0,
      board: {
        width: boardWidth,
        length: boardLength,
        thickness: d.thickness,
        gluedWidth: gluedEnd - gluedStart + 2 * S.edgeTrim,
      },
      blocks,
      panels,
      lumber,
      total,
      warnings,
      settings: S,
    };
  }

  CB.engine = { IN, PATTERNS, DEFAULT_SETTINGS, newDesign, normalizeDesign, generate, compute, roughFor, uid, alternate };
})(typeof window !== 'undefined' ? window : globalThis);
