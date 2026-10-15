/**
 * BACKEND APPS SCRIPT — Form Pendaftaran Calon TNI AD TA 2027
 * Bound/standalone script: set Script Property SPREADSHEET_ID.
 * Test with dummy data first. Deploy only for authorized operator access.
 */
const APP = {
  spreadsheetId: PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "",
  sheets: { calon: "CALON", pendaftaran: "PENDAFTARAN", nilai: "NILAI_RAPORT", referensi: "REFERENSI", log: "LOG_AKTIVITAS", config: "KONFIGURASI" },
  timezone: "Asia/Jakarta"
};

function doGet(e) {
  const action = String(e && e.parameter && e.parameter.action || "health");
  try {
    if (action === "health") return json_({ ok: true, app: "Form Calon TNI AD TA 2027", version: "1.0.0" });
    if (action === "references") return json_({ ok: true, data: getReferences_() });
    return json_({ ok: false, error: "Action GET tidak dikenal." });
  } catch (err) { return json_({ ok: false, error: err.message || String(err) }); }
}
function doPost(e) {
  let body;
  try { body = JSON.parse(e && e.postData && e.postData.contents || "{}"); }
  catch (err) { return json_({ ok: false, error: "Body JSON tidak valid." }); }
  try {
    if (body.action === "createCandidate") return json_(createCandidate_(body.data || {}));
    return json_({ ok: false, error: "Action POST tidak dikenal." });
  } catch (err) { return json_({ ok: false, error: err.message || String(err) }); }
}
function createCandidate_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = spreadsheet_();
    const calonSh = requiredSheet_(ss, APP.sheets.calon);
    const daftarSh = requiredSheet_(ss, APP.sheets.pendaftaran);
    const nilaiSh = requiredSheet_(ss, APP.sheets.nilai);
    const calonHeaders = headers_(calonSh), daftarHeaders = headers_(daftarSh), nilaiHeaders = headers_(nilaiSh);
    const nik = digits_(d.NIK), kk = digits_(d.NOMOR_KK);
    if (!/^\d{16}$/.test(nik)) throw new Error("NIK wajib terdiri dari 16 digit.");
    if (!/^\d{16}$/.test(kk)) throw new Error("Nomor KK wajib terdiri dari 16 digit.");
    if (!String(d.NAMA_LENGKAP || "").trim()) throw new Error("Nama lengkap wajib diisi.");
    if (!String(d.JENIS_PENDAFTARAN || "").trim()) throw new Error("Jenis pendaftaran wajib dipilih.");
    if (existsValue_(calonSh, "NIK", nik)) throw new Error("NIK ini sudah terdaftar. Periksa data calon sebelum menginput ulang.");
    if (existsValue_(calonSh, "NOMOR_KK", kk) && !String(d.NIK || "").trim()) throw new Error("Nomor KK sudah ada.");
    const now = new Date(), idCalon = "CAL-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    const idPendaftaran = "DAF-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    const nomor = nextRegistrationNumber_(ss);
    const calon = {};
    calonHeaders.forEach(h => calon[h] = "");
    Object.assign(calon, d, {
      ID_CALON: idCalon, NIK: nik, NOMOR_KK: kk,
      TIMESTAMP_SUMBER: now, CREATED_AT: now, UPDATED_AT: now,
      CREATED_BY: "OPERATOR_WEB", UPDATED_BY: "OPERATOR_WEB"
    });
    delete calon.NILAI_RAPORT;
    appendObject_(calonSh, calonHeaders, calon);
    const daftar = {};
    daftarHeaders.forEach(h => daftar[h] = "");
    Object.assign(daftar, {
      ID_PENDAFTARAN: idPendaftaran, ID_CALON: idCalon, NOMOR_PENDAFTARAN: nomor,
      JENIS_PENDAFTARAN: String(d.JENIS_PENDAFTARAN || "").trim(),
      KODIM_DOMISILI: String(d.KODIM_DOMISILI || "").trim(),
      JUMLAH_PENDAFTARAN_TNI: d.JUMLAH_PENDAFTARAN_TNI || "",
      KRITERIA_PRESTASI_NASIONAL: d.KRITERIA_PRESTASI_NASIONAL || "",
      MOTIVASI_CALON: d.MOTIVASI_CALON || "", HOBI_CALON: d.HOBI_CALON || "",
      RIWAYAT_PEKERJAAN: d.RIWAYAT_PEKERJAAN || "", MEMILIKI_KEAHLIAN: d.MEMILIKI_KEAHLIAN || "",
      DETAIL_KEAHLIAN: d.DETAIL_KEAHLIAN || "", TANGGAL_VALIDASI: "", STATUS_VALIDASI: "BELUM_DIVERIFIKASI",
      VALIDATED_BY: "", CREATED_AT: now, UPDATED_AT: now, CREATED_BY: "OPERATOR_WEB", UPDATED_BY: "OPERATOR_WEB"
    });
    appendObject_(daftarSh, daftarHeaders, daftar);
    const scores = Array.isArray(d.NILAI_RAPORT) ? d.NILAI_RAPORT : [];
    const rows = [];
    scores.forEach(s => {
      if (String(s.NILAI_P || "") === "" && String(s.NILAI_K || "") === "") return;
      const row = {};
      nilaiHeaders.forEach(h => row[h] = "");
      Object.assign(row, {
        ID_NILAI: "NIL-" + Utilities.getUuid().slice(0, 8).toUpperCase(),
        ID_PENDAFTARAN: idPendaftaran, KELAS: s.KELAS || "", SEMESTER: s.SEMESTER || "",
        MATA_PELAJARAN: s.MATA_PELAJARAN || "", NILAI_P: numericOrBlank_(s.NILAI_P),
        NILAI_K: numericOrBlank_(s.NILAI_K), SUMBER_KOLOM_P: "", SUMBER_KOLOM_K: "",
        CREATED_AT: now, UPDATED_AT: now
      });
      rows.push(nilaiHeaders.map(h => row[h] === undefined ? "" : row[h]));
    });
    if (rows.length) nilaiSh.getRange(nilaiSh.getLastRow() + 1, 1, rows.length, nilaiHeaders.length).setValues(rows);
    log_(ss, "CREATE", "PENDAFTARAN", idPendaftaran, "Pendaftaran calon dibuat: " + nomor);
    return { ok: true, id_calon: idCalon, id_pendaftaran: idPendaftaran, nomor_pendaftaran: nomor, nilai_tersimpan: rows.length };
  } finally { lock.releaseLock(); }
}
function nextRegistrationNumber_(ss) {
  const sh = ss.getSheetByName(APP.sheets.pendaftaran);
  const headers = headers_(sh), ix = headers.indexOf("NOMOR_PENDAFTARAN");
  if (ix < 0) throw new Error("Header NOMOR_PENDAFTARAN tidak ditemukan.");
  const year = "2027", prefix = "TNIAD-" + year + "-";
  const lastRow = sh.getLastRow();
  let max = 0;
  if (lastRow > 1) {
    const vals = sh.getRange(2, ix + 1, lastRow - 1, 1).getDisplayValues().flat();
    vals.forEach(v => { const m = String(v).match(new RegExp("^" + prefix + "(\\d+)$")); if (m) max = Math.max(max, Number(m[1])); });
  }
  return prefix + String(max + 1).padStart(5, "0");
}
function getReferences_() {
  const sh = requiredSheet_(spreadsheet_(), APP.sheets.referensi);
  const rows = sh.getDataRange().getDisplayValues();
  if (rows.length < 2) return {};
  const heads = rows[0], ix = {}; heads.forEach((h,i) => ix[h] = i);
  const out = {};
  rows.slice(1).forEach(r => {
    const category = String(r[ix.KATEGORI] || "").trim();
    const label = String(r[ix.LABEL_OPSI] || "").trim();
    const active = String(r[ix.AKTIF] || "").toUpperCase();
    if (!category || !label || !["TRUE","YA","1","AKTIF"].includes(active)) return;
    if (!out[category]) out[category] = [];
    out[category].push({ value: label, label: label, code: r[ix.KODE_OPSI] || "" });
  });
  return out;
}
function existsValue_(sh, header, value) {
  const headers = headers_(sh), ix = headers.indexOf(header);
  if (ix < 0 || sh.getLastRow() < 2) return false;
  return !!sh.getRange(2, ix + 1, sh.getLastRow() - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findNext();
}
function appendObject_(sh, headers, obj) {
  sh.appendRow(headers.map(h => obj[h] === undefined || obj[h] === null ? "" : obj[h]));
}
function log_(ss, action, entity, id, summary) {
  const sh = ss.getSheetByName(APP.sheets.log); if (!sh) return;
  const headers = headers_(sh), obj = {
    ID_LOG: Utilities.getUuid(), WAKTU: new Date(), ID_PENGGUNA: "OPERATOR_WEB",
    AKSI: action, ENTITAS: entity, ID_ENTITAS: id, RINGKASAN: summary,
    DETAIL_JSON: JSON.stringify({ source: "operator-form" })
  };
  appendObject_(sh, headers, obj);
}
function spreadsheet_() {
  if (!APP.spreadsheetId) throw new Error("SPREADSHEET_ID belum disetel di Apps Script > Project Settings > Script Properties.");
  return SpreadsheetApp.openById(APP.spreadsheetId);
}
function requiredSheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error("Sheet wajib tidak ditemukan: " + name);
  return sh;
}
function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim());
}
function digits_(v) { return String(v === undefined || v === null ? "" : v).replace(/\D/g, ""); }
function numericOrBlank_(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Nilai rapor harus berupa angka 0–100.");
  return n;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}