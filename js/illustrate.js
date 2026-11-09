// Pictures for the build steps: boxes of wood drawn in 3D with their grain,
// in the woods you picked. A box is { x, y, z, w, d, h, species, grain }
// in mm, where grain is the axis the wood fibres run along ('x', 'y' or 'z').
// Boxes may carry `decor`: polygons drawn on their top face (world x, y).
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});
  const DEG = Math.PI / 180;

  const hexRgb = (hex) => {
    const n = parseInt((hex || '#999999').slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgb = (c, k = 1, a = 1) => `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;
  const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  function rand(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    };
  }

  function draw(canvas, boxes, speciesList, opts = {}) {
    const yaw = (opts.yaw ?? -32) * DEG;
    const pitch = (opts.pitch ?? 34) * DEG;
    const cssW = canvas.clientWidth || opts.width || 600;
    const cssH = canvas.clientHeight || opts.height || 320;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!boxes.length) return;

    const sp = Object.fromEntries(speciesList.map((s) => [s.id, s]));
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const spn = Math.sin(pitch);
    // y runs away from the viewer here, so boards lie "into" the picture.
    const raw = (x, y, z) => {
      const yy = -y;
      const x1 = x * cy - yy * sy;
      const y1 = x * sy + yy * cy;
      return [x1, y1 * spn - z * cp, y1 * cp + z * spn];
    };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const b of boxes)
      for (const x of [b.x, b.x + b.w])
        for (const y of [b.y, b.y + b.d])
          for (const z of [b.z, b.z + b.h]) {
            const [a, c] = raw(x, y, z);
            minX = Math.min(minX, a);
            maxX = Math.max(maxX, a);
            minY = Math.min(minY, c);
            maxY = Math.max(maxY, c);
          }
    const pad = 14;
    const s = Math.min((cssW - pad * 2) / (maxX - minX), (cssH - pad * 2) / (maxY - minY));
    const ox = cssW / 2 - ((minX + maxX) / 2) * s;
    const oy = cssH / 2 - ((minY + maxY) / 2) * s;
    const P = (x, y, z) => {
      const [a, c] = raw(x, y, z);
      return [ox + a * s, oy + c * s];
    };
    const depth = (b) => raw(b.x + b.w / 2, b.y + b.d / 2, b.z + b.h / 2)[2];
    // Which side faces the viewer.
    const facing = (n) => {
      const [nx, ny, nz] = n;
      const yy = -ny;
      const y1 = nx * sy + yy * cy;
      return y1 * cp + nz * spn > 1e-6;
    };

    // Soft shadow.
    ctx.save();
    ctx.filter = 'blur(8px)';
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (const b of boxes) {
      if (b.z > 1) continue;
      const pts = [P(b.x, b.y, 0), P(b.x + b.w, b.y, 0), P(b.x + b.w, b.y + b.d, 0), P(b.x, b.y + b.d, 0)];
      path(ctx, pts.map(([x, y]) => [x + 4, y + 6]));
      ctx.fill();
    }
    ctx.restore();

    const sorted = [...boxes].sort((a, b) => depth(a) - depth(b));
    for (const b of sorted) {
      if (b.prism) {
        drawPrism(ctx, b, sp, P, facing, s);
        continue;
      }
      const species = sp[b.species] || { color: '#999999', streak: '' };
      const base = hexRgb(species.color);
      const streak = species.streak ? hexRgb(species.streak) : null;
      const seed = b.seed ?? Math.round(b.x * 3 + b.y * 7 + b.z * 11 + 1);
      // Faces: [normal, corner, axis a (world), axis b (world), shade]
      const X = b.x;
      const Y = b.y;
      const Z = b.z;
      const faces = [
        { n: [0, 0, 1], o: [X, Y, Z + b.h], a: 'x', b: 'y', la: b.w, lb: b.d, k: 1 },
        { n: [0, -1, 0], o: [X, Y, Z], a: 'x', b: 'z', la: b.w, lb: b.h, k: 0.82 },
        { n: [0, 1, 0], o: [X, Y + b.d, Z], a: 'x', b: 'z', la: b.w, lb: b.h, k: 0.82 },
        { n: [-1, 0, 0], o: [X, Y, Z], a: 'y', b: 'z', la: b.d, lb: b.h, k: 0.68 },
        { n: [1, 0, 0], o: [X + b.w, Y, Z], a: 'y', b: 'z', la: b.d, lb: b.h, k: 0.68 },
      ];
      for (const f of faces) {
        if (!facing(f.n)) continue;
        const vec = (axis, len) => (axis === 'x' ? [len, 0, 0] : axis === 'y' ? [0, len, 0] : [0, 0, len]);
        const [ax, ay, az] = vec(f.a, 1);
        const [bx, by, bz] = vec(f.b, 1);
        const o = P(...f.o);
        const pa = P(f.o[0] + ax, f.o[1] + ay, f.o[2] + az);
        const pb = P(f.o[0] + bx, f.o[1] + by, f.o[2] + bz);
        const affine = [pa[0] - o[0], pa[1] - o[1], pb[0] - o[0], pb[1] - o[1], o[0], o[1]];
        ctx.save();
        ctx.transform(...affine);
        ctx.beginPath();
        ctx.rect(0, 0, f.la, f.lb);
        ctx.fillStyle = rgb(base, f.k);
        ctx.fill();
        ctx.clip();
        const normalAxis = f.n[0] ? 'x' : f.n[1] ? 'y' : 'z';
        const r = rand(seed * 31 + (normalAxis.charCodeAt(0) - 119));
        if (normalAxis === b.grain) endGrain(ctx, f, base, streak, r, b);
        else longGrain(ctx, f, f.a === b.grain ? 'a' : 'b', base, streak, r, s);
        if (b.xdecor) {
          // An accent running along a lying stick: (u, v) across its end, v up.
          const ax = f.n[0] ? 'x' : f.n[1] ? 'y' : 'z';
          for (const dc of b.xdecor) {
            ctx.fillStyle = rgb(hexRgb((sp[dc.species] || { color: '#6e2f55' }).color), f.k);
            if (ax === 'y') {
              ctx.beginPath();
              dc.poly.forEach(([u, v], i) => (i ? ctx.lineTo(u, v) : ctx.moveTo(u, v)));
              ctx.closePath();
              ctx.fill();
            } else {
              const along = ax === 'z' ? 1 : 0; // which coordinate sits on this face
              const at = ax === 'z' ? b.h : f.n[0] > 0 ? b.w : 0;
              const vals = dc.poly.filter((p) => Math.abs(p[along] - at) < 0.01).map((p) => p[1 - along]);
              if (vals.length < 2) continue;
              const lo = Math.min(...vals);
              const hi = Math.max(...vals);
              if (ax === 'z') ctx.fillRect(lo, 0, hi - lo, f.lb);
              else ctx.fillRect(0, lo, f.la, hi - lo);
            }
          }
        }
        if (f.n[2] === 0 && b.decor) {
          // Accent lines run the full length of the stick, so they show on its sides.
          const ax = f.n[1] ? 1 : 0;
          const at = ax === 1 ? (f.n[1] > 0 ? Y + b.d : Y) : f.n[0] > 0 ? X + b.w : X;
          const o0 = ax === 1 ? X : Y;
          for (const dc of b.decor) {
            const vals = dc.poly.filter((p) => Math.abs(p[ax] - at) < 0.01).map((p) => p[1 - ax]);
            if (vals.length < 2) continue;
            const lo = Math.min(...vals) - o0;
            const hi = Math.max(...vals) - o0;
            if (hi - lo < 0.01) continue;
            ctx.fillStyle = rgb(hexRgb((sp[dc.species] || { color: '#6e2f55' }).color), f.k);
            ctx.fillRect(lo, 0, hi - lo, f.lb);
          }
        }
        if (f.n[2] === 1 && b.decor) {
          for (const d of b.decor) {
            ctx.beginPath();
            d.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x - X, y - Y) : ctx.moveTo(x - X, y - Y)));
            ctx.closePath();
            ctx.fillStyle = (sp[d.species] || { color: '#6e2f55' }).color;
            ctx.fill();
          }
        }
        ctx.restore();
        ctx.beginPath();
        const c = [P(...f.o), pa, null, pb];
        const pts = [
          P(...f.o),
          P(f.o[0] + ax * f.la, f.o[1] + ay * f.la, f.o[2] + az * f.la),
          P(f.o[0] + ax * f.la + bx * f.lb, f.o[1] + ay * f.la + by * f.lb, f.o[2] + az * f.la + bz * f.lb),
          P(f.o[0] + bx * f.lb, f.o[1] + by * f.lb, f.o[2] + bz * f.lb),
        ];
        void c;
        path(ctx, pts);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Labels (strip numbers, slice numbers) in screen space.
    if (opts.labels) {
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const l of opts.labels) {
        const [x, y] = P(l.x, l.y, l.z);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const w = ctx.measureText(l.text).width + 8;
        ctx.fillRect(x - w / 2, y - 8, w, 15);
        ctx.fillStyle = '#1f1b18';
        ctx.fillText(l.text, x, y + 3);
      }
    }
  }

  // A stick with a many-sided end: b.prism = { pts, axis }. With axis 'z'
  // the points are world (x, y) and it stands from z to z + h; with axis 'y'
  // they are world (x, z) and it lies from y to y + d.
  function drawPrism(ctx, b, sp, P, facing, scale) {
    const species = sp[b.species] || { color: '#999999', streak: '' };
    const base = hexRgb(species.color);
    const streak = species.streak ? hexRgb(species.streak) : null;
    const { pts, axis } = b.prism;
    const r = rand(b.seed ?? 7);
    const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    const ccw = area > 0;
    const lo = axis === 'z' ? b.z : b.y;
    const len = axis === 'z' ? b.h : b.d;
    const W3 = (u, v, t) => (axis === 'z' ? [u, v, t] : [u, t, v]);
    const N3 = (nu, nv, nt) => (axis === 'z' ? [nu, nv, nt] : [nu, nt, nv]);
    const light = (n) => 0.62 + 0.38 * Math.max(0, -0.35 * n[0] + 0.45 * n[1] + 0.82 * n[2]);
    const face = (corners, n, texture) => {
      if (!facing(n)) return;
      const k = light(n);
      const scr = corners.map((c) => P(...c));
      path(ctx, scr);
      ctx.fillStyle = rgb(base, k);
      ctx.fill();
      ctx.save();
      ctx.clip();
      texture(k);
      ctx.restore();
      path(ctx, scr);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    };
    // Sides: long grain running along the stick.
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      const du = c[0] - a[0];
      const dv = c[1] - a[1];
      const el = Math.hypot(du, dv);
      if (el < 1e-6) continue;
      const nu = (ccw ? dv : -dv) / el;
      const nv = (ccw ? -du : du) / el;
      const corners = [W3(a[0], a[1], lo), W3(c[0], c[1], lo), W3(c[0], c[1], lo + len), W3(a[0], a[1], lo + len)];
      face(corners, N3(nu, nv, 0), (k) => {
        const o = P(...corners[0]);
        const pa = P(...corners[1]);
        const pb = P(...corners[3]);
        ctx.transform((pa[0] - o[0]) / el, (pa[1] - o[1]) / el, (pb[0] - o[0]) / len, (pb[1] - o[1]) / len, o[0], o[1]);
        longGrain(ctx, { la: el, lb: len, k }, 'b', base, streak, r, scale);
      });
    }
    // The two ends: end grain.
    for (const [t, sign] of [[lo, -1], [lo + len, 1]]) {
      const corners = pts.map(([u, v]) => W3(u, v, t));
      face(corners, N3(0, 0, sign), (k) => {
        const us = pts.map((p) => p[0]);
        const vs = pts.map((p) => p[1]);
        const u0 = Math.min(...us);
        const v0 = Math.min(...vs);
        const o = P(...W3(u0, v0, t));
        const pa = P(...W3(u0 + 1, v0, t));
        const pb = P(...W3(u0, v0 + 1, t));
        ctx.transform(pa[0] - o[0], pa[1] - o[1], pb[0] - o[0], pb[1] - o[1], o[0], o[1]);
        if (b.turn) {
          const cu = (Math.max(...us) - u0) / 2;
          const cv = (Math.max(...vs) - v0) / 2;
          ctx.translate(cu, cv);
          ctx.rotate((b.turn * Math.PI) / 180);
          ctx.translate(-cu, -cv);
        }
        endGrain(ctx, { la: Math.max(...us) - u0, lb: Math.max(...vs) - v0, k }, base, streak, r, b);
      });
    }
  }

  function endGrain(ctx, f, base, streak, r, b) {
    const size = Math.max(f.la, f.lb);
    const cx = f.la / 2 + (r() - 0.5) * f.la * 0.4;
    const far = streak ? size * (2 + r() * 2) : size * (0.9 + r() * 0.5);
    const cyy = f.lb + far;
    const gap = streak ? size * (0.1 + r() * 0.08) : Math.max(1.5, size / 12);
    const dark = lum(base) < 0.35;
    for (let rr = far - size * 0.2; rr < far + size * 1.6; rr += gap * (0.8 + r() * 0.5)) {
      ctx.beginPath();
      ctx.arc(cx, cyy, rr, 0, Math.PI * 2);
      if (streak) {
        ctx.strokeStyle = rgb(streak, f.k, 0.7 + r() * 0.25);
        ctx.lineWidth = gap * (0.2 + r() * 0.3);
      } else {
        ctx.strokeStyle = dark ? 'rgba(255,235,210,0.12)' : 'rgba(60,30,10,0.16)';
        ctx.lineWidth = gap * 0.3;
      }
      ctx.stroke();
    }
    void b;
  }

  function longGrain(ctx, f, along, base, streak, r, scale) {
    // Lines running along the grain, a little wavy.
    const len = along === 'a' ? f.la : f.lb;
    const across = along === 'a' ? f.lb : f.la;
    const dark = lum(base) < 0.35;
    const step = Math.max(across / 40, (streak ? 5 : 3) / scale);
    for (let t = r() * step; t < across; t += step * (0.6 + r() * 1.2)) {
      ctx.beginPath();
      const wav = r() * 2;
      for (let i = 0; i <= 12; i++) {
        const u = (len * i) / 12;
        const v = t + Math.sin(i * 0.8 + wav) * step * 0.25;
        const [x, y] = along === 'a' ? [u, v] : [v, u];
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      if (streak && r() < 0.55) {
        ctx.strokeStyle = rgb(streak, f.k, 0.65 + r() * 0.3);
        ctx.lineWidth = step * (0.3 + r() * 0.5);
      } else {
        ctx.strokeStyle = dark ? 'rgba(255,235,210,0.10)' : 'rgba(60,30,10,0.14)';
        ctx.lineWidth = Math.max(0.4 / scale, step * 0.18);
      }
      ctx.stroke();
    }
  }

  function path(ctx, pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  // ---------- the pictures for each stage ----------
  function stages(design, r) {
    if (r.tiles) return tileStages(design, r);
    const out = {};
    const IN = 25.4;
    const gapOf = (v) => Math.max(IN * 0.4, v * 0.06);
    // The accent line inside a lying strip, h thick, as seen on its end.
    const xdec = (st, p, h) => {
      if (!st.accent || !r.accent) return null;
      let poly = CB.engine.accentBand(st.width, p.thickness, r.accent, st.accent.mirrored);
      if (st.rot) poly = CB.engine.turn(poly, st.width, p.thickness, st.rot);
      const k = st.rip / st.width;
      return [{ poly: poly.map(([u, v]) => [u * k, h - (v * h) / p.thickness]), species: st.accent.species }];
    };

    // Boards to mill: one per species and panel, side by side.
    {
      const boxes = [];
      let x = 0;
      for (const l of r.lumber) {
        for (const p of l.pieces) {
          boxes.push({ x, y: 0, z: 0, w: p.width, d: p.length, h: p.thickness, species: l.species, grain: 'y' });
          x += p.width + gapOf(p.width) * 2;
        }
      }
      out.mill = { boxes };
    }

    // Strips, spread apart in glue order, one row per panel.
    {
      const boxes = [];
      const labels = [];
      let y = 0;
      for (const p of r.panels) {
        let x = 0;
        const g = gapOf(p.width) * 0.6;
        p.strips.forEach((s, i) => {
          boxes.push({ x, y, z: 0, w: s.rip, d: p.length, h: p.milled, species: s.species, grain: 'y', seed: i * 13 + 7 });
          labels.push({ x: x + s.rip / 2, y, z: p.milled, text: String(i + 1) });
          x += s.rip + g;
        });
        y += p.length + gapOf(p.length) * 2;
      }
      out.rip = { boxes, labels };
    }

    // Each panel glued up.
    for (const p of r.panels) {
      const boxes = [];
      let x = 0;
      p.strips.forEach((s, i) => {
        boxes.push({ x, y: 0, z: 0, w: s.rip, d: p.length, h: p.milled, species: s.species, grain: 'y', seed: i * 13 + 7, xdecor: xdec(s, p, p.milled) });
        x += s.rip;
      });
      out[`glue1-${p.id}`] = { boxes };
    }

    // All panels planed.
    {
      const boxes = [];
      let x = 0;
      for (const p of r.panels) {
        let xx = x;
        p.strips.forEach((s, i) => {
          boxes.push({ x: xx, y: 0, z: 0, w: s.rip, d: p.length, h: p.thickness, species: s.species, grain: 'y', seed: i * 13 + 7, xdecor: xdec(s, p, p.thickness) });
          xx += s.rip;
        });
        x = xx + gapOf(p.width) * 2;
      }
      out.plane = { boxes };
    }

    // The first panel crosscut into slices, pulled apart.
    {
      const p = r.panels[0];
      const boxes = [];
      const labels = [];
      const n = Math.min(p.slices, 12);
      const g = gapOf(p.sliceLength) * 3;
      for (let j = 0; j < n; j++) {
        let x = 0;
        const y = j * (p.sliceLength + g);
        p.strips.forEach((s, i) => {
          boxes.push({ x, y, z: 0, w: s.rip, d: p.sliceLength, h: p.thickness, species: s.species, grain: 'y', seed: i * 13 + 7, xdecor: xdec(s, p, p.thickness) });
          x += s.rip;
        });
        labels.push({ x: -IN * 0.6, y: y + p.sliceLength / 2, z: p.thickness, text: String(j + 1) });
      }
      out.crosscut = { boxes, labels };
    }

    // The finished arrangement, end grain up. Rows slightly apart for the
    // layout step, together for the glue-up and after.
    const boardBoxes = (rowGap) =>
      r.blocks.map((b) => {
        const dy = b.row * rowGap;
        return {
          x: b.x,
          y: b.y + dy,
          z: 0,
          w: b.w,
          d: b.d,
          h: r.board.thickness,
          species: b.species,
          grain: 'z',
          seed: b.stick ? b.stick.length * 97 + b.stick.charCodeAt(b.stick.length - 1) * 31 + (r.grain === 'matched' ? 0 : b.row * 7) : 1,
          decor: b.accent ? [{ poly: b.accent.poly.map(([x, y]) => [x, y + dy]), species: b.accent.species }] : null,
        };
      });
    out.layout = { boxes: boardBoxes(gapOf(r.board.length) * 0.5), labels: r.rows.map((row, i) => ({ x: -IN * 0.6, y: r.blocks.find((b) => b.row === i).y + i * gapOf(r.board.length) * 0.5 + row.thickness / 2, z: r.board.thickness, text: `${i + 1}${row.flip ? '⇄' : ''}` })) };
    out.glue2 = { boxes: boardBoxes(0) };
    out.trim = { boxes: boardBoxes(0) };
    out.finish = { boxes: boardBoxes(0), yaw: -38, pitch: 42 };

    // One accented stick, step by step: whole, ripped in two, the three
    // pieces apart, and glued back into one stick.
    const A = r.accent;
    const ap = A && r.panels.find((p) => p.accentPrep);
    if (ap) {
      const E = CB.engine;
      const st = ap.strips.find((x) => x.accent);
      const w = st.width;
      const dd = ap.thickness;
      const L = Math.min(ap.length, Math.max(w, dd) * 3);
      const line = E.accentLine(w, dd, A, st.accent.mirrored);
      const c0 = line.nx * line.cx + line.ny * line.cy;
      const h = A.thickness / 2;
      const m = IN / 8;
      const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const R = rect(0, 0, w, dd);
      const halfA = E.clip(R, line.nx, line.ny, c0 - h);
      const halfB = E.clip(R, -line.nx, -line.ny, -(c0 + h));
      const band = (poly) => E.clip(E.clip(poly, line.nx, line.ny, c0 + h), -line.nx, -line.ny, -(c0 - h));
      const flush = band(R);
      const proud = band(rect(-m, -m, w + m, dd + m));
      // (u, v) of the stick's end: u across, v up. Shift along the cut's normal.
      const at = (poly, k) => poly.map(([u, v]) => [u + line.nx * k, dd - v - line.ny * k]);
      const piece = (poly, k, species, seed) => prismItem(at(poly, k), 'y', 0, L, species, seed);
      const acc = st.accent.species;
      out['accent-strips'] = {
        boxes: [0, 1, 2].map((i) => ({ x: i * (A.thickness + IN * 0.6), y: 0, z: 0, w: A.thickness, d: L, h: ap.accentPrep.stripWidth, species: acc, grain: 'y', seed: i * 11 + 3 })),
      };
      out['accent-stick'] = { boxes: [piece(R, 0, st.species, 5)], yaw: 32, pitch: 28 };
      out['accent-rip'] = { boxes: [piece(halfA, -IN * 0.35, st.species, 5), piece(halfB, IN * 0.35, st.species, 9)], yaw: 32, pitch: 28 };
      out['accent-glue'] = { boxes: [piece(halfA, -IN * 0.9, st.species, 5), piece(proud, 0, acc, 3), piece(halfB, IN * 0.9, st.species, 9)], yaw: 32, pitch: 28 };
      out['accent-done'] = { boxes: [piece(halfA, 0, st.species, 5), piece(flush, 0, acc, 3), piece(halfB, 0, st.species, 9)], yaw: 32, pitch: 28 };
    }
    return out;
  }

  // A prism item from an outline, with its bounding box filled in.
  function prismItem(pts, axis, lo, len, species, seed, turn) {
    const us = pts.map((p) => p[0]);
    const vs = pts.map((p) => p[1]);
    const u0 = Math.min(...us);
    const v0 = Math.min(...vs);
    const du = Math.max(...us) - u0;
    const dv = Math.max(...vs) - v0;
    const box = axis === 'z' ? { x: u0, y: v0, z: lo, w: du, d: dv, h: len } : { x: u0, y: lo, z: v0, w: du, d: len, h: dv };
    return { ...box, species, seed, turn, grain: axis, prism: { pts, axis } };
  }

  function tileStages(design, r) {
    const out = {};
    const IN = 25.4;
    const t = r.tiles;
    const cubes = t.kind === 'cubes';
    const s = t.border ? t.border.coreSide : t.size;
    const sh = t.shape;
    const endPts = cubes
      ? [[s / 2, 0], [s * 1.5, 0], [s, sh.thickness], [0, sh.thickness]]
      : [[s / 2, 0], [s * 1.5, 0], [2 * s, sh.thickness / 2], [s * 1.5, sh.thickness], [s / 2, sh.thickness], [0, sh.thickness / 2]];
    const span = cubes ? s * 1.5 : 2 * s;

    // Boards to mill.
    {
      const boxes = [];
      let x = 0;
      for (const l of r.lumber)
        for (const p of l.pieces) {
          boxes.push({ x, y: 0, z: 0, w: p.width, d: p.length, h: p.thickness, species: l.species, grain: 'y' });
          x += p.width + IN;
        }
      out.mill = { boxes };
    }

    // Long angled sticks, a few of each wood.
    {
      const boxes = [];
      let x = 0;
      const len = t.panels[0].length;
      r.lumber.forEach((l, li) => {
        for (let i = 0; i < Math.min(3, l.sticks); i++) {
          boxes.push(prismItem(endPts.map(([u, v]) => [u + x, v]), 'y', 0, len, l.species, li * 17 + i * 5 + 3));
          x += span + s * 0.5;
        }
        x += s;
      });
      out.sticks = { boxes };
    }

    // Borders: thin strips, then six of them around one core, then trimmed.
    if (t.border) {
      const B = t.border;
      const len = Math.min(t.panels[0].length, t.size * 6);
      out['border-strips'] = {
        boxes: [0, 1, 2, 3, 4].map((i) => ({ x: i * (B.width + IN * 0.5), y: 0, z: 0, w: B.width, d: len, h: B.stripWidth, species: B.species, grain: 'y', seed: i * 11 + 3 })),
      };
      const pan = t.panels[0];
      const one = pan.end.filter((pc) => pc.stick === 0);
      const core = one.find((pc) => !pc.border);
      const ccx = core.poly.reduce((a, q) => a + q[0], 0) / core.poly.length;
      const ccy = core.poly.reduce((a, q) => a + q[1], 0) / core.poly.length;
      const place = (pc, gap, grow) => {
        let poly = pc.poly;
        if (pc.border && grow) {
          // Untrimmed: the strip runs past the corners.
          const [a, b, c, d] = poly;
          const ex = (p, q, k) => [p[0] + (p[0] - q[0]) * k, p[1] + (p[1] - q[1]) * k];
          poly = [ex(a, b, 0.12), ex(b, a, 0.12), ex(c, d, 0.25), ex(d, c, 0.25)];
        }
        const mx = poly.reduce((a, q) => a + q[0], 0) / poly.length - ccx;
        const my = poly.reduce((a, q) => a + q[1], 0) / poly.length - ccy;
        const m = Math.hypot(mx, my) || 1;
        return poly.map(([x, y]) => [x + (mx / m) * gap, pan.depth - (y + (my / m) * gap)]);
      };
      const item = (pc, gap, grow, i) => prismItem(place(pc, gap, grow), 'y', 0, len, pc.species, i * 7 + 1, pc.rot);
      out['border-glue'] = { boxes: one.map((pc, i) => item(pc, pc.border ? t.size * 0.45 : 0, true, i)), yaw: 32, pitch: 28 };
      out['border-done'] = { boxes: one.map((pc, i) => item(pc, 0, false, i)), yaw: 32, pitch: 28 };
    }

    // Each row panel: the sticks glued side by side, lying down.
    const lying = (pan, y0, len) =>
      pan.end.map((pc, i) => prismItem(pc.poly.map(([x, y]) => [x, pan.depth - y]), 'y', y0, len, pc.species, i * 7 + 1, pc.rot));
    for (const pan of t.panels) out[`row-${pan.id}`] = { boxes: lying(pan, 0, pan.length) };

    // The first panel crosscut into slices, pulled apart.
    {
      const pan = t.panels[0];
      const boxes = [];
      const n = Math.min(pan.slices, 8);
      for (let j = 0; j < n; j++) boxes.push(...lying(pan, j * (t.sliceLength * 1.8), t.sliceLength));
      out.crosscut = { boxes };
    }

    // The rows end grain up: apart for the layout, then together.
    const rowIndex = Object.fromEntries(t.rows.map((x, i) => [x.r, i]));
    const gap = Math.max(IN * 0.4, r.board.length * 0.03);
    const standing = (g) => r.blocks.map((b, i) => prismItem(b.poly.map(([x, y]) => [x, y + rowIndex[b.row] * g]), 'z', 0, r.board.thickness, b.species, i * 7 + 1, b.rot));
    out.layout = {
      boxes: standing(gap),
      labels: t.rows.map((row, i) => ({ x: -IN * 0.7, y: Math.max(0, row.y0) + i * gap + s * 0.7, z: r.board.thickness, text: `${i + 1}${t.panels.length > 1 ? ` ${row.name}` : ''}` })),
      pitch: 40,
    };
    const together = standing(0);
    out.glue2 = { boxes: together, pitch: 40 };
    out.trim = { boxes: together, pitch: 40 };
    out.finish = { boxes: together, yaw: -38, pitch: 42 };
    return out;
  }

  CB.illustrate = { draw, stages };
})(typeof window !== 'undefined' ? window : globalThis);
