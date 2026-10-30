const SHEET_NAME = 'Catatan';
const FOLDER_NAME = 'Mushaf Acak'; // folder di Drive untuk kartu JPG

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(SHEET_NAME);
      sh.appendRow(['Tanggal', 'Halaman', 'Uraian', 'Niat', 'Kartu']);
      sh.getRange('B:B').setNumberFormat('@'); // supaya "5-6" tidak jadi tanggal
      sh.setFrozenRows(1);
    }
    if (sh.getRange(1, 5).getValue() === '') sh.getRange(1, 5).setValue('Kartu');

    let link = '';
    if (d.gambar) {
      const it = DriveApp.getFoldersByName(FOLDER_NAME);
      const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
      const blob = Utilities.newBlob(Utilities.base64Decode(d.gambar), 'image/jpeg', d.namaFile || 'kartu.jpg');
      link = folder.createFile(blob).getUrl();
    }
    sh.appendRow([d.tanggal, d.halaman, d.uraian, d.niat || '', link]);
    return out({ ok: true, link: link });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() { return out({ ok: true }); }

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
