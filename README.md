# Cityflo Driver E-Sign (GitHub Pages Frontend)

Static signing page hosted on GitHub Pages. Talks to an Apps Script API for saving PDFs to Drive + updating the tracker Sheet.

## Files
- `index.html` — main signing UI (Hindi)
- `style.css` — responsive styles (mobile / tablet / desktop)
- `app.js` — PDF stamping + API call
- `agreement.pdf` — template document
- `logo.png` — Cityflo logo

## Setup

### 1. Apps Script (API)
1. [script.google.com](https://script.google.com) → New Project → name `Cityflo Driver ESign API`
2. Paste `../Code.gs` into the default file
3. Delete any `index.html` template (not needed for API-only mode)
4. Run `setupCheck` once → approve permissions → verify ✓ Sheet + ✓ Folder
5. **Deploy** → **Web app** → Execute as: Me, Access: **Anyone** → copy the `/exec` URL

### 2. Wire the API URL into the frontend
Open `app.js` and set the first line:
```js
const API_URL = 'https://script.google.com/.../exec';
```

### 3. Push to GitHub Pages
```bash
cd /Users/pranav/Documents/Cityflo/DriverESign/github-pages
git init
git add .
git commit -m "Initial driver e-sign site"
git branch -M main
git remote add origin git@github.com:<your-user>/driver-esign.git
git push -u origin main
```
Then in the repo Settings → **Pages** → Source: `main` branch / root → Save.
Site will be live at `https://<your-user>.github.io/driver-esign/`

### 4. Driver link format
```
https://<your-user>.github.io/driver-esign/?mobile=9876543210
```

## How it works
1. Driver opens link → reads PDF in preview
2. Types name + mobile → ticks consent
3. Browser (PDF-Lib) stamps signature into agreement.pdf
4. Signed PDF (base64) sent to Apps Script via POST
5. Apps Script saves to Drive folder + updates Sheet row
6. Driver sees download button for the signed copy

## Testing locally
Static files need a local server (not `file://` because of CORS):
```bash
cd github-pages
python3 -m http.server 8000
# open http://localhost:8000
```

## Stamp coordinate adjustment
Edit `app.js` inside the `signPDF()` function — all `page.drawText({ x, y, ... })` calls.
PDF origin is **bottom-left**, so `y: height - 128` means 128pt from the top.
