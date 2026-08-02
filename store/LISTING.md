# Chrome Web Store submission kit

Everything needed to publish the extension **unlisted** so it runs without
Developer mode. The upload artifact is `public/markup-extension.zip`
(rebuild with `npm run zip` if the code changed).

## One-time setup (~10 min + a few days review)

1. Go to https://chrome.google.com/webstore/devconsole and sign in.
2. Pay the one-time $5 developer registration fee.
3. Click **New item** → upload `public/markup-extension.zip`.
4. Fill the listing from the sections below; upload the two screenshots in
   this folder and `extension/icons/icon128.png` as the store icon.
5. Under **Distribution → Visibility**, choose **Unlisted**.
6. Submit for review. When approved, install from your item's store link,
   then remove the load-unpacked copy and turn Developer mode off.

Updates later: bump `"version"` in extension/manifest.json, `npm run zip`,
upload the new zip in the dev console — installs update automatically.

## Listing fields

**Name:** Andrew's Markup — page annotator

**Summary (132 chars max):**
Draw on any web page — arrows, boxes, text with halo — then capture from the top to your lowest note, straight to the clipboard.

**Description:**
Press the button (or ⌥⇧M) and a markup toolbar appears over the page you're on. Draw with pen, highlighter, two arrow styles (including a Skitch-style tapered arrow), boxes, ovals, and text with a contrast halo that stays readable on any background. Annotations stick to the page — scroll and they stay where you drew them, and you can keep scrolling and drawing.

Press Capture (⇧⌘C) and the extension screenshots the page from the very top to just below your lowest annotation, with your drawings included, and puts the PNG on your clipboard — ready to paste anywhere.

Also: hand-drawn sketch mode, click any drawing to move or delete it, full undo/redo, 8 colors, 5 sizes with 1–5 keyboard shortcuts.

**Category:** Tools (or Productivity)

**Language:** English

## Privacy tab

- **Single purpose:** Annotate the current page and capture the annotated page as an image to the clipboard.
- **Permission justifications:**
  - `activeTab` — access the page only when the user clicks the extension button, to show the annotation toolbar and take the capture screenshots.
  - `scripting` — inject the annotation toolbar/canvas into the active tab on click.
  - `storage` — remember the user's hand-drawn style preference.
- **Data usage:** check "Website content" and "User activity" because page screenshots and drawing input are handled locally to provide the requested feature. Nothing is transmitted to the developer or third parties. Certify all three limited-use disclosures.
- **Remote code:** none — all code ships in the package.
- **Privacy policy:** https://markup.codeshiftagent.com/privacy.html

## Assets

- `store-shot-1.png`, `store-shot-2.png` — 1280×800 screenshots (toolbar over a page; annotations staying anchored after scrolling)
- Store icon: `extension/icons/icon128.png`
