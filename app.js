// ─── CONFIG ──────────────────────────────────────────────────────────────
// Paste your Apps Script Web App /exec URL here after deployment.
const API_URL = 'https://script.google.com/macros/s/AKfycbyqpO-yFZT3aZvxluNAtIZEdZQ58wr3-CKg9H0Y0qp2c4o1SsMTepdY8pfEKq1wXsEOJg/exec';

// ─── ELEMENTS ────────────────────────────────────────────────────────────
const nameInp = document.getElementById('name');
const mobInp  = document.getElementById('mobile');
const sigPrev = document.getElementById('sigPreview');
const errBox  = document.getElementById('err');
const signBtn = document.getElementById('signBtn');

// Shared link — no prefill, each driver types their own mobile.
// (Optional ?mobile=... still respected if ever passed for a single driver.)
const urlMobile = new URLSearchParams(location.search).get('mobile') || '';
if (urlMobile) mobInp.value = urlMobile;

// ─── LIVE SIGNATURE PREVIEW ──────────────────────────────────────────────
const updateSig = () => sigPrev.textContent = nameInp.value || '\u00A0';
nameInp.addEventListener('input', updateSig);
updateSig();

// ─── IP LOOKUP (optional, non-blocking) ──────────────────────────────────
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
  if (!agreed)                  return errBox.textContent = 'आगे बढ़ने के लिए कृपया सहमति बॉक्स पर टिक करें।';

  signBtn.disabled = true;
  signBtn.textContent = 'साइन हो रहा है…';

  try {
    // 1. Fetch template PDF (static asset in same folder)
    const tplBytes = await fetch('agreement.pdf').then(r => r.arrayBuffer());

    // 2. Stamp signature using PDF-Lib
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdf = await PDFDocument.load(tplBytes);
    const page = pdf.getPages()[0];
    const { width, height } = page.getSize();

    const fontSig = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
    const ink = rgb(0.04, 0.22, 0.54);
    const black = rgb(0.1, 0.1, 0.1);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleString('en-IN');

    // Coordinates tuned for the Cityflo Driver Violations template (A4 ~595x842)
    page.drawText(dateStr,  { x: width - 165, y: height - 128, size: 12, font: fontReg, color: black });
    page.drawText(name,     { x: 130,         y: height - 172, size: 12, font: fontReg, color: black });
    page.drawText(mobile,   { x: 130,         y: height - 210, size: 12, font: fontReg, color: black });
    page.drawText(name,     { x: 72,  y: 210, size: 12, font: fontReg, color: black });

    page.drawText(name,                { x: 135, y: 148, size: 20, font: fontSig, color: ink });
    page.drawText(`Mobile: ${mobile}`, { x: 135, y: 132, size:  9, font: fontReg, color: black });
    page.drawText(`Signed: ${timeStr}`,{ x: 135, y: 120, size:  9, font: fontReg, color: black });
    if (userIP) page.drawText(`IP: ${userIP}`, { x: 135, y: 108, size: 8, font: fontReg, color: rgb(0.4,0.4,0.4) });

    const out = await pdf.save();

    // 3. Base64-encode the signed PDF
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < out.length; i += chunk) {
      bin += String.fromCharCode.apply(null, out.subarray(i, i + chunk));
    }
    const base64 = btoa(bin);

    // 4. POST to Apps Script (text/plain avoids CORS preflight)
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ base64, name, mobile, ip: userIP }),
    });
    const data = await res.json();

    if (!data.ok) throw new Error(data.error || 'Unknown error');

    // 5. Show success
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
  updateSig();
  document.getElementById('successCard').style.display = 'none';
  document.getElementById('formCard').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  nameInp.focus();
});
