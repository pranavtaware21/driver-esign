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

// ─── PREFILL MOBILE FROM URL (optional) ──────────────────────────────────
const urlMobile = new URLSearchParams(location.search).get('mobile') || '';
if (urlMobile) mobInp.value = urlMobile;

// ─── IP LOOKUP (non-blocking) ────────────────────────────────────────────
let userIP = '';
fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => userIP = d.ip).catch(() => {});

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
    // 1. Fetch the template PDF
    const tplBytes = await fetch('agreement.pdf').then(r => r.arrayBuffer());

    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdf = await PDFDocument.load(tplBytes);
    const page = pdf.getPages()[0];
    const { width, height } = page.getSize();

    const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
    const black = rgb(0.1, 0.1, 0.1);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleString('en-IN');

    // 2. Stamp form values — positions tuned for the Cityflo A4 template
    //    Values placed AFTER each Hindi label on the same line (no overlap)
    page.drawText(dateStr, { x: 505, y: 724, size: 12, font: fontReg, color: black }); // after तारीख:
    page.drawText(name,    { x: 160, y: 684, size: 12, font: fontReg, color: black }); // after ड्राइवर का नाम:
    page.drawText(mobile,  { x: 170, y: 644, size: 12, font: fontReg, color: black }); // after ड्राइवर का नंबर:

    // Acknowledgement blank line — name in "मैं, _______ (ड्राइवर का नाम)"
    page.drawText(name, { x: 95, y: 192, size: 12, font: fontReg, color: black });

    // 3. Embed the DRAWN signature image into the signature line
    const sigPngBytes = Uint8Array.from(atob(sigPad.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
    const sigImg = await pdf.embedPng(sigPngBytes);
    // target area: right of "हस्ताक्षर (ड्राइवर):" label
    const sigMaxW = 200, sigMaxH = 45;
    const scaled = sigImg.scaleToFit(sigMaxW, sigMaxH);
    page.drawImage(sigImg, {
      x: 170,
      y: 80,
      width: scaled.width,
      height: scaled.height,
    });

    // 4. Small audit trail (tiny, below signature line)
    page.drawText(`${mobile} · ${timeStr}${userIP ? ' · IP:' + userIP : ''}`, {
      x: 170, y: 68, size: 7, font: fontReg, color: rgb(0.5, 0.5, 0.5),
    });

    // 5. Serialize → base64
    const out = await pdf.save();
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < out.length; i += chunk) {
      bin += String.fromCharCode.apply(null, out.subarray(i, i + chunk));
    }
    const base64 = btoa(bin);

    // 6. POST to Apps Script (text/plain → no CORS preflight)
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ base64, name, mobile, ip: userIP }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Unknown error');

    // 7. Success
    document.getElementById('formCard').style.display = 'none';
    const successCard = document.getElementById('successCard');
    successCard.style.display = 'block';
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

// ─── "SIGN ANOTHER DRIVER" — reset form for next person ──────────────────
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
