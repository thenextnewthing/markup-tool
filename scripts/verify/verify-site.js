/* Full regression of the markup website (split shared-core version + crop).
 * Drives file://…/public/index.html in headless Chromium. */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = require('os').tmpdir();
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '../..');
const PAGE = pathToFileURL(path.join(ROOT, 'public/index.html')).href;

const fails = [];
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) fails.push(name);
}

async function draw(page, tool, size, from, to) {
  await page.click(`.size-btn[data-size="${size}"]`);
  await page.click(`.tool-btn[data-tool="${tool}"]`);
  const box = await page.locator('#overlay').boundingBox();
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      box.x + from[0] + ((to[0] - from[0]) * i) / 6,
      box.y + from[1] + ((to[1] - from[1]) * i) / 6);
  }
  await page.mouse.up();
}

const baseData = p => p.evaluate(() => document.getElementById('base').toDataURL());
const baseSize = p => p.evaluate(() => {
  const b = document.getElementById('base');
  return { w: b.width, h: b.height };
});

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE);

  // Toolbar regenerated with all expected controls
  check('8 tools + crop rendered', await page.locator('.tool-btn').count() === 9);
  check('8 swatches', await page.locator('.swatch').count() === 8);
  check('5 sizes', await page.locator('.size-btn').count() === 5);
  check('default size is L', await page.locator('.size-btn[data-size="L"]').evaluate(el => el.classList.contains('active')));
  check('gear menu present', await page.locator('#gearBtn').count() === 1);
  check('copy button present', await page.locator('#copyBtn').count() === 1);
  check('download button present', await page.locator('#downloadBtn').count() === 1);
  check('download disabled before image', await page.locator('#downloadBtn').isDisabled());

  // Load an image via synthetic paste
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 620;
    const g = c.getContext('2d'); g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, 1000, 620);
    g.fillStyle = '#d3d8e0';
    for (let y = 60; y < 620; y += 60) g.fillRect(40, y, 920, 26);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 's.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
  });
  await page.waitForSelector('#canvasWrap', { state: 'visible' });
  check('image loaded (canvas 1000x620)', JSON.stringify(await baseSize(page)) === '{"w":1000,"h":620}');
  check('download enabled after image', await page.locator('#downloadBtn').isEnabled());

  const blank = await baseData(page);
  const box0 = await page.locator('#overlay').boundingBox();
  const scale = await page.evaluate(() => {
    const o = document.getElementById('overlay');
    const r = o.getBoundingClientRect();
    return { sx: o.width / r.width, sy: o.height / r.height };
  });
  const sample = (ox, oy) => page.evaluate(({ ox, oy }) => {
    const c = document.getElementById('base');
    const d = c.getContext('2d').getImageData(Math.round(ox), Math.round(oy), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, { ox, oy });
  const rgbDist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  // Line: shortcut, Shift snap (level + upright), undo/redo
  await page.keyboard.press('l');
  check('L selects line', await page.locator('.tool-btn.active').getAttribute('data-tool') === 'line');
  await page.click('.size-btn[data-size="L"]');
  await page.keyboard.down('Shift');
  await page.mouse.move(box0.x + 400, box0.y + 450);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box0.x + 400 + i * 25, box0.y + 450 + i * 4);
  await page.mouse.up();
  const hx = 500 * scale.sx, hy = 450 * scale.sy;
  const onLine = await sample(hx, hy);
  const offLine = await sample(hx, hy + 22);
  check('shift snaps a line level', onLine[0] > 200 && onLine[1] < 120 && offLine[1] > 160);
  await page.keyboard.up('Shift');
  const lined = await baseData(page);
  await page.keyboard.press('Meta+z');
  check('undo removes the line', await baseData(page) === blank);
  await page.keyboard.press('Meta+Shift+z');
  check('redo restores the line', await baseData(page) === lined);
  await page.mouse.click(box0.x + 500, box0.y + 450);
  await page.keyboard.press('Backspace');
  check('delete removes the selected line', await baseData(page) === blank);
  await page.keyboard.press('Meta+z');
  check('undo restores the deleted line', await baseData(page) === lined);
  await page.keyboard.press('Meta+z');

  await page.keyboard.down('Shift');
  await page.mouse.move(box0.x + 120, box0.y + 400);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box0.x + 120 + i * 4, box0.y + 400 + i * 22);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const vx = 120 * scale.sx, vy = 490 * scale.sy;
  const onVert = await sample(vx, vy);
  const offVert = await sample(vx + 28, vy);
  check('shift snaps a line upright', onVert[0] > 200 && onVert[1] < 120 && offVert[1] > 160);
  await page.keyboard.press('Meta+z');
  check('line tests restored the image', await baseData(page) === blank);

  // Highlighter: yellow by default, even color where one stroke overlaps itself,
  // and a picked color sticks to the highlighter only.
  await page.keyboard.press('h');
  check('H selects highlighter', await page.locator('.tool-btn.active').getAttribute('data-tool') === 'highlighter');
  check('highlighter defaults to yellow', await page.locator('.swatch.active').getAttribute('data-color') === '#facc15');
  await page.click('.size-btn[data-size="L"]');
  await page.mouse.move(box0.x + 80, box0.y + 460);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box0.x + 80 + i * 78, box0.y + 460);
  for (let i = 1; i <= 8; i++) await page.mouse.move(box0.x + 704 - i * 43, box0.y + 460);
  await page.mouse.up();
  const once = await sample(200 * scale.sx, 460 * scale.sy);
  const twice = await sample(520 * scale.sx, 460 * scale.sy);
  check('highlighter is yellow', once[0] > 220 && once[1] > 190 && once[2] < 200 && once[1] > once[2] + 30);
  check('one highlighter stroke does not darken where it overlaps', rgbDist(once, twice) < 36);
  await page.locator('.swatch[data-color="#3b82f6"]').click();
  check('color picker changes the highlighter', await page.locator('.swatch.active').getAttribute('data-color') === '#3b82f6');
  await page.mouse.move(box0.x + 80, box0.y + 510);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box0.x + 80 + i * 40, box0.y + 510);
  await page.mouse.up();
  const blue = await sample(160 * scale.sx, 510 * scale.sy);
  check('highlighter uses the picked color', blue[2] > blue[0] + 30 && blue[2] > 210);
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  check('undo removes both highlighter strokes', await baseData(page) === blank);
  await page.keyboard.press('Meta+Shift+z');
  check('redo restores a highlighter stroke', await baseData(page) !== blank);
  await page.keyboard.press('Meta+z');
  check('undo after redo clears the highlighter', await baseData(page) === blank);
  await page.keyboard.press('p');
  check('pen keeps its own color', await page.locator('.swatch.active').getAttribute('data-color') === '#ef4444');
  await page.keyboard.press('h');
  check('highlighter remembers the picked color', await page.locator('.swatch.active').getAttribute('data-color') === '#3b82f6');
  await page.locator('.swatch[data-color="#facc15"]').click();
  await page.keyboard.press('p');

  // Draw every tool
  await draw(page, 'rect', 'L', [60, 60], [280, 200]);
  await draw(page, 'oval', 'L', [320, 60], [520, 200]);
  await draw(page, 'arrow', 'M', [560, 200], [740, 70]);
  await draw(page, 'sarrow', 'L', [770, 200], [950, 70]);
  await draw(page, 'pen', 'M', [60, 260], [260, 330]);
  await draw(page, 'line', 'L', [300, 330], [520, 330]);
  await draw(page, 'highlighter', 'L', [300, 280], [520, 280]);
  const box = await page.locator('#overlay').boundingBox();

  // Text with halo
  await page.click('.tool-btn[data-tool="text"]');
  await page.mouse.click(box.x + 580, box.y + 300);
  await page.waitForSelector('#textEditor');
  await page.locator('#textEditor').focus();
  await page.keyboard.type('Halo text');
  await page.keyboard.press('Enter');
  await page.keyboard.type('on two lines');
  check('Enter adds a newline and keeps editing',
    await page.inputValue('#textEditor') === 'Halo text\non two lines');
  await page.locator('#textEditor').blur();
  check('text editor commits on blur', await page.locator('#textEditor').count() === 0);

  // Escape commits text too; undo removes that committed text.
  const beforeEscapeText = await baseData(page);
  await page.mouse.click(box.x + 850, box.y + 500);
  await page.waitForSelector('#textEditor');
  await page.locator('#textEditor').focus();
  await page.keyboard.type('Escape commits');
  await page.keyboard.press('Escape');
  check('Escape commits text',
    await page.locator('#textEditor').count() === 0 && await baseData(page) !== beforeEscapeText);
  await page.keyboard.press('Meta+z');
  check('undo removes Escape-committed text', await baseData(page) === beforeEscapeText);

  const afterDraw = await baseData(page);
  check('7 shapes drawn (canvas changed)', afterDraw.length > 20000);
  await page.locator('#canvasWrap').screenshot({ path: OUT + '/site-1-all-tools.png' });

  // Size keyboard shortcut: press 2 -> M active
  await page.keyboard.press('2');
  check('digit shortcut selects size M', await page.locator('.size-btn[data-size="M"]').evaluate(el => el.classList.contains('active')));

  // Universal drag: grab the rect border with pen tool active, drag right
  await page.click('.tool-btn[data-tool="pen"]');
  await page.mouse.move(box.x + 60, box.y + 130);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(box.x + 60 + i * 20, box.y + 130);
  await page.mouse.up();
  check('drag changed canvas', await baseData(page) !== afterDraw);

  // Delete via keyboard (rect still selected)
  await page.keyboard.press('Backspace');

  // Undo x2 restores original drawing exactly
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Escape');
  check('undo(move+delete) restores pixels', await baseData(page) === afterDraw);

  // Hand-drawn via gear
  await page.hover('#gearBtn');
  await page.check('#handDrawnCb');
  await page.mouse.move(700, 700);
  const sketchData = await baseData(page);
  check('hand-drawn re-renders', sketchData !== afterDraw);
  await page.locator('#canvasWrap').screenshot({ path: OUT + '/site-2-handdrawn.png' });
  await page.hover('#gearBtn');
  await page.uncheck('#handDrawnCb');
  await page.mouse.move(700, 700);
  check('hand-drawn off restores', await baseData(page) === afterDraw);

  // ---- CROP ----
  await page.click('.tool-btn[data-tool="crop"]');
  // marquee around the rect area: content coords 40..560 x 30..350 (canvas is 1:1 at this window)
  await page.mouse.move(box.x + 40, box.y + 30);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(box.x + 40 + i * 104, box.y + 30 + i * 64);
  await page.mouse.up();
  await page.locator('#canvasWrap').screenshot({ path: OUT + '/site-3-crop-marquee.png' });
  await page.keyboard.press('Enter');
  const cropped = await baseSize(page);
  check('crop applied (canvas 520x320)', cropped.w === 520 && cropped.h === 320);
  await page.locator('#canvasWrap').screenshot({ path: OUT + '/site-4-cropped.png' });

  // Draw after crop, then undo back to full size
  await draw(page, 'pen', 'M', [40, 40], [140, 100]);
  await page.keyboard.press('Meta+z');   // undo pen
  await page.keyboard.press('Meta+z');   // undo crop
  const restored = await baseSize(page);
  check('undo restores full canvas', restored.w === 1000 && restored.h === 620);
  check('undo restores pixels after crop', await baseData(page) === afterDraw);
  // redo the crop
  await page.keyboard.press('Meta+Shift+z');
  const recropped = await baseSize(page);
  check('redo re-applies crop', recropped.w === 520 && recropped.h === 320);
  // crop again (successive crops compose)
  await page.keyboard.press('c');
  const box2 = await page.locator('#overlay').boundingBox();
  await page.mouse.move(box2.x + 20, box2.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(box2.x + 20 + i * 50, box2.y + 20 + i * 40);
  await page.mouse.up();
  await page.keyboard.press('Enter');
  const c2 = await baseSize(page);
  check('second crop applied (200x160)', c2.w === 200 && c2.h === 160);
  await page.keyboard.press('Meta+z');

  // Escape cancels a pending crop
  await page.keyboard.press('c');
  await page.mouse.move(box2.x + 30, box2.y + 30);
  await page.mouse.down();
  await page.mouse.move(box2.x + 200, box2.y + 150);
  await page.mouse.up();
  await page.keyboard.press('Escape');
  check('escape cancels crop (size unchanged)', (await baseSize(page)).w === 520);

  // Copy: toBlob path works on the cropped canvas
  const blobOk = await page.evaluate(() => new Promise(r => {
    document.getElementById('base').toBlob(b => r(!!b && b.size > 1000), 'image/png');
  }));
  check('toBlob works for copy', blobOk);
  const linePx = await sample(360, 300);
  const markPx = await sample(360, 250);
  check('cropped canvas still shows the line', linePx[0] > 200 && linePx[1] < 120);
  check('cropped canvas still shows the highlighter', markPx[0] > 220 && markPx[1] > 180 && markPx[2] < 200);

  // Download: same annotated pixels as the canvas, saved as markup.png
  const expectedB64 = await page.evaluate(() => new Promise((resolve, reject) => {
    document.getElementById('base').toBlob(b => {
      if (!b) { reject(new Error('toBlob failed')); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(b);
    }, 'image/png');
  }));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#downloadBtn'),
  ]);
  check('download filename is markup.png', download.suggestedFilename() === 'markup.png');
  const dest = path.join(OUT, 'site-download-markup.png');
  await download.saveAs(dest);
  const downloaded = fs.readFileSync(dest);
  check('download is a PNG', downloaded[0] === 0x89 && downloaded[1] === 0x50 && downloaded[2] === 0x4e && downloaded[3] === 0x47);
  check('download matches annotated canvas', downloaded.equals(Buffer.from(expectedB64, 'base64')));

  await page.click('#copyBtn');
  await page.waitForFunction(() => (document.getElementById('toastMsg') || {}).textContent === 'Copied to clipboard');
  const copyResult = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find(i => i.types.includes('image/png'));
    if (!item) return 'no-png:' + items.map(i => i.types.join('+')).join(',');
    const bmp = await createImageBitmap(await item.getType('image/png'));
    const base = document.getElementById('base');
    if (bmp.width !== base.width || bmp.height !== base.height) {
      return `size ${bmp.width}x${bmp.height} vs ${base.width}x${base.height}`;
    }
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const a = g.getImageData(0, 0, c.width, c.height).data;
    const b = base.getContext('2d').getImageData(0, 0, base.width, base.height).data;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return 'pixel-mismatch';
    return 'ok';
  });
  if (copyResult !== 'ok') console.log('copy result:', copyResult);
  check('copy puts the annotated PNG on the clipboard', copyResult === 'ok');

  const [shortcutDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+Shift+KeyS'),
  ]);
  check('shortcut downloads markup.png', shortcutDownload.suggestedFilename() === 'markup.png');

  // Persistence: reload keeps handDrawn/autoPaste checkbox states
  await page.hover('#gearBtn');
  await page.check('#autoPasteCb');
  await page.reload();
  check('autoPaste persisted', await page.locator('#autoPasteCb').isChecked());

  console.log('page errors:', errors.length ? errors : 'none');
  if (errors.length) fails.push('page errors');
  console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL PASS');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
