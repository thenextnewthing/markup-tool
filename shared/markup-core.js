/* Markup core — the shared editor engine used by both the website and the
 * Chrome extension. Everything host-specific goes through the `env` adapter:
 *
 *   env.overlay            canvas element that receives pointer events
 *   env.overlayCtx()       2d ctx for transient UI, transform set to content coords
 *   env.clearOverlay()     wipe the overlay (and restore its transform)
 *   env.baseCtx()          2d ctx for committed shapes, transform set to content coords
 *   env.clearBase()        wipe base and paint the background (image / nothing)
 *   env.toPoint(e)         pointer event -> content coordinates
 *   env.uiScale()          screen px per content px (selection UI stays screen-constant)
 *   env.viewBounds()       {x,y,w,h} of the visible content area, content coords
 *   env.textHost           element the text-entry textarea is appended to
 *   env.textPlacement(p)   content point -> {left, top, fontScale} CSS in textHost
 *   env.canDraw()          false while there is nothing to annotate yet
 *   env.getSetting(k) / env.setSetting(k, v)
 *   env.getExtra() / env.setExtra(x)   host state carried in undo snapshots (crop)
 *   env.onCropApply(rect)  host applies a crop (site only; core snapshots first)
 *   env.hasCrop            whether the crop tool is available
 *   env.onHistoryChange()  update undo/redo/etc. buttons
 *   env.onToolChange(t)    reflect the active tool in the toolbar
   *   env.onPrimary()        the big button action (site: copy, extension: capture)
   *   env.onSecondary()      optional extra action (site: download PNG)
 *   env.toast(msg, isErr)
 *   env.exclusiveKeys      true in the extension: swallow handled keys before the page
 */
window.MarkupCore = (() => {
  'use strict';

  const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#111111', '#ffffff'];
  const SIZES = { S: 2.5, M: 5, L: 10, XL: 18, XXL: 30 };
  const FONTS = { S: 18, M: 26, L: 38, XL: 56, XXL: 80 };

  function createEditor(env) {
    let shapes = [];           // committed shapes
    let history = [];          // undo snapshots {shapes, extra}
    let future = [];           // redo snapshots
    let tool = 'pen';
    let color = COLORS[0];
    let sizeKey = 'L';
    let drawing = null;        // in-progress shape
    let selected = null;       // shape grabbed by clicking it
    let draggingSel = false;
    let dragStart = null;
    let dragMoved = false;
    let cropDrag = null;       // in-progress crop marquee {x0,y0,x1,y1}
    let cropPending = null;    // marquee awaiting confirm {x,y,w,h,_ok,_cancel}
    let handDrawn = env.getSetting('handDrawn') === '1';

    const overlay = env.overlay;

    function snapshot() {
      history.push({ shapes: shapes.slice(), extra: env.getExtra ? env.getExtra() : undefined });
      future = [];
    }
    function dropLastSnapshot() { history.pop(); }

    function setTool(t) {
      tool = t;
      if (t !== 'crop') cancelCrop(false);
      env.onToolChange(t);
      overlay.style.cursor = t === 'text' ? 'text' : 'crosshair';
    }

    function setColor(c) { color = c; }
    function setSize(k) {
      sizeKey = k;
      if (env.onSizeChange) env.onSizeChange(k);
    }

    function setHandDrawn(v) {
      handDrawn = v;
      env.setSetting('handDrawn', v ? '1' : '0');
      redrawBase();
    }

    function clearShapes() {
      shapes = [];
      history = [];
      future = [];
      selected = null;
      cropDrag = null;
      cropPending = null;
      closeTextEditor(false);
      env.onHistoryChange();
    }

    // ---------- Pointer handling ----------
    overlay.addEventListener('pointerdown', e => {
      if (!env.canDraw() || e.button !== 0) return;
      const p = env.toPoint(e);

      // pending crop: ✓ / ✕ badges take priority
      if (cropPending) {
        const u = 1 / env.uiScale();
        if (cropPending._ok && Math.hypot(p.x - cropPending._ok.x, p.y - cropPending._ok.y) <= 14 * u) {
          applyCrop();
          return;
        }
        if (cropPending._cancel && Math.hypot(p.x - cropPending._cancel.x, p.y - cropPending._cancel.y) <= 14 * u) {
          cancelCrop(true);
          return;
        }
        cropPending = null; // clicking elsewhere restarts the marquee
      }

      if (tool === 'crop') {
        overlay.setPointerCapture(e.pointerId);
        cropDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        drawCropUI();
        return;
      }

      // red ✕ on the current selection?
      if (selected && selected._delBtn) {
        const d = selected._delBtn;
        if (Math.hypot(p.x - d.x, p.y - d.y) <= d.r) { deleteSelected(); return; }
      }

      // clicking anything already drawn grabs it, whatever tool is active
      const hit = hitTest(p);
      if (hit) {
        // replace with a clone so the undo snapshot keeps the original coords
        snapshot();
        const clone = { ...hit, points: hit.points ? hit.points.map(q => ({ x: q.x, y: q.y })) : undefined };
        shapes[shapes.indexOf(hit)] = clone;
        selected = clone;
        overlay.setPointerCapture(e.pointerId);
        draggingSel = true;
        dragStart = p;
        dragMoved = false;
        drawSel();
        env.onHistoryChange();
        return;
      }

      if (tool === 'text') {
        if (selected) { selected = null; drawSel(); }
        openTextEditor(p);
        return;
      }

      if (selected) { selected = null; drawSel(); }
      overlay.setPointerCapture(e.pointerId);
      const lw = SIZES[sizeKey] * (tool === 'highlighter' ? 2.4 : 1);
      drawing = { tool, color, lw, x0: p.x, y0: p.y, x1: p.x, y1: p.y, points: [p], seed: (Math.random() * 2 ** 31) | 0 };
      renderShape(env.overlayCtx(), drawing);
    });

    overlay.addEventListener('pointermove', e => {
      if (cropDrag) {
        const p = env.toPoint(e);
        cropDrag.x1 = p.x;
        cropDrag.y1 = p.y;
        drawCropUI();
        return;
      }
      if (draggingSel && selected) {
        const p = env.toPoint(e);
        translateShape(selected, p.x - dragStart.x, p.y - dragStart.y);
        dragStart = p;
        dragMoved = true;
        redrawBase();
        drawSel();
        return;
      }
      if (!drawing) {
        // hover affordance: show a move cursor over anything grabbable
        if (env.canDraw()) {
          const p = env.toPoint(e);
          overlay.style.cursor = (tool !== 'crop' && hitTest(p)) ? 'move'
            : tool === 'text' ? 'text' : 'crosshair';
        }
        return;
      }
      const p = env.toPoint(e);
      drawing.x1 = p.x;
      drawing.y1 = p.y;
      if (drawing.tool === 'pen' || drawing.tool === 'highlighter') drawing.points.push(p);
      env.clearOverlay();
      renderShape(env.overlayCtx(), drawing);
    });

    function finishStroke() {
      if (cropDrag) {
        const x = Math.min(cropDrag.x0, cropDrag.x1), y = Math.min(cropDrag.y0, cropDrag.y1);
        const w = Math.abs(cropDrag.x1 - cropDrag.x0), h = Math.abs(cropDrag.y1 - cropDrag.y0);
        cropDrag = null;
        if (w >= 10 && h >= 10) {
          cropPending = { x, y, w, h };
          drawCropUI();
        } else {
          env.clearOverlay();
        }
        return;
      }
      if (draggingSel) {
        draggingSel = false;
        if (!dragMoved) dropLastSnapshot();   // plain click: keep selection, drop the no-op snapshot
        env.onHistoryChange();
        return;
      }
      if (!drawing) return;
      env.clearOverlay();
      // Ignore zero-size accidental clicks for shapes; keep dots for pen
      const moved = Math.hypot(drawing.x1 - drawing.x0, drawing.y1 - drawing.y0) > 2 || drawing.points.length > 2;
      if (moved || drawing.tool === 'pen' || drawing.tool === 'highlighter') {
        snapshot();
        shapes.push(drawing);
        renderShape(env.baseCtx(), drawing);
      }
      drawing = null;
      env.onHistoryChange();
    }
    overlay.addEventListener('pointerup', finishStroke);
    overlay.addEventListener('pointercancel', () => {
      drawing = null;
      cropDrag = null;
      if (draggingSel) { draggingSel = false; if (!dragMoved) dropLastSnapshot(); }
      env.clearOverlay();
      drawSel();
    });

    // ---------- Crop ----------
    function drawCropUI() {
      env.clearOverlay();
      const ctx = env.overlayCtx();
      const u = 1 / env.uiScale();
      const vb = env.viewBounds();
      const r = cropPending || (cropDrag && {
        x: Math.min(cropDrag.x0, cropDrag.x1), y: Math.min(cropDrag.y0, cropDrag.y1),
        w: Math.abs(cropDrag.x1 - cropDrag.x0), h: Math.abs(cropDrag.y1 - cropDrag.y0),
      });
      if (!r) return;
      ctx.save();
      // dim everything outside the marquee
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath();
      ctx.rect(vb.x, vb.y, vb.w, vb.h);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#5b8cff';
      ctx.lineWidth = 1.5 * u;
      ctx.setLineDash([6 * u, 4 * u]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
      if (cropPending) {
        // ✓ apply and ✕ cancel badges under the bottom-right corner
        const bx = Math.min(vb.x + vb.w - 14 * u, r.x + r.w - 2 * u);
        const by = Math.min(vb.y + vb.h - 14 * u, r.y + r.h + 20 * u);
        const ok = { x: bx - 30 * u, y: by };
        const cancel = { x: bx, y: by };
        badge(ctx, ok, '#22c55e', u, 'check');
        badge(ctx, cancel, '#ef4444', u, 'x');
        cropPending._ok = ok;
        cropPending._cancel = cancel;
      }
      ctx.restore();
    }

    function badge(ctx, c, fill, u, kind) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 11 * u, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.2 * u;
      ctx.beginPath();
      if (kind === 'check') {
        ctx.moveTo(c.x - 4.5 * u, c.y + .5 * u);
        ctx.lineTo(c.x - 1.5 * u, c.y + 4 * u);
        ctx.lineTo(c.x + 4.5 * u, c.y - 4 * u);
      } else {
        ctx.moveTo(c.x - 4.5 * u, c.y - 4.5 * u); ctx.lineTo(c.x + 4.5 * u, c.y + 4.5 * u);
        ctx.moveTo(c.x + 4.5 * u, c.y - 4.5 * u); ctx.lineTo(c.x - 4.5 * u, c.y + 4.5 * u);
      }
      ctx.stroke();
    }

    function applyCrop() {
      if (!cropPending || !env.onCropApply) return;
      const rect = { x: cropPending.x, y: cropPending.y, w: cropPending.w, h: cropPending.h };
      cropPending = null;
      snapshot();
      env.onCropApply(rect);
      env.clearOverlay();
      redrawBase();
      env.onHistoryChange();
    }

    function cancelCrop(redrawUI) {
      cropDrag = null;
      if (cropPending) {
        cropPending = null;
        if (redrawUI) env.clearOverlay();
      }
    }

    // ---------- Selection: hit test, move, delete ----------
    function textMetrics(s) {
      const ctx = env.overlayCtx();
      ctx.font = textFont(s.fontSize);
      const lines = s.text.split('\n');
      let w = 0;
      lines.forEach(l => { w = Math.max(w, ctx.measureText(l).width); });
      return { w, h: lines.length * s.fontSize * 1.22 };
    }

    function bboxOf(s) {
      if (s.tool === 'text') {
        const m = textMetrics(s);
        return { x: s.x, y: s.y, w: m.w, h: m.h };
      }
      let minx, miny, maxx, maxy;
      if (s.points && (s.tool === 'pen' || s.tool === 'highlighter')) {
        minx = maxx = s.points[0].x; miny = maxy = s.points[0].y;
        s.points.forEach(q => {
          minx = Math.min(minx, q.x); maxx = Math.max(maxx, q.x);
          miny = Math.min(miny, q.y); maxy = Math.max(maxy, q.y);
        });
      } else {
        minx = Math.min(s.x0, s.x1); maxx = Math.max(s.x0, s.x1);
        miny = Math.min(s.y0, s.y1); maxy = Math.max(s.y0, s.y1);
      }
      const pad = s.tool === 'sarrow' ? Math.max(8, s.lw * 2)
                : s.tool === 'arrow' ? Math.max(5, s.lw * 1.6)
                : s.lw / 2 + 2;
      return { x: minx - pad, y: miny - pad, w: maxx - minx + pad * 2, h: maxy - miny + pad * 2 };
    }

    function distToSeg(p, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((p.x - ax) * dx + (p.y - ay) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (ax + dx * t), p.y - (ay + dy * t));
    }

    // Hit = on the drawn stroke itself (not the empty inside of a box/oval),
    // so clicking blank canvas inside a shape still starts a new drawing
    function hitShape(p, s, slack) {
      if (s.tool === 'text') {
        const b = bboxOf(s);
        return p.x >= b.x - slack && p.x <= b.x + b.w + slack &&
               p.y >= b.y - slack && p.y <= b.y + b.h + slack;
      }
      const tol = slack + s.lw / 2 + 4;
      switch (s.tool) {
        case 'pen':
        case 'highlighter': {
          const pts = s.points;
          if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < tol;
          for (let i = 1; i < pts.length; i++)
            if (distToSeg(p, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) < tol) return true;
          return false;
        }
        case 'arrow':
          return distToSeg(p, s.x0, s.y0, s.x1, s.y1) < tol ||
                 Math.hypot(p.x - s.x1, p.y - s.y1) < Math.max(tol, s.lw * 3.2);
        case 'sarrow':
          return distToSeg(p, s.x0, s.y0, s.x1, s.y1) < Math.max(tol, Math.max(16, s.lw * 4) / 2);
        case 'rect': {
          const x = Math.min(s.x0, s.x1), y = Math.min(s.y0, s.y1);
          const X = Math.max(s.x0, s.x1), Y = Math.max(s.y0, s.y1);
          return distToSeg(p, x, y, X, y) < tol || distToSeg(p, X, y, X, Y) < tol ||
                 distToSeg(p, X, Y, x, Y) < tol || distToSeg(p, x, Y, x, y) < tol;
        }
        case 'oval': {
          const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
          const rx = Math.abs(s.x1 - s.x0) / 2 || 1, ry = Math.abs(s.y1 - s.y0) / 2 || 1;
          const d = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
          return Math.abs(d - 1) * Math.min(rx, ry) < tol;
        }
      }
      return false;
    }

    function hitTest(p) {
      const slack = 6 / env.uiScale();
      for (let i = shapes.length - 1; i >= 0; i--)
        if (hitShape(p, shapes[i], slack)) return shapes[i];
      return null;
    }

    function translateShape(s, dx, dy) {
      if (s.tool === 'text') { s.x += dx; s.y += dy; return; }
      s.x0 += dx; s.x1 += dx; s.y0 += dy; s.y1 += dy;
      if (s.points) s.points.forEach(q => { q.x += dx; q.y += dy; });
    }

    function deleteSelected() {
      if (!selected) return;
      snapshot();
      shapes = shapes.filter(s => s !== selected);
      selected = null;
      redrawBase();
      drawSel();
      env.onHistoryChange();
    }

    // Selection outline + red ✕ delete button, sized to look constant on screen
    function drawSel() {
      env.clearOverlay();
      if (!selected) return;
      const ctx = env.overlayCtx();
      const u = 1 / env.uiScale();
      const vb = env.viewBounds();
      const b = bboxOf(selected);
      ctx.save();
      ctx.strokeStyle = '#5b8cff';
      ctx.lineWidth = 1.5 * u;
      ctx.setLineDash([6 * u, 4 * u]);
      ctx.strokeRect(b.x - 6 * u, b.y - 6 * u, b.w + 12 * u, b.h + 12 * u);
      ctx.setLineDash([]);
      const cx = Math.min(vb.x + vb.w - 14 * u, b.x + b.w + 16 * u);
      const cy = Math.max(vb.y + 14 * u, b.y - 16 * u);
      badge(ctx, { x: cx, y: cy }, '#ef4444', u, 'x');
      ctx.restore();
      selected._delBtn = { x: cx, y: cy, r: 14 * u };
    }

    // ---------- Text ----------
    function textFont(size) {
      const fam = handDrawn
        ? "'Chalkboard SE','Comic Sans MS',cursive"
        : "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
      return `bold ${size}px ${fam}`;
    }

    // Skitch-style halo: outline in whichever contrasts with the fill color
    function contrastFor(hex) {
      const n = parseInt(hex.slice(1), 16);
      const lum = .299 * (n >> 16 & 255) + .587 * (n >> 8 & 255) + .114 * (n & 255);
      return lum > 160 ? 'rgba(17,19,26,.9)' : 'rgba(255,255,255,.93)';
    }

    let editor = null;
    function openTextEditor(p) {
      closeTextEditor(true);
      const place = env.textPlacement(p);
      const fontSize = FONTS[sizeKey];
      editor = document.createElement('textarea');
      editor.id = 'textEditor';
      editor.spellcheck = false;
      const st = editor.style;
      st.left = (place.left - 5.5) + 'px';
      st.top = (place.top - 3.5) + 'px';
      st.font = textFont(fontSize * place.fontScale);
      st.color = color;
      st.caretColor = color;
      env.textHost.appendChild(editor);
      const size = () => {
        const ctx = env.overlayCtx();
        ctx.font = textFont(fontSize);
        let w = 30;
        editor.value.split('\n').forEach(l => { w = Math.max(w, ctx.measureText(l).width); });
        st.width = (w * place.fontScale + 26) + 'px';
        st.height = (editor.value.split('\n').length * fontSize * 1.22 * place.fontScale + 10) + 'px';
      };
      size();
      editor.addEventListener('input', size);
      editor.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') closeTextEditor(true);
      });
      editor.addEventListener('blur', () => closeTextEditor(true));
      editor._commit = { x: p.x, y: p.y, fontSize, color };
      setTimeout(() => editor && editor.focus(), 0);
    }

    function closeTextEditor(commit) {
      if (!editor) return;
      const ed = editor;
      editor = null;                       // guard against blur re-entry
      const text = ed.value.replace(/\s+$/, '');
      if (commit && text) {
        snapshot();
        shapes.push({ tool: 'text', ...ed._commit, text });
        redrawBase();
        env.onHistoryChange();
      }
      ed.remove();
    }

    // ---------- Hand-drawn (sketchy) rendering ----------
    // Deterministic per-shape randomness so the wobble doesn't change on redraws
    function mulberry32(seed) {
      let a = seed >>> 0;
      return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function roughness(s) { return Math.max(2, Math.min(7, s.lw * 0.55)); }

    // Single sketch pass — bow and overshoot carry the hand-drawn look
    function sketchPasses(ctx, s, draw) {
      const rng = mulberry32(s.seed || 1);
      ctx.beginPath();
      ctx.lineWidth = s.lw * 0.95;
      draw(rng, roughness(s));
      ctx.stroke();
    }

    // A hand stroke isn't jittery — it bows in one smooth curve, overshoots
    // its endpoints a little, and doesn't hit them exactly.
    function sketchLine(ctx, rng, x0, y0, x1, y1, r) {
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const px = -uy, py = ux;
      const ov = () => rng() * r * 1.4;
      const jit = k => (rng() - .5) * r * k;
      const sx = x0 - ux * ov() + px * jit(.8), sy = y0 - uy * ov() + py * jit(.8);
      const ex = x1 + ux * ov() + px * jit(.8), ey = y1 + uy * ov() + py * jit(.8);
      const bow = (rng() - .5) * 2 * Math.min(len * .05, r * 2.5);
      ctx.moveTo(sx, sy);
      if (len < 110) {
        ctx.quadraticCurveTo(
          (sx + ex) / 2 + px * (bow + jit(.7)), (sy + ey) / 2 + py * (bow + jit(.7)),
          ex, ey);
      } else {
        // long stroke: two joined curves so it doesn't read as one clean arc
        const t1 = .4 + rng() * .2;
        const mx = sx + (ex - sx) * t1 + px * (bow + jit(1));
        const my = sy + (ey - sy) * t1 + py * (bow + jit(1));
        ctx.quadraticCurveTo(
          sx + (ex - sx) * t1 / 2 + px * (bow * .6 + jit(.8)),
          sy + (ey - sy) * t1 / 2 + py * (bow * .6 + jit(.8)), mx, my);
        ctx.quadraticCurveTo(
          sx + (ex - sx) * (1 + t1) / 2 + px * (bow * .8 + jit(.8)),
          sy + (ey - sy) * (1 + t1) / 2 + py * (bow * .8 + jit(.8)), ex, ey);
      }
    }

    // Hand-drawn ellipse: smooth low-frequency squash instead of per-point
    // jitter, drawn slightly past a full turn with the radius drifting so the
    // ends overlap without lining up.
    function sketchEllipse(ctx, rng, cx, cy, rx, ry, r) {
      const steps = Math.max(14, Math.round((rx + ry) / 10));
      const start = rng() * Math.PI * 2;
      const total = Math.PI * 2 + .3 + rng() * .5;
      const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2;
      const amp = Math.min(r * 1.3, Math.min(rx, ry) * .12 + 1);
      const drift = (rng() < .5 ? -1 : 1) * r * 1.5;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const a = start + (i / steps) * total;
        const dr = amp * Math.sin(a * 2 + p1) + amp * .6 * Math.sin(a * 3 + p2)
                 + (rng() - .5) * r * .4 + (i / steps) * drift;
        pts.push([cx + Math.cos(a) * (rx + dr), cy + Math.sin(a) * (ry + dr)]);
      }
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(pts[i][0], pts[i][1],
          (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    }

    function renderShape(ctx, s) {
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.tool === 'highlighter') {
        ctx.globalAlpha = 0.4;
        ctx.lineCap = 'butt';
      }
      switch (s.tool) {
        case 'pen':
        case 'highlighter': {
          ctx.beginPath();
          const pts = s.points;
          ctx.moveTo(pts[0].x, pts[0].y);
          if (pts.length === 1) {
            ctx.lineTo(pts[0].x + .01, pts[0].y + .01);
          } else {
            for (let i = 1; i < pts.length - 1; i++) {
              const mx = (pts[i].x + pts[i + 1].x) / 2;
              const my = (pts[i].y + pts[i + 1].y) / 2;
              ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
            }
            const last = pts[pts.length - 1];
            ctx.lineTo(last.x, last.y);
          }
          ctx.stroke();
          break;
        }
        case 'arrow': {
          const { x0, y0, x1, y1 } = s;
          const angle = Math.atan2(y1 - y0, x1 - x0);
          const head = Math.max(10, s.lw * 3.2);
          if (handDrawn) {
            const hx1 = x1 - head * Math.cos(angle - Math.PI / 6.5), hy1 = y1 - head * Math.sin(angle - Math.PI / 6.5);
            const hx2 = x1 - head * Math.cos(angle + Math.PI / 6.5), hy2 = y1 - head * Math.sin(angle + Math.PI / 6.5);
            sketchPasses(ctx, s, (rng, r) => {
              sketchLine(ctx, rng, x0, y0, x1, y1, r);
              sketchLine(ctx, rng, x1, y1, hx1, hy1, r);
              sketchLine(ctx, rng, x1, y1, hx2, hy2, r);
            });
            break;
          }
          // shorten shaft so it doesn't poke through the head
          const sx = x1 - Math.cos(angle) * head * 0.6;
          const sy = y1 - Math.sin(angle) * head * 0.6;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 - head * Math.cos(angle - Math.PI / 6.5), y1 - head * Math.sin(angle - Math.PI / 6.5));
          ctx.lineTo(x1 - head * Math.cos(angle + Math.PI / 6.5), y1 - head * Math.sin(angle + Math.PI / 6.5));
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'sarrow': {
          // Skitch-style arrow: filled shape, thin at the tail, widening into
          // a big solid triangular head
          const { x0, y0, x1, y1 } = s;
          const dx = x1 - x0, dy = y1 - y0;
          const len = Math.hypot(dx, dy);
          if (len < 2) break;
          const ux = dx / len, uy = dy / len;
          const px = -uy, py = ux;
          const headLen = Math.min(len * .45, Math.max(18, s.lw * 4.5));
          const headW = Math.max(16, s.lw * 4);
          const baseW = Math.max(5, s.lw * 1.6);
          const tailW = Math.max(1.5, s.lw * .45);
          const bx = x1 - ux * headLen, by = y1 - uy * headLen;
          const pts = [
            [x0 + px * tailW / 2, y0 + py * tailW / 2],
            [bx + px * baseW / 2, by + py * baseW / 2],
            [bx + px * headW / 2, by + py * headW / 2],
            [x1, y1],
            [bx - px * headW / 2, by - py * headW / 2],
            [bx - px * baseW / 2, by - py * baseW / 2],
            [x0 - px * tailW / 2, y0 - py * tailW / 2],
          ];
          ctx.beginPath();
          if (handDrawn) {
            const rng = mulberry32(s.seed || 1);
            // roughness follows the head size so big arrows visibly sketch
            const r = Math.max(2.5, Math.min(8, headW * .15, len * .05));
            const j = pts.map(p => [p[0] + (rng() - .5) * r * 1.4, p[1] + (rng() - .5) * r * 1.4]);
            ctx.moveTo(j[0][0], j[0][1]);
            for (let i = 1; i <= j.length; i++) {
              const a = j[i - 1], b = j[i % j.length];
              const k = Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]) * .08, r * 1.6);
              ctx.quadraticCurveTo(
                (a[0] + b[0]) / 2 + (rng() - .5) * 2 * k,
                (a[1] + b[1]) / 2 + (rng() - .5) * 2 * k,
                b[0], b[1]);
            }
          } else {
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'rect': {
          const x = Math.min(s.x0, s.x1), y = Math.min(s.y0, s.y1);
          const w = Math.abs(s.x1 - s.x0), h = Math.abs(s.y1 - s.y0);
          if (handDrawn) {
            sketchPasses(ctx, s, (rng, r) => {
              sketchLine(ctx, rng, x, y, x + w, y, r);
              sketchLine(ctx, rng, x + w, y, x + w, y + h, r);
              sketchLine(ctx, rng, x + w, y + h, x, y + h, r);
              sketchLine(ctx, rng, x, y + h, x, y, r);
            });
            break;
          }
          const r = Math.min(6, w / 2, h / 2);
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, r);
          ctx.stroke();
          break;
        }
        case 'text': {
          ctx.font = textFont(s.fontSize);
          ctx.textBaseline = 'top';
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(2.5, s.fontSize / 6.5);
          ctx.strokeStyle = contrastFor(s.color);
          const lh = s.fontSize * 1.22;
          s.text.split('\n').forEach((ln, i) => {
            ctx.strokeText(ln, s.x, s.y + i * lh);
            ctx.fillText(ln, s.x, s.y + i * lh);
          });
          break;
        }
        case 'oval': {
          const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
          const rx = Math.abs(s.x1 - s.x0) / 2, ry = Math.abs(s.y1 - s.y0) / 2;
          if (handDrawn) {
            sketchPasses(ctx, s, (rng, r) => sketchEllipse(ctx, rng, cx, cy, rx, ry, r));
            break;
          }
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }

    function redrawBase() {
      env.clearBase();
      const ctx = env.baseCtx();
      shapes.forEach(s => renderShape(ctx, s));
    }

    // ---------- Undo / redo ----------
    function undo() {
      if (!history.length) return;
      future.push({ shapes, extra: env.getExtra ? env.getExtra() : undefined });
      const entry = history.pop();
      shapes = entry.shapes;
      if (env.setExtra) env.setExtra(entry.extra);
      selected = null;
      redrawBase();
      drawSel();
      env.onHistoryChange();
    }
    function redo() {
      if (!future.length) return;
      history.push({ shapes, extra: env.getExtra ? env.getExtra() : undefined });
      const entry = future.pop();
      shapes = entry.shapes;
      if (env.setExtra) env.setExtra(entry.extra);
      selected = null;
      redrawBase();
      drawSel();
      env.onHistoryChange();
    }

    // ---------- Keyboard shortcuts ----------
    function isTypingTarget(e) {
      if (editor) return true; // typing in our text box (capture-phase listener fires before it)
      const t = (e.composedPath ? e.composedPath()[0] : e.target) || e.target;
      return t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);
    }

    function onKeydown(e) {
      if (isTypingTarget(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      let handled = false;

      if (cropPending && e.code === 'Enter' && !mod) {
        applyCrop();
        handled = true;
      } else if (e.code === 'Escape' && (cropPending || cropDrag)) {
        cancelCrop(true);
        handled = true;
      } else if ((e.code === 'Backspace' || e.code === 'Delete') && selected && !mod) {
        deleteSelected();
        handled = true;
      } else if (e.code === 'Escape' && selected) {
        selected = null;
        drawSel();
        handled = true;
      } else if (mod && e.shiftKey && e.code === 'KeyC') {
        env.onPrimary();
        handled = true;
      } else if (mod && e.shiftKey && e.code === 'KeyS' && env.onSecondary) {
        env.onSecondary();
        handled = true;
      } else if (mod && e.code === 'KeyZ') {
        e.shiftKey ? redo() : undo();
        handled = true;
      } else if (!mod) {
        const digit = e.code.match(/^(?:Digit|Numpad)([1-5])$/);
        if (digit) {
          setSize(['S', 'M', 'L', 'XL', 'XXL'][digit[1] - 1]);
          e.preventDefault();
          if (env.exclusiveKeys) e.stopPropagation();
          return;
        }
        switch (e.code) {
          case 'KeyP': setTool('pen'); handled = true; break;
          case 'KeyH': setTool('highlighter'); handled = true; break;
          case 'KeyA': setTool('arrow'); handled = true; break;
          case 'KeyS': setTool('sarrow'); handled = true; break;
          case 'KeyT': setTool('text'); handled = true; break;
          case 'KeyR': setTool('rect'); handled = true; break;
          case 'KeyO': setTool('oval'); handled = true; break;
          case 'KeyC': if (env.hasCrop) { setTool('crop'); handled = true; } break;
        }
      }
      if (handled) {
        e.preventDefault();
        if (env.exclusiveKeys) e.stopPropagation();
      }
    }
    window.addEventListener('keydown', onKeydown, !!env.exclusiveKeys);

    function annotationsBottom() {
      let bottom = 0;
      shapes.forEach(s => {
        const b = bboxOf(s);
        bottom = Math.max(bottom, b.y + b.h);
      });
      return bottom;
    }

    function destroy() {
      window.removeEventListener('keydown', onKeydown, !!env.exclusiveKeys);
      closeTextEditor(false);
    }

    const api = {
      setTool, setColor, setSize, setHandDrawn,
      getTool: () => tool,
      getHandDrawn: () => handDrawn,
      undo, redo, clearShapes, redrawBase,
      redrawOverlay: drawSel,
      deselect: () => { selected = null; drawSel(); },
      hideTransient: () => { selected = null; cancelCrop(false); closeTextEditor(true); env.clearOverlay(); },
      hasShapes: () => shapes.length > 0,
      historyLens: () => ({ undo: history.length, redo: future.length }),
      annotationsBottom,
      destroy,
    };
    return api;
  }

  return { createEditor, COLORS, SIZES, FONTS };
})();
