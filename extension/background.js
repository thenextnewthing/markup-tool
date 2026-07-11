/* Service worker: injects/toggles markup mode on the active tab and takes the
 * per-viewport shots the content script stitches into the full capture. */

async function inject(tabId) {
  // If the content script is already there, this toggles it off.
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'mk-toggle' });
    if (res && res.ok) return;
  } catch (e) {
    // no listener in the tab yet -> first activation, fall through to inject
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['shared/markup-core.js', 'shared/toolbar.js', 'content.js'],
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const url = tab.url || '';
  if (!/^(https?|file):/.test(url)) {
    // chrome://, web store, etc. — nothing we can draw on
    await chrome.action.setBadgeText({ tabId: tab.id, text: '✕' });
    await chrome.action.setTitle({ tabId: tab.id, title: "Markup can't run on this page (browser-internal pages are off limits)" });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 2500);
    return;
  }
  await inject(tab.id);
});

// Test hook so automated checks can activate markup mode without clicking
// the toolbar action (which automation cannot reach).
globalThis.__injectForTest = inject;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'mk-shot' && sender.tab) {
    // activeTab (granted by the button click) authorizes captureVisibleTab
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true; // async response
  }
});
