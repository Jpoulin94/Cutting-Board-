// Build steps: the cut list turned into one page per shop step.
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});

  function tileSteps(design, r, speciesList, prefs) {
    const { esc, stickSvg, rowPanelSvg } = CB.sheet;
    const fmt = (mm) => CB.units.format(mm, prefs);
    const S = r.settings;
    const t = r.tiles;
    const cubes = t.kind === 'cubes';
    const shape = cubes ? 'diamond' : 'hexagon';
    const sp = (id) => CB.species.byId(speciesList, id);
    const sw = (id) => `<i class="sw" style="background:${sp(id).color}"></i>`;
    const out = [];
    const add = (key, title, lead, body) => out.push({ key, title, lead, body });
    const many = t.panels.length > 1;

    add(
      'mill',
      'Mill your lumber',
      `Plane every board to ${fmt(t.shape.thickness + S.panelPlane)} thick.`,
      `<table class="t"><thead><tr><th>Wood</th><th>Width</th><th>Length</th><th>Rough stock</th>${many ? '<th>For</th>' : ''}</tr></thead><tbody>${r.lumber
        .flatMap((l) => l.pieces.map((p) => `<tr><td>${sw(l.species)}${esc(l.name)}</td><td>${fmt(p.width)}</td><td>${fmt(p.length)}</td><td class="muted">${p.rough.laminate ? `${p.rough.layers} × 8/4 glued up` : `${p.rough.quarters}/4`}</td>${many ? `<td>${esc(p.panel)}</td>` : ''}</tr>`))
        .join('')}</tbody></table>
      <p class="note">Plane them all in one session so every stick comes out the same.</p>`
    );

    add(
      'sticks',
      cubes ? `Rip ${t.sticks} diamond sticks` : `Make ${t.sticks} hexagon sticks`,
      cubes
        ? `Tilt the blade 30°. Rip a starting bevel, then rip diamonds ${fmt(t.size)} along the face.`
        : `Rip blanks ${fmt(t.shape.width)} wide, then tilt the blade 30° and bevel all four corners.`,
      `${stickSvg(t, sp(t.woods[0]).color, fmt)}
      <table class="t"><thead><tr><th>Wood</th><th>Sticks</th><th>Length</th>${many ? '<th>For</th>' : ''}</tr></thead><tbody>${r.lumber
        .flatMap((l) => l.rips.map((x) => `<tr><td>${sw(l.species)}${esc(l.name)}</td><td>${x.count}</td><td>${fmt(x.length)}</td>${many ? `<td>${esc(x.panel)}</td>` : ''}</tr>`))
        .join('')}</tbody></table>
      <p class="note">${cubes ? `At this angle each rip uses ${fmt(t.kerfAngle)} of width.` : 'Make a test stick first.'} Every side should be ${fmt(t.size)}. Use a push block.</p>`
    );

    for (const pan of t.panels) {
      add(
        `row-${pan.id}`,
        many ? `Glue up row panel ${esc(pan.name)}` : 'Glue up the row panel',
        `Glue the ${pan.sticks.length} sticks side by side in this order, left to right.`,
        `<div class="diagram-wrap">${rowPanelSvg(pan, speciesList, 560)}</div>
        <p class="note">${cubes ? 'Each cube is a top diamond with two side diamonds below it. ' : ''}It makes ${pan.rows} row${pan.rows > 1 ? 's' : ''} of every board. Keep the sticks flush at the ends.</p>`
      );
    }

    add(
      'crosscut',
      'Crosscut the slices',
      `Square one end, then cut slices ${fmt(t.sliceLength)} long. That's your ${fmt(r.board.thickness)} board plus ${fmt(S.flatten)} to flatten.`,
      `<table class="t"><thead><tr><th>Panel</th><th>Slices</th></tr></thead><tbody>${t.panels
        .map((pan) => `<tr><td>Row ${esc(pan.name)}</td><td>${pan.slices}</td></tr>`)
        .join('')}</tbody></table>
      <p class="note">Use a stop block so every slice is the same.</p>`
    );

    add(
      'layout',
      'Lay out the rows',
      `Stand the slices end grain up in ${t.rows.length} rows. Every other row slides ${fmt(t.half)} over so it nests.`,
      `<p class="note">${many ? `The rows go ${t.rows.map((x) => x.name).join(' ')} from top to bottom. ` : ''}The numbers in the picture are the row numbers.</p>`
    );

    add(
      'glue2',
      'Glue the rows together',
      'Glue a few rows at a time, nesting each one into the last.',
      `<ul class="checks">
        <li>Spread a full coat of glue; end grain soaks it up.</li>
        <li>Painter's tape or band clamps pull nested rows tight better than bar clamps.</li>
        <li>Let it cure fully before flattening.</li>
      </ul>`
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
      const accName = esc(sp(r.panels.find((p) => p.accentPrep).strips.find((x) => x.accent).accent.species).name);
      add(
        'accent-stick',
        `Pick out the ${sticks} sticks that get an accent`,
        `These are the strips you just ripped. Each one becomes three pieces, then one stick again.`,
        `<p class="note">${A.alternate ? 'Every other stick gets its line mirrored, so mark the mirrored ones now. ' : ''}Mark the top face and one end of every stick so the halves go back the same way.</p>`
      );
      add(
        'accent-rip',
        `Rip each stick in two at ${A.angle}°`,
        `Tilt the blade so the cut is ${A.angle}° to the face, and rip each stick lengthwise ${Math.abs(A.offset) > 0.01 ? `${Math.round(Math.abs(A.offset) * 100)}% off centre` : 'through the centre'}.`,
        `<p class="note">You now have two halves per stick. Keep each pair together, in order, with your marks facing up. The blade removes ${fmt(S.kerfRip)}; the accent puts it back.</p>`
      );
      add(
        'accent-glue',
        `Glue a ${accName} strip between the halves`,
        `Spread glue on both cut faces, set the accent strip between them, and clamp the three pieces back into one stick with the ends lined up.`,
        `<p class="note">The accent strip is a little wider than the cut, so it sticks out on both faces. That's on purpose; it gets planed off next.</p>
        ${A.alternate ? '<p class="note">Mirror the angle on every other stick.</p>' : ''}`
      );
      add(
        'accent-done',
        'Plane the accent flush',
        `Once the glue cures, plane or sand the accent flush. Three pieces are one stick again, with the line running its full length.`,
        `<p class="note">${Math.abs(gain) < 0.01 ? `The ${fmt(A.thickness)} accent fills the ${fmt(S.kerfRip)} kerf, so each stick is back to its original size.` : gain < 0 ? `The accent is ${fmt(-gain)} thinner than the kerf. The strips were ripped oversize to make up for it.` : `The accent is ${fmt(gain)} thicker than the kerf. Joint the sticks back to size.`} Repeat for all ${sticks} sticks.</p>`
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
