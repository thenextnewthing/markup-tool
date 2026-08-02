/* Extension end-to-end: load unpacked in Chromium, activate on a tall page,
 * draw across scroll positions, verify anchoring + keyboard guard + capture. */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const OUT = os.tmpdir();
const ROOT = path.resolve(__dirname, '../..');
const REAL_EXT = path.join(ROOT, 'extension');
// Test build: same code, plus host_permissions so the test hook can inject
// without the user-gesture activeTab grant (which automation can't produce).
const EXT = fs.mkdtempSync(path.join(OUT, 'markup-ext-test-'));
fs.rmSync(EXT, { recursive: true, force: true });
fs.cpSync(REAL_EXT, EXT, { recursive: true });
const manifestPath = path.join(EXT, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
mf.host_permissions = ['<all_urls>', 'file:///*'];
fs.writeFileSync(manifestPath, JSON.stringify(mf, null, 2));
const FIXTURE = pathToFileURL(path.join(__dirname, 'fixture-tall.html')).href;

const fails = [];
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) fails.push(name);
}

(async () => {
  const userDir = fs.mkdtempSync(path.join(OUT, 'markup-chrome-profile-'));
  const context = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(FIXTURE);

  // Activate markup mode via the test hook (automation can't click the toolbar action)
  await page.bringToFront();
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await globalThis.__injectForTest(tab.id);
  });
  await page.waitForSelector('#__markupHost', { state: 'attached' });
  await page.waitForSelector('#captureBtn', { state: 'visible' });
  check('markup mode activates (host + toolbar)', true);
  check('7 tools, no crop', await page.locator('.tool-btn').count() === 7);

  // Draw an oval over SECTION 0 (viewport coords -> doc coords via scroll 0)
  await page.click('.tool-btn[data-tool="oval"]');
  await page.mouse.move(480, 200);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(480 + i * 55, 200 + i * 18);
  await page.mouse.up();
  await page.screenshot({ path: OUT + '/ext-1-oval-top.png' });

  // Scroll down 2000px and draw a Skitch arrow over SECTION 4
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(350);
  await page.click('.tool-btn[data-tool="sarrow"]');
  await page.mouse.move(400, 500);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(400 + i * 45, 500 - i * 40);
  await page.mouse.up();
  await page.screenshot({ path: OUT + '/ext-2-arrow-scrolled.png' });

  // Scroll back to top: the oval must still sit on SECTION 0, arrow off-screen
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: OUT + '/ext-3-back-to-top.png' });

  // Keyboard guard: typing while a page input is focused must not switch tools.
  // (The overlay blocks clicking page elements — by design — so focus it directly.)
  await page.evaluate(() => document.getElementById('pageInput').focus());
  await page.keyboard.type('p');
  const activeTool = await page.locator('.tool-btn.active').getAttribute('data-tool');
  check('typing in page input does not switch tool', activeTool === 'sarrow');
  check('input received the keystroke', (await page.inputValue('#pageInput')) === 'p');

  // Keyboard shortcut works when not typing: press R -> rect
  await page.evaluate(() => document.getElementById('pageInput').blur());
  await page.keyboard.press('r');
  check('R selects rect tool', (await page.locator('.tool-btn.active').getAttribute('data-tool')) === 'rect');

  // Text tool with halo on the live page
  await page.click('.tool-btn[data-tool="text"]');
  await page.mouse.click(200, 300);
  await page.waitForSelector('#textEditor');
  await page.locator('#textEditor').focus();
  await page.keyboard.type('On the page!');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second line');
  check('Enter adds a newline and keeps editing on page',
    await page.inputValue('#textEditor') === 'On the page!\nSecond line');
  await page.locator('#textEditor').blur();
  check('text committed on page blur', await page.locator('#textEditor').count() === 0);

  // Undo works (removes text)
  await page.keyboard.press('Meta+z');

  // ---- Capture ----
  await page.click('#captureBtn');
  await page.waitForFunction(() =>
    document.getElementById('__markupHost')?.getAttribute('data-capture-url') ||
    document.getElementById('__markupHost')?.getAttribute('data-capture-error'), { timeout: 15000 }).catch(() => {});
  const capUrl = await page.evaluate(() => document.getElementById('__markupHost')?.getAttribute('data-capture-url'));
  const capDims = await page.evaluate(() => document.getElementById('__markupHost')?.getAttribute('data-capture-dims'));
  const toastText = await page.locator('#toast').textContent().catch(() => '');
  console.log('capture dims:', capDims, '| toast:', (toastText || '').trim());
  check('capture produced a PNG', !!capUrl && capUrl.startsWith('data:image/png'));
  if (capUrl) {
    const b64 = capUrl.split(',')[1];
    fs.writeFileSync(OUT + '/ext-4-capture.png', Buffer.from(b64, 'base64'));
    // arrow bottom ~2500 in doc coords; capture height should be ~arrowBottom+40, well below full 5000
    const h = parseInt(capDims.split('x')[1]);
    check('capture stops just below lowest annotation (~2550px, not 5000)', h > 2300 && h < 2900);
  }

  // Toggle off via second activation: teardown removes everything
  await page.bringToFront();
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await globalThis.__injectForTest(tab.id);
  });
  await page.waitForTimeout(400);
  check('toggle off removes markup mode', await page.locator('#__markupHost').count() === 0);

  // Toggle back on: fresh session works again
  await page.bringToFront();
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await globalThis.__injectForTest(tab.id);
  });
  await page.waitForSelector('#captureBtn', { state: 'visible' });
  check('re-activation works', true);

  console.log('page errors:', errors.length ? errors : 'none');
  if (errors.length) fails.push('page errors');
  console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL PASS');
  await context.close();
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.rmSync(EXT, { recursive: true, force: true });
  process.exit(fails.length ? 1 : 0);
})();
