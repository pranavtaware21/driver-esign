// ─── CONFIG ──────────────────────────────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbyqpO-yFZT3aZvxluNAtIZEdZQ58wr3-CKg9H0Y0qp2c4o1SsMTepdY8pfEKq1wXsEOJg/exec';

// ─── ELEMENTS ────────────────────────────────────────────────────────────
const nameInp = document.getElementById('name');
const mobInp  = document.getElementById('mobile');
const errBox  = document.getElementById('err');
const signBtn = document.getElementById('signBtn');
const canvas  = document.getElementById('sigCanvas');

// ─── SIGNATURE PAD ───────────────────────────────────────────────────────
const sigPad = new SignaturePad(canvas, {
  penColor: '#0b3a8a',
  backgroundColor: 'rgba(0,0,0,0)',
  minWidth: 1.2, maxWidth: 2.8, velocityFilterWeight: 0.6,
});
function resizeCanvas() {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const data = sigPad.toData();
  canvas.width  = canvas.offsetWidth  * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext('2d').scale(ratio, ratio);
  sigPad.clear();
  if (data) sigPad.fromData(data);
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
resizeCanvas();
document.getElementById('clearSig').addEventListener('click', () => sigPad.clear());

// ─── URL PREFILL ─────────────────────────────────────────────────────────
const urlMobile = new URLSearchParams(location.search).get('mobile') || '';
if (urlMobile) mobInp.value = urlMobile;

let userIP = '';
fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => userIP = d.ip).catch(() => {});

// ─── PRELOAD FONTS + LOGO ────────────────────────────────────────────────
let _devReg, _devBold, _logoBytes;
Promise.all([
  fetch('NotoSansDevanagari-Regular.ttf').then(r => r.arrayBuffer()).then(b => _devReg = b),
  fetch('NotoSansDevanagari-Bold.ttf').then(r => r.arrayBuffer()).then(b => _devBold = b),
  fetch('logo.png').then(r => r.arrayBuffer()).then(b => _logoBytes = b),
]).catch(() => {});

// ─── WORD WRAP ───────────────────────────────────────────────────────────
function wrapLines(text, font, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapLinesMixed(text, measure, size, maxWidth, bold = false) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? line + ' ' + w : w;
    if (measure(trial, size, bold) <= maxWidth) line = trial;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// ─── BUILD PDF ───────────────────────────────────────────────────────────
async function buildSignedPDF({ name, mobile }) {
  if (!_devReg)    _devReg    = await fetch('NotoSansDevanagari-Regular.ttf').then(r => r.arrayBuffer());
  if (!_devBold)   _devBold   = await fetch('NotoSansDevanagari-Bold.ttf').then(r => r.arrayBuffer());
  if (!_logoBytes) _logoBytes = await fetch('logo.png').then(r => r.arrayBuffer());

  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const fR = await pdf.embedFont(_devReg,  { subset: true });
  const fB = await pdf.embedFont(_devBold, { subset: true });
  const fL  = await pdf.embedFont(StandardFonts.Helvetica);
  const fLB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(_logoBytes);

  // ── Mixed-script rendering: Devanagari runs use Noto, Latin runs use Helvetica
  const isDev = (ch) => {
    const c = ch.codePointAt(0);
    return (c >= 0x0900 && c <= 0x097F) || (c >= 0xA8E0 && c <= 0xA8FF);
  };
  const isLetter = (ch) => /\p{L}/u.test(ch);
  const splitRuns = (text) => {
    const runs = [];
    let cur = '', curDev = null;
    for (const ch of [...text]) {
      if (!isLetter(ch)) {
        if (curDev === null) { cur = ch; curDev = true; } else cur += ch;
      } else {
        const dev = isDev(ch);
        if (curDev === null) { cur = ch; curDev = dev; }
        else if (dev === curDev) cur += ch;
        else { runs.push({ t: cur, dev: curDev }); cur = ch; curDev = dev; }
      }
    }
    if (cur) runs.push({ t: cur, dev: curDev === null ? true : curDev });
    return runs;
  };
  const pickFont = (dev, bold) => dev ? (bold ? fB : fR) : (bold ? fLB : fL);
  const measureMixed = (text, size, bold = false) => {
    let w = 0;
    for (const r of splitRuns(text)) w += pickFont(r.dev, bold).widthOfTextAtSize(r.t, size);
    return w;
  };
  const drawMixed = (text, { x, y, size, bold = false, color }) => {
    let cx = x;
    for (const r of splitRuns(text)) {
      const f = pickFont(r.dev, bold);
      page.drawText(r.t, { x: cx, y, size, font: f, color });
      cx += f.widthOfTextAtSize(r.t, size);
    }
  };

  // Palette — matches the HTML mock
  const ink      = rgb(0.10, 0.10, 0.10);
  const brand    = rgb(0.118, 0.302, 0.482);   // #1e4d7b
  const brandLt  = rgb(0.788, 0.867, 0.933);   // #c9ddee
  const muted    = rgb(0.33, 0.33, 0.33);
  const noticeBg = rgb(0.949, 0.973, 0.992);   // #f2f8fd
  const stepBg   = rgb(0.984, 0.914, 0.843);   // #fbe9d7
  const stepAcc  = rgb(0.851, 0.447, 0.212);   // #d97236
  const stepTxt  = rgb(0.635, 0.294, 0.078);   // #a24b14
  const ackBg    = rgb(1.0, 0.973, 0.910);     // #fff8e8
  const ackAcc   = rgb(0.878, 0.655, 0.188);   // #e0a730
  const white    = rgb(1, 1, 1);
  const gray     = rgb(0.8, 0.8, 0.8);
  // Green (Salary section)
  const goodBg   = rgb(0.863, 0.988, 0.906);   // #dcfce7
  const goodAcc  = rgb(0.086, 0.639, 0.290);   // #16a34a
  const goodTxt  = rgb(0.086, 0.396, 0.204);   // #166534
  const goodCard = rgb(0.941, 0.992, 0.957);   // #f0fdf4
  const goodBorder = rgb(0.733, 0.969, 0.816); // #bbf7d0
  // Orange (Penalty section)
  const warnBg   = rgb(1.000, 0.929, 0.835);   // #ffedd5
  const warnAcc  = rgb(0.918, 0.345, 0.047);   // #ea580c
  const warnTxt  = rgb(0.604, 0.204, 0.071);   // #9a3412
  const warnSect = rgb(1.000, 0.969, 0.929);   // #fff7ed
  const warnBorder = rgb(0.996, 0.843, 0.667); // #fed7aa
  const severeBg = rgb(0.996, 0.886, 0.886);   // #fee2e2
  const severeTxt = rgb(0.725, 0.110, 0.110);  // #b91c1c

  const PG = [612, 842];  // A4-ish width Letter tall — more room
  const W = PG[0], H = PG[1], M = 50;
  let page = pdf.addPage(PG);
  let y = H - M;

  const newPageIfNeeded = (need) => {
    if (y - need < 60) {
      page = pdf.addPage(PG);
      y = H - M;
    }
  };

  // ── Header ─────────────────────────────────────────────────────────────
  const logoScale = logo.scale(0.16);
  page.drawImage(logo, { x: W - M - logoScale.width, y: y - logoScale.height + 10, width: logoScale.width, height: logoScale.height });

  y -= 18;
  const titleSize = 20;
  const titleText = 'ड्राइवर एग्रीमेंट';
  const titleW = fB.widthOfTextAtSize(titleText, titleSize);
  page.drawText(titleText, { x: (W - titleW) / 2, y, size: titleSize, font: fB, color: brand });
  y -= titleSize + 4;

  const subtitle = 'Cityflo ड्राइवर नियम और ज़िम्मेदारियाँ';
  const subW = measureMixed(subtitle, 12);
  drawMixed(subtitle, { x: (W - subW) / 2, y, size: 12, color: muted });
  y -= 18;
  page.drawLine({ start: {x: M, y}, end: {x: W - M, y}, thickness: 1, color: brandLt });
  y -= 22;

  // ── Step badge (themeable) ────────────────────────────────────────────
  const drawStepBadge = (text, theme = 'orange') => {
    const t = theme === 'green'  ? { bg: goodBg, acc: goodAcc, txt: goodTxt }
            : theme === 'warn'   ? { bg: warnBg, acc: warnAcc, txt: warnTxt }
            :                      { bg: stepBg, acc: stepAcc, txt: stepTxt };
    newPageIfNeeded(40);
    page.drawRectangle({ x: M, y: y - 8, width: W - 2*M, height: 22, color: t.bg });
    page.drawRectangle({ x: M, y: y - 8, width: 4, height: 22, color: t.acc });
    drawMixed(text, { x: M + 12, y: y - 2, size: 11, bold: true, color: t.txt });
    y -= 30;
  };

  // ── Helper: paragraph ─────────────────────────────────────────────────
  const drawParagraph = (text, { size = 10, color = ink, lineH = 14, leftPad = 0, rightPad = 0, bold = false } = {}) => {
    const maxW = W - 2*M - leftPad - rightPad;
    const lines = wrapLinesMixed(text, measureMixed, size, maxW, bold);
    newPageIfNeeded(lines.length * lineH + 4);
    for (const ln of lines) {
      drawMixed(ln, { x: M + leftPad, y, size, bold, color });
      y -= lineH;
    }
  };

  // ── Helper: bullet list (•) ───────────────────────────────────────────
  const drawBulletList = (items, { size = 10, color = ink, lineH = 14, leftPad = 16, accent = brand } = {}) => {
    for (const it of items) {
      const lines = wrapLinesMixed(it, measureMixed, size, W - 2*M - leftPad - 12);
      newPageIfNeeded(lines.length * lineH + 4);
      // dot
      page.drawCircle({ x: M + leftPad - 8, y: y + 3, size: 1.6, color: accent });
      lines.forEach((ln, j) => {
        drawMixed(ln, { x: M + leftPad, y: y - j * lineH, size, color });
      });
      y -= lines.length * lineH + 2;
    }
  };

  // ── Helper: card box with header + bullets ────────────────────────────
  const drawCard = (header, items, { headerColor = goodTxt, accent = goodAcc, bg = white, border = goodBorder } = {}) => {
    const padX = 12, padTop = 10, padBot = 10, headerSize = 11, itemSize = 10, lineH = 14;
    // Pre-measure
    const headerLines = wrapLinesMixed(header, measureMixed, headerSize, W - 2*M - 2*padX, true);
    let bodyH = 0;
    const itemWraps = items.map(it => {
      const ws = wrapLinesMixed(it, measureMixed, itemSize, W - 2*M - 2*padX - 14);
      bodyH += ws.length * lineH + 2;
      return ws;
    });
    const cardH = padTop + headerLines.length * (headerSize + 4) + 6 + bodyH + padBot;
    newPageIfNeeded(cardH + 8);
    page.drawRectangle({ x: M, y: y - cardH, width: W - 2*M, height: cardH, color: bg, borderColor: border, borderWidth: 0.6 });
    page.drawRectangle({ x: M, y: y - cardH, width: 4, height: cardH, color: accent });
    let cy = y - padTop - headerSize + 2;
    for (const hl of headerLines) {
      drawMixed(hl, { x: M + padX, y: cy, size: headerSize, bold: true, color: headerColor });
      cy -= headerSize + 4;
    }
    cy -= 4;
    for (const ws of itemWraps) {
      page.drawCircle({ x: M + padX + 4, y: cy + 3, size: 1.6, color: accent });
      ws.forEach((ln, j) => drawMixed(ln, { x: M + padX + 14, y: cy - j * lineH, size: itemSize, color: ink }));
      cy -= ws.length * lineH + 2;
    }
    y -= cardH + 10;
  };

  // ── Helper: penalty table ─────────────────────────────────────────────
  const drawTable = (headers, rows, colWidths) => {
    const padX = 8, padY = 6, headerH = 22, rowMinH = 22;
    const fontSize = 9, lineH = 12;
    // Phase header was drawn before; this just draws the table
    const tableW = colWidths.reduce((a, b) => a + b, 0);
    const startX = M;

    // Header row
    newPageIfNeeded(headerH + rowMinH);
    page.drawRectangle({ x: startX, y: y - headerH, width: tableW, height: headerH, color: warnBg, borderColor: warnBorder, borderWidth: 0.5 });
    let cx = startX;
    for (let i = 0; i < headers.length; i++) {
      drawMixed(headers[i], { x: cx + padX, y: y - headerH + padY + 2, size: fontSize + 0.5, bold: true, color: warnTxt });
      cx += colWidths[i];
    }
    y -= headerH;

    // Body rows
    rows.forEach((row, ri) => {
      // Pre-measure each cell
      const cellLines = row.map((cell, i) => wrapLinesMixed(String(cell.text ?? cell), measureMixed, fontSize, colWidths[i] - 2*padX));
      const rowH = Math.max(rowMinH, padY * 2 + Math.max(...cellLines.map(l => l.length)) * lineH);
      newPageIfNeeded(rowH + 4);
      const altBg = (ri % 2 === 1) ? warnSect : white;
      page.drawRectangle({ x: startX, y: y - rowH, width: tableW, height: rowH, color: altBg, borderColor: warnBorder, borderWidth: 0.4 });
      let cx2 = startX;
      for (let i = 0; i < row.length; i++) {
        const cell = row[i];
        const isAmt = cell && (cell.amt || cell.severe);
        const isSevere = cell && cell.severe;
        const lines = cellLines[i];
        // For severe amount, draw colored bg behind text
        if (isSevere) {
          page.drawRectangle({ x: cx2 + 4, y: y - rowH + 4, width: colWidths[i] - 8, height: rowH - 8, color: severeBg });
        }
        const txtColor = isSevere ? severeTxt : (isAmt ? rgb(0.760, 0.255, 0.047) : ink);
        const tLeft = cx2 + padX;
        lines.forEach((ln, j) => {
          if (isAmt) {
            // right-align (or center for severe)
            const w = measureMixed(ln, fontSize, isAmt);
            const x = isSevere ? cx2 + (colWidths[i] - w) / 2 : cx2 + colWidths[i] - padX - w;
            drawMixed(ln, { x, y: y - padY - (j+1) * lineH + 4, size: fontSize, bold: true, color: txtColor });
          } else {
            drawMixed(ln, { x: tLeft, y: y - padY - (j+1) * lineH + 4, size: fontSize, color: txtColor });
          }
        });
        cx2 += colWidths[i];
      }
      y -= rowH;
    });
    y -= 10;
  };

  // ════════════════════════════════════════════════════════════════════
  // ── STEP 1 : SALARY INCREMENT (खुशखबरी) ──────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  drawStepBadge('स्टेप 1 : खुशखबरी — वेतन वृद्धि (Salary Increment)', 'green');

  drawParagraph('Cityflo Mumbai परिवार के प्यारे ड्राइवर साथियों,', { size: 11, bold: true, color: goodTxt, lineH: 16 });
  y -= 4;
  drawParagraph('आप सब हमारे लिए बहुत खास हैं। रोज़ सुबह समय पर निकलना, यात्रियों को सुरक्षित और आराम से उनकी मंज़िल तक पहुंचाना, यह आपकी मेहनत और लगन का नतीजा है। आज Cityflo जहाँ है, वहाँ आपकी वजह से है।', { size: 10, lineH: 14 });
  y -= 4;
  drawParagraph('आप सिर्फ बस नहीं चलाते, आप हर दिन हज़ारों लोगों की ज़िंदगी आसान बनाते हैं। आपकी यह मेहनत हमारे लिए बहुत कीमती है।', { size: 10, lineH: 14 });
  y -= 4;
  drawParagraph('इसी वजह से Cityflo ने आपके लिए एक खास फैसला लिया है।', { size: 10, lineH: 14 });
  y -= 8;

  drawCard('1. बेस सैलरी में बढ़ोतरी : ₹1,000', [
    'यह बढ़ोतरी सभी ड्राइवर साथियों को मिलेगी।',
    'अप्रैल 2026 की सैलरी से लागू होगी।',
  ]);

  drawCard('2. लॉयल्टी वेतन बढ़ोतरी : ₹1,000', [
    'Cityflo के साथ एक पूरा साल काम करने पर ₹1,000 की बढ़ोतरी मिलेगी।',
    'शर्त केवल एक है : उस साल में छुट्टियाँ 18 दिन से कम होनी चाहिए।',
    'अगर छुट्टियाँ 18 दिन से ज़्यादा हो गईं, तो उस साल की ₹1,000 बढ़ोतरी नहीं मिलेगी और सैलरी वहीं रहेगी जहाँ थी। सैलरी बेस से शुरू नहीं होगी, पिछली सैलरी पर ही काम जारी रहेगा।',
    'फिर अगली ₹1,000 बढ़ोतरी के लिए एक और पूरा साल काम करना होगा, और उस साल 18 दिन से कम छुट्टी रखनी होगी।',
  ]);

  drawCard('उदाहरण से समझिए (तीन साल का हिसाब)', [
    'पहला साल (अप्रैल 2026) : बेस सैलरी + ₹1,000 (नई बढ़ोतरी)',
    'दूसरा साल (अप्रैल 2027) : पिछले साल की सैलरी + ₹1,000 लॉयल्टी बढ़ोतरी',
    'तीसरा साल (अप्रैल 2028) : पिछले साल की सैलरी + ₹1,000 लॉयल्टी बढ़ोतरी',
  ], { bg: goodCard, border: goodAcc });

  drawCard('3. नए ड्राइवर साथियों के लिए', [
    'शुरुआत बेस सैलरी से होगी।',
    'एक पूरा साल काम करने पर ऊपर बताई गई शर्त के साथ ₹1,000 की लॉयल्टी बढ़ोतरी मिलेगी।',
  ]);

  // Note box (amber)
  const noteText = 'नोट : इस वेतन बढ़ोतरी के साथ अब आपकी ज़िम्मेदारी भी बढ़ेगी। सिटीफ्लो अपने ग्राहकों को दी जाने वाली सेवाओं में लगातार सुधार कर रहा है। सिटीफ्लो के ड्राइवर के रूप में आप हमारी सफलता में महत्वपूर्ण भूमिका निभाते रहेंगे। हम अपने ड्राइवरों से अपेक्षा करते हैं कि वे भरोसेमंद और बेहद सुरक्षित सेवा बनाए रखें। सिटीफ्लो के ड्राइवरों से अपेक्षित दिशानिर्देशों का सख्ती से पालन करने की उम्मीद है।';
  const noteWrap = wrapLinesMixed(noteText, measureMixed, 10, W - 2*M - 24);
  const noteBoxH = noteWrap.length * 14 + 16;
  newPageIfNeeded(noteBoxH + 8);
  page.drawRectangle({ x: M, y: y - noteBoxH, width: W - 2*M, height: noteBoxH, color: ackBg });
  page.drawRectangle({ x: M, y: y - noteBoxH, width: 4, height: noteBoxH, color: ackAcc });
  let nty = y - 12;
  for (const ln of noteWrap) {
    drawMixed(ln, { x: M + 14, y: nty, size: 10, color: ink });
    nty -= 14;
  }
  y -= noteBoxH + 18;

  // ════════════════════════════════════════════════════════════════════
  // ── STEP 2 : AGREEMENT (existing) ────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  drawStepBadge('स्टेप 2 : एग्रीमेंट ध्यान से पढ़ें');

  // ── Notice box ────────────────────────────────────────────────────────
  const notice = [
    'ज़रूरी सूचना : ड्राइवर सीधे Cityflo के कर्मचारी नहीं हैं। ड्राइवर ऑपरेटर के साथ काम करते हैं। लेकिन सफर की सुरक्षा, साफ-सफाई और समय की पाबंदी बनाए रखने के लिए Cityflo कुछ नियम तय करता है और कुछ सुविधाएँ भी देता है।',
    'अगर कोई ड्राइवर इन नियमों का पालन नहीं करता, तो Cityflo को ज़रूरी कार्रवाई करने का पूरा हक़ है।',
  ];
  const noticeLines = [];
  for (const para of notice) noticeLines.push(...wrapLinesMixed(para, measureMixed, 10, W - 2*M - 24), '');
  noticeLines.pop(); // drop trailing empty
  const noticeH = noticeLines.length * 14 + 16;
  page.drawRectangle({ x: M, y: y - noticeH, width: W - 2*M, height: noticeH, color: noticeBg, borderColor: brandLt, borderWidth: 0.6 });
  let ny = y - 10;
  for (const ln of noticeLines) {
    if (ln) drawMixed(ln, { x: M + 12, y: ny, size: 10, color: ink });
    ny -= 14;
  }
  y -= noticeH + 14;

  // ── Section: मेरी ज़िम्मेदारियाँ ──────────────────────────────────────
  newPageIfNeeded(40);
  page.drawText('मेरी ज़िम्मेदारियाँ', { x: M, y, size: 14, font: fB, color: brand });
  y -= 4;
  page.drawLine({ start: {x: M, y: y - 2}, end: {x: W - M, y: y - 2}, thickness: 1.2, color: brandLt });
  y -= 16;

  const rules = [
    'मैंने Cityflo के सारे नियम और जुर्माने अच्छे से पढ़ लिए हैं और पूरी तरह समझ लिए हैं।',
    'यात्रा शुरू होने से पहले मैं अपनी बस तैयार रखूँगा, साफ यूनिफ़ॉर्म पहनूँगा, सीट बेल्ट लगाऊँगा, बस को साफ रखूँगा और ड्राइवर ऐप चालू रखूँगा।',
    'मैं हर शिफ्ट पर समय से पहले रिपोर्ट करूँगा। बिना पहले बताए कभी गैरहाज़िर नहीं रहूँगा।',
    'यात्रा के दौरान ड्राइवर ऐप पूरे समय चालू रहेगा। किसी यात्री को उसके स्टॉप पर छोड़कर नहीं जाऊँगा। तेज़ या लापरवाह ड्राइविंग नहीं करूँगा। मैनेजमेंट टीम के साथ पूरा सहयोग करूँगा।',
    'ड्राई रन (खाली बस) या किसी भी ट्रिप में बिना Cityflo टिकट वाले किसी भी व्यक्ति को बस में नहीं बिठाऊँगा। यह नियम मुझे पूरी तरह मंज़ूर है।',
    'यात्रा खत्म होने पर ड्राइवर ऐप में ट्रिप सही तरीके से बंद करूँगा, बस साफ छोड़ूँगा और अगर कोई यात्री सामान भूल जाए तो उसे मैनेजमेंट को बताकर यात्री तक वापस पहुँचाऊँगा।',
    'ड्यूटी के समय शराब, गुटखा, तंबाकू या किसी भी नशीली चीज़ का सेवन नहीं करूँगा और अपने पास भी नहीं रखूँगा।',
    'बस में लगे CCTV कैमरे की कोई छेड़छाड़ नहीं करूँगा।',
  ];
  const ruleIndent = 26;
  rules.forEach((rule, i) => {
    const wrapped = wrapLinesMixed(rule, measureMixed, 10.5, W - 2*M - ruleIndent);
    newPageIfNeeded(wrapped.length * 14 + 6);
    page.drawText(`${i + 1}.`, { x: M + 2, y, size: 11, font: fLB, color: brand });
    wrapped.forEach((ln, j) => {
      drawMixed(ln, { x: M + ruleIndent, y: y - j * 14, size: 10.5, color: ink });
    });
    y -= wrapped.length * 14 + 6;
  });

  y -= 8;

  // ── Acknowledgement box ──────────────────────────────────────────────
  newPageIfNeeded(100);
  const ackParas = [
    'स्वीकारोक्ति (Acknowledgement)',
    'मैंने Cityflo की वेतन वृद्धि की जानकारी, ड्राइवर की ज़िम्मेदारियाँ, और नियम उल्लंघन पर लगने वाले जुर्माने — तीनों बातें ध्यान से पढ़ी और समझी हैं।',
    'मुझे पता है कि नियम तोड़ने पर तय किया गया जुर्माना मेरी सैलरी से काट लिया जाएगा। अगर मामला गंभीर हो, तो मेरी सेवा भी समाप्त की जा सकती है।',
    'मैं अपनी मर्ज़ी से, बिना किसी दबाव के, इन सभी नियमों का पालन करने का वचन देता हूँ।',
  ];
  const ackLines = [];
  ackLines.push({ t: ackParas[0], bold: true });
  for (const p of ackParas.slice(1)) {
    for (const ln of wrapLinesMixed(p, measureMixed, 10, W - 2*M - 24)) ackLines.push({ t: ln });
    ackLines.push({ t: '' });
  }
  ackLines.pop();
  const ackH = ackLines.length * 14 + 16;
  page.drawRectangle({ x: M, y: y - ackH, width: W - 2*M, height: ackH, color: ackBg });
  page.drawRectangle({ x: M, y: y - ackH, width: 4, height: ackH, color: ackAcc });
  let ay = y - 10;
  for (const l of ackLines) {
    if (l.t) drawMixed(l.t, { x: M + 14, y: ay, size: l.bold ? 11 : 10, bold: !!l.bold, color: l.bold ? rgb(0.54, 0.35, 0) : ink });
    ay -= 14;
  }
  y -= ackH + 24;

  // ════════════════════════════════════════════════════════════════════
  // ── STEP 3 : DRIVER VIOLATIONS AND PENALTIES ─────────────────────────
  // ════════════════════════════════════════════════════════════════════
  drawStepBadge('स्टेप 3 : Driver Violations and Penalties (नियम उल्लंघन और जुर्माना)', 'warn');

  drawParagraph('Cityflo में हम अपने यात्रियों को एक सुरक्षित, समय पर चलने वाला और अच्छा सफर देना चाहते हैं। इसके लिए ज़रूरी है कि हर ड्राइवर तय किए गए नियमों का पालन करे।', { size: 10 });
  y -= 4;
  drawParagraph('नीचे दी गई सूची में वे नियम और उन पर लगने वाले जुर्माने बताए गए हैं। ये नियम यात्रा शुरू होने से पहले से लेकर यात्रा खत्म होने तक, हर चरण पर लागू होते हैं।', { size: 10 });
  y -= 12;

  // Phase title helper
  const drawPhaseTitle = (num, text) => {
    newPageIfNeeded(28);
    page.drawRectangle({ x: M, y: y - 18, width: 22, height: 22, color: warnAcc });
    const numW = fLB.widthOfTextAtSize(String(num), 12);
    page.drawText(String(num), { x: M + (22 - numW) / 2, y: y - 12, size: 12, font: fLB, color: white });
    drawMixed(text, { x: M + 30, y: y - 12, size: 12, bold: true, color: warnTxt });
    y -= 28;
  };

  // Column widths for tables: उल्लंघन | नियम | जुर्माना
  const tCols = [140, 280, 92];

  drawPhaseTitle(1, 'यात्रा शुरू करने से पहले की तैयारी | Readiness Before Trip');
  drawTable(['उल्लंघन', 'नियम / अपेक्षा', 'जुर्माना (₹)'], [
    ['बस समय पर तैयार न होना', 'बस तय किए गए समय से पहले पूरी तरह तैयार होनी चाहिए।', { text: '₹500', amt: true }],
    ['वर्दी, साफ दिखावट और सीट बेल्ट', 'ड्राइवर को हमेशा साफ वर्दी में रहना ज़रूरी है। सीट पर बैठते ही सीट बेल्ट लगाना भी अनिवार्य है।', { text: '₹500', amt: true }],
    ['बस गंदी होना', 'यात्रा शुरू होने से पहले बस अंदर और बाहर से साफ होनी चाहिए।', { text: '₹500', amt: true }],
    ['ड्राइवर ऐप चालू न होना', "यात्रा शुरू करने से पहले ड्राइवर ऐप खोलना और 'Start Trip' स्वाइप करना ज़रूरी है।", { text: '₹2,000', amt: true }],
    ['सुबह की शिफ्ट के अलार्म का जवाब न देना', 'सुबह की शिफ्ट का अलार्म ऐप पर आता है। उसकी पुष्टि करना ज़रूरी है।', { text: '₹2,000', amt: true }],
    ['देर से रिपोर्टिंग या पहले स्टॉप पर देर', 'समय पर रिपोर्ट करना और पहले स्टॉप पर समय पर पहुंचना ज़रूरी है।', { text: '₹2,000', amt: true }],
    ['बिना बताए अंतिम समय पर गैरहाज़िर', 'पहले से बताए बिना काम पर न आने पर जुर्माना लगेगा।', { text: 'पूरी ट्रिप की कटौती', severe: true }],
  ], tCols);

  drawPhaseTitle(2, 'यात्रा के दौरान | During Trip Phase');
  drawTable(['उल्लंघन', 'नियम / अपेक्षा', 'जुर्माना (₹)'], [
    ['बीच यात्रा में ड्राइवर ऐप बंद करना', 'यात्रा के दौरान ड्राइवर ऐप पूरे समय चालू रहना चाहिए।', { text: '₹500', amt: true }],
    ['ऐप की सूचना का जवाब न देना', 'AC बढ़ाने या एक मिनट रुकने जैसी सूचनाओं पर ऐप में पुष्टि करना ज़रूरी है।', { text: '₹500', amt: true }],
    ['यात्री छूट जाना', 'किसी भी यात्री को उसके स्टॉप पर छोड़कर जाना मना है।', { text: '₹500', amt: true }],
    ['रूट पर बहस करना', 'रूट तय होने के बाद उस पर बहस या आपत्ति नहीं चलेगी।', { text: '₹500', amt: true }],
    ['ऑपरेशन टीम के साथ सहयोग न करना', 'यात्रा के दौरान ऑफिस और मैनेजमेंट टीम के साथ पूरा सहयोग ज़रूरी है।', { text: '₹1,000', amt: true }],
    ['बस की खराबी या AC की दिक्कत न बताना', 'कोई भी समस्या जो ट्रिप रोक सकती है, उसे तुरंत मैनेजमेंट को बताना है।', { text: '₹500', amt: true }],
    ['बाहरी व्यक्ति को बस में बैठाना', 'ड्राई रन या किसी भी ट्रिप में बिना Cityflo टिकट वाले व्यक्ति को बैठाना सख्त मना है।', { text: '₹10,000 (दूसरी बार पर सेवामुक्ति)', severe: true }],
  ], tCols);

  drawPhaseTitle(3, 'यात्रा खत्म होने पर | End of Trip Phase');
  drawTable(['उल्लंघन', 'नियम / अपेक्षा', 'जुर्माना (₹)'], [
    ['ड्राइवर ऐप सही से बंद न करना', 'ऐप बंद करने से पहले ट्रिप को ऐप पर समाप्त करना ज़रूरी है, तभी ट्रिप पूरी मानी जाएगी।', { text: '₹2,000', amt: true }],
    ['यात्रा के बाद बस गंदी छोड़ना', 'हर यात्रा के बाद बस साफ होनी चाहिए और अगली यात्रा के लिए तैयार होनी चाहिए।', { text: '₹500', amt: true }],
    ['यात्री का छूटा सामान न लौटाना', 'अगर कोई यात्री सामान भूल जाए, तो मैनेजमेंट को बताकर यात्री को वापस करना ज़रूरी है।', { text: '₹500', amt: true }],
  ], tCols);

  drawPhaseTitle(4, 'अन्य ज़रूरी बातें | Other Things');
  drawTable(['उल्लंघन', 'नियम / अपेक्षा', 'जुर्माना (₹)'], [
    ['अनुशासनहीनता, रैश ड्राइविंग या 2 मिनट से ज़्यादा फोन कॉल', 'साथी ड्राइवर, यात्री या टीम के साथ बुरा बर्ताव, तेज़ और लापरवाह ड्राइविंग, और गाड़ी चलाते समय 2 मिनट से ज़्यादा फोन पर बात करना मना है।', { text: '₹1,000', amt: true }],
    ['CCTV कैमरे के साथ छेड़छाड़', 'बस में लगे CCTV कैमरे सबकी सुरक्षा के लिए हैं। उन्हें बंद करना, ढकना या नुकसान पहुंचाना सख्त मना है।', { text: '₹5,000 (दूसरी बार पर सेवामुक्ति)', severe: true }],
    ['नशीली चीज़ साथ रखना या सेवन करना', 'ड्यूटी के दौरान किसी भी नशीली चीज़ का सेवन या अपने साथ रखना सख्त मना है।', { text: 'सेवामुक्ति + ₹10,000', severe: true }],
  ], tCols);

  // Closing line
  newPageIfNeeded(36);
  drawParagraph('आपकी मेहनत और ईमानदारी के लिए धन्यवाद। आइए मिलकर Cityflo को और आगे बढ़ाएं।', { size: 11, bold: true, color: warnTxt });
  y -= 12;

  // ════════════════════════════════════════════════════════════════════
  // ── STEP 4 : SIGNATURE BLOCK ─────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  newPageIfNeeded(240);
  drawStepBadge('स्टेप 4 : ड्राइवर की जानकारी और हस्ताक्षर');

  // Signature box with fields
  const now = new Date();
  const hindiMonths = ['जनवरी','फ़रवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];
  const dateStr = `${String(now.getDate()).padStart(2,'0')} ${hindiMonths[now.getMonth()]} ${now.getFullYear()}`;

  const boxTop = y;
  const pad = 14;
  const colW = (W - 2*M - 2*pad - 24) / 2;

  const drawField = (col, row, label, value) => {
    const fx = M + pad + col * (colW + 24);
    const fy = boxTop - 20 - row * 52;
    drawMixed(label, { x: fx, y: fy, size: 9.5, bold: true, color: brand });
    if (value) drawMixed(value, { x: fx, y: fy - 16, size: 11, color: ink });
    page.drawLine({ start: {x: fx, y: fy - 22}, end: {x: fx + colW, y: fy - 22}, thickness: 0.8, color: ink });
  };

  const rows = 2;
  const boxH = 20 + rows * 52 + 90; // signature row is taller
  page.drawRectangle({ x: M, y: boxTop - boxH, width: W - 2*M, height: boxH, color: rgb(0.98, 0.99, 1), borderColor: brandLt, borderWidth: 0.6 });

  drawField(0, 0, 'ड्राइवर का नाम',        name);
  drawField(1, 0, 'ड्राइवर ID / फ़ोन नंबर', mobile);
  drawField(0, 1, 'तारीख़',                 dateStr);

  // Signature field (column 1, row 1) — taller blank line + embedded drawn signature
  const sfx = M + pad + 1 * (colW + 24);
  const sfy = boxTop - 20 - 1 * 52;
  drawMixed('ड्राइवर के हस्ताक्षर / अंगूठा', { x: sfx, y: sfy, size: 9.5, bold: true, color: brand });
  const sigBoxX = sfx, sigBoxY = sfy - 62, sigBoxW = colW, sigBoxH = 55;

  // Draw signature image centered
  const sigPngBytes = Uint8Array.from(atob(sigPad.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
  const sigImg = await pdf.embedPng(sigPngBytes);
  const scaled = sigImg.scaleToFit(sigBoxW - 6, sigBoxH - 4);
  page.drawImage(sigImg, {
    x: sigBoxX + (sigBoxW - scaled.width) / 2,
    y: sigBoxY + (sigBoxH - scaled.height) / 2,
    width: scaled.width, height: scaled.height,
  });
  page.drawLine({ start: {x: sigBoxX, y: sigBoxY - 2}, end: {x: sigBoxX + sigBoxW, y: sigBoxY - 2}, thickness: 0.8, color: ink });

  y = boxTop - boxH - 16;

  // ── Audit trail + legal footer ───────────────────────────────────────
  newPageIfNeeded(60);
  page.drawLine({ start: {x: M, y}, end: {x: W - M, y}, thickness: 0.3, color: gray });
  y -= 12;
  const sep = '  |  ';
  const audit = `ई-हस्ताक्षर${sep}${name}${sep}${mobile}${sep}${now.toLocaleString('en-IN')}${userIP ? sep + 'IP: ' + userIP : ''}`;
  for (const ln of wrapLinesMixed(audit, measureMixed, 8.5, W - 2*M)) {
    drawMixed(ln, { x: M, y, size: 8.5, color: muted });
    y -= 12;
  }
  y -= 4;
  drawMixed('यह एक इलेक्ट्रॉनिक रूप से साइन किया गया दस्तावेज़ है (Information Technology Act 2000 के अंतर्गत मान्य)।', { x: M, y, size: 8, color: muted });
  y -= 11;
  page.drawText('Generated by Cityflo Driver E-Sign · cityflo.com', { x: M, y, size: 8, font: fL, color: muted });

  // ── Watermark: Cityflo logo, centered on every page, very faded ──────
  const wmScale = logo.scale(0.9);
  const wmW = wmScale.width;
  const wmH = wmScale.height;
  for (const pg of pdf.getPages()) {
    const { width: pw, height: ph } = pg.getSize();
    pg.drawImage(logo, {
      x: (pw - wmW) / 2,
      y: (ph - wmH) / 2,
      width: wmW,
      height: wmH,
      opacity: 0.06,
    });
  }

  return pdf.save();
}

// ─── SIGN HANDLER ────────────────────────────────────────────────────────
signBtn.addEventListener('click', signPDF);

async function signPDF() {
  errBox.textContent = '';
  const name   = nameInp.value.trim();
  const mobile = mobInp.value.trim();
  const agreed = document.getElementById('agree').checked;

  if (!name)                    return errBox.textContent = 'कृपया अपना पूरा नाम लिखें।';
  if (!/^\d{10}$/.test(mobile)) return errBox.textContent = '10 अंकों का सही मोबाइल नंबर डालें।';
  if (sigPad.isEmpty())         return errBox.textContent = 'कृपया ऊपर बॉक्स में अपना साइन बनाएँ।';
  if (!agreed)                  return errBox.textContent = 'आगे बढ़ने के लिए कृपया सहमति बॉक्स पर टिक करें।';

  signBtn.disabled = true;
  signBtn.textContent = 'साइन हो रहा है…';

  try {
    const out = await buildSignedPDF({ name, mobile });
    let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < out.length; i += chunk) bin += String.fromCharCode.apply(null, out.subarray(i, i + chunk));
    const base64 = btoa(bin);

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ base64, name, mobile, ip: userIP }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Unknown error');

    document.getElementById('formCard').style.display = 'none';
    document.getElementById('successCard').style.display = 'block';
    document.getElementById('dlLink').href = data.url;
    document.getElementById('successName').textContent =
      `${name} जी, आपका साइन किया हुआ एग्रीमेंट Cityflo के पास सुरक्षित हो गया है।`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    errBox.textContent = 'गड़बड़ी: ' + (e && e.message || e);
    signBtn.disabled = false;
    signBtn.textContent = 'साइन करें';
  }
}

