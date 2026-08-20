// ============================================================================
// AZZATSSINS
// ============================================================================

// ================= KONFIGURASI UTAMA =================
var token = ""; 
var fallbackSheetId = ""; 
var telegramUrl = "https://api.telegram.org/bot" + token;

// Gemini API Key untuk Vision OCR, Smart Parser & Intent Router
var geminiApiKey = "";

var defaultReportChatId = ""; 
var defaultSudoPassword = ""; 
var adminChatIds = [];

// ================= SISTEM PASSWORD, FINANSIAL & PROJECT LOCK =================
function getSudoPassword() {
  try {
    var props = PropertiesService.getScriptProperties();
    var pass = props.getProperty("SUDO_PASSWORD");
    if (!pass) {
      props.setProperty("SUDO_PASSWORD", defaultSudoPassword);
      return defaultSudoPassword;
    }
    return pass;
  } catch(e) {
    return defaultSudoPassword;
  }
}

function setSudoPassword(newPass) {
  try {
    PropertiesService.getScriptProperties().setProperty("SUDO_PASSWORD", newPass);
  } catch(e) {}
}

function isProjectLocked(projectName) {
  try {
    var props = PropertiesService.getScriptProperties();
    return props.getProperty("LOCK_" + projectName.toUpperCase().trim()) === "true";
  } catch(e) {
    return false;
  }
}

function setProjectLock(projectName, lockState) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty("LOCK_" + projectName.toUpperCase().trim(), lockState ? "true" : "false");
  } catch(e) {}
}

function getProjectFinance(projectName) {
  try {
    var props = PropertiesService.getScriptProperties();
    var pKey = projectName.toUpperCase().trim();
    var rateType = props.getProperty("FIN_TYPE_" + pKey) || "KG";
    var ratePrice = parseFloat(props.getProperty("FIN_RATE_" + pKey)) || 0;
    var deadline = props.getProperty("FIN_DEADLINE_" + pKey) || "Belum diatur";
    return { type: rateType, rate: ratePrice, deadline: deadline };
  } catch(e) {
    return { type: "KG", rate: 0, deadline: "Belum diatur" };
  }
}

function setProjectRate(projectName, rateType, ratePrice) {
  try {
    var props = PropertiesService.getScriptProperties();
    var pKey = projectName.toUpperCase().trim();
    props.setProperty("FIN_TYPE_" + pKey, rateType.toUpperCase().trim());
    props.setProperty("FIN_RATE_" + pKey, String(ratePrice));
  } catch(e) {}
}

function setProjectDeadline(projectName, deadlineDate) {
  try {
    var props = PropertiesService.getScriptProperties();
    var pKey = projectName.toUpperCase().trim();
    props.setProperty("FIN_DEADLINE_" + pKey, deadlineDate.trim());
  } catch(e) {}
}

function formatRupiah(number) {
  return "Rp " + Math.round(number || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseUniversalNumber(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  
  var str = String(val).trim()
                       .replace(/Rp/gi, "")
                       .replace(/Kg/gi, "")
                       .replace(/m²/gi, "")
                       .replace(/m2/gi, "")
                       .replace(/sqm/gi, "")
                       .replace(/[^0-9.,-]/g, "")
                       .trim();
                       
  if (str.indexOf(",") !== -1 && str.indexOf(".") !== -1) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (str.indexOf(",") !== -1) {
    str = str.replace(",", ".");
  }
  
  var num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function toTitleCase(str) {
  if (!str) return "";
  return str.toLowerCase().split(/\s+/).map(function(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ");
}

// ================= FILTER PENGECUALIAN SHEET LK / LK_ / SISTEM =================
function isSheetIgnored(sheetName) {
  if (!sheetName) return true;
  var upper = sheetName.toUpperCase().trim();
  var systemSheets = ["INPUT", "DATA", "REKAP", "CONFIG", "DATABASE", "USER", "USERS"];
  
  if (systemSheets.indexOf(upper) !== -1) return true;
  if (upper.startsWith("LK_") || upper.startsWith("LK ") || upper.startsWith("LK-") || upper === "LK" || upper.startsWith("LK")) return true;
  if (upper.startsWith("[CLOSED]") || upper.includes("ARCHIVE")) return true;
  
  return false;
}

// ================= DRIVE STORAGE =================
function getOrCreateFolder(folderName, parentFolder) {
  var parent = parentFolder || DriveApp.getRootFolder();
  var folders = parent.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parent.createFolder(folderName);
  }
}

function saveFileToDriveWithOverwrite(folder, blob, fileName) {
  var existingFiles = folder.getFilesByName(fileName);
  while (existingFiles.hasNext()) {
    existingFiles.next().setTrashed(true);
  }
  return folder.createFile(blob).setName(fileName);
}

// ================= WEBHOOK =================
function setWebhook() {
  var webAppUrl = "https://script.google.com/macros/s/AKfycbwX-osRH9T7ZQVS-om85fx_7yiF4W3Rz3ansPKbrOK-w0hmQKG2g1RG-3sfxgK-piJEgA/exec";
  var response = UrlFetchApp.fetch(telegramUrl + "/setWebhook?url=" + webAppUrl);
  Logger.log(response.getContentText());
}

// ================= FUNGSI TIME TRIGGER =================
function setAutoDailyReportTrigger() {
  try {
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
      
    Logger.log("Jadwal Harian Pukul 07:00 WIB berhasil disetel.");
  } catch(e) {
    Logger.log("Trigger Error: " + e.message);
  }
}

function sendDailyReportAutomatic() {
  var targetChatId = PropertiesService.getScriptProperties().getProperty("LAST_CHAT_ID") || defaultReportChatId;
  if (!targetChatId) return;
  
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

// ================= EMERGENCY KILL SWITCH (/stop /abort /kill /cancel) =================
function handleEmergencyStop(chatId) {
  try {
    var lock = LockService.getScriptLock();
    lock.releaseLock();
  } catch (e) {}

  try {
    var cache = CacheService.getScriptCache();
    cache.removeAll(["MASTER_GLOBAL_CACHE"]);
  } catch (e) {}

  try {
    PropertiesService.getScriptProperties().setProperty("BOT_FORCE_ABORT", String(new Date().getTime()));
  } catch(e) {}

  var msg = "🛑 *EMERGENCY STOP / PROSES DIHENTIKAN PAKSA*\n" +
            "───────────────────────\n" +
            "• Seluruh antrean proses dan eksekusi background dibatalkan.\n" +
            "• Script Lock & memori cache antrean berhasil di-reset.\n" +
            "• Status Server: *NORMAL & SIAP MENERIMA PERINTAH BARU ✅*";

  sendMessage(chatId, msg);
}

function cmdStarts(text, cmd) {
  return String(text || "").toLowerCase().startsWith(cmd);
}

// ================= FUNGSI UTAMA (DO POST) =================
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return HtmlService.createHtmlOutput("OK");
  }

  var contents;
  try {
    contents = JSON.parse(e.postData.contents);
  } catch(parseErr) {
    return HtmlService.createHtmlOutput("OK");
  }

  if (contents.callback_query) {
    try {
      handleBotCallback(contents.callback_query);
    } catch(err) {
      Logger.log("Callback Error: " + err.message);
    }
    return HtmlService.createHtmlOutput("OK");
  }

  if (!contents.message) return HtmlService.createHtmlOutput("OK");
  
  var chatId = contents.message.chat.id;
  var text = (contents.message.text || "").trim();
  var caption = (contents.message.caption || "").trim();
  var photo = contents.message.photo;
  var document = contents.message.document;
  
  try {
    PropertiesService.getScriptProperties().setProperty("LAST_CHAT_ID", String(chatId));
  } catch(e) {}
  
  try {
    var lowerText = text.toLowerCase();
    if (["/stop", "/abort", "/kill", "/cancel"].indexOf(lowerText) !== -1) {
      handleEmergencyStop(chatId);
      return HtmlService.createHtmlOutput("OK");
    }

    if (document) {
      var fileName = document.file_name || "";
      var fileExt = fileName.toLowerCase().split('.').pop();
      if (fileExt === "xlsx" || fileExt === "xls" || fileExt === "csv") {
        handleExcelUpload(chatId, document.file_id, fileName, caption);
        return HtmlService.createHtmlOutput("OK");
      }
    }

    if (photo && photo.length > 0) {
      handlePhotoUpload(chatId, photo, caption);
      return HtmlService.createHtmlOutput("OK");
    }
    
    if (cmdStarts(lowerText, "/drive") || cmdStarts(lowerText, "/files")) {
      handleDriveExplorer(chatId, text);
    } else if (cmdStarts(lowerText, "/parse")) {
      handleRawTextParser(chatId, text);
    } else if (cmdStarts(lowerText, "/sys")) {
      handleSystemMonitor(chatId);
    } else if (cmdStarts(lowerText, "/status")) {
      handleStatusProject(chatId, text);
    } else if (cmdStarts(lowerText, "/sudo")) {
      handleSudoRouter(chatId, text);
    } else if (cmdStarts(lowerText, "/input")) {
      handleInput(chatId, text);
    } else if (cmdStarts(lowerText, "/spk")) {
      handleSPK(chatId, text);
    } else if (cmdStarts(lowerText, "/projects")) {
      handleListProjects(chatId);
    } else if (cmdStarts(lowerText, "/check")) {
      handleCheck(chatId, text);
    } else if (cmdStarts(lowerText, "/testreport")) {
      sendDailyReportAutomatic();
    } else if (cmdStarts(lowerText, "/export")) {
      handleExportPDF(chatId, text);
    } else if (cmdStarts(lowerText, "/backup")) {
      handleBackup(chatId);
    } else if (cmdStarts(lowerText, "/delete") || cmdStarts(lowerText, "/delet")) {
      handleDelete(chatId, text);
    } else if (cmdStarts(lowerText, "/remaining")) {
      handleRemaining(chatId, text);
    } else if (cmdStarts(lowerText, "/help full")) {
      handleHelpFull(chatId);
    } else if (cmdStarts(lowerText, "/help") || cmdStarts(lowerText, "/start")) {
      handleHelp(chatId);
    } else {
      handleSmartConversationRouter(chatId, text);
    }
  } catch(error) {
    sendMessage(chatId, "⚠️ *Error Log:* " + error.message);
  }
  return HtmlService.createHtmlOutput("OK");
}

// ================= HANDLE FOTO UPLOAD =================
function handlePhotoUpload(chatId, photoArray, caption) {
  try {
    var fileId = photoArray[photoArray.length - 1].file_id;
    var getFileUrl = telegramUrl + "/getFile?file_id=" + fileId;
    var fileRes = UrlFetchApp.fetch(getFileUrl);
    var filePath = JSON.parse(fileRes.getContentText()).result.file_path;
    
    var downloadUrl = "https://api.telegram.org/file/bot" + token + "/" + filePath;
    var imageBlob = UrlFetchApp.fetch(downloadUrl).getBlob();
    
    var mainFolder = getOrCreateFolder("LIST PROJECT");
    var photoFolder = getOrCreateFolder("foto", mainFolder);
    var photoName = "FOTO_" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss") + ".jpg";
    photoFolder.createFile(imageBlob).setName(photoName);

    if (caption.toLowerCase().startsWith("/ocr")) {
      handleUniversalTextOCR(chatId, imageBlob, caption);
    } else {
      sendMessage(chatId, "📷 *Foto Berhasil Disimpan!*\n📁 Lokasi: `LIST PROJECT/foto/" + photoName + "`\n_Kirim foto dengan caption `/ocr` untuk membaca teks dan mencocokkannya ke master._");
    }
  } catch(e) {
    sendMessage(chatId, "⚠️ *Gagal memproses upload foto:* " + e.message);
  }
}

// ================= UNIVERSAL TEXT OCR & MASTER MATCHING =================
function handleUniversalTextOCR(chatId, imageBlob, caption) {
  sendMessage(chatId, "🔍 *Membaca teks pada foto & mencocokkan ke master...*");

  var base64Image = Utilities.base64Encode(imageBlob.getBytes());
  var mimeType = imageBlob.getContentType() || "image/jpeg";

  var allMaster = getMasterData();
  var validMasterCodes = [];
  for (var k in allMaster.list) {
    validMasterCodes.push(allMaster.list[k].kode);
  }

  var promptText = 
    "Ekstrak semua teks, kata, angka, atau kode marking yang tertulis pada gambar ini ke dalam format JSON array objek.\n" +
    "Daftar kode marking valid yang ada di database kami:\n" + JSON.stringify(validMasterCodes.slice(0, 300)) + "\n\n" +
    "Tugasmu:\n" +
    "1. Baca teks apa pun di gambar yang mirip atau sesuai dengan daftar kode di atas.\n" +
    "2. Cari angka di dekat/samping kode tersebut sebagai jumlah (qty).\n" +
    "3. Output format JSON murni:\n" +
    "[\n" +
    "  {\"marking\": \"KODE_DARI_FOTO\", \"qty\": 5}\n" +
    "]";

  var payload = {
    "contents": [{
      "parts": [
        { "text": promptText },
        { "inline_data": { "mime_type": mimeType, "data": base64Image } }
      ]
    }],
    "generationConfig": { "temperature": 0.0 }
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  var modelsToTry = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest"
  ];
  
  var rawItems = [];
  var usedEngine = "";

  for (var m = 0; m < modelsToTry.length; m++) {
    try {
      var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + modelsToTry[m] + ":generateContent?key=" + geminiApiKey;
      var res = UrlFetchApp.fetch(geminiUrl, options);
      var json = JSON.parse(res.getContentText());
      if (json.candidates && json.candidates[0]) {
        var rawText = json.candidates[0].content.parts[0].text.replace(/```json/gi, "").replace(/```/g, "").trim();
        var parsed = JSON.parse(rawText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          rawItems = parsed;
          usedEngine = "Gemini AI (" + modelsToTry[m] + ")";
          break;
        }
      }
    } catch(e) {}
  }

  if (rawItems.length === 0) {
    try {
      var file = Drive.Files.insert({title: "OCR_TEMP", mimeType: "application/vnd.google-apps.document"}, imageBlob, {ocr: true, ocrLanguage: "id"});
      var text = DocumentApp.openById(file.id).getBody().getText();
      DriveApp.getFileById(file.id).setTrashed(true);
      
      var lines = text.split("\n");
      lines.forEach(function(l) {
        var match = l.match(/([A-Z0-9\-]+)[\s\t:.,]+(\d+)/i);
        if (match) rawItems.push({marking: match[1], qty: parseInt(match[2])});
      });
      usedEngine = "Google Drive Native OCR (Fallback)";
    } catch(e) {}
  }

  if (rawItems.length === 0) {
    return sendMessage(chatId, "⚠️ *Tidak ada teks atau marking yang berhasil dikenali pada foto.*");
  }

  var matchedProjectName = "";
  var verifiedItems = [];
  var reviewLines = [];

  rawItems.forEach(function(it) {
    var detectedMarking = String(it.marking || "").toUpperCase().trim();
    var qty = parseUniversalNumber(it.qty);

    if (!detectedMarking || qty <= 0) return;

    for (var mKey in allMaster.list) {
      var masterItem = allMaster.list[mKey];
      if (masterItem.kode.toUpperCase() === detectedMarking) {
        matchedProjectName = masterItem.project;
        verifiedItems.push({ kode: masterItem.kode, qty: qty });
        reviewLines.push((reviewLines.length + 1) + ". `" + masterItem.kode + "` : *" + qty + " item* (`" + masterItem.project + "`) ✅");
        break;
      }
    }
  });

  if (verifiedItems.length === 0) {
    return sendMessage(chatId, "⚠️ *Teks terbaca, namun tidak ada satupun yang cocok dengan kode marking di Sheet Master manapun.*");
  }

  var defaultProd = "AZIS";
  var defaultQC = "WILDAN";
  
  var cleanCaption = caption.replace(/\/ocr/i, "").trim();
  if (cleanCaption !== "") {
    var capParts = cleanCaption.split(" ");
    if (capParts.length >= 2) {
      defaultProd = capParts[0];
      defaultQC = capParts.slice(1).join(" ");
    }
  }

  var inputLines = ["/input " + matchedProjectName + " " + defaultProd + " " + defaultQC];
  verifiedItems.forEach(function(v) { inputLines.push(v.kode + " " + v.qty); });

  var cache = CacheService.getScriptCache();
  var sessionKey = "O_" + Math.floor(Math.random() * 100000);
  cache.put(sessionKey, inputLines.join("\n"), 600);

  var confirmMsg = "📋 *HASIL OCR UNIVERSAL (MASTER MATCHED)*\n" +
                   "🤖 *Engine:* `" + usedEngine + "`\n" +
                   "───────────────────────\n" +
                   "📁 *Project Terdeteksi:* `" + matchedProjectName + "`\n" +
                   "👷‍♂️ *Tim:* `" + defaultProd + "` | *QC:* `" + defaultQC + "`\n\n" +
                   "📦 *Marking Sesuai Master:*\n" +
                   reviewLines.join("\n") + "\n\n" +
                   "Simpan ke database sekarang?";

  sendTelegramConfirmation(chatId, confirmMsg, sessionKey);
}

function sendTelegramConfirmation(chatId, text, sessionKey) {
  var url = telegramUrl + "/sendMessage";
  var inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "✅ YA, SIMPAN", callback_data: "OY_" + sessionKey },
        { text: "❌ BATAL", callback_data: "ON_" + sessionKey }
      ]
    ]
  };

  var payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown",
    reply_markup: JSON.stringify(inlineKeyboard)
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ================= PERBAIKAN LOGIKA: HANDLE EXCEL UPLOAD =================
function handleExcelUpload(chatId, fileId, fileName, caption) {
  var lock = LockService.getScriptLock();
  
  try {
    var hasLock = lock.tryLock(30000);
    if (!hasLock) {
      return sendMessage(chatId, "⏳ *Server Sedang Sibuk:*\nFile `" + fileName + "` antre terlalu lama. Silakan kirim ulang file ini.");
    }

    sendMessage(chatId, "⏳ *[Antrean Diproses]* Memproses file: `" + fileName + "`...");

    var getFileUrl = telegramUrl + "/getFile?file_id=" + fileId;
    var fileRes = UrlFetchApp.fetch(getFileUrl);
    var filePath = JSON.parse(fileRes.getContentText()).result.file_path;
    
    var downloadUrl = "https://api.telegram.org/file/bot" + token + "/" + filePath;
    var fileBlob = UrlFetchApp.fetch(downloadUrl).getBlob();
    
    var mainFolder = getOrCreateFolder("LIST PROJECT");
    saveFileToDriveWithOverwrite(mainFolder, fileBlob, fileName);
    
    var excelBlob = fileBlob.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    var resource = {
      title: "TEMP_EXCEL_CONVERT_" + new Date().getTime(),
      mimeType: "application/vnd.google-apps.spreadsheet"
    };
    var tempFile = Drive.Files.insert(resource, excelBlob, { convert: true });
    var tempSs = SpreadsheetApp.openById(tempFile.id);
    
    var allUploadedSheets = tempSs.getSheets();
    var tempSheetLP = null;
    var tempSheetLK = null;
    
    for (var s = 0; s < allUploadedSheets.length; s++) {
      var sTitle = allUploadedSheets[s].getName().toUpperCase().trim();
      if (sTitle.includes("LP") || sTitle.includes("LIST")) {
        tempSheetLP = allUploadedSheets[s];
      } else if (sTitle.includes("LK") || sTitle.includes("KEBUTUHAN") || sTitle.includes("KALKULASI")) {
        tempSheetLK = allUploadedSheets[s];
      }
    }
    
    if (!tempSheetLP) tempSheetLP = allUploadedSheets[0];
    
    SpreadsheetApp.flush();
    
    var tempRange = tempSheetLP.getDataRange();
    var evaluatedValues = tempRange.getValues();
    
    if (evaluatedValues.length <= 1) {
      DriveApp.getFileById(tempFile.id).setTrashed(true);
      return sendMessage(chatId, "⚠️ *File Excel kosong atau format tidak sesuai:* `" + fileName + "`");
    }

    var startRow = 8;
    for (var r = 0; r < Math.min(evaluatedValues.length, 25); r++) {
      var rowStr = evaluatedValues[r].join(" ").toUpperCase();
      if (rowStr.includes("KODE PRODUK") || rowStr.includes("MARKING")) {
        startRow = r + 1;
        break;
      }
    }
    
    var uploadedItems = [];
    for (var i = startRow; i < evaluatedValues.length; i++) {
      var kode = String(evaluatedValues[i][2] || "").trim();
      var qty = parseUniversalNumber(evaluatedValues[i][8]);
      
      if (!kode && evaluatedValues[i][0]) {
        kode = String(evaluatedValues[i][0]).trim();
        qty = parseUniversalNumber(evaluatedValues[i][1]);
      }
      
      if (kode && !kode.toUpperCase().includes("GRAND TOTAL") && !kode.toUpperCase().includes("TOTAL")) {
        uploadedItems.push({ kode: kode, qty: qty });
      }
    }

    if (uploadedItems.length === 0) {
      DriveApp.getFileById(tempFile.id).setTrashed(true);
      return sendMessage(chatId, "⚠️ *Tidak ditemukan data produk valid pada file:* `" + fileName + "`");
    }

    var ss = getSpreadsheet();
    var projectSheets = getProjectSheets(ss);

    // 1. Ekstrak Nama Proyek Bersih dari Nama File
    var cleanSheetName = fileName.replace(/\.[^/.]+$/, "")
                                 .replace(/^[0-9]+[a-z]?[\.\-_]\s*/i, "")
                                 .replace(/_UP[0-9]+/gi, "")
                                 .replace(/LIST[\s\-_]*/gi, "")
                                 .replace(/_/g, " ")
                                 .replace(/\s+/g, " ")
                                 .trim();
                                 
    if (cleanSheetName.length < 3) cleanSheetName = "Project " + new Date().getTime();
    var targetProjectName = toTitleCase(cleanSheetName);

    // 2. Cek apakah Proyek ini sudah pernah ada di Spreadsheet Master
    var existingSheet = null;
    var cleanCaption = (caption || "").replace(/\/import|\/input/gi, "").trim();
    if (cleanCaption !== "") {
      existingSheet = getSpecificMasterSheet(ss, cleanCaption);
    }

    if (!existingSheet) {
      for (var p = 0; p < projectSheets.length; p++) {
        var sName = projectSheets[p].getName().toUpperCase().trim();
        var fClean = targetProjectName.toUpperCase().trim();
        if (sName === fClean || sName.includes(fClean) || fClean.includes(sName)) {
          existingSheet = projectSheets[p];
          break;
        }
      }
    }

    var actualProjectName = "";

    // 3. JIKA BELUM ADA SHEET DENGAN NAMA PROYEK INI -> BUAT SHEET MASTER BARU
    if (!existingSheet) {
      var finalSheetName = targetProjectName;
      var counter = 1;
      while (ss.getSheetByName(finalSheetName)) {
        finalSheetName = targetProjectName + " (" + counter + ")";
        counter++;
      }

      if (tempSheetLK) {
        var originalLKName = tempSheetLK.getName();
        var existingLK = ss.getSheetByName(originalLKName);
        if (existingLK) ss.deleteSheet(existingLK);
        var copiedLK = tempSheetLK.copyTo(ss);
        copiedLK.setName(originalLKName);
        copiedLK.hideSheet();
      }

      var newSheet = tempSheetLP.copyTo(ss);
      newSheet.setName(finalSheetName);
      
      var targetRange = newSheet.getRange(1, 1, evaluatedValues.length, evaluatedValues[0].length);
      targetRange.setValues(evaluatedValues);

      actualProjectName = finalSheetName;

      sendMessage(chatId, "✨ *Sheet Master Baru Dibuat!*\n📁 Nama Sheet: `" + actualProjectName + "`\n📦 Tab LK: *Tersimpan Asli (Disembunyikan)*\n💾 File Asli: *Tersimpan di Google Drive (`LIST PROJECT`)*\n💡 Terdaftar *" + uploadedItems.length + " item marking*.");
    } else {
      actualProjectName = existingSheet.getName();

      sendMessage(chatId, "🔄 *Update Master Sheet Proyek:*\n📁 Sheet: `" + actualProjectName + "`\n💾 File Asli: *Tersimpan di Google Drive (`LIST PROJECT`)*\n_Menyelaraskan data " + uploadedItems.length + " item._");
    }

    DriveApp.getFileById(tempFile.id).setTrashed(true);
    updateKeteranganLP(actualProjectName);

  } catch (err) {
    sendMessage(chatId, "⚠️ *Error memproses file " + fileName + ":* " + err.message);
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

// ================= DRIVE FILE MANAGER GUI INTERAKTIF (/drive /files) =================
function renderDriveFolderView(folderId, keyword) {
  var targetFolder;
  var isRoot = false;
  var rootFolder = getOrCreateFolder("LIST PROJECT");

  if (!folderId || folderId === "ROOT") {
    targetFolder = rootFolder;
    isRoot = true;
  } else {
    try {
      targetFolder = DriveApp.getFolderById(folderId);
    } catch(e) {
      targetFolder = rootFolder;
      isRoot = true;
    }
  }

  var currentFolderId = targetFolder.getId();
  var folderName = targetFolder.getName();

  var fileListText = [];
  var buttons = [];

  if (keyword && keyword !== "") {
    var query = "title contains '" + keyword.replace(/'/g, "\\'") + "' and trashed = false";
    var searchFiles = DriveApp.searchFiles(query);
    var count = 0;
    while (searchFiles.hasNext() && count < 10) {
      var f = searchFiles.next();
      var sizeMB = (f.getSize() / (1024 * 1024)).toFixed(2);
      fileListText.push((count + 1) + ". 📄 [" + f.getName() + "](" + f.getUrl() + ") `(" + sizeMB + " MB)`");
      buttons.push([{ text: "🗑 Hapus: " + f.getName().substring(0, 28), callback_data: "DD_YES_" + f.getId() }]);
      count++;
    }

    var searchFolders = DriveApp.searchFolders(query);
    var countF = 0;
    var folderBtnRow = [];
    while (searchFolders.hasNext() && countF < 4) {
      var sFold = searchFolders.next();
      folderBtnRow.push({ text: "📁 " + sFold.getName(), callback_data: "DD_OPEN_" + sFold.getId() });
      countF++;
    }
    if (folderBtnRow.length > 0) buttons.push(folderBtnRow);

  } else {
    var subFolders = targetFolder.getFolders();
    var folderRow = [];
    while (subFolders.hasNext()) {
      var sf = subFolders.next();
      folderRow.push({ text: "📁 " + sf.getName(), callback_data: "DD_OPEN_" + sf.getId() });
      buttons.push([{ text: "🗑 Hapus folder: " + sf.getName().substring(0, 24), callback_data: "DF_DEL_" + sf.getId() }]);
      if (folderRow.length === 2) {
        buttons.push(folderRow);
        folderRow = [];
      }
    }
    if (folderRow.length > 0) buttons.push(folderRow);

    var files = targetFolder.getFiles();
    var countFile = 0;
    while (files.hasNext() && countFile < 15) {
      var fileObj = files.next();
      var fName = fileObj.getName();
      var fSize = (fileObj.getSize() / (1024 * 1024)).toFixed(2);
      var fExt = fName.toLowerCase().split('.').pop();
      var icon = (fExt === "xlsx" || fExt === "xls") ? "📊" : (fExt === "jpg" || fExt === "jpeg" || fExt === "png") ? "🖼" : "📄";
      
      fileListText.push((countFile + 1) + ". " + icon + " [" + fName + "](" + fileObj.getUrl() + ") `(" + fSize + " MB)`");
      buttons.push([{ text: "🗑 Hapus: " + fName.substring(0, 28), callback_data: "DD_YES_" + fileObj.getId() }]);
      countFile++;
    }
  }

  var navRow = [];
  if (!isRoot) {
    var parents = targetFolder.getParents();
    var parentId = parents.hasNext() ? parents.next().getId() : "ROOT";
    navRow.push({ text: "🔙 Kembali", callback_data: "DD_OPEN_" + parentId });
  }
  navRow.push({ text: "🔄 Refresh", callback_data: "DD_OPEN_" + currentFolderId });
  if (navRow.length > 0) buttons.push(navRow);

  var msgText = "📂 *GOOGLE DRIVE EXPLORER*\n" +
                "📍 *Lokasi:* `LIST PROJECT" + (isRoot ? "" : " / " + folderName) + "`\n" +
                (keyword ? "🔍 *Pencarian:* `" + keyword + "`\n" : "") +
                "───────────────────────\n\n" +
                (fileListText.length > 0 ? fileListText.join("\n") : "_Tidak ada file di folder ini._") +
                "\n\n💡 _Klik link pada nama file untuk melihat/mengunduh langsung dari Drive._";

  return { text: msgText, keyboard: { inline_keyboard: buttons } };
}

function handleDriveExplorer(chatId, text) {
  var rawKeyword = text.replace(/^\/drive|^\/files/i, "").trim();
  var viewData = renderDriveFolderView("ROOT", rawKeyword);

  var url = telegramUrl + "/sendMessage";
  var payload = {
    chat_id: chatId,
    text: viewData.text,
    parse_mode: "Markdown",
    reply_markup: JSON.stringify(viewData.keyboard)
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ================= DRIVE DELETE DIALOG & LOGIC =================
function handleDriveDeleteConfirm(chatId, fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var name = file.getName();
    var keyboard = {
      inline_keyboard: [
        [
          { text: "✅ YA, HAPUS", callback_data: "DD_DY_" + fileId },
          { text: "❌ BATAL", callback_data: "DD_DN_" + fileId }
        ]
      ]
    };
    sendTelegramInlineKeyboard(chatId, "⚠️ *KONFIRMASI HAPUS FILE*\n\n📄 `" + name + "`\n\nFile akan dipindahkan ke *Trash* Google Drive.", keyboard);
  } catch(e) {
    sendMessage(chatId, "⚠️ Gagal menemukan file: `" + e.message + "`");
  }
}

function handleDriveFolderDeleteConfirm(chatId, folderId) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    var name = folder.getName();
    var keyboard = {
      inline_keyboard: [
        [
          { text: "✅ YA, HAPUS FOLDER", callback_data: "DF_DY_" + folderId },
          { text: "❌ BATAL", callback_data: "DF_DN_" + folderId }
        ]
      ]
    };
    sendTelegramInlineKeyboard(chatId, "⚠️ *KONFIRMASI HAPUS FOLDER*\n\n📁 `" + name + "`\n\nFolder beserta isinya akan dipindahkan ke *Trash* Google Drive.", keyboard);
  } catch(e) {
    sendMessage(chatId, "⚠️ Gagal menemukan folder: `" + e.message + "`");
  }
}

function handleDriveDelete(chatId, fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var name = file.getName();
    file.setTrashed(true);
    sendMessage(chatId, "🗑 *FILE DIHAPUS*\n\n📄 `" + name + "`\nStatus: dipindahkan ke *Trash* Google Drive.");
  } catch(e) {
    sendMessage(chatId, "⚠️ Gagal menghapus file: `" + e.message + "`");
  }
}

function handleDriveFolderDelete(chatId, folderId) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    var name = folder.getName();
    Drive.Files.update({ trashed: true }, folderId);
    sendMessage(chatId, "🗑 *FOLDER DIHAPUS*\n\n📁 `" + name + "`\nStatus: dipindahkan ke *Trash* Google Drive.");
  } catch(e) {
    sendMessage(chatId, "⚠️ Gagal menghapus folder: `" + e.message + "`");
  }
}

function sendTelegramInlineKeyboard(chatId, text, keyboard) {
  var url = telegramUrl + "/sendMessage";
  var payload = { chat_id: chatId, text: text, parse_mode: "Markdown", reply_markup: JSON.stringify(keyboard) };
  UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
}

// ================= FITUR 1: RAW TEXT PARSER (/parse) =================
function handleRawTextParser(chatId, text) {
  var rawBody = text.replace(/^\/parse/i, "").trim();
  if (!rawBody) {
    return sendMessage(chatId, "⚠️ *Format:* `/parse [NAMA_PROJECT]\n[Pesan teks dari WA / catatan]`");
  }

  var lines = rawBody.split("\n");
  var targetProject = "";
  var messageContent = "";

  var ss = getSpreadsheet();
  var projectSheets = getProjectSheets(ss);
  var activeProjectNames = projectSheets.map(function(s) { return s.getName(); });

  var firstLine = lines[0].trim();
  var matchedSheet = getSpecificMasterSheet(ss, firstLine);
  if (matchedSheet) {
    targetProject = matchedSheet.getName();
    messageContent = lines.slice(1).join("\n").trim();
  } else {
    messageContent = rawBody;
  }

  sendMessage(chatId, "🧠 *Menganalisis dan mencocokkan teks ke database master...*");

  var masterListSample = [];
  if (targetProject) {
    var pMaster = getMasterData(targetProject);
    for (var k in pMaster.list) {
      masterListSample.push(pMaster.list[k].kode);
    }
  }

  var systemInstruction = 
    "Kamu adalah AI Smart Text Extractor untuk pabrikasi baja.\n" +
    "Tugasmu mengekstrak: nama proyek, nama tim produksi, nama QC, serta daftar marking dan kuantitas dari pesan teks bebas/WhatsApp.\n" +
    "Daftar project aktif yang valid:\n" + JSON.stringify(activeProjectNames) + "\n" +
    (targetProject ? "Daftar kode marking valid pada master " + targetProject + ":\n" + JSON.stringify(masterListSample.slice(0, 100)) + "\n" : "") +
    "Output WAJIB berupa JSON murni:\n" +
    "{\n" +
    "  \"project\": \"" + (targetProject || "") + "\",\n" +
    "  \"prod\": \"PROD\",\n" +
    "  \"qc\": \"QC\",\n" +
    "  \"items\": [\n" +
    "    {\"kode\": \"KODE_LENGKAP\", \"qty\": 0}\n" +
    "  ]\n" +
    "}";

  var payload = {
    "systemInstruction": { "parts": [{ "text": systemInstruction }] },
    "contents": [{ "parts": [{ "text": messageContent }] }],
    "generationConfig": {
      "response_mime_type": "application/json",
      "temperature": 0.0,
      "topP": 0.1
    }
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  var modelsToTry = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-latest"];
  var resJson = null;

  for (var m = 0; m < modelsToTry.length; m++) {
    var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + modelsToTry[m] + ":generateContent?key=" + geminiApiKey;
    try {
      var response = UrlFetchApp.fetch(geminiUrl, options);
      var temp = JSON.parse(response.getContentText());
      if (temp.candidates && temp.candidates[0] && temp.candidates[0].content) {
        resJson = temp;
        break;
      }
    } catch(err) {}
  }

  if (!resJson) return sendMessage(chatId, "⚠️ *Gagal memproses teks dengan AI.*");

  var rawAiText = resJson.candidates[0].content.parts[0].text.trim().replace(/```json/gi, "").replace(/```/g, "").trim();
  var parsed = {};
  try {
    parsed = JSON.parse(rawAiText);
  } catch(e) {
    return sendMessage(chatId, "⚠️ *Format ekstraksi tidak valid.*");
  }

  var finalProject = parsed.project || targetProject;
  var finalProd = parsed.prod || "PROD";
  var finalQC = parsed.qc || "QC";
  var items = parsed.items || [];

  if (!finalProject) {
    return sendMessage(chatId, "⚠️ *Nama proyek tidak terdeteksi.* Sertakan nama proyek, misal: `/parse TTU2 [teks...]`");
  }

  var finalTargetSheet = getSpecificMasterSheet(ss, finalProject);
  if (!finalTargetSheet) {
    return sendMessage(chatId, "❌ Project `" + finalProject + "` tidak ditemukan pada database master aktif.");
  }
  var actualProjectName = finalTargetSheet.getName();
  var masterActual = getMasterData(actualProjectName);

  if (items.length === 0) {
    return sendMessage(chatId, "⚠️ *Tidak ada marking & jumlah yang berhasil diekstrak dari teks.*");
  }

  var draftLines = ["/input " + actualProjectName + " " + finalProd + " " + finalQC];
  var reviewLines = [];

  items.forEach(function(it, idx) {
    var k = String(it.kode || "").trim().toUpperCase();
    var q = parseUniversalNumber(it.qty);
    if (k && q > 0) {
      draftLines.push(k + " " + q);
      var exists = masterActual.list[actualProjectName + "|" + k] ? "✅" : "⚠️ *(Tidak ada di master)*";
      reviewLines.push((idx + 1) + ". `" + k + "` : *" + q + " item* " + exists);
    }
  });

  var fullDraftCommand = draftLines.join("\n");
  var cache = CacheService.getScriptCache();
  var sessionKey = "P_" + Math.floor(Math.random() * 100000);
  cache.put(sessionKey, fullDraftCommand, 600);

  var msgOut = "🧠 *HASIL EKSTRAKSI TEKS BEBAS (AI PARSER)*\n" +
               "───────────────────────\n" +
               "📁 *Project:* `" + actualProjectName + "`\n" +
               "👷‍♂️ *Tim:* `" + finalProd + "` | *QC:* `" + finalQC + "`\n\n" +
               "📦 *Marking Terdeteksi:*\n" +
               reviewLines.join("\n") + "\n\n" +
               "📋 *Draf Perintah:*\n`" + fullDraftCommand + "`";

  var inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "🚀 Eksekusi Input Sekarang", callback_data: "EX_" + sessionKey },
        { text: "❌ Batalkan", callback_data: "CN_" + sessionKey }
      ]
    ]
  };

  var url = telegramUrl + "/sendMessage";
  var payloadMsg = {
    chat_id: chatId,
    text: msgOut,
    parse_mode: "Markdown",
    reply_markup: JSON.stringify(inlineKeyboard)
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payloadMsg),
    muteHttpExceptions: true
  });
}

// ================= FITUR SYSTEM HEALTH & RESOURCE MONITOR (/sys) =================
function handleSystemMonitor(chatId) {
  var tglStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  
  var ss = getSpreadsheet();
  var allSheets = ss.getSheets();
  var projectSheets = getProjectSheets(ss);
  var inputSheet = getInputSheet(ss);
  
  var totalInputRows = Math.max(0, inputSheet.getLastRow() - 1);
  var totalCellsUsed = 0;
  for (var i = 0; i < allSheets.length; i++) {
    totalCellsUsed += (allSheets[i].getLastRow() * allSheets[i].getLastColumn());
  }
  var cellUtilizationPct = ((totalCellsUsed / 10000000) * 100).toFixed(2);

  var mainFolder = getOrCreateFolder("LIST PROJECT");
  var photoFolder = getOrCreateFolder("foto", mainFolder);
  
  var countExcel = 0;
  var excelFiles = mainFolder.getFiles();
  while (excelFiles.hasNext()) {
    excelFiles.next();
    countExcel++;
  }
  
  var countPhoto = 0;
  var photoFiles = photoFolder.getFiles();
  while (photoFiles.hasNext()) {
    photoFiles.next();
    countPhoto++;
  }
  
  var driveStorageUsedMB = "N/A";
  try {
    driveStorageUsedMB = (DriveApp.getStorageUsed() / (1024 * 1024)).toFixed(1);
  } catch(e) {}

  var triggerSummary = "1 Trigger Harian (07:00 WIB)";
  try {
    var triggers = ScriptApp.getProjectTriggers();
    triggerSummary = triggers.length + " Trigger Aktif";
  } catch(e) {}

  var sysMsg = "🖥 *SYSTEM HEALTH & RESOURCE MONITOR*\n" +
               "🕒 *Status per:* " + tglStr + " WIB\n" +
               "─────────────────────────\n\n" +
               
               "⚙️ *1. Google Apps Script Quota (GAS)*\n" +
               "• *Runtime Limit:* `90 Menit / Hari` *(Aman ✅)*\n" +
               "• *UrlFetch Quota:* `20.000 Panggilan / Hari` *(Normal ✅)*\n" +
               "• *Triggers:* `" + triggerSummary + "`\n\n" +
               
               "🤖 *2. Gemini AI Engine & API Status*\n" +
               "• *Primary Model:* `gemini-2.5-pro` *(Reasoning Hybrid)*\n" +
               "• *Rolling Stack:* `2.5-pro ➔ 2.5-flash ➔ 2.0-flash ➔ 1.5-flash`\n" +
               "• *API Status:* `Aktif & Siap Pakai ✅`\n" +
               "• *Vision OCR:* `Universal Master Matching`\n\n" +
               
               "💾 *3. Google Drive & File Storage*\n" +
               "• *Drive Terpakai:* `~" + driveStorageUsedMB + " MB` *(Storage Cloud)*\n" +
               "• *Folder `LIST PROJECT`:* `" + countExcel + " Master/File`\n" +
               "• *Folder `foto`:* `" + countPhoto + " Arsip Foto Formulir`\n\n" +
               
               "📊 *4. Database Spreadsheet Health*\n" +
               "• *Active Projects:* `" + projectSheets.length + " Sheet Master`\n" +
               "• *Total Input Log:* `" + totalInputRows + " Baris Transaksi`\n" +
               "• *Cell Usage:* `" + totalCellsUsed + " / 10.000.000 sel` (`" + cellUtilizationPct + "%` ⚡️)\n" +
               "─────────────────────────\n" +
               "_Pilih tindakan pemeliharaan di bawah ini:_";

  var inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "🧹 Bersihkan Cache / RAM", callback_data: "SYS_CLEAR_CACHE" },
        { text: "🔄 Refresh Index Master", callback_data: "SYS_REFRESH_INDEX" }
      ]
    ]
  };

  var url = telegramUrl + "/sendMessage";
  var payload = {
    chat_id: chatId,
    text: sysMsg,
    parse_mode: "Markdown",
    reply_markup: JSON.stringify(inlineKeyboard)
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ================= AI CONVERSATIONAL & SMART INTENT ROUTER =================
function handleSmartConversationRouter(chatId, rawText) {
  var ss = getSpreadsheet();
  var projectSheets = getProjectSheets(ss);
  var activeProjectNames = projectSheets.map(function(s) { return s.getName(); });

  var systemInstruction = 
    "Kamu adalah Asisten AI Produksi & Pabrikasi Baja. Tugasmu adalah menganalisis pesan percakapan bebas atau perintah yang salah/typo dari user.\n" +
    "Daftar Project Aktif di database:\n" + JSON.stringify(activeProjectNames) + "\n\n" +
    "Daftar fungsi sistem yang tersedia:\n" +
    "1. /status [PROJECT] -> Cek status eksekutif, tonase, luas, nilai SPK & PDF master\n" +
    "2. /input [PROJECT] [TIM] [QC]\\n[KODE] [QTY] -> Input hasil produksi harian\n" +
    "3. /parse [PROJECT]\\n[PESAN] -> Ekstraksi teks bebas WhatsApp menjadi input\n" +
    "4. /drive [KATA_KUNCI] -> Buka file manager interaktif Google Drive\n" +
    "5. /stop -> Hentikan paksa seluruh proses bot yang sedang berjalan\n" +
    "6. /remaining [PROJECT / sum / kode KODE / ral WARNA] -> Cek sisa kuota marking\n" +
    "7. /check [KODE] -> Cek spesifikasi berat/luas/JP 1 produk\n" +
    "8. /sys -> Cek kesehatan sistem, kuota GAS, Drive, AI & database\n" +
    "9. /spk [PROJECT] -> Cek SPK & nilai kontrak\n" +
    "10. /projects -> Menampilkan daftar semua project\n\n" +
    "Output WAJIB berupa JSON murni dengan format:\n" +
    "{\n" +
    "  \"reply_message\": \"Kalimat ramah, jelas, menjelaskan maksud yang kamu tangkap dan memberikan contoh command yang benar\",\n" +
    "  \"suggested_command\": \"Perintah Telegram yang sudah diperbaiki secara presisi (kosongkan jika hanya obrolan biasa)\",\n" +
    "  \"button_label\": \"Label tombol aksi cepat (misal: '🚀 Jalankan Command Ini') atau kosongkan jika tidak butuh\"\n" +
    "}";

  var payload = {
    "systemInstruction": { "parts": [{ "text": systemInstruction }] },
    "contents": [{ "parts": [{ "text": "Pesan dari user:\n" + rawText }] }],
    "generationConfig": {
      "response_mime_type": "application/json",
      "temperature": 0.1,
      "topP": 0.2
    }
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  var modelsToTry = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-latest"];
  var resJson = null;

  for (var m = 0; m < modelsToTry.length; m++) {
    var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + modelsToTry[m] + ":generateContent?key=" + geminiApiKey;
    try {
      var response = UrlFetchApp.fetch(geminiUrl, options);
      var temp = JSON.parse(response.getContentText());
      if (temp.candidates && temp.candidates[0] && temp.candidates[0].content) {
        resJson = temp;
        break;
      }
    } catch(err) {}
  }

  if (!resJson) return sendMessage(chatId, "Perintah tidak dikenali. Ketik `/help` untuk melihat panduan.");

  var aiResultText = resJson.candidates[0].content.parts[0].text.trim().replace(/```json/gi, "").replace(/```/g, "").trim();
  var parsedAI = {};
  try {
    parsedAI = JSON.parse(aiResultText);
  } catch(e) {
    return sendMessage(chatId, "Perintah tidak dikenali. Ketik `/help`.");
  }

  var replyMsg = parsedAI.reply_message || "Apakah ini perintah yang kamu maksud?";
  var suggestedCmd = (parsedAI.suggested_command || "").trim();
  var btnLabel = parsedAI.button_label || "🚀 Jalankan Command Ini";

  if (suggestedCmd && suggestedCmd !== "") {
    var cache = CacheService.getScriptCache();
    var sessionKey = "S_" + Math.floor(Math.random() * 100000);
    cache.put(sessionKey, suggestedCmd, 600);

    var inlineKeyboard = {
      inline_keyboard: [
        [
          { text: btnLabel, callback_data: "EX_" + sessionKey },
          { text: "❌ Batalkan", callback_data: "CN_" + sessionKey }
        ]
      ]
    };

    var url = telegramUrl + "/sendMessage";
    var payloadMsg = {
      chat_id: chatId,
      text: replyMsg + "\n\n📋 *Contoh format yang benar:*\n`" + suggestedCmd + "`",
      parse_mode: "Markdown",
      reply_markup: JSON.stringify(inlineKeyboard)
    };

    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payloadMsg),
      muteHttpExceptions: true
    });
  } else {
    sendMessage(chatId, replyMsg);
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
    if (!isSheetIgnored(name)) {
      projectSheets.push(sheets[i]);
    }
  }
  if (projectSheets.length === 0) throw new Error("Tidak ada sheet master project valid yang ditemukan.");
  return projectSheets;
}

function getSpecificMasterSheet(ss, projectName) {
  if (!projectName) return null;
  var cleanTarget = projectName.toUpperCase().trim();
  if (isSheetIgnored(cleanTarget)) return null;

  var sheet = ss.getSheetByName(projectName);
  if (sheet && !isSheetIgnored(sheet.getName())) return sheet;
  
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (!isSheetIgnored(name) && name.toLowerCase().includes(projectName.toLowerCase().trim())) {
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

// ================= DATA MASTER DINAMIS (MULTI-ROW HEADER SCANNER) =================
function getMasterData(targetProject) {
  var ss = getSpreadsheet();
  var sheets = targetProject ? [getSpecificMasterSheet(ss, targetProject)] : getProjectSheets(ss);
  
  var master = { list: {}, totalJp: 0, totalBerat: 0, totalLuas: 0 };
  
  sheets.forEach(function(sheet) {
    if (!sheet || isSheetIgnored(sheet.getName())) return;
    var pName = sheet.getName();
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    
    var startRow = 8;
    var colIdxKode = 2;   
    var colIdxJp = 8;     
    var colIdxBerat = 9;  
    var colIdxLuas = 10;  
    var colIdxRal = 11;   
    
    for (var r = 0; r < Math.min(data.length, 20); r++) {
      var rowStr = data[r].map(function(cell) { return String(cell || ""); }).join(" ").toUpperCase();
      
      if (rowStr.includes("KODE PRODUK") || rowStr.includes("MARKING") || rowStr.includes("NAMA PRODUK") || rowStr.includes("DESKRIPSI")) {
        startRow = r + 1;
        
        var scanRows = [r];
        if (r > 0) scanRows.unshift(r - 1);
        if (r + 1 < data.length) scanRows.push(r + 1);
        if (r + 2 < data.length) scanRows.push(r + 2);
        
        var maxCols = data[r].length;
        for (var c = 0; c < maxCols; c++) {
          var combinedHName = "";
          for (var sr = 0; sr < scanRows.length; sr++) {
            combinedHName += " " + String(data[scanRows[sr]][c] || "").toUpperCase().trim();
          }
          
          if (combinedHName.includes("KODE PRODUK") || combinedHName.includes("MARKING") || combinedHName.includes("ITEM CODE")) {
            colIdxKode = c;
          } else if (combinedHName.includes("JP") || combinedHName.includes("QTY") || combinedHName.includes("JUMLAH") || combinedHName.includes("VOL")) {
            colIdxJp = c;
          } else if (combinedHName.includes("BERAT") || combinedHName.includes("WEIGHT") || combinedHName.includes("TONASE") || combinedHName.includes("KG") || combinedHName.includes("WGT")) {
            colIdxBerat = c;
          } else if (combinedHName.includes("LUAS") || combinedHName.includes("AREA") || combinedHName.includes("PENGECATAN") || combinedHName.includes("PAINT") || combinedHName.includes("M2") || combinedHName.includes("SURFACE")) {
            colIdxLuas = c;
          } else if (combinedHName.includes("RAL") || combinedHName.includes("WARNA") || combinedHName.includes("CAT") || combinedHName.includes("COLOR")) {
            colIdxRal = c;
          }
        }
        break;
      }
    }

    for (var i = startRow; i < data.length; i++) {
      var row = data[i];
      var kode = String(row[colIdxKode] || "").trim();
      
      if (!kode && row[0]) {
        kode = String(row[0]).trim();
      }
      
      if (!kode || kode.toUpperCase().includes("GRAND TOTAL") || kode.toUpperCase().includes("TOTAL") || kode.toUpperCase().includes("SUB TOTAL")) {
        continue;
      }
      
      var jp = parseUniversalNumber(row[colIdxJp]);
      var berat = parseUniversalNumber(row[colIdxBerat]);
      var luas = parseUniversalNumber(row[colIdxLuas]);
      
      if (luas === 0) {
        for (var checkCol = colIdxBerat + 1; checkCol < Math.min(row.length, colIdxBerat + 4); checkCol++) {
          var possibleLuas = parseUniversalNumber(row[checkCol]);
          if (possibleLuas > 0 && checkCol !== colIdxBerat && checkCol !== colIdxJp) {
            luas = possibleLuas;
            colIdxLuas = checkCol;
            break;
          }
        }
      }

      var ral = String(row[colIdxRal] || "-").trim();
      
      if (jp > 0) {
        var key = pName + "|" + kode;
        var unitBerat = jp > 0 ? (berat / jp) : 0;
        var unitLuas = jp > 0 ? (luas / jp) : 0;
        
        master.list[key] = {
          project: pName,
          kode: kode,
          jp: jp,
          berat_total: berat,
          luas_total: luas,
          unit_berat: unitBerat,
          unit_luas: unitLuas,
          ral: ral,
          done: 0
        };
        
        master.totalJp += jp;
        master.totalBerat += berat;
        master.totalLuas += luas;
      }
    }
  });
  
  return master;
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
    
    if (isSheetIgnored(pName)) continue;
    if (filterProject && pName.toLowerCase() !== filterProject.toLowerCase().trim()) continue;
    
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

// ================= SMART LINE PARSER =================
function parseSmartInputLines(lines, masterData, projectName) {
  var parsedItems = [];
  var lastKnownPrefix = "";

  for (var i = 1; i < lines.length; i++) {
    var rawLine = lines[i].trim();
    if (!rawLine) continue;

    var rawKode = "";
    var rawQty = 0;

    if (rawLine.indexOf(",") !== -1) {
      var lastCommaIdx = rawLine.lastIndexOf(",");
      rawKode = rawLine.substring(0, lastCommaIdx).trim();
      rawQty = parseUniversalNumber(rawLine.substring(lastCommaIdx + 1));
    } else {
      var parts = rawLine.split(/\s+/);
      rawKode = parts.slice(0, parts.length - 1).join(" ").trim();
      rawQty = parseUniversalNumber(parts[parts.length - 1]);
    }

    if (!rawKode || isNaN(rawQty) || rawQty <= 0) continue;

    var finalKode = rawKode;
    var directKey = projectName + "|" + finalKode;

    if (masterData.list[directKey]) {
      var lastDashIdx = finalKode.lastIndexOf("-");
      if (lastDashIdx !== -1) {
        var secondLastDash = finalKode.substring(0, lastDashIdx).lastIndexOf("-");
        if (secondLastDash !== -1) {
          lastKnownPrefix = finalKode.substring(0, secondLastDash + 1);
        } else {
          lastKnownPrefix = finalKode.substring(0, lastDashIdx + 1);
        }
      }
    } else if (lastKnownPrefix !== "") {
      var reconstructedKode = lastKnownPrefix + rawKode;
      var reconKey = projectName + "|" + reconstructedKode;

      if (masterData.list[reconKey]) {
        finalKode = reconstructedKode;
      }
    }

    parsedItems.push({
      originalText: rawLine,
      kode: finalKode,
      qty: rawQty
    });
  }

  return parsedItems;
}

// ================= STATUS EXECUTIVE (INSTANT TEXT + ASYNC PDF) =================
function handleStatusProject(chatId, text) {
  var rawArgs = (text || "").replace(/^\/status/i, "").replace(/['"]/g, "").trim();
  var ss = getSpreadsheet();
  
  if (!rawArgs) return handleUpdateGlobal(chatId);

  var targetSheet = getSpecificMasterSheet(ss, rawArgs);
  if (!targetSheet) return sendMessage(chatId, "❌ Project `" + rawArgs + "` tidak ditemukan atau diabaikan. Ketik `/projects`.");

  var pName = targetSheet.getName();
  sendMessage(chatId, "⏳ *Mengambil data & menyiapkan dokumen `" + pName + "`...*");

  var master = getMasterData(pName);
  var done = getDoneData(master, pName);
  var fin = getProjectFinance(pName);

  var totalJp = master.totalJp;
  var totalBerat = master.totalBerat;
  var totalLuas = master.totalLuas;
  
  var progJp = totalJp > 0 ? (done.jp / totalJp) * 100 : 0;
  var progBerat = totalBerat > 0 ? (done.berat / totalBerat) * 100 : 0;
  var progLuas = totalLuas > 0 ? (done.luas / totalLuas) * 100 : 0;

  var sisaItem = Math.max(0, totalJp - done.jp);
  var statusBadge = (sisaItem === 0 && totalJp > 0) ? "✅ *100% CLOSE*" : "⏳ *IN PROGRESS (" + sisaItem + " sisa)*";

  var totalVolume = fin.type === "KG" ? totalBerat : totalLuas;
  var volSelesai = fin.type === "KG" ? done.berat : done.luas;
  var satuan = fin.type === "KG" ? "Kg" : "m²";
  var totalNilaiKontrak = totalVolume * fin.rate;
  var nilaiOpnameTagih = volSelesai * fin.rate;

  var captionMsg = "📊 *STATUS EXECUTIVE: " + pName + "*\n" +
                   "───────────────────────\n" +
                   "📌 Status: " + statusBadge + "\n" +
                   "📈 Progres Global: `" + progJp.toFixed(1) + "%` (" + done.jp + "/" + totalJp + " Item)\n\n" +
                   "⚖️ Tonase: `" + done.berat.toFixed(1) + "/" + totalBerat.toFixed(1) + " Kg` (`" + progBerat.toFixed(1) + "%`)\n" +
                   "📏 Luas: `" + done.luas.toFixed(1) + "/" + totalLuas.toFixed(1) + " m²` (`" + progLuas.toFixed(1) + "%`)\n\n" +
                   "💰 Nilai SPK: *" + formatRupiah(totalNilaiKontrak) + "*\n" +
                   "💵 Hak Tagih: *" + formatRupiah(nilaiOpnameTagih) + "*\n" +
                   "📅 Deadline: `" + fin.deadline + "`";
  
  sendMessage(chatId, captionMsg);

  try {
    var ssId = ss.getId();
    var sheetId = targetSheet.getSheetId();
    var url = "https://docs.google.com/spreadsheets/d/" + ssId + "/export?exportFormat=pdf&format=pdf&size=A4&portrait=false&fitw=true&gridlines=true&gid=" + sheetId;
    
    var tokenOAuth = ScriptApp.getOAuthToken();
    var response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + tokenOAuth },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) {
      var pdfBlob = response.getBlob().setName("Master_" + pName.replace(/[^A-Za-z0-9]/g, "_") + ".pdf");
      sendTelegramDocument(chatId, pdfBlob, "📄 *Dokumen Master Sheet:* `" + pName + "`");
    }
  } catch (err) {}
}

function handleUpdateGlobal(chatId) {
  var ss = getSpreadsheet();
  var projectSheets = getProjectSheets(ss);
  var msg = "📊 *REKAP PROGRESS SELURUH PROJECT*\n───────────────────────\n\n";
  
  projectSheets.forEach(function(sheet, idx) {
    var pName = sheet.getName();
    var master = getMasterData(pName);
    var done = getDoneData(master, pName);
    var prog = master.totalJp > 0 ? (done.jp / master.totalJp) * 100 : 0;
    
    msg += (idx + 1) + "️⃣ *" + pName + "* : `" + prog.toFixed(1) + "%` (" + done.jp + "/" + master.totalJp + " item)\n";
  });
  
  msg += "\n_Ketik `/status NAMA_PROJECT` untuk rincian lengkap & PDF._";
  sendMessage(chatId, msg);
}

// ================= FITUR SMART UNIVERSAL SEARCH (/search) =================
function handleSearch(chatId, text) {
  var rawQuery = (text || "").replace(/^\/search/i, "").replace(/['"]/g, "").trim();
  
  if (!rawQuery) {
    return sendMessage(chatId, "⚠️ *Format Salah!*\nGunakan: `/search KODE_MARKING`\n_Contoh:_ `/search WB400x400`");
  }

  var ss = getSpreadsheet();
  var queryLower = rawQuery.toLowerCase();
  var allMaster = getMasterData();
  getDoneData(allMaster);

  var foundMarkings = [];
  for (var key in allMaster.list) {
    var item = allMaster.list[key];
    if (item.kode.toLowerCase().indexOf(queryLower) !== -1) {
      foundMarkings.push(item);
    }
  }

  if (foundMarkings.length === 0) {
    return sendMessage(chatId, "❌ Tidak ditemukan marking dengan kata kunci: `" + rawQuery + "`.");
  }

  var msgMarking = "🔍 *HASIL PENCARIAN MARKING: `" + rawQuery + "`*\n" +
                   "───────────────────────\n\n";

  foundMarkings.slice(0, 10).forEach(function(it, idx) {
    var sisa = it.jp - it.done;
    var statusK = (sisa === 0) ? "✅ CLOSE" : (sisa < 0 ? "❗️ OVER " + Math.abs(sisa) : "⏳ REMAINING " + sisa);
    var totalBeratMarking = it.unit_berat * it.jp;

    msgMarking += (idx + 1) + "️⃣ *Kode:* `" + it.kode + "`\n" +
                  "   📁 *Project:* `" + it.project + "`\n" +
                  "   📦 *Volume:* " + it.done + " / " + it.jp + " item (*" + statusK + "*)\n" +
                  "   ⚖️ *Berat Satuan:* `" + it.unit_berat.toFixed(2) + " Kg` (Total: `" + totalBeratMarking.toFixed(1) + " Kg`)\n" +
                  "   🎨 *Warna:* " + it.ral + "\n\n";
  });

  if (foundMarkings.length > 10) {
    msgMarking += "_...dan " + (foundMarkings.length - 10) + " marking lainnya._";
  }

  sendMessage(chatId, msgMarking.trim());
}

// ================= HANDLER CALLBACK QUERY TELEGRAM =================
function handleBotCallback(query) {
  var callbackId = query.id;
  var chatId = query.message.chat.id;
  var messageId = query.message.message_id;
  var data = query.data || "";

  UrlFetchApp.fetch(telegramUrl + "/answerCallbackQuery", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ callback_query_id: callbackId }),
    muteHttpExceptions: true
  });

  var cache = CacheService.getScriptCache();

  // A. Aksi Hapus File dari Drive Explorer
  if (data.indexOf("DD_DY_") === 0) {
    var fileId = data.replace("DD_DY_", "");
    handleDriveDelete(chatId, fileId);
    editTelegramMessage(chatId, messageId, "🗑 *File berhasil dihapus ke Trash Google Drive.*");
    return;
  }
  if (data.indexOf("DD_DN_") === 0) {
    editTelegramMessage(chatId, messageId, "❌ *Penghapusan file dibatalkan.*");
    return;
  }
  if (data.indexOf("DF_DY_") === 0) {
    var folderId = data.replace("DF_DY_", "");
    handleDriveFolderDelete(chatId, folderId);
    editTelegramMessage(chatId, messageId, "🗑 *Folder berhasil dihapus ke Trash Google Drive.*");
    return;
  }
  if (data.indexOf("DF_DN_") === 0) {
    editTelegramMessage(chatId, messageId, "❌ *Penghapusan folder dibatalkan.*");
    return;
  }
  if (data.indexOf("DD_YES_") === 0) {
    var fileIdDel = data.replace("DD_YES_", "");
    handleDriveDeleteConfirm(chatId, fileIdDel);
    return;
  }
  if (data.indexOf("DF_DEL_") === 0) {
    var folderIdDel = data.replace("DF_DEL_", "");
    handleDriveFolderDeleteConfirm(chatId, folderIdDel);
    return;
  }

  // B. Aksi Navigasi Drive Explorer
  if (data.indexOf("DD_OPEN_") === 0) {
    var targetFolderId = data.replace("DD_OPEN_", "");
    var viewData = renderDriveFolderView(targetFolderId, "");
    
    var url = telegramUrl + "/editMessageText";
    var payload = {
      chat_id: chatId,
      message_id: messageId,
      text: viewData.text,
      parse_mode: "Markdown",
      reply_markup: JSON.stringify(viewData.keyboard)
    };

    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return;
  }

  // C. Aksi dari SYS_CLEAR_CACHE
  if (data === "SYS_CLEAR_CACHE") {
    cache.removeAll(["MASTER_GLOBAL_CACHE"]);
    editTelegramMessage(chatId, messageId, "🧹 *BERSIHKAN CACHE SELESAI!*\n\nMemori sementara script telah dikosongkan.");
    return;
  }

  // D. Aksi dari SYS_REFRESH_INDEX
  if (data === "SYS_REFRESH_INDEX") {
    editTelegramMessage(chatId, messageId, "⏳ *Sedang menyusun ulang index master data...*");
    var master = getMasterData();
    getDoneData(master);
    updateKeteranganLP();
    editTelegramMessage(chatId, messageId, "🔄 *REFRESH INDEX SELESAI!*\n\n✅ Seluruh data master dan riwayat log telah disinkronkan.");
    return;
  }

  // E. Aksi dari Remaining per Project
  if (data.indexOf("RP_") === 0) {
    var pName = data.replace("RP_", "");
    editTelegramMessage(chatId, messageId, "⏳ *Memproses rincian `" + pName + "`...*");
    executeRemainingDetail(chatId, pName);
    return;
  }

  // F. Aksi dari OCR YES
  if (data.indexOf("OY_") === 0) {
    var sessionKey = data.replace("OY_", "");
    var cachedInputText = cache.get(sessionKey);
    if (!cachedInputText) return editTelegramMessage(chatId, messageId, "⚠️ *Sesi telah kadaluarsa.* Silakan kirim ulang foto.");

    cache.remove(sessionKey);
    editTelegramMessage(chatId, messageId, "⏳ *Memproses data ke Google Spreadsheet...*");
    handleInput(chatId, cachedInputText);
    return;
  }

  // G. Aksi dari OCR NO
  if (data.indexOf("ON_") === 0) {
    var sessionKeyNo = data.replace("ON_", "");
    cache.remove(sessionKeyNo);
    editTelegramMessage(chatId, messageId, "❌ *PENGINPUTAN DIBATALKAN.*");
    return;
  }

  // H. Aksi dari AI Smart Suggestion / Parse EXEC
  if (data.indexOf("EX_") === 0) {
    var sessionKeyS = data.replace("EX_", "");
    var cachedCmd = cache.get(sessionKeyS);
    if (!cachedCmd) return editTelegramMessage(chatId, messageId, "⚠️ *Sesi telah kadaluarsa.*");

    cache.remove(sessionKeyS);
    editTelegramMessage(chatId, messageId, "⏳ *Mengeksekusi perintah...*\n`" + cachedCmd + "`");
    
    if (cachedCmd.toLowerCase().startsWith("/input")) handleInput(chatId, cachedCmd);
    else if (cachedCmd.toLowerCase().startsWith("/status")) handleStatusProject(chatId, cachedCmd);
    else if (cachedCmd.toLowerCase().startsWith("/remaining")) handleRemaining(chatId, cachedCmd);
    else if (cachedCmd.toLowerCase().startsWith("/check")) handleCheck(chatId, cachedCmd);
    else if (cachedCmd.toLowerCase().startsWith("/spk")) handleSPK(chatId, cachedCmd);
    else if (cachedCmd.toLowerCase().startsWith("/projects")) handleListProjects(chatId);
    else sendMessage(chatId, "⚠️ Eksekusi manual via salin format.");
    return;
  }

  if (data.indexOf("CN_") === 0) {
    var sessionKeyC = data.replace("CN_", "");
    cache.remove(sessionKeyC);
    editTelegramMessage(chatId, messageId, "❌ *Perintah dibatalkan.*");
  }
}

// Fungsi pembantu edit pesan telegram callback
function editTelegramMessage(chatId, messageId, text) {
  var url = telegramUrl + "/editMessageText";
  var payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "Markdown"
  };
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ================= HANDLER INPUT MANUAL / BATCH =================
function handleInput(chatId, text) {
  var lines = text.split("\n");
  var firstLine = lines[0].trim();
  
  if (lines.length < 2) {
    return sendMessage(chatId, "⚠️ *Format Salah*\nGunakan format multi-baris:\n`/input NAMA_PROJECT TIM_PRODUKSI QC\nKODE_PRODUK,JUMLAH\nKODE_PRODUK JUMLAH`");
  }
  
  var rawHeader = firstLine.replace(/^\/input\s+/i, "").trim();
  var ss = getSpreadsheet();
  var projectSheets = getProjectSheets(ss);
  var actualProjectName = "";
  var remainingHeader = "";
  
  for (var p = 0; p < projectSheets.length; p++) {
    var pSheetName = projectSheets[p].getName();
    if (rawHeader.toLowerCase().startsWith(pSheetName.toLowerCase())) {
      actualProjectName = pSheetName;
      remainingHeader = rawHeader.substring(pSheetName.length).trim();
      break;
    }
  }
  
  var headerParts = rawHeader.split(" ");
  if (!actualProjectName) {
    if (headerParts.length < 3) {
      return sendMessage(chatId, "❌ Project tidak dikenali atau format Tim & QC belum lengkap. Cek via `/projects`.");
    }
    var specificSheet = getSpecificMasterSheet(ss, headerParts[0]);
    if (!specificSheet) {
      return sendMessage(chatId, "❌ Project `" + headerParts[0] + "` tidak ditemukan atau diabaikan.");
    }
    actualProjectName = specificSheet.getName();
    remainingHeader = headerParts.slice(1).join(" ").trim();
  }
  
  if (isSheetIgnored(actualProjectName)) {
    return sendMessage(chatId, "❌ Sheet/Project `" + actualProjectName + "` berawalan LK atau diabaikan sistem.");
  }

  if (isProjectLocked(actualProjectName)) {
    return sendMessage(chatId, "🔒 *Project Terkunci:* Project `" + actualProjectName + "` sedang dikunci oleh Supervisor.");
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
  
  var itemsToProcess = parseSmartInputLines(lines, masterData, actualProjectName);

  if (itemsToProcess.length === 0) {
    return sendMessage(chatId, "⚠️ *Tidak ada baris data produk yang valid untuk diinput.*");
  }

  itemsToProcess.forEach(function(entry) {
    var kode = entry.kode;
    var jumlah = entry.qty;
    var key = actualProjectName + "|" + kode;

    if (!masterData.list[key]) {
      msgError += "❌ `" + entry.originalText + "` ➔ `" + kode + "` tidak ditemukan di sheet `" + actualProjectName + "`.\n";
      return;
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
      msgWarning += "⚠️ `" + kode + "` Sisa: " + (maxJp - currentDone) + " | Diinput: " + jumlah + " *(OVER: " + over + ")*\n";
      msgSuccess += "▪️ `" + kode + "` (" + jumlah + " item)\n      Status: ❗️ *OVER " + over + "* | 🎨 " + ral + "\n";
    } else if (remaining === 0) {
      msgSuccess += "▪️ `" + kode + "` (" + jumlah + " item)\n      Status: ✅ *CLOSE* | 🎨 " + ral + "\n";
    } else {
      msgSuccess += "▪️ `" + kode + "` (" + jumlah + " item)\n      Status: ⏳ *REMAINING " + remaining + "* | 🎨 " + ral + "\n";
    }
    no++;
  });
  
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

// ================= HANDLE FITUR: SPK & OPNAME =================
function handleSPK(chatId, text) {
  var parts = text.split(" ");
  var targetProject = parts.length > 1 ? parts.slice(1).join(" ").trim() : null;
  var ss = getSpreadsheet();
  
  if (targetProject) {
    var specificSheet = getSpecificMasterSheet(ss, targetProject);
    if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan. Ketik `/projects`.");
    
    var pName = specificSheet.getName();
    var master = getMasterData(pName);
    var done = getDoneData(master, pName);
    var fin = getProjectFinance(pName);
    
    var totalVolume = fin.type === "KG" ? master.totalBerat : master.totalLuas;
    var satuan = fin.type === "KG" ? "Kg" : "m²";
    var totalNilaiKontrak = totalVolume * fin.rate;
    var nilaiProgressSelesai = (fin.type === "KG" ? done.berat : done.luas) * fin.rate;
    
    var msg = "📑 *SURAT PERINTAH KERJA (SPK) & KONTRAK*\n" +
              "📁 *Project:* `" + pName + "`\n" +
              "═══════════════════════\n" +
              "📏 *Volume Kontrak Fisik:*\n" +
              "   • Total Tonase: `" + master.totalBerat.toFixed(2) + " Kg`\n" +
              "   • Total Luas Area: `" + master.totalLuas.toFixed(2) + " m²`\n" +
              "   • Total Qty: `" + master.totalJp + " Item`\n\n" +
              "💰 *Rincian Nilai & Tagihan:*\n" +
              "   • Acuan Tarif: `" + fin.type + "`\n" +
              "   • Tarif Borongan: `" + formatRupiah(fin.rate) + " / " + satuan + "`\n" +
              "   • Total Nilai SPK: `" + formatRupiah(totalNilaiKontrak) + "`\n" +
              "   • Hak Tagih Saat Ini: `" + formatRupiah(nilaiProgressSelesai) + "`\n\n" +
              "⏳ *Batas Waktu Pengajuan Invoice:*\n" +
              "   📅 `" + fin.deadline + "`\n" +
              "═══════════════════════\n" +
              "_Gunakan `/remaining " + pName + "` untuk rincian tagihan._";
              
    return sendMessage(chatId, msg);
  }
  
  var projectSheets = getProjectSheets(ss);
  var msgAll = "📑 *DAFTAR SURAT PERINTAH KERJA (SPK) SELURUH PROJECT*\n\n";
  
  projectSheets.forEach(function(sheet, idx) {
    var pName = sheet.getName();
    var master = getMasterData(pName);
    var fin = getProjectFinance(pName);
    var totalVol = fin.type === "KG" ? master.totalBerat : master.totalLuas;
    var satuan = fin.type === "KG" ? "Kg" : "m²";
    var nilaiKontrak = totalVol * fin.rate;
    
    msgAll += (idx + 1) + "️⃣ *Project: " + pName + "*\n" +
              "   • Total Volume: `" + totalVol.toFixed(1) + " " + satuan + "` (" + master.totalJp + " item)\n" +
              "   • Tarif: `" + formatRupiah(fin.rate) + "/" + satuan + "` | Nilai: `" + formatRupiah(nilaiKontrak) + "`\n" +
              "   • Deadline Invoice: 📅 `" + fin.deadline + "`\n\n";
  });
  
  msgAll += "_Ketik `/spk NAMA_PROJECT` untuk melihat rincian satuan project._";
  sendMessage(chatId, msgAll);
}

// ================= HANDLE REMAINING LOKAL (ANTI-TIMEOUT) =================
function handleRemaining(chatId, text) {
  try {
    var rawArgs = (text || "").replace(/^\/remaining/i, "").trim();
    var parts = rawArgs.split(/\s+/);
    var subCommand = (parts[0] || "").toLowerCase();
    var ss = getSpreadsheet();

    if (subCommand === "sum" || subCommand === "summary" || rawArgs === "") {
      var sheets = getProjectSheets(ss);
      var buttons = [];
      sheets.forEach(function(s) {
        buttons.push([{ text: s.getName(), callback_data: "RP_" + s.getName() }]);
      });
      
      var url = telegramUrl + "/sendMessage";
      UrlFetchApp.fetch(url, {
        method: "post", contentType: "application/json",
        payload: JSON.stringify({ chat_id: chatId, text: "📊 *Pilih proyek untuk melihat sisa produksi (Anti-Timeout):*", reply_markup: { inline_keyboard: buttons } })
      });
      return;
    }

    if (subCommand === "kode" || subCommand === "marking") {
      var targetKode = parts.slice(1).join(" ").trim();
      if (!targetKode) return sendMessage(chatId, "⚠️ Format: `/remaining kode KODE_PRODUK`");

      var masterKode = getMasterData();
      getDoneData(masterKode);
      var foundLines = [];

      for (var k in masterKode.list) {
        var it = masterKode.list[k];
        if (it.kode.toLowerCase().indexOf(targetKode.toLowerCase()) !== -1) {
          var sisaK = it.jp - it.done;
          var statusBadge = (sisaK <= 0) ? "✅ CLOSE" : "⏳ Sisa: *" + sisaK + "/" + it.jp + "*";
          var sKg = sisaK > 0 ? (it.unit_berat * sisaK) : 0;
          foundLines.push("📁 `[" + it.project + "]` *" + it.kode + "*\n   • Status: " + statusBadge + " (`" + sKg.toFixed(1) + " Kg` | 🎨 " + it.ral + ")");
        }
      }

      if (foundLines.length === 0) return sendMessage(chatId, "❌ Marking `" + targetKode + "` tidak ditemukan.");
      return sendMessage(chatId, "🔍 *STATUS MARKING: `" + targetKode + "`*\n───────────────────────\n\n" + foundLines.join("\n\n"));
    }

    if (subCommand === "ral" || subCommand === "warna") {
      var targetRal = parts.slice(1).join(" ").trim();
      if (!targetRal) return sendMessage(chatId, "⚠️ Format: `/remaining ral KODE_WARNA`");

      var masterRal = getMasterData();
      getDoneData(masterRal);
      var ralLines = [];
      var tItem = 0, tLuas = 0;

      for (var r in masterRal.list) {
        var itR = masterRal.list[r];
        var sR = itR.jp - itR.done;
        if (sR > 0 && itR.ral.toLowerCase().indexOf(targetRal.toLowerCase()) !== -1) {
          var lu = itR.unit_luas * sR;
          tItem += sR;
          tLuas += lu;
          ralLines.push("• `[" + itR.project + "]` `" + itR.kode + "` : *" + sR + " item* (`" + lu.toFixed(1) + " m²`)");
        }
      }

      if (ralLines.length === 0) return sendMessage(chatId, "🎉 Tidak ada sisa item untuk warna `" + targetRal + "`.");
      return sendMessage(chatId, "🎨 *SISA COATING (RAL: `" + targetRal + "`)*\n" +
                                 "Total: *" + tItem + " Item* | `" + tLuas.toFixed(1) + " m²`\n" +
                                 "───────────────────────\n" + ralLines.slice(0, 30).join("\n"));
    }

    executeRemainingDetail(chatId, rawArgs);

  } catch (err) {
    sendMessage(chatId, "⚠️ *Error Remaining:* " + err.message);
  }
}

function executeRemainingDetail(chatId, projectName) {
  var ss = getSpreadsheet();
  var sheet = getSpecificMasterSheet(ss, projectName);
  if (!sheet) return sendMessage(chatId, "❌ Project `" + projectName + "` tidak ditemukan.");
  
  var pName = sheet.getName();
  sendMessage(chatId, "⏳ *Menghitung sisa lokal untuk `" + pName + "`...*");
  
  var master = getMasterData(pName);
  var done = getDoneData(master, pName);
  
  var lines = [];
  var totalSisaItem = 0, totalSisaKg = 0;
  
  for (var key in master.list) {
    var item = master.list[key];
    var sisa = item.jp - item.done;
    if (sisa > 0) {
      totalSisaItem += sisa;
      totalSisaKg += (item.unit_berat * sisa);
      lines.push("• `" + item.kode + "` : *" + sisa + "* (🎨 " + item.ral + ")");
    }
  }
  
  if (lines.length === 0) return sendMessage(chatId, "🎉 *Project `" + pName + "` sudah 100% Close!*");
  
  var msg = "📋 *SISA PRODUKSI: " + pName + "*\n" +
            "───────────────────────\n" +
            lines.slice(0, 20).join("\n") + 
            (lines.length > 20 ? "\n_...dan " + (lines.length - 20) + " item lainnya._" : "") +
            "\n\n📊 *Total Sisa:* *" + totalSisaItem + " item* | `" + totalSisaKg.toFixed(1) + " Kg`";
            
  sendMessage(chatId, msg);
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
  
  if (argsLower.indexOf("sheet fix name") !== -1 || argsLower.indexOf("fix sheet name") !== -1) {
    handleSudoFixSheetNames(chatId);
  } else if (argsLower.startsWith("inspect")) {
    execSudoInspect(chatId, remainingArgs);
  } else if (argsLower.startsWith("set harga")) {
    execSudoSetHarga(chatId, remainingArgs);
  } else if (argsLower.startsWith("set deadline")) {
    execSudoSetDeadline(chatId, remainingArgs);
  } else if (argsLower.startsWith("project closed") || argsLower.endsWith("closed") || argsLower.endsWith("close") || argsLower.startsWith("close project")) {
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
  } else {
    sendMessage(chatId, "⚠️ *Perintah Sudo Tidak Dikenali.*\nKetik `/help` untuk melihat panduan lengkap.");
  }
}

function execSudoInspect(chatId, args) {
  var targetProject = args.substring(7).trim();
  if (!targetProject) return sendMessage(chatId, "⚠️ Gunakan: `/sudo 'PASS' inspect NAMA_PROJECT`");

  var ss = getSpreadsheet();
  var sheet = getSpecificMasterSheet(ss, targetProject);
  if (!sheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan.");

  var pName = sheet.getName();
  var data = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), 15), Math.min(sheet.getLastColumn(), 15)).getValues();

  var inspectLines = ["🔍 *INSPEKSI STRUKTUR SHEET:* `" + pName + "`\n───────────────────────"];
  for (var r = 0; r < data.length; r++) {
    var nonEmp = [];
    for (var c = 0; c < data[r].length; c++) {
      if (data[r][c] !== "") {
        nonEmp.push("Kolom " + String.fromCharCode(65 + c) + ": `" + data[r][c] + "`");
      }
    }
    if (nonEmp.length > 0) {
      inspectLines.push("*Baris " + (r + 1) + ":*\n  " + nonEmp.join("\n  "));
    }
  }

  sendMessage(chatId, inspectLines.join("\n\n"));
}

function execSudoSetHarga(chatId, args) {
  var cleanArgs = args.substring(9).trim();
  var parts = cleanArgs.split(" ");
  if (parts.length < 3) {
    return sendMessage(chatId, "⚠️ *Format Salah:*\n`/sudo 'pass' set harga <PROJECT> <KG/M2> <NOMINAL>`");
  }
  
  var targetRate = parseFloat(parts[parts.length - 1]);
  var targetType = parts[parts.length - 2].toUpperCase();
  var targetProject = parts.slice(0, parts.length - 2).join(" ").trim();
  
  if (isNaN(targetRate) || targetRate <= 0) return sendMessage(chatId, "❌ Nominal tarif harus angka positif.");
  if (targetType !== "KG" && targetType !== "M2") return sendMessage(chatId, "❌ Tipe tarif harus `KG` atau `M2`.");
  
  var ss = getSpreadsheet();
  var specificSheet = getSpecificMasterSheet(ss, targetProject);
  if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan.");
  
  var actualProjectName = specificSheet.getName();
  setProjectRate(actualProjectName, targetType, targetRate);
  
  sendMessage(chatId, "💰 *TARIF PROJECT BERHASIL DIATUR!*\n📁 Project: `" + actualProjectName + "`\n⚖️ Acuan: `" + targetType + "`\n💵 Tarif: *" + formatRupiah(targetRate) + " / " + (targetType === "KG" ? "Kg" : "m²") + "*");
}

function execSudoSetDeadline(chatId, args) {
  var cleanArgs = args.substring(12).trim();
  var parts = cleanArgs.split(" ");
  if (parts.length < 2) {
    return sendMessage(chatId, "⚠️ *Format Salah:*\n`/sudo 'pass' set deadline <PROJECT> <TANGGAL_DD/MM/YYYY>`");
  }
  
  var targetDate = parts[parts.length - 1].trim();
  var targetProject = parts.slice(0, parts.length - 1).join(" ").trim();
  
  var ss = getSpreadsheet();
  var specificSheet = getSpecificMasterSheet(ss, targetProject);
  if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan.");
  
  var actualProjectName = specificSheet.getName();
  setProjectDeadline(actualProjectName, targetDate);
  
  sendMessage(chatId, "⏳ *DEADLINE INVOICE DIATUR!*\n📁 Project: `" + actualProjectName + "`\n📅 Batas Pengajuan: *" + targetDate + "*");
}

function execSudoClose(chatId, args) {
  var targetProject = "";
  if (args.toLowerCase().startsWith("close project")) targetProject = args.substring(13).trim();
  else if (args.toLowerCase().startsWith("project closed")) targetProject = args.substring(14).trim();
  else if (args.toLowerCase().endsWith("closed")) targetProject = args.substring(0, args.length - 6).trim();
  else if (args.toLowerCase().endsWith("close")) targetProject = args.substring(0, args.length - 5).trim();
  
  if (!targetProject) return sendMessage(chatId, "⚠️ Sebutkan nama project: `/sudo 'pass' close project NAMA_PROJECT`");
  
  var ss = getSpreadsheet();
  var specificSheet = getSpecificMasterSheet(ss, targetProject);
  if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan.");
  
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
  
  sendMessage(chatId, "⚡️ *SUDO: PROJECT CLOSED*\n📁 Project: `" + actualProjectName + "`\n✅ Dituntaskan: " + count + " kode (" + totalClosed + " item).\nStatus kini 100% CLOSE.");
}

function execSudoResetProject(chatId, args) {
  var targetProject = args.substring(13).trim();
  if (!targetProject) return sendMessage(chatId, "⚠️ Sebutkan nama project: `/sudo 'pass' reset project NAMA_PROJECT`");
  
  var ss = getSpreadsheet();
  var specificSheet = getSpecificMasterSheet(ss, targetProject);
  if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan.");
  
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
  sendMessage(chatId, "🔄 *SUDO: PROJECT RESET BERHASIL*\n📁 Project: `" + actualProjectName + "`\n🗑 Dihapus: " + deletedCount + " baris input.");
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
  if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan.");
  
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
  
  sendMessage(chatId, "⚡️ *SUDO: SISA BERHASIL DIATUR*\n📁 Project: `" + actualProjectName + "`\n▪️ Kode: `" + targetKode + "`\n📦 Sisa Baru: *" + targetSisa + "*");
}

function execSudoCreateProject(chatId, args) {
  var newProjectName = args.substring(14).trim().toUpperCase();
  if (!newProjectName) return sendMessage(chatId, "⚠️ Sebutkan nama project: `/sudo 'pass' create project NAMA_PROJECT`");
  if (isSheetIgnored(newProjectName)) return sendMessage(chatId, "❌ Nama project tidak boleh diawali `LK` atau `LK_`.");
  
  var ss = getSpreadsheet();
  if (ss.getSheetByName(newProjectName)) return sendMessage(chatId, "❌ Sheet `" + newProjectName + "` sudah ada.");
  
  var newSheet = ss.insertSheet(newProjectName);
  newSheet.getRange(8, 1, 1, 26).setValues([[
    "NO", "ITEM", "KODE PRODUK", "DESKRIPSI", "DIMENSI", "PROFIL", "MATERIAL", "TEBAL", 
    "JP", "BERAT", "LUAS", "RAL", "KET1", "KET2", "KET3", "KET4", "KET5", "KET6", "KET7", 
    "KET8", "KET9", "KET10", "KET11", "KET12", "ITEM DONE", "STATUS"
  ]]);
  
  newSheet.getRange("A8:Z8").setBackground("#1f4e78").setFontColor("#ffffff").setFontWeight("bold");
  sendMessage(chatId, "✅ *Sheet Project Baru Dibuat!*\n📁 Nama: `" + newProjectName + "`");
}

function execSudoArchiveProject(chatId, args) {
  var targetProject = args.substring(15).trim();
  if (!targetProject) return sendMessage(chatId, "⚠️ Sebutkan nama project: `/sudo 'pass' archive project NAMA_PROJECT`");
  
  var ss = getSpreadsheet();
  var sheet = getSpecificMasterSheet(ss, targetProject);
  if (!sheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan.");
  
  var oldName = sheet.getName();
  var archivedName = "LK_ARCHIVE_" + oldName;
  sheet.setName(archivedName);
  
  sendMessage(chatId, "📦 *PROJECT DIARSIPKAN*\nSheet `" + oldName + "` diubah nama menjadi `" + archivedName + "`.");
}

function execSudoLock(chatId, args, lockState) {
  var prefix = lockState ? "lock project" : "unlock project";
  var targetProject = args.substring(prefix.length).trim();
  if (!targetProject) return sendMessage(chatId, "⚠️ Format: `/sudo 'pass' " + prefix + " NAMA_PROJECT`");
  
  var ss = getSpreadsheet();
  var sheet = getSpecificMasterSheet(ss, targetProject);
  if (!sheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan.");
  
  var actualProjectName = sheet.getName();
  setProjectLock(actualProjectName, lockState);
  
  sendMessage(chatId, (lockState ? "🔒 *PROJECT DIKUNCI:* `" : "🔓 *PROJECT DIBUKA:* `") + actualProjectName + "`");
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
  
  sendMessage(chatId, countOver === 0 ? "✅ *Audit Bersih:* Tidak ditemukan produk yang over produksi." : msg);
}

function execSudoReportDaily(chatId, args) {
  var targetDate = args.substring(12).trim() || Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
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
      
      if (isSheetIgnored(pName)) continue;
      
      var b = master.list[keyMaster] ? (master.list[keyMaster].unit_berat * qty) : 0;
      var l = master.list[keyMaster] ? (master.list[keyMaster].unit_luas * qty) : 0;
      
      var groupKey = prod + " (QC: " + qc + ")";
      if (!summaryProd[groupKey]) summaryProd[groupKey] = { item: 0, berat: 0, luas: 0 };
      
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
  sendMessage(chatId, "🗑 *SUDO: BERSIHKAN INPUT BERHASIL*\nTanggal: `" + targetDate + "`\nTotal Dihapus: " + deleted + " baris input.");
}

function execSudoChangePass(chatId, args, currentUsedPass) {
  var parts = args.substring(10).trim().split(" ");
  if (parts.length < 2) return sendMessage(chatId, "⚠️ Format: `/sudo 'pass_lama' changepass PASS_LAMA PASS_BARU`");
  
  var oldPassInput = parts[0].trim();
  var newPassInput = parts[1].trim();
  
  if (oldPassInput !== getSudoPassword()) return sendMessage(chatId, "❌ Password lama tidak cocok.");
  if (newPassInput.length < 4) return sendMessage(chatId, "❌ Password baru minimal 4 karakter.");
  
  setSudoPassword(newPassInput);
  sendMessage(chatId, "🔑 *KATA SANDI SUDO BERHASIL DIUBAH!*");
}

function handleSudoFixSheetNames(chatId) {
  var ss = getSpreadsheet();
  var sheets = ss.getSheets();
  var renamedList = [];
  var unchangedCount = 0;

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var oldName = sheet.getName().trim();

    if (isSheetIgnored(oldName)) continue;

    if (/^LIST[\s\-_]*/i.test(oldName)) {
      var cleanName = oldName.replace(/^LIST[\s\-_]*/i, "")
                             .replace(/^[0-9]+[a-z]?[\.\-_]\s*/i, "")
                             .replace(/[_]+/g, " ")
                             .replace(/\s+/g, " ")
                             .trim();

      var newName = toTitleCase(cleanName);

      if (newName && newName !== oldName) {
        var finalName = newName;
        var counter = 1;
        while (ss.getSheetByName(finalName) && finalName !== oldName) {
          finalName = newName + " (" + counter + ")";
          counter++;
        }

        sheet.setName(finalName);
        renamedList.push("• `" + oldName + "` ➔ *" + finalName + "*");
      } else {
        unchangedCount++;
      }
    } else {
      unchangedCount++;
    }
  }

  if (renamedList.length === 0) return sendMessage(chatId, "ℹ️ *Tidak ditemukan sheet yang berawalan kata 'LIST'.*");

  var msg = "🛠 *BERHASIL MEMPERBAIKI NAMA SHEET MASTER:*\n" +
            "───────────────────────\n\n" +
            renamedList.join("\n") +
            "\n\n───────────────────────\n" +
            "📊 Total Sheet Diubah: *" + renamedList.length + " sheet*";

  sendMessage(chatId, msg);
}

// ================= FITUR UTILITAS TAMBAHAN =================
function handleListProjects(chatId) {
  var ss = getSpreadsheet();
  var sheets = getProjectSheets(ss);
  var list = sheets.map(function(s, idx) {
    var isLocked = isProjectLocked(s.getName()) ? " 🔒 *(LOCKED)*" : "";
    return (idx + 1) + ". `" + s.getName() + "`" + isLocked;
  }).join("\n");
  
  sendMessage(chatId, "📁 *DAFTAR PROJECT AKTIF :*\n\n" + list + "\n\n_Gunakan nama project di atas saat input atau cek update._");
}

function handleCheck(chatId, text) {
  handleSearch(chatId, text);
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
    if (!specificSheet) return sendMessage(chatId, "❌ Project `" + targetProject + "` tidak ditemukan atau diabaikan.");
    sheetIdParam = "&gid=" + specificSheet.getSheetId();
    docTitle = "Export_" + specificSheet.getName();
  }
  
  var url = "https://docs.google.com/spreadsheets/d/" + ssId + "/export?" +
            "exportFormat=pdf&format=pdf&size=A4&portrait=false&fitw=true&gridlines=true&printtitle=false" + sheetIdParam;
            
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
    
    if (isSheetIgnored(pName)) continue;
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

// ================= SENDMESSAGE DENGAN FALLBACK AMAN =================
function sendMessage(chatId, text) {
  var url = telegramUrl + "/sendMessage";
  var payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };
  
  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  
  var resObj = JSON.parse(res.getContentText());
  if (!resObj.ok) {
    delete payload.parse_mode;
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  }
}

function sendTelegramDocument(chatId, blob, caption) {
  var url = telegramUrl + "/sendDocument";
  var payload = {
    chat_id: chatId,
    document: blob,
    caption: caption,
    parse_mode: "Markdown"
  };
  
  UrlFetchApp.fetch(url, {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  });
}

// ================= UPDATE STATUS KETERANGAN & ITEM INFO =================
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
    if (isSheetIgnored(sheetLP.getName())) return;
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

function triggerAuthorization() {
  DriveApp.getFiles();
  Logger.log("Izin Akun Google & Drive diverifikasi.");
}

// ================= MENU BANTUAN (/HELP & /help full) =================
function handleHelp(chatId) {
  var helpText = 
    "🤖 *PANDUAN BOT PRODUKSI*\n" +
    "───────────────────────\n\n" +
    "🛑 *Kontrol*\n" +
    "• `/stop` : Hentikan proses yang macet/antrean tertahan.\n\n" +
    "📂 *Drive*\n" +
    "• `/drive` : Buka file manager Google Drive (bisa hapus file/folder).\n\n" +
    "📊 *Project & Progress*\n" +
    "• `/status [PROJECT]` : Rekap global atau status rinci project + PDF.\n" +
    "• `/remaining` : Sisa produksi interaktif (Anti-Timeout).\n" +
    "• `/projects` : Daftar project aktif.\n\n" +
    "📝 *Input & OCR*\n" +
    "• Upload foto dengan caption `/ocr` : Universal OCR Master Matching.\n" +
    "• Upload Excel : Otomatis jadi Master Sheet.\n\n";

  sendMessage(chatId, helpText);
}

function handleHelpFull(chatId) {
  var helpText = 
    "🤖 *PANDUAN LENGKAP BOT PRODUKSI (FULL EXHAUSTIVE)*\n" +
    "──────────────────────────────────────\n\n" +
    "🛑 *0. Emergency Control*\n" +
    "• `/stop` / `/abort` / `/kill` / `/cancel` : Emergency kill switch untuk melepaskan seluruh Script Lock & antrean yang macet.\n\n" +

    "📂 *1. Google Drive Explorer & Penghapusan File*\n" +
    "• `/drive` atau `/files` : Membuka file manager interaktif folder utama `LIST PROJECT`.\n" +
    "• Setiap file/folder dilengkapi tombol pintasan *Buka* dan *🗑 Hapus* (dipindahkan aman ke Google Drive Trash).\n\n" +

    "📊 *2. Status, Rekap & Dokumen Master*\n" +
    "• `/status` : Menampilkan ringkasan persentase progres seluruh proyek aktif secara global.\n" +
    "• `/status [NAMA_PROJECT]` : Menampilkan status eksekutif rinci (tonase, luas, nilai SPK, hak tagih, deadline) sekaligus menghasilkan file unduhan PDF master sheet.\n" +
    "• `/projects` : Menampilkan daftar lengkap seluruh sheet master proyek aktif.\n" +
    "• `/spk` atau `/spk [NAMA_PROJECT]` : Memeriksa rincian target volume kontrak, tarif borongan, dan batas waktu penagihan.\n\n" +

    "⏳ *3. Sisa Produksi (Remaining - Anti Timeout)*\n" +
    "• `/remaining` : Memunculkan menu pilihan tombol interaktif per proyek agar kalkulasi data besar tidak *Time Out*.\n" +
    "• `/remaining [NAMA_PROJECT]` : Menampilkan rincian sisa item & tonase proyek tertentu secara instan.\n" +
    "• `/remaining kode [KODE]` : Mencari sisa kuota marking tertentu.\n" +
    "• `/remaining ral [WARNA]` : Memeriksa sisa kuota berdasarkan kode warna cat (RAL).\n\n" +

    "🔍 *4. Pencarian Produk & Spesifikasi*\n" +
    "• `/search [KODE_MARKING]` atau `/check [KODE_MARKING]` : Mencari spesifikasi teknis, berat satuan, luas, dan status pengerjaan suatu kode produk di seluruh database.\n\n" +

    "📥 *5. Input Produksi & OCR Cerdas*\n" +
    "• `/input [PROJECT] [TIM] [QC]` diikuti baris `KODE,JUMLAH` : Input manual hasil produksi harian.\n" +
    "• `/parse [PROJECT]` + teks bebas : AI mengekstrak catatan WhatsApp menjadi format input.\n" +
    "• Upload Excel (.xlsx/.xls) : Otomatis membuat/memperbarui sheet master proyek.\n" +
    "• Upload Foto + caption `/ocr` : Universal OCR Master Matching (Gemini Multi-Model Rolling dengan fallback otomatis ke Google Drive Native OCR).\n\n" +

    "🖥 *6. Sistem, Backup & Pemeliharaan*\n" +
    "• `/sys` : Dashboard kesehatan sistem (kuota GAS, ukuran database, storage Drive, serta tombol pembersihan cache & refresh index).\n" +
    "• `/export [NAMA_PROJECT]` : Mengonversi sheet master langsung ke dokumen PDF.\n" +
    "• `/backup` : Membuat salinan cadangan (*backup copy*) spreadsheet ke Google Drive.\n" +
    "• `/delete [KODE_PRODUK]` : Menghapus baris catatan input terakhir dari produk tersebut.\n\n" +

    "🔐 *7. Perintah Admin (Sudo)*\n" +
    "• `/sudo 'PASS' inspect [PROJECT]` : Debug struktur baris & kolom sheet.\n" +
    "• `/sudo 'PASS' close project [PROJECT]` : Tuntaskan sisa proyek menjadi 100% Close.\n" +
    "• `/sudo 'PASS' reset project [PROJECT]` : Hapus riwayat input salah pada suatu proyek.\n" +
    "• `/sudo 'PASS' lock/unlock project [PROJECT]` : Mengunci/membuka akses input supervisor.\n" +
    "• `/sudo 'PASS' changepass [LAMA] [BARU]` : Mengubah sandi admin.";

  sendMessage(chatId, helpText);
}
