const urlInput = document.getElementById('enrollmentUrl');
const qrBox = document.getElementById('qrcode');
const qrStatus = document.getElementById('qrStatus');
const defaultUrl = new URL('register.html', window.location.href).href;
function generateQr() {
  const value = urlInput.value.trim();
  if (!value || !/^https?:\/\//i.test(value)) { qrStatus.textContent = 'Enter a complete http:// or https:// enrollment URL.'; return; }
  qrBox.replaceChildren();
  new QRCode(qrBox, { text: value, width: 260, height: 260, colorDark: '#143c2b', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
  qrStatus.textContent = 'Ready. Members can scan this code with their phone camera.';
}
urlInput.value = defaultUrl;
document.getElementById('generateQr').addEventListener('click', generateQr);
urlInput.addEventListener('keydown', event => { if (event.key === 'Enter') generateQr(); });
if (window.QRCode) generateQr(); else qrStatus.textContent = 'QR library could not load. Check the PC internet connection.';
