// Build steps: the cut list turned into one page per shop step.
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});

  function tileSteps(design, r, speciesList, prefs) {
    const { esc } = CB.sheet;
    const fmt = (mm) => CB.units.format(mm, prefs);
    const S = r.settings;
    const t = r.tiles;
    const cubes = t.kind === 'cubes';
    const sp = (id) => CB.species.byId(speciesList, id);
    const sw = (id) => `<i class="sw" style="background:${sp(id).color}"></i>`;
    const out = [];
    const add = (key, title, lead, body) => out.push({ key, title, lead, body });
    const faceNames = ['top', 'left', 'right'];

    add(
      'mill',
      'Mill your lumber',
      `Plane every board to ${fmt(t.shape.thickness)} thick.`,
      `<table class="t"><thead><tr><th>Wood</th><th>Thickness</th><th>Width</th><th>Length</th><th>Rough stock</th></tr></thead><tbody>${r.lumber
        .map((l) => {
          const p = l.pieces[0];
          return `<tr><td>${sw(l.species)}${esc(l.name)}</td><td>${fmt(p.thickness)}</td><td>${fmt(p.width)}</td><td>${fmt(p.length)}</td><td class="muted">${p.rough.laminate ? `${p.rough.layers} × 8/4 glued up` : `${p.rough.quarters}/4`}</td></tr>`;
        })
        .join('')}</tbody></table>
      <p class="note">Plane them all in one session so every stick comes out the same thickness. The thickness is ${cubes ? 'the height of a diamond' : 'the hexagon across its flats'}.</p>`
    );

    add(
      'sticks',
      cubes ? 'Rip the diamond sticks' : 'Make the hexagon sticks',
      cubes
        ? `Tilt the blade 30\u00b0. Rip a starting bevel, then rip diamonds ${fmt(t.size)} along the face.`
        : `Rip blanks ${fmt(t.shape.width)} wide, then tilt the blade 30\u00b0 and bevel all four corners.`,
      `${CB.sheet.stickSvg(t, sp(t.woods[0]).color, fmt)}
      <table class="t"><thead><tr><th>Wood</th><th>Long sticks</th><th>Length</th>${cubes ? '<th>Used for</th>' : ''}</tr></thead><tbody>${r.lumber
        .map((l) => `<tr><td>${sw(l.species)}${esc(l.name)}</td><td>${l.long}</td><td>${fmt(t.ripLength)}</td>${cubes ? `<td>${t.woods.map((w, i) => (w === l.species ? faceNames[i] : null)).filter(Boolean).join(', ')} faces</td>` : ''}</tr>`)
        .join('')}</tbody></table>
      <p class="note">${cubes ? `At this angle each rip uses ${fmt(t.kerfAngle)} of width. Every side should measure ${fmt(t.size)}.` : `Every side should measure ${fmt(t.size)}. Make a test stick first and check it against the others.`} Use a push block; these are small parts.</p>`
    );

    add(
      'cut',
      'Cut the sticks to length',
      `Cut ${t.sticks} short sticks ${fmt(t.stickLength)} long, ${t.perRip} from each long one.`,
      `<table class="t"><thead><tr><th>Wood</th><th>Short sticks</th></tr></thead><tbody>${r.lumber
        .map((l) => `<tr><td>${sw(l.species)}${esc(l.name)}</td><td>${l.sticks}</td></tr>`)
        .join('')}</tbody></table>
      <p class="note">Use a stop block so they all match. ${fmt(t.stickLength)} makes ${t.boards} board${t.boards > 1 ? 's' : ''} ${fmt(r.board.thickness)} thick, with ${fmt(S.flatten)} to flatten and ${fmt(S.endTrim)} to square up.</p>`
    );

    add(
      'log',
      'Glue up the log',
      cubes ? 'Glue the diamonds end grain up, one row at a time, so each hexagon has one of each wood.' : 'Glue the hexagons end grain up, one row at a time, nesting each row into the one before.',
      `<ul class="checks">
        ${cubes ? t.woods.map((w, i) => `<li>${sw(w)}${esc(sp(w).name)} on the ${faceNames[i]} of every cube.</li>`).join('') : ''}
        <li>The log is about ${fmt(t.logWidth)} × ${fmt(t.logLength)}: ${fmt(S.edgeTrim)} bigger all round than the board, for trimming.</li>
        <li>Glue a few rows at a time and let them set. Painter's tape or band clamps hold the rows tight.</li>
        ${r.grain === 'matched' ? '<li>Keep the same face of every stick pointing the same way so the grain matches.</li>' : ''}
      </ul>`
    );

    add(
      'slice',
      t.boards > 1 ? `Slice ${t.boards} boards from the log` : 'Square the log',
      t.boards > 1 ? `Square one end, then cut slices ${fmt(t.sliceLength)} long.` : `Square both ends so the log is ${fmt(t.sliceLength)} long.`,
      `<p class="note">That's your ${fmt(r.board.thickness)} board plus ${fmt(S.flatten)} to flatten. A crosscut sled keeps the slices square.</p>`
    );

    add(
      'trim',
      'Trim the edges and flatten',
      `Trim the ragged edges to ${fmt(r.board.width)} × ${fmt(r.board.length)}, then flatten both faces.`,
      `<ul class="checks">
        <li>Flatten with a router sled or drum sander to <b>${fmt(r.board.thickness)}</b> thick.</li>
        <li>Never run end grain through a thickness planer.</li>
      </ul>`
    );

    add(
      'finish',
      'Sand and finish',
      `Finished board: ${fmt(r.board.width)} × ${fmt(r.board.length)} × ${fmt(r.board.thickness)}.`,
      `<ul class="checks">
        <li>Sand through the grits, wiping between grits to raise and knock down the grain.</li>
        <li>Flood the end grain with a food-safe oil, let it soak in, wipe off the excess, then add a board butter.</li>
      </ul>`
    );
    return out;
  }

  function steps(design, r, speciesList, prefs) {
    if (r.tiles) return tileSteps(design, r, speciesList, prefs);
    const { esc, turnNote } = CB.sheet;
    const fmt = (mm) => CB.units.format(mm, prefs);
    const S = r.settings;
    const sp = (id) => CB.species.byId(speciesList, id);
    const sw = (id) => `<i class="sw" style="background:${sp(id).color}"></i>`;
    const out = [];
    const add = (key, title, lead, body) => out.push({ key, title, lead, body });
    const many = r.panels.length > 1;
    const pn = (p) => (many ? `panel ${esc(p.name)}` : 'the panel');

    // 1. Mill the lumber.
    const millRows = r.lumber
      .flatMap((l) =>
        l.pieces.map(
          (p) => `<tr><td>${sw(l.species)}${esc(l.name)}</td><td>${fmt(p.thickness)}</td><td>${fmt(p.width)}</td><td>${fmt(p.length)}</td>
          <td class="muted">${p.rough.laminate ? `${p.rough.layers} × 8/4 glued up` : `${p.rough.quarters}/4`}${/accent/.test(p.panel) ? ', for accents' : ''}</td></tr>`
        )
      )
      .join('');
    add(
      'mill',
      'Mill your lumber',
      'Flatten, joint and plane each board to these sizes.',
      `<table class="t"><thead><tr><th>Wood</th><th>Thickness</th><th>Width</th><th>Length</th><th>Rough stock</th></tr></thead><tbody>${millRows}</tbody></table>
      <p class="note">Widths include one ${fmt(S.kerfRip)} kerf per strip. The lumber list adds ${S.waste}% for defects, so buy ${r.total.bfBuy.toFixed(2)} bf in all.</p>`
    );

    // 2. Rip the strips.
    const ripRows = r.lumber
      .flatMap((l) =>
        l.rips
          .filter((x) => !x.accent)
          .map((x) => `<tr><td>${sw(l.species)}${esc(l.name)}</td><td>${x.count}</td><td>${fmt(x.width)}</td><td>${fmt(x.length)}</td><td>${fmt(x.thickness)}</td>${many ? `<td>${esc(x.panel)}</td>` : ''}</tr>`)
      )
      .join('');
    const stripCount = r.panels.reduce((n, p) => n + p.strips.length, 0);
    add(
      'rip',
      `Rip ${stripCount} strips`,
      `Number each strip as you rip it. Each rip uses ${fmt(S.kerfRip)} of width.`,
      `<table class="t"><thead><tr><th>Wood</th><th>Count</th><th>Width</th><th>Length</th><th>Thickness</th>${many ? '<th>Panel</th>' : ''}</tr></thead><tbody>${ripRows}</tbody></table>
      ${r.grain === 'matched' ? '<p class="note">Mark the same face on every strip so the grain all faces the same way.</p>' : ''}
      ${r.panels.some((p) => p.strips.length > 1) ? `<p class="note">The two outside strips of each panel are ${fmt(S.edgeTrim)} wider, so trimming the board's edges still leaves full-size squares.</p>` : ''}`
    );

    // 3–4. Angled accents.
    if (r.accent) {
      const A = r.accent;
      const accRows = r.lumber
        .flatMap((l) => l.rips.filter((x) => x.accent).map((x) => `<tr><td>${sw(l.species)}${esc(l.name)}</td><td>${x.count}</td><td>${fmt(x.width)}</td><td>${fmt(x.thickness)}</td><td>${fmt(x.length)}</td></tr>`))
        .join('');
      add(
        'accent-strips',
        'Cut the accent strips',
        `Rip thin accent strips ${fmt(A.thickness)} thick. Run them through a drum sander or planer sled if they need cleaning up.`,
        `<table class="t"><thead><tr><th>Wood</th><th>Count</th><th>Thick</th><th>Wide</th><th>Long</th></tr></thead><tbody>${accRows}</tbody></table>`
      );
      const sticks = r.panels.filter((p) => p.accentPrep).reduce((n, p) => n + p.accentPrep.sticks, 0);
      const gain = A.thickness - S.kerfRip;
      add(
        'accent-glue',
        `Rip ${sticks} sticks at ${A.angle}° and glue in the accents`,
        `Rip each strip lengthwise at ${A.angle}° to its face, ${Math.abs(A.offset) > 0.01 ? `${Math.round(Math.abs(A.offset) * 100)}% off centre` : 'through the centre'}. Glue an accent strip between the two halves and clamp them back together with the ends lined up.`,
        `${A.alternate ? '<p>Mirror the angle on every other stick.</p>' : ''}
        <p class="note">${Math.abs(gain) < 0.01 ? `The ${fmt(A.thickness)} accent fills the ${fmt(S.kerfRip)} kerf, so each stick comes back to its original size.` : gain < 0 ? `The accent is ${fmt(-gain)} thinner than the kerf. The strips were ripped oversize to make up for it.` : `The accent is ${fmt(gain)} thicker than the kerf. Joint the sticks back to size once the glue cures.`}</p>
        <p class="note">Let the glue cure before the next glue-up.</p>`
      );
    }

    // 5. Glue-up 1, one page per panel.
    for (const p of r.panels) {
      const order = p.strips.map((s, i) => `<li>${sw(s.species)}${esc(sp(s.species).name)} · ${fmt(s.rip)}${s.rot ? ` · turned ${s.rot}°` : ''}</li>`).join('');
      add(
        `glue1-${p.id}`,
        `Glue up ${pn(p)}`,
        `Glue the ${p.strips.length} strips side by side in this order, left to right.`,
        `${turnNote(p)}
        <ol class="order">${order}</ol>
        <p class="note">Glued size: ${fmt(p.width)} wide × ${fmt(p.length)} long × ${fmt(p.milled)} thick. Keep the strips flush on the faces to save planing.</p>`
      );
    }

    // 6. Plane.
    add(
      'plane',
      many ? 'Plane the panels to thickness' : 'Plane the panel to thickness',
      'Scrape off the glue and plane both faces.',
      `<ul class="checks">${r.panels.map((p) => `<li>${many ? `Panel ${esc(p.name)}: ` : ''}${fmt(p.milled)} → <b>${fmt(p.thickness)}</b></li>`).join('')}</ul>`
    );

    // 7. Crosscut.
    add(
      'crosscut',
      'Square the ends and crosscut the slices',
      `Square one end, then cut slices ${fmt(r.panels[0].sliceLength)} long. That's your ${fmt(design.thickness)} board plus ${fmt(S.flatten)} to flatten.`,
      `<table class="t"><thead><tr>${many ? '<th>Panel</th>' : ''}<th>Slices</th><th>Slice length</th><th>Kerf lost</th></tr></thead><tbody>
      ${r.panels.map((p) => `<tr>${many ? `<td>${esc(p.name)}</td>` : ''}<td>${p.slices}</td><td>${fmt(p.sliceLength)}</td><td>${p.cuts} × ${fmt(S.kerfCross)} = ${fmt(p.crossKerf)}</td></tr>`).join('')}
      </tbody></table>
      <p class="note">Use a stop block so every slice is the same. Number the top of each slice as it comes off the saw.</p>`
    );

    // 8. Lay out.
    const flips = r.rows.filter((x) => x.flip).length;
    const shifts = r.rows.filter((x) => x.offset).length;
    add(
      'layout',
      'Lay out the slices end grain up',
      `Stand each slice on end and arrange them top to bottom in this order.${flips ? ` ${flips} slices get flipped end for end.` : ''}${shifts ? ` ${shifts} slices slide ${fmt(r.shift)} to the side.` : ''}`,
      `<p class="note">The numbers in the picture are the slice numbers. \u21c4 means flip that slice end for end.</p>
      <p class="note">Dry-fit the whole board and check it against the picture before any glue goes on.</p>`
    );

    // 9. Glue-up 2.
    add(
      'glue2',
      'Glue up the board',
      'Glue the slices together end grain up, with a full coat of glue on both faces.',
      `<ul class="checks">
        <li>Clamp across the rows, with cauls top and bottom to keep the slices flat.</li>
        <li>${r.rows.length > 8 ? 'With this many rows, glue it in two halves, then join the halves.' : 'Line up the glue lines across rows as you tighten the clamps.'}</li>
        <li>Let it cure fully before flattening.</li>
      </ul>`
    );

    // 10. Trim and flatten.
    add(
      'trim',
      'Trim the edges and flatten',
      `Trim ${fmt(S.edgeTrim + (r.shift || 0) / 2)} off each long edge, then flatten both faces.`,
      `<ul class="checks">
        <li>Width after trimming: <b>${fmt(r.board.width)}</b>${r.shift ? ' (this removes the brick overhang too)' : ''}.</li>
        <li>Flatten with a router sled or drum sander, about ${fmt(S.flatten / 2)} per face, to <b>${fmt(r.board.thickness)}</b> thick.</li>
        <li>Square the ends if needed. Never run end grain through a thickness planer.</li>
      </ul>`
    );

    // 11. Finish.
    add(
      'finish',
      'Sand and finish',
      `Finished board: ${fmt(r.board.width)} × ${fmt(r.board.length)} × ${fmt(r.board.thickness)}.`,
      `<ul class="checks">
        <li>Sand through the grits, wiping between grits to raise and knock down the grain.</li>
        <li>Ease the edges and add feet or finger grips if you want them.</li>
        <li>Flood the end grain with a food-safe oil, let it soak in, wipe off the excess, then add a board butter.</li>
      </ul>`
    );
    return out;
  }

  CB.planner = { steps };
})(typeof window !== 'undefined' ? window : globalThis);
