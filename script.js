// ============================================================
// ArTen Registro Visitatori V2 - Frontend Logic
// ============================================================

// === API BASE (Vercel serverless functions) ===
const API_BASE = '/api';
const ADMIN_PASSWORD = 'arten2026';

// ============================================================
// NAVIGATION
// ============================================================
function showScreen(screenId) {
  // Stop QR scanner if leaving that screen
  if (screenId !== 'screen-qr-scanner') stopQRScanner();

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');

  if (screenId === 'screen-checkin') {
    loadReferees();
  }
  if (screenId === 'screen-privacy') {
    renderPDFDocument();
  }
  if (screenId === 'screen-qr-scanner') {
    startQRScanner();
  }
}

// ============================================================
// PDF RENDERING (pdf.js)
// ============================================================
let pdfRendered = false;

async function renderPDFDocument() {
  if (pdfRendered) return;
  const container = document.getElementById('pdf-pages-container');
  if (!container) return;

  container.innerHTML = '<div class="pdf-loading"><div class="spinner"></div><p>Caricamento documento...</p></div>';

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument('informativa.pdf').promise;

    container.innerHTML = '';

    // Use a reasonable width for a "document rectangle" look
    const maxWidth = Math.min(container.clientWidth - 40, 800);

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const scale = maxWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      const dpr = window.devicePixelRatio || 1;
      canvas.width = scaledViewport.width * dpr;
      canvas.height = scaledViewport.height * dpr;
      canvas.style.width = scaledViewport.width + 'px';
      canvas.style.height = scaledViewport.height + 'px';

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

      if (i === pdf.numPages) {
        // Last page: wrap in relative container and overlay signature canvas
        const wrapper = document.createElement('div');
        wrapper.className = 'pdf-last-page-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.width = scaledViewport.width + 'px';
        wrapper.appendChild(canvas);

        // Signature overlay canvas — covers the "Firma del visitatore ___" line
        // This line is near the bottom of the last page, roughly 73% from top
        const sigCanvas = document.createElement('canvas');
        sigCanvas.id = 'signature-canvas';
        sigCanvas.className = 'signature-overlay-canvas';
        const sigTop = Math.round(scaledViewport.height * 0.75);
        const sigHeight = Math.round(scaledViewport.height * 0.19);
        sigCanvas.style.position = 'absolute';
        sigCanvas.style.left = '5%';
        sigCanvas.style.width = '90%';
        sigCanvas.style.top = sigTop + 'px';
        sigCanvas.style.height = sigHeight + 'px';
        sigCanvas.style.cursor = 'crosshair';
        sigCanvas.style.touchAction = 'none';
        sigCanvas.style.zIndex = '5';

        wrapper.appendChild(sigCanvas);
        container.appendChild(wrapper);
      } else {
        container.appendChild(canvas);
      }
    }

    pdfRendered = true;

    // Init signature pad now that canvas exists in the DOM
    setTimeout(() => initSignaturePad(), 200);

  } catch (err) {
    console.error('PDF render error:', err);
    container.innerHTML = `
      <div class="pdf-error">
        <span style="font-size:2rem;">⚠️</span>
        <p>Impossibile caricare il documento PDF.</p>
        <p style="font-size:0.8rem;color:#666;">${err.message}</p>
      </div>`;
  }
}

// ============================================================
// DATE/TIME HELPERS
// ============================================================
function formatTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

function formatDate(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
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
// API HELPERS
// ============================================================
async function apiGet(endpoint, params = {}) {
  const url = new URL(API_BASE + endpoint, window.location.origin);
  Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
  const response = await fetch(url.toString());
  return response.json();
}

async function apiPost(endpoint, data) {
  const response = await fetch(API_BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
}

async function apiPut(endpoint, data) {
  const response = await fetch(API_BASE + endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
}

async function apiDelete(endpoint, data) {
  const response = await fetch(API_BASE + endpoint, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
}

// ============================================================
// LOAD REFEREES DROPDOWN
// ============================================================
async function loadReferees() {
  const select = document.getElementById('referente');
  if (!select) return;

  try {
    const result = await apiGet('/referees');
    if (result.success && result.referees) {
      // Keep the first "-- Seleziona --" option
      select.innerHTML = '<option value="">-- Seleziona --</option>';
      result.referees.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.nome;
        opt.textContent = r.nome;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Failed to load referees:', err);
  }
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

  signatureCtx.strokeStyle = '#1a237e';
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
  e.preventDefault(); isDrawing = true; hasSignature = true;
  const pos = getPointerPos(e);
  signatureCtx.beginPath();
  signatureCtx.moveTo(pos.x, pos.y);
}
function onPointerMove(e) {
  if (!isDrawing) return; e.preventDefault();
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
// CHECK-IN FLOW (2 steps)
// ============================================================

// Temporary storage for form data between steps
let pendingCheckInData = {};

function goToPrivacyStep() {
  const nominativo = document.getElementById('nominativo').value.trim();
  const ditta = document.getElementById('ditta').value.trim();
  const email = document.getElementById('email').value.trim();
  const referente = document.getElementById('referente').value;
  const zona = document.getElementById('zona').value.trim();

  if (!nominativo) { showError('Inserisci il nome e cognome.'); return; }
  if (!ditta) { showError('Inserisci la ditta.'); return; }
  if (!email) { showError('Inserisci l\'email.'); return; }
  if (!referente) { showError('Seleziona il referente interno.'); return; }

  pendingCheckInData = { nome: nominativo, ditta, email, referente, zona };
  showScreen('screen-privacy');
}

async function submitCheckIn() {
  const firma = getSignatureData();
  if (!firma) { showError('La firma è obbligatoria.'); return; }

  const btn = document.getElementById('btn-submit-checkin');
  btn.disabled = true;
  btn.textContent = '⏳ Generazione PDF firmato...';

  try {
    // Generate the signed PDF with embedded signature
    const signedPdfBase64 = await generateSignedPDF(firma);

    btn.textContent = '⏳ Registrazione...';

    const result = await apiPost('/visit', {
      ...pendingCheckInData,
      firma,
      firma_pdf: signedPdfBase64,
      privacy_accettata: true
    });

    if (result.success) {
      document.getElementById('success-message').textContent =
        `Benvenuto ${pendingCheckInData.nome}! Una email di conferma è stata inviata a ${pendingCheckInData.email}.`;
      document.getElementById('success-code').textContent = result.codice;
      showScreen('screen-success');
      resetCheckInForm();
    } else {
      showError(result.message || 'Errore durante la registrazione.');
    }
  } catch (err) {
    showError('Errore di connessione: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ CONFERMA E REGISTRA';
  }
}

// Generate a signed PDF by embedding the signature onto the informativa.pdf
async function generateSignedPDF(signatureDataUrl) {
  const { PDFDocument } = PDFLib;

  // Fetch the original PDF
  const pdfBytes = await fetch('informativa.pdf').then(r => r.arrayBuffer());
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Embed the signature image
  const sigImageBytes = await fetch(signatureDataUrl).then(r => r.arrayBuffer());
  const sigImage = await pdfDoc.embedPng(sigImageBytes);

  // Get the last page
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width, height } = lastPage.getSize();

  // Position signature at the same spot as the overlay canvas (75-94% from top)
  // In PDF coordinates, Y=0 is at the BOTTOM, so we need to invert
  const sigTop = height * 0.75;     // 75% from top = 25% from bottom
  const sigBottom = height * 0.94;  // 94% from top = 6% from bottom
  const sigY = height - sigBottom;  // Y position (from bottom)
  const sigH = sigBottom - sigTop;  // Height of signature area
  const sigX = width * 0.05;        // 5% from left
  const sigW = width * 0.90;        // 90% width

  // Draw signature on last page, preserving aspect ratio
  const sigAspect = sigImage.width / sigImage.height;
  let drawW = sigW;
  let drawH = drawW / sigAspect;
  if (drawH > sigH) {
    drawH = sigH;
    drawW = drawH * sigAspect;
  }
  const drawX = sigX + (sigW - drawW) / 2;
  const drawY = sigY + (sigH - drawH) / 2;

  lastPage.drawImage(sigImage, {
    x: drawX,
    y: drawY,
    width: drawW,
    height: drawH,
  });

  // Save and return as base64
  const signedPdfBytes = await pdfDoc.save();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signedPdfBytes)));
  return 'data:application/pdf;base64,' + base64;
}

function resetCheckInForm() {
  document.getElementById('nominativo').value = '';
  document.getElementById('ditta').value = '';
  document.getElementById('email').value = '';
  document.getElementById('referente').value = '';
  document.getElementById('zona').value = '';
  clearSignature();
  pendingCheckInData = {};
  pdfRendered = false;
  const pdfContainer = document.getElementById('pdf-pages-container');
  if (pdfContainer) pdfContainer.innerHTML = '';
}

// ============================================================
// CODE LOGIN
// ============================================================
async function submitCodeLogin() {
  const codeInput = document.getElementById('code-input');
  const codice = codeInput.value.trim().toUpperCase();

  if (!codice) { showError('Inserisci il codice.'); return; }

  const btn = document.getElementById('btn-code-login');
  btn.disabled = true;
  btn.textContent = '⏳ Verifica...';

  try {
    const result = await apiPost('/code-login', { codice });

    if (result.success) {
      document.getElementById('success-message').textContent = result.message;
      document.getElementById('success-code').textContent = codice;
      showScreen('screen-success');
      codeInput.value = '';
    } else {
      showError(result.message || 'Codice non trovato.');
    }
  } catch (err) {
    showError('Errore di connessione: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ ACCEDI';
  }
}

// ============================================================
// QR CODE SCANNER
// ============================================================
let qrStream = null;
let qrAnimFrame = null;
let qrProcessing = false;

async function startQRScanner() {
  const video = document.getElementById('qr-video');
  const status = document.getElementById('qr-status');
  if (!video) return;

  status.textContent = 'Avvio fotocamera...';
  status.className = 'qr-status';

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = qrStream;
    await video.play();
    status.textContent = 'Inquadra il QR code ricevuto via email';
    scanQRFrame(video, status);
  } catch (err) {
    console.error('Camera error:', err);
    status.textContent = '⚠️ Impossibile accedere alla fotocamera. Controlla i permessi.';
    status.className = 'qr-status qr-error';
  }
}

function scanQRFrame(video, status) {
  if (!qrStream) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  function tick() {
    if (!qrStream || qrProcessing) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });

      if (code && code.data) {
        const match = code.data.trim().toUpperCase();
        // Accept codes that look like ARTEN-XXXX
        if (/^ARTEN-\d{4}$/.test(match)) {
          qrProcessing = true;
          status.textContent = '✅ QR riconosciuto: ' + match;
          status.className = 'qr-status qr-success';
          // Auto-login with the scanned code
          handleQRLogin(match);
          return;
        }
      }
    }
    qrAnimFrame = requestAnimationFrame(tick);
  }
  qrAnimFrame = requestAnimationFrame(tick);
}

async function handleQRLogin(codice) {
  try {
    const result = await apiPost('/code-login', { codice });
    stopQRScanner();

    if (result.success) {
      document.getElementById('success-message').textContent = result.message;
      document.getElementById('success-code').textContent = codice;
      showScreen('screen-success');
    } else {
      showError(result.message || 'Codice non trovato.');
      showScreen('screen-home');
    }
  } catch (err) {
    stopQRScanner();
    showError('Errore di connessione: ' + err.message);
    showScreen('screen-home');
  }
}

function stopQRScanner() {
  if (qrAnimFrame) {
    cancelAnimationFrame(qrAnimFrame);
    qrAnimFrame = null;
  }
  if (qrStream) {
    qrStream.getTracks().forEach(t => t.stop());
    qrStream = null;
  }
  const video = document.getElementById('qr-video');
  if (video) video.srcObject = null;
  qrProcessing = false;
}

// ============================================================
// CHECK-OUT
// ============================================================
let allVisitors = [];

async function loadCheckout() {
  showScreen('screen-checkout');

  const listEl = document.getElementById('visitors-list');
  const emptyEl = document.getElementById('checkout-empty');
  const loadingEl = document.getElementById('checkout-loading');
  const searchEl = document.getElementById('checkout-search');

  listEl.innerHTML = '';
  emptyEl.style.display = 'none';
  loadingEl.style.display = 'flex';
  if (searchEl) searchEl.value = '';

  try {
    const result = await apiGet('/visit');
    loadingEl.style.display = 'none';

    if (result.success && result.visitors) {
      // Only show visitors without exit time
      allVisitors = result.visitors.filter(v => !v.ora_uscita);

      if (allVisitors.length > 0) {
        renderCheckoutList(allVisitors);
      } else {
        emptyEl.style.display = 'flex';
      }
    } else {
      emptyEl.style.display = 'flex';
    }
  } catch (err) {
    loadingEl.style.display = 'none';
    showError('Errore: ' + err.message);
  }
}

function renderCheckoutList(visitors) {
  const listEl = document.getElementById('visitors-list');
  listEl.innerHTML = '';

  visitors.forEach(v => {
    const card = document.createElement('div');
    card.className = 'visitor-card';
    card.onclick = () => confirmCheckOut(v);
    card.innerHTML = `
      <div class="visitor-card-info">
        <div class="visitor-card-name">${escapeHtml(v.nome)}</div>
        <div class="visitor-card-details">${escapeHtml(v.ditta)} → ${escapeHtml(v.referente || '')}</div>
        <div class="visitor-card-code">${escapeHtml(v.codice_univoco)}</div>
      </div>
      <div class="visitor-card-time">🕐 ${formatTime(v.ora_entrata)}</div>
    `;
    listEl.appendChild(card);
  });
}

function filterCheckoutList() {
  const query = document.getElementById('checkout-search').value.toLowerCase();
  const filtered = allVisitors.filter(v =>
    v.nome.toLowerCase().includes(query) ||
    v.codice_univoco.toLowerCase().includes(query) ||
    v.ditta.toLowerCase().includes(query)
  );
  const emptyEl = document.getElementById('checkout-empty');

  if (filtered.length > 0) {
    emptyEl.style.display = 'none';
    renderCheckoutList(filtered);
  } else {
    document.getElementById('visitors-list').innerHTML = '';
    emptyEl.style.display = 'flex';
  }
}

let pendingCheckOut = null;

function confirmCheckOut(visitor) {
  pendingCheckOut = visitor;
  document.getElementById('confirm-title').textContent = 'Registra Uscita';
  document.getElementById('confirm-message').textContent =
    `${visitor.nome} (${visitor.ditta}) - ${visitor.codice_univoco}`;
  document.getElementById('overlay-confirm').style.display = 'flex';
}

function cancelConfirm() {
  pendingCheckOut = null;
  document.getElementById('overlay-confirm').style.display = 'none';
}

async function okConfirm() {
  if (!pendingCheckOut) return;
  document.getElementById('overlay-confirm').style.display = 'none';

  const visitor = pendingCheckOut;
  pendingCheckOut = null;

  try {
    const result = await apiPut('/visit', { id: visitor.id });
    if (result.success) {
      document.getElementById('success-message').textContent =
        `Uscita registrata per ${visitor.nome}. Email di conferma inviata.`;
      document.getElementById('success-code').textContent = visitor.codice_univoco;
      showScreen('screen-success');
    } else {
      showError(result.message || 'Errore registrazione uscita.');
    }
  } catch (err) {
    showError('Errore: ' + err.message);
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
    loadAdminReferees();
  } else {
    errEl.style.display = 'block';
    const box = document.querySelector('.login-box');
    box.style.animation = 'none';
    box.offsetHeight;
    box.style.animation = 'shake 0.4s ease';
  }
}

function adminLogout() { showScreen('screen-home'); }

function switchAdminTab(tabId) {
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');

  if (tabId === 'tab-referees') loadAdminReferees();
}

// --- Admin: Visitors Table ---
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

  const tableBody = document.getElementById('admin-table-body');
  const emptyEl = document.getElementById('admin-empty');
  const loadingEl = document.getElementById('admin-loading');
  const tableEl = document.getElementById('admin-table');

  tableBody.innerHTML = '';
  emptyEl.style.display = 'none';
  loadingEl.style.display = 'flex';
  tableEl.style.display = 'none';

  try {
    const result = await apiGet('/visit', { date: dateInput });
    loadingEl.style.display = 'none';

    if (result.success && result.visitors && result.visitors.length > 0) {
      tableEl.style.display = 'table';
      result.visitors.forEach(entry => {
        const tr = document.createElement('tr');
        const isStillInside = !entry.ora_uscita;
        if (isStillInside) tr.className = 'row-active';

        const uscita = entry.ora_uscita
          ? `<span class="badge-out">${formatTime(entry.ora_uscita)}</span>`
          : `<span class="badge-in">In sede</span>`;

        const firma = entry.firma_url
          ? `<a href="${escapeHtml(entry.firma_url)}" target="_blank">Vedi</a>`
          : '—';

        tr.innerHTML = `
          <td>${formatTime(entry.ora_entrata)}</td>
          <td>${uscita}</td>
          <td><strong>${escapeHtml(entry.nome)}</strong></td>
          <td>${escapeHtml(entry.ditta)}</td>
          <td>${escapeHtml(entry.email)}</td>
          <td>${escapeHtml(entry.referente || '')}</td>
          <td>${escapeHtml(entry.zona || '')}</td>
          <td><code>${escapeHtml(entry.codice_univoco)}</code></td>
          <td>${firma}</td>
        `;
        tableBody.appendChild(tr);
      });
    } else {
      emptyEl.style.display = 'flex';
    }
  } catch (err) {
    loadingEl.style.display = 'none';
    showError('Errore: ' + err.message);
  }
}

// --- Admin: Referees ---
async function loadAdminReferees() {
  const listEl = document.getElementById('referees-list');
  listEl.innerHTML = '<p style="color:#888;">Caricamento...</p>';

  try {
    const result = await apiGet('/referees');
    listEl.innerHTML = '';

    if (result.success && result.referees) {
      if (result.referees.length === 0) {
        listEl.innerHTML = '<p style="color:#888;">Nessun referente configurato.</p>';
        return;
      }
      result.referees.forEach(r => {
        const item = document.createElement('div');
        item.className = 'referee-item';
        item.innerHTML = `
          <div class="referee-info">
            <strong>${escapeHtml(r.nome)}</strong>
            ${r.email ? `<span style="color:#888;font-size:0.85rem;">${escapeHtml(r.email)}</span>` : ''}
          </div>
          <button class="btn btn-outline btn-sm btn-danger" onclick="removeReferee('${r.id}')">❌ Rimuovi</button>
        `;
        listEl.appendChild(item);
      });
    }
  } catch (err) {
    listEl.innerHTML = '<p style="color:#f00;">Errore caricamento.</p>';
  }
}

async function addReferee() {
  const nome = document.getElementById('new-referee-name').value.trim();
  const email = document.getElementById('new-referee-email').value.trim();
  if (!nome) { showError('Inserisci il nome del referente.'); return; }

  try {
    const result = await apiPost('/referees', { nome, email });
    if (result.success) {
      document.getElementById('new-referee-name').value = '';
      document.getElementById('new-referee-email').value = '';
      loadAdminReferees();
    } else {
      showError(result.message);
    }
  } catch (err) {
    showError('Errore: ' + err.message);
  }
}

async function removeReferee(id) {
  try {
    const result = await apiDelete('/referees', { id });
    if (result.success) {
      loadAdminReferees();
    } else {
      showError(result.message);
    }
  } catch (err) {
    showError('Errore: ' + err.message);
  }
}

// --- Admin: Excel Export ---
async function downloadExcel() {
  const dateInput = document.getElementById('admin-date').value;
  if (!dateInput) return;

  try {
    const result = await apiGet('/visit', { date: dateInput });
    if (!result.success || !result.visitors || result.visitors.length === 0) {
      showError('Nessun dato da esportare.');
      return;
    }

    // Generate CSV (compatible with Excel)
    const headers = ['Data', 'Ora Entrata', 'Ora Uscita', 'Nome', 'Ditta', 'Email', 'Referente', 'Zona', 'Codice', 'Firma'];
    const rows = result.visitors.map(v => [
      formatDate(v.ora_entrata),
      formatTime(v.ora_entrata),
      v.ora_uscita ? formatTime(v.ora_uscita) : '',
      v.nome,
      v.ditta,
      v.email,
      v.referente || '',
      v.zona || '',
      v.codice_univoco,
      v.firma_url || ''
    ]);

    let csv = '\uFEFF'; // BOM for Excel UTF-8
    csv += headers.join(';') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registro_visitatori_${dateInput}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showError('Errore export: ' + err.message);
  }
}

// ============================================================
// OVERLAYS
// ============================================================
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
