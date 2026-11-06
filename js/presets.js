// Stock designs to start from. Each one only uses the Phase 1 patterns, so
// every one has a working cut list.
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});
  const IN = 25.4;
  const SP = {
    M: 'sp_maple',
    W: 'sp_walnut',
    C: 'sp_cherry',
    P: 'sp_purpleheart',
    R: 'sp_padauk',
    G: 'sp_wenge',
    H: 'sp_mahogany',
    Z: 'sp_zebrawood',
  };
  const accent = (species, alternate = false) => ({ enabled: true, angle: 60, offset: 0.2, thickness: IN / 8, species, on: 'all', alternate });
  // "M1.5 W.25" -> strips. Widths in inches.
  const strips = (text) =>
    text
      .trim()
      .split(/\s+/)
      .map((t) => ({ species: SP[t[0]], width: Number(t.slice(1)) * IN }));
  const repeat = (text, n) => Array.from({ length: n }, () => text).join(' ');
  const plan = (text, ids) => [...text].map((ch) => ({ panel: ids[ch], flip: false }));

  const PRESETS = [
    {
      name: 'Walnut with purpleheart accents',
      blurb: 'Walnut squares, each crossed by a purpleheart line at 60\u00b0.',
      design: { pattern: 'stripes', strips: strips(repeat('W1.5', 8)), rows: 10, rowDepth: 1.5 * IN, thickness: 1.5 * IN, accent: accent(SP.P) },
    },
    {
      name: 'Zebrawood with purpleheart accents',
      blurb: 'Zebrawood squares with purpleheart lines that alternate direction.',
      design: { pattern: 'stripes', strips: strips(repeat('Z1.5', 8)), rows: 10, rowDepth: 1.5 * IN, thickness: 1.5 * IN, accent: accent(SP.P, true) },
    },
    {
      name: 'Classic checkerboard',
      blurb: 'Walnut and maple, 1-1/2" squares.',
      design: { pattern: 'checker', strips: strips(repeat('M1.5 W1.5', 4)), rows: 10, rowDepth: 1.5 * IN, thickness: 1.5 * IN },
    },
    {
      name: 'Small checkerboard',
      blurb: '1" squares, 12 × 16.',
      design: { pattern: 'checker', strips: strips(repeat('M1 W1', 6)), rows: 16, rowDepth: IN, thickness: 1.25 * IN },
    },
    {
      name: 'Three-tone diagonal',
      blurb: 'Maple, cherry and walnut stepping across the board. Three panels, each shifted by one strip.',
      design: {
        pattern: 'plaid',
        panels: [
          { id: 'pA', name: 'A', thickness: 1.25 * IN, strips: strips(repeat('M1.25 C1.25 W1.25', 3)) },
          { id: 'pB', name: 'B', thickness: 1.25 * IN, strips: strips(repeat('C1.25 W1.25 M1.25', 3)) },
          { id: 'pC', name: 'C', thickness: 1.25 * IN, strips: strips(repeat('W1.25 M1.25 C1.25', 3)) },
        ],
        rowPlan: plan('ABCABCABCABC', { A: 'pA', B: 'pB', C: 'pC' }),
        thickness: 1.5 * IN,
      },
    },
    {
      name: 'Offset checkerboard',
      blurb: 'Brick pattern with the shifted rows flipped too.',
      design: { pattern: 'brick', strips: strips(repeat('M1.5 W1.5', 4)), rows: 10, rowDepth: 1.5 * IN, brickShift: 0.5, brickFlip: true, thickness: 1.5 * IN },
    },
    {
      name: 'Pinstripe brick',
      blurb: 'Cherry bricks with thin maple lines between them.',
      design: { pattern: 'brick', strips: strips(`${repeat('C1.5 M.25', 6)} C1.5`), rows: 12, rowDepth: 1.25 * IN, brickShift: 0.5, thickness: 1.5 * IN },
    },
    {
      name: 'Centre stripe',
      blurb: 'Maple with a walnut and purpleheart stripe down the middle.',
      design: { pattern: 'stripes', strips: strips('M3.5 W.5 P1 W.5 M3.5'), rows: 8, rowDepth: 1.5 * IN, thickness: 1.5 * IN },
    },
    {
      name: 'Wenge to maple fade',
      blurb: 'Wenge, walnut, mahogany, cherry and zebrawood fading to a maple centre.',
      design: { pattern: 'stripes', strips: strips('G1 W1 H1 C1 Z1 M1 M1 Z1 C1 H1 W1 G1'), rows: 16, rowDepth: IN, thickness: 1.5 * IN },
    },
    {
      name: 'Butcher block',
      blurb: 'Random-width stripes in maple, walnut and cherry.',
      design: { pattern: 'stripes', strips: strips('M1.75 W1.25 M2 C1 M1.5 W1.75 M1.25 C1.5'), rows: 9, rowDepth: 1.75 * IN, thickness: 1.75 * IN },
    },
    {
      name: 'Window pane',
      blurb: 'Maple panes with thin walnut lines both ways.',
      design: {
        pattern: 'plaid',
        panels: [
          { id: 'pA', name: 'A', thickness: 2 * IN, strips: strips(`${repeat('M2 W.25', 4)} M2`) },
          { id: 'pB', name: 'B', thickness: 0.25 * IN, strips: strips('W11') },
        ],
        rowPlan: plan('ABABABABABA', { A: 'pA', B: 'pB' }),
        thickness: 1.5 * IN,
      },
    },
    {
      name: 'Walnut frame',
      blurb: 'Maple and zebrawood checks inside a walnut border.',
      design: {
        pattern: 'plaid',
        panels: [
          { id: 'pA', name: 'A', thickness: IN, strips: strips('W12') },
          { id: 'pB', name: 'B', thickness: 1.5 * IN, strips: strips('W1 M2 Z2 M2 Z2 M2 W1') },
          { id: 'pC', name: 'C', thickness: 1.5 * IN, strips: strips('W1 Z2 M2 Z2 M2 Z2 W1') },
        ],
        rowPlan: plan('ABCBCBCBCA', { A: 'pA', B: 'pB', C: 'pC' }),
        thickness: 1.5 * IN,
      },
    },
    {
      name: 'Tartan',
      blurb: 'Cherry blocks crossed by walnut and maple bands.',
      design: {
        pattern: 'plaid',
        panels: [
          { id: 'pA', name: 'A', thickness: 1.5 * IN, strips: strips('C1.5 M.5 C1.5 W.5 C1.5 M.5 C1.5 W.5 C1.5') },
          { id: 'pB', name: 'B', thickness: 0.5 * IN, strips: strips('M1.5 W.5 M1.5 M.5 M1.5 W.5 M1.5 M.5 M1.5') },
          { id: 'pC', name: 'C', thickness: 0.5 * IN, strips: strips('W1.5 W.5 W1.5 M.5 W1.5 W.5 W1.5 M.5 W1.5') },
        ],
        rowPlan: plan('ABACABACA', { A: 'pA', B: 'pB', C: 'pC' }),
        thickness: 1.5 * IN,
      },
    },
    {
      name: 'Padauk accent checks',
      blurb: 'Checkerboard with a padauk strip at each edge.',
      design: { pattern: 'checker', strips: strips(`R1.25 ${repeat('M1.25 W1.25', 4)} R1.25`), rows: 12, rowDepth: 1.25 * IN, thickness: 1.5 * IN },
    },
  ];

  // A full design from a stock design, keeping your kerf and allowances.
  function make(preset, settings) {
    const base = CB.engine.newDesign(preset.name, settings);
    return CB.engine.normalizeDesign({ ...base, ...JSON.parse(JSON.stringify(preset.design)), id: base.id, name: preset.name, settings: base.settings });
  }

  CB.presets = { PRESETS, make };
})(typeof window !== 'undefined' ? window : globalThis);
