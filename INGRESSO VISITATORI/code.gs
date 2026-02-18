// ============================================================
// REGISTRO VISITATORI ArTen - Google Apps Script Backend
// VERSIONE CON CORS HEADERS CORRETTI
// ============================================================

const SPREADSHEET_ID = '1PLr6t4CPhbCv__0rzAWGQU0bJAuG5tUMeF4x85aOrCc';
const DRIVE_FOLDER_ID = '1rWO4UyJAYrtIvl1xcGm4HS2yRud6TFgG';
const SHEET_NAME = 'Registro';

function getSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
}

function formatDate(date) {
  return Utilities.formatDate(date, "GMT+1", 'dd/MM/yyyy');
}

function formatTime(date) {
  return Utilities.formatDate(date, "GMT+1", 'HH:mm');
}

// Risposta JSON con CORS headers
function jsonResponse(data) {
  var output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================================
// doGet - gestisce tutte le operazioni (anche check-in via GET)
// ============================================================
function doGet(e) {
  try {
    var action = e.parameter.action;

    if (action === 'getVisitors') return jsonResponse(getActiveVisitors());
    if (action === 'getHistory') return jsonResponse(getHistoryByDate(e.parameter.date));
    if (action === 'getToday') return jsonResponse(getTodayEntries());

    if (action === 'exportExcel') {
      return jsonResponse({
        success: true,
        url: 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/export?format=xlsx'
      });
    }

    // CHECK-IN via GET (per evitare problemi CORS con POST)
    if (action === 'checkIn') {
      var data = {
        nominativo: e.parameter.nominativo,
        ditta: e.parameter.ditta,
        personaDaVisitare: e.parameter.personaDaVisitare,
        zonaAccesso: e.parameter.zonaAccesso,
        oraEntrata: e.parameter.oraEntrata,
        firma: e.parameter.firma
      };
      return jsonResponse(checkIn(data));
    }

    // CHECK-OUT via GET
    if (action === 'checkOut') {
      var rowIndex = parseInt(e.parameter.rowIndex);
      var oraUscita = e.parameter.oraUscita;
      return jsonResponse(checkOut({ rowIndex: rowIndex, oraUscita: oraUscita }));
    }

    return jsonResponse({ error: 'Azione sconosciuta' });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// doPost rimane per compatibilità
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    if (action === 'checkIn') return jsonResponse(checkIn(data));
    if (action === 'checkOut') return jsonResponse(checkOut(data));
    return jsonResponse({ error: 'Azione sconosciuta' });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// === CHECK-IN ===
function checkIn(data) {
  var sheet = getSheet();
  var now = new Date();
  var dateStr = formatDate(now);
  var timeStr = data.oraEntrata ? data.oraEntrata : formatTime(now);

  var firmaUrl = '';
  if (data.firma && data.firma.length > 100) {
    firmaUrl = saveSignatureToDrive(data.firma, data.nominativo, dateStr, timeStr);
  }

  sheet.appendRow([
    "'" + dateStr,
    "'" + timeStr,
    '',
    data.nominativo || '',
    data.ditta || '',
    data.personaDaVisitare || '',
    data.zonaAccesso || '',
    firmaUrl
  ]);

  return { success: true, message: 'Ingresso registrato alle ' + timeStr };
}

// === CHECK-OUT ===
function checkOut(data) {
  var sheet = getSheet();
  var now = new Date();
  var today = formatDate(now);
  var timeStr = data.oraUscita ? data.oraUscita : formatTime(now);
  var allData = sheet.getDataRange().getDisplayValues();
  var rowIndex = data.rowIndex;

  if (rowIndex && rowIndex > 1) {
    var row = allData[rowIndex - 1];
    if (row[0] === today && row[2] === '') {
      sheet.getRange(rowIndex, 3).setValue("'" + timeStr);
      return { success: true, message: 'Uscita registrata alle ' + timeStr };
    }
  }

  return { success: false, message: 'Impossibile registrare uscita. Riga non trovata o già registrata.' };
}

// === ACTIVE VISITORS ===
function getActiveVisitors() {
  var sheet = getSheet();
  var today = formatDate(new Date());
  var allData = sheet.getDataRange().getDisplayValues();
  var visitors = [];

  for (var i = 1; i < allData.length; i++) {
    var row = allData[i];
    if (row[0] === today && row[2] === '') {
      visitors.push({
        rowIndex: i + 1,
        nominativo: row[3],
        ditta: row[4],
        oraEntrata: row[1],
        personaDaVisitare: row[5],
        zonaAccesso: row[6]
      });
    }
  }
  return { success: true, visitors: visitors };
}

// === TODAY ENTRIES ===
function getTodayEntries() {
  var sheet = getSheet();
  var today = formatDate(new Date());
  var allData = sheet.getDataRange().getDisplayValues();
  var entries = [];

  for (var i = 1; i < allData.length; i++) {
    var row = allData[i];
    if (row[0] === today) entries.push(mapRow(i + 1, row));
  }
  return { success: true, entries: entries };
}

// === HISTORY ===
function getHistoryByDate(dateStr) {
  var sheet = getSheet();
  var allData = sheet.getDataRange().getDisplayValues();
  var entries = [];

  for (var i = 1; i < allData.length; i++) {
    var row = allData[i];
    if (row[0] === dateStr) entries.push(mapRow(i + 1, row));
  }
  return { success: true, entries: entries };
}

function mapRow(index, row) {
  return {
    rowIndex: index,
    data: row[0],
    oraEntrata: row[1],
    oraUscita: row[2],
    nominativo: row[3],
    ditta: row[4],
    personaDaVisitare: row[5],
    zonaAccesso: row[6],
    firma: row[7]
  };
}

// === SAVE SIGNATURE ===
function saveSignatureToDrive(base64Data, nominativo, dateStr, timeStr) {
  try {
    var imageData = base64Data.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    var blob = Utilities.newBlob(Utilities.base64Decode(imageData), 'image/png',
      'firma_' + nominativo.replace(/\s+/g, '_') + '_' + dateStr.replace(/\//g, '-') + '_' + timeStr.replace(/:/g, '-') + '.png');
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    return 'Errore: ' + err.toString();
  }
}
