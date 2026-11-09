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
    honeycomb: { label: 'Honeycomb', blurb: 'Six-sided sticks, beveled at 30\u00b0 and glued into a log, then sliced.', tile: true },
    cubes: { label: '3D cubes', blurb: 'Diamond sticks in three woods glued into a log, so each hexagon reads as a cube.', tile: true },
  };
  const isTile = (pattern) => !!(PATTERNS[pattern] && PATTERNS[pattern].tile);

  // Honeycomb and 3D cube designs: a sheet of angled sticks, sized by the
  // board you want rather than strip by strip.
  const DEFAULT_TILE = {
    width: 12 * IN,
    length: 16 * IN,
    size: IN, // side of each hexagon or diamond
    woods: [{ species: 'sp_maple' }, { species: 'sp_walnut' }, { species: 'sp_cherry' }, { species: 'sp_purpleheart' }], // the 4th is the border
    arrange: 'three',
    border: 0, // honeycomb: thickness of the border strip on each face of each hexagon; 0 for none // honeycomb: 'three' (no two neighbours alike), 'rows', 'single'
    boards: 1, // boards sliced from one log
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

  // An accent strip glued into a lengthwise angled rip in each stick, so
  // every square shows a thin line across it.
  const DEFAULT_ACCENT = {
    enabled: false,
    angle: 60, // degrees from the board's width
    offset: 0.2, // how far the line sits off centre, as a share of the strip width
    thickness: IN / 8,
    species: 'contrast', // or a species id
    on: 'all', // or a species id: only strips of that wood get a line
    alternate: false, // mirror the angle on every other strip
  };

  // Finishing touches that only change how the board looks in the preview.
  const DEFAULT_DETAILS = {
    groove: false,
    grooveInset: IN * 0.75, // from the edge to the groove
    grooveWidth: IN * 0.375,
    bevel: 0, // size of the 45\u00b0 chamfer on the top edges; 0 for none
    handles: 'none', // 'none' | 'grips' (finger grips under the ends) | 'holes' (hand holes through)
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
      accent: { ...DEFAULT_ACCENT },
      details: { ...DEFAULT_DETAILS },
      paint: { cells: {}, accents: {}, turns: {} },
      tile: JSON.parse(JSON.stringify(DEFAULT_TILE)),
      settings: { ...DEFAULT_SETTINGS, ...settings },
    };
  }

  const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
  const pos = (v, d) => (num(v, d) > 0 ? num(v, d) : d);
  const nonneg = (v, d) => (num(v, d) >= 0 ? num(v, d) : d);

  function normStrips(list, fallback) {
    if (!Array.isArray(list) || !list.length) return fallback;
    return list.map((s) => {
      const rot = Math.round(num(s && s.rot, 0) / 90) * 90;
      const out = { width: pos(s && s.width, IN), species: String((s && s.species) || 'sp_maple') };
      if (rot % 360) out.rot = ((rot % 360) + 360) % 360;
      if (s && s.flip) out.flip = true; // flipped end for end: its end face is mirrored
      return out;
    });
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
      rowTurn: !!d.rowTurn,
      grain: d.grain === 'random' ? 'random' : 'matched',
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
    const a = d.accent && typeof d.accent === 'object' ? d.accent : {};
    out.accent = {
      enabled: !!a.enabled,
      angle: Math.min(80, Math.max(10, num(a.angle, DEFAULT_ACCENT.angle))),
      offset: Math.min(0.45, Math.max(-0.45, num(a.offset, DEFAULT_ACCENT.offset))),
      thickness: pos(a.thickness, DEFAULT_ACCENT.thickness),
      species: typeof a.species === 'string' && a.species ? a.species : 'contrast',
      on: typeof a.on === 'string' && a.on ? a.on : 'all',
      alternate: !!a.alternate,
    };
    const tl = d.tile && typeof d.tile === 'object' ? d.tile : {};
    const woods = Array.isArray(tl.woods) ? tl.woods : [];
    out.tile = {
      width: pos(tl.width, DEFAULT_TILE.width),
      length: pos(tl.length, DEFAULT_TILE.length),
      size: Math.max(IN / 4, pos(tl.size, DEFAULT_TILE.size)),
      woods: DEFAULT_TILE.woods.map((w, i) => ({ species: woods[i] && typeof woods[i].species === 'string' && woods[i].species ? woods[i].species : w.species })),
      arrange: ['three', 'rows', 'single'].includes(tl.arrange) ? tl.arrange : 'three',
      boards: Math.max(1, Math.min(20, Math.round(num(tl.boards, 1)))),
      border: nonneg(tl.border, 0),
    };
    // Leave at least half the hexagon as core.
    out.tile.border = Math.min(out.tile.border, (out.tile.size * Math.sqrt(3)) / 2 * 0.5);
    const pt = paintOf(d);
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v));
    // Single pieces turned or flipped: { key: { rot, flip } }, overriding the stick.
    const turns = {};
    Object.entries(pt.turns).forEach(([k, v]) => {
      if (!v || typeof v !== 'object') return;
      const rot = ((Math.round(num(v.rot, 0) / 90) * 90) % 360 + 360) % 360;
      turns[k] = { rot, flip: !!v.flip };
    });
    out.paint = { cells: clean(pt.cells), accents: clean(pt.accents), turns };
    const x = d.details && typeof d.details === 'object' ? d.details : {};
    out.details = {
      groove: !!x.groove,
      grooveInset: pos(x.grooveInset, DEFAULT_DETAILS.grooveInset),
      grooveWidth: pos(x.grooveWidth, DEFAULT_DETAILS.grooveWidth),
      bevel: nonneg(x.bevel, 0),
      handles: ['grips', 'holes'].includes(x.handles) ? x.handles : 'none',
    };
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
      for (let r = 0; r < d.rows; r++) rows.push({ panel: 'A', flip: !!d.rowTurn && r % 2 === 1, offset: 0 });
      method = d.rowTurn
        ? 'Crosscut the panel, turn every slice end grain up, and turn every other slice end for end.'
        : 'Crosscut the panel and turn every slice end grain up, all facing the same way.';
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
            return { width: s.width, species: strips[from].species, rot: strips[from].rot, flip: strips[from].flip, ref: { strip: from } };
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

  // Keeps the part of a polygon where nx*x + ny*y <= c.
  function clip(poly, nx, ny, c) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = nx * a[0] + ny * a[1] - c;
      const db = nx * b[0] + ny * b[1] - c;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  // The accent band across a w x d stick end, in the stick's own coordinates.
  function accentLine(w, d, A, mirrored) {
    const th = (A.angle * Math.PI) / 180;
    let cx = w / 2 + A.offset * w;
    let dx = Math.cos(th);
    const dy = -Math.sin(th);
    if (mirrored) {
      cx = w - cx;
      dx = -dx;
    }
    return { cx, cy: d / 2, dx, dy, nx: -dy, ny: dx };
  }
  function accentBand(w, d, A, mirrored) {
    const L = accentLine(w, d, A, mirrored);
    const h = A.thickness / 2;
    const c0 = L.nx * L.cx + L.ny * L.cy;
    let poly = [[0, 0], [w, 0], [w, d], [0, d]];
    poly = clip(poly, L.nx, L.ny, c0 + h);
    poly = clip(poly, -L.nx, -L.ny, -(c0 - h));
    return poly;
  }
  // Length of the cut line across the stick end.
  function chord(w, d, A) {
    const L = accentLine(w, d, A, false);
    let t0 = -Infinity;
    let t1 = Infinity;
    for (const [p, q] of [[-L.dx, L.cx], [L.dx, w - L.cx], [-L.dy, L.cy], [L.dy, d - L.cy]]) {
      if (Math.abs(p) < 1e-12) continue;
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    return Math.max(0, t1 - t0);
  }

  // Turns a stick's cross-section about its centre (clockwise, in degrees).
  function turn(poly, w, d, deg) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    const cx = w / 2;
    const cy = d / 2;
    let out = poly.map(([u, v]) => [cx + (u - cx) * c - (v - cy) * sn, cy + (u - cx) * sn + (v - cy) * c]);
    out = clip(out, 1, 0, w);
    out = clip(out, -1, 0, 0);
    out = clip(out, 0, 1, d);
    out = clip(out, 0, -1, 0);
    return out;
  }

  // Squares painted a different wood: { cells: { key: species }, accents: { key: species } }.
  function paintOf(d) {
    const p = d.paint && typeof d.paint === 'object' ? d.paint : {};
    const cells = p.cells && typeof p.cells === 'object' ? p.cells : {};
    const accents = p.accents && typeof p.accents === 'object' ? p.accents : {};
    const turns = p.turns && typeof p.turns === 'object' ? p.turns : {};
    return { cells, accents, turns, any: Object.keys(cells).length + Object.keys(accents).length + Object.keys(turns).length > 0 };
  }

  function compute(design, speciesList) {
    if (isTile(design.pattern)) return computeTiles(design, speciesList);
    const d = design;
    const S = d.settings;
    const g = generate(d);
    const warnings = [...g.notes];

    let panelById = Object.fromEntries(g.panels.map((p) => [p.id, p]));
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

    // Angled accents: which sticks get one, and in which wood.
    const A = d.accent || DEFAULT_ACCENT;
    const counts = {};
    for (const p of g.panels) for (const s of p.strips) counts[s.species] = (counts[s.species] || 0) + 1;
    const contrast = (sp) => {
      const others = Object.entries(counts).filter(([k]) => k !== sp).sort((a, b) => b[1] - a[1]);
      return others.length ? others[0][0] : sp === 'sp_walnut' ? 'sp_maple' : 'sp_walnut';
    };
    for (const p of g.panels) {
      p.strips = p.strips.map((s, i) => {
        if (!A.enabled || (A.on !== 'all' && A.on !== s.species)) return { ...s, accent: null };
        return { ...s, accent: { species: A.species === 'contrast' ? contrast(s.species) : A.species, mirrored: A.alternate && i % 2 === 1 } };
      });
    }

    // Painted squares: a row whose squares differ from its panel becomes its
    // own panel (same strips, different woods), so the cut list follows.
    const paint = paintOf(d);
    if (paint.any) {
      const variants = [];
      g.rows.forEach((r, ri) => {
        const base = panelById[r.panel];
        let changed = false;
        const strips = base.strips.map((st, i) => {
          const key = `${ri}:${i}`;
          const sp = paint.cells[key];
          const ac = paint.accents[key];
          const tn = paint.turns[key];
          const turned = tn && (tn.rot !== (st.rot || 0) || tn.flip !== !!st.flip);
          if (!sp && !(ac && st.accent) && !turned) return st;
          changed = true;
          const out = { ...st, species: sp || st.species, accent: st.accent && ac ? { ...st.accent, species: ac } : st.accent };
          if (turned) {
            out.rot = tn.rot;
            out.flip = tn.flip;
          }
          return out;
        });
        if (!changed) {
          if (!variants.some((v) => v.id === base.id)) variants.push(base);
          return;
        }
        const sig = JSON.stringify(strips.map((st) => [st.species, st.rot || 0, !!st.flip, st.accent ? st.accent.species : '']));
        let v = variants.find((x) => x.base === base.id && x.sig === sig);
        if (!v) {
          const n = variants.filter((x) => x.base === base.id).length + 1;
          v = { ...base, id: `${base.id}~${n}`, name: `${base.name}${n + 1}`, base: base.id, sig, strips };
          variants.push(v);
        }
        r.panel = v.id;
      });
      // Number each panel's variants; if no row uses the panel itself any
      // more, its first variant takes over its plain name.
      const used = new Set(g.rows.map((r) => r.panel));
      const live = variants.filter((v) => used.has(v.id));
      live.forEach((v) => {
        if (!v.base) return;
        const own = used.has(v.base);
        const n = live.filter((x) => x.base === v.base).indexOf(v) + (own ? 2 : 1);
        v.name = n === 1 ? panelById[v.base].name : `${panelById[v.base].name}${n}`;
      });
      variants.length = 0;
      variants.push(...live);
      g.panels = variants;
      panelById = Object.fromEntries(g.panels.map((p) => [p.id, p]));
    }

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
        if (x1 - x0 > 1e-6) {
          const b = {
            x: x0 - start,
            y,
            w: x1 - x0,
            d: p.thickness,
            species: s.species,
            ref: s.ref,
            row: ri,
            panel: p.id,
            // Where the whole stick sits, and how it's turned, for drawing
            // its grain the same way on every slice.
            stick: `${p.id}:${p.strips.indexOf(s)}`,
            paintKey: `${ri}:${p.strips.indexOf(s)}`,
            poly: [[x0 - start, y], [x1 - start, y], [x1 - start, y + p.thickness], [x0 - start, y + p.thickness]],
            sx: x - start,
            sw: s.width,
            rot: s.rot || 0,
            mirror: !!s.flip,
            flip: !!r.flip,
          };
          if (s.accent) {
            // A flipped slice is turned end for end in place, so its
            // cross-section is rotated half a turn.
            let poly = accentBand(s.width, p.thickness, A, s.accent.mirrored);
            if (s.flip) poly = poly.map(([u, v]) => [s.width - u, v]);
            if (s.rot) poly = turn(poly, s.width, p.thickness, s.rot);
            if (r.flip) poly = poly.map(([u, v]) => [s.width - u, p.thickness - v]);
            poly = poly.map(([u, v]) => [x + u - start, y + v]);
            poly = clip(poly, 1, 0, x1 - start);
            poly = clip(poly, -1, 0, -(x0 - start));
            if (poly.length >= 3) b.accent = { species: s.accent.species, poly };
          }
          blocks.push(b);
        }
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
      // The angled rip removes a kerf and the accent puts some back. If the
      // accent is thinner, start those sticks oversize by the difference.
      const accented = strips.filter((s) => s.accent);
      const th = (A.angle * Math.PI) / 180;
      const lost = Math.max(0, S.kerfRip - A.thickness);
      let accentPrep = null;
      if (accented.length) {
        for (const s of accented) s.rip += lost * Math.sin(th);
        const chords = accented.map((s) => chord(s.width, p.thickness, A));
        accentPrep = {
          sticks: accented.length,
          extraWidth: lost * Math.sin(th),
          extraThickness: lost * Math.cos(th),
          gain: A.thickness - S.kerfRip,
          stripWidth: Math.max(...chords) + IN / 8,
          strips: accented.map((s) => s.accent.species),
        };
      }
      panels.push({
        id: p.id,
        name: p.name,
        thickness: p.thickness,
        milled: p.thickness + S.panelPlane + (accentPrep ? accentPrep.extraThickness : 0),
        strips,
        accentPrep,
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
    for (const p of panels) {
      if (!p.accentPrep) continue;
      const per = {};
      for (const sp of p.accentPrep.strips) per[sp] = (per[sp] || 0) + 1;
      for (const [sp, count] of Object.entries(per)) {
        const e = (spMap[sp] = spMap[sp] || { species: sp, rips: [], pieces: [] });
        e.rips.push({ key: `${p.id}|accent`, panel: `${p.name} accent`, accent: true, width: A.thickness, length: p.length, thickness: p.accentPrep.stripWidth + S.panelPlane, count });
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
      rips: sum(panels.map((p) => p.strips.length)) + sum(panels.map((p) => (p.accentPrep ? p.accentPrep.sticks : 0))),
      angleRips: sum(panels.map((p) => (p.accentPrep ? p.accentPrep.sticks : 0))),
    };
    total.ripKerf += total.angleRips * S.kerfRip;

    const skew = g.panels.some((p) => p.strips.some((st) => (st.rot === 90 || st.rot === 270) && Math.abs(st.width - p.thickness) > 0.5));
    if (skew) warnings.push('A stick turned 90\u00b0 or 270\u00b0 swaps its width and depth. Make the strip width match the row depth so the squares stay square.');
    if (boardWidth <= 0) warnings.push('The rows don’t overlap, so there’s no board left after trimming.');

    return {
      pattern: d.pattern,
      grain: d.grain || 'matched',
      details: d.details || { ...DEFAULT_DETAILS },
      method: (total.angleRips ? 'Before glue-up 1, rip each accented stick at the angle, glue in its accent strip and glue it back together. ' : '') + g.method,
      accent: total.angleRips ? A : null,
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

  // ---------- honeycomb and 3D cubes ----------
  // Pointy-top hexagons of side s in rows along the width; odd rows sit
  // half a hexagon over. A 3D cube is one hexagon split into three diamonds.
  function computeTiles(d, speciesList) {
    const S = d.settings;
    const t = d.tile || DEFAULT_TILE;
    const W = t.width;
    const L = t.length;
    const s = t.size;
    const f = s * Math.sqrt(3); // across the flats
    const E = S.edgeTrim;
    const cubes = d.pattern === 'cubes';
    const woods = t.woods.map((w) => w.species);
    const sin60 = Math.sin(Math.PI / 3);

    // Centre the grid on the board so the edges match.
    const cols = Math.ceil((W + 2 * E) / f) + 2;
    const rowsN = Math.ceil((L + 2 * E) / (1.5 * s)) + 2;
    const ox = W / 2 - Math.floor(cols / 2) * f;
    const oy = L / 2 - Math.floor(rowsN / 2) * 1.5 * s;
    const r0 = Math.floor(rowsN / 2);
    const hexOf = (cx, cy, side) => [0, 1, 2, 3, 4, 5].map((k) => {
      const a = ((-90 + 60 * k) * Math.PI) / 180;
      return [cx + side * Math.cos(a), cy + side * Math.sin(a)];
    });
    const hex = (cx, cy) => hexOf(cx, cy, s);
    const bordered = !cubes && t.border > 0;
    const bw = bordered ? t.border : 0;
    const coreSide = s - (2 * bw) / Math.sqrt(3);
    const clipRect = (poly, x0, y0, x1, y1) => clip(clip(clip(clip(poly, 1, 0, x1), -1, 0, -x0), 0, 1, y1), 0, -1, -y0);
    const area = (poly) => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

    const pieces = []; // every stick in the log: { poly, wood, rot, row, col }
    for (let r = 0; r < rowsN; r++) {
      for (let c = -1; c < cols; c++) {
        const cx = ox + c * f + (((r - r0) % 2 + 2) % 2 ? f / 2 : 0);
        const cy = oy + r * 1.5 * s;
        const H = hex(cx, cy);
        if (cubes) {
          // [top, left, right] faces: C,V5,V0,V1 / C,V3,V4,V5 / C,V1,V2,V3
          const C = [cx, cy];
          const faces = [[C, H[5], H[0], H[1]], [C, H[3], H[4], H[5]], [C, H[1], H[2], H[3]]];
          faces.forEach((poly, k) => pieces.push({ poly, wood: k, rot: k * 120, row: r, col: c, key: `${r}:${c}:${k}`, parts: [{ poly, wood: k, rot: k * 120 }] }));
        } else {
          let wood = 0;
          if (t.arrange === 'three') {
            const q = c - Math.floor((r - r0) / 2);
            wood = ((q - (r - r0)) % 3 + 3) % 3;
          } else if (t.arrange === 'rows') wood = ((r - r0) % 2 + 2) % 2;
          let parts = [{ poly: H, wood, rot: 0 }];
          if (bordered) {
            // A core hexagon with a border strip on each of its six faces.
            const Hc = hexOf(cx, cy, coreSide);
            parts = [{ poly: Hc, wood, rot: 0 }];
            for (let k = 0; k < 6; k++) parts.push({ poly: [H[k], H[(k + 1) % 6], Hc[(k + 1) % 6], Hc[k]], wood: 3, rot: k * 60 + 120, border: k });
          }
          pieces.push({ poly: H, wood, rot: 0, row: r, col: c, key: `${r}:${c}`, parts });
        }
      }
    }

    // Sticks that end up in the board (after the edge trim), and the part
    // of each that shows.
    const blocks = [];
    const sticks = [];
    const paint = paintOf(d);
    for (const pc of pieces) {
      pc.parts.forEach((part, pi) => {
        const key = `${pc.key}:${pi}`;
        const over = part.wood === 3 ? paint.accents[key] : paint.cells[key];
        part.species = over || woods[part.wood];
        part.key = key;
      });
      pc.species = pc.parts[0].species;
    }
    for (const pc of pieces) {
      const inLog = clipRect(pc.poly, -E, -E, W + E, L + E);
      if (inLog.length < 3 || area(inLog) < 1) continue;
      sticks.push(pc);
      pc.parts.forEach((part, pi) => {
      const vis = clipRect(part.poly, 0, 0, W, L);
      if (vis.length < 3 || area(vis) < 0.5) return;
      const xs = vis.map((p) => p[0]);
      const ys = vis.map((p) => p[1]);
      const bx = Math.min(...xs);
      const by = Math.min(...ys);
      const cxs = part.poly.map((p) => p[0]);
      const sx = Math.min(...cxs);
      blocks.push({
        x: bx,
        y: by,
        w: Math.max(...xs) - bx,
        d: Math.max(...ys) - by,
        poly: vis,
        species: part.species,
        ref: { tile: part.wood },
        paintKey: part.key,
        border: part.wood === 3,
        row: pc.row,
        panel: 'T',
        stick: `T:${pc.key}:${pi}`,
        sx,
        sw: Math.max(...cxs) - sx,
        rot: part.rot,
        flip: false,
      });
      });
    }

    // Built row by row: long sticks glued side by side into a one-row
    // panel, crosscut into slices, and the slices glued together with every
    // other row nested half a hexagon over. Rows that read the same come
    // from the same panel.
    const kAngle = S.kerfRip / sin60; // kerf measured across the face at a 30 degree blade tilt
    const shape = cubes
      ? { name: 'diamond', thickness: s * sin60, width: s, faceWidth: s + kAngle, tilt: 30 }
      : { name: 'hexagon', thickness: coreSide * Math.sqrt(3), width: 2 * coreSide, faceWidth: 2 * coreSide + S.kerfRip, tilt: 30 };
    const sliceLength = d.thickness + S.flatten;

    const usedRows = [...new Set(sticks.map((pc) => pc.row))].sort((a, b) => a - b);
    const usedCols = sticks.map((pc) => pc.col);
    const cMin = Math.min(...usedCols);
    const cMax = Math.max(...usedCols);
    const byRow = {};
    for (const pc of pieces) if (pc.col >= cMin && pc.col <= cMax) (byRow[pc.row] = byRow[pc.row] || []).push(pc);
    const panelsT = [];
    const rowList = [];
    for (const r of usedRows) {
      const list = byRow[r].sort((a, b) => a.col - b.col || (a.key < b.key ? -1 : 1));
      const seq = list.map((pc) => pc.parts.map((part) => part.species).join('+')).join(',');
      let pan = panelsT.find((x) => x.seq === seq);
      if (!pan) {
        pan = { id: `R${panelsT.length}`, name: String.fromCharCode(65 + panelsT.length), seq, rows: 0, sticks: list.map((pc) => ({ wood: pc.wood, species: pc.species })), sample: list };
        panelsT.push(pan);
      }
      pan.rows += 1;
      const odd = ((r - r0) % 2 + 2) % 2 === 1;
      rowList.push({ r, panel: pan.id, name: pan.name, shift: odd, y0: Math.min(...list.flatMap((pc) => pc.poly.map((q) => q[1]))) });
    }
    const rowPanel = Object.fromEntries(rowList.map((x) => [x.r, x.name]));
    for (const b of blocks) b.panel = rowPanel[b.row] || 'A';
    for (const pan of panelsT) {
      pan.slices = pan.rows * t.boards;
      pan.length = S.endTrim + pan.slices * (sliceLength + S.kerfCross);
      pan.width = (cMax - cMin + 1) * f + f / 2;
      pan.depth = 2 * s; // point to point, across the row
      const xs = pan.sample.flatMap((pc) => pc.poly.map((q) => q[0]));
      const ys = pan.sample.flatMap((pc) => pc.poly.map((q) => q[1]));
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      pan.end = pan.sample.flatMap((pc, i) => pc.parts.map((part) => ({ poly: part.poly.map(([x, y]) => [x - x0, y - y0]), species: part.species, rot: part.rot, stick: i, border: part.border != null })));
      delete pan.sample;
    }

    const bySp = {};
    for (const pan of panelsT) {
      for (const st of pan.sticks) {
        const e = (bySp[st.species] = bySp[st.species] || { species: st.species, perPanel: {} });
        e.perPanel[pan.id] = (e.perPanel[pan.id] || 0) + 1;
      }
    }
    const lumber = [];
    let rips = 0;
    for (const e of Object.values(bySp)) {
      const sp = CB.species ? CB.species.byId(speciesList || [], e.species) : { name: e.species, price: null };
      const thickness = shape.thickness + S.panelPlane;
      const rough = roughFor(thickness);
      const pieces2 = [];
      const ripsL = [];
      let bf = 0;
      let count = 0;
      for (const pan of panelsT) {
        const n = e.perPanel[pan.id];
        if (!n) continue;
        const width = n * shape.faceWidth + (cubes ? s / 2 : 0) + IN / 4;
        const pbf = (rough.inches * (width / IN) * (pan.length / IN)) / 144;
        bf += pbf;
        count += n;
        pieces2.push({ panel: `Row ${pan.name}`, width, length: pan.length, thickness, rough, bf: pbf });
        ripsL.push({ key: `${e.species}|${pan.id}`, panel: `Row ${pan.name}`, width: shape.width, length: pan.length, thickness: shape.thickness, count: n });
      }
      rips += count;
      const bfBuy = bf * (1 + S.waste / 100);
      lumber.push({ species: e.species, name: sp.name, color: sp.color, price: sp.price, sticks: count, rips: ripsL, pieces: pieces2, bf, bfBuy, cost: sp.price == null ? null : bfBuy * sp.price, volumeM3: bfBuy * 0.00235974 });
    }
    // Border strips: six per hexagon, ripped thin off the edge of a board
    // as thick as the strip is wide.
    let borderInfo = null;
    if (bordered) {
      const stripW = s + IN / 8;
      const thickness = stripW + S.panelPlane;
      const rough = roughFor(thickness);
      let strips = 0;
      const touched = new Set();
      for (const pan of panelsT) {
        const per = {};
        for (const pc of pan.end) if (pc.border) per[pc.species] = (per[pc.species] || 0) + 1;
        for (const [bsp, n] of Object.entries(per)) {
          let e = lumber.find((l) => l.species === bsp);
          if (!e) {
            const sp = CB.species ? CB.species.byId(speciesList || [], bsp) : { name: bsp, price: null };
            e = { species: bsp, name: sp.name, color: sp.color, price: sp.price, sticks: 0, rips: [], pieces: [], bf: 0 };
            lumber.push(e);
          }
          touched.add(e);
          strips += n;
          const width = n * (bw + S.kerfRip) + IN / 4;
          const pbf = (rough.inches * (width / IN) * (pan.length / IN)) / 144;
          e.bf += pbf;
          e.pieces.push({ panel: `Row ${pan.name} border`, width, length: pan.length, thickness, rough, bf: pbf, border: true });
          e.rips.push({ key: `${bsp}|${pan.id}|border`, panel: `Row ${pan.name} border`, border: true, width: bw, length: pan.length, thickness: stripW, count: n });
        }
      }
      for (const e of touched) {
        e.bfBuy = e.bf * (1 + S.waste / 100);
        e.cost = e.price == null ? null : e.bfBuy * e.price;
        e.volumeM3 = e.bfBuy * 0.00235974;
      }
      rips += strips;
      borderInfo = { width: bw, species: woods[3], strips, stripWidth: stripW, coreSide, outerSide: s };
    }
    lumber.sort((a, b) => b.bf - a.bf);
    const priced = lumber.filter((l) => l.cost != null);
    const slices = sum(panelsT.map((p) => p.slices));
    const coreSticks = sum(panelsT.map((p) => p.sticks.length));
    const total = {
      bf: sum(lumber.map((l) => l.bf)),
      bfBuy: sum(lumber.map((l) => l.bfBuy)),
      cost: sum(priced.map((l) => l.cost)),
      unpriced: lumber.filter((l) => l.cost == null).map((l) => l.name),
      cuts: slices,
      crossKerf: slices * S.kerfCross,
      ripKerf: cubes ? rips * kAngle : rips * S.kerfRip,
      rips,
      angleRips: cubes ? rips : coreSticks * (bordered ? 10 : 4),
      sticks: coreSticks,
    };
    const warnings = [];
    if (s < IN / 2) warnings.push('Sticks this small are hard to cut safely. Use a push block and a zero-clearance insert, or make them bigger.');
    const shortest = Math.min(...panelsT.map((p) => p.length));
    if (shortest < 18 * IN) warnings.push('Some row panels are short. Rip the sticks longer for safety; the extra length makes more boards.');
    return {
      pattern: d.pattern,
      grain: d.grain || 'matched',
      details: d.details || { ...DEFAULT_DETAILS },
      method: cubes
        ? 'Rip diamond sticks with the blade tilted 30° and glue them into one-row panels of cubes. Crosscut the panels into slices and glue the slices together, every other row nested half a cube over.'
        : 'Bevel six-sided sticks with the blade tilted 30° and glue them into one-row panels. Crosscut the panels into slices and glue the slices together, every other row nested half a hexagon over.',
      accent: null,
      rows: [],
      shift: 0,
      board: { width: W, length: L, thickness: d.thickness, gluedWidth: W + 2 * E },
      blocks,
      panels: [],
      tiles: {
        kind: cubes ? 'cubes' : 'honeycomb',
        size: s,
        across: f,
        shape,
        woods,
        panels: panelsT,
        rows: rowList,
        boards: t.boards,
        sliceLength,
        kerfAngle: kAngle,
        sticks: coreSticks,
        half: f / 2,
        border: borderInfo,
      },
      lumber,
      total,
      warnings,
      settings: S,
    };
  }

  // Strip fitter: ways to reach a finished size. Every board measurement is
  // linear in the strip widths and row depths, so each option is measured at
  // one scale with compute(), then scaled and rounded to a sensible step.
  function fitOptions(d, speciesList, t) {
    const step = t.step || IN / 16;
    const rnd = (v) => Math.max(step, Math.round(v / step) * step);
    const measure = (x) => compute(normalizeDesign(x), speciesList).board;
    const clone = () => JSON.parse(JSON.stringify(d));
    if (!(t.width > 0) || !(t.length > 0)) return [];

    if (isTile(d.pattern)) return [];
    if (d.pattern === 'plaid') {
      const x = clone();
      const b = measure(x);
      const kw = t.width / b.width;
      const kl = t.length / b.length;
      x.panels.forEach((p) => {
        p.strips.forEach((st) => (st.width = rnd(st.width * kw)));
        p.thickness = rnd(p.thickness * kl);
      });
      return [{ design: x, n: null, rows: x.rowPlan.length, board: measure(x), keep: true }];
    }

    const cur = d.strips;
    const n0 = cur.length;
    const same = (a, b) => a.species === b.species && Math.abs(a.width - b.width) < 1e-6 && (a.rot || 0) === (b.rot || 0) && !!a.flip === !!b.flip;
    let period = 0;
    for (let p = 1; p * 2 <= n0 && !period; p++) if (cur.every((st, i) => same(st, cur[i % p]))) period = p;
    const uniform = cur.every((st) => Math.abs(st.width - cur[0].width) < 1e-6);
    const square = t.square !== false && uniform && Math.abs(d.rowDepth - cur[0].width) < 1e-6;
    const avg = cur.reduce((a, st) => a + st.width, 0) / n0;
    const tw = t.stripWidth > 0 ? t.stripWidth : avg;
    const counts = new Set([n0]);
    if (period) {
      const nt = Math.round(t.width / tw);
      for (const n of [nt - 1, nt, nt + 1]) if (n >= 2 && n <= 60) counts.add(n);
    }

    const out = [];
    for (const n of [...counts].sort((a, b) => a - b)) {
      const x = clone();
      x.strips = Array.from({ length: n }, (_, i) => ({ ...cur[period ? i % period : i] }));
      x.rows = 2; // two rows, so a brick shift is counted
      const k = t.width / measure(x).width;
      x.strips.forEach((st) => (st.width = rnd(st.width * k)));
      if (square) x.rowDepth = x.strips[0].width;
      x.rows = Math.max(1, Math.round(t.length / (square ? x.rowDepth : d.rowDepth)));
      if (!square) x.rowDepth = rnd(t.length / x.rows);
      out.push({ design: x, n, rows: x.rows, stripWidth: uniform ? x.strips[0].width : null, rowDepth: x.rowDepth, board: measure(x), keep: n === n0 });
    }
    // Closest to the size asked for first.
    const off = (o) => Math.abs(o.board.width - t.width) + Math.abs(o.board.length - t.length);
    let best = out[0];
    for (const o of out) if (off(o) < off(best) - 1e-6) best = o;
    best.best = true;
    return out;
  }

  CB.engine = { paintOf, turn, accentLine, isTile, DEFAULT_TILE, clip, IN, PATTERNS, DEFAULT_SETTINGS, DEFAULT_ACCENT, DEFAULT_DETAILS, fitOptions, accentBand, chord, newDesign, normalizeDesign, generate, compute, roughFor, uid, alternate };
})(typeof window !== 'undefined' ? window : globalThis);
