// ─── CONFIG ──────────────────────────────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbyqpO-yFZT3aZvxluNAtIZEdZQ58wr3-CKg9H0Y0qp2c4o1SsMTepdY8pfEKq1wXsEOJg/exec';

// ─── ELEMENTS ────────────────────────────────────────────────────────────
const nameInp = document.getElementById('name');
const mobInp  = document.getElementById('mobile');
const errBox  = document.getElementById('err');
const signBtn = document.getElementById('signBtn');
const canvas  = document.getElementById('sigCanvas');

// ─── SIGNATURE PAD SETUP ─────────────────────────────────────────────────
const sigPad = new SignaturePad(canvas, {
  penColor: '#0b3a8a',
  backgroundColor: 'rgba(0,0,0,0)',
  minWidth: 1.2,
  maxWidth: 2.8,
  velocityFilterWeight: 0.6,
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

// ─── URL PREFILL (optional) ──────────────────────────────────────────────
const urlMobile = new URLSearchParams(location.search).get('mobile') || '';
if (urlMobile) mobInp.value = urlMobile;

// ─── IP LOOKUP ───────────────────────────────────────────────────────────
let userIP = '';
fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => userIP = d.ip).catch(() => {});

// ─── PRELOAD ASSETS (font + logo) so first click is instant ──────────────
let _devFontBytes, _devBoldBytes, _logoBytes;
Promise.all([
  fetch('NotoSansDevanagari-Regular.ttf').then(r => r.arrayBuffer()).then(b => _devFontBytes = b),
  fetch('NotoSansDevanagari-Bold.ttf').then(r => r.arrayBuffer()).then(b => _devBoldBytes = b),
  fetch('logo.png').then(r => r.arrayBuffer()).then(b => _logoBytes = b),
]).catch(() => {});

// ─── WORD WRAP HELPER ────────────────────────────────────────────────────
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

// ─── BUILD SIGNED PDF FROM SCRATCH ───────────────────────────────────────
async function buildSignedPDF(name, mobile) {
  if (!_devFontBytes) _devFontBytes   = await fetch('NotoSansDevanagari-Regular.ttf').then(r => r.arrayBuffer());
  if (!_devBoldBytes) _devBoldBytes   = await fetch('NotoSansDevanagari-Bold.ttf').then(r => r.arrayBuffer());
  if (!_logoBytes)    _logoBytes      = await fetch('logo.png').then(r => r.arrayBuffer());

  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const fontReg  = await pdf.embedFont(_devFontBytes,  { subset: true });
  const fontBold = await pdf.embedFont(_devBoldBytes,  { subset: true });
  const fontLat  = await pdf.embedFont(StandardFonts.Helvetica);
  const logo     = await pdf.embedPng(_logoBytes);

  const page = pdf.addPage([612, 792]);   // Letter
  const W = 612, H = 792, M = 50;         // margins
  const ink = rgb(0.08, 0.1, 0.15);
  const orange = rgb(0.97, 0.66, 0.11);
  const muted = rgb(0.45, 0.45, 0.5);

  // ── Header: logo + title ──────────────────────────────────────────────
  const logoScale = logo.scale(0.18);
  page.drawImage(logo, { x: W - M - logoScale.width, y: H - M - logoScale.height + 6, width: logoScale.width, height: logoScale.height });
  page.drawText('ड्राइवर नियम और जुर्माना', { x: M, y: H - M - 8, size: 18, font: fontBold, color: ink });
  page.drawText('Cityflo Driver Agreement', { x: M, y: H - M - 26, size: 10, font: fontLat, color: muted });
  page.drawLine({ start: {x: M, y: H - M - 40}, end: {x: W - M, y: H - M - 40}, thickness: 0.5, color: orange });

  // ── Driver details block ─────────────────────────────────────────────
  let y = H - M - 65;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const labelW = 115;
  const drawRow = (label, value) => {
    page.drawText(label, { x: M, y, size: 11, font: fontBold, color: ink });
    page.drawText(value, { x: M + labelW, y, size: 11, font: fontReg, color: ink });
    y -= 22;
  };
  drawRow('तारीख:',          dateStr);
  drawRow('ड्राइवर का नाम:',    name);
  drawRow('ड्राइवर का नंबर:',   mobile);

  y -= 10;

  // ── Intro / note paragraph ───────────────────────────────────────────
  const intro = 'ध्यान दें: ड्राइवर सीधे सिटीफ्लो के कर्मचारी नहीं हैं, बल्कि ऑपरेटर के अंदर काम करते हैं। सिटीफ्लो सेवा की क्वालिटी, सुरक्षा और अनुशासन बनाए रखने के लिए ड्राइवरों की कुछ बातों पर नज़र रखता है। अगर किसी ड्राइवर का काम या व्यवहार कंपनी के नियमों के अनुसार नहीं पाया गया, तो सिटीफ्लो ज़रूरी कार्रवाई कर सकता है।';
  for (const line of wrapLines(intro, fontReg, 10, W - 2*M)) {
    page.drawText(line, { x: M, y, size: 10, font: fontReg, color: ink });
    y -= 14;
  }
  y -= 6;

  page.drawLine({ start: {x: M, y}, end: {x: W - M, y}, thickness: 0.3, color: rgb(0.8,0.8,0.8) });
  y -= 18;

  // ── Rules (heading + 8 items) ────────────────────────────────────────
  page.drawText('नियम और ज़िम्मेदारियाँ', { x: M, y, size: 13, font: fontBold, color: ink });
  y -= 20;

  const rules = [
    'मैंने सिटीफ्लो के सभी नियम और जुर्माने पूरी तरह पढ़ लिए हैं और समझ लिए हैं।',
    'यात्रा शुरू करने से पहले बस को तैयार रखना, यूनिफ़ॉर्म पहनना, बस साफ रखना और ड्राइवर ऐप चालू रखना मेरी ज़िम्मेदारी है।',
    'मैं समय पर रिपोर्ट करूँगा/करूँगी और बिना बताए गैरहाज़िर नहीं रहूँगा/रहूँगी।',
    'यात्रा के दौरान ड्राइवर ऐप चालू रखना, यात्रियों को बीच में नहीं छोड़ना, तेज़/खतरनाक ड्राइविंग नहीं करना, और मैनेजमेंट के साथ सहयोग करना मेरा काम है।',
    'ड्राई रन (खाली बस) में किसी भी गैर-सिटीफ्लो यात्री को नहीं बिठाऊँगा/बिठाऊँगी।',
    'यात्रा खत्म होने पर ड्राइवर ऐप सही से बंद करना, बस साफ छोड़ना और यात्री का भूला हुआ सामान वापस करना मेरी ज़िम्मेदारी है।',
    'ऊपर दिए नियमों को तोड़ने पर तय जुर्माना मेरी सैलरी से काटा जाएगा, और गंभीर मामलों में मेरी सेवा समाप्त भी की जा सकती है।',
    'मैं अपनी मर्ज़ी से, बिना किसी दबाव के, इन सभी नियमों का पालन करने का वचन देता/देती हूँ।',
  ];

  const rulesIndent = 22;
  rules.forEach((rule, i) => {
    const num = `${i + 1}.`;
    page.drawText(num, { x: M, y, size: 10, font: fontBold, color: orange });
    const lines = wrapLines(rule, fontReg, 10, W - 2*M - rulesIndent);
    lines.forEach((ln, j) => {
      page.drawText(ln, { x: M + rulesIndent, y: y - j * 13, size: 10, font: fontReg, color: ink });
    });
    y -= lines.length * 13 + 5;
  });

  y -= 10;
  page.drawLine({ start: {x: M, y}, end: {x: W - M, y}, thickness: 0.3, color: rgb(0.8,0.8,0.8) });
  y -= 18;

  // ── Acknowledgement ──────────────────────────────────────────────────
  page.drawText('स्वीकारोक्ति (Acknowledgement)', { x: M, y, size: 12, font: fontBold, color: ink });
  y -= 18;

  const ack = `मैं, ${name} (मोबाइल ${mobile}) — मैंने ऊपर लिखे सभी Do's & Don'ts पढ़ और समझ लिए हैं। मैं इन नियमों का पालन करूँगा/करूँगी, और नियम तोड़ने पर कंपनी मुझ पर अनुशासनात्मक कार्रवाई कर सकती है — यह मैं मानता/मानती हूँ।`;
  for (const line of wrapLines(ack, fontReg, 10, W - 2*M)) {
    page.drawText(line, { x: M, y, size: 10, font: fontReg, color: ink });
    y -= 13;
  }

  y -= 24;

  // ── Signature block ──────────────────────────────────────────────────
  page.drawText('हस्ताक्षर (ड्राइवर):', { x: M, y, size: 11, font: fontBold, color: ink });
  // Signature box
  const sigBoxX = M + 120, sigBoxY = y - 15, sigBoxW = 200, sigBoxH = 50;
  page.drawRectangle({
    x: sigBoxX, y: sigBoxY, width: sigBoxW, height: sigBoxH,
    borderColor: rgb(0.7, 0.7, 0.75), borderWidth: 0.5,
  });
  // Embed drawn signature PNG
  const sigPngBytes = Uint8Array.from(atob(sigPad.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
  const sigImg = await pdf.embedPng(sigPngBytes);
  const scaled = sigImg.scaleToFit(sigBoxW - 8, sigBoxH - 8);
  page.drawImage(sigImg, {
    x: sigBoxX + (sigBoxW - scaled.width) / 2,
    y: sigBoxY + (sigBoxH - scaled.height) / 2,
    width: scaled.width, height: scaled.height,
  });

  y = sigBoxY - 18;
  page.drawText(`नाम: ${name}`,       { x: M, y, size: 9, font: fontReg, color: ink }); y -= 12;
  page.drawText(`मोबाइल: ${mobile}`,  { x: M, y, size: 9, font: fontReg, color: ink }); y -= 12;
  page.drawText(`तारीख: ${now.toLocaleString('en-IN')}`, { x: M, y, size: 9, font: fontReg, color: ink }); y -= 12;
  if (userIP) { page.drawText(`IP: ${userIP}`, { x: M, y, size: 9, font: fontReg, color: muted }); y -= 12; }

  // ── Footer ────────────────────────────────────────────────────────────
  page.drawLine({ start: {x: M, y: 55}, end: {x: W - M, y: 55}, thickness: 0.3, color: rgb(0.8,0.8,0.8) });
  page.drawText('यह एक इलेक्ट्रॉनिक रूप से साइन किया गया दस्तावेज़ है (IT Act 2000 के अंतर्गत मान्य)।', { x: M, y: 40, size: 8, font: fontReg, color: muted });
  page.drawText('Generated by Cityflo Driver E-Sign · cityflo.com', { x: M, y: 28, size: 8, font: fontLat, color: muted });

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
    const out = await buildSignedPDF(name, mobile);

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

// ─── RESET for next driver ───────────────────────────────────────────────
document.getElementById('againBtn').addEventListener('click', () => {
  nameInp.value = '';
  mobInp.value = '';
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
