/* Website glue for the shared markup core: image paste/drop/auto-paste,
 * canvas fitting, crop application, copy-to-clipboard, and PNG download. */
(() => {
  'use strict';

  const base = document.getElementById('base');
  const overlay = document.getElementById('overlay');
  const bctx = base.getContext('2d');
  const octx = overlay.getContext('2d');
  const wrap = document.getElementById('canvasWrap');
  const empty = document.getElementById('empty');
  const stage = document.getElementById('stage');

  let img = null;   // the pasted image (never mutated)
  let crop = null;  // {x,y,w,h} in original-image pixels; shapes stay in original coords
  let refs = null;  // toolbar refs (assigned after build)

  const ox = () => (crop ? crop.x : 0);
  const oy = () => (crop ? crop.y : 0);

  const env = {
    overlay,
    overlayCtx() { octx.setTransform(1, 0, 0, 1, -ox(), -oy()); return octx; },
    clearOverlay() {
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, overlay.width, overlay.height);
    },
    baseCtx() { bctx.setTransform(1, 0, 0, 1, -ox(), -oy()); return bctx; },
    clearBase() {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, base.width, base.height);
      if (img) {
        bctx.setTransform(1, 0, 0, 1, -ox(), -oy());
        bctx.drawImage(img, 0, 0);
      }
    },
    toPoint(e) {
      const r = overlay.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (overlay.width / r.width) + ox(),
        y: (e.clientY - r.top) * (overlay.height / r.height) + oy(),
      };
    },
    uiScale() {
      const r = overlay.getBoundingClientRect();
      return (r.width / overlay.width) || 1;
    },
    viewBounds() { return { x: ox(), y: oy(), w: base.width, h: base.height }; },
    textHost: wrap,
    textPlacement(p) {
      const s = env.uiScale();
      return { left: (p.x - ox()) * s, top: (p.y - oy()) * s, fontScale: s };
    },
    canDraw: () => !!img,
    getSetting: k => localStorage.getItem(k),
    setSetting: (k, v) => localStorage.setItem(k, v),
    getExtra: () => ({ crop: crop ? { ...crop } : null }),
    setExtra(x) { setCrop(x && x.crop ? x.crop : null); },
    onCropApply(rect) { setCrop(rect); },
    hasCrop: true,
    onHistoryChange,
    onToolChange: t => refs && refs.setActiveTool(t),
    onSizeChange: k => refs && refs.setActiveSize(k),
    onPrimary: () => copyResult(),
    onSecondary: () => downloadResult(),
    toast: (m, isErr) => refs && refs.toast(m, isErr),
    exclusiveKeys: false,
  };

  const editor = MarkupCore.createEditor(env);

  refs = MarkupToolbar.build(document.getElementById('toolbar'), {
    brand: true,
    tools: ['pen', 'highlighter', 'arrow', 'sarrow', 'text', 'rect', 'oval', 'crop'],
    spacer: true,
    options: [
      { id: 'handDrawnCb', title: 'Hand-drawn', desc: 'Gives arrows, boxes &amp; ovals a wobbly, sketched-by-hand look instead of perfect geometry. Checking or unchecking it also restyles everything already drawn on the image.' },
      { id: 'autoPasteCb', title: 'Auto paste', desc: 'Automatically loads the image from your clipboard the moment you open or switch back to this tab — take a screenshot, come here, and it\'s already on the canvas. No need to press ⌘V.' },
    ],
    menuLinks: [
      { href: 'markup-extension.zip', download: true, title: 'Download the Chrome extension', desc: 'Draw with these same tools on any live web page and capture it to your clipboard. Unzip, then load it via chrome://extensions → Developer mode → Load unpacked.' },
    ],
    secondary: { id: 'downloadBtn', icon: 'download', label: 'Download', kbd: '⇧⌘S', title: 'Download the annotated image as a PNG' },
    primary: { id: 'copyBtn', icon: 'copy', label: 'Copy', kbd: '⇧⌘C', title: 'Copy the annotated image to the clipboard' },
    toastHost: document.body,
  }, {
    editor,
    onPrimary: () => copyResult(),
    onSecondary: () => downloadResult(),
    onClear: () => { if (img) loadImage(img); },
    onOption(id, checked) {
      if (id === 'handDrawnCb') editor.setHandDrawn(checked);
      if (id === 'autoPasteCb') {
        autoPaste = checked;
        localStorage.setItem('autoPaste', checked ? '1' : '0');
        if (checked) tryAutoPaste();
      }
    },
  });

  refs.checkboxes.handDrawnCb.checked = editor.getHandDrawn();

  function onHistoryChange() {
    if (!refs) return;
    refs.syncHistory(editor.historyLens(), { canClear: !!img, canPrimary: !!img });
  }

  // ---------- Image loading & crop ----------
  function sizeCanvases() {
    base.width = overlay.width = crop ? crop.w : (img.naturalWidth || img.width);
    base.height = overlay.height = crop ? crop.h : (img.naturalHeight || img.height);
    fitCanvas();
  }

  function setCrop(c) {
    crop = c;
    if (img) sizeCanvases();
  }

  function loadImage(image) {
    img = image;
    crop = null;
    editor.clearShapes();
    sizeCanvases();
    empty.style.display = 'none';
    wrap.style.display = 'block';
    editor.redrawBase();
    onHistoryChange();
  }

  function fitCanvas() {
    if (!img) return;
    const iw = base.width, ih = base.height;
    const maxW = stage.clientWidth - 48;
    const maxH = stage.clientHeight - 48;
    const scale = Math.min(1, maxW / iw, maxH / ih);
    wrap.style.width = base.style.width = overlay.style.width = (iw * scale) + 'px';
    wrap.style.height = base.style.height = overlay.style.height = (ih * scale) + 'px';
  }
  window.addEventListener('resize', fitCanvas);

  function handleBlob(blob) {
    if (!blob || !blob.type.startsWith('image/')) return false;
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { loadImage(image); URL.revokeObjectURL(url); };
    image.src = url;
    return true;
  }

  // Paste anywhere on the page
  window.addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        handleBlob(item.getAsFile());
        return;
      }
    }
  });

  // Drag & drop
  window.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragover'); });
  window.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragover'); });
  window.addEventListener('drop', e => {
    e.preventDefault();
    document.body.classList.remove('dragover');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleBlob(f);
  });

  // ---------- Copy / download (same annotated pixels) ----------
  function annotatedPngBlob() {
    return new Promise((res, rej) =>
      base.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png'));
  }

  async function downloadResult() {
    if (!img) return;
    try {
      const blob = await annotatedPngBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'markup.png';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      refs.toast('Downloaded markup.png');
    } catch (err) {
      refs.toast('Download failed', true);
    }
  }

  async function copyResult() {
    if (!img) return;
    try {
      // Safari requires the promise to be passed to ClipboardItem synchronously
      const blobPromise = annotatedPngBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      refs.toast('Copied to clipboard');
    } catch (err) {
      try {
        const blob = await annotatedPngBlob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        refs.toast('Copied to clipboard');
      } catch (err2) {
        refs.toast('Copy failed — check clipboard permissions', true);
      }
    }
  }

  // ---------- Auto paste ----------
  let autoPaste = localStorage.getItem('autoPaste') === '1';
  refs.checkboxes.autoPasteCb.checked = autoPaste;

  async function tryAutoPaste() {
    if (img || !navigator.clipboard || !navigator.clipboard.read) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (type) {
          handleBlob(await item.getType(type));
          return;
        }
      }
    } catch (err) {
      // No permission, document not focused, or non-image clipboard — stay on empty state
    }
  }

  if (autoPaste && document.hasFocus()) tryAutoPaste();
  // Also fire when returning to an empty tab (e.g. right after taking a screenshot)
  window.addEventListener('focus', () => {
    if (autoPaste && !img) tryAutoPaste();
  });

  onHistoryChange();
})();
