// ============================================================
// ArTen Registro Visitatori - Frontend Logic
// ============================================================

// === CONFIGURAZIONE ===
// IMPORTANTE: Sostituisci questo URL con l'URL del tuo Google Apps Script Web App
const API_URL = 'https://script.google.com/macros/s/AKfycbxnpt907qKjSH5qP_LwS3ltNOhLLEgVR4XRKXfJmYDjNG_qXAxg1lt-qY4wZOEopt8NyQ/exec';

// Password admin (hardcodata per semplicità)
const ADMIN_PASSWORD = 'arten2026';

// ============================================================
// NAVIGATION
// ============================================================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');

  if (screenId === 'screen-checkin') {
    setTimeout(() => {
      initSignaturePad();
      prefillCurrentTime('oraEntrata');
    }, 100);
  }
}

// ============================================================
// DATE/TIME HELPERS
// ============================================================
function getCurrentTimeHHMM() {
  const now = new Date();
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

function prefillCurrentTime(inputId) {
  const el = document.getElementById(inputId);
  if (el && !el.value) el.value = getCurrentTimeHHMM();
}

function updateDateTime() {
  const el = document.getElementById('home-datetime');
  if (!el) return;
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  el.textContent = now.toLocaleDateString('it-IT', options);
}

setInterval(updateDateTime, 30000);
updateDateTime();

// ============================================================
// API HELPER - usa GET per evitare problemi CORS con Google Apps Script
// ============================================================
async function apiGet(params) {
  const url = new URL(API_URL);
  Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
  const response = await fetch(url.toString());
  return response.json();
}

// ============================================================
// SIGNATURE PAD
// ============================================================
let signatureCanvas, signatureCtx;
let isDrawing = false;
let hasSignature = false;

function initSignaturePad() {
  signatureCanvas = document.getElementById('signature-canvas');
  if (!signatureCanvas) return;
  signatureCtx = signatureCanvas.getContext('2d');

  const rect = signatureCanvas.getBoundingClientRect();
  signatureCanvas.width = rect.width * (window.devicePixelRatio || 1);
  signatureCanvas.height = rect.height * (window.devicePixelRatio || 1);
  signatureCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  signatureCtx.strokeStyle = '#16A34A';
  signatureCtx.lineWidth = 3;
  signatureCtx.lineCap = 'round';
  signatureCtx.lineJoin = 'round';

  signatureCanvas.removeEventListener('pointerdown', onPointerDown);
  signatureCanvas.removeEventListener('pointermove', onPointerMove);
  signatureCanvas.removeEventListener('pointerup', onPointerUp);
  signatureCanvas.removeEventListener('pointerleave', onPointerUp);

  signatureCanvas.addEventListener('pointerdown', onPointerDown);
  signatureCanvas.addEventListener('pointermove', onPointerMove);
  signatureCanvas.addEventListener('pointerup', onPointerUp);
  signatureCanvas.addEventListener('pointerleave', onPointerUp);
}

function getPointerPos(e) {
  const rect = signatureCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onPointerDown(e) {
  e.preventDefault();
  isDrawing = true;
  hasSignature = true;
  const pos = getPointerPos(e);
  signatureCtx.beginPath();
  signatureCtx.moveTo(pos.x, pos.y);
}

function onPointerMove(e) {
  if (!isDrawing) return;
  e.preventDefault();
  const pos = getPointerPos(e);
  signatureCtx.lineTo(pos.x, pos.y);
  signatureCtx.stroke();
}

function onPointerUp(e) { isDrawing = false; }

function clearSignature() {
  if (!signatureCanvas || !signatureCtx) return;
  signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  hasSignature = false;
}

function getSignatureData() {
  if (!signatureCanvas || !hasSignature) return null;
  return signatureCanvas.toDataURL('image/png');
}

// ============================================================
// CHECK-IN
// ============================================================
async function submitCheckIn() {
  const nominativo = document.getElementById('nominativo').value.trim();
  const ditta = document.getElementById('ditta').value.trim();
  const persona = document.getElementById('persona').value.trim();
  const zona = document.getElementById('zona').value.trim();
  const oraEntrata = document.getElementById('oraEntrata').value;
  const firma = getSignatureData();

  if (!nominativo) { showError('Inserisci il nominativo.'); return; }
  if (!ditta) { showError('Inserisci la ditta di provenienza.'); return; }
  if (!persona) { showError('Inserisci la persona da visitare.'); return; }
  if (!zona) { showError('Inserisci la zona di accesso.'); return; }
  if (!oraEntrata) { showError("Inserisci l'ora di ingresso."); return; }
  if (!firma) { showError('La firma è obbligatoria.'); return; }

  const btn = document.getElementById('btn-submit-checkin');
  btn.disabled = true;
  btn.textContent = '⏳ Registrazione in corso...';

  try {
    // Usiamo GET per evitare CORS
    const result = await apiGet({
      action: 'checkIn',
      nominativo,
      ditta,
      personaDaVisitare: persona,
      zonaAccesso: zona,
      oraEntrata,
      firma
    });

    if (result.success) {
      showSuccess('Ingresso Registrato', 'Benvenuto ' + nominativo + '!\nIngresso registrato alle ' + oraEntrata + '.');
      resetCheckInForm();
    } else {
      showError(result.message || result.error || 'Errore durante la registrazione.');
    }
  } catch (err) {
    showError('Errore di connessione. Verifica la connessione WiFi e riprova.\n\n' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ REGISTRA INGRESSO';
  }
}

function resetCheckInForm() {
  document.getElementById('nominativo').value = '';
  document.getElementById('ditta').value = '';
  document.getElementById('persona').value = '';
  document.getElementById('zona').value = '';
  document.getElementById('oraEntrata').value = '';
  clearSignature();
}

// ============================================================
// CHECK-OUT
// ============================================================
async function loadCheckout() {
  showScreen('screen-checkout');

  const listEl = document.getElementById('visitors-list');
  const emptyEl = document.getElementById('checkout-empty');
  const loadingEl = document.getElementById('checkout-loading');

  listEl.innerHTML = '';
  emptyEl.style.display = 'none';
  loadingEl.style.display = 'flex';

  try {
    const result = await apiGet({ action: 'getVisitors' });

    loadingEl.style.display = 'none';

    if (result.success && result.visitors && result.visitors.length > 0) {
      result.visitors.forEach(v => {
        const card = document.createElement('div');
        card.className = 'visitor-card';
        card.onclick = () => confirmCheckOut(v);
        card.innerHTML = `
          <div class="visitor-card-info">
            <div class="visitor-card-name">${escapeHtml(v.nominativo)}</div>
            <div class="visitor-card-details">${escapeHtml(v.ditta)} → ${escapeHtml(v.personaDaVisitare)}</div>
          </div>
          <div class="visitor-card-time">🕐 ${escapeHtml(v.oraEntrata)}</div>
        `;
        listEl.appendChild(card);
      });
    } else {
      emptyEl.style.display = 'flex';
    }
  } catch (err) {
    loadingEl.style.display = 'none';
    showError('Errore di connessione. Verifica la connessione WiFi.\n\n' + err.message);
  }
}

let pendingCheckOut = null;

function confirmCheckOut(visitor) {
  pendingCheckOut = visitor;
  document.getElementById('confirm-title').textContent = 'Registra Uscita';
  document.getElementById('confirm-message').textContent = visitor.nominativo + ' (' + visitor.ditta + ')';
  document.getElementById('oraUscita').value = getCurrentTimeHHMM();
  document.getElementById('overlay-confirm').style.display = 'flex';
}

function cancelConfirm() {
  pendingCheckOut = null;
  document.getElementById('overlay-confirm').style.display = 'none';
}

async function okConfirm() {
  if (!pendingCheckOut) return;

  const oraUscita = document.getElementById('oraUscita').value;
  if (!oraUscita) { showError("Inserisci l'ora di uscita."); return; }

  document.getElementById('overlay-confirm').style.display = 'none';

  const visitor = pendingCheckOut;
  pendingCheckOut = null;

  try {
    const result = await apiGet({
      action: 'checkOut',
      rowIndex: visitor.rowIndex,
      oraUscita
    });

    if (result.success) {
      showSuccess('Uscita Registrata', result.message);
    } else {
      showError(result.message || 'Errore durante la registrazione uscita.');
    }
  } catch (err) {
    showError('Errore di connessione.\n\n' + err.message);
  }
}

// ============================================================
// ADMIN
// ============================================================
function adminLogin() {
  const pwd = document.getElementById('admin-password').value;
  const errEl = document.getElementById('login-error');

  if (pwd === ADMIN_PASSWORD) {
    errEl.style.display = 'none';
    document.getElementById('admin-password').value = '';
    showScreen('screen-admin');
    setAdminDateToday();
  } else {
    errEl.style.display = 'block';
    const box = document.querySelector('.login-box');
    box.style.animation = 'none';
    box.offsetHeight;
    box.style.animation = 'shake 0.4s ease';
  }
}

function adminLogout() {
  showScreen('screen-home');
}

function setAdminDateToday() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('admin-date').value = `${yyyy}-${mm}-${dd}`;
  loadAdminData();
}

async function loadAdminData() {
  const dateInput = document.getElementById('admin-date').value;
  if (!dateInput) return;

  const parts = dateInput.split('-');
  const dateStr = parts[2] + '/' + parts[1] + '/' + parts[0];

  const tableBody = document.getElementById('admin-table-body');
  const emptyEl = document.getElementById('admin-empty');
  const loadingEl = document.getElementById('admin-loading');
  const tableEl = document.getElementById('admin-table');

  tableBody.innerHTML = '';
  emptyEl.style.display = 'none';
  loadingEl.style.display = 'flex';
  tableEl.style.display = 'none';

  try {
    const result = await apiGet({ action: 'getHistory', date: dateStr });

    loadingEl.style.display = 'none';

    if (result.success && result.entries && result.entries.length > 0) {
      tableEl.style.display = 'table';
      result.entries.forEach(entry => {
        const tr = document.createElement('tr');
        const uscitaDisplay = entry.oraUscita
          ? `<span class="badge-out">${escapeHtml(entry.oraUscita)}</span>`
          : `<span class="badge-in">In sede</span>`;

        const firmaDisplay = entry.firma && entry.firma.startsWith('http')
          ? `<a href="${escapeHtml(entry.firma)}" target="_blank">Vedi</a>`
          : '—';

        tr.innerHTML = `
          <td>${escapeHtml(entry.oraEntrata)}</td>
          <td>${uscitaDisplay}</td>
          <td><strong>${escapeHtml(entry.nominativo)}</strong></td>
          <td>${escapeHtml(entry.ditta)}</td>
          <td>${escapeHtml(entry.personaDaVisitare)}</td>
          <td>${escapeHtml(entry.zonaAccesso)}</td>
          <td>${firmaDisplay}</td>
        `;
        tableBody.appendChild(tr);
      });
    } else {
      emptyEl.style.display = 'flex';
    }
  } catch (err) {
    loadingEl.style.display = 'none';
    showError('Errore di connessione.\n\n' + err.message);
  }
}

async function downloadExcel() {
  try {
    const result = await apiGet({ action: 'exportExcel' });
    if (result.success && result.url) {
      window.open(result.url, '_blank');
    } else {
      showError('Errore: impossibile generare il link Excel.');
    }
  } catch (err) {
    showError('Errore di connessione.\n\n' + err.message);
  }
}

// ============================================================
// OVERLAYS
// ============================================================
function showSuccess(title, message) {
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-message').textContent = message;
  document.getElementById('overlay-success').style.display = 'flex';
}

function closeOverlay() {
  document.getElementById('overlay-success').style.display = 'none';
  showScreen('screen-home');
}

function showError(message) {
  document.getElementById('overlay-error-message').textContent = message;
  document.getElementById('overlay-error').style.display = 'flex';
}

function closeErrorOverlay() {
  document.getElementById('overlay-error').style.display = 'none';
}

// ============================================================
// UTILS
// ============================================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(text)));
  return div.innerHTML;
}

// Shake animation
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    50% { transform: translateX(10px); }
    75% { transform: translateX(-6px); }
  }
`;
document.head.appendChild(style);


