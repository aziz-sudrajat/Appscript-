// ================= KONFIGURASI UTAMA =================
var token = ""; 
var fallbackSheetId = ""; 
var telegramUrl = "https://api.telegram.org/bot" + token;

// Gemini API Key untuk Vision OCR
var geminiApiKey = "";

// Chat ID / Grup ID Telegram tujuan pengiriman Auto Report Jam 07:00 (Opsional)
var defaultReportChatId = ""; 

// Password default awal (dapat diubah via command /sudo 'pass' changepass)
var defaultSudoPassword = "sandiku"; 
var adminChatIds = [];

// ================= SISTEM PASSWORD & PROJECT LOCK =================
function getSudoPassword() {
  var props = PropertiesService.getScriptProperties();
  var pass = props.getProperty("SUDO_PASSWORD");
  if (!pass) {
    props.setProperty("SUDO_PASSWORD", defaultSudoPassword);
    return defaultSudoPassword;
  }
  return pass;
}

function setSudoPassword(newPass) {
  PropertiesService.getScriptProperties().setProperty("SUDO_PASSWORD", newPass);
}

function isProjectLocked(projectName) {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty("LOCK_" + projectName.toUpperCase().trim()) === "true";
}

function setProjectLock(projectName, lockState) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty("LOCK_" + projectName.toUpperCase().trim(), lockState ? "true" : "false");
}

// ================= WEBHOOK =================
function setWebhook() {
  var webAppUrl = "";
  var response = UrlFetchApp.fetch(telegramUrl + "/setWebhook?url=" + webAppUrl);
  Logger.log(response.getContentText());
}

// ================= FUNGSI TIME TRIGGER (AUTO BROADCAST) =================
function testAutoReport1Minute() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "sendDailyReportAutomatic") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("sendDailyReportAutomatic")
    .timeBased()
    .after(60 * 1000)
    .create();
    
  Logger.log("✅ Trigger test 1 menit berhasil dipasang.");
}

function setAutoDailyReportTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "sendDailyReportAutomatic") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("sendDailyReportAutomatic")
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .inTimezone("Asia/Jakarta")
    .create();
    
  Logger.log("✅ Jadwal Harian Pukul 07:00 WIB berhasil disetel.");
}

function sendDailyReportAutomatic() {
  var targetChatId = PropertiesService.getScriptProperties().getProperty("LAST_CHAT_ID") || defaultReportChatId;
  if (!targetChatId) {
    Logger.log("⚠️ Chat ID tujuan belum terdeteksi.");
    return;
  }
  
  var master = getMasterData();
  var done = getDoneData(master);
  var projectSheets = getProjectSheets(getSpreadsheet());
  var tglStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  
  var msg = "🔔 *LAPORAN OTOMATIS MONITORING PRODUKSI*\n" +
            "🕒 *Waktu:* " + tglStr + " WIB\n\n" +
            "📋 *RINGKASAN STATUS TIAP PROJECT:*\n\n";
            
  var grandBeratMaster = 0, grandBeratDone = 0;
  var grandLuasMaster = 0, grandLuasDone = 0;
  var grandJpMaster = 0, grandJpDone = 0;
  
  projectSheets.forEach(function(sheet, index) {
    var pName = sheet.getName();
    var pMaster = getMasterData(pName);
    var pDone = getDoneData(pMaster, pName);
    
    var progBerat = pMaster.totalBerat > 0 ? (pDone.berat / pMaster.totalBerat) * 100 : 0;
    var progLuas = pMaster.totalLuas > 0 ? (pDone.luas / pMaster.totalLuas) * 100 : 0;
    var progJp = pMaster.totalJp > 0 ? (pDone.jp / pMaster.totalJp) * 100 : 0;
    
    grandBeratMaster += pMaster.totalBerat;
    grandBeratDone += pDone.berat;
    grandLuasMaster += pMaster.totalLuas;
    grandLuasDone += pDone.luas;
    grandJpMaster += pMaster.totalJp;
    grandJpDone += pDone.jp;
    
    msg += (index + 1) + "️⃣ *Project: " + pName + "*\n" +
           "   • Tonase: `" + progBerat.toFixed(1) + "%` (" + pDone.berat.toFixed(1) + "/" + pMaster.totalBerat.toFixed(1) + " Kg)\n" +
           "   • Luas: `" + progLuas.toFixed(1) + "%` (" + pDone.luas.toFixed(1) + "/" + pMaster.totalLuas.toFixed(1) + " m²)\n" +
           "   • Selesai: *" + pDone.jp + "/" + pMaster.totalJp + "* item\n\n";
  });
  
  var totalProgBerat = grandBeratMaster > 0 ? (grandBeratDone / grandBeratMaster) * 100 : 0;
  var totalProgLuas = grandLuasMaster > 0 ? (grandLuasDone / grandLuasMaster) * 100 : 0;
  var totalProgJp = grandJpMaster > 0 ? (grandJpDone / grandJpMaster) * 100 : 0;
  
  msg += "➖➖➖➖➖➖➖➖➖➖\n" +
         "🌐 *GRAND TOTAL PROGRESS GLOBAL:*\n" +
         "⚖️ *Tonase:* `" + totalProgBerat.toFixed(2) + "%` (" + grandBeratDone.toFixed(2) + " / " + grandBeratMaster.toFixed(2) + " Kg)\n" +
         "📏 *Luas Area:* `" + totalProgLuas.toFixed(2) + "%` (" + grandLuasDone.toFixed(2) + " / " + grandLuasMaster.toFixed(2) + " m²)\n" +
         "📦 *Total Item:* `" + totalProgJp.toFixed(2) + "%` (" + grandJpDone + " / " + grandJpMaster + " item)";
         
  sendMessage(targetChatId, msg);
}

// ================= FUNGSI UTAMA (DO POST) =================
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return;
  var contents = JSON.parse(e.postData.contents);
  if (!contents.message) return;
  
  var chatId = contents.message.chat.id;
  var text = contents.message.text || "";
  var caption = contents.message.caption || "";
  var photo = contents.message.photo;
  
  PropertiesService.getScriptProperties().setProperty("LAST_CHAT_ID", String(chatId));
  
  try {
    // 1. DETEKSI GAMBAR DENGAN CAPTION /ocr
    if (photo && caption.toLowerCase().startsWith("/ocr")) {
      handlePhotoOCR(chatId, photo, caption);
      return;
    }
    
    // 2. DETEKSI COMMAND TEKS
    if (text.toLowerCase().startsWith("/sudo")) {
      handleSudoRouter(chatId, text);
    } else if (text.toLowerCase().startsWith("/input")) {
      handleInput(chatId, text);
    } else if (text.toLowerCase().startsWith("/projects")) {
      handleListProjects(chatId);
    } else if (text.toLowerCase().startsWith("/check")) {
      handleCheck(chatId, text);
    } else if (text.toLowerCase().startsWith("/testreport")) {
      sendDailyReportAutomatic();
    } else if (text.toLowerCase().startsWith("/export")) {
      handleExportPDF(chatId, text);
    } else if (text.toLowerCase().startsWith("/backup")) {
      handleBackup(chatId);
    } else if (text.toLowerCase().startsWith("/search")) {
      handleSearch(chatId, text);
    } else if (text.toLowerCase().startsWith("/update")) {
      handleUpdate(chatId, text);
    } else if (text.toLowerCase().startsWith("/delete") || text.toLowerCase().startsWith("/delet")) {
      handleDelete(chatId, text);
    } else if (text.toLowerCase().startsWith("/remaining")) {
      handleRemaining(chatId, text);
    } else if (text.toLowerCase().startsWith("/help") || text.toLowerCase().startsWith("/start")) {
      handleHelp(chatId);
    }
  } catch(error) {
    sendMessage(chatId, "⚠️ *Error Log:* " + error.message);
  }
}

// ================= KONEKSI SPREADSHEET =================
function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    try {
      ss = SpreadsheetApp.openById(fallbackSheetId);
    } catch(err) {
      throw new Error("Gagal mengakses Spreadsheet. Pastikan ID dan Hak Akses Editor tersedia.");
    }
  }
  return ss;
}

function getProjectSheets(ss) {
  var sheets = ss.getSheets();
  var projectSheets = [];
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    var upperName = name.toUpperCase().trim();
    if (name.toLowerCase() !== "input" && !upperName.startsWith("LK")) {
      projectSheets.push(sheets[i]);
    }
  }
  if (projectSheets.length === 0) throw new Error("Tidak ada sheet master project valid yang ditemukan.");
  return projectSheets;
}

function getSpecificMasterSheet(ss, projectName) {
  var cleanTarget = projectName.toUpperCase().trim();
  if (cleanTarget.startsWith("LK") || cleanTarget === "INPUT") return null;

  var sheet = ss.getSheetByName(projectName);
  if (sheet && !sheet.getName().toUpperCase().trim().startsWith("LK")) return sheet;
  
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    var upperName = name.toUpperCase().trim();
    if (name.toLowerCase() !== "input" && !upperName.startsWith("LK") && name.toLowerCase() === projectName.toLowerCase()) {
      return sheets[i];
    }
  }
  return null;
}

function getInputSheet(ss) {
  var sheet = ss.getSheetByName("Input");
  if (!sheet) {
    sheet = ss.insertSheet("Input");
    sheet.appendRow(["NO", "TANGGAL", "PROJECT", "KODE PRODUK", "JUMLAH", "PRODUKSI", "QC"]);
  } else {
    var header = sheet.getRange(1, 1, 1, 7).getValues()[0];
    if (header[2] !== "PROJECT") {
      sheet.getRange(1, 1, 1, 7).setValues([["NO", "TANGGAL", "PROJECT", "KODE PRODUK", "JUMLAH", "PRODUKSI", "QC"]]);
    }
  }
  return sheet;
}

// ================= PENGOLAHAN DATA MASTER =================
function getMasterData(projectName) {
  var ss = getSpreadsheet();
  var sheetsToRead = [];
  
  if (projectName) {
    var specificSheet = getSpecificMasterSheet(ss, projectName);
    if (!specificSheet) throw new Error("Project `" + projectName + "` tidak ditemukan atau diabaikan (berawalan LK).");
    sheetsToRead.push(specificSheet);
  } else {
    sheetsToRead = getProjectSheets(ss);
  }
  
  var master = {};
  var totalBerat = 0; var totalLuas = 0; var totalJp = 0;
  
  sheetsToRead.forEach(function(sheet) {
    var currentProject = sheet.getName();
    var data = sheet.getDataRange().getValues();
    var startRow = 8;
    
    for (var i = 0; i < Math.min(data.length, 25); i++) {
      for (var j = 0; j < data[i].length; j++) {
        if (data[i][j] && String(data[i][j]).toUpperCase().includes("KODE PRODUK")) {
          startRow = i + 1;
          break;
        }
      }
    }

    for (var i = startRow; i < data.length; i++) {
      var kode = data[i][2]; // Kolom C
      if (!kode || String(kode).toUpperCase().includes("GRAND TOTAL")) continue;
      
      kode = String(kode).trim();
      var key = currentProject + "|" + kode;
      var jp = parseFloat(data[i][8]) || 0;     // Kolom I: JP
      var berat = parseFloat(data[i][9]) || 0;  // Kolom J: Berat
      var luas = parseFloat(data[i][10]) || 0;  // Kolom K: Luas
      var ral = data[i][11] ? String(data[i][11]).trim() : "-"; // Kolom L: Warna
      
      master[key] = {
        project: currentProject,
        kode: kode,
        jp: jp, 
        berat: berat, 
        luas: luas, 
        ral: ral,
        unit_berat: jp > 0 ? (berat / jp) : 0,
        unit_luas: jp > 0 ? (luas / jp) : 0,
        done: 0
      };
      totalBerat += berat; totalLuas += luas; totalJp += jp;
    }
  });
  
  return { list: master, totalBerat: totalBerat, totalLuas: totalLuas, totalJp: totalJp };
}

function getDoneData(master, filterProject) {
  var ss = getSpreadsheet();
  var sheet = getInputSheet(ss);
  var data = sheet.getDataRange().getValues();
  var doneBerat = 0; var doneLuas = 0; var doneJp = 0;
  
  if (data.length <= 1) return { berat: 0, luas: 0, jp: 0 };
  
  for (var i = 1; i < data.length; i++) {
    var pName = data[i][2] ? String(data[i][2]).trim() : "";
    var kode = data[i][3] ? String(data[i][3]).trim() : "";
    var jumlah = parseFloat(data[i][4]) || 0;
    
    if (pName.toUpperCase().startsWith("LK")) continue;
    if (filterProject && pName.toLowerCase() !== filterProject.toLowerCase()) continue;
    
    var key = pName + "|" + kode;
    if (master.list[key]) {
      master.list[key].done += jumlah;
      doneBerat += (master.list[key].unit_berat * jumlah);
      doneLuas += (master.list[key].unit_luas * jumlah);
      doneJp += jumlah;
    }
  }
  return { berat: doneBerat, luas: doneLuas, jp: doneJp };
}

// ================= HANDLER PERINTAH DASAR =================
function handleHelp(chatId) {
  var msg = "📖 *PANDUAN LENGKAP PENGGUNAAN BOT PRODUKSI*\n" +
            "Sistem monitoring & pencatatan marking pengecatan multi-project.\n\n" +
            "═══════════════════════\n" +
            "📌 *PERINTAH OPERASIONAL HARIAN*\n" +
            "═══════════════════════\n\n" +
            "1️⃣ `/projects`\n" +
            "Melihat daftar seluruh sheet master project aktif.\n\n" +
            "2️⃣ `/check KODE_PRODUK`\n" +
            "Mengecek spesifikasi cepat suatu produk (JP, Done, Sisa, Tonase, Luas, RAL).\n" +
            "*Contoh:* `/check WB400x400`\n\n" +
            "3️⃣ `/input PROJECT TIM QC`\n" +
            "Mencatat hasil kerja harian/shift secara multi-baris.\n" +
            "*Format:*\n" +
            "`/input LP_JP_UP00 TIM_A BUDI`\n" +
            "`WB400x400 10`\n" +
            "`HB200x200 5`\n\n" +
            "4️⃣ `/update [PROJECT]`\n" +
            "Melihat persentase progress (Tonase, Luas Area, Qty Item).\n" +
            "• Semua Project: `/update`\n" +
            "• Spesifik: `/update LP_JP_UP00`\n\n" +
            "5️⃣ `/remaining [PROJECT]`\n" +
            "Melihat daftar sisa barang yang belum selesai beserta tonase, luas, dan kode warna RAL.\n\n" +
            "6️⃣ `/search KODE_PRODUK [PROJECT]`\n" +
            "Melihat riwayat entri marking suatu produk (tanggal, tim, QC).\n\n" +
            "7️⃣ `/delete KODE_PRODUK [PROJECT]`\n" +
            "Menghapus 1 entri input *terakhir* produk jika terjadi salah ketik.\n\n" +
            "📄 **EKSPOR & BACKUP:**\n" +
            "8️⃣ `/export [PROJECT]`\n" +
            "Mengonversi sheet project langsung menjadi file PDF ke Telegram.\n\n" +
            "9️⃣ `/backup`\n" +
            "Membuat salinan snapshot Spreadsheet ke Google Drive arsip.\n\n" +
            "🔔 `/testreport`\n" +
            "Menguji kirim laporan harian bot secara langsung ke chat.\n\n" +
            "📸 **OCR GEMINI AI (BACA FOTO DOKUMEN):**\n" +
            "Kirim Foto dokumen/surat jalan dengan caption:\n" +
            "• Auto Input Cerdas: `/ocr` (Bot mencocokkan project dan tanda tangan secara inisiatif)\n" +
            "• Manual Input: `/ocr LP_JP_UP00 TIM_A BUDI`\n\n" +
            "═══════════════════════\n" +
            "⚡️ *PERINTAH SUPER USER (/sudo)*\n" +
            "═══════════════════════\n" +
            "• `/sudo 'pass' project closed <PROJECT>`\n" +
            "• `/sudo 'pass' reset project <PROJECT>`\n" +
            "• `/sudo 'pass' set remaining <PROJECT> <KODE> <SISA>`\n" +
            "• `/sudo 'pass' lock project <PROJECT>`\n" +
            "• `/sudo 'pass' unlock project <PROJECT>`\n" +
            "• `/sudo 'pass' create project <PROJECT>`\n" +
            "• `/sudo 'pass' archive project <PROJECT>`\n" +
            "• `/sudo 'pass' audit <PROJECT>`\n" +
            "• `/sudo 'pass' report daily [DD/MM/YYYY]`\n" +
            "• `/sudo 'pass' clear inputs <DD/MM/YYYY>`\n" +
            "• `/sudo 'pass' changepass <PASS_LAMA> <PASS_BARU>`\n" +
            "• `/sudo 'pass' broadcast <PESAN>`";
            
  sendMessage(chatId, msg);
}

function handleListProjects(chatId) {
  var ss = getSpreadsheet();
  var sheets = getProjectSheets(ss);
  var list = sheets.map(function(s, idx) {
    var isLocked = isProjectLocked(s.getName()) ? " 🔒 *(LOCKED)*" : "";
    return (idx + 1) + ". `" + s.getName() + "`" + isLocked;
  }).join("\n");
  
  sendMessage(chatId, "📁 *DAFTAR PROJECT AKTIF (Non-LK):*\n\n" + list + "\n\n_Gunakan nama project di atas saat input atau cek update._");
}

function handleCheck(chatId, text) {
  var parts = text.split(" ");
  if (parts.length < 2) return sendMessage(chatId, "⚠️ Gunakan format: `/check KODE_PRODUK`\n*Contoh:* `/check WB400x400`");
  
  var targetKode = parts[1].trim();
  var master = getMasterData();
  getDoneData(master);
  
  var found = false;
  var msg = "🔎 *DETAIL SPESIFIKASI PRODUK: " + targetKode + "*\n\n";
  
  for (var key in master.list) {
    var item = master.list[key];
    if (item.kode.toLowerCase() === targetKode.toLowerCase()) {
      found = true;
      var sisa = item.jp - item.done;
      var status = (sisa === 0) ? "✅ CLOSE" : (sisa < 0 ? "❗️ OVER " + Math.abs(sisa) : "⏳ REMAINING " + sisa);
      
      msg += "📁 *Project:* `" + item.project + "`\n" +
             "   • Total JP: *" + item.jp + "* item\n" +
             "   • Selesai (Done): *" + item.done + "* item\n" +
             "   • Sisa: *" + sisa + "* item\n" +
             "   • Status: *" + status + "*\n" +
             "   • Berat Satuan: `" + item.unit_berat.toFixed(2) + " Kg` (Total: " + item.berat.toFixed(2) + " Kg)\n" +
             "   • Luas Satuan: `" + item.unit_luas.toFixed(2) + " m²` (Total: " + item.luas.toFixed(2) + " m²)\n" +
             "   • Warna RAL: " + item.ral + "\n\n";
    }
  }
  
  if (!found) {
    sendMessage(chatId, "❌ Produk `" + targetKode + "` tidak ditemukan pada seluruh project master aktif.");
  } else {
    sendMessage(chatId, msg);
  }
}

function handleExportPDF(chatId, text) {
  var parts = text.split(" ");
  var targetProject = parts.length > 1 ? parts.slice(1).join(" ").trim() : null;
  var ss = getSpreadsheet();
  var ssId = ss.getId();
  
  sendMessage(chatId, "⏳ *Sedang mengonversi dan menyiapkan file PDF... Harap tunggu sebentar.*");
  
  var sheetIdParam = "";
  var docTitle = "Export_Produksi_Semua";
  
  if (targetProject) {
    var specificSheet = getSpecificMasterSheet(ss, targetProject);
    if (!specificSheet) {
      return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan.");
    }
    sheetIdParam = "&gid=" + specificSheet.getSheetId();
    docTitle = "Export_" + specificSheet.getName();
  }
  
  var url = "https://docs.google.com/spreadsheets/d/" + ssId + "/export?" +
            "exportFormat=pdf&format=pdf" +
            "&size=A4" +
            "&portrait=false" +
            "&fitw=true" +
            "&gridlines=true" +
            "&printtitle=false" +
            sheetIdParam;
            
  var tokenOAuth = ScriptApp.getOAuthToken();
  var response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + tokenOAuth },
    muteHttpExceptions: true
  });
  
  var blob = response.getBlob().setName(docTitle + "_" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmm") + ".pdf");
  sendTelegramDocument(chatId, blob, "📄 Berikut file ekspor laporan PDF untuk: *" + (targetProject || "Semua Project") + "*");
}

function handleBackup(chatId) {
  sendMessage(chatId, "⏳ *Sedang membuat file backup spreadsheet...*");
  
  var ss = getSpreadsheet();
  var ssFile = DriveApp.getFileById(ss.getId());
  var backupName = "BACKUP_" + ss.getName() + "_" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
  var copyFile = ssFile.makeCopy(backupName);
  
  var msg = "💾 *BACKUP SPREADSHEET BERHASIL DIBUAT!*\n\n" +
            "📁 *Nama File:* `" + backupName + "`\n" +
            "🕒 *Waktu:* " + Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss") + "\n" +
            "🔗 *Link Download Google Drive:*\n" + copyFile.getUrl();
            
  sendMessage(chatId, msg);
}

function handleInput(chatId, text) {
  var lines = text.split("\n");
  var firstLine = lines[0].trim();
  
  if (lines.length < 2) {
    return sendMessage(chatId, "⚠️ *Format Salah*\nGunakan format multi-baris:\n`/input NAMA_PROJECT TIM_PRODUKSI QC\nKODE_PRODUK JUMLAH\nKODE_PRODUK JUMLAH`\n\n_Ketik `/projects` untuk melihat nama sheet project._");
  }
  
  // Hapus awalan /input
  var rawHeader = firstLine.replace(/^\/input\s+/i, "").trim();
  
  var ss = getSpreadsheet();
  var projectSheets = getProjectSheets(ss);
  var actualProjectName = "";
  var remainingHeader = "";
  
  // Cari kecocokan nama project multi-kata dari daftar sheet aktif
  for (var p = 0; p < projectSheets.length; p++) {
    var pSheetName = projectSheets[p].getName();
    if (rawHeader.toLowerCase().startsWith(pSheetName.toLowerCase())) {
      actualProjectName = pSheetName;
      remainingHeader = rawHeader.substring(pSheetName.length).trim();
      break;
    }
  }
  
  // Fallback pemotongan standar jika tidak cocok persis
  var headerParts = rawHeader.split(" ");
  if (!actualProjectName) {
    if (headerParts.length < 3) {
      return sendMessage(chatId, "❌ Project tidak dikenali atau format Tim & QC belum lengkap. Periksa nama sheet via `/projects`.");
    }
    var specificSheet = getSpecificMasterSheet(ss, headerParts[0]);
    if (!specificSheet) {
      return sendMessage(chatId, "❌ Project `" + headerParts[0] + "` tidak ditemukan atau diabaikan. Ketik `/projects`.");
    }
    actualProjectName = specificSheet.getName();
    remainingHeader = headerParts.slice(1).join(" ").trim();
  }
  
  if (actualProjectName.toUpperCase().startsWith("LK")) {
    return sendMessage(chatId, "❌ Sheet/Project dengan awalan `LK` diabaikan.");
  }

  if (isProjectLocked(actualProjectName)) {
    return sendMessage(chatId, "🔒 *Project Terkunci:* Project `" + actualProjectName + "` sedang dikunci oleh Supervisor. Input data ditolak.");
  }
  
  var subParts = remainingHeader.split(" ");
  var produksi = subParts[0] || "PRODUKSI";
  var qc = subParts.slice(1).join(" ") || "QC";

  var masterData = getMasterData(actualProjectName);
  getDoneData(masterData, actualProjectName); 
  
  var sheetInput = getInputSheet(ss);
  var lastRow = sheetInput.getLastRow();
  var no = 1;
  if (lastRow > 1) {
    var lastNo = sheetInput.getRange(lastRow, 1).getValue();
    no = (parseInt(lastNo) || 0) + 1;
  }
  
  var tanggal = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  var msgSuccess = "✅ *DATA BERHASIL DIINPUT*\nProject: `" + actualProjectName + "`\nProduksi: " + produksi + " | QC: " + qc + "\n\n";
  var msgError = "";
  var msgWarning = "";
  var rowsToAppend = [];
  
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === "") continue;
    
    var parts = line.split(" ");
    if (parts.length < 2) {
       msgError += "❌ Baris `" + line + "` format salah (KODE JUMLAH)\n";
       continue;
    }
    
    var kode = parts[0].trim();
    var jumlah = parseFloat(parts[1]);
    var key = actualProjectName + "|" + kode;
    
    if (!masterData.list[key]) {
      msgError += "❌ `" + kode + "` tidak ditemukan di sheet project `" + actualProjectName + "`.\n";
      continue;
    }
    
    var item = masterData.list[key];
    var currentDone = item.done;
    var maxJp = item.jp;
    var ral = item.ral; 
    
    var newDone = currentDone + jumlah;
    var remaining = maxJp - newDone;
    
    rowsToAppend.push([no, tanggal, actualProjectName, kode, jumlah, produksi, qc]);
    item.done = newDone; 
    
    if (remaining < 0) {
      var over = Math.abs(remaining);
      msgWarning += "⚠️ `" + kode + "` Sisa butuh: " + (maxJp - currentDone) + " | Diinput: " + jumlah + " *(OVER: " + over + ")*\n";
      msgSuccess += "▪️ `" + kode + "` (" + jumlah + " item)\n     Status: ❗️ *OVER " + over + "* | 🎨 " + ral + "\n";
    } else if (remaining === 0) {
      msgSuccess += "▪️ `" + kode + "` (" + jumlah + " item)\n     Status: ✅ *CLOSE* | 🎨 " + ral + "\n";
    } else {
      msgSuccess += "▪️ `" + kode + "` (" + jumlah + " item)\n     Status: ⏳ *REMAINING " + remaining + "* | 🎨 " + ral + "\n";
    }
    no++;
  }
  
  if (rowsToAppend.length > 0) {
    var startRow = lastRow + 1;
    sheetInput.getRange(startRow, 1, rowsToAppend.length, 7).setValues(rowsToAppend);
    updateKeteranganLP(actualProjectName);
  }
  
  var finalMessage = "";
  if (rowsToAppend.length > 0) finalMessage += msgSuccess + "\n";
  if (msgWarning !== "") finalMessage += "--- 🚨 PERINGATAN OVER PRODUKSI ---\n" + msgWarning + "\n";
  if (msgError !== "") finalMessage += "--- ❌ GAGAL INPUT ---\n" + msgError;
  
  if (finalMessage !== "") sendMessage(chatId, finalMessage.trim());
}

function handleSearch(chatId, text) {
  var parts = text.split(" ");
  if (parts.length < 2) return sendMessage(chatId, "Gunakan format:\n`/search KODE_PRODUK [NAMA_PROJECT]`");
  
  var kodeSearch = parts[1].trim();
  var filterProject = parts.length > 2 ? parts.slice(2).join(" ").trim() : null;
  
  var ss = getSpreadsheet();
  var sheet = getInputSheet(ss);
  var data = sheet.getDataRange().getValues();
  var result = []; var total = 0;
  
  if (data.length <= 1) return sendMessage(chatId, "Belum ada riwayat input.");
  
  for (var i = 1; i < data.length; i++) {
    var pName = data[i][2] ? String(data[i][2]).trim() : "";
    var pKode = data[i][3] ? String(data[i][3]).trim() : "";
    
    if (pName.toUpperCase().startsWith("LK")) continue;
    if (filterProject && pName.toLowerCase() !== filterProject.toLowerCase()) continue;
    
    if (pKode.toLowerCase() === kodeSearch.toLowerCase()) {
      var tgl = (data[i][1] instanceof Date) ? Utilities.formatDate(data[i][1], "GMT+7", "dd/MM/yyyy HH:mm") : data[i][1];
      var jml = parseFloat(data[i][4]) || 0;
      result.push("- [" + pName + "] " + tgl + " | Qty: " + jml + " | Prod: " + data[i][5] + " | QC: " + data[i][6]);
      total += jml;
    }
  }
  
  if (result.length > 0) {
    sendMessage(chatId, "🔍 *Riwayat Marking: " + kodeSearch + "*\n\n" + result.join("\n") + "\n\n*Total Selesai: " + total + " item*");
  } else {
    sendMessage(chatId, "Kode `" + kodeSearch + "` tidak ditemukan pada riwayat.");
  }
}

function handleUpdate(chatId, text) {
  var parts = text.split(" ");
  var targetProject = parts.length > 1 ? parts.slice(1).join(" ").trim() : null;
  var ss = getSpreadsheet();
  
  if (targetProject) {
    if (targetProject.toUpperCase().startsWith("LK")) {
      return sendMessage(chatId, "⚠️ Sheet/Project dengan awalan `LK` diabaikan.");
    }
    
    var specificSheet = getSpecificMasterSheet(ss, targetProject);
    if (!specificSheet) {
      return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan. Ketik `/projects`.");
    }
    var actualProjectName = specificSheet.getName();
    var master = getMasterData(actualProjectName);
    var done = getDoneData(master, actualProjectName);
    
    var progBerat = master.totalBerat > 0 ? (done.berat / master.totalBerat) * 100 : 0;
    var progLuas = master.totalLuas > 0 ? (done.luas / master.totalLuas) * 100 : 0;
    var progJp = master.totalJp > 0 ? (done.jp / master.totalJp) * 100 : 0;
    
    var msg = "📊 *PROGRESS PROJECT: " + actualProjectName + "*\n\n" +
              "⚖️ *Tonase:* `" + progBerat.toFixed(2) + "%`\n" +
              "   (" + done.berat.toFixed(2) + " / " + master.totalBerat.toFixed(2) + " Kg)\n\n" +
              "📏 *Luas Area:* `" + progLuas.toFixed(2) + "%`\n" +
              "   (" + done.luas.toFixed(2) + " / " + master.totalLuas.toFixed(2) + " m²)\n\n" +
              "📦 *Total Item:* `" + progJp.toFixed(2) + "%`\n" +
              "   (" + done.jp + " / " + master.totalJp + " item)";
    return sendMessage(chatId, msg);
  }
  
  var projectSheets = getProjectSheets(ss);
  var msgAll = "📊 *REKAP PROGRESS TIAP PROJECT*\n\n";
  
  var grandBeratMaster = 0, grandBeratDone = 0;
  var grandLuasMaster = 0, grandLuasDone = 0;
  var grandJpMaster = 0, grandJpDone = 0;
  
  projectSheets.forEach(function(sheet, index) {
    var pName = sheet.getName();
    var master = getMasterData(pName);
    var done = getDoneData(master, pName);
    
    var progBerat = master.totalBerat > 0 ? (done.berat / master.totalBerat) * 100 : 0;
    var progLuas = master.totalLuas > 0 ? (done.luas / master.totalLuas) * 100 : 0;
    var progJp = master.totalJp > 0 ? (done.jp / master.totalJp) * 100 : 0;
    
    grandBeratMaster += master.totalBerat;
    grandBeratDone += done.berat;
    grandLuasMaster += master.totalLuas;
    grandLuasDone += done.luas;
    grandJpMaster += master.totalJp;
    grandJpDone += done.jp;
    
    var block = (index + 1) + "️⃣ *PROJECT: " + pName + "*\n" +
                "   ⚖️ Tonase: `" + progBerat.toFixed(1) + "%` (" + done.berat.toFixed(1) + "/" + master.totalBerat.toFixed(1) + " Kg)\n" +
                "   📏 Luas: `" + progLuas.toFixed(1) + "%` (" + done.luas.toFixed(1) + "/" + master.totalLuas.toFixed(1) + " m²)\n" +
                "   📦 Item: `" + progJp.toFixed(1) + "%` (" + done.jp + "/" + master.totalJp + " item)\n\n";
                
    if ((msgAll.length + block.length) > 3500) {
      sendMessage(chatId, msgAll);
      msgAll = "";
    }
    msgAll += block;
  });
  
  var totalProgBerat = grandBeratMaster > 0 ? (grandBeratDone / grandBeratMaster) * 100 : 0;
  var totalProgLuas = grandLuasMaster > 0 ? (grandLuasDone / grandLuasMaster) * 100 : 0;
  var totalProgJp = grandJpMaster > 0 ? (grandJpDone / grandJpMaster) * 100 : 0;
  
  var grandSummary = "➖➖➖➖➖➖➖➖➖➖\n" +
                     "🌐 *GRAND TOTAL (SEMUA PROJECT):*\n" +
                     "⚖️ *Tonase:* `" + totalProgBerat.toFixed(2) + "%` (" + grandBeratDone.toFixed(2) + " / " + grandBeratMaster.toFixed(2) + " Kg)\n" +
                     "📏 *Luas Area:* `" + totalProgLuas.toFixed(2) + "%` (" + grandLuasDone.toFixed(2) + " / " + grandLuasMaster.toFixed(2) + " m²)\n" +
                     "📦 *Total Item:* `" + totalProgJp.toFixed(2) + "%` (" + grandJpDone + " / " + grandJpMaster + " item)";
                     
  if ((msgAll.length + grandSummary.length) > 4000) {
    sendMessage(chatId, msgAll);
    sendMessage(chatId, grandSummary);
  } else {
    msgAll += grandSummary;
    sendMessage(chatId, msgAll);
  }
}

function handleDelete(chatId, text) {
  var parts = text.split(" ");
  if (parts.length < 2) return sendMessage(chatId, "Gunakan format:\n`/delete KODE_PRODUK [NAMA_PROJECT]`");
  
  var kodeDelete = parts[1].trim();
  var targetProject = parts.length > 2 ? parts.slice(2).join(" ").trim() : null;
  
  var ss = getSpreadsheet();
  var sheet = getInputSheet(ss);
  var data = sheet.getDataRange().getValues();
  var rowToDelete = -1;
  var deletedProject = "";
  
  if (data.length <= 1) return sendMessage(chatId, "❌ Belum ada data di sheet Input.");
  
  for (var i = data.length - 1; i >= 1; i--) {
    var pName = data[i][2] ? String(data[i][2]).trim() : "";
    var pKode = data[i][3] ? String(data[i][3]).trim() : "";
    
    if (pName.toUpperCase().startsWith("LK")) continue;
    if (targetProject && pName.toLowerCase() !== targetProject.toLowerCase()) continue;
    
    if (pKode.toLowerCase() === kodeDelete.toLowerCase()) {
      rowToDelete = i + 1;
      deletedProject = pName;
      break;
    }
  }
  
  if (rowToDelete > -1) {
    sheet.deleteRow(rowToDelete);
    if (deletedProject) updateKeteranganLP(deletedProject); 
    sendMessage(chatId, "✅ Input TERAKHIR untuk *" + kodeDelete + "* pada project `" + deletedProject + "` berhasil dihapus.\n🔄 *Status Keterangan telah diperbarui.*");
  } else {
    sendMessage(chatId, "❌ Kode `" + kodeDelete + "` tidak ditemukan di riwayat sheet Input.");
  }
}

function handleRemaining(chatId, text) {
  var parts = text.split(" ");
  var targetProject = parts.length > 1 ? parts.slice(1).join(" ").trim() : null;
  
  if (targetProject && targetProject.toUpperCase().startsWith("LK")) {
    return sendMessage(chatId, "⚠️ Sheet/Project dengan awalan `LK` diabaikan.");
  }

  var master = getMasterData(targetProject);
  getDoneData(master, targetProject);
  
  var headerTitle = targetProject ? "PROJECT: " + targetProject : "SEMUA PROJECT";
  var msg = "📋 *DAFTAR REMAINING PRODUKSI (" + headerTitle + ")*\n\n";
  var count = 0;
  var totalSisaItem = 0, totalSisaBerat = 0, totalSisaLuas = 0;
  
  for (var key in master.list) {
    var item = master.list[key];
    var sisa = item.jp - item.done;
    
    if (sisa > 0) {
      var sisaBerat = item.unit_berat * sisa;
      var sisaLuas = item.unit_luas * sisa;
      
      totalSisaItem += sisa;
      totalSisaBerat += sisaBerat;
      totalSisaLuas += sisaLuas;
      
      var line = "▪️ `[" + item.project + "]` *" + item.kode + "*\n" +
                 "   • Sisa: *" + sisa + "* item (Done: " + item.done + "/" + item.jp + ")\n" +
                 "   • Est. Berat: `" + sisaBerat.toFixed(2) + " Kg`\n" +
                 "   • Est. Luas: `" + sisaLuas.toFixed(2) + " m²`\n" +
                 "   • Warna: " + item.ral + "\n\n";
                 
      if ((msg.length + line.length) > 3800) {
        sendMessage(chatId, msg);
        msg = ""; 
      }
      msg += line;
      count++;
    }
  }
  
  if (count === 0) {
    msg = "🎉 *Semua item pada " + headerTitle + " telah selesai 100%!*";
  } else {
    var summary = "➖➖➖➖➖➖➖➖➖➖\n" +
                  "📊 *TOTAL SISA (" + headerTitle + "):*\n" +
                  "📦 *Sisa Item:* `" + totalSisaItem + " Item`\n" +
                  "⚖️ *Sisa Tonase:* `" + totalSisaBerat.toFixed(2) + " Kg`\n" +
                  "📏 *Sisa Area:* `" + totalSisaLuas.toFixed(2) + " m²`";
    if ((msg.length + summary.length) > 4000) {
      sendMessage(chatId, msg);
      msg = summary;
    } else {
      msg += summary;
    }
  }
  
  if (msg !== "") sendMessage(chatId, msg);
}

// ================= OCR GEMINI VISION DENGAN AUTO MATCHING =================
function handlePhotoOCR(chatId, photoArray, caption) {
  sendMessage(chatId, "🔍 *Menganalisis formulir & mencocokkan ke sheet master... Harap tunggu sebentar.*");
  
  var fileId = photoArray[photoArray.length - 1].file_id;
  var getFileUrl = telegramUrl + "/getFile?file_id=" + fileId;
  var fileRes = UrlFetchApp.fetch(getFileUrl);
  var filePath = JSON.parse(fileRes.getContentText()).result.file_path;
  
  var downloadUrl = "https://api.telegram.org/file/bot" + token + "/" + filePath;
  var imageBlob = UrlFetchApp.fetch(downloadUrl).getBlob();
  var base64Image = Utilities.base64Encode(imageBlob.getBytes());
  var mimeType = imageBlob.getContentType() || "image/jpeg";
  
 var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=" + geminiApiKey;
  
  var prompt = "Baca dokumen Inspection Request ini dan ekstrak datanya ke JSON murni:\n" +
               "1. 'proyek': Ambil teks di samping label PROYEK.\n" +
               "2. 'qc': Nama QC Inspector di tanda tangan kiri bawah.\n" +
               "3. 'produksi': Nama Pemohon/Produksi di tanda tangan kanan bawah.\n" +
               "4. 'items': Array berisi objek 'kode' (dari kolom MARKING) dan 'qty' (dari kolom QTY bertipe integer/number).\n\n" +
               "Contoh format:\n" +
               "{\n" +
               "  \"proyek\": \"Jembatan Penghubung\",\n" +
               "  \"qc\": \"Wildan\",\n" +
               "  \"produksi\": \"Azis\",\n" +
               "  \"items\": [\n" +
               "    {\"kode\": \"JP-SP-1\", \"qty\": 12},\n" +
               "    {\"kode\": \"JP-SP-4\", \"qty\": 24},\n" +
               "    {\"kode\": \"JP-G-5\", \"qty\": 2},\n" +
               "    {\"kode\": \"JP-HR-1\", \"qty\": 4}\n" +
               "  ]\n" +
               "}";
               
  var payload = {
    "contents": [
      {
        "parts": [
          { "text": prompt },
          {
            "inline_data": {
              "mime_type": mimeType,
              "data": base64Image
            }
          }
        ]
      }
    ],
    "generationConfig": {
      "response_mime_type": "application/json"
    }
  };
  
  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  var response = UrlFetchApp.fetch(geminiUrl, options);
  var resJson = JSON.parse(response.getContentText());
  
  if (resJson.error) {
    throw new Error("Gemini API Error: " + resJson.error.message);
  }
  
  if (!resJson.candidates || !resJson.candidates[0] || !resJson.candidates[0].content) {
    throw new Error("Gemini tidak dapat membaca isi dokumen ini.");
  }
  
  var rawText = resJson.candidates[0].content.parts[0].text.trim();
  rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  
  var extractedData;
  try {
    extractedData = JSON.parse(rawText);
  } catch (err) {
    throw new Error("Format pembacaan JSON gagal: " + rawText);
  }
  
  var extractedProyek = extractedData.proyek || "";
  var extractedQC = extractedData.qc || "QC";
  var extractedProd = extractedData.produksi || "PRODUKSI";
  var rawItems = extractedData.items || [];
  
  // Normalisasi kode marking (hilangkan spasi berlebih pada tanda hubung, misal JP - SP - 1 -> JP-SP-1)
  var items = [];
  rawItems.forEach(function(it) {
    if (it.kode && it.qty) {
      var cleanKode = String(it.kode).toUpperCase().replace(/\s*-\s*/g, "-").trim();
      var cleanQty = parseFloat(it.qty) || 0;
      if (cleanQty > 0) {
        items.push({ kode: cleanKode, qty: cleanQty });
      }
    }
  });
  
  if (items.length === 0) {
    return sendMessage(chatId, "⚠️ *Tidak ditemukan daftar marking / qty pada foto tersebut.*");
  }
  
  // ================= PROSES AUTO-MATCHING PROJECT =================
  var ss = getSpreadsheet();
  var projectSheets = getProjectSheets(ss);
  var matchedProjectName = "";
  var matchReason = "";
  
  // 1. Cek jika user menulis nama project di caption (misal: /ocr Nama Project ...)
  var cleanCaption = caption.replace(/\/ocr/i, "").trim();
  if (cleanCaption !== "") {
    for (var i = 0; i < projectSheets.length; i++) {
      var sheetActual = projectSheets[i].getName();
      if (cleanCaption.toLowerCase().includes(sheetActual.toLowerCase()) || 
          sheetActual.toLowerCase().includes(cleanCaption.toLowerCase())) {
        matchedProjectName = sheetActual;
        matchReason = "Caption Pengguna";
        break;
      }
    }
  }
  
  // 2. Cek berdasarkan kemiripan nama teks formulir ke nama Sheet Master
  if (!matchedProjectName && extractedProyek) {
    var filterProyekText = extractedProyek.toUpperCase().replace(/[^A-Z0-9]/g, " ").trim();
    for (var j = 0; j < projectSheets.length; j++) {
      var sName = projectSheets[j].getName().toUpperCase();
      if (sName.includes(filterProyekText) || filterProyekText.includes(sName)) {
        matchedProjectName = projectSheets[j].getName();
        matchReason = "Nama Proyek di Kertas ('" + extractedProyek + "')";
        break;
      }
    }
  }
  
  // 3. Cek inisiatif berdasarkan kecocokan kode marking di seluruh master sheet
  if (!matchedProjectName) {
    var maxScore = 0;
    var bestSheet = "";
    
    projectSheets.forEach(function(sheet) {
      var pName = sheet.getName();
      var master = getMasterData(pName);
      var score = 0;
      
      items.forEach(function(it) {
        var key = pName + "|" + it.kode;
        if (master.list[key]) {
          score++;
        }
      });
      
      if (score > maxScore) {
        maxScore = score;
        bestSheet = pName;
      }
    });
    
    if (maxScore > 0) {
      matchedProjectName = bestSheet;
      matchReason = "Kecocokan " + maxScore + " Kode Marking";
    }
  }
  
  // Jika tetap tidak menemukan sheet tujuan
  if (!matchedProjectName) {
    var manualList = items.map(function(it) { return it.kode + " " + it.qty; }).join("\n");
    return sendMessage(chatId, "⚠️ *Sheet Project Tidak Ditemukan Otomatis*\n" +
                               "Teks terdeteksi: `" + (extractedProyek || "Tidak terbaca") + "`\n\n" +
                               "Gunakan format input manual:\n`/input NAMA_PROJECT " + extractedProd + " " + extractedQC + "\n" + manualList + "`");
  }
  
  // ================= EKSEKUSI INPUT OTOMATIS =================
  var inputLines = [];
  inputLines.push("/input " + matchedProjectName + " " + extractedProd + " " + extractedQC);
  items.forEach(function(it) {
    inputLines.push(it.kode + " " + it.qty);
  });
  
  var fullInputText = inputLines.join("\n");
  
  sendMessage(chatId, "🤖 *AUTO-MATCH PROJECT TERDETEKSI*\n" +
                      "📁 Sheet Master: `" + matchedProjectName + "`\n" +
                      "💡 Dasar Pencocokan: _" + matchReason + "_\n" +
                      "👷‍♂️ Tim: `" + extractedProd + "` | QC: `" + extractedQC + "`\n\n" +
                      "_Memproses input data ke spreadsheet..._");
                      
  handleInput(chatId, fullInputText);
}

// ================= ROUTER & HANDLER SUPER USER / SUDO =================
function handleSudoRouter(chatId, text) {
  if (adminChatIds.length > 0 && adminChatIds.indexOf(chatId) === -1) {
    return sendMessage(chatId, "⛔ *Akses Ditolak:* Akun Telegram Anda tidak terdaftar sebagai Super User.");
  }
  
  var cleanText = text.replace(/\/sudo/i, "").trim();
  var inputPassword = "";
  var remainingArgs = "";
  
  if (cleanText.startsWith("'") || cleanText.startsWith("\"")) {
    var quoteChar = cleanText.charAt(0);
    var endQuoteIndex = cleanText.indexOf(quoteChar, 1);
    if (endQuoteIndex !== -1) {
      inputPassword = cleanText.substring(1, endQuoteIndex);
      remainingArgs = cleanText.substring(endQuoteIndex + 1).trim();
    }
  }
  
  if (!inputPassword) {
    var parts = cleanText.split(" ");
    inputPassword = parts[0];
    remainingArgs = parts.slice(1).join(" ").trim();
  }
  
  var currentPassword = getSudoPassword();
  if (inputPassword !== currentPassword) {
    return sendMessage(chatId, "🔐 *Akses Ditolak:* Kata sandi salah!");
  }
  
  var argsLower = remainingArgs.toLowerCase();
  
  if (argsLower.startsWith("project closed") || argsLower.endsWith("closed") || argsLower.endsWith("close")) {
    execSudoClose(chatId, remainingArgs);
  } else if (argsLower.startsWith("reset project")) {
    execSudoResetProject(chatId, remainingArgs);
  } else if (argsLower.startsWith("set remaining")) {
    execSudoSetRemaining(chatId, remainingArgs);
  } else if (argsLower.startsWith("create project")) {
    execSudoCreateProject(chatId, remainingArgs);
  } else if (argsLower.startsWith("archive project")) {
    execSudoArchiveProject(chatId, remainingArgs);
  } else if (argsLower.startsWith("lock project")) {
    execSudoLock(chatId, remainingArgs, true);
  } else if (argsLower.startsWith("unlock project")) {
    execSudoLock(chatId, remainingArgs, false);
  } else if (argsLower.startsWith("audit")) {
    execSudoAudit(chatId, remainingArgs);
  } else if (argsLower.startsWith("report daily") || argsLower.startsWith("report")) {
    execSudoReportDaily(chatId, remainingArgs);
  } else if (argsLower.startsWith("clear inputs")) {
    execSudoClearInputs(chatId, remainingArgs);
  } else if (argsLower.startsWith("changepass")) {
    execSudoChangePass(chatId, remainingArgs, inputPassword);
  } else if (argsLower.startsWith("broadcast")) {
    execSudoBroadcast(chatId, remainingArgs);
  } else {
    sendMessage(chatId, "⚠️ *Perintah Sudo Tidak Dikenali.*\nKetik `/help` untuk melihat panduan lengkap.");
  }
}

function execSudoClose(chatId, args) {
  var targetProject = "";
  if (args.toLowerCase().startsWith("project closed")) {
    targetProject = args.substring(14).trim();
  } else if (args.toLowerCase().endsWith("closed")) {
    targetProject = args.substring(0, args.length - 6).trim();
  } else if (args.toLowerCase().endsWith("close")) {
    targetProject = args.substring(0, args.length - 5).trim();
  }
  
  if (!targetProject) return sendMessage(chatId, "⚠️ Sebutkan nama project: `/sudo 'pass' project closed NAMA_PROJECT`");
  
  var ss = getSpreadsheet();
  var specificSheet = getSpecificMasterSheet(ss, targetProject);
  if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan.");
  
  var actualProjectName = specificSheet.getName();
  var masterData = getMasterData(actualProjectName);
  getDoneData(masterData, actualProjectName);
  
  var sheetInput = getInputSheet(ss);
  var lastRow = sheetInput.getLastRow();
  var no = (lastRow > 1 ? (parseInt(sheetInput.getRange(lastRow, 1).getValue()) || 0) : 0) + 1;
  var tanggal = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  var rowsToAppend = [];
  var totalClosed = 0; var count = 0;
  
  for (var key in masterData.list) {
    var item = masterData.list[key];
    var sisa = item.jp - item.done;
    if (sisa > 0) {
      rowsToAppend.push([no, tanggal, actualProjectName, item.kode, sisa, "AUTO_CLOSE", "SUDO"]);
      totalClosed += sisa;
      count++;
      no++;
    }
  }
  
  if (rowsToAppend.length === 0) return sendMessage(chatId, "ℹ️ Project `" + actualProjectName + "` sudah berstatus 100% Close sebelumnya.");
  
  sheetInput.getRange(lastRow + 1, 1, rowsToAppend.length, 7).setValues(rowsToAppend);
  updateKeteranganLP(actualProjectName);
  
  sendMessage(chatId, "⚡️ *SUDO: PROJECT CLOSED*\n📁 Project: `" + actualProjectName + "`\n✅ Dituntaskan: " + count + " kode (" + totalClosed + " item).\nStatus sheet master kini 100% CLOSE.");
}

function execSudoResetProject(chatId, args) {
  var targetProject = args.substring(13).trim();
  if (!targetProject) return sendMessage(chatId, "⚠️ Sebutkan nama project: `/sudo 'pass' reset project NAMA_PROJECT`");
  
  var ss = getSpreadsheet();
  var specificSheet = getSpecificMasterSheet(ss, targetProject);
  if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan.");
  
  var actualProjectName = specificSheet.getName();
  var sheetInput = getInputSheet(ss);
  var data = sheetInput.getDataRange().getValues();
  if (data.length <= 1) return sendMessage(chatId, "ℹ️ Tidak ada data di sheet Input.");
  
  var deletedCount = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][2] && String(data[i][2]).toLowerCase() === actualProjectName.toLowerCase()) {
      sheetInput.deleteRow(i + 1);
      deletedCount++;
    }
  }
  
  updateKeteranganLP(actualProjectName);
  sendMessage(chatId, "🔄 *SUDO: PROJECT RESET BERHASIL*\n📁 Project: `" + actualProjectName + "`\n🗑 Dihapus: " + deletedCount + " baris riwayat input.\nStatus master dikembalikan ke 0% (Remaining Full).");
}

function execSudoSetRemaining(chatId, args) {
  var parts = args.substring(13).trim().split(" ");
  if (parts.length < 3) return sendMessage(chatId, "⚠️ Format: `/sudo 'pass' set remaining NAMA_PROJECT KODE_PRODUK JUMLAH_SISA_BARU`");
  
  var targetProject = parts[0].trim();
  var targetKode = parts[1].trim();
  var targetSisa = parseFloat(parts[2]);
  
  if (isNaN(targetSisa) || targetSisa < 0) return sendMessage(chatId, "❌ Nilai sisa harus berupa angka positif.");
  
  var ss = getSpreadsheet();
  var specificSheet = getSpecificMasterSheet(ss, targetProject);
  if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan.");
  
  var actualProjectName = specificSheet.getName();
  var masterData = getMasterData(actualProjectName);
  getDoneData(masterData, actualProjectName);
  
  var key = actualProjectName + "|" + targetKode;
  if (!masterData.list[key]) return sendMessage(chatId, "❌ Kode `" + targetKode + "` tidak ditemukan di project `" + actualProjectName + "`.");
  
  var item = masterData.list[key];
  var targetDone = item.jp - targetSisa;
  var selisih = targetDone - item.done;
  
  if (selisih === 0) return sendMessage(chatId, "ℹ️ Sisa produk `" + targetKode + "` saat ini sudah sama dengan " + targetSisa + ".");
  
  var sheetInput = getInputSheet(ss);
  var lastRow = sheetInput.getLastRow();
  var no = (lastRow > 1 ? (parseInt(sheetInput.getRange(lastRow, 1).getValue()) || 0) : 0) + 1;
  var tanggal = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  
  sheetInput.appendRow([no, tanggal, actualProjectName, targetKode, selisih, "ADJUST_SUDO", "SUDO"]);
  updateKeteranganLP(actualProjectName);
  
  sendMessage(chatId, "⚡️ *SUDO: SISA BERHASIL DIATUR*\n📁 Project: `" + actualProjectName + "`\n▪️ Kode: `" + targetKode + "`\n📦 Sisa Baru: *" + targetSisa + "* (Done: " + targetDone + "/" + item.jp + ")");
}

function execSudoCreateProject(chatId, args) {
  var newProjectName = args.substring(14).trim().toUpperCase();
  if (!newProjectName) return sendMessage(chatId, "⚠️ Sebutkan nama project: `/sudo 'pass' create project NAMA_PROJECT`");
  if (newProjectName.startsWith("LK")) return sendMessage(chatId, "❌ Nama project tidak boleh diawali `LK`.");
  
  var ss = getSpreadsheet();
  if (ss.getSheetByName(newProjectName)) return sendMessage(chatId, "❌ Sheet `" + newProjectName + "` sudah ada.");
  
  var newSheet = ss.insertSheet(newProjectName);
  
  newSheet.getRange(8, 1, 1, 26).setValues([[
    "NO", "ITEM", "KODE PRODUK", "DESKRIPSI", "DIMENSI", "PROFIL", "MATERIAL", "TEBAL", 
    "JP", "BERAT", "LUAS", "RAL", "KET1", "KET2", "KET3", "KET4", "KET5", "KET6", "KET7", 
    "KET8", "KET9", "KET10", "KET11", "KET12", "ITEM DONE", "STATUS"
  ]]);
  
  newSheet.getRange("A8:Z8").setBackground("#1f4e78").setFontColor("#ffffff").setFontWeight("bold");
  sendMessage(chatId, "✅ *Sheet Project Baru Dibuat!*\n📁 Nama: `" + newProjectName + "`\nStruktur kolom C, I, J, K, L, Y, Z telah siap diisi.");
}

function execSudoArchiveProject(chatId, args) {
  var targetProject = args.substring(15).trim();
  if (!targetProject) return sendMessage(chatId, "⚠️ Sebutkan nama project: `/sudo 'pass' archive project NAMA_PROJECT`");
  
  var ss = getSpreadsheet();
  var sheet = getSpecificMasterSheet(ss, targetProject);
  if (!sheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan.");
  
  var oldName = sheet.getName();
  var archivedName = "LK_ARCHIVE_" + oldName;
  sheet.setName(archivedName);
  
  sendMessage(chatId, "📦 *PROJECT DIARSIPKAN*\nSheet `" + oldName + "` diubah nama menjadi `" + archivedName + "`.\nSistem otomatis mengabaikannya.");
}

function execSudoLock(chatId, args, lockState) {
  var prefix = lockState ? "lock project" : "unlock project";
  var targetProject = args.substring(prefix.length).trim();
  if (!targetProject) return sendMessage(chatId, "⚠️ Format: `/sudo 'pass' " + prefix + " NAMA_PROJECT`");
  
  var ss = getSpreadsheet();
  var sheet = getSpecificMasterSheet(ss, targetProject);
  if (!sheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan.");
  
  var actualProjectName = sheet.getName();
  setProjectLock(actualProjectName, lockState);
  
  if (lockState) {
    sendMessage(chatId, "🔒 *PROJECT DIKUNCI:* `" + actualProjectName + "` tidak dapat menerima `/input` baru dari tim lapangan.");
  } else {
    sendMessage(chatId, "🔓 *PROJECT DIBUKA:* `" + actualProjectName + "` kini kembali dapat menerima input data.");
  }
}

function execSudoAudit(chatId, args) {
  var targetProject = args.substring(5).trim();
  var master = getMasterData(targetProject || null);
  getDoneData(master, targetProject || null);
  
  var ss = getSpreadsheet();
  var sheetInput = getInputSheet(ss);
  var inputData = sheetInput.getDataRange().getValues();
  
  var msg = "🕵️‍♂️ *AUDIT OVER PRODUKSI (" + (targetProject || "SEMUA PROJECT") + ")*\n\n";
  var countOver = 0;
  
  for (var key in master.list) {
    var item = master.list[key];
    if (item.done > item.jp) {
      var overQty = item.done - item.jp;
      msg += "🚨 `[" + item.project + "]` *" + item.kode + "*\n" +
             "   • Kuota: " + item.jp + " | Total Done: " + item.done + " *(OVER " + overQty + ")*\n" +
             "   • Riwayat Input:\n";
             
      for (var r = 1; r < inputData.length; r++) {
        if (inputData[r][2] === item.project && String(inputData[r][3]).trim() === item.kode) {
          msg += "     - " + inputData[r][1] + " (Qty: " + inputData[r][4] + " | Prod: " + inputData[r][5] + " | QC: " + inputData[r][6] + ")\n";
        }
      }
      msg += "\n";
      countOver++;
    }
  }
  
  if (countOver === 0) {
    sendMessage(chatId, "✅ *Audit Bersih:* Tidak ditemukan produk yang over produksi.");
  } else {
    sendMessage(chatId, msg);
  }
}

function execSudoReportDaily(chatId, args) {
  var targetDate = args.substring(12).trim();
  if (!targetDate) {
    targetDate = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  }
  
  var ss = getSpreadsheet();
  var sheetInput = getInputSheet(ss);
  var data = sheetInput.getDataRange().getValues();
  
  var master = getMasterData();
  var summaryProd = {};
  var totalItem = 0; var totalBerat = 0; var totalLuas = 0;
  
  for (var i = 1; i < data.length; i++) {
    var tglStr = (data[i][1] instanceof Date) ? Utilities.formatDate(data[i][1], "GMT+7", "dd/MM/yyyy") : String(data[i][1]).substring(0, 10);
    
    if (tglStr.includes(targetDate)) {
      var pName = data[i][2];
      var kode = data[i][3];
      var qty = parseFloat(data[i][4]) || 0;
      var prod = data[i][5] || "N/A";
      var qc = data[i][6] || "N/A";
      var keyMaster = pName + "|" + kode;
      
      var b = master.list[keyMaster] ? (master.list[keyMaster].unit_berat * qty) : 0;
      var l = master.list[keyMaster] ? (master.list[keyMaster].unit_luas * qty) : 0;
      
      var groupKey = prod + " (QC: " + qc + ")";
      if (!summaryProd[groupKey]) {
        summaryProd[groupKey] = { item: 0, berat: 0, luas: 0 };
      }
      summaryProd[groupKey].item += qty;
      summaryProd[groupKey].berat += b;
      summaryProd[groupKey].luas += l;
      
      totalItem += qty;
      totalBerat += b;
      totalLuas += l;
    }
  }
  
  if (totalItem === 0) return sendMessage(chatId, "ℹ️ Tidak ada data pengerjaan pada tanggal `" + targetDate + "`.");
  
  var msg = "📈 *LAPORAN HARIAN PRODUKSI (" + targetDate + ")*\n\n";
  for (var g in summaryProd) {
    msg += "👷‍♂️ *TIM: " + g + "*\n" +
           "   • Selesai: *" + summaryProd[g].item + "* item\n" +
           "   • Tonase: `" + summaryProd[g].berat.toFixed(2) + " Kg` | Luas: `" + summaryProd[g].luas.toFixed(2) + " m²`\n\n";
  }
  msg += "➖➖➖➖➖➖➖➖➖➖\n" +
         "🌐 *TOTAL OUTPUT HARI INI:*\n" +
         "📦 Item: `" + totalItem + " Item` | ⚖️ Tonase: `" + totalBerat.toFixed(2) + " Kg` | 📏 Area: `" + totalLuas.toFixed(2) + " m²`";
         
  sendMessage(chatId, msg);
}

function execSudoClearInputs(chatId, args) {
  var targetDate = args.substring(12).trim();
  if (!targetDate) return sendMessage(chatId, "⚠️ Format: `/sudo 'pass' clear inputs DD/MM/YYYY`");
  
  var ss = getSpreadsheet();
  var sheetInput = getInputSheet(ss);
  var data = sheetInput.getDataRange().getValues();
  if (data.length <= 1) return sendMessage(chatId, "ℹ️ Sheet Input masih kosong.");
  
  var deleted = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    var tglStr = (data[i][1] instanceof Date) ? Utilities.formatDate(data[i][1], "GMT+7", "dd/MM/yyyy") : String(data[i][1]);
    if (tglStr.includes(targetDate)) {
      sheetInput.deleteRow(i + 1);
      deleted++;
    }
  }
  
  updateKeteranganLP();
  sendMessage(chatId, "🗑 *SUDO: BERSIHKAN INPUT BERHASIL*\nTanggal: `" + targetDate + "`\nTotal Dihapus: " + deleted + " baris input.\nStatus master telah diperbarui.");
}

function execSudoChangePass(chatId, args, currentUsedPass) {
  var parts = args.substring(10).trim().split(" ");
  if (parts.length < 2) return sendMessage(chatId, "⚠️ Format: `/sudo 'pass_lama' changepass PASS_LAMA PASS_BARU`");
  
  var oldPassInput = parts[0].trim();
  var newPassInput = parts[1].trim();
  
  if (oldPassInput !== getSudoPassword()) {
    return sendMessage(chatId, "❌ Password lama tidak cocok.");
  }
  
  if (newPassInput.length < 4) {
    return sendMessage(chatId, "❌ Password baru minimal 4 karakter.");
  }
  
  setSudoPassword(newPassInput);
  sendMessage(chatId, "🔑 *KATA SANDI SUDO BERHASIL DIUBAH!*\nGunakan kata sandi baru untuk perintah `/sudo` selanjutnya.");
}

function execSudoBroadcast(chatId, args) {
  var msgBroadcast = args.substring(9).trim();
  if (!msgBroadcast) return sendMessage(chatId, "⚠️ Format: `/sudo 'pass' broadcast PESAN_PENGUMUMAN`");
  
  var finalMsg = "📢 *PENGUMUMAN RESMI SUPERVISOR:*\n\n" + msgBroadcast;
  sendMessage(chatId, finalMsg);
}

// ================= UTILITY PENGIRIMAN TELEGRAM =================
function sendMessage(chatId, text) {
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" })
  };
  UrlFetchApp.fetch(telegramUrl + "/sendMessage", options);
}

function sendTelegramDocument(chatId, blob, caption) {
  var payload = {
    chat_id: String(chatId),
    caption: caption || "",
    parse_mode: "Markdown",
    document: blob
  };
  
  var options = {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(telegramUrl + "/sendDocument", options);
}

// ================= UPDATE STATUS KETERANGAN & ITEM INFO =================
// Kolom Y (Kolom 25): Qty Selesai Dikerjakan (Done)
// Kolom Z (Kolom 26): Status Keterangan (Remaining / Close / Over)
function updateKeteranganLP(projectName) {
  var ss = getSpreadsheet();
  var sheetsToUpdate = [];
  
  if (projectName) {
    var sheet = getSpecificMasterSheet(ss, projectName);
    if (sheet) sheetsToUpdate.push(sheet);
  } else {
    sheetsToUpdate = getProjectSheets(ss);
  }
  
  sheetsToUpdate.forEach(function(sheetLP) {
    var pName = sheetLP.getName();
    var master = getMasterData(pName);
    getDoneData(master, pName);
    
    var data = sheetLP.getDataRange().getValues();
    var startRow = 8;
    
    for (var i = 0; i < Math.min(data.length, 25); i++) {
      for (var j = 0; j < data[i].length; j++) {
        if (data[i][j] && String(data[i][j]).toUpperCase().includes("KODE PRODUK")) {
          startRow = i + 1;
          break;
        }
      }
    }
    
    if (data.length <= startRow) return;
    
    var numRows = data.length - startRow;
    var rangeYZ = sheetLP.getRange(startRow + 1, 25, numRows, 2);
    var yzValues = [];
    
    for (var i = startRow; i < data.length; i++) {
      var kode = data[i][2] ? String(data[i][2]).trim() : "";
      var key = pName + "|" + kode;
      
      if (!kode || !master.list[key]) {
        var existingY = data[i][24] !== undefined ? data[i][24] : "";
        var existingZ = data[i][25] !== undefined ? data[i][25] : "";
        yzValues.push([existingY, existingZ]);
        continue;
      }
      
      var jp = master.list[key].jp;
      var done = master.list[key].done;
      var sisa = jp - done;
      var status = "";
      
      if (done === 0) {
        status = "Remaining " + jp;
      } else if (sisa === 0) {
        status = "Close";
      } else if (sisa < 0) {
        status = "Over " + Math.abs(sisa);
      } else {
        status = "Remaining " + sisa;
      }
      
      yzValues.push([done, status]);
    }
    
    rangeYZ.setValues(yzValues);
  });
}
