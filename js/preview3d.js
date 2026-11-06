// 3D preview of the finished board, drawn on a 2D canvas (no libraries).
// The board is a convex slab, so drawing the visible faces back to front
// (sides, then the top) needs no depth sorting.
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});

  const DEG = Math.PI / 180;
  const VIEWS = {
    angle: { yaw: -28 * DEG, pitch: 38 * DEG },
    top: { yaw: 0, pitch: 90 * DEG },
    side: { yaw: 0, pitch: 14 * DEG },
    end: { yaw: -90 * DEG, pitch: 14 * DEG },
  };

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb(c, k = 1, add = 0) {
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k + add)));
    return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
  }
  function luminance(c) {
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  }
  // Small deterministic random numbers per block, so the texture doesn't
  // change every frame.
  function rand(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    };
  }
  const sameRef = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

  class Preview {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = opts;
      this.view = { ...VIEWS.angle };
      this.zoom = 1;
      this.result = null;
      this.colors = {};
      this.selected = null;
      this.hover = null;
      this.fast = false;
      this.hits = [];
      this.pointers = new Map();
      this.bind();
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.draw()).observe(canvas);
    }

    set(result, speciesList, selected) {
      this.result = result;
      this.colors = Object.fromEntries(speciesList.map((s) => [s.id, s.color]));
      this.streaks = Object.fromEntries(speciesList.filter((s) => s.streak).map((s) => [s.id, s.streak]));
      this.names = Object.fromEntries(speciesList.map((s) => [s.id, s.name]));
      this.selected = selected || null;
      this.draw();
    }

    setView(name) {
      const target = VIEWS[name];
      if (!target) return;
      const from = { ...this.view };
      // Turn the short way round.
      let dy = target.yaw - from.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 350);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        this.view.yaw = from.yaw + dy * e;
        this.view.pitch = from.pitch + (target.pitch - from.pitch) * e;
        this.fast = k < 1;
        this.draw();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    bind() {
      const c = this.canvas;
      let moved = 0;
      let pinch = null;
      c.addEventListener('pointerdown', (e) => {
        c.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = 0;
        if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()];
          pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
        }
      });
      c.addEventListener('pointermove', (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) {
          this.hoverAt(e);
          return;
        }
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (this.pointers.size === 2 && pinch) {
          const [a, b] = [...this.pointers.values()];
          this.zoom = Math.min(4, Math.max(0.4, (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist));
          moved += 10;
        } else {
          moved += Math.abs(dx) + Math.abs(dy);
          if (moved < 4) return;
          this.view.yaw -= dx * 0.008; // the edge under your finger follows it
          this.view.pitch = Math.min(90 * DEG, Math.max(8 * DEG, this.view.pitch + dy * 0.008));
        }
        this.fast = true;
        this.draw();
      });
      const up = (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.delete(e.pointerId);
        if (this.pointers.size < 2) pinch = null;
        if (moved < 4 && e.type === 'pointerup') {
          const hit = this.pick(e);
          if (this.opts.onPick) this.opts.onPick(hit ? hit.block : null);
        }
        if (!this.pointers.size) {
          this.fast = false;
          this.draw();
        }
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', up);
      c.addEventListener('pointerleave', () => {
        if (this.hover) {
          this.hover = null;
          this.draw();
          if (this.opts.onHover) this.opts.onHover(null);
        }
      });
      c.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          this.zoom = Math.min(4, Math.max(0.4, this.zoom * Math.exp(-e.deltaY * 0.0015)));
          this.draw();
        },
        { passive: false }
      );
    }

    local(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    pick(e) {
      const { x, y } = this.local(e);
      for (let i = this.hits.length - 1; i >= 0; i--) if (inside(this.hits[i].poly, x, y)) return this.hits[i];
      return null;
    }

    hoverAt(e) {
      const hit = this.pick(e);
      const b = hit ? hit.block : null;
      if (b !== this.hover) {
        this.hover = b;
        this.canvas.style.cursor = b ? 'pointer' : 'grab';
        this.draw();
        if (this.opts.onHover) this.opts.onHover(b);
      }
    }

    // Board point (x across, y along, z up; mm) to screen.
    projector(W, L, T, cssW, cssH) {
      const { yaw, pitch } = this.view;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const raw = (x, y, z) => {
        const px = x - W / 2;
        const py = y - L / 2;
        const pz = z - T / 2;
        const x1 = px * cy - py * sy;
        const y1 = px * sy + py * cy;
        return [x1, y1 * sp - pz * cp];
      };
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const x of [0, W]) for (const y of [0, L]) for (const z of [0, T]) {
        const [a, b] = raw(x, y, z);
        minX = Math.min(minX, a);
        maxX = Math.max(maxX, a);
        minY = Math.min(minY, b);
        maxY = Math.max(maxY, b);
      }
      // Fit the board's bounding sphere so the size stays steady while turning.
      const radius = Math.hypot(W, L, T) / 2;
      const s = (Math.min(cssW, cssH) / (2 * radius * 1.12)) * this.zoom;
      const ox = cssW / 2 - ((minX + maxX) / 2) * s;
      const oy = cssH / 2 - ((minY + maxY) / 2) * s;
      const proj = (x, y, z) => {
        const [a, b] = raw(x, y, z);
        return [ox + a * s, oy + b * s];
      };
      // Which way each side faces the viewer.
      const facing = (nx, ny, nz) => {
        const y1 = nx * sy + ny * cy;
        return y1 * cp + nz * sp > 1e-6;
      };
      return { proj, facing, scale: s, light: (nx, ny) => 0.55 + 0.3 * Math.max(0, -(nx * sy + ny * cy) * 0.6 + 0.5) };
    }

    draw() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = null;
        this.render();
      });
    }

    render() {
      const c = this.canvas;
      const ctx = this.ctx;
      const dpr = window.devicePixelRatio || 1;
      const cssW = c.clientWidth;
      const cssH = c.clientHeight;
      if (!cssW || !cssH) return;
      if (c.width !== Math.round(cssW * dpr) || c.height !== Math.round(cssH * dpr)) {
        c.width = Math.round(cssW * dpr);
        c.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      this.hits = [];
      const r = this.result;
      if (!r || !r.blocks.length) return;
      const W = r.board.width;
      const L = r.board.length;
      const T = r.board.thickness;
      const P = this.projector(W, L, T, cssW, cssH);
      const { proj } = P;
      const col = (id) => hexRgb(this.colors[id] || '#999999');
      const eps = 1e-6;
      const X = r.details || {};
      const IN = 25.4;
      const B = Math.min(X.bevel || 0, T * 0.9, W / 4, L / 4);
      const Tz = T - B; // top of the square sides
      // The "ends" are the short sides.
      const endsY = L >= W;

      // Shadow under the board.
      const shadow = [proj(0, 0, 0), proj(W, 0, 0), proj(W, L, 0), proj(0, L, 0)];
      ctx.save();
      ctx.filter = 'blur(10px)';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      poly(ctx, shadow.map(([x, y]) => [x + 6, y + 10]));
      ctx.fill();
      ctx.restore();

      // Each block's stretch along a board edge, from its outline.
      const edgeSpan = (b, axis, at) => {
        const vals = (b.poly || []).filter((p) => Math.abs(p[axis] - at) < 0.01).map((p) => p[1 - axis]);
        if (vals.length < 2) return null;
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        return hi - lo > 0.01 ? [lo, hi] : null;
      };
      const sideOf = (axis, at) =>
        r.blocks
          .map((b) => {
            const sp = edgeSpan(b, axis, at);
            if (!sp) return null;
            return { b, quad: axis === 1 ? [[sp[0], at], [sp[1], at]] : [[at, sp[0]], [at, sp[1]]] };
          })
          .filter(Boolean);
      const sides = [
        { n: [0, 1, 0], items: sideOf(1, L) },
        { n: [0, -1, 0], items: sideOf(1, 0) },
        { n: [1, 0, 0], items: sideOf(0, W) },
        { n: [-1, 0, 0], items: sideOf(0, 0) },
      ];
      for (const side of sides) {
        if (!P.facing(...side.n)) continue;
        const k = P.light(side.n[0], side.n[1]);
        for (const { b, quad } of side.items) {
          const [[x0, y0], [x1, y1]] = quad;
          const pts = [proj(x0, y0, 0), proj(x1, y1, 0), proj(x1, y1, Tz), proj(x0, y0, Tz)];
          const c0 = col(b.species);
          ctx.fillStyle = rgb(c0, k);
          poly(ctx, pts);
          ctx.fill();
          if (this.streaks[b.species]) this.longStreaks(ctx, pts, b, hexRgb(this.streaks[b.species]), k);
          else if (!this.fast) this.longGrain(ctx, pts, c0, b);
          ctx.strokeStyle = 'rgba(0,0,0,0.18)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
          this.hits.push({ poly: pts, block: b });
        }
        const isEnd = endsY ? side.n[1] !== 0 : side.n[0] !== 0;
        if (X.handles === 'grips' && isEnd) this.grip(ctx, P, side.n, W, L, T, IN);
      }

      // Bevel: a 45 degree face along each top edge, showing the blocks it
      // cuts through.
      if (B > 0) {
        const bevels = [
          { n: [0, -1], quad: [[0, 0, Tz], [W, 0, Tz], [W - B, B, T], [B, B, T]], hit: (b) => b.y < B, z: (x, y) => Tz + y, band: [0, 1, B] },
          { n: [0, 1], quad: [[0, L, Tz], [W, L, Tz], [W - B, L - B, T], [B, L - B, T]], hit: (b) => b.y + b.d > L - B, z: (x, y) => Tz + (L - y), band: [0, -1, -(L - B)] },
          { n: [-1, 0], quad: [[0, 0, Tz], [0, L, Tz], [B, L - B, T], [B, B, T]], hit: (b) => b.x < B, z: (x) => Tz + x, band: [1, 0, B] },
          { n: [1, 0], quad: [[W, 0, Tz], [W, L, Tz], [W - B, L - B, T], [W - B, B, T]], hit: (b) => b.x + b.w > W - B, z: (x) => Tz + (W - x), band: [-1, 0, -(W - B)] },
        ];
        for (const bv of bevels) {
          if (!P.facing(bv.n[0], bv.n[1], 1)) continue;
          const k = (1 + P.light(bv.n[0], bv.n[1])) / 2;
          ctx.save();
          poly(ctx, bv.quad.map((q) => proj(...q)));
          ctx.clip();
          for (const b of r.blocks) {
            if (!bv.hit(b)) continue;
            const part = CB.engine.clip(b.poly, ...bv.band);
            if (part.length < 3) continue;
            const pts = part.map(([x, y]) => proj(x, y, bv.z(x, y)));
            ctx.fillStyle = rgb(col(b.species), k);
            poly(ctx, pts);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.16)';
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
          ctx.restore();
          poly(ctx, bv.quad.map((q) => proj(...q)));
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }

      // Top face: one quad per block, with end grain rings.
      ctx.save();
      if (B > 0) {
        poly(ctx, [proj(B, B, T), proj(W - B, B, T), proj(W - B, L - B, T), proj(B, L - B, T)]);
        ctx.clip();
      }
      const o = proj(0, 0, T);
      const ax = proj(1, 0, T);
      const ay = proj(0, 1, T);
      const affine = [ax[0] - o[0], ax[1] - o[1], ay[0] - o[0], ay[1] - o[1], o[0], o[1]];
      for (const b of r.blocks) {
        const pts = b.poly.map(([x, y]) => proj(x, y, T));
        const c0 = col(b.species);
        const matched = r.grain === 'matched';
        // Matched: every slice of a stick shows that stick's own grain,
        // all sticks facing the same way. Random: each square on its own.
        const rnd = matched ? rand(hashStr(b.stick) + 17) : rand(Math.round(b.x * 7 + b.y * 131 + 17));
        b.turnRad = matched ? ((b.rot + (b.flip ? 180 : 0)) * Math.PI) / 180 : null;
        ctx.fillStyle = rgb(c0, 0.97 + rnd() * 0.07);
        poly(ctx, pts);
        ctx.fill();
        if (this.streaks[b.species]) this.endStreaks(ctx, affine, b, hexRgb(this.streaks[b.species]), rnd);
        else if (!this.fast) this.endGrain(ctx, affine, b, c0, rnd);
        if (b.accent) {
          const ac = col(b.accent.species);
          ctx.fillStyle = rgb(ac);
          poly(ctx, b.accent.poly.map(([x, y]) => proj(x, y, T)));
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
        this.hits.push({ poly: pts, block: b });
      }
      // Glue lines.
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 0.7;
      for (const b of r.blocks) {
        poly(ctx, b.poly.map(([x, y]) => proj(x, y, T)));
        ctx.stroke();
      }

      if (X.groove) this.groove(ctx, affine, W, L, X, B, IN);
      if (X.handles === 'holes') this.holes(ctx, P, W, L, T, X, B, IN, endsY);

      // Selected strip and hover.
      const accent = getComputedStyle(this.canvas).getPropertyValue('--accent').trim() || '#a0562a';
      const outline = (b, color, width, fill) => {
        const pts = b.poly.map(([x, y]) => proj(x, y, T));
        poly(ctx, pts);
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      if (this.selected) {
        for (const b of r.blocks) if (sameRef(b.ref, this.selected)) outline(b, accent, 2.2, 'rgba(255,255,255,0.12)');
      }
      if (this.hover) {
        for (const b of r.blocks) if (sameRef(b.ref, this.hover.ref)) outline(b, 'rgba(255,255,255,0.9)', 1.4);
        outline(this.hover, luminance(col(this.hover.species)) > 0.6 ? '#000' : '#fff', 2);
      }
      ctx.restore();
    }

    // A routed juice groove: a rounded channel inset from the edge.
    groove(ctx, affine, W, L, X, B, IN) {
      const g = Math.max(X.grooveInset, B + 2);
      const gw = Math.min(X.grooveWidth, (Math.min(W, L) - 2 * g) / 3);
      if (gw <= 0) return;
      const rad = Math.max(IN, gw * 2);
      const rr = (inset, r) => {
        const x = inset;
        const y = inset;
        const w = W - 2 * inset;
        const h = L - 2 * inset;
        r = Math.max(0.5, Math.min(r, w / 2, h / 2));
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      };
      ctx.save();
      ctx.transform(...affine);
      ctx.beginPath();
      rr(g, rad);
      rr(g + gw, rad - gw);
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.fill('evenodd');
      ctx.beginPath();
      rr(g + gw * 0.5, rad - gw * 0.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.lineWidth = gw * 0.4;
      ctx.stroke();
      ctx.beginPath();
      rr(g, rad);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = gw * 0.08;
      ctx.stroke();
      ctx.beginPath();
      rr(g + gw, rad - gw);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = gw * 0.08;
      ctx.stroke();
      ctx.restore();
    }

    // Hand holes cut through near each end.
    holes(ctx, P, W, L, T, X, B, IN, endsY) {
      const across = endsY ? W : L;
      const along = endsY ? L : W;
      const hl = Math.min(4.5 * IN, across * 0.45);
      const hh = Math.min(1.1 * IN, along * 0.12);
      const c = (X.groove ? Math.max(X.grooveInset, B) + X.grooveWidth : B) + 0.6 * IN + hh / 2;
      // Board point from (u across the end, v in from the edge).
      const pt = (u, v, z, far) => {
        const vv = far ? along - v : v;
        return endsY ? P.proj(u, vv, z) : P.proj(vv, u, z);
      };
      const stadium = (z, far) => {
        const pts = [];
        const m = across / 2;
        const rad = hh / 2;
        for (let i = 0; i <= 12; i++) {
          const a = -Math.PI / 2 + (i / 12) * Math.PI;
          pts.push(pt(m + hl / 2 - rad + Math.cos(a) * rad, c + Math.sin(a) * rad, z, far));
        }
        for (let i = 0; i <= 12; i++) {
          const a = Math.PI / 2 + (i / 12) * Math.PI;
          pts.push(pt(m - hl / 2 + rad + Math.cos(a) * rad, c + Math.sin(a) * rad, z, far));
        }
        return pts;
      };
      for (const far of [false, true]) {
        const top = stadium(T, far);
        ctx.save();
        poly(ctx, top);
        ctx.fillStyle = 'rgba(30,16,6,0.55)';
        ctx.fill();
        ctx.clip();
        poly(ctx, stadium(0, far));
        ctx.fillStyle = 'rgba(28,24,20,0.9)';
        ctx.fill();
        ctx.restore();
        poly(ctx, top);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // A finger grip routed under one end, seen on that end's face.
    grip(ctx, P, n, W, L, T, IN) {
      const alongX = n[1] !== 0; // the face runs along x
      const span = alongX ? W : L;
      const at = n[0] > 0 ? W : n[1] > 0 ? L : 0;
      const gw = Math.min(5 * IN, span * 0.5);
      const gh = T * 0.5;
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = (i / 24) * Math.PI;
        const u = span / 2 + Math.cos(t) * (gw / 2);
        const z = Math.sin(t) * gh;
        pts.push(alongX ? P.proj(u, at, z) : P.proj(at, u, z));
      }
      poly(ctx, pts);
      ctx.fillStyle = 'rgba(15,8,3,0.58)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    endGrain(ctx, affine, b, c0, rnd) {
      // Rings centred on a "pith" off one corner of the block.
      const size = Math.max(b.w, b.d);
      let cx;
      let cy;
      if (b.turnRad != null) {
        const ang = Math.PI / 2 + (rnd() - 0.5) * 0.5 + b.turnRad;
        const dist = size * (0.9 + rnd() * 0.5);
        cx = b.sx + b.sw / 2 + Math.cos(ang) * dist;
        cy = b.y + b.d / 2 + Math.sin(ang) * dist;
      } else {
        cx = b.x + (rnd() < 0.5 ? -0.6 : 1.6) * b.w * (0.6 + rnd() * 0.6);
        cy = b.y + (rnd() < 0.5 ? -0.5 : 1.5) * b.d * (0.6 + rnd() * 0.6);
      }
      const near = Math.hypot(Math.max(b.x - cx, 0, cx - b.x - b.w), Math.max(b.y - cy, 0, cy - b.y - b.d));
      const far = Math.hypot(Math.max(Math.abs(cx - b.x), Math.abs(cx - b.x - b.w)), Math.max(Math.abs(cy - b.y), Math.abs(cy - b.y - b.d)));
      const gap = Math.max(1.4, size / 14) * (0.8 + rnd() * 0.5);
      const dark = luminance(c0) < 0.35;
      ctx.save();
      ctx.transform(...affine);
      poly(ctx, b.poly);
      ctx.clip();
      ctx.strokeStyle = dark ? 'rgba(255,235,210,0.10)' : 'rgba(60,30,10,0.13)';
      ctx.lineWidth = gap * 0.28;
      for (let rr = Math.max(gap, near - (near % gap)); rr < far; rr += gap * (0.85 + rnd() * 0.3)) {
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Bold, uneven dark bands, like zebrawood's end grain: growth rings
    // from a far-off pith, so they read as wavy, nearly parallel stripes.
    endStreaks(ctx, affine, b, sc, rnd) {
      const size = Math.max(b.w, b.d);
      const ang = b.turnRad != null ? Math.PI / 2 + (rnd() - 0.5) * 0.3 + b.turnRad : rnd() * Math.PI * 2;
      const far = size * (2.2 + rnd() * 2.5);
      const mx = b.turnRad != null ? b.sx + b.sw / 2 : b.x + b.w / 2;
      const cx = mx + Math.cos(ang) * far;
      const cy = b.y + b.d / 2 + Math.sin(ang) * far;
      const r0 = far - size * 0.8;
      const r1 = far + size * 0.8;
      const wob = 0.004 + rnd() * 0.006;
      const k1 = 2 + rnd() * 3;
      const ph = rnd() * 6.28;
      const steps = this.fast ? 28 : 90;
      ctx.save();
      ctx.transform(...affine);
      poly(ctx, b.poly);
      ctx.clip();
      const ring = (r) => {
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const t = ang + Math.PI + ((i / steps) - 0.5) * 1.2;
          const rr = r * (1 + wob * Math.sin((k1 * (t - ang)) / 0.2 + ph));
          const x = cx + Math.cos(t) * rr;
          const y = cy + Math.sin(t) * rr;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
      };
      let r = r0;
      while (r < r1) {
        const gap = size * (0.1 + rnd() * 0.14);
        const band = gap * (0.18 + rnd() * 0.32);
        ctx.strokeStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},${0.65 + rnd() * 0.3})`;
        ctx.lineWidth = band;
        ring(r);
        ctx.stroke();
        if (rnd() < 0.5) {
          ctx.strokeStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},0.25)`;
          ctx.lineWidth = band * 0.35;
          ring(r + band * 0.9);
          ctx.stroke();
        }
        r += gap;
      }
      ctx.restore();
    }

    longStreaks(ctx, pts, b, sc, k) {
      // Dark stripes running up the board's sides.
      const [p0, p1, p2] = pts;
      const rnd = rand(Math.round(b.x * 13 + b.y * 71 + 9));
      const up = [p2[0] - p1[0], p2[1] - p1[1]];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      ctx.save();
      poly(ctx, pts);
      ctx.clip();
      let t = rnd() * 0.1;
      while (t < 1) {
        const w = 0.02 + rnd() * 0.05;
        const ax = p0[0] + (p1[0] - p0[0]) * t;
        const ay = p0[1] + (p1[1] - p0[1]) * t;
        ctx.strokeStyle = `rgba(${Math.round(sc[0] * k)},${Math.round(sc[1] * k)},${Math.round(sc[2] * k)},${0.7 + rnd() * 0.25})`;
        ctx.lineWidth = Math.max(0.6, w * len);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + up[0] + (rnd() - 0.5) * 3, ay + up[1]);
        ctx.stroke();
        t += 0.07 + rnd() * 0.12;
      }
      ctx.restore();
    }

    longGrain(ctx, pts, c0, b) {
      // A few vertical grain lines on the board's sides.
      const [p0, p1, p2] = pts;
      const rnd = rand(Math.round(b.x * 13 + b.y * 71 + 5));
      const dark = luminance(c0) < 0.35;
      ctx.save();
      poly(ctx, pts);
      ctx.clip();
      ctx.strokeStyle = dark ? 'rgba(255,235,210,0.10)' : 'rgba(60,30,10,0.12)';
      ctx.lineWidth = 0.8;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.3 + rnd() * 0.4) / n;
        const ax = p0[0] + (p1[0] - p0[0]) * t;
        const ay = p0[1] + (p1[1] - p0[1]) * t;
        const up = [p2[0] - p1[0], p2[1] - p1[1]];
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + up[0] + (rnd() - 0.5) * 2, ay + up[1]);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function inside(pts, x, y) {
    let r = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
    }
    return r;
  }

  CB.Preview = Preview;
  CB.preview = { sameRef, VIEWS };
})(typeof window !== 'undefined' ? window : globalThis);
