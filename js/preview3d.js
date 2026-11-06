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

      // Shadow under the board.
      const shadow = [proj(0, 0, 0), proj(W, 0, 0), proj(W, L, 0), proj(0, L, 0)];
      ctx.save();
      ctx.filter = 'blur(10px)';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      poly(ctx, shadow.map(([x, y]) => [x + 6, y + 10]));
      ctx.fill();
      ctx.restore();

      const sides = [
        { n: [0, 1, 0], blocks: r.blocks.filter((b) => Math.abs(b.y + b.d - L) < eps), quad: (b) => [[b.x, L], [b.x + b.w, L]] },
        { n: [0, -1, 0], blocks: r.blocks.filter((b) => b.y < eps), quad: (b) => [[b.x, 0], [b.x + b.w, 0]] },
        { n: [1, 0, 0], blocks: r.blocks.filter((b) => Math.abs(b.x + b.w - W) < eps), quad: (b) => [[W, b.y], [W, b.y + b.d]] },
        { n: [-1, 0, 0], blocks: r.blocks.filter((b) => b.x < eps), quad: (b) => [[0, b.y], [0, b.y + b.d]] },
      ];
      for (const side of sides) {
        if (!P.facing(...side.n)) continue;
        const k = P.light(side.n[0], side.n[1]);
        for (const b of side.blocks) {
          const [[x0, y0], [x1, y1]] = side.quad(b);
          const pts = [proj(x0, y0, 0), proj(x1, y1, 0), proj(x1, y1, T), proj(x0, y0, T)];
          const c0 = col(b.species);
          ctx.fillStyle = rgb(c0, k);
          poly(ctx, pts);
          ctx.fill();
          if (!this.fast) this.longGrain(ctx, pts, c0, b);
          ctx.strokeStyle = 'rgba(0,0,0,0.18)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
          this.hits.push({ poly: pts, block: b });
        }
      }

      // Top face: one quad per block, with end grain rings.
      const o = proj(0, 0, T);
      const ax = proj(1, 0, T);
      const ay = proj(0, 1, T);
      const affine = [ax[0] - o[0], ax[1] - o[1], ay[0] - o[0], ay[1] - o[1], o[0], o[1]];
      for (const b of r.blocks) {
        const pts = [proj(b.x, b.y, T), proj(b.x + b.w, b.y, T), proj(b.x + b.w, b.y + b.d, T), proj(b.x, b.y + b.d, T)];
        const c0 = col(b.species);
        const rnd = rand(Math.round(b.x * 7 + b.y * 131 + 17));
        ctx.fillStyle = rgb(c0, 0.97 + rnd() * 0.07);
        poly(ctx, pts);
        ctx.fill();
        if (!this.fast) this.endGrain(ctx, affine, b, c0, rnd);
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
        poly(ctx, [proj(b.x, b.y, T), proj(b.x + b.w, b.y, T), proj(b.x + b.w, b.y + b.d, T), proj(b.x, b.y + b.d, T)]);
        ctx.stroke();
      }

      // Selected strip and hover.
      const accent = getComputedStyle(this.canvas).getPropertyValue('--accent').trim() || '#a0562a';
      const outline = (b, color, width, fill) => {
        const pts = [proj(b.x, b.y, T), proj(b.x + b.w, b.y, T), proj(b.x + b.w, b.y + b.d, T), proj(b.x, b.y + b.d, T)];
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
    }

    endGrain(ctx, affine, b, c0, rnd) {
      // Rings centred on a "pith" off one corner of the block.
      const size = Math.max(b.w, b.d);
      const cx = b.x + (rnd() < 0.5 ? -0.6 : 1.6) * b.w * (0.6 + rnd() * 0.6);
      const cy = b.y + (rnd() < 0.5 ? -0.5 : 1.5) * b.d * (0.6 + rnd() * 0.6);
      const near = Math.hypot(Math.max(b.x - cx, 0, cx - b.x - b.w), Math.max(b.y - cy, 0, cy - b.y - b.d));
      const far = Math.hypot(Math.max(Math.abs(cx - b.x), Math.abs(cx - b.x - b.w)), Math.max(Math.abs(cy - b.y), Math.abs(cy - b.y - b.d)));
      const gap = Math.max(1.4, size / 14) * (0.8 + rnd() * 0.5);
      const dark = luminance(c0) < 0.35;
      ctx.save();
      ctx.transform(...affine);
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.d);
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
