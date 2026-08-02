/* Shared toolbar builder. Renders the markup toolbar into a container from a
 * config, wires it to a MarkupCore editor, and returns refs + helpers.
 * Both the website and the extension use this so the tools never drift. */
window.MarkupToolbar = (() => {
  'use strict';

  const TOOL_DEFS = {
    pen: { title: 'Pen (P)', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>' },
    highlighter: { title: 'Highlighter (H)', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>' },
    arrow: { title: 'Arrow (A)', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="9 5 19 5 19 15"/></svg>' },
    sarrow: { title: 'Skitch arrow (S)', svg: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M4.5 20.5 L15.6 10.9 L17.5 12.8 L20 4 L11.2 6.5 L13.1 8.4 L3.5 19.5 Z"/></svg>' },
    text: { title: 'Text (T) — click where you want it, type, click elsewhere or press Esc to finish', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>' },
    rect: { title: 'Box (R)', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>' },
    oval: { title: 'Oval (O)', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="6.5"/></svg>' },
    crop: { title: 'Crop (C) — drag the area to keep, then ✓ or Enter', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>' },
  };

  const ICONS = {
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>',
    clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  };

  const BRAND_HTML = `
    <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#5b8cff"/><stop offset="1" stop-color="#9b5bff"/>
      </linearGradient></defs>
      <rect width="64" height="64" rx="14" fill="url(#logoGrad)"/>
      <path d="M13 41C18 26 26 26 31 35s11 11 20-10" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
    </svg>`;

  const SIZE_DOTS = { S: 4, M: 7, L: 10, XL: 14, XXL: 19 };
  const SIZE_TITLES = {
    S: 'Thin stroke / small text — or press 1',
    M: 'Medium stroke / text — or press 2',
    L: 'Thick stroke / text — or press 3',
    XL: 'Extra-thick stroke / big text — or press 4',
    XXL: 'Huge stroke / huge text — or press 5',
  };
  const DEFAULT_SIZE = 'L';

  /**
   * config: {
   *   brand: bool,                       // show logo + "Andrew's Markup"
   *   tools: ['pen','highlighter',...],  // in order; from TOOL_DEFS
   *   spacer: bool,                      // flex spacer before the right side
   *   options: [{id, title, desc}],      // gear-menu checkboxes
   *   menuLinks: [{href, download, title, desc}], // gear-menu download links
   *   primary: {id, icon: 'copy'|'camera', label, kbd, title},
   *   exit: bool,                        // ✕ exit button (extension)
   *   toastHost: element,                // where to append the toast (default container.parentNode)
   *   trusted: fn(html) -> html          // optional TrustedTypes wrapper
   * }
   * hooks: { editor, onPrimary(), onClear(), onExit(), onOption(id, checked) }
   */
  function build(container, config, hooks) {
    const pass = config.trusted || (s => s);
    const CORE = window.MarkupCore;

    let html = '';
    if (config.brand) {
      html += `<div id="brand">${BRAND_HTML}<span class="brand-text">Andrew's Markup</span></div>`;
    }
    html += `<div class="group" id="tools">` + config.tools.map(t =>
      `<button class="tool-btn${t === 'pen' ? ' active' : ''}" data-tool="${t}" title="${TOOL_DEFS[t].title}">${TOOL_DEFS[t].svg}</button>`
    ).join('') + `</div>`;
    html += `<div class="group" id="colors"></div>`;
    html += `<div class="group" id="sizes">` + Object.keys(SIZE_DOTS).map(k =>
      `<button class="size-btn${k === DEFAULT_SIZE ? ' active' : ''}" data-size="${k}" title="${SIZE_TITLES[k]}"><span class="dot" style="width:${SIZE_DOTS[k]}px;height:${SIZE_DOTS[k]}px"></span></button>`
    ).join('') + `</div>`;
    html += `<div class="group">
      <button class="action-btn" id="undoBtn" title="Undo (⌘Z)" disabled>${ICONS.undo}</button>
      <button class="action-btn" id="redoBtn" title="Redo (⇧⌘Z)" disabled>${ICONS.redo}</button>
      <button class="action-btn" id="clearBtn" title="Start over" disabled>${ICONS.clear}</button>
    </div>`;
    if (config.spacer) html += `<div class="spacer"></div>`;

    if ((config.options && config.options.length) || (config.menuLinks && config.menuLinks.length)) {
      html += `<div id="settings">
        <button class="action-btn" id="gearBtn" title="Options">${ICONS.gear}</button>
        <div id="settingsMenu">`;
      (config.options || []).forEach(o => {
        html += `<label class="menu-option">
          <input type="checkbox" id="${o.id}">
          <div><div class="t">${o.title}</div><div class="d">${o.desc}</div></div>
        </label>`;
      });
      (config.menuLinks || []).forEach(l => {
        html += `<a class="menu-option" href="${l.href}"${l.download ? ' download' : ''}>
          ${ICONS.download}
          <div><div class="t">${l.title}</div><div class="d">${l.desc}</div></div>
        </a>`;
      });
      html += `</div></div>`;
    }

    html += `<button class="action-btn primary-btn" id="${config.primary.id}" title="${config.primary.title || ''}" disabled>
      ${ICONS[config.primary.icon]} ${config.primary.label}${config.primary.kbd ? ` <span class="kbd">${config.primary.kbd}</span>` : ''}
    </button>`;
    if (config.exit) html += `<button class="exit-btn" id="exitBtn" title="Exit markup mode (also: press the extension button again)">✕</button>`;

    container.innerHTML = pass(html);

    // toast lives outside the bar
    const toastHost = config.toastHost || container.parentNode;
    const toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.innerHTML = pass('<span class="check">✓</span><span id="toastMsg">Copied to clipboard</span>');
    toastHost.appendChild(toastEl);
    let toastTimer;
    function toast(msg, isError) {
      const msgEl = toastEl.querySelector('#toastMsg');
      msgEl.textContent = msg;
      const check = toastEl.querySelector('.check');
      check.textContent = isError ? '✕' : '✓';
      check.style.color = isError ? '#f87171' : '#4ade80';
      // remove any action button from a previous toast
      toastEl.querySelectorAll('button').forEach(b => b.remove());
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
    }
    // toast with a clickable action (e.g. clipboard fallback)
    function toastAction(msg, label, fn) {
      toast(msg, true);
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { fn(); toastEl.classList.remove('show'); });
      toastEl.appendChild(b);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 8000);
    }

    // ---------- instant tooltips ----------
    // Native title tooltips are slow and tiny; show our own immediately on
    // hover. The gear keeps its native title (its hover opens the menu).
    const tipEl = document.createElement('div');
    tipEl.id = 'mkTip';
    toastHost.appendChild(tipEl);
    container.querySelectorAll('.tool-btn[title], .size-btn[title], .action-btn[title], .exit-btn[title]').forEach(el => {
      if (el.id === 'gearBtn') return;
      const text = el.getAttribute('title');
      el.removeAttribute('title');
      el.addEventListener('mouseenter', () => {
        tipEl.textContent = text;
        tipEl.style.display = 'block';
        const r = el.getBoundingClientRect();
        tipEl.style.top = (r.bottom + 8) + 'px';
        const left = r.left + r.width / 2 - tipEl.offsetWidth / 2;
        tipEl.style.left = Math.max(8, Math.min(left, window.innerWidth - tipEl.offsetWidth - 8)) + 'px';
      });
      el.addEventListener('mouseleave', () => { tipEl.style.display = 'none'; });
      el.addEventListener('pointerdown', () => { tipEl.style.display = 'none'; });
    });

    // ---------- wiring ----------
    const editor = hooks.editor;
    const toolBtns = [...container.querySelectorAll('.tool-btn')];
    toolBtns.forEach(b => b.addEventListener('click', () => editor.setTool(b.dataset.tool)));
    function setActiveTool(t) {
      toolBtns.forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    }

    const colorsEl = container.querySelector('#colors');
    CORE.COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === 0 ? ' active' : '');
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => {
        editor.setColor(c);
        [...colorsEl.children].forEach(x => x.classList.toggle('active', x === b));
      });
      colorsEl.appendChild(b);
    });

    const sizeBtns = [...container.querySelectorAll('.size-btn')];
    sizeBtns.forEach(b => b.addEventListener('click', () => editor.setSize(b.dataset.size)));
    function setActiveSize(k) {
      sizeBtns.forEach(x => x.classList.toggle('active', x.dataset.size === k));
    }

    const undoBtn = container.querySelector('#undoBtn');
    const redoBtn = container.querySelector('#redoBtn');
    const clearBtn = container.querySelector('#clearBtn');
    const primaryBtn = container.querySelector('#' + config.primary.id);
    const exitBtn = container.querySelector('#exitBtn');
    undoBtn.addEventListener('click', () => editor.undo());
    redoBtn.addEventListener('click', () => editor.redo());
    clearBtn.addEventListener('click', () => hooks.onClear());
    primaryBtn.addEventListener('click', () => hooks.onPrimary());
    if (exitBtn) exitBtn.addEventListener('click', () => hooks.onExit());

    const checkboxes = {};
    (config.options || []).forEach(o => {
      const cb = container.querySelector('#' + o.id);
      checkboxes[o.id] = cb;
      cb.addEventListener('change', () => hooks.onOption(o.id, cb.checked));
    });

    function syncHistory(lens, extra) {
      undoBtn.disabled = lens.undo === 0;
      redoBtn.disabled = lens.redo === 0;
      if (extra) {
        clearBtn.disabled = !extra.canClear;
        primaryBtn.disabled = !extra.canPrimary;
      }
    }

    return { setActiveTool, setActiveSize, syncHistory, checkboxes, toast, toastAction, primaryBtn, clearBtn, undoBtn, redoBtn, exitBtn, toastEl };
  }

  return { build };
})();
