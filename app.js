// ─── CONFIG ──────────────────────────────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbyqpO-yFZT3aZvxluNAtIZEdZQ58wr3-CKg9H0Y0qp2c4o1SsMTepdY8pfEKq1wXsEOJg/exec';

// ─── ELEMENTS ────────────────────────────────────────────────────────────
const nameInp = document.getElementById('name');
const mobInp  = document.getElementById('mobile');
const opInp   = document.getElementById('operator');
const busInp  = document.getElementById('bus');
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
async function buildSignedPDF({ name, mobile, operator, bus }) {
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

  // ── Step 1 badge ──────────────────────────────────────────────────────
  const drawStepBadge = (text) => {
    page.drawRectangle({ x: M, y: y - 8, width: W - 2*M, height: 22, color: stepBg });
    page.drawRectangle({ x: M, y: y - 8, width: 4, height: 22, color: stepAcc });
    page.drawText(text, { x: M + 12, y: y - 2, size: 11, font: fB, color: stepTxt });
    y -= 30;
  };
  drawStepBadge('स्टेप 1 : एग्रीमेंट ध्यान से पढ़ें');

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

  // ── Step 2 + signature block ─────────────────────────────────────────
  newPageIfNeeded(240);
  drawStepBadge('स्टेप 2 : ड्राइवर की जानकारी और हस्ताक्षर');

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

  const rows = 3;
  const boxH = 20 + rows * 52 + 90; // signature row is taller
  page.drawRectangle({ x: M, y: boxTop - boxH, width: W - 2*M, height: boxH, color: rgb(0.98, 0.99, 1), borderColor: brandLt, borderWidth: 0.6 });

  drawField(0, 0, 'ड्राइवर का नाम',        name);
  drawField(1, 0, 'ड्राइवर ID / फ़ोन नंबर', mobile);
  drawField(0, 1, 'ऑपरेटर का नाम',         operator || '—');
  drawField(1, 1, 'बस नंबर',               bus || '—');
  drawField(0, 2, 'तारीख़',                 dateStr);

  // Signature field (column 1, row 2) — taller blank line + embedded drawn signature
  const sfx = M + pad + 1 * (colW + 24);
  const sfy = boxTop - 20 - 2 * 52;
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
  const audit = `ई-हस्ताक्षर${sep}${name}${sep}${mobile}${operator ? sep + 'ऑपरेटर: ' + operator : ''}${bus ? sep + 'बस: ' + bus : ''}${sep}${now.toLocaleString('en-IN')}${userIP ? sep + 'IP: ' + userIP : ''}`;
  for (const ln of wrapLinesMixed(audit, measureMixed, 8.5, W - 2*M)) {
    drawMixed(ln, { x: M, y, size: 8.5, color: muted });
    y -= 12;
  }
  y -= 4;
  drawMixed('यह एक इलेक्ट्रॉनिक रूप से साइन किया गया दस्तावेज़ है (Information Technology Act 2000 के अंतर्गत मान्य)।', { x: M, y, size: 8, color: muted });
  y -= 11;
  page.drawText('Generated by Cityflo Driver E-Sign · cityflo.com', { x: M, y, size: 8, font: fL, color: muted });

  return pdf.save();
}

// ─── SIGN HANDLER ────────────────────────────────────────────────────────
signBtn.addEventListener('click', signPDF);

async function signPDF() {
  errBox.textContent = '';
  const name     = nameInp.value.trim();
  const mobile   = mobInp.value.trim();
  const operator = opInp.value.trim();
  const bus      = busInp.value.trim();
  const agreed   = document.getElementById('agree').checked;

  if (!name)                    return errBox.textContent = 'कृपया अपना पूरा नाम लिखें।';
  if (!/^\d{10}$/.test(mobile)) return errBox.textContent = '10 अंकों का सही मोबाइल नंबर डालें।';
  if (sigPad.isEmpty())         return errBox.textContent = 'कृपया ऊपर बॉक्स में अपना साइन बनाएँ।';
  if (!agreed)                  return errBox.textContent = 'आगे बढ़ने के लिए कृपया सहमति बॉक्स पर टिक करें।';

  signBtn.disabled = true;
  signBtn.textContent = 'साइन हो रहा है…';

  try {
    const out = await buildSignedPDF({ name, mobile, operator, bus });
    let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < out.length; i += chunk) bin += String.fromCharCode.apply(null, out.subarray(i, i + chunk));
    const base64 = btoa(bin);

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ base64, name, mobile, operator, bus, ip: userIP }),
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

// ─── RESET ───────────────────────────────────────────────────────────────
document.getElementById('againBtn').addEventListener('click', () => {
  nameInp.value = mobInp.value = opInp.value = busInp.value = '';
  document.getElementById('agree').checked = false;
  errBox.textContent = '';
  signBtn.disabled = false;
  signBtn.textContent = 'साइन करें';
  sigPad.clear();
  document.getElementById('successCard').style.display = 'none';
  document.getElementById('formCard').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  nameInp.focus();
});
