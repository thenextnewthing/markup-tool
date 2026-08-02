/* Full regression of the markup website (split shared-core version + crop).
 * Drives file://…/public/index.html in headless Chromium. */
const { chromium } = require('playwright');
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
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE);

  // Toolbar regenerated with all expected controls
  check('7 tools + crop rendered', await page.locator('.tool-btn').count() === 8);
  check('8 swatches', await page.locator('.swatch').count() === 8);
  check('5 sizes', await page.locator('.size-btn').count() === 5);
  check('default size is L', await page.locator('.size-btn[data-size="L"]').evaluate(el => el.classList.contains('active')));
  check('gear menu present', await page.locator('#gearBtn').count() === 1);
  check('copy button present', await page.locator('#copyBtn').count() === 1);

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

  // Draw every tool
  await draw(page, 'rect', 'L', [60, 60], [280, 200]);
  await draw(page, 'oval', 'L', [320, 60], [520, 200]);
  await draw(page, 'arrow', 'M', [560, 200], [740, 70]);
  await draw(page, 'sarrow', 'L', [770, 200], [950, 70]);
  await draw(page, 'pen', 'M', [60, 260], [260, 330]);
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
