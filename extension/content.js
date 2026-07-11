/* Markup mode on a live page. Injected together with shared/markup-core.js and
 * shared/toolbar.js by background.js when the extension button is pressed.
 *
 * Layout: a shadow-DOM host stretched over the document holds
 *   - a document-sized base canvas (committed shapes -> they scroll with the page)
 *   - a viewport-sized fixed overlay canvas (in-progress stroke / selection UI)
 *   - the floating toolbar and the text-entry layer
 * Capture: background attaches the debugger and screenshots the page from the
 * top to just below the lowest annotation; the base canvas is part of the page
 * render, so the drawings are in the shot. PNG -> clipboard.
 */
(() => {
  'use strict';
  if (window.__markupTeardown) { window.__markupTeardown(); return; }

  const HEIGHT_CAP = 16384;
  const dpr = window.devicePixelRatio || 1;
  const de = document.documentElement;
  let docW = Math.max(de.scrollWidth, window.innerWidth);
  let docH = Math.min(Math.max(de.scrollHeight, window.innerHeight), HEIGHT_CAP);
  // keep the doc-sized canvas inside a pixel budget; huge pages fall back to 1x
  const contentDpr = (docW * docH * dpr * dpr <= 100e6) ? dpr : 1;

  const host = document.createElement('div');
  host.id = '__markupHost';
  host.style.cssText = `all:initial; position:absolute; top:0; left:0; width:${docW}px; height:${docH}px; z-index:2147483646; pointer-events:none;`;
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  // Trusted Types escape hatch (github.com and friends)
  let ttPolicy = null;
  try {
    if (window.trustedTypes) ttPolicy = window.trustedTypes.createPolicy('markup-tool', { createHTML: s => s });
  } catch (e) { /* policy may already exist */ }
  const trusted = s => (ttPolicy ? ttPolicy.createHTML(s) : s);

  const styleEl = document.createElement('style');
  root.appendChild(styleEl);
  const EXTRA_CSS = `
    canvas { display: block; }
    #textLayer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    #textEditor { pointer-events: auto; }
    .mk-floating { pointer-events: auto; }
  `;
  fetch(chrome.runtime.getURL('shared/toolbar.css'))
    .then(r => r.text())
    .then(css => { styleEl.textContent = css + EXTRA_CSS; })
    .catch(() => { styleEl.textContent = EXTRA_CSS; });

  // base canvas: document-anchored, holds committed shapes
  const baseC = document.createElement('canvas');
  baseC.width = Math.round(docW * contentDpr);
  baseC.height = Math.round(docH * contentDpr);
  baseC.style.cssText = `position:absolute; top:0; left:0; width:${docW}px; height:${docH}px; pointer-events:none;`;
  root.appendChild(baseC);
  const bctx = baseC.getContext('2d');

  // overlay canvas: viewport-fixed, cheap to clear at 60fps
  const overlayC = document.createElement('canvas');
  overlayC.style.cssText = 'position:fixed; top:0; left:0; pointer-events:auto; cursor:crosshair; touch-action:none;';
  root.appendChild(overlayC);
  const octx = overlayC.getContext('2d');
  function sizeOverlay() {
    overlayC.width = Math.round(window.innerWidth * dpr);
    overlayC.height = Math.round(window.innerHeight * dpr);
    overlayC.style.width = window.innerWidth + 'px';
    overlayC.style.height = window.innerHeight + 'px';
  }
  sizeOverlay();

  const textLayer = document.createElement('div');
  textLayer.id = 'textLayer';
  root.appendChild(textLayer);

  const toolbarEl = document.createElement('div');
  toolbarEl.className = 'mk-bar mk-floating';
  root.appendChild(toolbarEl);

  // settings are pre-read by the async init below so the editor can be built sync
  let settings = {};
  let refs = null;
  let editor = null;

  const env = {
    overlay: overlayC,
    overlayCtx() {
      octx.setTransform(dpr, 0, 0, dpr, -window.scrollX * dpr, -window.scrollY * dpr);
      return octx;
    },
    clearOverlay() {
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, overlayC.width, overlayC.height);
    },
    baseCtx() {
      bctx.setTransform(contentDpr, 0, 0, contentDpr, 0, 0);
      return bctx;
    },
    clearBase() {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, baseC.width, baseC.height);
    },
    toPoint(e) { return { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY }; },
    uiScale: () => 1,
    viewBounds: () => ({ x: window.scrollX, y: window.scrollY, w: window.innerWidth, h: window.innerHeight }),
    textHost: textLayer,
    textPlacement: p => ({ left: p.x, top: p.y, fontScale: 1 }),
    canDraw: () => true,
    getSetting: k => settings[k],
    setSetting(k, v) { settings[k] = v; chrome.storage.local.set({ [k]: v }); },
    getExtra: () => undefined,
    setExtra: () => {},
    hasCrop: false,
    onHistoryChange() {
      if (refs) refs.syncHistory(editor.historyLens(), { canClear: editor.hasShapes(), canPrimary: true });
    },
    onToolChange: t => refs && refs.setActiveTool(t),
    onSizeChange: k => refs && refs.setActiveSize(k),
    onPrimary: () => capture(),
    toast: (m, isErr) => refs && refs.toast(m, isErr),
    exclusiveKeys: true,
  };

  function teardown() {
    editor && editor.destroy();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onEscape, true);
    host.remove();
    delete window.__markupTeardown;
  }
  window.__markupTeardown = teardown;

  // One persistent listener across activations (re-injection must not stack them).
  // Toggling off answers ok:true; if markup mode is not active it answers
  // ok:false so background re-injects.
  if (!window.__markupMsgHooked) {
    window.__markupMsgHooked = true;
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'mk-toggle') {
        if (window.__markupTeardown) {
          window.__markupTeardown();
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
      }
    });
  }

  function onScroll() {
    if (editor) editor.redrawOverlay();
    growIfNeeded();
  }
  function onResize() {
    sizeOverlay();
    if (editor) editor.redrawOverlay();
    growIfNeeded();
  }
  // infinite scroll / lazy load: grow the base canvas and re-render shapes
  let growPending = false;
  function growIfNeeded() {
    if (growPending) return;
    const h = Math.min(Math.max(de.scrollHeight, window.innerHeight), HEIGHT_CAP);
    const w = Math.max(de.scrollWidth, window.innerWidth);
    if (h <= docH + 2 && w <= docW + 2) return;
    growPending = true;
    setTimeout(() => {
      growPending = false;
      docH = Math.min(Math.max(de.scrollHeight, window.innerHeight), HEIGHT_CAP);
      docW = Math.max(de.scrollWidth, window.innerWidth);
      host.style.width = docW + 'px';
      host.style.height = docH + 'px';
      baseC.width = Math.round(docW * contentDpr);
      baseC.height = Math.round(docH * contentDpr);
      baseC.style.width = docW + 'px';
      baseC.style.height = docH + 'px';
      if (editor) editor.redrawBase();
    }, 250);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  // Escape with nothing selected/pending exits markup mode (core handles the
  // selected/crop cases first and stops propagation when it does)
  function onEscape(e) {
    if (e.code === 'Escape' && !e.defaultPrevented) teardown();
  }
  window.addEventListener('keydown', onEscape, true);

  // ---------- Capture: scroll & stitch ----------
  const settle = ms => new Promise(r => setTimeout(() =>
    requestAnimationFrame(() => requestAnimationFrame(r)), ms));

  function loadShot(dataUrl) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });
  }

  // Fixed/sticky page elements would repeat at every stitch seam — hide them
  // for the chunks after the first one.
  function collectPinnedEls() {
    const pinned = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if ((cs.position === 'fixed' || cs.position === 'sticky') && cs.visibility !== 'hidden') pinned.push(el);
    }
    return pinned;
  }

  async function capture() {
    const annBottom = editor.annotationsBottom();
    const vh = window.innerHeight;
    const maxH = Math.floor(HEIGHT_CAP / dpr);
    const bottom = Math.round(Math.min(
      docH, maxH,
      Math.max(annBottom > 0 ? annBottom + 40 : window.scrollY + vh, vh),
    ));
    const width = Math.min(docW, window.innerWidth, maxH);

    const prevScroll = window.scrollY;
    toolbarEl.style.display = 'none';
    editor.hideTransient();

    // chunk positions: viewport steps plus a final flush-bottom pass
    const ys = [];
    for (let y = 0; y + vh < bottom; y += vh) ys.push(y);
    ys.push(Math.max(0, bottom - vh));

    let blob = null;
    let error = null;
    let pinned = [];
    try {
      const out = document.createElement('canvas');
      out.width = Math.round(width * dpr);
      out.height = Math.round(bottom * dpr);
      const g = out.getContext('2d');

      for (let i = 0; i < ys.length; i++) {
        window.scrollTo(0, ys[i]);
        if (i === 1) { pinned = collectPinnedEls(); pinned.forEach(el => { el.style.visibility = 'hidden'; }); }
        // captureVisibleTab is rate-limited to ~2/sec; also let the page settle
        await settle(i === 0 ? 120 : 560);
        const at = window.scrollY; // actual position (bottom chunks clamp)
        const res = await chrome.runtime.sendMessage({ type: 'mk-shot' });
        if (!res || !res.ok) throw new Error(res && res.error || 'screenshot failed');
        const im = await loadShot(res.dataUrl);
        // the shot IS the viewport at doc offset `at` — paste it there
        g.drawImage(im, 0, 0, im.width, im.height,
                        0, Math.round(at * dpr), out.width, Math.round(vh * dpr));
      }
      blob = await new Promise((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png'));
    } catch (e) {
      error = String(e && e.message || e);
    } finally {
      pinned.forEach(el => { el.style.visibility = ''; });
      window.scrollTo(0, prevScroll);
      toolbarEl.style.display = '';
    }

    if (!blob) {
      refs.toast('Capture failed: ' + (error || 'unknown'), true);
      return;
    }
    // verification hook: attributes cross the isolated/main world boundary
    host.setAttribute('data-capture-size', String(blob.size));
    host.setAttribute('data-capture-dims', `${width}x${Math.round(bottom)}@${dpr}`);
    const fr = new FileReader();
    fr.onload = () => host.setAttribute('data-capture-url', fr.result);
    fr.readAsDataURL(blob);

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      refs.toast(`Copied ${width}×${Math.round(bottom)} to clipboard`);
    } catch (e) {
      // transient activation expired during the capture round-trip
      refs.toastAction('Ready — click to put it on the clipboard', 'Copy image', async () => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          refs.toast('Copied to clipboard');
        } catch (e2) {
          refs.toast('Copy failed — ' + (e2 && e2.message || 'clipboard blocked'), true);
        }
      });
    }
  }

  // ---------- init (settings first, then editor + toolbar) ----------
  chrome.storage.local.get(['handDrawn']).then(stored => {
    settings = stored || {};
    editor = MarkupCore.createEditor(env);

    refs = MarkupToolbar.build(toolbarEl, {
      brand: false,
      tools: ['pen', 'highlighter', 'arrow', 'sarrow', 'text', 'rect', 'oval'],
      spacer: false,
      options: [
        { id: 'handDrawnCb', title: 'Hand-drawn', desc: 'Gives arrows, boxes &amp; ovals a wobbly, sketched-by-hand look instead of perfect geometry. Toggling restyles everything already drawn on the page.' },
      ],
      primary: { id: 'captureBtn', icon: 'camera', label: 'Capture', kbd: '⇧⌘C', title: 'Capture the page from the top to just below your lowest annotation, straight to the clipboard' },
      exit: true,
      toastHost: root,
      trusted,
    }, {
      editor,
      onPrimary: () => capture(),
      onClear: () => { editor.clearShapes(); editor.redrawBase(); env.clearOverlay(); },
      onExit: () => teardown(),
      onOption(id, checked) {
        if (id === 'handDrawnCb') editor.setHandDrawn(checked);
      },
    });

    refs.checkboxes.handDrawnCb.checked = editor.getHandDrawn();
    refs.primaryBtn.disabled = false;
    env.onHistoryChange();
  });
})();
