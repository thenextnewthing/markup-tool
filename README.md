# Andrew's Markup

Paste a screenshot, draw on it, and copy or download the result.

Use a pen, highlighter, arrows, text, or boxes. There is also a Chrome extension that lets you draw on any live web page and capture that section.

## What you can do

- Draw with a pen, highlighter, arrows, boxes, ovals, and text
- Crop the picture to just the part you want
- Copy the result, or download it as a PNG
- Undo a mistake, or start over
- Pick from eight colors and five sizes
- Switch on a hand-drawn look — sketchy, a little wobbly. Turn it on from the gear menu and everything you’ve already drawn updates too
- Click anything you’ve drawn to move or delete it
- Type notes that stay readable on any background

On the website, a screenshot on your clipboard can load itself when you open or come back to the tab. That’s in the gear menu. You can also drop an image file onto the page.

With the Chrome extension, your drawings stay on the part of the page you marked, even if you scroll. Capture takes a picture from the top of the page down to just below your lowest note, and puts it on your clipboard.

A few shortcuts, if you want them: **P** pen, **H** highlighter, **A** arrow, **T** text, **R** box, **C** crop. **⌘Z** undoes. **⇧⌘C** copies. **⇧⌘S** downloads.

## Try the website

In this folder, run `npm ci` and then `npm run sync`. That sets things up once. Then open `public/index.html` in your browser, paste a screenshot, and start drawing.

## Try the Chrome extension

After that same one-time setup:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension` folder in this repo.
3. Pin **Andrew's Markup**, then click it on any page to start drawing. Click it again, or press Esc, to leave.

It only looks at the page after you click the button. It remembers whether you like the hand-drawn look.

## If you want to change the code

Edit the files in `shared/`. Run `npm run sync` so the website and the extension pick up your changes. Run `npm test` to check that things still work.
