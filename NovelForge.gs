/**
 * SMART NOVEL FORGE v5.2 (novel agent)
 * Public Web App + Telegram Admin + Google Apps Script + Multi-AI + Drive + Sheets
 *
 * v5.2 changelog (2026-10-10) — TELEGRAM NOVEL AGENT:
 *  - Setiap teks bebas di Telegram kini lewat AI intent classifier
 *    (classifyTelegramIntent_) yang memetakan ke 35+ intent, lalu perintahnya
 *    disintesis jadi command string dan di-dispatch ke handleCommand_ yang sudah
 *    ada (tidak ada logika ganda).
 *  - Contoh: "lanjut tulis chapter berikutnya" -> /write next;
 *    "tulis sampai tamat" -> /autowrite {canon+1}-{target};
 *    "review chapter 1-10" -> /review 1-10.
 *  - Intent conversational: "ask" (tanya isi novel, dijawab dari Bible/Memory/
 *    canon — tidak mengarang) dan "chat" (ngobrol bebas soal novel/menulis).
 *  - Form yang aktif tetap prioritas (form_input), tapi perintah baru yang jelas
 *    otomatis membatalkan form lama.
 *  - Perintah berisiko (ban/unban) minta konfirmasi tombol inline dulu
 *    (callback AGENT_CONFIRM, whitelist ketat).
 *  - Perintah /... tetap bypass AI (nol biaya). Bisa dimatikan via
 *    TELEGRAM_AGENT_ENABLED=false (fallback ke handler lama).
 *
 * v5.1 changelog (2026-10-10) — bugfix hasil code review:
 *  CRITICAL:
 *  - Gemini endpoint /v1/interactions -> configurable GEMINI_API_VERSION (default v1beta,
 *    sesuai dokumentasi Interactions API). Provider favorit #1 sebelumnya mati diam-diam.
 *  - getNextRunnableJob_: orphaned web-job directory entry tidak lagi membunuh seluruh
 *    worker (setiap trigger run mati total sebelumnya).
 *  - webRewriteChapter: assertNoRunningPublicJob_ tidak lagi bisa di-bypass via sourceJobId.
 *  HIGH:
 *  - max_tokens/maxOutputTokens di semua provider (chapter JSON kepotong -> rewrite 2x biaya).
 *  - Context-length 400 tidak lagi diklasifikasi OTHER (fail fast, bukan bakar semua provider).
 *  - Konteks chapter dipangkas: summary di-compact, 120->budget-based (ECONOMY 40/BALANCED 80/
 *    QUALITY 120), future summaries 120->10. AI_BUDGET_MODE kini benar-benar berpengaruh.
 *  - Word count eksplisit di prompt + validasi kata nyata (bukan 1500 chars).
 *  - JSON mode beneran (response_format) untuk provider OpenAI-compatible.
 *  - 429 kini failover antar-provider (bukan coba model lain di key yang sama).
 *  - 10 aksi approve/reject Telegram kini ownership-checked (getTelegramOwnedJob_).
 *  - Atomic claim WAITING_APPROVAL (double-click/tap tidak bikin 2 follow-up job).
 *  - ensureWebUserDb_ di-lock (cegah 2 DB kembar saat provisioning bersamaan).
 *  - Notifikasi Telegram tidak lagi bisa menggagalkan job sehat.
 *  MEDIUM/LOW:
 *  - Watchdog: RUNNING stale >45 mnt otomatis di-requeue; _LOGS di-prune 90 hari;
 *    dedup Telegram 600s->3600s; webLogoutAll; Settings masuk bottom nav mobile;
 *    session basi kembali ke login; LS_AUTH -> SNF_V5_WEB_SESSION; hapus setAiMode mati.
 *
 * NEW OPTIONAL SCRIPT PROPERTIES (v5.1):
 * GEMINI_API_VERSION     = v1beta (default; ganti ke v1 jika endpoint lamamu yang jalan)
 * GEMINI_MAX_OUTPUT_TOKENS = 0 (default: jangan kirim generationConfig; isi mis. 8192 jika endpoint mendukung)
 * GEMINI_JSON_MODE_ENABLED = false (default; true jika endpoint mendukung responseMimeType)
 * AI_MAX_OUTPUT_TOKENS   = 8192
 * AI_CONTEXT_SUMMARIES_ECONOMY   = 40
 * AI_CONTEXT_SUMMARIES_BALANCED  = 80
 * AI_CONTEXT_SUMMARIES_QUALITY   = 120
 *
 * Central DB default:
 * https://docs.google.com/spreadsheets/d/1mv9g9vKURkkq7I0sstIBbg8bofaDAZwIHff5AygSJYM/edit
 *
 * REQUIRED SCRIPT PROPERTIES:
 * TELEGRAM_BOT_TOKEN   = 123456:ABC...
 * WEB_APP_URL          = https://script.google.com/macros/s/DEPLOYMENT_ID/exec
 * WEBHOOK_SECRET       = random-long-string
 * ADMIN_USER_IDS       = 123456789   (comma separated if more than one)
 * At least ONE AI key:
 * GEMINI_API_KEY       = AIza...
 * OPENROUTER_API_KEY   = sk-or-v1-...
 * GROQ_API_KEY         = gsk_...
 * AGNES_API_KEY        = your-agnes-key
 *
 * MULTI-AI PRIORITY (default):
 * Gemini -> OpenRouter openrouter/free -> Groq -> Agnes
 *
 * OPTIONAL:
 * CENTRAL_DB_ID        = Admin/Telegram database (NovelForge DB)
 * USER_REGISTRY_DB_ID  = optional; Web account registry DB (auto-creates User NovelForge DB)
 * AI_PROVIDER_ORDER    = gemini,openrouter,groq,agnes
 * AI_ROUTER_MODE       = SMART_ROLLING | PRIORITY
 * AI_COOLDOWN_429_SECONDS = 1800
 * AI_COOLDOWN_5XX_SECONDS = 600
 * AI_COOLDOWN_AUTH_SECONDS = 3600
 * AI_COOLDOWN_TIMEOUT_SECONDS = 300
 * AI_COOLDOWN_OTHER_SECONDS = 120
 * GEMINI_MODEL         = gemini-3.5-flash-lite
 * GEMINI_FALLBACK_MODELS = gemini-3.5-flash-lite,gemini-3.1-flash-lite
 * OPENROUTER_MODEL     = openrouter/free
 * OPENROUTER_HTTP_REFERER = optional Web App/site URL
 * OPENROUTER_APP_NAME  = Smart Novel Forge
 * GROQ_MODEL           = openai/gpt-oss-120b
 * GROQ_FALLBACK_MODELS = openai/gpt-oss-20b,llama-3.3-70b-versatile,llama-3.1-8b-instant
 * AGNES_MODEL          = agnes-3.0-flash
 * AGNES_FALLBACK_MODELS = agnes-2.5-pro,agnes-2.0-flash
 * IMAGE_MODEL          = openai/gpt-image-2
 * IMAGE_ASPECT_RATIO   = 2:3
 * AI_DAILY_CALL_LIMIT  = 0   (0 = unlimited hard limit)
 * AI_BUDGET_MODE       = ECONOMY | BALANCED | QUALITY
 * AUTO_PRODUCTION_BATCH_SIZE = 5
 * AUTO_PRODUCTION_MAX_REWRITE = 2
 * AUTO_PRODUCTION_REQUIRE_ADMIN_APPROVAL = false
 * MOBILE_ACCESS_KEY    = optional private key for Android/WebView admin mode
 * MOBILE_SESSION_HOURS = 168
 * ANALYTICS_CHAPTERS_PER_STEP = 5
 * AUTO_CANON_BLOCK_ON_WARN = true
 * REROADMAP_CHUNK_SIZE = 10
 * REROADMAP_MAX_DIGEST_CHAPTERS = 260
 * ROOT_FOLDER_ID       = existing Drive folder id; if empty, creates/fetches NOVEL
 * ROADMAP_CHUNK_SIZE   = 20
 * DEFAULT_BATCH_SIZE   = 5
 * DEFAULT_WORDS        = 1800
 * REVIEW_CHUNK_SIZE    = 10   (AI review chunk; recommended 5-10)
 * REVIEW_MAX_RANGE     = 120  (maximum chapters per /review command)
 * AUTO_RETRY_ENABLED   = true  (default ON)
 * AUTO_RETRY_MAX       = 4     (max retry on the same chapter/stage)
 * AUTO_RETRY_MIN_WRITE_RANGE = 5
 * AUTO_RETRY_BASE_DELAY_SECONDS = 45
 * PUBLIC_MAX_NOVELS_DAY = 2
 * PUBLIC_MAX_AI_JOBS_DAY = 20
 * PUBLIC_MAX_ACTIVE_NOVELS = 3
 * PUBLIC_MAX_TARGET_CHAPTERS = 500
 * WEB_SESSION_DAYS      = 30
 * WEB_PASSWORD_MIN_LENGTH = 8
 * WEB_PASSWORD_ROUNDS    = 800
 * WEB_AUTH_PEPPER        = optional; auto-generated on setup
 *
 * FIRST RUN:
 * 1. Fill Script Properties.
 * 2. Deploy as Web App: Execute as Me, access Anyone.
 * 3. Put /exec URL into WEB_APP_URL.
 * 4. Run setupSmartNovelForge() once from editor and grant permissions.
 * 5. Open Telegram and send /start then /newnovel.
 */

const SNF = Object.freeze({
  VERSION: '5.2-novel-agent',
  DEFAULT_DB_ID: '1mv9g9vKURkkq7I0sstIBbg8bofaDAZwIHff5AygSJYM',
  DEFAULT_MODEL: 'gemini-3.5-flash-lite',
  ROOT_FOLDER_NAME: 'NOVEL',
  SHEETS: {
    INDEX: '_INDEX',
    JOBS: '_JOBS',
    SESSIONS: '_SESSIONS',
    LOGS: '_LOGS',
    PUBLIC_USERS: '_PUBLIC_USERS', // legacy only; no longer used for new Web accounts
    WEB_USERS: '_WEB_USERS',
    WEB_SESSIONS: '_WEB_SESSIONS',
    WEB_NOVELS: '_WEB_NOVELS',
    WEB_JOBS: '_WEB_JOBS',
    SETTINGS: '_SETTINGS'
  },
  INDEX_HEADERS: [
    'NOVEL_ID','TITLE','SHEET_NAME','FOLDER_ID','STATUS','CURRENT_CHAPTER',
    'LATEST_CANON','LANGUAGE','GENRE','TARGET_CHAPTERS','CREATED_AT','UPDATED_AT','ACTIVE_JOB_ID',
    'OWNER_ID','OWNER_TYPE','SOURCE','DB_ID'
  ],
  JOB_HEADERS: [
    'JOB_ID','NOVEL_ID','CHAT_ID','USER_ID','TYPE','STAGE','PROGRESS','STATUS',
    'MESSAGE_ID','DATA_JSON','LAST_ERROR','CREATED_AT','UPDATED_AT',
    'OWNER_ID','OWNER_TYPE','CHANNEL'
  ],
  SESSION_HEADERS: ['USER_ID','CHAT_ID','STATE','ACTIVE_NOVEL_ID','DATA_JSON','UPDATED_AT'],
  LOG_HEADERS: ['TIME','LEVEL','SOURCE','MESSAGE','DATA_JSON'],
  PUBLIC_USER_HEADERS: ['USER_ID','TOKEN_HASH','RECOVERY_HASH','STATUS','CREATED_AT','LAST_SEEN','DAY_KEY','NOVELS_TODAY','AI_JOBS_TODAY'],
  WEB_USER_HEADERS: [
    'USER_ID','USERNAME','EMAIL','PASSWORD_HASH','PASSWORD_SALT','STATUS',
    'ROOT_FOLDER_ID','DB_ID','CREATED_AT','UPDATED_AT','LAST_LOGIN','LAST_SEEN',
    'DAY_KEY','NOVELS_TODAY','AI_JOBS_TODAY'
  ],
  WEB_SESSION_HEADERS: ['SESSION_ID','USER_ID','SESSION_HASH','CREATED_AT','EXPIRES_AT','LAST_SEEN','STATUS'],
  WEB_JOB_DIR_HEADERS: ['JOB_ID','USER_ID','DB_ID','NOVEL_ID','TYPE','STAGE','PROGRESS','STATUS','CREATED_AT','UPDATED_AT'],
  SETTING_HEADERS: ['KEY','VALUE','UPDATED_AT'],
  NOVEL_HEADERS: ['TYPE','KEY','CHAPTER','ARC','TITLE','DATA_JSON','STATUS','VERSION','FILE_ID','UPDATED_AT'],
  FOLDERS: [
    '00_ADMIN_PREVIEW',
    '01_BIBLE',
    '02_ROADMAP',
    '03_CHAPTERS',
    '04_REVISED_CHAPTERS',
    '05_CANON',
    '06_REVIEWS',
    '07_MEMORY',
    '08_CONTINUITY',
    '09_EXPORT',
    '10_BACKUP',
    '11_VISUAL_BIBLE',
    '12_MEDIA',
    '13_SNAPSHOTS',
    '14_LORE',
    '15_ANALYTICS',
    '16_PUBLICATION'
  ]
});

/* ========================================================================== */
/* SETUP / MIGRATION / HEALTH                                                 */
/* ========================================================================== */

function setupSmartNovelForge() {
  validateRequiredProperties_();
  ensureCentralDb_();
  ensureUserRegistryDb_();
  webAuthPepper_();
  ensureRootFolder_();
  ensureTranslateRoot_();
  installWorkerTrigger_();
  setTelegramCommands_();
  setTelegramWebhook();

  Logger.log(JSON.stringify({
    ok:true,
    version:SNF.VERSION,
    adminDbId:getCentralDbId_(),
    userRegistryDbId:getUserRegistryDbId_(),
    rootFolderId:prop_('ROOT_FOLDER_ID'),
    webhook:getTelegramWebhookInfo()
  },null,2));
}


function migrateV4WebDataToMultiDb(){
  ensureCentralDb_();
  ensureUserRegistryDb_();

  const admin=getDb_(),registry=getWebRegistryDb_();
  const stamp=Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'Asia/Jakarta','yyyyMMdd_HHmmss');
  let backupFileId='';
  try{
    const backup=DriveApp.getFileById(admin.getId()).makeCopy('NovelForge DB - pre-v5 MultiDB backup - '+stamp);
    backupFileId=backup.getId();
  }catch(_){}

  const report={backupFileId:backupFileId,users:0,sessions:0,novels:0,jobs:0,legacySheetsRemoved:[]};

  // Copy v4 account/session data into "User NovelForge DB".
  [
    [SNF.SHEETS.WEB_USERS,SNF.WEB_USER_HEADERS,'users'],
    [SNF.SHEETS.WEB_SESSIONS,SNF.WEB_SESSION_HEADERS,'sessions']
  ].forEach(function(spec){
    const src=admin.getSheetByName(spec[0]);
    if(!src||src.getLastRow()<2)return;
    const dst=ensureSheet_(registry,spec[0],spec[1]);
    const vals=src.getRange(2,1,src.getLastRow()-1,spec[1].length).getValues();
    vals.forEach(function(r){
      const key=String(r[0]||'');
      if(!key)return;
      const row=findRowByFirstCol_(dst,key);
      if(row)dst.getRange(row,1,1,r.length).setValues([r]);else dst.appendRow(r);
      report[spec[2]]++;
    });
  });

  // Move Web novel metadata from Admin DB -> username_NovelForge_DB/_INDEX.
  const idx=admin.getSheetByName(SNF.SHEETS.INDEX),idxDelete=[];
  if(idx&&idx.getLastRow()>=2){
    idx.getRange(2,1,idx.getLastRow()-1,SNF.INDEX_HEADERS.length).getValues().forEach(function(r,i){
      const n=rowObject_(SNF.INDEX_HEADERS,r);
      if(String(n.OWNER_TYPE||'')!=='WEB_USER')return;
      const uid=String(n.OWNER_ID||'').toUpperCase();
      if(!uid)return;
      const ss=ensureWebUserDb_(uid);
      n.DB_ID=ss.getId();
      const us=ensureSheet_(ss,SNF.SHEETS.INDEX,SNF.INDEX_HEADERS);
      const ur=findRowByFirstCol_(us,n.NOVEL_ID);
      const vals=SNF.INDEX_HEADERS.map(function(h){return n[h]!==undefined?n[h]:'';});
      if(ur)us.getRange(ur,1,1,vals.length).setValues([vals]);else us.appendRow(vals);
      upsertWebNovelDirectory_(n);
      idxDelete.push(i+2);
      report.novels++;
    });
    idxDelete.sort(function(a,b){return b-a;}).forEach(function(r){idx.deleteRow(r);});
  }

  // Move Web jobs from Admin DB -> username_NovelForge_DB/_JOBS.
  const js=admin.getSheetByName(SNF.SHEETS.JOBS),jobDelete=[];
  if(js&&js.getLastRow()>=2){
    js.getRange(2,1,js.getLastRow()-1,SNF.JOB_HEADERS.length).getValues().forEach(function(r,i){
      const j=rowObject_(SNF.JOB_HEADERS,r);
      if(jobOwnerType_(j)!=='WEB_USER')return;
      const uid=String(j.OWNER_ID||j.USER_ID||'').toUpperCase();
      if(!uid)return;
      const ss=ensureWebUserDb_(uid);
      const us=ensureSheet_(ss,SNF.SHEETS.JOBS,SNF.JOB_HEADERS);
      const ur=findRowByFirstCol_(us,j.JOB_ID);
      if(ur)us.getRange(ur,1,1,r.length).setValues([r]);else us.appendRow(r);
      upsertWebJobDirectory_(j,ss.getId());
      jobDelete.push(i+2);
      report.jobs++;
    });
    jobDelete.sort(function(a,b){return b-a;}).forEach(function(r){js.deleteRow(r);});
  }

  // Keep the legacy Web auth sheets after migration as a recovery source.
  // Remove them manually only after all migrated users have successfully logged in.
  report.legacySheetsRemoved=[];

  Logger.log(JSON.stringify(report,null,2));
  return report;
}




/**
 * Convenience alias so the migration is easy to find in the Apps Script
 * function dropdown. Both functions run the exact same migration.
 */
function migrateV4ToV5(){
  return migrateV4WebDataToMultiDb();
}

/**
 * Another explicit run helper for the Apps Script editor.
 */
function runV5MultiDbMigration(){
  return migrateV4WebDataToMultiDb();
}

function showMultiDbArchitecture(){
  ensureUserRegistryDb_();
  const users=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS),novels=webNovelDirectorySheet_(),jobs=webJobDirectorySheet_();
  const out={version:SNF.VERSION,adminDb:getDb_().getName(),adminDbId:getCentralDbId_(),userRegistryDb:getWebRegistryDb_().getName(),userRegistryDbId:getUserRegistryDbId_(),webUsers:Math.max(0,users.getLastRow()-1),webNovels:Math.max(0,novels.getLastRow()-1),webJobPointers:Math.max(0,jobs.getLastRow()-1)};
  Logger.log(JSON.stringify(out,null,2));return out;
}

function showSmartNovelForgeConfig() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const out = {
    version: SNF.VERSION,
    CENTRAL_DB_ID: getCentralDbId_(),
    AI_PROVIDER_ORDER: aiProviderOrder_().join(' -> '),
    AI_ROUTER_MODE: aiRouterMode_(),
    AI_COOLDOWN_429_SECONDS: aiCooldownSeconds_('429'),
    AI_COOLDOWN_5XX_SECONDS: aiCooldownSeconds_('5XX'),
    AI_COOLDOWN_AUTH_SECONDS: aiCooldownSeconds_('AUTH'),
    AI_COOLDOWN_TIMEOUT_SECONDS: aiCooldownSeconds_('TIMEOUT'),
    AI_COOLDOWN_OTHER_SECONDS: aiCooldownSeconds_('OTHER'),
    GEMINI_MODEL: geminiModel_(),
    GEMINI_FALLBACK_MODELS: geminiModels_().slice(1).join(', ') || '(none)',
    OPENROUTER_MODEL: openRouterModel_(),
    GROQ_MODEL: groqModel_(),
    GROQ_FALLBACK_MODELS: groqModels_().slice(1).join(', ') || '(none)',
    AGNES_MODEL: agnesModel_(),
    AGNES_FALLBACK_MODELS: agnesModels_().slice(1).join(', ') || '(none)',
    IMAGE_MODEL: p.IMAGE_MODEL || 'openai/gpt-image-2',
    AI_BUDGET_MODE: p.AI_BUDGET_MODE || 'ECONOMY',
    AI_DAILY_CALL_LIMIT: p.AI_DAILY_CALL_LIMIT || '0',
    MOBILE_ACCESS_KEY: p.MOBILE_ACCESS_KEY ? '(set)' : '(not set)',
    MOBILE_SESSION_HOURS: p.MOBILE_SESSION_HOURS || '168',
    ROOT_FOLDER_ID: p.ROOT_FOLDER_ID || '(auto)',
    WEB_APP_URL: p.WEB_APP_URL || '(missing)',
    WEBHOOK_SECRET: p.WEBHOOK_SECRET ? '(set)' : '(missing)',
    TELEGRAM_BOT_TOKEN: p.TELEGRAM_BOT_TOKEN ? '(set)' : '(missing)',
    GEMINI_API_KEY: p.GEMINI_API_KEY ? '(set)' : '(missing)',
    OPENROUTER_API_KEY: p.OPENROUTER_API_KEY ? '(set)' : '(missing)',
    GROQ_API_KEY: p.GROQ_API_KEY ? '(set)' : '(missing)',
    AGNES_API_KEY: p.AGNES_API_KEY ? '(set)' : '(missing)',
    ADMIN_USER_IDS: p.ADMIN_USER_IDS || '(missing - bot locked)'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function doGet(e){
  if(e&&e.parameter&&String(e.parameter.api||'')==='health'){
    return ContentService.createTextOutput(JSON.stringify({ok:true,app:'Smart Novel Forge',version:SNF.VERSION})).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Smart Novel Forge')
    .addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
}

function doPost(e) {
  try {
    const expected = prop_('WEBHOOK_SECRET');
    const got = e && e.parameter ? String(e.parameter.tgkey || '') : '';
    if (!expected || got !== expected) {
      return telegramWebhookResponse_('forbidden');
    }

    const body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const update = JSON.parse(body);

    if (isDuplicateUpdate_(update.update_id)) {
      return telegramWebhookResponse_('ok');
    }

    if (update.callback_query) handleCallback_(update.callback_query);
    else if (update.message) handleMessage_(update.message);
  } catch (err) {
    log_('ERROR', 'doPost', String(err && err.stack || err), {});
  }
  return telegramWebhookResponse_('ok');
}

/**
 * Telegram does not support webhook redirects. Apps Script ContentService
 * responds through a 302 redirect to script.googleusercontent.com, so webhook
 * responses MUST use HtmlService to return a direct 2xx response.
 */
function telegramWebhookResponse_(text) {
  return HtmlService.createHtmlOutput(String(text || 'ok'));
}

/* ========================================================================== */
/* TELEGRAM WEBHOOK / COMMANDS                                                */
/* ========================================================================== */

function setTelegramWebhook() {
  validateRequiredProperties_();
  const url = prop_('WEB_APP_URL');
  const secret = prop_('WEBHOOK_SECRET');
  if (!/\/exec(?:\?|$)/.test(url)) throw new Error('WEB_APP_URL harus URL deployment /exec, bukan /dev.');
  return tgApi_('setWebhook', {
    url: url + (url.indexOf('?') >= 0 ? '&' : '?') + 'tgkey=' + encodeURIComponent(secret),
    allowed_updates: ['message','callback_query'],
    drop_pending_updates: false
  });
}

function deleteTelegramWebhook() {
  return tgApi_('deleteWebhook', {drop_pending_updates:false});
}

/**
 * Repair helper: clears queued Telegram updates, recreates the webhook,
 * and prints the final webhook state. Use once after fixing a broken webhook.
 */
function resetTelegramWebhook() {
  const removed = tgApi_('deleteWebhook', {drop_pending_updates:true});
  Utilities.sleep(800);
  const created = setTelegramWebhook();
  Utilities.sleep(800);
  const info = getTelegramWebhookInfo();
  const result = {removed: removed, created: created, info: info};
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function getTelegramWebhookInfo() {
  return tgApi_('getWebhookInfo', {});
}

function setTelegramCommands_() {
  return tgApi_('setMyCommands', {
    commands: [
      {command:'newnovel', description:'Buat novel baru'},
      {command:'novels', description:'Daftar novel'},
      {command:'status', description:'Status novel aktif'},
      {command:'use', description:'Pilih novel: /use NVL_0001'},
      {command:'tools', description:'Menu Chapter Writer / Review / Rewrite'},
      {command:'write', description:'Buat chapter: /write next atau /write 6-10'},
      {command:'review', description:'Review chapter/range: /review 6, /review 1-40, /review all'},
      {command:'rewrite', description:'Rewrite chapter: /rewrite 6 alasan...'},
      {command:'chapter', description:'Lihat chapter: /chapter 6'},
      {command:'translate', description:'Translation Center: /translate 1-50 id'},
      {command:'health', description:'Canon Health Check: /health atau /health 1-100'},
      {command:'style', description:'Style Lock novel aktif'},
      {command:'ai', description:'Status Multi-AI Router'},
      {command:'aiusage', description:'AI Usage & Budget hari ini'},
      {command:'character', description:'Character tracker: /character Shu'},
      {command:'threads', description:'Plot Thread & Foreshadowing tracker'},
      {command:'timeline', description:'Timeline novel aktif'},
      {command:'snapshot', description:'Buat Canon snapshot'},
      {command:'rollback', description:'Rollback ke snapshot'},
      {command:'export', description:'Export TXT/DOCX/EPUB'},
      {command:'autowrite', description:'Full Auto Production: /autowrite 41-100'},
      {command:'visual', description:'Visual Bible'},
      {command:'art', description:'Cover/character/chapter art'},
      {command:'lore', description:'World Encyclopedia: /lore Nereth'},
      {command:'quality', description:'Repetition, hook, pacing, contradiction'},
      {command:'analytics', description:'Novel analytics: /analytics atau refresh'},
      {command:'publishmeta', description:'Metadata publikasi: /publishmeta webnovel'},
      {command:'jobs', description:'Job manager + clear completed'},
      {command:'webnovels', description:'Cek novel pengguna Web'},
      {command:'scan', description:'Scan otomatis NOVEL/ADMIN ke database'},
      {command:'roadmaps', description:'Lihat roadmap novel aktif'},
      {command:'roadmap', description:'Aktifkan roadmap: /roadmap 1'},
      {command:'reroadmap', description:'Adaptive Roadmap & What-if'},
      {command:'retry', description:'Retry job error: /retry JOB_xxx'},
      {command:'retryall', description:'Retry semua job ERROR/FAILED'},
      {command:'stats', description:'Statistik Web App publik'},
      {command:'publicjobs', description:'Job publik aktif'},
      {command:'ban', description:'Blokir akun Web: /ban WUSR_xxx'},
      {command:'unban', description:'Buka blokir akun Web: /unban WUSR_xxx'},
      {command:'cancel', description:'Batalkan input saat ini'},
      {command:'help', description:'Panduan Smart Novel Forge'}
    ]
  });
}

function handleMessage_(m) {
  const chatId = String(m.chat.id);
  const userId = String(m.from && m.from.id || '');
  const text = String(m.text || '').trim();
  if (!userId || !text) return;

  if (!isAdmin_(userId)) {
    sendMessage_(chatId,
      '🔒 <b>Smart Novel Forge</b>\n\nAkun Telegram ini belum terdaftar sebagai admin.\nTambahkan Telegram user ID <code>' +
      escapeHtml_(userId) + '</code> ke Script Property <code>ADMIN_USER_IDS</code>.');
    return;
  }

  const session = getSession_(userId, chatId);

  // Persistent Telegram bottom-menu buttons. They behave exactly like commands.
  const menuText = text.toUpperCase();
  if (menuText === '📚 NOVEL' || menuText === 'NOVEL') {
    handleCommand_('/novels', chatId, userId, session);
    return;
  }
  if (menuText === '✨ CREATE' || menuText === 'CREATE') {
    handleCommand_('/newnovel', chatId, userId, session);
    return;
  }

  if (menuText === '🌐 WEB NOVELS' || menuText === 'WEB NOVELS') {
    handleCommand_('/webnovels',chatId,userId,session);
    return;
  }
  if (menuText === '⚙️ JOBS' || menuText === 'JOBS') {
    handleCommand_('/jobs',chatId,userId,session);
    return;
  }

  if (text.charAt(0) === '/') {
    handleCommand_(text, chatId, userId, session);
    return;
  }

  // v5.2 novel agent: free text → AI intent classification → command dispatch.
  handleAgentMessage_(text, chatId, userId, session);
}

function handleCommand_(text, chatId, userId, session) {
  const parts = text.split(/\s+/);
  const cmd = parts[0].split('@')[0].toLowerCase();
  const arg = parts.slice(1).join(' ').trim();

  if (cmd === '/start' || cmd === '/help') {
    sendHome_(chatId);
    return;
  }

  if (cmd === '/newnovel') {
    setSession_(userId, chatId, 'AWAIT_NOVEL_IDEA', session.activeNovelId || '', {});
    sendMessage_(chatId,
      '✨ <b>SMART NOVEL FORGE</b>\n\n' +
      'Ceritakan novel yang ingin kamu buat dengan bahasa bebas. Tidak perlu seperti mengisi formulir.\n\n' +
      'Kamu bisa memasukkan apa saja yang sudah ada di kepalamu:\n' +
      '• premis / deskripsi\n• genre\n• karakter\n• setting\n• target chapter\n• gaya penulisan\n• ending\n• aturan khusus\n\n' +
      '<i>Contoh:</i>\n' +
      '“Aku mau psychological mystery tentang arkeolog bernama Shu yang menemukan makam 3000 tahun lalu dengan namanya sendiri. English, 120 chapter, slow burn, reveal paradox jangan terlalu cepat.”\n\n' +
      'Kirim saja idemu sekarang 👇',
      keyboard_([
        [{text:'💡 Bantu Cari Ide', callback_data:'IDEA_HELP'}],
        [{text:'🎲 Random Concept', callback_data:'IDEA_RANDOM'}],
        [{text:'❌ Batal', callback_data:'SESSION_CANCEL'}]
      ]));
    return;
  }

  if (cmd === '/cancel') {
    setSession_(userId, chatId, 'IDLE', session.activeNovelId || '', {});
    sendMessage_(chatId, '✅ Input dibatalkan.');
    return;
  }

  if (cmd === '/novels') {
    sendNovelList_(chatId, userId);
    return;
  }

  if (cmd === '/use') {
    if (!arg) {
      sendMessage_(chatId, 'Gunakan: <code>/use NVL_0001</code>');
      return;
    }
    const novel = getNovelIndex_(arg.toUpperCase());
    if (!novel || !isTelegramAdminNovel_(novel)) {
      sendMessage_(chatId, '❌ Novel <code>' + escapeHtml_(arg) + '</code> tidak ditemukan pada workspace Telegram Admin.');
      return;
    }
    setSession_(userId, chatId, 'IDLE', novel.NOVEL_ID, {});
    const view = buildNovelDetailView_(novel.NOVEL_ID);
    sendMessage_(chatId, view.text, view.keyboard);
    return;
  }

  if (cmd === '/status') {
    sendNovelStatus_(chatId, session.activeNovelId);
    return;
  }

  if (cmd === '/tools') {
    sendWritingTools_(chatId, session.activeNovelId);
    return;
  }

  if (cmd === '/write') {
    startManualWriteCommand_(chatId, userId, session, arg);
    return;
  }

  if (cmd === '/review') {
    startManualReviewCommand_(chatId, userId, session, arg);
    return;
  }

  if (cmd === '/rewrite') {
    startManualRewriteCommand_(chatId, userId, session, arg);
    return;
  }

  if (cmd === '/chapter') {
    sendChapterInfo_(chatId, session.activeNovelId, arg);
    return;
  }

  if (cmd === '/translate') {
    handleTranslateCommand_(chatId, userId, session, arg);
    return;
  }

  if (cmd === '/health') {
    handleHealthCommand_(chatId, userId, session, arg);
    return;
  }

  if (cmd === '/style') {
    if (!session.activeNovelId) {
      sendMessage_(chatId, '📚 Pilih novel dulu dengan /novels lalu <code>/use NVL_xxxx</code>.');
      return;
    }
    sendStyleCenter_(chatId, session.activeNovelId);
    return;
  }

  if (cmd === '/ai') {
    const aiArg = String(arg || '').trim().toLowerCase();

    if (['rolling','smart','smart_rolling','smart-rolling'].indexOf(aiArg) >= 0) {
      setAiRouterMode_('SMART_ROLLING');
      resetAiRouterState_(false);
      sendMessage_(chatId,'🔄 AI Router diubah ke <b>SMART_ROLLING</b>.');
    } else if (['priority','fallback'].indexOf(aiArg) >= 0) {
      setAiRouterMode_('PRIORITY');
      resetAiRouterState_(false);
      sendMessage_(chatId,'🎯 AI Router diubah ke <b>PRIORITY</b>.');
    } else if (aiArg === 'reset') {
      resetAiRouterState_(true);
      sendMessage_(chatId,'♻️ AI Router state + cooldown sudah di-reset.');
    }

    sendAiRouterStatus_(chatId);
    return;
  }

  if (cmd === '/aiusage') {
    sendAiUsage_(chatId);
    return;
  }

  if (cmd === '/character') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    sendCharacterTracker_(chatId, session.activeNovelId, arg);
    return;
  }

  if (cmd === '/threads') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    sendThreadTracker_(chatId, session.activeNovelId);
    return;
  }

  if (cmd === '/timeline') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    sendTimelineTracker_(chatId, session.activeNovelId);
    return;
  }

  if (cmd === '/snapshot') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    createCanonSnapshot_(chatId, session.activeNovelId);
    return;
  }

  if (cmd === '/rollback') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    sendRollbackCenter_(chatId, session.activeNovelId);
    return;
  }

  if (cmd === '/export') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    sendExportCenter_(chatId, session.activeNovelId);
    return;
  }

  if (cmd === '/autowrite') {
    startAutoProduction_(chatId,userId,session,arg);
    return;
  }

  if (cmd === '/visual') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    sendVisualBibleCenter_(chatId,session.activeNovelId);
    return;
  }

  if (cmd === '/art') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    handleArtCommand_(chatId,userId,session.activeNovelId,arg);
    return;
  }

  if (cmd === '/lore') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    if (String(arg||'').trim().toLowerCase() === 'refresh') startLoreBuildJob_(chatId,userId,session.activeNovelId);
    else sendLoreSearch_(chatId,session.activeNovelId,arg);
    return;
  }

  if (cmd === '/quality') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    sendQualityReport_(chatId,session.activeNovelId);
    return;
  }

  if (cmd === '/analytics') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    if (String(arg||'').trim().toLowerCase() === 'refresh') startAnalyticsBackfillJob_(chatId,userId,session.activeNovelId);
    else sendNovelAnalytics_(chatId,session.activeNovelId);
    return;
  }

  if (cmd === '/publishmeta') {
    if (!session.activeNovelId) {
      sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels.');
      return;
    }
    startPublicationMetadataJob_(chatId,userId,session.activeNovelId,arg||'generic');
    return;
  }

  if (cmd === '/jobs') {
    if(String(arg||'').trim().toLowerCase()==='clear'){
      const r=clearCompletedTelegramJobs_(userId);
      sendMessage_(chatId,'🧹 Completed jobs dihapus: <b>'+Number(r.deleted||0)+'</b>');
    }
    sendJobs_(chatId,userId);
    return;
  }

  if (cmd === '/webnovels') {
    sendWebNovelsAdmin_(chatId,1);
    return;
  }

  if (cmd === '/scan') {
    try {
      ensureWorkerTrigger_();
      const msgId = sendMessage_(chatId,
        '🔄 <b>NOVEL DRIVE SCAN</b>\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '⏳ Scan dimasukkan ke antrean.\n' +
        'Bot akan memeriksa <code>NOVEL/ADMIN</code> satu folder per langkah agar webhook Telegram tidak timeout.');

      const jobId = createJob_({
        novelId:'', chatId:chatId, userId:userId,
        type:'DRIVE_SCAN', stage:'DISCOVER', progress:1,
        status:'QUEUED', messageId:msgId,
        data:{nextIndex:0, folders:[], results:[]}
      });

      log_('INFO','scan:queued','Drive scan queued',{jobId:jobId,userId:userId});
    } catch (err) {
      sendMessage_(chatId,
        '❌ <b>Scan NOVEL gagal dibuat</b>\n\n' +
        escapeHtml_(String(err && err.message || err)));
    }
    return;
  }

  if (cmd === '/roadmaps') {
    try {
      sendRoadmapCandidates_(chatId, session.activeNovelId);
    } catch (err) {
      sendMessage_(chatId,
        '❌ <b>Gagal membaca roadmap</b>\n\n' +
        escapeHtml_(String(err && err.message || err)));
    }
    return;
  }

  if (cmd === '/roadmap') {
    try {
      if (!session.activeNovelId) {
        sendMessage_(chatId, 'Pilih novel dulu dengan <code>/use NVL_xxxx</code>.');
        return;
      }
      const choice = Number(String(arg || '').trim());
      if (!choice || choice < 1) {
        sendMessage_(chatId,
          'Gunakan <code>/roadmap 1</code>, <code>/roadmap 2</code>, dst.\n' +
          'Lihat pilihannya dengan /roadmaps.');
        return;
      }
      const result = activateRoadmapByNumber_(session.activeNovelId, choice);
      sendMessage_(chatId,
        '✅ <b>ROADMAP ACTIVE</b>\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '📖 <b>' + escapeHtml_(result.title || session.activeNovelId) + '</b>\n' +
        '🗺 <code>' + escapeHtml_(result.sourceFile || '-') + '</code>\n\n' +
        '📚 Chapter plan : <b>' + Number(result.chapterPlansImported || 0) + '</b>\n' +
        '🎯 Target       : <b>' + Number(result.targetChapters || 0) + ' chapter</b>\n\n' +
        '✍️ Next: <code>/write next</code>');
    } catch (err) {
      sendMessage_(chatId,
        '❌ <b>Aktivasi roadmap gagal</b>\n\n' +
        escapeHtml_(String(err && err.message || err)));
    }
    return;
  }


  if (cmd === '/reroadmap') {
    try {
      if (!session.activeNovelId) {
        sendMessage_(chatId,'📚 Pilih novel dulu dengan <code>/novels</code> lalu <code>/use NVL_xxxx</code>.');
        return;
      }
      const raw = String(arg || '').trim();
      if (!raw) {
        sendReRoadmapCenter_(chatId, session.activeNovelId);
        return;
      }

      let m = raw.match(/^whatif\s+(.+)$/i);
      if (m) {
        const premise = String(m[1] || '').trim();
        if (premise.length < 8) throw new Error('Premise What-if terlalu pendek.');
        startReRoadmapJob_(chatId,userId,session.activeNovelId,'WHAT_IF','NEW',premise);
        return;
      }

      m = raw.match(/^view\s+([A-Z]{2}_[0-9]{3}|MASTER)$/i);
      if (m) {
        sendRoadmapVersionDetail_(chatId,session.activeNovelId,String(m[1]).toUpperCase());
        return;
      }

      m = raw.match(/^activate\s+([A-Z]{2}_[0-9]{3}|MASTER)$/i);
      if (m) {
        const result = activateAdaptiveRoadmapVersion_(session.activeNovelId,String(m[1]).toUpperCase(),'TELEGRAM_ADMIN');
        sendMessage_(chatId,
          '✅ <b>ADAPTIVE ROADMAP ACTIVE</b>\n\n' +
          'Version: <code>'+escapeHtml_(result.versionId)+'</code>\n' +
          'Canon tetap: <b>Ch'+Number(result.latestCanon||0)+'</b>\n' +
          'Future plan: Ch'+Number(result.nextChapter||0)+'–'+Number(result.targetChapters||0));
        return;
      }

      const mode = raw.toLowerCase();
      if (['realign','adapt','adaptive'].indexOf(mode) >= 0) {
        startReRoadmapJob_(chatId,userId,session.activeNovelId,'REALIGN','ADAPT','');
        return;
      }
      if (['return','original','realign-original'].indexOf(mode) >= 0) {
        startReRoadmapJob_(chatId,userId,session.activeNovelId,'REALIGN','RETURN','');
        return;
      }
      if (['new','new-direction','fresh'].indexOf(mode) >= 0) {
        startReRoadmapJob_(chatId,userId,session.activeNovelId,'REALIGN','NEW','');
        return;
      }

      sendMessage_(chatId,
        '🛣 <b>REROADMAP</b>\n\n' +
        '<code>/reroadmap realign</code> — adapt naturally\n' +
        '<code>/reroadmap return</code> — kembali perlahan ke tujuan roadmap lama\n' +
        '<code>/reroadmap new</code> — arah baru yang tetap konsisten\n' +
        '<code>/reroadmap whatif PREMISE</code> — alternate roadmap tanpa mengubah Canon\n' +
        '<code>/reroadmap view RR_001</code>\n' +
        '<code>/reroadmap activate RR_001</code>');
    } catch (err) {
      sendMessage_(chatId,'❌ <b>ReRoadmap gagal</b>\n\n'+escapeHtml_(String(err && err.message || err)));
    }
    return;
  }

  if (cmd === '/retry') {
    if (!arg) {
      sendMessage_(chatId,
        'Gunakan: <code>/retry JOB_XXXXXXXXXXXX</code>\n\n' +
        'Lihat daftar job dengan /jobs.');
      return;
    }
    try {
      const owned=getTelegramOwnedJob_(arg.toUpperCase(),userId);
      const result = retryJobById_(owned.JOB_ID, true);
      sendMessage_(chatId,
        '🔄 <b>JOB RETRY</b>\n\n' +
        'Job: <code>' + escapeHtml_(result.jobId) + '</code>\n' +
        'Stage: <b>' + escapeHtml_(result.stage || '-') + '</b>\n' +
        'Progress: <b>' + Number(result.progress || 0) + '%</b>\n' +
        'Retry: <b>#' + Number(result.retryCount || 1) + '</b>\n\n' +
        '✅ Job dikembalikan ke queue dari checkpoint terakhir.');
    } catch (err) {
      sendMessage_(chatId,
        '❌ <b>Retry gagal</b>\n\n' +
        escapeHtml_(String(err && err.message || err)));
    }
    return;
  }

  if (cmd === '/retryall') {
    try {
      const result = retryAllFailedTelegramJobs_(userId,false);
      sendMessage_(chatId,
        '🔄 <b>RETRY ALL FAILED JOBS</b>\n\n' +
        'Queued: <b>' + Number(result.retried || 0) + '</b>\n' +
        'Gagal di-reset: <b>' + Number(result.failed || 0) + '</b>\n\n' +
        (result.retried ? 'Worker akan melanjutkan dari checkpoint masing-masing.' : 'Tidak ada job ERROR/FAILED yang perlu di-retry.'));
      if (result.retried) {
        try { processSmartNovelForgeJobs(); } catch (_) {}
      }
    } catch (err) {
      sendMessage_(chatId,
        '❌ <b>Retry-all gagal</b>\n\n' +
        escapeHtml_(String(err && err.message || err)));
    }
    return;
  }

  if (cmd === '/stats') {
    sendPublicStats_(chatId);
    return;
  }

  if (cmd === '/publicjobs') {
    sendPublicJobs_(chatId);
    return;
  }

  if (cmd === '/ban' || cmd === '/unban') {
    if (!arg) { sendMessage_(chatId, 'Gunakan <code>'+cmd+' WUSR_XXXXXXXXXX</code>'); return; }
    const status = cmd === '/ban' ? 'BANNED' : 'ACTIVE';
    setPublicUserStatus_(arg.toUpperCase(), status);
    sendMessage_(chatId, (status==='BANNED'?'🚫 ':'✅ ') + '<code>'+escapeHtml_(arg.toUpperCase())+'</code> → <b>'+status+'</b>');
    return;
  }

  sendMessage_(chatId, 'Command tidak dikenal. Gunakan /help.');
}

function handleNaturalInput_(text, chatId, userId, session) {
  const state = session.state || 'IDLE';

  if (state === 'AWAIT_NOVEL_IDEA') {
    const msgId = sendMessage_(chatId,
      '🧠 <b>Membaca ide novelmu...</b>\n\n' +
      'Aku sedang mengubah deskripsi bebas itu menjadi blueprint terstruktur tanpa menghilangkan ide aslinya.');

    createJob_({
      novelId:'', chatId:chatId, userId:userId,
      type:'BLUEPRINT_EXTRACT', stage:'EXTRACT', progress:5,
      status:'QUEUED', messageId:msgId,
      data:{idea:text}
    });
    setSession_(userId, chatId, 'BUILDING_BLUEPRINT', session.activeNovelId || '', {idea:text});
    return;
  }

  if (state === 'AWAIT_BLUEPRINT_EDIT') {
    const d = session.data || {};
    const msgId = sendMessage_(chatId,
      '✏️ <b>Memperbarui blueprint...</b>\n\n' +
      'Perubahanmu: “' + escapeHtml_(truncate_(text, 700)) + '”');
    createJob_({
      novelId:'', chatId:chatId, userId:userId,
      type:'BLUEPRINT_UPDATE', stage:'UPDATE', progress:10,
      status:'QUEUED', messageId:msgId,
      data:{blueprint:d.blueprint || {}, instruction:text, mode:'edit'}
    });
    setSession_(userId, chatId, 'BUILDING_BLUEPRINT', session.activeNovelId || '', d);
    return;
  }

  if (state === 'AWAIT_FOUNDATION_REJECT_REASON') {
    const d = session.data || {};
    const oldJob = getJob_(d.jobId);
    if (!oldJob || !oldJob.NOVEL_ID) {
      setSession_(userId, chatId, 'IDLE', session.activeNovelId || '', {});
      sendMessage_(chatId, '❌ Job blueprint lama tidak ditemukan.');
      return;
    }

    const msgId = sendMessage_(chatId,
      '🔧 <b>Foundation Revision</b>\n\n' +
      'Alasan admin sudah diterima. Bible + Roadmap akan direvisi tanpa membuat project Drive baru.\n\n' +
      '📝 ' + escapeHtml_(truncate_(text, 900)));

    createJob_({
      novelId:oldJob.NOVEL_ID, chatId:chatId, userId:userId,
      type:'FOUNDATION', stage:'GENERATE_BIBLE', progress:10,
      status:'QUEUED', messageId:msgId,
      data:{mode:'revise', reason:text, nextPlanStart:1}
    });
    setSession_(userId, chatId, 'BUILDING_FOUNDATION', oldJob.NOVEL_ID, {});
    return;
  }

  if (state === 'AWAIT_BATCH_REJECT_REASON') {
    const d = session.data || {};
    const oldJob = getJob_(d.jobId);
    if (!oldJob) {
      setSession_(userId, chatId, 'IDLE', session.activeNovelId || '', {});
      sendMessage_(chatId, '❌ Batch job tidak ditemukan.');
      return;
    }

    const oldData = oldJob.DATA || {};
    const msgId = sendMessage_(chatId,
      '♻️ <b>Revision Job dibuat</b>\n\n' +
      'Chapter ' + oldData.startChapter + '–' + oldData.endChapter + ' akan ditulis ulang berdasarkan alasan admin, Bible, Roadmap, Canon, dan review sebelumnya.\n\n' +
      '📝 ' + escapeHtml_(truncate_(text, 900)));

    createJob_({
      novelId:oldJob.NOVEL_ID, chatId:chatId, userId:userId,
      type:'GENERATE_BATCH', stage:'GENERATE_CHAPTERS', progress:0,
      status:'QUEUED', messageId:msgId,
      data:{
        startChapter:Number(oldData.startChapter),
        endChapter:Number(oldData.endChapter),
        nextChapter:Number(oldData.startChapter),
        mode:'revision',
        reason:text,
        sourceJobId:oldJob.JOB_ID
      }
    });
    setSession_(userId, chatId, 'GENERATING_BATCH', oldJob.NOVEL_ID, {});
    return;
  }

  if (state === 'AWAIT_REWRITE_CHAPTER_PICK') {
    const chapterNo = Number(String(text || '').replace(/[^0-9]/g, ''));
    const novelId = session.activeNovelId || (session.data && session.data.novelId) || '';
    if (!chapterNo || chapterNo < 1) {
      sendMessage_(chatId,
        '♻️ <b>REVISI CHAPTER</b>\n\n' +
        'Kirim nomor chapter yang ingin direvisi.\n' +
        'Contoh: <code>12</code>');
      return;
    }
    setSession_(userId, chatId, 'IDLE', novelId, {});
    startManualRewriteCommand_(chatId, userId, {activeNovelId:novelId}, String(chapterNo));
    return;
  }

  if (state === 'AWAIT_MANUAL_REWRITE_REASON') {
    const d = session.data || {};
    const novelId = d.novelId || session.activeNovelId || '';
    const chapterNo = Number(d.chapterNo || 0);
    if (!novelId || !chapterNo) {
      setSession_(userId, chatId, 'IDLE', session.activeNovelId || '', {});
      sendMessage_(chatId, '❌ Target rewrite tidak ditemukan. Jalankan /rewrite lagi.');
      return;
    }
    startManualRewriteJob_(chatId, userId, novelId, chapterNo, text);
    setSession_(userId, chatId, 'GENERATING_BATCH', novelId, {});
    return;
  }

  if (state === 'AWAIT_TRANSLATE_RANGE') {
    const d = session.data || {};
    const novelId = d.novelId || session.activeNovelId || '';
    if (!novelId) {
      setSession_(userId, chatId, 'IDLE', '', {});
      sendMessage_(chatId, '❌ Novel translate tidak ditemukan.');
      return;
    }
    try {
      const idx = getNovelIndex_(novelId);
      const range = parseTranslateRangeArg_(text, Number(idx && idx.LATEST_CANON || 0));
      if (!range) {
        sendMessage_(chatId,
          'Format range tidak valid. Contoh: <code>1-20</code>, <code>25</code>, <code>all</code>, atau <code>next</code>.');
        return;
      }
      const targetCode = String(d.targetCode || translationConfig_(novelId).targetCode || defaultTranslationTargetCode_(idx && idx.LANGUAGE));
      setSession_(userId, chatId, 'IDLE', novelId, {});
      startTranslationJob_(chatId, userId, novelId, range, targetCode);
    } catch (err) {
      sendMessage_(chatId, '❌ ' + escapeHtml_(String(err && err.message || err)));
    }
    return;
  }

  if (state === 'AWAIT_STYLE_EDIT') {
    const d = session.data || {};
    const novelId = d.novelId || session.activeNovelId || '';
    if (!novelId) {
      setSession_(userId, chatId, 'IDLE', '', {});
      sendMessage_(chatId, '❌ Novel Style Lock tidak ditemukan.');
      return;
    }

    const msgId = sendMessage_(chatId,
      '🧬 <b>STYLE LOCK UPDATE</b>\n\n' +
      '⏳ AI sedang mengubah instruksi gayamu menjadi Style Profile terstruktur...');
    const jobId = createJob_({
      novelId:novelId, chatId:chatId, userId:userId,
      type:'STYLE_ANALYZE', stage:'ANALYZE', progress:10,
      status:'QUEUED', messageId:msgId,
      data:{mode:'custom',instruction:text}
    });
    setSession_(userId, chatId, 'IDLE', novelId, {jobId:jobId});
    return;
  }

  if (state === 'BLUEPRINT_REVIEW') {
    sendMessage_(chatId,
      'Aku anggap pesan itu sebagai perubahan blueprint. Kalau memang iya, tekan <b>✏️ Edit Blueprint</b> lalu kirim perubahannya supaya state-nya aman.');
    return;
  }

  sendMessage_(chatId,
    '💬 Aku menerima pesannya, tapi saat ini tidak ada form percakapan yang sedang aktif.\n\n' +
    'Gunakan /newnovel untuk membuat novel atau /help untuk menu.');
}

/* ========================================================================== */
/* TELEGRAM NOVEL AGENT (v5.2)                                                 */
/* Every free-text message goes through an AI intent classifier that maps it  */
/* to an existing command (synthesized command string -> handleCommand_) or to */
/* a conversational answer grounded in the novel's own data. Like Hermes, but  */
/* specialized for novels.                                                     */
/* ========================================================================== */

function telegramAgentEnabled_(){
  return String(prop_('TELEGRAM_AGENT_ENABLED')||'true').trim().toLowerCase()!=='false';
}

// Intents the classifier may return. Keep this list compact — it goes into
// every classification prompt.
function telegramAgentIntentsText_(){
  return [
    'new_novel — mulai buat novel baru dari ide bebas',
    'list_novels — tampilkan daftar novel',
    'use_novel — pilih novel aktif | param novel_id (mis. NVL_0007)',
    'novel_status — status novel aktif',
    'write — tulis chapter | param range ("next", "6-10", "15")',
    'autowrite — tulis otomatis banyak chapter | param range ("41-100", "to_end"=sampai target novel)',
    'review — review chapter | param range',
    'rewrite — tulis ulang chapter | param chapter, reason',
    'read_chapter — baca/tampilkan chapter | param chapter',
    'translate — terjemahkan chapter | param range, lang (id/en/...)',
    'health — canon health check | param range',
    'style — style lock novel',
    'character — info karakter | param name',
    'threads — plot thread & foreshadowing tracker',
    'timeline — timeline novel',
    'snapshot — buat canon snapshot',
    'rollback — buka pusat rollback/snapshot',
    'export — export novel | param format (txt/docx/epub)',
    'visual — visual bible',
    'art — generate art | param kind (cover/character/chapter)',
    'lore — cari di world encyclopedia | param query',
    'quality — laporan kualitas prosa',
    'analytics — analitik novel',
    'publishmeta — metadata publikasi | param platform',
    'jobs — daftar job',
    'retry — ulangi job error | param job_id',
    'retryall — ulangi semua job error',
    'roadmaps — lihat daftar roadmap',
    'reroadmap — ubah arah roadmap | param mode (realign/return/new/whatif ...)',
    'scan — scan folder Drive NOVEL',
    'ai_status — status AI router',
    'ai_usage — pemakaian AI hari ini',
    'ban — blokir akun web | param user_id | PERLU KONFIRMASI',
    'unban — buka blokir akun web | param user_id | PERLU KONFIRMASI',
    'cancel — batalkan form yang sedang aktif',
    'help — tampilkan bantuan',
    'ask — BERTANYA tentang isi novel (karakter, plot, timeline, "kenapa X terjadi"). Ini BUKAN perintah.',
    'chat — obrolan bebas tentang novel/menulis. Ini BUKAN perintah.',
    'form_input — teks ini adalah JAWABAN untuk form yang sedang aktif. Teruskan apa adanya.',
    'unknown — tidak jelas maksudnya'
  ].join('\n');
}

function classifyTelegramIntent_(text, session){
  const novelId=session.activeNovelId||'';
  let novelLine='Novel aktif: (belum ada — perintah novel butuh novel aktif dulu)';
  if(novelId){
    try{
      const idx=getNovelIndex_(novelId);
      if(idx&&isTelegramAdminNovel_(idx)){
        novelLine='Novel aktif: '+idx.NOVEL_ID+' | "'+String(idx.TITLE||'').slice(0,80)+
          '" | canon Ch'+Number(idx.LATEST_CANON||0)+'/'+Number(idx.TARGET_CHAPTERS||0);
      }
    }catch(_){}
  }
  const prompt=
    'Kamu adalah intent router untuk bot Telegram novel AI. Bahasa user: Indonesia.\n'+
    'Klasifikasikan SATU intent dari pesan user. Jawab HANYA JSON valid.\n\n'+
    novelLine+'\n'+
    'Form aktif: '+String(session.state||'IDLE')+'\n\n'+
    'DAFTAR INTENT:\n'+telegramAgentIntentsText_()+'\n\n'+
    'ATURAN:\n'+
    '- Jika form aktif (bukan IDLE) dan pesan tampak seperti jawaban form itu → "form_input".\n'+
    '- Jika pesan jelas perintah BARU meski form aktif → intent perintah itu (form lama dianggap batal).\n'+
    '- "lanjut", "teruskan", "gas", "next" → write, range "next".\n'+
    '- "tulis sampai tamat/selesai/akhir/beres" → autowrite, range "to_end".\n'+
    '- Pertanyaan tentang isi cerita/karakter/plot ("siapa", "kenapa", "apa yang terjadi", "chapter X tentang apa") → "ask".\n'+
    '- Sapaan, opini, curhat → "chat".\n'+
    '- novel_id format NVL_xxxx; job_id format JOB_xxx.\n'+
    '- confidence 0-1. Jika ragu (<0.55) → "unknown".\n\n'+
    'Format JSON: {"intent":"...","confidence":0.9,"params":{"range":"","chapter":0,"reason":"","novel_id":"","job_id":"","user_id":"","lang":"","format":"","kind":"","platform":"","name":"","query":"","question":""}}\n\n'+
    'PESAN USER:\n'+String(text||'').slice(0,2000);

  const r=aiJson_(prompt)||{};
  const intent=String(r.intent||'unknown').trim().toLowerCase();
  const known=telegramAgentIntentsText_().split('\n').map(function(l){return l.split(' — ')[0];});
  return {
    intent:known.indexOf(intent)>=0?intent:'unknown',
    confidence:Math.max(0,Math.min(1,Number(r.confidence||0))),
    params:(r.params&&typeof r.params==='object')?r.params:{}
  };
}

// Synthesize a command string from a classified intent, then reuse handleCommand_.
function synthesizeTelegramCommand_(intent, p, session){
  p=p||{};
  const s=function(v){return String(v||'').trim();};
  const novelId=session.activeNovelId||'';
  switch(intent){
    case 'new_novel': return '/newnovel';
    case 'list_novels': return '/novels';
    case 'use_novel': return '/use '+s(p.novel_id).toUpperCase();
    case 'novel_status': return '/status';
    case 'write': return '/write '+(s(p.range)||'next');
    case 'autowrite': {
      let range=s(p.range);
      if(range==='to_end'&&novelId){
        try{
          const idx=getNovelIndex_(novelId);
          const next=Number(idx.LATEST_CANON||0)+1,target=Number(idx.TARGET_CHAPTERS||0);
          if(target>0&&target>=next)range=next+'-'+target;
          else range='next';
        }catch(_){range='next';}
      }
      return '/autowrite '+(range||'next');
    }
    case 'review': return '/review '+(s(p.range)||'');
    case 'rewrite': {
      const ch=Number(p.chapter||0);
      if(!ch)return '';
      return '/rewrite '+ch+(s(p.reason)?' '+s(p.reason):'');
    }
    case 'read_chapter': return '/chapter '+(Number(p.chapter||0)||'');
    case 'translate': return '/translate '+[s(p.range),s(p.lang)].filter(Boolean).join(' ');
    case 'health': return '/health '+(s(p.range)||'');
    case 'style': return '/style';
    case 'character': return '/character '+(s(p.name)||s(p.query)||'');
    case 'threads': return '/threads';
    case 'timeline': return '/timeline';
    case 'snapshot': return '/snapshot';
    case 'rollback': return '/rollback';
    case 'export': return '/export '+(s(p.format)||'');
    case 'visual': return '/visual';
    case 'art': return '/art '+(s(p.kind)||'');
    case 'lore': return '/lore '+(s(p.query)||'');
    case 'quality': return '/quality';
    case 'analytics': return '/analytics';
    case 'publishmeta': return '/publishmeta '+(s(p.platform)||'');
    case 'jobs': return '/jobs';
    case 'retry': return '/retry '+s(p.job_id).toUpperCase();
    case 'retryall': return '/retryall';
    case 'roadmaps': return '/roadmaps';
    case 'reroadmap': return '/reroadmap '+(s(p.mode)||'');
    case 'scan': return '/scan';
    case 'ai_status': return '/ai';
    case 'ai_usage': return '/aiusage';
    case 'ban': return '/ban '+s(p.user_id).toUpperCase();
    case 'unban': return '/unban '+s(p.user_id).toUpperCase();
    case 'cancel': return '/cancel';
    case 'help': return '/help';
    default: return '';
  }
}

function telegramAgentConfirmIntents_(){
  return ['ban','unban'];
}

// Entry point for every non-command Telegram message.
function handleAgentMessage_(text, chatId, userId, session){
  if(!telegramAgentEnabled_()){
    handleNaturalInput_(text, chatId, userId, session);
    return;
  }

  let c=null;
  try{
    c=classifyTelegramIntent_(text, session);
  }catch(err){
    log_('WARN','telegram-agent','Klasifikasi intent gagal; fallback ke handler lama.',{error:String(err&&err.message||err)});
  }
  if(!c){
    handleNaturalInput_(text, chatId, userId, session);
    return;
  }

  const intent=c.intent,p=c.params||{};
  const formActive=String(session.state||'IDLE')!=='IDLE';

  // 1) Form input → legacy handler (it knows every AWAIT_* state).
  if(intent==='form_input'){
    handleNaturalInput_(text, chatId, userId, session);
    return;
  }

  // 2) Conversational intents.
  if(intent==='ask'){
    answerNovelQuestion_(chatId, session, String(p.question||p.query||text||''));
    return;
  }
  if(intent==='chat'){
    agentChatReply_(chatId, session, text);
    return;
  }

  // 3) Unknown → clarify (or legacy form handling when a form is active).
  if(intent==='unknown'){
    if(formActive){
      handleNaturalInput_(text, chatId, userId, session);
      return;
    }
    sendMessage_(chatId,
      '🤔 <b>Kurang paham maksudnya.</b>\n\n'+
      'Coba misal:\n'+
      '• <i>"lanjut tulis chapter berikutnya"</i>\n'+
      '• <i>"tulis sampai tamat"</i>\n'+
      '• <i>"review chapter 1-10"</i>\n'+
      '• <i>"siapa karakter utama novel ini?"</i>\n\n'+
      'Atau /help untuk daftar perintah.');
    return;
  }

  // 4) Risky intents → inline confirmation first.
  if(telegramAgentConfirmIntents_().indexOf(intent)>=0){
    const cmd=synthesizeTelegramCommand_(intent,p,session);
    if(!cmd){handleNaturalInput_(text, chatId, userId, session);return;}
    sendMessage_(chatId,
      '⚠️ <b>Konfirmasi perintah</b>\n\n'+
      'Aku memahami maksudmu sebagai:\n<code>'+escapeHtml_(cmd)+'</code>\n\n'+
      'Jalankan?',
      keyboard_([
        [{text:'✅ Ya, jalankan',callback_data:'AGENT_CONFIRM|'+cmd}],
        [{text:'❌ Batal',callback_data:'SESSION_CANCEL'}]
      ]));
    return;
  }

  // 5) Normal command → synthesize + dispatch. A fresh command cancels a stale form.
  const cmd=synthesizeTelegramCommand_(intent,p,session);
  if(!cmd){
    handleNaturalInput_(text, chatId, userId, session);
    return;
  }
  if(formActive&&intent!=='cancel'){
    setSession_(userId,chatId,'IDLE',session.activeNovelId||'',{});
  }
  handleCommand_(cmd,chatId,userId,getSession_(userId,chatId));
}

// Confirmation callback for agent-synthesized risky commands.
function handleAgentConfirm_(chatId,messageId,userId,cmd){
  const allowed=['/ban','/unban'];
  const base=String(cmd||'').split(/\s+/)[0].toLowerCase();
  if(allowed.indexOf(base)<0){
    editMessage_(chatId,messageId,'❌ Perintah tidak diizinkan.');
    return;
  }
  editMessage_(chatId,messageId,'✅ <b>Dijalankan:</b> <code>'+escapeHtml_(cmd)+'</code>');
  const s=getSession_(userId,chatId);
  handleCommand_(cmd,chatId,userId,s);
}

// v5.2: answer a question ABOUT the novel, grounded in its own data.
function answerNovelQuestion_(chatId, session, question){
  const novelId=session.activeNovelId||'';
  if(!novelId){
    sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels lalu <code>/use NVL_xxxx</code>, baru aku bisa jawab tentang isinya.');
    return;
  }
  const working=sendMessage_(chatId,'🔍 <b>Membaca catatan novel...</b>');
  try{
    const idx=getNovelIndex_(novelId);
    if(!idx||!isTelegramAdminNovel_(idx))throw new Error('Novel tidak ditemukan.');
    const sh=getNovelSheet_(novelId);
    const bible=getNovelRecordData_(sh,'BIBLE','MASTER')||{};
    const memory=getNovelRecordData_(sh,'MEMORY','STORY_MEMORY')||{};
    const bibleText=JSON.stringify(bible).slice(0,6000);
    const memoryText=JSON.stringify(memory).slice(0,6000);
    // Last 10 canon summaries, compacted (same helper as chapter context).
    const recentBundle=compactCanonSummaryBundle_(getCanonSummariesBefore_(sh,Number(idx.LATEST_CANON||0)+1,10));
    const recentText=JSON.stringify(recentBundle).slice(0,8000);

    const answer=aiText_(
      'Kamu adalah asisten novel "'+String(idx.TITLE||novelId)+'". Jawab pertanyaan user HANYA dari konteks novel di bawah. '+
      'Jika jawabannya tidak ada di konteks, katakan terus terang tidak tahu — JANGAN mengarang. '+
      'Bahasa: Indonesia, ringkas (maksimal ~150 kata), boleh pakai spoiler karena user adalah penulisnya.\n\n'+
      'BIBLE (ringkas):\n'+bibleText+'\n\n'+
      'STORY MEMORY:\n'+memoryText+'\n\n'+
      'CANON TERAKHIR:\n'+recentText+'\n\n'+
      'PERTANYAAN: '+String(question||'').slice(0,1000)
    );
    editMessage_(chatId,Number(working),
      '💬 <b>'+escapeHtml_(String(idx.TITLE||novelId))+'</b>\n\n'+escapeHtml_(String(answer||'').trim().slice(0,3500)));
  }catch(err){
    editMessage_(chatId,Number(working),'❌ '+escapeHtml_(String(err&&err.message||err).slice(0,500)));
  }
}

// v5.2: light free chat about the novel / writing.
function agentChatReply_(chatId, session, text){
  const novelId=session.activeNovelId||'';
  let title='';
  try{
    if(novelId){
      const idx=getNovelIndex_(novelId);
      if(idx&&isTelegramAdminNovel_(idx))title=String(idx.TITLE||'');
    }
  }catch(_){}
  try{
    const reply=aiText_(
      'Kamu adalah partner menulis novel yang santai dan membantu. '+
      (title?'Novel user: "'+title+'". ':'')+
      'Ngobrol bebas tentang novel/menulis dalam Bahasa Indonesia, ringkas (maksimal ~120 kata). '+
      'Jangan mengklaim bisa menjalankan perintah — jika user meminta aksi, sarankan perintah yang tepat.\n\n'+
      'USER: '+String(text||'').slice(0,1000)
    );
    sendMessage_(chatId,escapeHtml_(String(reply||'').trim().slice(0,2000)));
  }catch(err){
    sendMessage_(chatId,'💬 Hmm, AI sedang sibuk. Coba lagi sebentar ya.');
  }
}

function handleCallback_(q) {
  const id = q.id;
  const data = String(q.data || '');
  const chatId = String(q.message && q.message.chat && q.message.chat.id || '');
  const messageId = q.message && q.message.message_id;
  const userId = String(q.from && q.from.id || '');

  if (!isAdmin_(userId)) {
    answerCallback_(id, 'Akun ini bukan admin.', true);
    return;
  }

  answerCallback_(id, 'Diproses…', false);

  if (data === 'SESSION_CANCEL') {
    const s = getSession_(userId, chatId);
    setSession_(userId, chatId, 'IDLE', s.activeNovelId || '', {});
    editMessage_(chatId, messageId, '❌ Proses dibatalkan.');
    return;
  }

  // v5.2 novel agent: confirmation for risky synthesized commands.
  if (data.indexOf('AGENT_CONFIRM|') === 0) {
    handleAgentConfirm_(chatId, messageId, userId, data.slice('AGENT_CONFIRM|'.length));
    return;
  }

  if (data === 'IDEA_HELP') {
    editMessage_(chatId, messageId,
      '💡 <b>Idea Starter</b>\n\n' +
      'Kirim 2–5 hal yang kamu suka. Misalnya:\n' +
      '<code>time travel, mystery, kerajaan kuno, romance slow burn, tragic</code>\n\n' +
      'Aku akan menyatukannya menjadi konsep novel.');
    return;
  }

  if (data === 'IDEA_RANDOM') {
    const s = getSession_(userId, chatId);
    const msgId = messageId || sendMessage_(chatId, '🎲 Merancang konsep acak…');
    createJob_({
      novelId:'', chatId:chatId, userId:userId,
      type:'BLUEPRINT_RANDOM', stage:'RANDOM', progress:5,
      status:'QUEUED', messageId:msgId,
      data:{}
    });
    setSession_(userId, chatId, 'BUILDING_BLUEPRINT', s.activeNovelId || '', {});
    return;
  }

  const p = data.split('|');
  const action = p[0];
  const ref = p[1] || '';

  // Hard boundary: Telegram callbacks may only touch TELEGRAM_ADMIN novels.
  // This blocks guessed/manually-crafted callback_data from reaching Web-user workspaces.
  if (/^NVL_/i.test(ref)) {
    const callbackNovel=getNovelIndex_(String(ref).toUpperCase());
    if (!callbackNovel || !isTelegramAdminNovel_(callbackNovel)) {
      answerCallback_(id, 'Novel tidak tersedia pada workspace Telegram Admin.', true);
      return;
    }
  }

  // -----------------------------------------------------------------------
  // JOB MANAGER
  // -----------------------------------------------------------------------
  if (action === 'JOB_LIST' || action === 'JOB_REFRESH_LIST') {
    const view = buildJobsListView_(userId);
    editMessage_(chatId, messageId, view.text, view.keyboard);
    return;
  }

  if (action === 'JOB_CLEAR_COMPLETED') {
    const all=getJobsForUser_(userId,500),count=all.filter(isJobComplete100_).length;
    editMessage_(chatId,messageId,
      '🧹 <b>CLEAR COMPLETED JOBS?</b>\n\nAkan menghapus <b>'+count+'</b> history job Admin yang sudah 100%.\nNovel, Canon, Bible, Roadmap dan file Drive tidak dihapus.',
      keyboard_([[{text:'🧹 YA, CLEAR',callback_data:'JOB_CLEAR_COMPLETED_CONFIRM'}],[{text:'↩️ Batal',callback_data:'JOB_LIST'}]]));
    return;
  }

  if (action === 'JOB_CLEAR_COMPLETED_CONFIRM') {
    try{
      const r=clearCompletedTelegramJobs_(userId),view=buildJobsListView_(userId);
      editMessage_(chatId,messageId,'✅ Dihapus: <b>'+Number(r.deleted||0)+'</b> history job selesai.\n\n'+view.text,view.keyboard);
    }catch(err){answerCallback_(id,String(err&&err.message||err).slice(0,180),true);}
    return;
  }

  if (action === 'JOB_VIEW' || action === 'JOB_REFRESH') {
    const view = buildJobDetailView_(ref, userId);
    editMessage_(chatId, messageId, view.text, view.keyboard);
    return;
  }

  if (action === 'JOB_RETRY') {
    try {
      const owned=getTelegramOwnedJob_(ref,userId);
      retryJobById_(owned.JOB_ID, false);
      installWorkerTrigger_();
      const view = buildJobDetailView_(ref, userId);
      editMessage_(chatId, messageId,
        '🔄 <b>JOB DI-RETRY</b>\n\n' +
        'Job dikembalikan ke queue dari checkpoint terakhir. Worker akan melanjutkannya otomatis.\n\n' +
        view.text,
        view.keyboard);
    } catch (err) {
      answerCallback_(id, String(err && err.message || err).slice(0,180), true);
    }
    return;
  }

  if (action === 'JOB_DELETE') {
    let job=null;
    try{job=getTelegramOwnedJob_(ref,userId);}
    catch(err){
      answerCallback_(id,String(err&&err.message||err).slice(0,180),true);
      return;
    }
    const status = String(job.STATUS || '').toUpperCase();
    const running = status === 'RUNNING' || status === 'QUEUED';
    const text =
      '🗑 <b>HAPUS JOB?</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '🆔 <code>' + escapeHtml_(job.JOB_ID) + '</code>\n' +
      '⚙️ ' + escapeHtml_(job.TYPE || '-') + '\n' +
      '📍 ' + escapeHtml_(job.STAGE || '-') + '\n' +
      '📊 ' + Number(job.PROGRESS || 0) + '% • <b>' + escapeHtml_(status || '-') + '</b>\n\n' +
      (running ? '⚠️ Job masih aktif. Bot akan membatalkannya dulu sebelum menghapus record.\n\n' : '') +
      'Chapter, Canon, Bible, Roadmap, dan file novel <b>tidak akan dihapus</b>. Hanya record job di <code>_JOBS</code>.';
    editMessage_(chatId, messageId, text, keyboard_([
      [{text:'🗑 YA, HAPUS JOB', callback_data:'JOB_DELETE_CONFIRM|' + job.JOB_ID}],
      [{text:'↩️ Kembali', callback_data:'JOB_VIEW|' + job.JOB_ID}]
    ]));
    return;
  }

  if (action === 'JOB_DELETE_CONFIRM') {
    try {
      const deleted = deleteJobById_(ref, userId);
      const view = buildJobsListView_(userId);
      editMessage_(chatId, messageId,
        '✅ <b>JOB DIHAPUS</b>\n\n' +
        '<code>' + escapeHtml_(deleted.jobId) + '</code> sudah dihapus dari <code>_JOBS</code>.\n' +
        'Data novel dan chapter tidak disentuh.\n\n' +
        view.text,
        view.keyboard);
    } catch (err) {
      answerCallback_(id, String(err && err.message || err).slice(0,180), true);
    }
    return;
  }

  if(action==='WEBNOVELS_LIST'){
    const v=buildWebNovelsAdminView_(Number(ref||1));editMessage_(chatId,messageId,v.text,v.keyboard);return;
  }
  if(action==='WEBNOVEL_VIEW'){
    try{const v=buildWebNovelAdminDetail_(ref);editMessage_(chatId,messageId,v.text,v.keyboard);}
    catch(err){answerCallback_(id,String(err&&err.message||err).slice(0,180),true);}
    return;
  }

  // -----------------------------------------------------------------------
  // NOVEL APP-LIKE NAVIGATION
  // -----------------------------------------------------------------------
  if (action === 'NOVEL_LIST') {
    const view = buildNovelListView_();
    editMessage_(chatId, messageId, view.text, view.keyboard);
    return;
  }

  if (action === 'NOVEL_VIEW') {
    const novel = getNovelIndex_(ref);
    if (!novel || !isTelegramAdminNovel_(novel)) {
      sendMessage_(chatId, '❌ Novel tidak ditemukan. Jalankan /scan lalu coba lagi.');
      return;
    }
    setSession_(userId, chatId, 'IDLE', novel.NOVEL_ID, {});
    const view = buildNovelDetailView_(novel.NOVEL_ID);
    editMessage_(chatId, messageId, view.text, view.keyboard);
    return;
  }

  if (action === 'NOVEL_INFO') {
    const novel = getNovelIndex_(ref);
    if (!novel || !isTelegramAdminNovel_(novel)) {
      sendMessage_(chatId, '❌ Novel tidak ditemukan.');
      return;
    }
    setSession_(userId, chatId, 'IDLE', novel.NOVEL_ID, {});
    sendNovelInformation_(chatId, novel.NOVEL_ID);
    return;
  }

  if (action === 'NOVEL_TRANSLATE') {
    const novel = getNovelIndex_(ref);
    if (!novel || !isTelegramAdminNovel_(novel)) return;
    setSession_(userId, chatId, 'IDLE', novel.NOVEL_ID, {});
    sendTranslationCenter_(chatId, novel.NOVEL_ID);
    return;
  }

  if (action === 'TR_LANG') {
    const novelId = ref;
    const targetCode = normalizeLanguageCode_(p[2] || 'id');
    setTranslationTarget_(novelId, targetCode);
    sendTranslationCenter_(chatId, novelId);
    return;
  }

  if (action === 'TR_NEXT') {
    const novelId = ref;
    const idx = getNovelIndex_(novelId);
    if (!idx) return;
    const targetCode = normalizeLanguageCode_(p[2] || translationConfig_(novelId).targetCode || 'id');
    const next = nextUntranslatedCanon_(novelId, targetCode);
    if (!next) {
      sendMessage_(chatId, '✅ Semua chapter Canon sudah diterjemahkan ke ' + escapeHtml_(languageName_(targetCode)) + '.');
      return;
    }
    startTranslationJob_(chatId, userId, novelId, {start:next,end:next}, targetCode);
    return;
  }

  if (action === 'TR_RANGE') {
    const novelId = ref;
    const targetCode = normalizeLanguageCode_(p[2] || translationConfig_(novelId).targetCode || 'id');
    setSession_(userId, chatId, 'AWAIT_TRANSLATE_RANGE', novelId, {novelId:novelId,targetCode:targetCode});
    sendMessage_(chatId,
      '🌐 <b>TRANSLATE RANGE</b>\n\n' +
      'Kirim range Canon yang ingin diterjemahkan.\n\n' +
      'Contoh:\n' +
      '• <code>1-20</code>\n' +
      '• <code>41</code>\n' +
      '• <code>all</code>\n' +
      '• <code>next</code>\n\n' +
      'Target: <b>' + escapeHtml_(languageName_(targetCode)) + '</b>');
    return;
  }

  if (action === 'TR_ALL') {
    const novelId = ref;
    const idx = getNovelIndex_(novelId);
    if (!idx || !Number(idx.LATEST_CANON || 0)) {
      sendMessage_(chatId, '❌ Novel ini belum mempunyai Canon.');
      return;
    }
    const targetCode = normalizeLanguageCode_(p[2] || translationConfig_(novelId).targetCode || 'id');
    startTranslationJob_(chatId, userId, novelId, {start:1,end:Number(idx.LATEST_CANON)}, targetCode);
    return;
  }

  if (action === 'TR_AUTO') {
    const novelId = ref;
    const cfg = translationConfig_(novelId);
    cfg.autoEnabled = !cfg.autoEnabled;
    saveTranslationConfig_(novelId, cfg);
    sendTranslationCenter_(chatId, novelId);
    return;
  }

  if (action === 'NOVEL_HEALTH') {
    const novel = getNovelIndex_(ref);
    if (!novel || !isTelegramAdminNovel_(novel)) return;
    setSession_(userId, chatId, 'IDLE', novel.NOVEL_ID, {});
    sendCanonHealthCenter_(chatId, novel.NOVEL_ID);
    return;
  }

  if (action === 'HEALTH_RUN') {
    startCanonHealthJob_(chatId, userId, ref, null);
    return;
  }

  if (action === 'HEALTH_VIEW') {
    sendLatestCanonHealth_(chatId, ref);
    return;
  }

  if (action === 'NOVEL_STYLE') {
    const novel = getNovelIndex_(ref);
    if (!novel || !isTelegramAdminNovel_(novel)) return;
    setSession_(userId, chatId, 'IDLE', novel.NOVEL_ID, {});
    sendStyleCenter_(chatId, novel.NOVEL_ID);
    return;
  }

  if (action === 'STYLE_ANALYZE') {
    const novelId = ref;
    const msgId = sendMessage_(chatId,
      '🧬 <b>STYLE LOCK</b>\n\n' +
      '⏳ Menganalisis voice, POV, tense, ritme kalimat, dialog, exposition, imagery, dan kebiasaan prose...');
    const jobId = createJob_({
      novelId:novelId, chatId:chatId, userId:userId,
      type:'STYLE_ANALYZE', stage:'ANALYZE', progress:10,
      status:'QUEUED', messageId:msgId,
      data:{mode:'analyze'}
    });
    setSession_(userId, chatId, 'IDLE', novelId, {jobId:jobId});
    return;
  }

  if (action === 'STYLE_TOGGLE') {
    toggleStyleLock_(ref);
    sendStyleCenter_(chatId, ref);
    return;
  }

  if (action === 'STYLE_EDIT') {
    setSession_(userId, chatId, 'AWAIT_STYLE_EDIT', ref, {novelId:ref});
    sendMessage_(chatId,
      '✏️ <b>EDIT STYLE LOCK</b>\n\n' +
      'Kirim aturan gaya dengan bahasa biasa.\n\n' +
      'Contoh:\n' +
      '<i>Dialog jangan terlalu panjang. Narasi harus dark dan restrained. Hindari metafora berlebihan. Paragraf medium. Jangan pakai slang modern.</i>');
    return;
  }

  if (action === 'STYLE_VIEW') {
    sendStyleProfile_(chatId, ref);
    return;
  }

  if (action === 'NOVEL_BRAIN') {
    sendNovelBrainCenter_(chatId, ref);
    return;
  }

  if (action === 'NOVEL_BRAIN_CHAR') {
    sendCharacterTracker_(chatId,ref,'');
    return;
  }

  if (action === 'NOVEL_BRAIN_THREAD') {
    sendThreadTracker_(chatId,ref);
    return;
  }

  if (action === 'NOVEL_BRAIN_TIME') {
    sendTimelineTracker_(chatId,ref);
    return;
  }

  if (action === 'NOVEL_VISUAL') {
    sendVisualBibleCenter_(chatId, ref);
    return;
  }

  if (action === 'NOVEL_EXPORT') {
    sendExportCenter_(chatId, ref);
    return;
  }

  if (action === 'VISUAL_BUILD') {
    startVisualBibleJob_(chatId,userId,ref);
    return;
  }

  if (action === 'ART_CENTER') {
    sendArtCenter_(chatId,ref);
    return;
  }

  if (action === 'ART_COVER') {
    startArtJob_(chatId,userId,ref,'cover',{});
    return;
  }

  if (action === 'ART_CHAPTER') {
    const idx = getNovelIndex_(ref);
    if (!idx) return;
    const ch = Number(idx.LATEST_CANON || 0);
    if (!ch) {
      sendMessage_(chatId,'❌ Belum ada Canon untuk dibuat ilustrasi.');
      return;
    }
    startArtJob_(chatId,userId,ref,'chapter',{chapter:ch});
    return;
  }

  if (action === 'EXPORT_TXT') {
    exportNovel_(chatId,ref,'txt');
    return;
  }

  if (action === 'EXPORT_DOCX') {
    exportNovel_(chatId,ref,'docx');
    return;
  }

  if (action === 'EXPORT_EPUB') {
    exportNovel_(chatId,ref,'epub');
    return;
  }

  if (action === 'SNAPSHOT_CREATE') {
    createCanonSnapshot_(chatId,ref);
    return;
  }

  if (action === 'ROLLBACK_PICK') {
    const snap = getSnapshotRecord_(ref,p[2] || '');
    if (!snap) {
      answerCallback_(id,'Snapshot tidak ditemukan.',true);
      return;
    }
    editMessage_(chatId,messageId,
      '⚠️ <b>CONFIRM ROLLBACK</b>\n\n' +
      'Novel: <b>' + escapeHtml_(getNovelIndex_(ref).TITLE) + '</b>\n' +
      'Snapshot: <code>' + escapeHtml_(String(p[2] || '')) + '</code>\n' +
      'Canon snapshot: Chapter <b>' + Number(snap.latestCanon || 0) + '</b>\n\n' +
      'Database novel dan folder 05_CANON akan dikembalikan ke snapshot ini.',
      keyboard_([
        [{text:'⚠️ YA, ROLLBACK',callback_data:'ROLLBACK_CONFIRM|' + ref + '|' + String(p[2] || '')}],
        [{text:'↩️ BATAL',callback_data:'NOVEL_VIEW|' + ref}]
      ]));
    return;
  }

  if (action === 'ROLLBACK_CONFIRM') {
    restoreCanonSnapshot_(chatId,ref,p[2] || '');
    return;
  }

  if (action === 'AI_MODE') {
    setAiBudgetMode_(p[2] || 'ECONOMY');
    sendAiUsage_(chatId);
    return;
  }


  if (action === 'REROADMAP_CENTER') {
    sendReRoadmapCenter_(chatId,ref);
    return;
  }

  if (action === 'RR_START') {
    startReRoadmapJob_(chatId,userId,ref,'REALIGN',normalizeReRoadmapStrategy_(p[2]||'ADAPT'),'');
    return;
  }

  if (action === 'RR_VIEW') {
    sendRoadmapVersionDetail_(chatId,ref,String(p[2]||'').toUpperCase());
    return;
  }

  if (action === 'RR_ACTIVATE') {
    try {
      const r=activateAdaptiveRoadmapVersion_(ref,String(p[2]||'').toUpperCase(),'TELEGRAM_ADMIN');
      sendMessage_(chatId,'✅ <b>ROADMAP ACTIVE</b>\n\n<code>'+escapeHtml_(r.versionId)+'</code>\nFuture Ch'+r.nextChapter+'–'+r.targetChapters);
      sendReRoadmapCenter_(chatId,ref);
    } catch(err) {
      sendMessage_(chatId,'❌ Aktivasi gagal:\n'+escapeHtml_(String(err&&err.message||err)));
    }
    return;
  }

  if (action === 'RR_SANDBOX') {
    try {
      const r=saveRoadmapCandidateAsSandbox_(ref,String(p[2]||'').toUpperCase());
      sendMessage_(chatId,'🌿 <b>SAVED AS WHAT-IF SANDBOX</b>\n\n<code>'+escapeHtml_(r.versionId)+'</code>\nCanon dan active roadmap tidak berubah.');
    } catch(err) {
      sendMessage_(chatId,'❌ '+escapeHtml_(String(err&&err.message||err)));
    }
    return;
  }

  if (action === 'RR_DISCARD') {
    try {
      discardRoadmapVersion_(ref,String(p[2]||'').toUpperCase());
      sendMessage_(chatId,'🗑 Roadmap candidate ditandai DISCARDED.');
      sendReRoadmapCenter_(chatId,ref);
    } catch(err) {
      sendMessage_(chatId,'❌ '+escapeHtml_(String(err&&err.message||err)));
    }
    return;
  }

  if (action === 'NOVEL_WRITE_NEXT') {
    const novel = getNovelIndex_(ref);
    if (!novel) {
      sendMessage_(chatId, '❌ Novel tidak ditemukan.');
      return;
    }
    setSession_(userId, chatId, 'IDLE', novel.NOVEL_ID, {});
    startManualWriteCommand_(chatId, userId, {activeNovelId:novel.NOVEL_ID}, 'next');
    return;
  }

  if (action === 'NOVEL_REWRITE_PICK') {
    const novel = getNovelIndex_(ref);
    if (!novel) {
      sendMessage_(chatId, '❌ Novel tidak ditemukan.');
      return;
    }
    setSession_(userId, chatId, 'AWAIT_REWRITE_CHAPTER_PICK', novel.NOVEL_ID, {novelId:novel.NOVEL_ID});
    sendMessage_(chatId,
      '♻️ <b>REVISI / REWRITE CHAPTER</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📖 <b>' + escapeHtml_(novel.TITLE) + '</b>\n\n' +
      'Kirim nomor chapter yang ingin direvisi.\n' +
      'Contoh: <code>12</code>\n\n' +
      '<i>Sebelum rewrite, AI akan membaca Bible, roadmap chapter target, protected canon, memory, serta chapter-chapter sebelumnya.</i>');
    return;
  }

  if (action === 'NOVEL_TOOLS') {
    const novel = getNovelIndex_(ref);
    if (!novel) return;
    setSession_(userId, chatId, 'IDLE', novel.NOVEL_ID, {});
    sendWritingTools_(chatId, novel.NOVEL_ID);
    return;
  }

  if (action === 'NOVEL_ROADMAPS') {
    const novel = getNovelIndex_(ref);
    if (!novel) return;
    setSession_(userId, chatId, 'IDLE', novel.NOVEL_ID, {});
    sendRoadmapCandidates_(chatId, novel.NOVEL_ID);
    return;
  }

  if (action === 'NOVEL_CREATE') {
    handleCommand_('/newnovel', chatId, userId, getSession_(userId, chatId));
    return;
  }

  if (action === 'BP_BUILD') {
    const s = getSession_(userId, chatId);
    const bp = s.data && s.data.blueprint;
    if (!bp) {
      sendMessage_(chatId, '❌ Blueprint tidak ditemukan. Gunakan /newnovel lagi.');
      return;
    }
    const jobId = createJob_({
      novelId:'', chatId:chatId, userId:userId,
      type:'FOUNDATION', stage:'CREATE_WORKSPACE', progress:2,
      status:'QUEUED', messageId:messageId,
      data:{mode:'create', blueprint:bp, nextPlanStart:1}
    });
    setSession_(userId, chatId, 'BUILDING_FOUNDATION', '', {jobId:jobId});
    editMessage_(chatId, messageId, renderFoundationProgress_('Creating workspace', 2, bp.title || 'Untitled'));
    return;
  }

  if (action === 'BP_EDIT') {
    const s = getSession_(userId, chatId);
    setSession_(userId, chatId, 'AWAIT_BLUEPRINT_EDIT', s.activeNovelId || '', s.data || {});
    sendMessage_(chatId,
      '✏️ <b>Edit Blueprint</b>\n\n' +
      'Kirim perubahan dengan bahasa biasa. Contoh:\n' +
      '“Jangan 120 chapter, buat 200. Romance slow burn. Nama MC ganti Eiren.”');
    return;
  }

  if (action === 'BP_IMPROVE') {
    const s = getSession_(userId, chatId);
    const bp = s.data && s.data.blueprint;
    if (!bp) return;
    const msgId = sendMessage_(chatId, '🧠 <b>Story Doctor sedang memperkuat blueprint...</b>');
    createJob_({
      novelId:'', chatId:chatId, userId:userId,
      type:'BLUEPRINT_UPDATE', stage:'UPDATE', progress:10,
      status:'QUEUED', messageId:msgId,
      data:{blueprint:bp, instruction:'Improve this concept while preserving the creator intent. Strengthen conflict, character motivation, hook, mystery and long-form sustainability. Do not radically change the premise.', mode:'improve'}
    });
    setSession_(userId, chatId, 'BUILDING_BLUEPRINT', s.activeNovelId || '', s.data || {});
    return;
  }

  if (action === 'FD_APPROVE') {
    // v5.1 fix: was raw getJob_(ref) — a Telegram callback could approve/reject
    // another admin's or a web user's WAITING_APPROVAL job. Now ownership-checked.
    let job = null;
    try { job = getTelegramOwnedJob_(ref, userId); } catch (e) { job = null; }
    if (!job) return;
    // v5.1: atomic claim — double-tap cannot create two follow-up batch jobs.
    try {
      job = claimWaitingJobById_(job.JOB_ID, 'DONE', 'APPROVED');
    } catch (e) {
      sendMessage_(chatId, 'ℹ️ Foundation ini sudah tidak menunggu approval.');
      return;
    }
    updateJobFields_(job.JOB_ID, {PROGRESS:100});
    try {
      markNovelFoundationCanon_(job.NOVEL_ID);
    } catch (e) {
      // v5.1: revert the claim so the admin can retry the approval.
      updateJobFields_(job.JOB_ID, {STATUS:'WAITING_APPROVAL', STAGE:'WAIT_FOUNDATION_APPROVAL'});
      throw e;
    }

    const batchSize = defaultBatchSize_();
    const batchJob = createJob_({
      novelId:job.NOVEL_ID, chatId:chatId, userId:userId,
      type:'GENERATE_BATCH', stage:'GENERATE_CHAPTERS', progress:0,
      status:'QUEUED', messageId:messageId,
      data:{startChapter:1,endChapter:batchSize,nextChapter:1,mode:'draft',reason:'Initial test batch after approved foundation.'}
    });
    setSession_(userId, chatId, 'GENERATING_BATCH', job.NOVEL_ID, {jobId:batchJob});
    editMessage_(chatId, messageId, renderBatchProgress_(1, batchSize, 1, 'Starting Chapter 1', 2, 'TEST WRITING'));
    return;
  }

  if (action === 'FD_REJECT') {
    // v5.1 fix: was raw getJob_(ref) — a Telegram callback could approve/reject
    // another admin's or a web user's WAITING_APPROVAL job. Now ownership-checked.
    let job = null;
    try { job = getTelegramOwnedJob_(ref, userId); } catch (e) { job = null; }
    if (!job) return;
    if (job.STATUS !== 'WAITING_APPROVAL') {
      sendMessage_(chatId, 'ℹ️ Foundation ini sudah tidak menunggu approval.');
      return;
    }
    updateJobFields_(job.JOB_ID, {STATUS:'REJECTED', STAGE:'ADMIN_REJECTED'});
    const s = getSession_(userId, chatId);
    setSession_(userId, chatId, 'AWAIT_FOUNDATION_REJECT_REASON', job.NOVEL_ID, {jobId:job.JOB_ID});
    sendMessage_(chatId,
      '❌ <b>Foundation ditolak.</b>\n\n' +
      'Tuliskan bagian yang tidak sesuai. Kamu bisa bebas, misalnya:\n' +
      '“Roadmap terlalu cepat membuka misteri utama. Arc I harus tetap archaeology mystery dan time travel baru mendekati akhir arc.”');
    return;
  }

  if (action === 'BATCH_REREVIEW') {
    // v5.1 fix: was raw getJob_(ref) — a Telegram callback could approve/reject
    // another admin's or a web user's WAITING_APPROVAL job. Now ownership-checked.
    let job = null;
    try { job = getTelegramOwnedJob_(ref, userId); } catch (e) { job = null; }
    if (!job) {
      sendMessage_(chatId, '❌ Job review tidak ditemukan.');
      return;
    }

    if (job.STATUS !== 'WAITING_APPROVAL') {
      sendMessage_(chatId,
        'ℹ️ Job ini sudah tidak berada pada tahap approval/review. Status: <b>' +
        escapeHtml_(String(job.STATUS || '-')) + '</b>');
      return;
    }

    const d = job.DATA || {};
    const start = Number(d.startChapter || 0);
    const end = Number(d.endChapter || start || 0);
    if (!start || !end) {
      sendMessage_(chatId, '❌ Range chapter pada job ini tidak valid.');
      return;
    }

    const reviewCount = Number(d.reviewCount || 0) + 1;
    const nd = Object.assign({}, d, {
      reviewCount: reviewCount,
      reviewRequestedAt: isoNow_(),
      reviewRequestedBy: userId,
      reviewMode: 'ACTIVE_REREVIEW'
    });

    if (job.TYPE === 'GENERATE_BATCH') {
      updateJobFields_(job.JOB_ID, {
        STATUS:'QUEUED',
        STAGE:'REVIEW_BATCH',
        PROGRESS:88,
        LAST_ERROR:'',
        DATA_JSON:JSON.stringify(nd)
      });
    } else if (job.TYPE === 'REVIEW_ONLY') {
      updateJobFields_(job.JOB_ID, {
        STATUS:'QUEUED',
        STAGE:'REVIEW',
        PROGRESS:5,
        LAST_ERROR:'',
        DATA_JSON:JSON.stringify(nd)
      });
    } else {
      sendMessage_(chatId, '❌ Tipe job ini tidak mendukung review ulang: <code>' + escapeHtml_(job.TYPE) + '</code>');
      return;
    }

    updateNovelIndexFields_(job.NOVEL_ID, {ACTIVE_JOB_ID:job.JOB_ID});
    editMessage_(chatId, messageId, renderActiveRereviewProgress_(job.NOVEL_ID, start, end, reviewCount));
    return;
  }

  if (action === 'BATCH_ACCEPT') {
    // v5.1 fix: ownership-checked (see above).
    let source = null;
    try { source = getTelegramOwnedJob_(ref, userId); } catch (e) { source = null; }
    if (!source) return;
    // v5.1: atomic claim — double-tap cannot create two FINALIZE_BATCH jobs.
    try {
      source = claimWaitingJobById_(source.JOB_ID, 'APPROVED', 'ADMIN_APPROVED');
    } catch (e) {
      sendMessage_(chatId, 'ℹ️ Batch ini sudah tidak menunggu approval.');
      return;
    }
    const d = source.DATA || {};
    const fin = createJob_({
      novelId:source.NOVEL_ID, chatId:chatId, userId:userId,
      type:'FINALIZE_BATCH', stage:'CANONIZE', progress:5,
      status:'QUEUED', messageId:messageId,
      data:{sourceJobId:source.JOB_ID,startChapter:d.startChapter,endChapter:d.endChapter}
    });
    setSession_(userId, chatId, 'FINALIZING_BATCH', source.NOVEL_ID, {jobId:fin});
    editMessage_(chatId, messageId,
      '✅ <b>APPROVED BY ADMIN</b>\n\n' +
      '⏳ Menetapkan Chapter ' + d.startChapter + '–' + d.endChapter + ' sebagai CANON...\n' +
      '⬜ Update Story Memory\n⬜ Character State\n⬜ Timeline\n⬜ Plot Threads\n⬜ Foreshadowing');
    return;
  }

  if (action === 'BATCH_REWRITE') {
    // v5.1 fix: was raw getJob_(ref) — a Telegram callback could approve/reject
    // another admin's or a web user's WAITING_APPROVAL job. Now ownership-checked.
    let job = null;
    try { job = getTelegramOwnedJob_(ref, userId); } catch (e) { job = null; }
    if (!job) return;
    if (job.STATUS !== 'WAITING_APPROVAL') {
      sendMessage_(chatId, 'ℹ️ Batch ini sudah tidak menunggu approval.');
      return;
    }
    setSession_(userId, chatId, 'AWAIT_BATCH_REJECT_REASON', job.NOVEL_ID, {jobId:job.JOB_ID});
    sendMessage_(chatId,
      '♻️ <b>Rewrite Chapter</b>\n\n' +
      'Tulis alasan revisinya dengan bebas. Contoh:\n' +
      '“Chapter 3 terlalu cepat mempertemukan tokoh X. Dialog Chapter 4 terasa kaku. Pertahankan event utama tetapi perbaiki pacing.”');
    return;
  }

  // BATCH_REJECT dipertahankan sebagai alias untuk tombol lama yang sudah terlanjur
  // terkirim di Telegram. Keduanya hanya membuka konfirmasi, tidak langsung menghapus.
  if (action === 'BATCH_CANCEL' || action === 'BATCH_REJECT') {
    // v5.1 fix: was raw getJob_(ref) — a Telegram callback could approve/reject
    // another admin's or a web user's WAITING_APPROVAL job. Now ownership-checked.
    let job = null;
    try { job = getTelegramOwnedJob_(ref, userId); } catch (e) { job = null; }
    if (!job) return;
    if (job.STATUS !== 'WAITING_APPROVAL') {
      sendMessage_(chatId, 'ℹ️ Batch ini sudah tidak menunggu approval.');
      return;
    }
    const d = job.DATA || {};
    const start = Number(d.startChapter || 0);
    const end = Number(d.endChapter || start || 0);
    editMessage_(chatId, messageId,
      '🗑 <b>HAPUS / CANCEL CHAPTER?</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📚 Chapter ' + start + (end !== start ? ('–' + end) : '') + '\n\n' +
      'Draft/revisi dari job ini akan dibuang dari database dan dipindahkan ke Trash Drive.\n' +
      '✅ Chapter yang sudah CANON tidak akan dihapus.\n' +
      '✅ Bible dan Roadmap tidak akan berubah.\n\n' +
      '<b>Yakin ingin membatalkan pembuatan chapter ini?</b>', {
        inline_keyboard:[
          [{text:'🗑 YA, HAPUS DRAFT', callback_data:'BATCH_CANCEL_CONFIRM|' + job.JOB_ID}],
          [{text:'↩️ Kembali', callback_data:'BATCH_CANCEL_BACK|' + job.JOB_ID}]
        ]
      });
    return;
  }

  if (action === 'BATCH_CANCEL_BACK') {
    // v5.1 fix: was raw getJob_(ref) — a Telegram callback could approve/reject
    // another admin's or a web user's WAITING_APPROVAL job. Now ownership-checked.
    let job = null;
    try { job = getTelegramOwnedJob_(ref, userId); } catch (e) { job = null; }
    if (!job) return;
    if (job.STATUS !== 'WAITING_APPROVAL') {
      sendMessage_(chatId, 'ℹ️ Batch ini sudah tidak menunggu approval.');
      return;
    }
    const d = job.DATA || {};
    const review = getReviewForJob_(getNovelSheet_(job.NOVEL_ID), job.JOB_ID) || {};
    editMessage_(chatId, messageId,
      renderBatchReady_(job.NOVEL_ID, Number(d.startChapter), Number(d.endChapter), review),
      batchApprovalKeyboard_(job));
    return;
  }

  if (action === 'BATCH_CANCEL_CONFIRM') {
    // v5.1 fix: was raw getJob_(ref) — a Telegram callback could approve/reject
    // another admin's or a web user's WAITING_APPROVAL job. Now ownership-checked.
    let job = null;
    try { job = getTelegramOwnedJob_(ref, userId); } catch (e) { job = null; }
    if (!job) return;
    if (job.STATUS !== 'WAITING_APPROVAL') {
      sendMessage_(chatId, 'ℹ️ Batch ini sudah tidak menunggu approval.');
      return;
    }
    const result = cancelAndDeleteBatch_(job, userId);
    editMessage_(chatId, messageId,
      '🗑 <b>CHAPTER GENERATION CANCELLED</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📚 Chapter ' + result.startChapter + (result.endChapter !== result.startChapter ? ('–' + result.endChapter) : '') + '\n\n' +
      '✅ Job dibatalkan\n' +
      '🗑 File draft/revisi dibuang: ' + result.deletedFiles + '\n' +
      '🧹 Record draft dihapus: ' + result.deletedRecords + '\n' +
      (result.restoredRecords ? ('↩️ Versi sebelumnya dipulihkan: ' + result.restoredRecords + '\n') : '') +
      '🔒 Canon tetap aman\n\n' +
      'Untuk membuat ulang, gunakan <code>/write next</code> atau <code>/write ' +
      result.startChapter + (result.endChapter !== result.startChapter ? ('-' + result.endChapter) : '') + '</code>.');
    return;
  }

  if (action === 'BATCH_REGEN') {
    // v5.1 fix: ownership-checked (see above).
    let old = null;
    try { old = getTelegramOwnedJob_(ref, userId); } catch (e) { old = null; }
    if (!old) return;
    if (old.STATUS !== 'WAITING_APPROVAL') {
      sendMessage_(chatId, 'ℹ️ Batch ini sudah tidak menunggu approval.');
      return;
    }
    updateJobFields_(old.JOB_ID, {STATUS:'REJECTED', STAGE:'REGENERATE_REQUESTED'});
    const d = old.DATA || {};
    const newJob = createJob_({
      novelId:old.NOVEL_ID, chatId:chatId, userId:userId,
      type:'GENERATE_BATCH', stage:'GENERATE_CHAPTERS', progress:0,
      status:'QUEUED', messageId:messageId,
      data:{
        startChapter:d.startChapter,endChapter:d.endChapter,nextChapter:d.startChapter,
        mode:'revision',
        reason:'Regenerate the entire batch. Preserve canon, Bible, roadmap and required continuity, but rewrite the prose and execution from scratch.',
        sourceJobId:old.JOB_ID
      }
    });
    setSession_(userId, chatId, 'GENERATING_BATCH', old.NOVEL_ID, {jobId:newJob});
    editMessage_(chatId, messageId, renderBatchProgress_(d.startChapter,d.endChapter,d.startChapter,'Regenerating',2,'REGENERATE'));
    return;
  }

  if (action === 'REVIEW_OK') {
    // v5.1 fix: was raw getJob_(ref) — a Telegram callback could approve/reject
    // another admin's or a web user's WAITING_APPROVAL job. Now ownership-checked.
    let job = null;
    try { job = getTelegramOwnedJob_(ref, userId); } catch (e) { job = null; }
    if (!job) return;
    updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'REVIEW_ACCEPTED',PROGRESS:100});
    updateNovelIndexFields_(job.NOVEL_ID,{ACTIVE_JOB_ID:''});
    setSession_(userId,chatId,'IDLE',job.NOVEL_ID,{});
    editMessage_(chatId,messageId,
      '✅ <b>REVIEW CLOSED</b>\n\nChapter tetap dipertahankan seperti sekarang. Tidak ada perubahan Canon.');
    return;
  }

  if (action === 'NEXT_BATCH') {
    startNextBatch_(ref, chatId, userId, messageId);
    return;
  }
}

/* ========================================================================== */
/* MANUAL CHAPTER WORKFLOW                                                     */
/* ========================================================================== */

function sendWritingTools_(chatId, novelId) {
  if (!novelId) {
    sendMessage_(chatId, '📚 Pilih novel dulu dengan /novels lalu <code>/use NVL_xxxx</code>.');
    return;
  }
  const idx = getNovelIndex_(novelId);
  if (!idx) {
    sendMessage_(chatId, '❌ Novel aktif tidak ditemukan.');
    return;
  }
  const next = Number(idx.LATEST_CANON || 0) + 1;
  sendMessage_(chatId,
    '✍️ <b>CHAPTER WORKFLOW</b>\n\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
    '🆔 <code>' + idx.NOVEL_ID + '</code>\n' +
    '✅ Latest Canon: Chapter ' + Number(idx.LATEST_CANON || 0) + '\n' +
    '➡️ Next: Chapter ' + next + '\n\n' +
    '<b>Writer</b>\n' +
    '• <code>/write next</code>\n' +
    '• <code>/write 6</code>\n' +
    '• <code>/write 6-10</code>\n\n' +
    '<b>Reviewer</b>\n' +
    '• <code>/review 6</code>\n' +
    '• <code>/review 6-10</code>\n' +
    '• <code>/review 1-40</code>\n' +
    '• <code>/review all</code>\n\n' +
    '<b>Revision / Rewrite</b>\n' +
    '• <code>/rewrite 6</code>\n' +
    '• <code>/rewrite 6 dialog terlalu kaku dan pacing terlalu cepat</code>\n\n' +
    '<b>Inspect</b>\n' +
    '• <code>/chapter 6</code>\n\n' +
    '<b>Novel Intelligence</b>\n' +
    '• <code>/translate 1-50 id</code> — Google Translate\n' +
    '• <code>/health</code>\n' +
    '• <code>/style</code>\n' +
    '• <code>/ai</code> — Multi-AI Router\n\n' +
    'Setiap WRITE dan REWRITE membaca Bible, Roadmap, Protected Canon, Novel Memory, Style Lock, ringkasan canon sebelumnya, serta 3 chapter penuh terakhir.');
}

function startManualWriteCommand_(chatId, userId, session, arg) {
  const novelId = session.activeNovelId || '';
  if (!novelId) {
    sendMessage_(chatId, '📚 Pilih novel dulu: /novels lalu <code>/use NVL_xxxx</code>.');
    return;
  }
  const idx = getNovelIndex_(novelId);
  if (!idx) { sendMessage_(chatId, '❌ Novel aktif tidak ditemukan.'); return; }

  const latestCanon = Number(idx.LATEST_CANON || 0);
  const next = latestCanon + 1;
  const range = parseChapterRangeArg_(arg || 'next', next);
  if (!range) {
    sendMessage_(chatId, 'Format: <code>/write next</code>, <code>/write 6</code>, atau <code>/write 6-10</code>.');
    return;
  }

  const start = range.start, end = range.end;
  const target = Number(idx.TARGET_CHAPTERS || 0);
  if (start !== next) {
    sendMessage_(chatId,
      '🛡️ <b>Continuity Guard</b>\n\n' +
      'Chapter baru harus ditulis berurutan dari canon terakhir.\n' +
      'Latest Canon: <b>' + latestCanon + '</b>\n' +
      'Chapter berikutnya: <b>' + next + '</b>\n\n' +
      'Gunakan <code>/write ' + next + '</code> atau <code>/write ' + next + '-' + (next + defaultBatchSize_() - 1) + '</code>.');
    return;
  }
  if (target && end > target) {
    sendMessage_(chatId, '❌ Target novel hanya sampai Chapter ' + target + '.');
    return;
  }

  const sh = getNovelSheet_(novelId);
  for (let n=start; n<=end; n++) {
    if (!getNovelRecordData_(sh, 'ROADMAP_CHAPTER', chapterKey_(n))) {
      sendMessage_(chatId, '❌ ROADMAP_CHAPTER untuk Chapter ' + n + ' belum ada. Import/perbaiki roadmap dulu.');
      return;
    }
  }

  const msgId = sendMessage_(chatId, renderBatchProgress_(start,end,start,'Preparing authoritative context',2,start===1?'TEST WRITING':'WRITING'));
  const jobId = createJob_({
    novelId:novelId, chatId:chatId, userId:userId,
    type:'GENERATE_BATCH', stage:'GENERATE_CHAPTERS', progress:0,
    status:'QUEUED', messageId:msgId,
    data:{
      startChapter:start,endChapter:end,nextChapter:start,mode:'draft',
      reason:'Manual chapter generation requested by admin. Follow Bible, roadmap and continuity exactly.',
      source:'TELEGRAM_MANUAL'
    }
  });
  setSession_(userId, chatId, 'GENERATING_BATCH', novelId, {jobId:jobId});
}

function startManualReviewCommand_(chatId, userId, session, arg) {
  const novelId = session.activeNovelId || '';
  if (!novelId) {
    sendMessage_(chatId, '📚 Pilih novel dulu: /novels lalu <code>/use NVL_xxxx</code>.');
    return;
  }
  const sh = getNovelSheet_(novelId);
  const latest = detectCurrentChapterFromSheet_(sh);
  if (!latest) {
    sendMessage_(chatId, '❌ Belum ada chapter untuk direview.');
    return;
  }

  const range = parseReviewRangeArg_(arg || String(latest), latest);
  if (!range) {
    sendMessage_(chatId,
      'Format review:\n' +
      '• <code>/review 6</code>\n' +
      '• <code>/review 6-10</code>\n' +
      '• <code>/review 1-40</code>\n' +
      '• <code>/review all</code>');
    return;
  }
  if (range.end > latest) {
    sendMessage_(chatId,
      '❌ Chapter terakhir yang tersedia adalah <b>' + latest + '</b>.\n' +
      'Range yang diminta: <code>' + range.start + '-' + range.end + '</code>.');
    return;
  }

  // Refresh Drive → DB links for manually imported canon. This lets older imported
  // projects use /review immediately even if they were scanned before the FILE_ID fix.
  try {
    const folders = getNovelRecordData_(sh,'META','FOLDERS') || {};
    if (folders['05_CANON']) importManualCanonMemoryContinuity_(sh, folders);
  } catch (_) {}

  const missing = [];
  for (let n=range.start; n<=range.end; n++) {
    const r = getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
    if (!r || !r.FILE_ID) missing.push(n);
  }
  if (missing.length) {
    sendMessage_(chatId,
      '❌ Ada chapter yang belum mempunyai file draft/revised/canon:\n' +
      '<code>' + missing.slice(0,25).join(', ') + (missing.length>25?' ...':'') + '</code>\n\n' +
      'Jalankan <code>/scan</code> bila chapter tersebut berasal dari folder Drive manual.');
    return;
  }

  const count = range.end - range.start + 1;
  const chunkSize = reviewChunkSize_();
  const chunks = Math.ceil(count / chunkSize);
  const msgId = sendMessage_(chatId,
    '🔍 <b>LONG-RANGE AI REVIEW</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📚 Chapter <b>' + range.start + (range.end!==range.start?'–'+range.end:'') + '</b> (' + count + ' chapter)\n' +
    '🧩 Review chunks: <b>' + chunks + '</b> × maksimal ' + chunkSize + ' chapter\n\n' +
    'AI akan mengecek setiap bagian terhadap:\n' +
    '• Bible & Protected Canon\n' +
    '• Roadmap per chapter\n' +
    '• Chapter/canon sebelumnya\n' +
    '• Character state & knowledge\n' +
    '• Timeline & plot threads\n' +
    '• Pacing, repetition & prose\n\n' +
    'Setelah semua chunk selesai, AI membuat <b>cross-chapter final review</b> untuk seluruh range.');
  const jobId = createJob_({
    novelId:novelId, chatId:chatId, userId:userId,
    type:'REVIEW_ONLY', stage:'REVIEW', progress:3,
    status:'QUEUED', messageId:msgId,
    data:{startChapter:range.start,endChapter:range.end,source:'TELEGRAM_MANUAL',reviewChunkSize:chunkSize}
  });
  setSession_(userId, chatId, 'REVIEWING_BATCH', novelId, {jobId:jobId});
}

function startManualRewriteCommand_(chatId, userId, session, arg) {
  const novelId = session.activeNovelId || '';
  if (!novelId) {
    sendMessage_(chatId, '📚 Pilih novel dulu: /novels lalu <code>/use NVL_xxxx</code>.');
    return;
  }
  const m = String(arg || '').match(/^\s*(\d{1,4})(?:\s+([\s\S]+))?$/);
  if (!m) {
    sendMessage_(chatId,
      'Format:\n<code>/rewrite 6</code>\natau\n<code>/rewrite 6 dialog terlalu kaku, pertahankan event roadmap</code>');
    return;
  }
  const chapterNo = Number(m[1]);
  const reason = String(m[2] || '').trim();
  const sh = getNovelSheet_(novelId);
  const row = getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(chapterNo));
  if (!row || !row.FILE_ID) {
    sendMessage_(chatId, '❌ Chapter ' + chapterNo + ' belum mempunyai file untuk direvisi.');
    return;
  }
  if (!getNovelRecordData_(sh,'ROADMAP_CHAPTER',chapterKey_(chapterNo))) {
    sendMessage_(chatId, '❌ Roadmap Chapter ' + chapterNo + ' belum tersedia. Rewrite diblokir agar cerita tidak melenceng.');
    return;
  }

  if (!reason) {
    setSession_(userId, chatId, 'AWAIT_MANUAL_REWRITE_REASON', novelId, {novelId:novelId,chapterNo:chapterNo});
    sendMessage_(chatId,
      '♻️ <b>REWRITE CHAPTER ' + chapterNo + '</b>\n\n' +
      'Kirim alasan revisinya dengan bahasa biasa.\n\n' +
      'Contoh:\n<i>“Pertahankan seluruh event roadmap, tapi pacing terlalu cepat. Hubungan Irelia dengan keluarganya harus terasa lebih hangat sebelum konflik.”</i>\n\n' +
      'Sebelum rewrite, bot tetap akan membaca Bible + Roadmap + Canon + chapter sebelumnya.');
    return;
  }
  startManualRewriteJob_(chatId,userId,novelId,chapterNo,reason);
}

function startManualRewriteJob_(chatId,userId,novelId,chapterNo,reason) {
  const msgId = sendMessage_(chatId,
    '♻️ <b>REWRITE CHAPTER ' + chapterNo + '</b>\n\n' +
    '✅ Target chapter ditemukan\n' +
    '⏳ Loading Bible & Protected Canon\n' +
    '⏳ Loading Roadmap Chapter ' + chapterNo + '\n' +
    '⏳ Checking previous canon & chapters\n' +
    '⬜ Rewrite\n⬜ Review ulang\n\n' +
    '📝 ' + escapeHtml_(truncate_(reason,900)));
  const jobId = createJob_({
    novelId:novelId, chatId:chatId, userId:userId,
    type:'GENERATE_BATCH', stage:'GENERATE_CHAPTERS', progress:0,
    status:'QUEUED', messageId:msgId,
    data:{
      startChapter:chapterNo,endChapter:chapterNo,nextChapter:chapterNo,
      mode:'revision',reason:reason,source:'TELEGRAM_MANUAL_REWRITE'
    }
  });
  setSession_(userId, chatId, 'GENERATING_BATCH', novelId, {jobId:jobId});
  return jobId;
}

function sendChapterInfo_(chatId, novelId, arg) {
  if (!novelId) {
    sendMessage_(chatId, '📚 Pilih novel dulu dengan /use.');
    return;
  }
  const n = Number(String(arg || '').trim());
  if (!n) {
    sendMessage_(chatId, 'Gunakan <code>/chapter 6</code>.');
    return;
  }
  const sh = getNovelSheet_(novelId);
  const r = getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
  if (!r || !r.FILE_ID) {
    sendMessage_(chatId, '❌ Chapter ' + n + ' belum ditemukan.');
    return;
  }
  const plan = getNovelRecordData_(sh,'ROADMAP_CHAPTER',chapterKey_(n)) || {};
  const url = DriveApp.getFileById(String(r.FILE_ID)).getUrl();
  sendMessage_(chatId,
    '📖 <b>CHAPTER ' + n + '</b>\n\n' +
    'Title: <b>' + escapeHtml_(r.TITLE || plan.title || ('Chapter '+n)) + '</b>\n' +
    'Status: <b>' + escapeHtml_(r.STATUS || '-') + '</b>\n' +
    'Version: ' + Number(r.VERSION || 1) + '\n\n' +
    '🗺 Roadmap goal:\n' + escapeHtml_(truncate_(String(plan.goal || plan.summary || plan.description || '-'),700)) + '\n\n' +
    '📝 Summary:\n' + escapeHtml_(truncate_(String((r.DATA && r.DATA.summary) || '-'),1000)),
    {inline_keyboard:[[{text:'📄 Buka File Chapter',url:url}]]});
}

function parseChapterRangeArg_(arg, defaultChapter) {
  const s = String(arg || '').trim().toLowerCase();
  if (!s || s === 'next') return {start:Number(defaultChapter),end:Number(defaultChapter)};
  let m = s.match(/^(\d{1,4})$/);
  if (m) return {start:Number(m[1]),end:Number(m[1])};
  m = s.match(/^(\d{1,4})\s*[–—-]\s*(\d{1,4})$/);
  if (!m) return null;
  const a=Number(m[1]), b=Number(m[2]);
  if (!a || !b || b<a || b-a>19) return null;
  return {start:a,end:b};
}


/** Review has its own larger range parser. /write keeps the safer 20-chapter limit. */
function parseReviewRangeArg_(arg, latestChapter) {
  const s = String(arg || '').trim().toLowerCase();
  const latest = Number(latestChapter || 0);
  if (!latest) return null;
  if (!s || s === 'latest' || s === 'last') return {start:latest,end:latest};
  if (s === 'all') return {start:1,end:latest};

  let m = s.match(/^(\d{1,4})$/);
  if (m) {
    const n = Number(m[1]);
    return n > 0 ? {start:n,end:n} : null;
  }

  m = s.match(/^(\d{1,4})\s*[–—-]\s*(\d{1,4})$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  const maxRange = Math.max(1, Math.min(500, Number(prop_('REVIEW_MAX_RANGE') || 120)));
  if (!a || !b || b < a || (b-a+1) > maxRange) return null;
  return {start:a,end:b};
}

function reviewChunkSize_() {
  return Math.max(3, Math.min(15, Number(prop_('REVIEW_CHUNK_SIZE') || 10)));
}

/* ========================================================================== */
/* JOB WORKER                                                                  */
/* ========================================================================== */

function processSmartNovelForgeJobs() {
  ensureCentralDb_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return;

  const started = Date.now();
  try {
    pruneLogs_(); // v5.1: at most once per day (guarded by cache inside).
    while (Date.now() - started < 230000) {
      // v5.1: never let scheduler errors kill the whole run.
      let job = null;
      try {
        job = getNextRunnableJob_();
      } catch (err) {
        log_('ERROR','processSmartNovelForgeJobs','getNextRunnableJob_ gagal: '+String(err&&err.message||err),{});
        break;
      }
      if (!job) break;
      try {
        processOneJobStep_(job);
      } catch (err) {
        const freshJob = getJob_(job.JOB_ID) || job;

        // Long /write jobs automatically retry transient failures from the
        // latest checkpoint instead of immediately becoming ERROR.
        if (scheduleAutoRetryForJob_(freshJob, err)) {
          break;
        }

        const msg = String(err && err.stack || err);
        updateJobFields_(job.JOB_ID, {STATUS:'ERROR', LAST_ERROR:truncate_(msg, 4000)});
        log_('ERROR', 'job:' + job.JOB_ID, msg, freshJob.DATA || {});
        try {
          editMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
            '❌ <b>Job Error</b>\n\n' + escapeHtml_(truncate_(String(err.message || err), 2800)) +
            '\n\nJob: <code>' + job.JOB_ID + '</code>' +
            '\n\nAuto retry sudah habis atau error ini tidak aman untuk di-retry otomatis.');
        } catch (_) {}
        break;
      }

      Utilities.sleep(250);
    }
  } finally {
    lock.releaseLock();
  }
}


function autoRetryEnabled_() {
  const raw = String(prop_('AUTO_RETRY_ENABLED') || 'true').trim().toLowerCase();
  return ['0','false','off','no'].indexOf(raw) < 0;
}

function autoRetryMax_() {
  return Math.max(1, Math.min(10, Number(prop_('AUTO_RETRY_MAX') || 4)));
}

function autoRetryMinWriteRange_() {
  return Math.max(1, Math.min(1000, Number(prop_('AUTO_RETRY_MIN_WRITE_RANGE') || 5)));
}

function autoRetryBaseDelaySeconds_() {
  return Math.max(15, Math.min(600, Number(prop_('AUTO_RETRY_BASE_DELAY_SECONDS') || 45)));
}

function autoRetryStepKey_(job) {
  const d = job.DATA || safeJson_(job.DATA_JSON, {});
  return [
    String(job.STAGE || ''),
    String(d.nextChapter || ''),
    String(d.startChapter || ''),
    String(d.endChapter || ''),
    String(d.mode || '')
  ].join('|');
}

function autoRetryRangeSize_(job) {
  const d = job.DATA || safeJson_(job.DATA_JSON, {});
  const start = Number(d.startChapter || 0);
  const end = Number(d.endChapter || 0);
  if (!start || !end || end < start) return 0;
  return end - start + 1;
}

function isAutoRetrySafeError_(err) {
  const msg = String(err && err.stack || err || '');

  // Configuration / author-data problems should not be hammered repeatedly.
  if (/GEMINI_API_KEY belum diset|OPENROUTER_API_KEY belum diset|GROQ_API_KEY belum diset|AGNES_API_KEY belum diset|Script Property wajib|Novel sheet tidak ditemukan|Novel tidak ditemukan|ROADMAP_CHAPTER .*belum ada|Folder .* tidak ditemukan|Target novel hanya sampai|Roadmap kosong|permission denied|forbidden|unauthorized|invalid api key|HTTP 401|HTTP 403/i.test(msg)) {
    return false;
  }

  // Known transient / model-format issues are always retryable.
  if (/Gemini|JSON parse gagal|JSON invalid|bukan JSON valid|Unexpected end|Unexpected token|429|rate.?limit|quota|HTTP 5\d\d|timeout|timed out|temporary|temporarily|Service invoked too many times|Internal error|response.*incomplete|terpotong|fetch|network|socket/i.test(msg)) {
    return true;
  }

  // For GENERATE_BATCH we still allow bounded retry for unknown runtime
  // failures because every write step has a checkpoint and retry is capped.
  return true;
}

function autoRetryDelaySeconds_(err, attempt) {
  const msg = String(err && err.message || err || '');
  const base = autoRetryBaseDelaySeconds_();

  let seconds = base * Math.pow(2, Math.max(0, Number(attempt || 1) - 1));

  // Rate-limit / quota errors need more breathing room than malformed output.
  if (/429|rate.?limit|quota/i.test(msg)) {
    seconds = Math.max(300, seconds * 4);
  }

  return Math.min(1800, Math.round(seconds));
}

/**
 * Requeue a long GENERATE_BATCH job from its existing checkpoint.
 *
 * Auto retry is intentionally limited to /write-style GENERATE_BATCH jobs
 * with a requested range >= AUTO_RETRY_MIN_WRITE_RANGE (default 5).
 *
 * Retry count is tracked PER CHECKPOINT. If Chapter 42 fails twice but later
 * succeeds, Chapter 43 starts again with retry attempt 0.
 */
function scheduleAutoRetryForJob_(job, err) {
  if (!autoRetryEnabled_()) return false;
  if (!job || String(job.TYPE || '') !== 'GENERATE_BATCH') return false;

  const rangeSize = autoRetryRangeSize_(job);
  if (rangeSize < autoRetryMinWriteRange_()) return false;
  if (!isAutoRetrySafeError_(err)) return false;

  const fresh = getJob_(job.JOB_ID) || job;
  const data = fresh.DATA || safeJson_(fresh.DATA_JSON, {});
  const key = autoRetryStepKey_(fresh);
  const max = autoRetryMax_();

  const previousKey = String(data._autoRetryKey || '');
  const previousCount = previousKey === key ? Number(data._autoRetryCount || 0) : 0;
  const attempt = previousCount + 1;

  const msg = String(err && err.stack || err || '');
  const shortError = truncate_(String(err && err.message || err || 'Unknown error'), 1200);

  // Record exhaustion before allowing the normal worker error handler to mark ERROR.
  if (attempt > max) {
    const exhaustedData = Object.assign({}, data, {
      _autoRetryKey:key,
      _autoRetryCount:max,
      _autoRetryMax:max,
      _autoRetryExhausted:true,
      _lastAutoRetryAt:isoNow_(),
      _lastAutoRetryError:shortError,
      _nextRetryAtMs:0,
      _nextRetryAt:''
    });

    updateJobFields_(fresh.JOB_ID, {
      DATA_JSON:JSON.stringify(exhaustedData)
    });

    log_('ERROR', 'auto-retry-exhausted:' + fresh.JOB_ID,
      'Auto retry exhausted at the same checkpoint.',
      {
        stage:fresh.STAGE || '',
        progress:Number(fresh.PROGRESS || 0),
        attempt:max,
        rangeSize:rangeSize,
        error:shortError
      }
    );
    return false;
  }

  const delaySeconds = autoRetryDelaySeconds_(err, attempt);
  const nextMs = Date.now() + (delaySeconds * 1000);
  const nextIso = new Date(nextMs).toISOString();

  const nextData = Object.assign({}, data, {
    _autoRetryKey:key,
    _autoRetryCount:attempt,
    _autoRetryMax:max,
    _autoRetryExhausted:false,
    _lastAutoRetryAt:isoNow_(),
    _lastAutoRetryError:shortError,
    _nextRetryAtMs:nextMs,
    _nextRetryAt:nextIso
  });

  updateJobFields_(fresh.JOB_ID, {
    STATUS:'QUEUED',
    LAST_ERROR:'',
    DATA_JSON:JSON.stringify(nextData)
  });

  log_('WARN', 'auto-retry:' + fresh.JOB_ID,
    'Generate batch automatically requeued from checkpoint.',
    {
      stage:fresh.STAGE || '',
      progress:Number(fresh.PROGRESS || 0),
      attempt:attempt,
      max:max,
      delaySeconds:delaySeconds,
      nextRetryAt:nextIso,
      rangeSize:rangeSize,
      error:shortError
    }
  );

  try {
    const d = nextData;
    const target =
      Number(d.startChapter || 0)
        ? ('Chapter ' + Number(d.startChapter) +
          (Number(d.endChapter || 0) !== Number(d.startChapter || 0)
            ? '–' + Number(d.endChapter || 0)
            : ''))
        : '-';

    editMessage_(fresh.CHAT_ID, Number(fresh.MESSAGE_ID),
      '🔁 <b>AUTO RETRY</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📖 Job: <code>' + escapeHtml_(fresh.JOB_ID) + '</code>\n' +
      '✍️ Target: <b>' + escapeHtml_(target) + '</b>\n' +
      '📍 Stage: <b>' + escapeHtml_(String(fresh.STAGE || '-').replace(/_/g,' ')) + '</b>\n' +
      '📊 Progress: <b>' + Number(fresh.PROGRESS || 0) + '%</b>\n\n' +
      '🔄 Retry otomatis: <b>' + attempt + ' / ' + max + '</b>\n' +
      '⏳ Coba lagi sekitar <b>' + Math.max(1, Math.ceil(delaySeconds / 60)) + ' menit</b>\n\n' +
      '⚠️ ' + escapeHtml_(truncate_(shortError, 900)) + '\n\n' +
      '<i>Tidak perlu menekan Retry. Job akan melanjutkan dari checkpoint terakhir.</i>'
    );
  } catch (_) {}

  return true;
}

function processOneJobStep_(job) {
  if (job.TYPE === 'DRIVE_SCAN') return jobDriveScan_(job);
  if (job.TYPE === 'BLUEPRINT_EXTRACT') return jobBlueprintExtract_(job);
  if (job.TYPE === 'BLUEPRINT_RANDOM') return jobBlueprintRandom_(job);
  if (job.TYPE === 'BLUEPRINT_UPDATE') return jobBlueprintUpdate_(job);
  if (job.TYPE === 'FOUNDATION') return jobFoundation_(job);
  if (job.TYPE === 'GENERATE_BATCH') return jobGenerateBatch_(job);
  if (job.TYPE === 'REVIEW_ONLY') return jobReviewOnly_(job);
  if (job.TYPE === 'FINALIZE_BATCH') return jobFinalizeBatch_(job);
  if (job.TYPE === 'TRANSLATE_BATCH') return jobTranslateBatch_(job);
  if (job.TYPE === 'CANON_HEALTH') return jobCanonHealth_(job);
  if (job.TYPE === 'STYLE_ANALYZE') return jobStyleAnalyze_(job);
  if (job.TYPE === 'VISUAL_BIBLE') return jobVisualBible_(job);
  if (job.TYPE === 'ART_GENERATE') return jobArtGenerate_(job);
  if (job.TYPE === 'AUTO_PRODUCTION') return jobAutoProduction_(job);
  if (job.TYPE === 'LORE_BUILD') return jobLoreBuild_(job);
  if (job.TYPE === 'ANALYTICS_BACKFILL') return jobAnalyticsBackfill_(job);
  if (job.TYPE === 'PUBLICATION_METADATA') return jobPublicationMetadata_(job);
  if (job.TYPE === 'REROADMAP') return jobReRoadmap_(job);
  throw new Error('Unknown job type: ' + job.TYPE);
}

/**
 * Asynchronous Drive scanner. One admin novel is imported/synced per job step,
 * so /scan returns immediately and Telegram's webhook never waits for a full Drive scan.
 * Scan mode also avoids expensive Gemini normalization; explicit /roadmap selection can
 * normalize a raw roadmap later when needed.
 */
function jobDriveScan_(job) {
  const data = job.DATA || {};

  if (job.STAGE === 'DISCOVER') {
    const root = ensureRootFolder_();
    const adminRoot = getOrCreateChildFolder_(root, 'ADMIN');
    const folders = [];
    const it = adminRoot.getFolders();
    while (it.hasNext()) {
      const f = it.next();
      folders.push({id:f.getId(), name:f.getName()});
    }
    folders.sort(function(a,b){ return String(a.name).localeCompare(String(b.name)); });

    const nextData = {nextIndex:0, folders:folders, results:[]};
    if (!folders.length) {
      const result = {
        ok:true, rootFolderId:root.getId(), adminScanned:0,
        importedOrSynced:0, errors:0, needsRoadmapSelection:0,
        admin:[], publicFolders:[], orphanPublicFolders:0
      };
      updateJobFields_(job.JOB_ID, {
        STATUS:'DONE', STAGE:'DONE', PROGRESS:100,
        DATA_JSON:JSON.stringify(Object.assign(nextData,{result:result}))
      });
      safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderNovelScanReport_(result));
      return;
    }

    updateJobFields_(job.JOB_ID, {
      STATUS:'RUNNING', STAGE:'IMPORT_ONE', PROGRESS:5,
      DATA_JSON:JSON.stringify(nextData)
    });
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
      '🔄 <b>NOVEL DRIVE SCAN</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📂 Ditemukan: <b>' + folders.length + '</b> folder di <code>NOVEL/ADMIN</code>\n' +
      '⏳ Menyiapkan sinkronisasi...');
    return;
  }

  if (job.STAGE === 'IMPORT_ONE') {
    const folders = Array.isArray(data.folders) ? data.folders : [];
    const results = Array.isArray(data.results) ? data.results : [];
    const i = Math.max(0, Number(data.nextIndex || 0));

    if (i >= folders.length) {
      const result = buildDriveScanSummary_(results);
      updateJobFields_(job.JOB_ID, {
        STATUS:'DONE', STAGE:'DONE', PROGRESS:100,
        DATA_JSON:JSON.stringify(Object.assign({},data,{result:result}))
      });
      safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderNovelScanReport_(result));
      return;
    }

    const item = folders[i];
    const pct = Math.max(6, Math.min(95, Math.round((i / Math.max(1,folders.length)) * 90) + 5));
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
      '🔄 <b>NOVEL DRIVE SCAN</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📂 Folder <b>' + (i + 1) + '/' + folders.length + '</b>\n' +
      '📖 ' + escapeHtml_(item.name) + '\n' +
      '⏳ Membaca metadata, Bible, roadmap, canon, dan memory...\n\n' +
      '<i>Scan tidak memanggil Gemini otomatis.</i>');

    try {
      const r = importAdminNovelFromDrive(item.id, {deferAi:true, scanMode:true});
      results.push(Object.assign({path:'NOVEL/ADMIN/' + item.name}, r));
    } catch (err) {
      results.push({
        ok:false,
        path:'NOVEL/ADMIN/' + item.name,
        folderId:item.id,
        error:String(err && err.message || err)
      });
    }

    const nextIndex = i + 1;
    const nextProgress = Math.max(pct, Math.min(96, Math.round((nextIndex / Math.max(1,folders.length)) * 90) + 5));
    updateJobFields_(job.JOB_ID, {
      STATUS:'RUNNING', STAGE:'IMPORT_ONE', PROGRESS:nextProgress,
      DATA_JSON:JSON.stringify({nextIndex:nextIndex,folders:folders,results:results})
    });
    return;
  }

  throw new Error('Unknown DRIVE_SCAN stage: ' + job.STAGE);
}

function buildDriveScanSummary_(results) {
  results = Array.isArray(results) ? results : [];
  return {
    ok:true,
    rootFolderId:prop_('ROOT_FOLDER_ID') || '',
    adminScanned:results.length,
    importedOrSynced:results.filter(function(x){return x.ok;}).length,
    errors:results.filter(function(x){return !x.ok;}).length,
    needsRoadmapSelection:results.filter(function(x){
      return x.ok && (x.status === 'IMPORTED_NEEDS_ROADMAP' ||
        (x.roadmap && (x.roadmap.reason === 'MULTIPLE_ROADMAPS' || x.roadmap.reason === 'ROADMAP_NEEDS_NORMALIZATION')));
    }).length,
    admin:results,
    publicFolders:[],
    orphanPublicFolders:0
  };
}

function jobBlueprintExtract_(job) {
  updateJobFields_(job.JOB_ID, {STATUS:'RUNNING', PROGRESS:20});
  safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
    '🧠 <b>Membaca ide novelmu...</b>\n\n' +
    '✅ Premis diterima\n⏳ Mendeteksi genre, karakter, pacing, target, dan aturan cerita...');

  const bp = geminiJson_(promptExtractBlueprint_(job.DATA.idea));
  normalizeBlueprint_(bp);

  if(jobChannel_(job)==='TELEGRAM') setSession_(job.USER_ID, job.CHAT_ID, 'BLUEPRINT_REVIEW', '', {blueprint:bp, idea:job.DATA.idea});
  updateJobFields_(job.JOB_ID, {STATUS:'DONE', STAGE:'READY', PROGRESS:100, DATA_JSON:JSON.stringify({blueprint:bp})});

  safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderBlueprint_(bp), keyboard_([
    [{text:'✅ Build Novel', callback_data:'BP_BUILD'}],
    [{text:'✏️ Edit Blueprint', callback_data:'BP_EDIT'}, {text:'🧠 AI Improve', callback_data:'BP_IMPROVE'}],
    [{text:'❌ Cancel', callback_data:'SESSION_CANCEL'}]
  ]));
}

function jobBlueprintRandom_(job) {
  updateJobFields_(job.JOB_ID, {STATUS:'RUNNING', PROGRESS:20});
  safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), '🎲 <b>Menciptakan konsep novel...</b>');

  const bp = geminiJson_(
    'Create an original commercially sustainable long-form novel concept. Avoid generic names and overused premises. ' +
    'Return ONLY valid JSON matching this schema: ' + blueprintSchemaText_() +
    '\nMake it distinctive, emotionally engaging, expandable for a long novel, and internally coherent.' +
    (job.DATA && job.DATA.preferences ? '\nCREATOR PREFERENCES: '+JSON.stringify(job.DATA.preferences) : '')
  );
  normalizeBlueprint_(bp);
  if(jobChannel_(job)==='TELEGRAM') setSession_(job.USER_ID, job.CHAT_ID, 'BLUEPRINT_REVIEW', '', {blueprint:bp});
  updateJobFields_(job.JOB_ID, {STATUS:'DONE', STAGE:'READY', PROGRESS:100, DATA_JSON:JSON.stringify({blueprint:bp})});
  safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderBlueprint_(bp), keyboard_([
    [{text:'✅ Build Novel', callback_data:'BP_BUILD'}],
    [{text:'✏️ Edit Blueprint', callback_data:'BP_EDIT'}, {text:'🧠 AI Improve', callback_data:'BP_IMPROVE'}],
    [{text:'🎲 Generate Again', callback_data:'IDEA_RANDOM'}, {text:'❌ Cancel', callback_data:'SESSION_CANCEL'}]
  ]));
}

function jobBlueprintUpdate_(job) {
  updateJobFields_(job.JOB_ID, {STATUS:'RUNNING', PROGRESS:30});
  const bp = geminiJson_(promptUpdateBlueprint_(job.DATA.blueprint || {}, job.DATA.instruction || ''));
  normalizeBlueprint_(bp);
  if(jobChannel_(job)==='TELEGRAM') setSession_(job.USER_ID, job.CHAT_ID, 'BLUEPRINT_REVIEW', '', {blueprint:bp});
  updateJobFields_(job.JOB_ID, {STATUS:'DONE', STAGE:'READY', PROGRESS:100, DATA_JSON:JSON.stringify({blueprint:bp})});
  safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderBlueprint_(bp), keyboard_([
    [{text:'✅ Build Novel', callback_data:'BP_BUILD'}],
    [{text:'✏️ Edit Lagi', callback_data:'BP_EDIT'}, {text:'🧠 AI Improve', callback_data:'BP_IMPROVE'}],
    [{text:'❌ Cancel', callback_data:'SESSION_CANCEL'}]
  ]));
}

function jobFoundation_(job) {
  const d = job.DATA || {};
  const mode = d.mode || 'create';

  if (job.STAGE === 'CREATE_WORKSPACE') {
    const bp = d.blueprint || {};
    const sourceKind = String(d.source || '').toUpperCase();
    const isWeb = sourceKind === 'WEB' || sourceKind === 'WEB_USER';
    const novelId = job.NOVEL_ID || d.requestedNovelId || (isWeb ? randomNovelId_() : nextNovelId_());
    const ownerId = isWeb ? String(d.ownerId || job.OWNER_ID || job.USER_ID || '') : String(d.ownerId || ('TG_' + job.USER_ID));
    if (isWeb && !/^WUSR_[A-Z0-9]+$/.test(ownerId)) throw new Error('Web owner tidak valid.');
    const workspace = createNovelWorkspace_(novelId, bp, isWeb ? ownerId : '');

    upsertNovelIndex_({
      NOVEL_ID:novelId,
      TITLE:bp.title,
      SHEET_NAME:novelId,
      FOLDER_ID:workspace.rootId,
      STATUS:'BUILDING',
      CURRENT_CHAPTER:0,
      LATEST_CANON:0,
      LANGUAGE:bp.language || 'English',
      GENRE:(bp.genres || []).join(', '),
      TARGET_CHAPTERS:Number(bp.targetChapters || 120),
      CREATED_AT:isoNow_(),
      UPDATED_AT:isoNow_(),
      ACTIVE_JOB_ID:job.JOB_ID,
      OWNER_ID:ownerId,
      OWNER_TYPE:isWeb ? 'WEB_USER' : 'TELEGRAM_ADMIN',
      SOURCE:isWeb ? 'WEB' : 'TELEGRAM',
      DB_ID:isWeb ? ensureWebUserDb_(ownerId).getId() : getCentralDbId_()
    });

    const sh = getNovelSheet_(novelId);
    upsertNovelRecord_(sh, 'BLUEPRINT', 'MASTER', '', '', bp.title, bp, 'DRAFT', '', workspace.blueprintFileId);
    upsertNovelRecord_(sh, 'META', 'FOLDERS', '', '', '', workspace.folders, 'SYSTEM', 1, '');

    const nd = Object.assign({}, d, {folders:workspace.folders, blueprint:bp, nextPlanStart:1});
    updateJobFields_(job.JOB_ID, {
      NOVEL_ID:novelId, STAGE:'GENERATE_BIBLE', PROGRESS:10, STATUS:'RUNNING', DATA_JSON:JSON.stringify(nd)
    });

    // Telegram sessions are only used by Telegram-owned jobs.
    if (!isWeb && job.CHAT_ID) {
      setSession_(job.USER_ID, job.CHAT_ID, 'BUILDING_FOUNDATION', novelId, {jobId:job.JOB_ID});
      safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderFoundationProgress_('Workspace ready • Building Novel Bible', 10, bp.title));
    }
    // IMPORTANT: Web-user novel titles, IDs and folders are never pushed to Telegram admins.
    return;
  }

  const novelId = job.NOVEL_ID;
  const sh = getNovelSheet_(novelId);
  const blueprint = getNovelRecordData_(sh, 'BLUEPRINT', 'MASTER') || d.blueprint || {};
  const folders = getNovelRecordData_(sh, 'META', 'FOLDERS') || d.folders || {};

  if (job.STAGE === 'GENERATE_BIBLE') {
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderFoundationProgress_(
      mode === 'revise' ? 'Revising Novel Bible' : 'Building Novel Bible', 18, blueprint.title));

    let oldBible = mode === 'revise' ? (getNovelRecordData_(sh, 'BIBLE', 'MASTER') || {}) : {};
    const bible = geminiJson_(promptGenerateBible_(blueprint, oldBible, d.reason || ''));
    const ver = nextRecordVersion_(sh, 'BIBLE', 'MASTER');
    const file = upsertVersionedJson_(folders['01_BIBLE'], 'novel_bible', ver, bible);
    upsertNovelRecord_(sh, 'BIBLE', 'MASTER', '', '', blueprint.title, bible, 'DRAFT', ver, file.getId());
    syncBibleRecords_(sh, bible, ver);

    updateJobFields_(job.JOB_ID, {STAGE:'GENERATE_MASTER_ROADMAP', PROGRESS:28, STATUS:'RUNNING'});
    return;
  }

  if (job.STAGE === 'GENERATE_MASTER_ROADMAP') {
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderFoundationProgress_(
      mode === 'revise' ? 'Rebuilding Master Roadmap' : 'Designing Master Roadmap', 30, blueprint.title));

    const bible = getNovelRecordData_(sh, 'BIBLE', 'MASTER') || {};
    const oldRoadmap = mode === 'revise' ? (getNovelRecordData_(sh, 'ROADMAP_MASTER', 'MASTER') || {}) : {};
    const roadmap = geminiJson_(promptMasterRoadmap_(blueprint, bible, oldRoadmap, d.reason || ''));
    const ver = nextRecordVersion_(sh, 'ROADMAP_MASTER', 'MASTER');
    const file = upsertVersionedJson_(folders['02_ROADMAP'], 'master_roadmap', ver, roadmap);
    upsertNovelRecord_(sh, 'ROADMAP_MASTER', 'MASTER', '', '', blueprint.title, roadmap, 'DRAFT', ver, file.getId());
    syncArcRecords_(sh, roadmap, ver);

    const nd = Object.assign({}, d, {nextPlanStart:1});
    updateJobFields_(job.JOB_ID, {STAGE:'GENERATE_CHAPTER_PLANS', PROGRESS:35, STATUS:'RUNNING', DATA_JSON:JSON.stringify(nd)});
    return;
  }

  if (job.STAGE === 'GENERATE_CHAPTER_PLANS') {
    const target = Math.max(1, Math.min(Number(blueprint.targetChapters || 120), 2000));
    const chunkSize = roadmapChunkSize_();
    const start = Number(d.nextPlanStart || 1);

    if (start > target) {
      updateJobFields_(job.JOB_ID, {STAGE:'BUILD_FOUNDATION_PREVIEW', PROGRESS:68, STATUS:'RUNNING'});
      return;
    }

    const end = Math.min(target, start + chunkSize - 1);
    const pct = 35 + Math.round((end / target) * 30);
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderFoundationProgress_(
      'Planning Chapters ' + start + '–' + end, pct, blueprint.title));

    const bible = getNovelRecordData_(sh, 'BIBLE', 'MASTER') || {};
    const master = getNovelRecordData_(sh, 'ROADMAP_MASTER', 'MASTER') || {};
    const prior = getRoadmapChapterRange_(sh, Math.max(1,start-3), start-1);
    const chunk = geminiJson_(promptChapterPlanChunk_(blueprint, bible, master, start, end, prior, d.reason || ''));
    const chapters = Array.isArray(chunk.chapters) ? chunk.chapters : [];
    if (!chapters.length) throw new Error('Gemini tidak mengembalikan chapter plan untuk ' + start + '–' + end);
    const planNums = {};
    chapters.forEach(function(c){ planNums[Number(c.number)] = true; });
    const missingPlans = [];
    for (let pn=start; pn<=end; pn++) if (!planNums[pn]) missingPlans.push(pn);
    if (missingPlans.length) throw new Error('Chapter plan tidak lengkap. Missing: ' + missingPlans.join(', '));

    const roadmapVersion = getRecordVersion_(sh, 'ROADMAP_MASTER', 'MASTER') || 1;
    chapters.forEach(function(c) {
      const n = Number(c.number);
      if (!n || n < start || n > end) return;
      upsertNovelRecord_(sh, 'ROADMAP_CHAPTER', chapterKey_(n), n, c.arc || '', c.title || ('Chapter ' + n), c, 'DRAFT', roadmapVersion, '');
    });

    const chunkFile = upsertTextFile_(getFolderByIdSafe_(folders['02_ROADMAP']),
      'chapters_' + pad3_(start) + '_' + pad3_(end) + '_v' + roadmapVersion + '.json',
      JSON.stringify(chunk, null, 2));

    const nd = Object.assign({}, d, {nextPlanStart:end+1});
    updateJobFields_(job.JOB_ID, {PROGRESS:pct, DATA_JSON:JSON.stringify(nd), STATUS:'RUNNING'});
    return;
  }

  if (job.STAGE === 'BUILD_FOUNDATION_PREVIEW') {
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderFoundationProgress_('Final consistency audit + preview', 72, blueprint.title));

    const bible = getNovelRecordData_(sh, 'BIBLE', 'MASTER') || {};
    const roadmap = getNovelRecordData_(sh, 'ROADMAP_MASTER', 'MASTER') || {};
    const allPlans = getRoadmapChapterRange_(sh, 1, Number(blueprint.targetChapters || 120));

    const previewFolder = getFolderByIdSafe_(folders['00_ADMIN_PREVIEW']);
    const bibleFile = upsertTextFile_(previewFolder, 'BIBLE_PREVIEW.txt', prettyObject_(bible));
    const roadmapFile = upsertTextFile_(previewFolder, 'ROADMAP_PREVIEW.txt',
      prettyObject_(roadmap) + '\n\n=== DETAILED CHAPTER PLANS ===\n\n' + allPlans.map(function(x){return prettyObject_(x);}).join('\n\n'));

    const nd = Object.assign({}, d, {
      biblePreviewUrl:bibleFile.getUrl(),
      roadmapPreviewUrl:roadmapFile.getUrl(),
      previewFolderUrl:previewFolder.getUrl()
    });

    updateJobFields_(job.JOB_ID, {STAGE:'WAIT_FOUNDATION_APPROVAL', PROGRESS:75, STATUS:'WAITING_APPROVAL', DATA_JSON:JSON.stringify(nd)});
    updateNovelIndexFields_(novelId, {STATUS:'WAITING_FOUNDATION_APPROVAL', ACTIVE_JOB_ID:job.JOB_ID});

    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderFoundationReady_(blueprint, roadmap), {
      inline_keyboard:[
        [{text:'📕 Bible', url:bibleFile.getUrl()}, {text:'🗺 Roadmap', url:roadmapFile.getUrl()}],
        [{text:'📂 Drive Workspace', url:getFolderByIdSafe_(getNovelIndex_(novelId).FOLDER_ID).getUrl()}],
        [{text:'✅ ACCEPT', callback_data:'FD_APPROVE|' + job.JOB_ID}, {text:'❌ REJECT', callback_data:'FD_REJECT|' + job.JOB_ID}]
      ]
    });
    return;
  }

  throw new Error('Unknown FOUNDATION stage: ' + job.STAGE);
}

function jobGenerateBatch_(job) {
  const d = job.DATA || {};
  const start = Number(d.startChapter);
  const end = Number(d.endChapter);
  const sh = getNovelSheet_(job.NOVEL_ID);
  const index = getNovelIndex_(job.NOVEL_ID);
  const folders = getNovelRecordData_(sh, 'META', 'FOLDERS') || {};

  if (job.STAGE === 'GENERATE_CHAPTERS') {
    const n = Number(d.nextChapter || start);
    if (n > end) {
      updateJobFields_(job.JOB_ID, {STAGE:'REVIEW_BATCH', PROGRESS:88, STATUS:'RUNNING'});
      return;
    }

    const pct = Math.max(2, Math.min(85, Math.round(((n - start) / Math.max(1,end-start+1)) * 80) + 5));
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderBatchProgress_(start,end,n,
      (d.mode === 'revision' ? 'Rewriting' : 'Forging') + ' Chapter ' + n, pct,
      d.mode === 'revision' ? 'REVISION' : (start === 1 ? 'TEST WRITING' : 'WRITING')));

    // Save a rollback snapshot before overwriting any existing draft/revision.
    // This lets Cancel restore the previous state instead of destroying it.
    const rollbackRecords = Object.assign({}, d.rollbackRecords || {});
    const rollbackKey = String(n);
    if (!Object.prototype.hasOwnProperty.call(rollbackRecords, rollbackKey)) {
      rollbackRecords[rollbackKey] = snapshotNovelRecord_(getNovelRecord_(sh, 'CHAPTER_SUMMARY', chapterKey_(n)));
    }
    const checkpointData = Object.assign({}, d, {rollbackRecords:rollbackRecords});
    updateJobFields_(job.JOB_ID, {
      STATUS:'RUNNING',
      DATA_JSON:JSON.stringify(checkpointData)
    });

    const ctx = buildChapterContext_(job.NOVEL_ID, n);
    let result;
    if (checkpointData.mode === 'revision') {
      const current = getLatestChapterText_(sh, n);
      const sourceReview = checkpointData.sourceJobId ? getReviewForJob_(sh, checkpointData.sourceJobId) : null;
      result = generateChapterResultRobust_(ctx, {
        mode:'revision',
        chapterNo:n,
        currentText:current,
        reason:checkpointData.reason || '',
        review:sourceReview || {}
      });
    } else {
      result = generateChapterResultRobust_(ctx, {
        mode:'draft',
        chapterNo:n
      });
    }

    validateChapterResult_(result, n, ctx.targetWords);
    const existingVersion = getRecordVersion_(sh, 'CHAPTER_SUMMARY', chapterKey_(n)) || 0;
    const ver = existingVersion + 1;
    const folderName = d.mode === 'revision' ? '04_REVISED_CHAPTERS' : '03_CHAPTERS';
    const folder = getFolderByIdSafe_(folders[folderName]);
    const suffix = d.mode === 'revision' ? ('_R' + ver) : (ver > 1 ? ('_v' + ver) : '');
    const chapterFile = folder.createFile(
      'Chapter_' + pad3_(n) + suffix + '.txt',
      String(result.chapter_text),
      MimeType.PLAIN_TEXT
    );

    const summaryData = {
      number:n,
      title:result.title || ('Chapter ' + n),
      summary:result.summary || '',
      important_events:result.important_events || [],
      character_state_changes:result.character_state_changes || {},
      new_canon_facts:result.new_canon_facts || [],
      resolved_threads:result.resolved_threads || [],
      new_threads:result.new_threads || [],
      foreshadowing_added:result.foreshadowing_added || [],
      ending_state:result.ending_state || '',
      continuity_notes:result.continuity_notes || [],
      generatedByJobId:job.JOB_ID,
      generatedMode:checkpointData.mode || 'draft'
    };

    const plan = getNovelRecordData_(sh, 'ROADMAP_CHAPTER', chapterKey_(n)) || {};
    upsertNovelRecord_(sh, 'CHAPTER_SUMMARY', chapterKey_(n), n, plan.arc || '', result.title || plan.title || ('Chapter '+n),
      summaryData, d.mode === 'revision' ? 'REVISED' : 'DRAFT', ver, chapterFile.getId());
    const qMetrics = chapterQualityMetrics_(String(result.chapter_text || ''), n);
    upsertNovelRecord_(sh, 'CHAPTER_METRICS', chapterKey_(n), n, plan.arc || '', result.title || plan.title || ('Chapter '+n),
      qMetrics, d.mode === 'revision' ? 'REVISED' : 'DRAFT', ver, chapterFile.getId());

    const generatedFiles = Array.isArray(checkpointData.generatedFiles)
      ? checkpointData.generatedFiles.slice()
      : [];
    generatedFiles.push({
      chapter:n,
      fileId:chapterFile.getId(),
      version:ver,
      mode:checkpointData.mode || 'draft'
    });
    const nd = Object.assign({}, checkpointData, {
      nextChapter:n+1,
      generatedFiles:generatedFiles
    });
    const doneCount = n - start + 1;
    const progress = Math.round((doneCount / (end-start+1))*82);
    updateJobFields_(job.JOB_ID, {PROGRESS:progress, DATA_JSON:JSON.stringify(nd), STATUS:'RUNNING'});
    return;
  }

  if (job.STAGE === 'REVIEW_BATCH') {
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderBatchProgress_(start,end,end+1,'Continuity & Quality Review',91,'REVIEW'));
    const review = geminiJson_(promptReviewBatch_(job.NOVEL_ID, start, end));
    const file = getFolderByIdSafe_(folders['06_REVIEWS']).createFile(
      'Batch_' + pad3_(start) + '_' + pad3_(end) + '_review_' + timestampFile_() + '.json',
      JSON.stringify(review, null, 2), MimeType.PLAIN_TEXT);
    upsertNovelRecord_(sh, 'REVIEW', 'JOB_' + job.JOB_ID, '', '', 'Batch '+start+'-'+end, review, 'COMPLETE', 1, file.getId());
    updateJobFields_(job.JOB_ID, {STAGE:'BUILD_BATCH_PREVIEW', PROGRESS:95, STATUS:'RUNNING'});
    return;
  }

  if (job.STAGE === 'BUILD_BATCH_PREVIEW') {
    const review = getReviewForJob_(sh, job.JOB_ID) || {};

    // FULL AUTO PRODUCTION never asks the admin to approve a successful batch.
    // Review is still kept as the quality gate, but the parent AUTO_PRODUCTION
    // job receives the batch immediately and decides PASS -> CANON or FAIL -> rewrite.
    if (String(d.source || '') === 'AUTO_PRODUCTION' || d.autoParentJobId) {
      updateJobFields_(job.JOB_ID, {
        STAGE:'AUTO_REVIEW_READY',
        PROGRESS:100,
        STATUS:'AUTO_READY',
        DATA_JSON:JSON.stringify(Object.assign({}, d, {
          autoReviewReadyAt:isoNow_()
        }))
      });
      updateNovelIndexFields_(job.NOVEL_ID, {
        STATUS:'AUTO_PRODUCTION',
        ACTIVE_JOB_ID:String(d.autoParentJobId || job.JOB_ID)
      });

      safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
        '🤖 <b>AUTO PRODUCTION</b>\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '📖 ' + escapeHtml_(index ? index.TITLE : job.NOVEL_ID) + '\n' +
        '📚 Chapter <b>' + start + '–' + end + '</b> selesai dibuat.\n' +
        '🔍 AI Review selesai.\n\n' +
        '⏳ Quality Gate sedang memproses hasil...\n' +
        '<i>Tidak memerlukan approval admin.</i>');
      return;
    }

    // Manual /write and manual /rewrite keep the normal admin approval workflow.
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderBatchProgress_(start,end,end+1,'Building Admin Preview',97,'PREVIEW'));
    const previewFolder = getFolderByIdSafe_(folders['00_ADMIN_PREVIEW']);
    let body = 'SMART NOVEL FORGE — ADMIN PREVIEW\n' +
      (index ? index.TITLE : job.NOVEL_ID) + '\n' +
      'Chapters ' + start + '–' + end + '\n\n' +
      '=== AI REVIEW ===\n' + prettyObject_(review) + '\n\n';

    for (let n=start; n<=end; n++) {
      body += '\n\n============================================================\n' +
        'CHAPTER ' + n + '\n' +
        '============================================================\n\n' +
        getLatestChapterText_(sh, n) + '\n';
    }

    const previewFile = upsertTextFile_(previewFolder,
      'CHAPTER_' + pad3_(start) + '_' + pad3_(end) + '_ADMIN_PREVIEW.txt', body);
    const reviewFileId = getNovelRecordFileId_(sh, 'REVIEW', 'JOB_' + job.JOB_ID);
    const reviewUrl = reviewFileId ? DriveApp.getFileById(reviewFileId).getUrl() : previewFile.getUrl();

    const nd = Object.assign({}, d, {
      previewUrl:previewFile.getUrl(),
      previewFileId:previewFile.getId(),
      reviewUrl:reviewUrl
    });
    updateJobFields_(job.JOB_ID, {STAGE:'WAIT_BATCH_APPROVAL', PROGRESS:100, STATUS:'WAITING_APPROVAL', DATA_JSON:JSON.stringify(nd)});
    updateNovelIndexFields_(job.NOVEL_ID, {STATUS:'WAITING_CHAPTER_APPROVAL', ACTIVE_JOB_ID:job.JOB_ID});

    const freshJob = getJob_(job.JOB_ID) || job;
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
      renderBatchReady_(job.NOVEL_ID,start,end,review),
      batchApprovalKeyboard_(freshJob));
    return;
  }

  throw new Error('Unknown GENERATE_BATCH stage: ' + job.STAGE);
}

function jobReviewOnly_(job) {
  const d = job.DATA || {};
  const start = Number(d.startChapter);
  const end = Number(d.endChapter);
  if (!start || !end || end < start) throw new Error('Range review tidak valid.');

  const sh = getNovelSheet_(job.NOVEL_ID);
  const folders = getNovelRecordData_(sh, 'META', 'FOLDERS') || {};
  const total = end - start + 1;
  const chunkSize = Math.max(3, Math.min(15, Number(d.reviewChunkSize || reviewChunkSize_())));

  // REVIEW = initialize/reinitialize. Re-review starts here too, so old chunk records
  // are safely overwritten by the same job/chapter-range keys.
  if (job.STAGE === 'REVIEW') {
    // Explicit fresh review / re-review: clear previous chunk evidence for this same job.
    // A normal /retry resumes REVIEW_CHUNKS and therefore keeps completed chunks.
    deleteReviewChunksForJob_(sh,job.JOB_ID);
    const nd = Object.assign({}, d, {
      nextReviewChapter:start,
      reviewChunkSize:chunkSize,
      reviewStartedAt:isoNow_()
    });
    updateJobFields_(job.JOB_ID,{
      STATUS:'RUNNING',STAGE:'REVIEW_CHUNKS',PROGRESS:5,LAST_ERROR:'',DATA_JSON:JSON.stringify(nd)
    });
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
      '🔍 <b>AI REVIEW</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📚 Chapter ' + start + (end!==start?'–'+end:'') + ' (' + total + ' chapter)\n' +
      '🧩 Chunk size: ' + chunkSize + '\n\n' +
      '⏳ Menyiapkan Bible, Roadmap, Canon, Memory, Timeline dan chapter files...');
    return;
  }

  if (job.STAGE === 'REVIEW_CHUNKS') {
    const next = Number(d.nextReviewChapter || start);
    if (next > end) {
      updateJobFields_(job.JOB_ID,{STATUS:'RUNNING',STAGE:'REVIEW_AGGREGATE',PROGRESS:88});
      return;
    }

    const chunkEnd = Math.min(end, next + chunkSize - 1);
    const doneBefore = Math.max(0, next - start);
    const pct = Math.max(8, Math.min(82, Math.round(8 + (doneBefore / total) * 74)));

    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
      '🔍 <b>AI REVIEW</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📚 Target: Chapter ' + start + (end!==start?'–'+end:'') + '\n' +
      '🧩 Reviewing: <b>Chapter ' + next + (chunkEnd!==next?'–'+chunkEnd:'') + '</b>\n' +
      '📊 ' + progressBar_(pct) + ' ' + pct + '%\n\n' +
      '✅ Bible & Protected Canon\n' +
      '✅ Roadmap target\n' +
      '✅ Previous canon/chapter bridge\n' +
      '⏳ Character state, timeline, plot threads, pacing & prose');

    const review = geminiJson_(promptReviewBatch_(job.NOVEL_ID,next,chunkEnd));
    const reviewsFolder = getFolderByIdSafe_(folders['06_REVIEWS']);
    const chunkFile = reviewsFolder.createFile(
      'JOB_' + job.JOB_ID + '_Chunk_' + pad3_(next) + '_' + pad3_(chunkEnd) + '.json',
      JSON.stringify(review,null,2), MimeType.PLAIN_TEXT);
    const chunkKey = 'JOB_' + job.JOB_ID + '_' + pad3_(next) + '_' + pad3_(chunkEnd);
    upsertNovelRecord_(sh,'REVIEW_CHUNK',chunkKey,next,'','Chapter '+next+(chunkEnd!==next?('-'+chunkEnd):''),{
      jobId:job.JOB_ID,startChapter:next,endChapter:chunkEnd,review:review
    },'COMPLETE',1,chunkFile.getId());

    const nextChapter = chunkEnd + 1;
    const completed = chunkEnd - start + 1;
    const nextPct = Math.max(10, Math.min(86, Math.round(10 + (completed / total) * 76)));
    const nd = Object.assign({}, d, {nextReviewChapter:nextChapter,reviewChunkSize:chunkSize});
    updateJobFields_(job.JOB_ID,{
      STATUS:'RUNNING',
      STAGE:nextChapter>end?'REVIEW_AGGREGATE':'REVIEW_CHUNKS',
      PROGRESS:nextPct,
      DATA_JSON:JSON.stringify(nd)
    });
    return;
  }

  if (job.STAGE === 'REVIEW_AGGREGATE') {
    const chunks = getReviewChunksForJob_(sh,job.JOB_ID,start,end);
    if (!chunks.length) throw new Error('Hasil review chunk tidak ditemukan. Retry job untuk mengulang review.');

    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
      '🧠 <b>CROSS-CHAPTER REVIEW</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📚 Chapter ' + start + (end!==start?'–'+end:'') + '\n' +
      '✅ ' + chunks.length + ' chunk review selesai\n' +
      '⏳ Menggabungkan continuity lintas chapter\n' +
      '⏳ Mencari kontradiksi, forgotten threads, pacing drift dan roadmap deviation...');

    const review = chunks.length === 1
      ? chunks[0].review
      : geminiJson_(promptAggregateLongReview_(job.NOVEL_ID,start,end,chunks));

    const file = getFolderByIdSafe_(folders['06_REVIEWS']).createFile(
      'Chapter_' + pad3_(start) + (end!==start?('_'+pad3_(end)):'') + '_manual_review_' + timestampFile_() + '.json',
      JSON.stringify(review,null,2), MimeType.PLAIN_TEXT);
    upsertNovelRecord_(sh,'REVIEW','JOB_'+job.JOB_ID,'','','Chapter '+start+(end!==start?('-'+end):''),review,'COMPLETE',1,file.getId());

    const allCanon = areChapterRangeCanon_(sh,start,end);
    updateJobFields_(job.JOB_ID,{STATUS:'WAITING_APPROVAL',STAGE:'WAIT_REVIEW_ACTION',PROGRESS:100});
    updateNovelIndexFields_(job.NOVEL_ID,{ACTIVE_JOB_ID:job.JOB_ID});

    const kb = [
      [{text:'🔍 AI Review',callback_data:'BATCH_REREVIEW|'+job.JOB_ID},{text:'📄 Hasil Review',url:file.getUrl()}],
      allCanon
        ? [{text:'✅ KEEP AS IS',callback_data:'REVIEW_OK|'+job.JOB_ID},{text:'♻️ REWRITE',callback_data:'BATCH_REWRITE|'+job.JOB_ID}]
        : [{text:'✅ ACCEPT',callback_data:'BATCH_ACCEPT|'+job.JOB_ID},{text:'♻️ REWRITE',callback_data:'BATCH_REWRITE|'+job.JOB_ID}],
      [{text:'🔄 Regenerate',callback_data:'BATCH_REGEN|'+job.JOB_ID}]
    ];
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), renderBatchReady_(job.NOVEL_ID,start,end,review), {inline_keyboard:kb});
    return;
  }

  throw new Error('Unknown REVIEW_ONLY stage: ' + job.STAGE);
}

function deleteReviewChunksForJob_(sh,jobId) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const prefix = 'JOB_' + String(jobId) + '_';
  const vals = sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
  let deleted = 0;
  for (let i=vals.length-1; i>=0; i--) {
    if (String(vals[i][0]) !== 'REVIEW_CHUNK' || String(vals[i][1]).indexOf(prefix) !== 0) continue;
    const fileId = String(vals[i][8] || '');
    if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (_) {} }
    sh.deleteRow(i+2);
    deleted++;
  }
  return deleted;
}

function getReviewChunksForJob_(sh,jobId,start,end) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
  const prefix = 'JOB_' + String(jobId) + '_';
  const out = [];
  vals.forEach(function(r){
    if (String(r[0]) !== 'REVIEW_CHUNK' || String(r[1]).indexOf(prefix) !== 0) return;
    const data = safeJson_(r[5],{});
    const a = Number(data.startChapter || r[2] || 0);
    const b = Number(data.endChapter || a || 0);
    if (!a || b < start || a > end) return;
    out.push({startChapter:a,endChapter:b,review:data.review || {},fileId:String(r[8]||'')});
  });
  out.sort(function(a,b){return a.startChapter-b.startChapter;});
  return out;
}

function promptAggregateLongReview_(novelId,start,end,chunks) {
  const sh = getNovelSheet_(novelId);
  const bible = getNovelRecordData_(sh,'BIBLE','MASTER') || {};
  const protectedCanon = getProtectedCanonContext_(sh);
  const master = getNovelRecordData_(sh,'ROADMAP_MASTER','MASTER') || {};
  const plans = getRoadmapChapterRange_(sh,start,end);
  const memory = getNovelRecordData_(sh,'MEMORY','STORY_MEMORY') || {};
  const summaries = getChapterSummaries_(sh,start,end);
  const prior = getCanonSummariesBefore_(sh,start,40);
  const future = getCanonSummariesAfter_(sh,end,40);

  return 'You are the SENIOR continuity editor performing the FINAL cross-chapter audit for Chapters ' + start + '–' + end + '. ' +
    'Individual chunks were already reviewed against their full prose. Your job now is to detect problems that only become visible across the WHOLE range: continuity drift, repeated beats, forgotten setup, contradictory character states, timeline drift, roadmap deviation, reveal pacing, escalation/pacing imbalance, and contradictions between early and late parts of this reviewed range. ' +
    'Treat the chunk reviews as evidence, not unquestionable conclusions. Resolve disagreements between chunk reviews using Bible, protected canon, roadmap plans, memory and chapter summaries. ' +
    'Do not invent story events. Be concrete about chapter numbers. PASS means the entire range is coherent as one continuous novel segment.\n\n' +
    'Return JSON:\n' + JSON.stringify({
      verdict:'PASS|WARN|FAIL',summary:'string',
      storySynchronization:{status:'PASS|WARN|FAIL',previousChapterBridge:[],roadmapBridge:[],characterStateContinuity:[],nextChapterReadiness:[]},
      roadmapCompliance:{status:'PASS|WARN|FAIL',issues:[{chapter:1,issue:'string',fix:'string'}]},
      bibleCompliance:{status:'PASS|WARN|FAIL',issues:[]},
      continuity:{status:'PASS|WARN|FAIL',issues:[]},
      downstreamCanon:{status:'PASS|WARN|FAIL',issues:[]},
      characterKnowledge:{status:'PASS|WARN|FAIL',issues:[]},
      timeline:{status:'PASS|WARN|FAIL',issues:[]},
      pacing:{status:'PASS|WARN|FAIL',issues:[]},
      repetition:{status:'PASS|WARN|FAIL',issues:[]},
      plotThreads:{progressing:['string'],forgotten:['string'],newThreads:['string']},
      rangeAnalysis:{strongTransitions:['string'],weakTransitions:['string'],continuityDrift:['string'],repeatedBeats:['string'],forgottenSetups:['string']},
      recommendation:{rewriteChapters:[1],minorEditChapters:[2],safeChapters:[3]}
    }) +
    '\n\nBIBLE:\n' + JSON.stringify(bible) +
    '\n\nPROTECTED CANON:\n' + JSON.stringify(protectedCanon) +
    '\n\nMASTER ROADMAP:\n' + JSON.stringify(master) +
    '\n\nROADMAP PLANS FOR REVIEWED RANGE:\n' + JSON.stringify(plans) +
    '\n\nCENTRAL STORY MEMORY:\n' + JSON.stringify(memory) +
    '\n\nCHAPTER SUMMARIES FOR REVIEWED RANGE:\n' + JSON.stringify(summaries) +
    '\n\nCANON BEFORE RANGE:\n' + JSON.stringify(prior) +
    '\n\nCANON AFTER RANGE:\n' + JSON.stringify(future) +
    '\n\nINDIVIDUAL CHUNK REVIEWS:\n' + JSON.stringify(chunks.map(function(x){return {startChapter:x.startChapter,endChapter:x.endChapter,review:x.review};}));
}

function areChapterRangeCanon_(sh,start,end) {
  for (let n=start;n<=end;n++) {
    const r=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
    if (!r || String(r.STATUS)!=='CANON') return false;
  }
  return true;
}

function jobFinalizeBatch_(job) {
  const d = job.DATA || {};
  const start = Number(d.startChapter);
  const end = Number(d.endChapter);
  const sh = getNovelSheet_(job.NOVEL_ID);
  const index = getNovelIndex_(job.NOVEL_ID);
  const folders = getNovelRecordData_(sh, 'META', 'FOLDERS') || {};

  if (job.STAGE === 'CANONIZE') {
    const isAutoProduction = String(d.source || '') === 'AUTO_PRODUCTION';
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
      (isAutoProduction
        ? '🤖 <b>Auto Approval diterima</b>\n\n'
        : '✅ <b>Admin Approval diterima</b>\n\n') +
      '⏳ Canonizing Chapter ' + start + '–' + end + '...\n' +
      '⬜ Story Memory\n⬜ Character State\n⬜ Timeline\n⬜ Plot Threads');

    const canonFolder = getFolderByIdSafe_(folders['05_CANON']);
    for (let n=start; n<=end; n++) {
      const row = getNovelRecord_(sh, 'CHAPTER_SUMMARY', chapterKey_(n));
      if (!row || !row.FILE_ID) throw new Error('Chapter ' + n + ' source file missing.');
      const text = DriveApp.getFileById(row.FILE_ID).getBlob().getDataAsString('UTF-8');
      const canonFile = upsertTextFile_(canonFolder, 'Chapter_' + pad3_(n) + '_CANON.txt', text);

      // Once accepted, 05_CANON becomes the authoritative prose source.
      // Do not leave CHAPTER_SUMMARY.FILE_ID pointing to 03_CHAPTERS/04_REVISED_CHAPTERS.
      upsertNovelRecord_(
        sh,
        'CHAPTER_SUMMARY',
        chapterKey_(n),
        n,
        row.ARC||'',
        row.TITLE||('Chapter '+n),
        row.DATA||{},
        'CANON',
        Number(row.VERSION||1),
        canonFile.getId()
      );

      const qm = chapterQualityMetrics_(text,n);
      upsertNovelRecord_(
        sh,
        'CHAPTER_METRICS',
        chapterKey_(n),
        n,
        row.ARC||'',
        row.TITLE||('Chapter '+n),
        qm,
        'CANON',
        Number(row.VERSION||1),
        canonFile.getId()
      );
    }

    upsertTextFile_(canonFolder, 'canon_manifest.json', JSON.stringify(buildCanonManifest_(sh), null, 2));

    const oldLatestCanon = Number(index && index.LATEST_CANON || 0);
    const latestCanonAfter = Math.max(oldLatestCanon, end);
    const nd = Object.assign({}, d, {
      oldLatestCanon:oldLatestCanon,
      latestCanonAfter:latestCanonAfter,
      rebuildMemory:start <= oldLatestCanon
    });

    updateNovelIndexFields_(job.NOVEL_ID, {
      STATUS:'UPDATING_MEMORY',
      CURRENT_CHAPTER:Math.max(Number(index && index.CURRENT_CHAPTER || 0), end),
      LATEST_CANON:latestCanonAfter,
      ACTIVE_JOB_ID:job.JOB_ID
    });
    updateJobFields_(job.JOB_ID, {
      STAGE:'UPDATE_MEMORY', PROGRESS:45, STATUS:'RUNNING', DATA_JSON:JSON.stringify(nd)
    });
    return;
  }

  if (job.STAGE === 'UPDATE_MEMORY') {
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID),
      '🧠 <b>Updating Central Novel Brain</b>\n\n' +
      '✅ Chapter ' + start + '–' + end + ' → CANON\n' +
      '⏳ Story Memory\n⏳ Character States\n⏳ Timeline\n⏳ Plot Threads\n⏳ Foreshadowing');

    const oldMemory = getNovelRecordData_(sh, 'MEMORY', 'STORY_MEMORY') || {};
    const bible = getNovelRecordData_(sh, 'BIBLE', 'MASTER') || {};
    const rebuildMemory = !!d.rebuildMemory;
    const latestCanonAfter = Number(d.latestCanonAfter || Math.max(Number(index && index.LATEST_CANON || 0), end));
    const summaries = rebuildMemory
      ? getChapterSummaries_(sh, 1, latestCanonAfter).filter(function(x){return String(x.status)==='CANON';})
      : getChapterSummaries_(sh, start, end);
    const memory = geminiJson_(promptUpdateMemory_(
      rebuildMemory ? {} : oldMemory,
      bible,
      summaries,
      rebuildMemory ? 1 : start,
      rebuildMemory ? latestCanonAfter : end
    ));
    const memVersion = nextRecordVersion_(sh, 'MEMORY', 'STORY_MEMORY');

    const memoryFolder = getFolderByIdSafe_(folders['07_MEMORY']);
    const continuityFolder = getFolderByIdSafe_(folders['08_CONTINUITY']);
    const storyFile = upsertTextFile_(memoryFolder, 'story_memory.json', JSON.stringify(memory, null, 2));
    upsertNovelRecord_(sh, 'MEMORY', 'STORY_MEMORY', end, '', '', memory, 'CANON', memVersion, storyFile.getId());

    syncMemoryArtifacts_(sh, memory, continuityFolder, memVersion);
    syncWorldEncyclopedia_(job.NOVEL_ID, sh, memory, memVersion);
    syncCanonContradictionAlarm_(job.NOVEL_ID, sh, memory, latestCanonAfter, memVersion);
    syncAnalyticsReport_(job.NOVEL_ID);
    updateJobFields_(job.JOB_ID, {STAGE:'COMPLETE', PROGRESS:90, STATUS:'RUNNING'});
    return;
  }

  if (job.STAGE === 'COMPLETE') {
    const blueprint = getNovelRecordData_(sh, 'BLUEPRINT', 'MASTER') || {};
    const finalLatest = Math.max(Number(index && index.LATEST_CANON || 0), Number(d.latestCanonAfter || 0), end);
    updateNovelIndexFields_(job.NOVEL_ID, {
      STATUS:'ACTIVE',
      CURRENT_CHAPTER:Math.max(Number(index && index.CURRENT_CHAPTER || 0), finalLatest),
      LATEST_CANON:finalLatest,
      ACTIVE_JOB_ID:''
    });
    updateNovelJson_(job.NOVEL_ID);
    updateJobFields_(job.JOB_ID, {STAGE:'DONE', PROGRESS:100, STATUS:'DONE'});
    if(jobChannel_(job)==='TELEGRAM') setSession_(job.USER_ID, job.CHAT_ID, 'IDLE', job.NOVEL_ID, {});

    const target = Number(blueprint.targetChapters || index.TARGET_CHAPTERS || finalLatest);
    const finished = finalLatest >= target;
    const text =
      '✅ <b>CANON UPDATED</b>\n\n' +
      '<b>' + escapeHtml_(index.TITLE) + '</b>\n' +
      'Chapter ' + start + '–' + end + ' resmi menjadi CANON.\n' +
      (end < finalLatest ? '📚 Canon keseluruhan tetap sampai Chapter ' + finalLatest + '.\n' : '') +
      '\n🧠 Central Brain diperbarui:\n' +
      '✅ Story Memory\n✅ Character State\n✅ Timeline\n✅ Plot Threads\n✅ Foreshadowing\n✅ Character Knowledge\n✅ World Encyclopedia\n✅ Contradiction Alarm\n✅ Analytics Metrics\n\n' +
      (finished ? '🏁 Target novel sudah tercapai.' : 'Siap lanjut ke batch berikutnya.');

    const nextStart = finalLatest + 1;
    const kb = finished ? {inline_keyboard:[[{text:'📂 Drive Workspace', url:getFolderByIdSafe_(index.FOLDER_ID).getUrl()}]]} : {
      inline_keyboard:[
        [{text:'🚀 Generate ' + nextStart + '–' + Math.min(target,nextStart+defaultBatchSize_()-1), callback_data:'NEXT_BATCH|' + job.NOVEL_ID}],
        [{text:'📂 Drive Workspace', url:getFolderByIdSafe_(index.FOLDER_ID).getUrl()}]
      ]
    };
    safeEditMessage_(job.CHAT_ID, Number(job.MESSAGE_ID), text, kb);

    // Optional post-canon translation queue. This never changes Canon.
    try {
      enqueueAutoTranslationAfterCanon_(job, start, end);
    } catch (autoTrErr) {
      log_('WARN','auto-translate-after-canon',String(autoTrErr && autoTrErr.message || autoTrErr),{
        novelId:job.NOVEL_ID,startChapter:start,endChapter:end
      });
    }
    return;
  }

  throw new Error('Unknown FINALIZE_BATCH stage: ' + job.STAGE);
}

/* ========================================================================== */
/* NEXT BATCH                                                                  */
/* ========================================================================== */

function startNextBatch_(novelId, chatId, userId, messageId) {
  const index = getNovelIndex_(novelId);
  if (!index) {
    sendMessage_(chatId, '❌ Novel tidak ditemukan.');
    return;
  }
  if (String(index.STATUS) !== 'ACTIVE') {
    sendMessage_(chatId, '⚠️ Novel sedang berstatus <b>' + escapeHtml_(index.STATUS) + '</b>. Selesaikan job/approval aktif sebelum membuat batch baru.');
    return;
  }
  const sh = getNovelSheet_(novelId);
  const bp = getNovelRecordData_(sh, 'BLUEPRINT', 'MASTER') || {};
  const target = Number(bp.targetChapters || index.TARGET_CHAPTERS || 0);
  const start = Number(index.LATEST_CANON || 0) + 1;
  if (target && start > target) {
    editMessage_(chatId, messageId, '🏁 Semua chapter sesuai target sudah selesai.');
    return;
  }
  const end = target ? Math.min(target, start + defaultBatchSize_() - 1) : start + defaultBatchSize_() - 1;
  const jid = createJob_({
    novelId:novelId,chatId:chatId,userId:userId,type:'GENERATE_BATCH',stage:'GENERATE_CHAPTERS',progress:0,status:'QUEUED',messageId:messageId,
    data:{startChapter:start,endChapter:end,nextChapter:start,mode:'draft',reason:'Continue canon novel according to approved Bible, roadmap and current story memory.'}
  });
  setSession_(userId, chatId, 'GENERATING_BATCH', novelId, {jobId:jid});
  editMessage_(chatId, messageId, renderBatchProgress_(start,end,start,'Starting next batch',2,'WRITING'));
}

/* ========================================================================== */
/* MULTI-AI ROUTER                                                            */
/* Priority: Gemini -> OpenRouter Free Router -> Groq                         */
/* ========================================================================== */

function aiText_(input, options) {
  assertAiBudgetAvailable_();

  const prompt = String(input == null ? '' : input);
  const opts = options || {};
  const baseOrder = aiProviderOrder_();
  const mode = aiRouterMode_();
  const routing = aiRouterCandidateOrder_(baseOrder, mode);
  const providers = routing.providers;
  const failures = [];

  if (!providers.length) {
    const cooldownInfo = routing.cooling.map(function(x){
      return x.provider + ' ' + formatAiCooldown_(x.remainingMs);
    }).join(', ');

    throw new Error(
      routing.configuredCount
        ? 'Semua AI provider sedang cooldown.' +
          (cooldownInfo ? ' ' + cooldownInfo : '') +
          ' Coba lagi setelah cooldown selesai atau jalankan /ai reset.'
        : 'Tidak ada AI provider yang memiliki API key.'
    );
  }

  for (let i=0; i<providers.length; i++) {
    const provider = providers[i];

    try {
      let result = '';

      if (provider === 'gemini') {
        result = geminiProviderText_(prompt, opts);
      } else if (provider === 'openrouter') {
        result = openRouterProviderText_(prompt, opts);
      } else if (provider === 'groq') {
        result = groqProviderText_(prompt, opts);
      } else if (provider === 'agnes') {
        result = agnesProviderText_(prompt, opts);
      } else {
        throw new Error('Unknown AI provider: ' + provider);
      }

      if (!String(result || '').trim()) {
        throw new Error(provider + ' returned empty text.');
      }

      const successState = markAiProviderSuccess_(provider, baseOrder, mode);

      log_('INFO','ai-provider',
        'AI provider request berhasil.',
        {
          provider:provider,
          mode:mode,
          tryPosition:i+1,
          candidateCount:providers.length,
          nextProvider:successState.nextProvider || '',
          baseOrder:baseOrder
        }
      );

      if (i > 0 || routing.skippedCooldown.length) {
        log_('WARN','ai-provider-fallback',
          'AI rolling/fallback berhasil.',
          {
            provider:provider,
            previousFailures:failures.slice(-4),
            skippedCooldown:routing.skippedCooldown
          }
        );
      }

      rememberLastAiProvider_(provider);
      recordAiUsage_(provider, prompt);
      return String(result);

    } catch (err) {
      const message = String(err && err.message || err);
      const failure = markAiProviderFailure_(provider, message);

      // v5.1 fix: a prompt that exceeds the context window will fail on EVERY
      // provider with the same giant prompt. Fail fast so the caller shrinks
      // the prompt instead of burning all providers + cooldowns.
      if (failure.fatal) {
        throw new Error(
          'AI prompt too long for ' + provider + ' (' + failure.httpStatus + '): ' +
          'kecilkan konteks (AI_BUDGET_MODE=ECONOMY atau turunkan AI_CONTEXT_SUMMARIES_*). ' +
          'Detail: ' + truncate_(message, 500)
        );
      }

      failures.push(
        truncate_(
          provider + ': ' + message +
          ' [cooldown=' + failure.cooldownSeconds + 's]',
          1900
        )
      );

      log_('WARN','ai-provider-failed',
        provider + ': ' + message,
        {
          provider:provider,
          mode:mode,
          tryPosition:i+1,
          candidateCount:providers.length,
          reason:failure.reason,
          httpStatus:failure.httpStatus || '',
          cooldownSeconds:failure.cooldownSeconds,
          cooldownUntil:failure.cooldownUntil || ''
        }
      );
    }
  }

  throw new Error(
    'Semua AI provider kandidat gagal. Mode=' + mode +
    '. Kandidat: ' + providers.join(' -> ') +
    '. Detail: ' + failures.join(' | ')
  );
}

function aiJson_(prompt) {
  // v5.1: request real JSON mode from providers that support it
  // (response_format / responseMimeType); the text instruction stays as fallback.
  const text = aiText_(
    'IMPORTANT OUTPUT RULES:\n' +
    'Return ONLY valid JSON. No Markdown fences. No commentary before or after JSON. ' +
    'Use standard JSON double quotes and escape line breaks inside string values.\n\n' +
    String(prompt || ''),
    {json:true}
  );
  return parseJsonLoose_(text);
}

// ---------------------------------------------------------------------------
// Legacy compatibility.
// Existing Smart Novel Forge modules call geminiText_ / geminiJson_.
// They now transparently route through Gemini -> OpenRouter -> Groq.
// ---------------------------------------------------------------------------
function geminiText_(input) {
  return aiText_(input);
}

function geminiJson_(prompt) {
  return aiJson_(prompt);
}

// ---------------------------------------------------------------------------
// GEMINI PROVIDER
// ---------------------------------------------------------------------------
function geminiProviderText_(input, options) {
  const key = prop_('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY belum diset.');

  // v5.1 fix: the documented Interactions API path is /v1beta (configurable via GEMINI_API_VERSION).
  const apiVer = prop_('GEMINI_API_VERSION') || 'v1beta';
  const url = 'https://generativelanguage.googleapis.com/' + apiVer + '/interactions';
  const models = geminiModels_();
  let lastErr = null;

  for (let m=0; m<models.length; m++) {
    const model = models[m];

    for (let attempt=1; attempt<=2; attempt++) {
      const res = UrlFetchApp.fetch(url, {
        method:'post',
        contentType:'application/json',
        headers:{'x-goog-api-key':key},
        payload:JSON.stringify(geminiBuildPayload_(model, input, options)),
        muteHttpExceptions:true
      });

      const status = res.getResponseCode();
      const body = res.getContentText();

      if (status >= 200 && status < 300) {
        const obj = safeJson_(body,null);
        if (!obj) throw new Error('Gemini response bukan JSON valid.');
        const text = extractInteractionText_(obj);
        if (!text) {
          throw new Error(
            'Gemini response tidak memiliki text output. Raw: ' +
            truncate_(body,1200)
          );
        }

        if (m > 0) {
          log_('WARN','gemini-model-fallback',
            'Fallback Gemini model berhasil.',
            {model:model}
          );
        }
        return text;
      }

      lastErr = new Error(
        'Gemini ' + model + ' HTTP ' + status + ': ' +
        truncate_(body,1600)
      );

      // v5.1 fix: 429 is almost always per-key/per-project, not per-model.
      // Fail over to the next provider via the router instead of burning
      // through the remaining models on the same throttled key.
      if (status === 429) throw lastErr;

      if (status >= 500 && attempt < 2) {
        Utilities.sleep(1000 * attempt);
        continue;
      }

      // Authentication/config errors should immediately leave the Gemini
      // provider so the router can try OpenRouter.
      if (status === 401 || status === 403) throw lastErr;

      // Other 4xx requests generally will not improve with same-model retry.
      if (status >= 400 && status < 500) break;
      break;
    }
  }

  throw lastErr || new Error('Gemini provider gagal.');
}

// v5.1: builds the Interactions API payload. generationConfig knobs are
// property-gated (default OFF) because not every Interactions deployment
// accepts them; sending an unsupported field would 400 every Gemini call.
function geminiBuildPayload_(model, input, options) {
  const payload = {model:model, input:String(input)};
  const maxOut = Math.max(0, Number(prop_('GEMINI_MAX_OUTPUT_TOKENS') || 0));
  const wantJson = !!(options && options.json) &&
    String(prop_('GEMINI_JSON_MODE_ENABLED') || 'false').toLowerCase() === 'true';
  if (maxOut > 0 || wantJson) {
    payload.generationConfig = {};
    if (maxOut > 0) payload.generationConfig.maxOutputTokens = Math.min(32000, maxOut);
    if (wantJson) payload.generationConfig.responseMimeType = 'application/json';
  }
  return payload;
}

// ---------------------------------------------------------------------------
// OPENROUTER PROVIDER
// Uses openrouter/free by default. OpenRouter chooses a currently available
// free model for the request.
// ---------------------------------------------------------------------------
function openRouterProviderText_(input, options) {
  const key = prop_('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY belum diset.');

  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const model = openRouterModel_();
  const headers = {
    'Authorization':'Bearer ' + key,
    'Content-Type':'application/json'
  };

  const referer = prop_('OPENROUTER_HTTP_REFERER') || prop_('WEB_APP_URL');
  const appName = prop_('OPENROUTER_APP_NAME') || 'Smart Novel Forge';
  if (referer) headers['HTTP-Referer'] = referer;
  if (appName) headers['X-Title'] = appName;

  let lastErr = null;

  for (let attempt=1; attempt<=2; attempt++) {
    const res = UrlFetchApp.fetch(url, {
      method:'post',
      headers:headers,
      payload:JSON.stringify({
        model:model,
        messages:[
          {role:'user',content:String(input)}
        ],
        stream:false,
        // v5.1 fix: cap output tokens so long chapter JSON is not truncated mid-object
        // (truncation used to trigger a full chapter rewrite via the recovery path).
        max_tokens:aiMaxOutputTokens_(),
        // v5.1: real JSON mode when the caller asked for JSON.
        response_format:((options && options.json) ? {type:'json_object'} : undefined)
      }),
      muteHttpExceptions:true
    });

    const status = res.getResponseCode();
    const body = res.getContentText();

    if (status >= 200 && status < 300) {
      const obj = safeJson_(body,null);
      if (!obj) throw new Error('OpenRouter response bukan JSON valid.');
      const text = extractOpenAiChatText_(obj);
      if (!text) {
        throw new Error(
          'OpenRouter tidak mengembalikan text. Raw: ' +
          truncate_(body,1200)
        );
      }

      log_('INFO','openrouter-model',
        'OpenRouter free router berhasil.',
        {
          requestedModel:model,
          resolvedModel:String(obj.model || '')
        }
      );
      return text;
    }

    lastErr = new Error(
      'OpenRouter ' + model + ' HTTP ' + status + ': ' +
      truncate_(body,1600)
    );

    if ((status === 429 || status >= 500) && attempt < 2) {
      Utilities.sleep(status === 429 ? 2500 : 1200 * attempt);
      continue;
    }

    break;
  }

  throw lastErr || new Error('OpenRouter provider gagal.');
}

// ---------------------------------------------------------------------------
// GROQ PROVIDER
// ---------------------------------------------------------------------------
function groqProviderText_(input, options) {
  const key = prop_('GROQ_API_KEY');
  if (!key) throw new Error('GROQ_API_KEY belum diset.');

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const models = groqModels_();
  let lastErr = null;

  for (let m=0; m<models.length; m++) {
    const model = models[m];

    for (let attempt=1; attempt<=2; attempt++) {
      const res = UrlFetchApp.fetch(url, {
        method:'post',
        headers:{
          'Authorization':'Bearer ' + key,
          'Content-Type':'application/json'
        },
        payload:JSON.stringify({
          model:model,
          messages:[
            {role:'user',content:String(input)}
          ],
          stream:false,
          // v5.1 fix: cap output tokens so long chapter JSON is not truncated mid-object.
          max_tokens:aiMaxOutputTokens_(),
          // v5.1: real JSON mode when the caller asked for JSON.
          response_format:((options && options.json) ? {type:'json_object'} : undefined)
        }),
        muteHttpExceptions:true
      });

      const status = res.getResponseCode();
      const body = res.getContentText();

      if (status >= 200 && status < 300) {
        const obj = safeJson_(body,null);
        if (!obj) throw new Error('Groq response bukan JSON valid.');
        const text = extractOpenAiChatText_(obj);
        if (!text) {
          throw new Error(
            'Groq tidak mengembalikan text. Raw: ' +
            truncate_(body,1200)
          );
        }

        if (m > 0) {
          log_('WARN','groq-model-fallback',
            'Fallback Groq model berhasil.',
            {model:model}
          );
        }
        return text;
      }

      lastErr = new Error(
        'Groq ' + model + ' HTTP ' + status + ': ' +
        truncate_(body,1600)
      );

      // v5.1 fix: 429 is almost always per-key/per-project, not per-model.
      // Fail over to the next provider via the router instead of burning
      // through the remaining models on the same throttled key.
      if (status === 429) throw lastErr;

      if (status >= 500 && attempt < 2) {
        Utilities.sleep(1000 * attempt);
        continue;
      }

      if (status === 401 || status === 403) throw lastErr;
      if (status >= 400 && status < 500) break;
      break;
    }
  }

  throw lastErr || new Error('Groq provider gagal.');
}


// ---------------------------------------------------------------------------
// AGNES AI PROVIDER
// OpenAI-compatible Chat Completions API.
// ---------------------------------------------------------------------------
function agnesProviderText_(input, options) {
  const key = prop_('AGNES_API_KEY');
  if (!key) throw new Error('AGNES_API_KEY belum diset.');

  const url = 'https://apihub.agnes-ai.com/v1/chat/completions';
  const models = agnesModels_();
  let lastErr = null;

  for (let m=0; m<models.length; m++) {
    const model = models[m];

    for (let attempt=1; attempt<=2; attempt++) {
      const res = UrlFetchApp.fetch(url, {
        method:'post',
        headers:{
          'Authorization':'Bearer ' + key,
          'Content-Type':'application/json'
        },
        payload:JSON.stringify({
          model:model,
          messages:[
            {role:'user',content:String(input)}
          ],
          stream:false,
          temperature:0.7,
          // v5.1 fix: cap output tokens so long chapter JSON is not truncated mid-object.
          max_tokens:aiMaxOutputTokens_(),
          // v5.1: real JSON mode when the caller asked for JSON.
          response_format:((options && options.json) ? {type:'json_object'} : undefined)
        }),
        muteHttpExceptions:true
      });

      const status = res.getResponseCode();
      const body = res.getContentText();

      if (status >= 200 && status < 300) {
        const obj = safeJson_(body,null);
        if (!obj) throw new Error('Agnes response bukan JSON valid.');

        const text = extractOpenAiChatText_(obj);
        if (!text) {
          throw new Error(
            'Agnes tidak mengembalikan text. Raw: ' +
            truncate_(body,1200)
          );
        }

        if (m > 0) {
          log_('WARN','agnes-model-fallback',
            'Fallback Agnes model berhasil.',
            {model:model}
          );
        }

        return text;
      }

      lastErr = new Error(
        'Agnes ' + model + ' HTTP ' + status + ': ' +
        truncate_(body,1600)
      );

      // v5.1 fix: 429 is almost always per-key/per-project, not per-model.
      // Fail over to the next provider via the router instead of burning
      // through the remaining models on the same throttled key.
      if (status === 429) throw lastErr;

      if (status >= 500 && attempt < 2) {
        Utilities.sleep(1000 * attempt);
        continue;
      }

      if (status === 401 || status === 403) throw lastErr;
      if (status >= 400 && status < 500) break;
      break;
    }
  }

  throw lastErr || new Error('Agnes provider gagal.');
}

function extractOpenAiChatText_(obj) {
  if (!obj || !Array.isArray(obj.choices) || !obj.choices.length) return '';

  const msg = obj.choices[0] && obj.choices[0].message;
  if (!msg) return '';

  if (typeof msg.content === 'string') return msg.content;

  if (Array.isArray(msg.content)) {
    const parts = [];
    msg.content.forEach(function(part){
      if (!part) return;
      if (typeof part === 'string') {
        parts.push(part);
        return;
      }
      if (part.type === 'text' && part.text) parts.push(part.text);
      else if (part.text) parts.push(part.text);
    });
    if (parts.length) return parts.join('');
  }

  // Some reasoning models may expose final answer in alternate compatible
  // fields. We use these only when normal message.content is absent.
  if (typeof msg.output_text === 'string') return msg.output_text;
  if (typeof obj.output_text === 'string') return obj.output_text;

  return '';
}

function extractInteractionText_(obj) {
  if (!obj) return '';
  if (typeof obj.output_text === 'string') return obj.output_text;

  if (Array.isArray(obj.outputs)) {
    const t = obj.outputs
      .filter(function(x){return x && x.type === 'text';})
      .map(function(x){return x.text || '';})
      .join('');
    if (t) return t;
  }

  if (Array.isArray(obj.steps)) {
    const parts = [];
    obj.steps.forEach(function(step){
      if (!step) return;
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        step.content.forEach(function(c){
          if (c && c.type === 'text' && c.text) parts.push(c.text);
        });
      }
    });
    if (parts.length) return parts.join('');
  }

  return '';
}

function parseJsonLoose_(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();

  try { return JSON.parse(s); } catch (_) {}

  const firstObj = s.indexOf('{');
  const lastObj = s.lastIndexOf('}');
  if (firstObj >= 0 && lastObj > firstObj) {
    try { return JSON.parse(s.slice(firstObj,lastObj+1)); } catch (_) {}
  }

  const firstArr = s.indexOf('[');
  const lastArr = s.lastIndexOf(']');
  if (firstArr >= 0 && lastArr > firstArr) {
    try { return JSON.parse(s.slice(firstArr,lastArr+1)); } catch (_) {}
  }

  log_('ERROR','parseJsonLoose',
    'AI JSON parse gagal',
    {rawOutput:truncate_(s,5000),provider:lastAiProvider_()}
  );

  throw new Error(
    'AI JSON parse gagal. Respons model tidak lengkap atau bukan JSON valid.'
  );
}


function aiRouterMode_() {
  const mode = String(prop_('AI_ROUTER_MODE') || 'SMART_ROLLING')
    .trim()
    .toUpperCase();

  return mode === 'PRIORITY' ? 'PRIORITY' : 'SMART_ROLLING';
}

function setAiRouterMode_(mode) {
  mode = String(mode || 'SMART_ROLLING').trim().toUpperCase();
  if (mode !== 'PRIORITY') mode = 'SMART_ROLLING';

  PropertiesService.getScriptProperties()
    .setProperty('AI_ROUTER_MODE', mode);

  return mode;
}

function aiRouterStateKey_() {
  return 'SNF_AI_ROUTER_STATE';
}

function defaultAiRouterState_() {
  return {
    cursor:0,
    updatedAt:'',
    providers:{}
  };
}

function readAiRouterState_() {
  let state = safeJson_(prop_(aiRouterStateKey_()), null);

  if (!state || typeof state !== 'object') {
    state = defaultAiRouterState_();
  }

  state.cursor = Math.max(0, Number(state.cursor || 0));
  state.providers = state.providers && typeof state.providers === 'object'
    ? state.providers
    : {};

  return state;
}

function saveAiRouterState_(state) {
  state = state || defaultAiRouterState_();
  state.updatedAt = isoNow_();

  PropertiesService.getScriptProperties().setProperty(
    aiRouterStateKey_(),
    JSON.stringify(state)
  );

  return state;
}

function withAiRouterLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const state = readAiRouterState_();
    const result = fn(state);
    saveAiRouterState_(state);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function aiProviderState_(state, provider) {
  state.providers = state.providers || {};

  if (!state.providers[provider]) {
    state.providers[provider] = {
      cooldownUntil:0,
      consecutiveFailures:0,
      totalFailures:0,
      totalSuccess:0,
      lastError:'',
      lastFailureAt:'',
      lastSuccessAt:'',
      lastReason:'',
      lastHttpStatus:0
    };
  }

  return state.providers[provider];
}

function aiRouterCandidateOrder_(baseOrder, mode) {
  baseOrder = Array.isArray(baseOrder) ? baseOrder.slice() : aiProviderOrder_();
  mode = mode || aiRouterMode_();

  const state = readAiRouterState_();
  const now = Date.now();
  const configured = baseOrder.filter(aiProviderConfigured_);
  const cooling = [];
  const healthy = [];

  configured.forEach(function(provider){
    const ps = aiProviderState_(state, provider);
    const until = Number(ps.cooldownUntil || 0);

    if (until > now) {
      cooling.push({
        provider:provider,
        remainingMs:until-now,
        cooldownUntil:until
      });
    } else {
      healthy.push(provider);
    }
  });

  let ordered = [];

  if (mode === 'PRIORITY') {
    ordered = baseOrder.filter(function(p){
      return healthy.indexOf(p) >= 0;
    });
  } else if (baseOrder.length) {
    const start = Number(state.cursor || 0) % baseOrder.length;

    for (let offset=0; offset<baseOrder.length; offset++) {
      const provider = baseOrder[(start + offset) % baseOrder.length];
      if (healthy.indexOf(provider) >= 0) ordered.push(provider);
    }
  }

  return {
    providers:ordered,
    cooling:cooling,
    skippedCooldown:cooling.map(function(x){return x.provider;}),
    configuredCount:configured.length,
    cursor:Number(state.cursor || 0)
  };
}

function extractAiHttpStatus_(message) {
  const s = String(message || '');
  const m = s.match(/\bHTTP\s+(\d{3})\b/i) ||
            s.match(/\bstatus(?:\s+code)?\s*[:=]?\s*(\d{3})\b/i);

  return m ? Number(m[1]) : 0;
}

function classifyAiProviderFailure_(message) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const status = extractAiHttpStatus_(text);

  if (status === 429 ||
      /rate.?limit|quota|too many requests|resource exhausted/i.test(text)) {
    return {
      reason:'RATE_LIMIT',
      httpStatus:status || 429,
      cooldownSeconds:aiCooldownSeconds_('429')
    };
  }

  if (status === 401 || status === 403 ||
      /invalid api key|unauthorized|forbidden|authentication/i.test(text)) {
    return {
      reason:'AUTH',
      httpStatus:status,
      cooldownSeconds:aiCooldownSeconds_('AUTH')
    };
  }

  if (status >= 500 && status <= 599) {
    return {
      reason:'SERVER_5XX',
      httpStatus:status,
      cooldownSeconds:aiCooldownSeconds_('5XX')
    };
  }

  if (/timeout|timed out|socket|connection reset|connection aborted|network error|service invoked too many times/i.test(lower)) {
    return {
      reason:'TIMEOUT_NETWORK',
      httpStatus:status,
      cooldownSeconds:aiCooldownSeconds_('TIMEOUT')
    };
  }

  if (/empty text|json parse|bukan json|tidak memiliki text|tidak mengembalikan text/i.test(lower)) {
    return {
      reason:'BAD_RESPONSE',
      httpStatus:status,
      cooldownSeconds:aiCooldownSeconds_('OTHER')
    };
  }

  // v5.1 fix: context-length errors used to fall into OTHER, so the same
  // oversized prompt was retried on every provider. Mark it fatal instead.
  if (/context[-_ ]?(length|window)|maximum context|input.*too (long|large)|too many tokens|token.*(limit|exceed)|prompt.*too (long|large)/i.test(text)) {
    return {
      reason:'PROMPT_TOO_LONG',
      httpStatus:status,
      cooldownSeconds:0,
      fatal:true
    };
  }

  return {
    reason:'OTHER',
    httpStatus:status,
    cooldownSeconds:aiCooldownSeconds_('OTHER')
  };
}

function aiCooldownSeconds_(type) {
  const key = String(type || 'OTHER').toUpperCase();

  const defaults = {
    '429':1800,
    '5XX':600,
    'AUTH':3600,
    'TIMEOUT':300,
    'OTHER':120
  };

  const propMap = {
    '429':'AI_COOLDOWN_429_SECONDS',
    '5XX':'AI_COOLDOWN_5XX_SECONDS',
    'AUTH':'AI_COOLDOWN_AUTH_SECONDS',
    'TIMEOUT':'AI_COOLDOWN_TIMEOUT_SECONDS',
    'OTHER':'AI_COOLDOWN_OTHER_SECONDS'
  };

  const raw = Number(prop_(propMap[key]) || defaults[key] || 120);

  return Math.max(30, Math.min(86400, raw));
}

function markAiProviderFailure_(provider, message) {
  const cls = classifyAiProviderFailure_(message);
  const now = Date.now();
  const until = now + cls.cooldownSeconds * 1000;

  return withAiRouterLock_(function(state){
    const ps = aiProviderState_(state, provider);

    ps.consecutiveFailures = Number(ps.consecutiveFailures || 0) + 1;
    ps.totalFailures = Number(ps.totalFailures || 0) + 1;
    ps.lastError = truncate_(String(message || ''), 1500);
    ps.lastFailureAt = isoNow_();
    ps.lastReason = cls.reason;
    ps.lastHttpStatus = Number(cls.httpStatus || 0);
    ps.cooldownUntil = Math.max(Number(ps.cooldownUntil || 0), until);

    return {
      provider:provider,
      reason:cls.reason,
      httpStatus:Number(cls.httpStatus || 0),
      cooldownSeconds:cls.cooldownSeconds,
      cooldownUntil:new Date(ps.cooldownUntil).toISOString(),
      fatal:!!cls.fatal
    };
  });
}

function markAiProviderSuccess_(provider, baseOrder, mode) {
  baseOrder = Array.isArray(baseOrder) ? baseOrder.slice() : aiProviderOrder_();

  return withAiRouterLock_(function(state){
    const ps = aiProviderState_(state, provider);

    ps.consecutiveFailures = 0;
    ps.totalSuccess = Number(ps.totalSuccess || 0) + 1;
    ps.lastSuccessAt = isoNow_();
    ps.lastError = '';
    ps.lastReason = '';
    ps.lastHttpStatus = 0;
    ps.cooldownUntil = 0;

    let nextProvider = '';

    if (mode === 'SMART_ROLLING' && baseOrder.length) {
      const idx = baseOrder.indexOf(provider);
      const nextIndex = idx >= 0
        ? (idx + 1) % baseOrder.length
        : (Number(state.cursor || 0) + 1) % baseOrder.length;

      state.cursor = nextIndex;
      nextProvider = baseOrder[nextIndex] || '';
    }

    return {
      provider:provider,
      nextProvider:nextProvider,
      cursor:Number(state.cursor || 0)
    };
  });
}

function resetAiRouterState_(clearCooldowns) {
  return withAiRouterLock_(function(state){
    state.cursor = 0;

    if (clearCooldowns !== false) {
      state.providers = {};
    }

    return true;
  });
}

function configureSmartRollingDefaults() {
  PropertiesService.getScriptProperties().setProperties({
    AI_ROUTER_MODE:'SMART_ROLLING',
    AI_PROVIDER_ORDER:'gemini,openrouter,groq,agnes',
    AI_COOLDOWN_429_SECONDS:'1800',
    AI_COOLDOWN_5XX_SECONDS:'600',
    AI_COOLDOWN_AUTH_SECONDS:'3600',
    AI_COOLDOWN_TIMEOUT_SECONDS:'300',
    AI_COOLDOWN_OTHER_SECONDS:'120'
  }, false);

  resetAiRouterState_(true);

  const result = {
    ok:true,
    mode:aiRouterMode_(),
    order:aiProviderOrder_(),
    cooldowns:{
      rateLimit429:aiCooldownSeconds_('429'),
      server5xx:aiCooldownSeconds_('5XX'),
      auth:aiCooldownSeconds_('AUTH'),
      timeout:aiCooldownSeconds_('TIMEOUT'),
      other:aiCooldownSeconds_('OTHER')
    }
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function formatAiCooldown_(ms) {
  ms = Math.max(0, Number(ms || 0));

  if (!ms) return 'READY';

  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return sec + 's';

  const min = Math.floor(sec / 60);
  const rem = sec % 60;

  if (min < 60) return min + 'm ' + rem + 's';

  const hrs = Math.floor(min / 60);
  const mins = min % 60;

  return hrs + 'h ' + mins + 'm';
}

function aiRouterStatusObject_() {
  const order = aiProviderOrder_();
  const state = readAiRouterState_();
  const now = Date.now();
  const mode = aiRouterMode_();

  const providers = order.map(function(provider, index){
    const configured = aiProviderConfigured_(provider);
    const ps = aiProviderState_(state, provider);
    const until = Number(ps.cooldownUntil || 0);
    const cooling = configured && until > now;

    return {
      provider:provider,
      configured:configured,
      cooling:cooling,
      remainingMs:cooling ? until-now : 0,
      cooldownUntil:cooling ? new Date(until).toISOString() : '',
      consecutiveFailures:Number(ps.consecutiveFailures || 0),
      totalFailures:Number(ps.totalFailures || 0),
      totalSuccess:Number(ps.totalSuccess || 0),
      lastError:String(ps.lastError || ''),
      lastFailureAt:String(ps.lastFailureAt || ''),
      lastSuccessAt:String(ps.lastSuccessAt || ''),
      lastReason:String(ps.lastReason || ''),
      lastHttpStatus:Number(ps.lastHttpStatus || 0),
      isNext:mode === 'SMART_ROLLING' &&
        order.length &&
        index === (Number(state.cursor || 0) % order.length)
    };
  });

  return {
    mode:mode,
    order:order,
    cursor:Number(state.cursor || 0),
    lastProvider:lastAiProvider_(),
    providers:providers
  };
}

function aiProviderOrder_() {
  const raw = prop_('AI_PROVIDER_ORDER') || 'gemini,openrouter,groq,agnes';
  const valid = ['gemini','openrouter','groq','agnes'];
  const out = [];

  raw.split(',').forEach(function(x){
    const p = String(x || '').trim().toLowerCase();
    if (valid.indexOf(p) >= 0 && out.indexOf(p) < 0) out.push(p);
  });

  valid.forEach(function(p){
    if (out.indexOf(p) < 0) out.push(p);
  });

  return out;
}

function aiProviderConfigured_(provider) {
  if (provider === 'gemini') return !!prop_('GEMINI_API_KEY');
  if (provider === 'openrouter') return !!prop_('OPENROUTER_API_KEY');
  if (provider === 'groq') return !!prop_('GROQ_API_KEY');
  if (provider === 'agnes') return !!prop_('AGNES_API_KEY');
  return false;
}

// v5.1: output token cap shared by all providers. A chapter JSON payload is
// ~3000-3500 tokens; 8192 leaves headroom so the model is not cut off mid-JSON
// (which used to trigger a wasteful full-chapter rewrite via recovery).
function aiMaxOutputTokens_() {
  return Math.max(2048, Math.min(32000, Number(prop_('AI_MAX_OUTPUT_TOKENS') || 8192)));
}

// v5.1: budget mode now actually drives context size (was display-only).
// ECONOMY = lean context, BALANCED = medium, QUALITY = full context.
function aiContextSummaryLimit_() {
  const mode = aiBudgetMode_();
  if (mode === 'QUALITY') return Math.max(20, Math.min(200, Number(prop_('AI_CONTEXT_SUMMARIES_QUALITY') || 120)));
  if (mode === 'BALANCED') return Math.max(20, Math.min(200, Number(prop_('AI_CONTEXT_SUMMARIES_BALANCED') || 80)));
  return Math.max(10, Math.min(200, Number(prop_('AI_CONTEXT_SUMMARIES_ECONOMY') || 40)));
}

function openRouterModel_() {
  return prop_('OPENROUTER_MODEL') || 'openrouter/free';
}

function groqModel_() {
  return prop_('GROQ_MODEL') || 'openai/gpt-oss-120b';
}

function groqModels_() {
  const primary = groqModel_();
  const raw = prop_('GROQ_FALLBACK_MODELS') ||
    'openai/gpt-oss-20b,llama-3.3-70b-versatile,llama-3.1-8b-instant';

  const out = [primary].concat(
    raw.split(',').map(function(x){return x.trim();}).filter(Boolean)
  );

  return out.filter(function(x,i){return out.indexOf(x) === i;});
}

function agnesModel_() {
  return prop_('AGNES_MODEL') || 'agnes-3.0-flash';
}

function agnesModels_() {
  const primary = agnesModel_();
  const raw = prop_('AGNES_FALLBACK_MODELS') ||
    'agnes-2.5-pro,agnes-2.0-flash';

  const out = [primary].concat(
    raw.split(',').map(function(x){return x.trim();}).filter(Boolean)
  );

  return out.filter(function(x,i){return out.indexOf(x) === i;});
}

function rememberLastAiProvider_(provider) {
  try {
    CacheService.getScriptCache().put(
      'SNF_LAST_AI_PROVIDER',
      String(provider || ''),
      21600
    );
  } catch (_) {}
}

function lastAiProvider_() {
  try {
    return CacheService.getScriptCache().get('SNF_LAST_AI_PROVIDER') || '';
  } catch (_) {
    return '';
  }
}

function sendAiRouterStatus_(chatId) {
  const st = aiRouterStatusObject_();
  const now = Date.now();

  const lines = st.providers.map(function(x,index){
    let icon = '⚪';
    let stateText = 'NO KEY';

    if (x.configured) {
      if (x.cooling) {
        icon = '🟠';
        stateText = 'COOLDOWN ' + formatAiCooldown_(x.remainingMs);
      } else if (x.isNext && st.mode === 'SMART_ROLLING') {
        icon = '➡️';
        stateText = 'NEXT';
      } else {
        icon = '🟢';
        stateText = 'READY';
      }
    }

    let detail = '';
    if (x.provider === 'gemini') detail = geminiModel_();
    if (x.provider === 'openrouter') detail = openRouterModel_();
    if (x.provider === 'groq') detail = groqModel_();
    if (x.provider === 'agnes') detail = agnesModel_();

    let extra = '';
    if (x.cooling && x.lastReason) {
      extra = '\n   ↳ ' + escapeHtml_(x.lastReason) +
        (x.lastHttpStatus ? ' HTTP '+x.lastHttpStatus : '');
    }

    return (index+1) + '. ' + icon + ' <b>' +
      escapeHtml_(x.provider.toUpperCase()) + '</b>' +
      ' — <code>' + escapeHtml_(detail) + '</code>' +
      '\n   ' + escapeHtml_(stateText) +
      ' • success ' + Number(x.totalSuccess || 0) +
      ' • fail ' + Number(x.totalFailures || 0) +
      extra;
  });

  sendMessage_(chatId,
    '🤖 <b>SMART MULTI-AI ROUTER</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    'Mode: <b>' + escapeHtml_(st.mode) + '</b>\n' +
    'Order: <code>' + escapeHtml_(st.order.join(' → ')) + '</code>\n\n' +
    lines.join('\n\n') +
    '\n\nLast provider: <b>' +
    escapeHtml_(st.lastProvider ? st.lastProvider.toUpperCase() : '-') +
    '</b>\n\n' +
    '<code>/ai rolling</code> — true round-robin\n' +
    '<code>/ai priority</code> — selalu mulai dari provider pertama\n' +
    '<code>/ai reset</code> — hapus cooldown/state\n\n' +
    '🌐 Translation tetap memakai <b>Google Translate</b>.'
  );
}

function blueprintSchemaText_() {
  return JSON.stringify({
    title:'string',
    description:'string',
    genres:['string'],
    subgenres:['string'],
    language:'English',
    targetChapters:120,
    targetWordsPerChapter:1800,
    pov:'Third Person Limited',
    tone:['string'],
    pacing:'Slow burn',
    setting:'string',
    era:'string',
    protagonist:{name:'string',role:'string',age:'string',traits:['string'],motivation:'string'},
    romance:'string',
    actionLevel:'string',
    darknessLevel:'string',
    endingType:'string',
    coreConflict:'string',
    coreMystery:'string',
    specialRules:['string'],
    prohibitedEvents:['string'],
    inspirations:['string'],
    targetPlatform:'string'
  });
}

function promptExtractBlueprint_(idea) {
  return 'You are the intake editor for Smart Novel Forge. Convert the creator\'s free-form idea into a precise long-form novel blueprint. ' +
    'Preserve explicit creator choices exactly. Infer only missing low-risk details. If a title is missing, create a strong WORKING title. ' +
    'Avoid generic character names unless supplied by the creator. Make targetChapters an integer.\n\n' +
    'SCHEMA:\n' + blueprintSchemaText_() + '\n\n' +
    'CREATOR IDEA:\n' + idea;
}

function promptUpdateBlueprint_(oldBlueprint, instruction) {
  return 'You are editing an existing novel blueprint. Apply the creator instruction faithfully while preserving all unrelated fields. ' +
    'Return the FULL updated blueprint, not a patch.\n\nSCHEMA:\n' + blueprintSchemaText_() +
    '\n\nOLD BLUEPRINT:\n' + JSON.stringify(oldBlueprint) +
    '\n\nCREATOR INSTRUCTION:\n' + instruction;
}

function promptGenerateBible_(bp, oldBible, revisionReason) {
  return 'You are the Story Bible Architect for a long-running novel. Build a durable authoritative Bible that prevents continuity drift. ' +
    'Separate AUTHOR SECRET from what readers and characters know. Major mysteries must include reveal timing constraints. ' +
    'Do not reveal protected information early just because it exists in the Bible.\n\n' +
    'Return JSON with this shape:\n' + JSON.stringify({
      premise:'string',themes:['string'],storyPromise:'string',
      world:{overview:'string',rules:['string'],history:['string'],technologyOrMagic:'string'},
      characters:[{id:'CHAR_001',name:'string',role:'string',description:'string',traits:['string'],motivation:'string',arc:'string',startingKnowledge:['string'],mustNotKnowUntil:[{fact:'string',chapterOrArc:'string'}],relationships:{}}],
      locations:[{id:'LOC_001',name:'string',description:'string',storyFunction:'string'}],
      factions:[{id:'FAC_001',name:'string',goal:'string',notes:'string'}],
      powerSystem:{exists:false,rules:['string'],limits:['string']},
      authorSecrets:[{fact:'string',revealWindow:'string',notes:'string'}],
      protectedCanon:[{id:'PC_001',rule:'string',until:'string'}],
      styleGuide:{voice:'string',pov:'string',tense:'string',dialogue:'string',avoid:['string'],chapterEndingStyle:'string'},
      continuityRules:['string']
    }) + '\n\nBLUEPRINT:\n' + JSON.stringify(bp) +
    (oldBible && Object.keys(oldBible).length ? '\n\nCURRENT BIBLE TO REVISE:\n' + JSON.stringify(oldBible) : '') +
    (revisionReason ? '\n\nADMIN REVISION REQUEST:\n' + revisionReason : '');
}

function promptMasterRoadmap_(bp, bible, oldRoadmap, revisionReason) {
  return 'You are the Story Director. Create the MASTER ROADMAP for the entire novel. This roadmap controls pacing and reveal timing. ' +
    'Do not write chapter-by-chapter plans here; design arcs that cover every chapter from 1 through targetChapters with no gaps or overlaps. ' +
    'Respect protectedCanon and authorSecrets reveal windows. Early arcs must not prematurely solve late mysteries.\n\n' +
    'Return JSON:\n' + JSON.stringify({
      targetChapters:120,
      endingDestination:'string',
      globalStructure:'string',
      majorMysteries:[{mystery:'string',introduced:'string',development:'string',reveal:'string'}],
      arcs:[{arc:1,title:'string',startChapter:1,endChapter:15,dominantGenre:'string',purpose:'string',characterGoals:['string'],conflicts:['string'],requiredEvents:['string'],forbiddenReveals:['string'],foreshadowing:['string'],arcEnding:'string'}]
    }) + '\n\nBLUEPRINT:\n' + JSON.stringify(bp) + '\n\nBIBLE:\n' + JSON.stringify(bible) +
    (oldRoadmap && Object.keys(oldRoadmap).length ? '\n\nCURRENT ROADMAP TO REVISE:\n' + JSON.stringify(oldRoadmap) : '') +
    (revisionReason ? '\n\nADMIN REVISION REQUEST:\n' + revisionReason : '');
}

function promptChapterPlanChunk_(bp, bible, master, start, end, prior, revisionReason) {
  return 'You are expanding an approved master roadmap into concise chapter plans. Plan exactly chapters ' + start + ' through ' + end + '. ' +
    'Every chapter must causally connect to the previous one, serve its parent arc, maintain character knowledge boundaries, and move at least one story thread. ' +
    'Do not reveal future secrets early. Plans should guide a writer but leave room for prose.\n\n' +
    'Return JSON: {"chapters":[{"number":1,"arc":1,"title":"string","objective":"string","openingState":"string","requiredEvents":["string"],"characterDevelopment":["string"],"cluesOrForeshadowing":["string"],"forbiddenReveals":["string"],"endingState":"string","hook":"string"}]}\n\n' +
    'BLUEPRINT:\n' + JSON.stringify(bp) + '\n\nBIBLE:\n' + JSON.stringify(bible) + '\n\nMASTER ROADMAP:\n' + JSON.stringify(master) +
    (prior && prior.length ? '\n\nIMMEDIATELY PREVIOUS PLANS:\n' + JSON.stringify(prior) : '') +
    (revisionReason ? '\n\nADMIN REVISION REQUEST APPLIES TO ALL NEW PLANS:\n' + revisionReason : '');
}


/**
 * Robust chapter generator.
 *
 * Normal path:
 *   1 Gemini call -> JSON chapter payload.
 *
 * Recovery path when the model returns malformed / truncated JSON:
 *   1) Regenerate as marker-delimited plain prose (no JSON escaping risk).
 *   2) Build the compact metadata in a separate small JSON call.
 *   3) If metadata JSON also fails, keep the complete chapter and use
 *      roadmap-derived minimal metadata instead of failing the whole job.
 *
 * This means a long chapter is no longer discarded only because JSON syntax
 * around chapter_text was broken.
 */
function generateChapterResultRobust_(ctx, options) {
  const opt = options || {};
  const chapterNo = Number(opt.chapterNo || ctx.targetChapter || 0);
  const isRevision = String(opt.mode || '') === 'revision';

  const normalPrompt = isRevision
    ? promptRewriteChapter_(ctx, opt.currentText || '', opt.reason || '', opt.review || {})
    : promptWriteChapter_(ctx);

  try {
    return geminiJson_(normalPrompt);
  } catch (err) {
    if (!isGeminiJsonParseError_(err)) throw err;

    log_('WARN', 'chapter-json-fallback',
      'Primary chapter JSON invalid; switching to safe plain-text recovery.',
      {
        chapter:chapterNo,
        mode:isRevision ? 'revision' : 'draft',
        error:String(err && err.message || err)
      }
    );
  }

  // Recovery: write the chapter without JSON wrapping.
  const raw = geminiText_(
    isRevision
      ? promptRewriteChapterPlain_(ctx, opt.currentText || '', opt.reason || '', opt.review || {})
      : promptWriteChapterPlain_(ctx)
  );

  const parsed = parsePlainChapterEnvelope_(raw, chapterNo);
  const chapterText = String(parsed.chapter_text || '').trim();

  if (chapterText.length < 1500) {
    throw new Error(
      'Chapter ' + chapterNo +
      ' recovery output terlalu pendek (' + chapterText.length +
      ' chars). Retry job agar model menulis ulang chapter.'
    );
  }

  // Metadata is deliberately generated separately so a large prose body never
  // has to be escaped inside a giant JSON value.
  let meta = null;
  try {
    meta = geminiJson_(promptChapterMetadata_(ctx, chapterNo, parsed.title || '', chapterText));
  } catch (metaErr) {
    log_('WARN', 'chapter-metadata-fallback',
      'Metadata JSON gagal; chapter lengkap tetap disimpan dengan metadata minimum.',
      {
        chapter:chapterNo,
        error:String(metaErr && metaErr.message || metaErr)
      }
    );
    meta = buildMinimalChapterMetadata_(ctx, chapterNo, parsed.title || '');
  }

  meta = meta && typeof meta === 'object' ? meta : {};
  meta.chapter_number = chapterNo;
  meta.title = String(meta.title || parsed.title || chapterPlanTitle_(ctx, chapterNo));
  meta.chapter_text = chapterText;
  meta.summary = String(meta.summary || chapterPlanSummary_(ctx) || '');

  if (!Array.isArray(meta.important_events)) meta.important_events = [];
  if (!meta.character_state_changes || typeof meta.character_state_changes !== 'object' || Array.isArray(meta.character_state_changes)) {
    meta.character_state_changes = {};
  }
  if (!Array.isArray(meta.new_canon_facts)) meta.new_canon_facts = [];
  if (!Array.isArray(meta.resolved_threads)) meta.resolved_threads = [];
  if (!Array.isArray(meta.new_threads)) meta.new_threads = [];
  if (!Array.isArray(meta.foreshadowing_added)) meta.foreshadowing_added = [];
  if (!Array.isArray(meta.continuity_notes)) meta.continuity_notes = [];
  meta.ending_state = String(meta.ending_state || '');

  return meta;
}

function isGeminiJsonParseError_(err) {
  const msg = String(err && err.message || err || '');
  return /JSON parse gagal|JSON invalid|bukan JSON valid|Unexpected token|Unexpected end/i.test(msg);
}

function promptWriteChapterPlain_(ctx) {
  // v5.1: explicit length requirement (was buried in the context blob; models ignored it).
  const targetWords = Number((ctx && ctx.targetWords) || 1800);
  return (
    'You are the Writer inside Smart Novel Forge. Write ONE complete publishable novel chapter. ' +
    'LENGTH REQUIREMENT: write approximately ' + targetWords + ' words (±10%). Do not stop early — a much shorter chapter fails validation. ' +
    'Roadmap and Bible are authoritative constraints. Never invent knowledge a character should not have. ' +
    'Never reveal protected canon early. Connect naturally from the previous ending and reach the planned ending state. ' +
    'Avoid repetitive AI phrasing, excessive recap, and checklist-like prose. ' +
    'Use the requested novel language from the authoritative context.\n\n' +

    'OUTPUT FORMAT IS STRICT:\n' +
    'TITLE: <chapter title>\n' +
    '<<<CHAPTER_TEXT>>>\n' +
    '<complete chapter prose only>\n' +
    '<<<END_CHAPTER>>>\n\n' +

    'The marker <<<END_CHAPTER>>> is mandatory and must appear only after the chapter is fully complete. ' +
    'Do not output JSON. Do not output analysis or notes.\n\n' +
    'AUTHORITATIVE CONTEXT:\n' + JSON.stringify(ctx)
  );
}

function promptRewriteChapterPlain_(ctx, currentText, reason, review) {
  return (
    'You are the Revision Editor inside Smart Novel Forge. Rewrite ONE complete publishable chapter. ' +
    'Fix the admin request and review issues while preserving required roadmap events and approved canon. ' +
    'Do not create downstream contradictions. Preserve established facts unless the admin explicitly requests a retcon. ' +
    'Use the requested novel language from the authoritative context.\n\n' +

    'OUTPUT FORMAT IS STRICT:\n' +
    'TITLE: <chapter title>\n' +
    '<<<CHAPTER_TEXT>>>\n' +
    '<complete revised chapter prose only>\n' +
    '<<<END_CHAPTER>>>\n\n' +

    'The marker <<<END_CHAPTER>>> is mandatory and must appear only after the revised chapter is fully complete. ' +
    'Do not output JSON. Do not output analysis or notes.\n\n' +
    'AUTHORITATIVE CONTEXT:\n' + JSON.stringify(ctx) +
    '\n\nCURRENT CHAPTER:\n' + String(currentText || '') +
    '\n\nADMIN REVISION REQUEST:\n' + String(reason || '') +
    '\n\nPREVIOUS AI REVIEW:\n' + JSON.stringify(review || {})
  );
}

function parsePlainChapterEnvelope_(raw, chapterNo) {
  const text = String(raw || '').trim();
  const startMark = '<<<CHAPTER_TEXT>>>';
  const endMark = '<<<END_CHAPTER>>>';

  const start = text.indexOf(startMark);
  const end = text.lastIndexOf(endMark);

  if (start < 0 || end < 0 || end <= start) {
    log_('ERROR', 'chapter-plain-envelope',
      'Recovery output tidak memiliki marker lengkap.',
      {chapter:chapterNo, rawOutput:truncate_(text,5000)}
    );
    throw new Error(
      'Chapter ' + chapterNo +
      ' recovery output terpotong sebelum marker akhir. Gunakan Retry Job.'
    );
  }

  const head = text.slice(0, start).trim();
  const body = text.slice(start + startMark.length, end).trim();

  let title = '';
  const m = head.match(/(?:^|\n)\s*TITLE\s*:\s*(.+?)\s*$/im);
  if (m) title = String(m[1] || '').trim();

  return {
    title:title,
    chapter_text:body
  };
}

function promptChapterMetadata_(ctx, chapterNo, title, chapterText) {
  return (
    'Analyze the completed chapter below and return COMPACT metadata only. ' +
    'Do not rewrite the prose. Preserve facts exactly. ' +
    'The metadata will be used by Novel Brain for future continuity.\n\n' +

    'Return JSON exactly with this structure:\n' +
    JSON.stringify({
      chapter_number:chapterNo,
      title:title || 'string',
      summary:'120-220 word factual summary',
      important_events:['string'],
      character_state_changes:{},
      new_canon_facts:['string'],
      resolved_threads:['string'],
      new_threads:['string'],
      foreshadowing_added:['string'],
      ending_state:'string',
      continuity_notes:['string']
    }) +

    '\n\nTARGET CHAPTER PLAN:\n' +
    JSON.stringify((ctx && ctx.currentChapterPlan) || {}) +

    '\n\nCENTRAL STORY MEMORY:\n' +
    JSON.stringify((ctx && ctx.centralStoryMemory) || {}) +

    '\n\nCOMPLETED CHAPTER:\n' +
    String(chapterText || '')
  );
}

function buildMinimalChapterMetadata_(ctx, chapterNo, title) {
  const plan = (ctx && ctx.currentChapterPlan) || {};
  return {
    chapter_number:chapterNo,
    title:String(title || plan.title || ('Chapter ' + chapterNo)),
    summary:String(
      plan.summary ||
      plan.objective ||
      plan.goal ||
      plan.description ||
      ('Chapter ' + chapterNo + ' follows the approved roadmap plan.')
    ),
    important_events:Array.isArray(plan.requiredEvents) ? plan.requiredEvents.slice() : [],
    character_state_changes:{},
    new_canon_facts:[],
    resolved_threads:[],
    new_threads:[],
    foreshadowing_added:Array.isArray(plan.cluesOrForeshadowing) ? plan.cluesOrForeshadowing.slice() : [],
    ending_state:String(plan.endingState || ''),
    continuity_notes:['Metadata fallback used after model JSON formatting failure.']
  };
}

function chapterPlanTitle_(ctx, chapterNo) {
  const plan = (ctx && ctx.currentChapterPlan) || {};
  return String(plan.title || ('Chapter ' + chapterNo));
}

function chapterPlanSummary_(ctx) {
  const plan = (ctx && ctx.currentChapterPlan) || {};
  return String(plan.summary || plan.objective || plan.goal || plan.description || '');
}

function promptWriteChapter_(ctx) {
  // v5.1: explicit length requirement (was buried in the context blob; models ignored it).
  const targetWords = Number((ctx && ctx.targetWords) || 1800);
  return 'You are the Writer inside Smart Novel Forge. Write ONE complete novel chapter that obeys the authoritative context. ' +
    'LENGTH REQUIREMENT: write approximately ' + targetWords + ' words (±10%). Do not stop early — a much shorter chapter fails validation. ' +
    'Roadmap and Bible are constraints, not suggestions. Never invent knowledge a character should not have. Never reveal protected canon early. ' +
    'The chapter must connect naturally from the previous ending and reach the planned ending state without sounding like a checklist. ' +
    'Avoid repetitive AI phrasing and excessive recap. Use polished publishable prose in the requested language. If AUTHORITATIVE CONTEXT.styleLock.enabled is true, follow that Style Lock as a binding prose contract.\n\n' +
    'Return JSON with keys exactly like this:\n' + JSON.stringify({
      chapter_number:1,title:'string',chapter_text:'FULL CHAPTER TEXT',summary:'150-300 word factual summary',
      important_events:['string'],character_state_changes:{},new_canon_facts:['string'],resolved_threads:['string'],new_threads:['string'],
      foreshadowing_added:['string'],ending_state:'string',continuity_notes:['string']
    }) + '\n\nAUTHORITATIVE CONTEXT:\n' + JSON.stringify(ctx);
}

function promptRewriteChapter_(ctx, currentText, reason, review) {
  return 'You are the Revision Editor inside Smart Novel Forge. Rewrite ONE complete chapter. ' +
    'Fix the admin complaint and review issues while preserving required roadmap events and all already-approved canon. ' +
    'Do not create downstream contradictions. If prose can be improved without altering story facts, prefer prose changes over plot changes. If AUTHORITATIVE CONTEXT.styleLock.enabled is true, preserve it exactly unless the admin explicitly requests a style change.\n\n' +
    'Return the same JSON schema as a chapter writer:\n' + JSON.stringify({
      chapter_number:1,title:'string',chapter_text:'FULL REVISED CHAPTER',summary:'150-300 word factual summary',
      important_events:['string'],character_state_changes:{},new_canon_facts:['string'],resolved_threads:['string'],new_threads:['string'],
      foreshadowing_added:['string'],ending_state:'string',continuity_notes:['string']
    }) + '\n\nAUTHORITATIVE CONTEXT:\n' + JSON.stringify(ctx) +
    '\n\nCURRENT CHAPTER:\n' + currentText +
    '\n\nADMIN REVISION REQUEST:\n' + reason +
    '\n\nPREVIOUS AI REVIEW:\n' + JSON.stringify(review || {});
}

function promptReviewBatch_(novelId, start, end) {
  const sh = getNovelSheet_(novelId);
  const bible = getNovelRecordData_(sh, 'BIBLE', 'MASTER') || {};
  const protectedCanon = getProtectedCanonContext_(sh);
  const master = getNovelRecordData_(sh, 'ROADMAP_MASTER', 'MASTER') || {};
  const plans = getRoadmapChapterRange_(sh, start, end);
  const nextPlans = getRoadmapChapterRange_(sh, end+1, end+3);
  const memory = getNovelRecordData_(sh, 'MEMORY', 'STORY_MEMORY') || {};
  const priorCanon = getCanonSummariesBefore_(sh, start, 120);
  const futureCanon = getCanonSummariesAfter_(sh, end, 120);
  const previousFull = [];
  for (let n=Math.max(1,start-3); n<start; n++) {
    try { previousFull.push({number:n,text:getLatestChapterText_(sh,n)}); } catch (_) {}
  }
  const chapters = [];
  for (let n=start; n<=end; n++) {
    chapters.push({number:n,text:getLatestChapterText_(sh,n),summary:getNovelRecordData_(sh,'CHAPTER_SUMMARY',chapterKey_(n)) || {}});
  }

  return 'You are a strict long-form fiction continuity editor and story synchronization auditor. Review Chapters ' + start + '–' + end + ' as a connected batch. ' +
    'Your FIRST priority is story synchronization: each reviewed chapter must flow causally and physically from the previous chapter, while also fulfilling its exact chapter roadmap. ' +
    'Compare them against Bible, protected canon, chapter roadmap, all supplied prior canon summaries, the last full chapters before the batch, future canon summaries when they exist, character knowledge, timeline, plot threads, reveal pacing and prose quality. ' +
    'For every chapter verify: opening state matches the previous ending state; character location/injuries/items/emotions/relationships remain consistent; knowledge is not gained early; required roadmap events happen without replacing them with invented major events; the ending state creates a valid bridge into the next roadmap chapter. ' +
    'If this is a rewrite of an older canon chapter, any contradiction with later canon is a serious issue unless explicitly requested by the admin. ' +
    'Do not give empty praise. Identify concrete issues and exact chapters. A PASS means the batch is synchronized with roadmap, Bible and prior story and is safe for admin approval, not merely good prose.\n\n' +
    'Return JSON:\n' + JSON.stringify({
      verdict:'PASS|WARN|FAIL',summary:'string',
      storySynchronization:{
        status:'PASS|WARN|FAIL',
        previousChapterBridge:[{chapter:1,status:'PASS|WARN|FAIL',issue:'string',fix:'string'}],
        roadmapBridge:[{chapter:1,status:'PASS|WARN|FAIL',issue:'string',fix:'string'}],
        characterStateContinuity:[{chapter:1,status:'PASS|WARN|FAIL',issue:'string',fix:'string'}],
        nextChapterReadiness:[{chapter:1,status:'PASS|WARN|FAIL',issue:'string',fix:'string'}]
      },
      roadmapCompliance:{status:'PASS|WARN|FAIL',issues:[{chapter:1,issue:'string',fix:'string'}]},
      bibleCompliance:{status:'PASS|WARN|FAIL',issues:[]},
      continuity:{status:'PASS|WARN|FAIL',issues:[]},
      downstreamCanon:{status:'PASS|WARN|FAIL',issues:[]},
      characterKnowledge:{status:'PASS|WARN|FAIL',issues:[]},
      timeline:{status:'PASS|WARN|FAIL',issues:[]},
      pacing:{status:'PASS|WARN|FAIL',issues:[]},
      repetition:{status:'PASS|WARN|FAIL',issues:[]},
      plotThreads:{progressing:['string'],forgotten:['string'],newThreads:['string']},
      recommendation:{rewriteChapters:[1],minorEditChapters:[2],safeChapters:[3]}
    }) + '\n\nBIBLE:\n' + JSON.stringify(bible) +
    '\n\nPROTECTED CANON:\n' + JSON.stringify(protectedCanon) +
    '\n\nMASTER ROADMAP:\n' + JSON.stringify(master) +
    '\n\nCHAPTER PLANS:\n' + JSON.stringify(plans) +
    '\n\nNEXT ROADMAP PLANS:\n' + JSON.stringify(nextPlans) +
    '\n\nPRIOR STORY MEMORY:\n' + JSON.stringify(memory) +
    '\n\nPRIOR CANON SUMMARIES:\n' + JSON.stringify(priorCanon) +
    '\n\nPREVIOUS FULL CHAPTERS:\n' + JSON.stringify(previousFull) +
    '\n\nFUTURE CANON SUMMARIES (must remain compatible when present):\n' + JSON.stringify(futureCanon) +
    '\n\nCHAPTERS TO REVIEW:\n' + JSON.stringify(chapters);
}

function promptUpdateMemory_(oldMemory, bible, summaries, start, end) {
  return 'You maintain the Central Novel Brain after a batch has been approved as CANON. ' +
    'Merge the new canonical chapter summaries into the existing memory. Do not invent events. Keep facts compact enough for future prompts but detailed enough to preserve continuity. ' +
    'Track character location/state/knowledge separately from author secrets. Preserve unresolved plot threads and reveal constraints.\n\n' +
    'Return JSON:\n' + JSON.stringify({
      throughChapter:end,
      globalSummary:'compact but information-rich story summary',
      currentStoryState:'string',
      characters:{CHAR_ID:{name:'string',location:'string',physicalState:'string',emotionalState:'string',goals:['string'],knows:['string'],doesNotKnow:['string'],relationships:{}}},
      timeline:[{chapter:1,event:'string',relativeTime:'string'}],
      openPlotThreads:[{id:'PT_001',thread:'string',introducedChapter:1,status:'OPEN',nextExpectedDevelopment:'string'}],
      resolvedPlotThreads:[{thread:'string',resolvedChapter:1}],
      foreshadowing:[{clue:'string',introducedChapter:1,status:'ACTIVE',intendedPayoff:'string'}],
      worldEncyclopedia:{
        locations:[{id:'LOC_001',name:'string',description:'string',firstSeenChapter:1,currentState:'string',facts:['string']}],
        organizations:[{id:'ORG_001',name:'string',description:'string',members:['string'],facts:['string']}],
        items:[{id:'ITEM_001',name:'string',description:'string',owner:'string',status:'string',facts:['string']}],
        races:[{id:'RACE_001',name:'string',description:'string',facts:['string']}],
        systems:[{id:'SYS_001',name:'string',description:'string',rules:['string']}],
        historicalEvents:[{id:'HIST_001',name:'string',description:'string',relativeTime:'string',facts:['string']}],
        terminology:[{term:'string',meaning:'string',facts:['string']}]
      },
      readerKnowledge:['string'],
      protectedCanon:['string'],
      continuityWarnings:['string']
    }).replace('"throughChapter":"end"','"throughChapter":'+end) +
    '\n\nAUTHORITATIVE BIBLE:\n' + JSON.stringify(bible) +
    '\n\nOLD MEMORY:\n' + JSON.stringify(oldMemory || {}) +
    '\n\nNEW CANON SUMMARIES CHAPTER ' + start + '–' + end + ':\n' + JSON.stringify(summaries);
}

/* ========================================================================== */
/* CONTEXT BUILDING                                                            */
/* ========================================================================== */

// v5.1: canon summaries used to ship the ENTIRE CHAPTER_SUMMARY DATA_JSON per
// chapter (120 prior + 120 future). Keep only the fields the writer needs.
function compactCanonSummary_(s) {
  if (!s || typeof s !== 'object') return s;
  const d = (s.data && typeof s.data === 'object') ? s.data : {};
  const words = String(d.summary || '').split(/\s+/).filter(Boolean);
  return {
    number:s.number,
    title:String(s.title || ''),
    summary:words.slice(0, 150).join(' '),
    important_events:Array.isArray(d.important_events) ? d.important_events.slice(0, 8) : [],
    new_canon_facts:Array.isArray(d.new_canon_facts) ? d.new_canon_facts.slice(0, 8) : [],
    ending_state:String(d.ending_state || '').slice(0, 500)
  };
}

function compactCanonSummaryBundle_(bundle) {
  if (!bundle || !Array.isArray(bundle.summaries)) return bundle;
  const out = {};
  Object.keys(bundle).forEach(function(k){ out[k] = bundle[k]; });
  out.summaries = bundle.summaries.map(compactCanonSummary_);
  return out;
}

function buildChapterContext_(novelId, chapterNo) {
  const sh = getNovelSheet_(novelId);
  const bp = getNovelRecordData_(sh, 'BLUEPRINT', 'MASTER') || {};
  const bible = getNovelRecordData_(sh, 'BIBLE', 'MASTER') || {};
  const master = getNovelRecordData_(sh, 'ROADMAP_MASTER', 'MASTER') || {};
  const plan = getNovelRecordData_(sh, 'ROADMAP_CHAPTER', chapterKey_(chapterNo)) || {};
  if (!Object.keys(plan).length) throw new Error('Roadmap Chapter ' + chapterNo + ' belum tersedia.');

  const memory = getNovelRecordData_(sh, 'MEMORY', 'STORY_MEMORY') || {};
  const styleLockRaw = getNovelRecordData_(sh, 'STYLE_LOCK', 'MASTER') || {};
  const styleLock = styleLockRaw && styleLockRaw.enabled !== false ? styleLockRaw : {enabled:false};

  // Long continuity: prior CANON summaries as a compact digest.
  // For very long novels the Story Memory is still the primary compressed history,
  // while the latest summaries preserve local detail.
  // v5.1: count follows AI_BUDGET_MODE (ECONOMY 40 / BALANCED 80 / QUALITY 120)
  // and each summary is compacted to essential fields (was: full DATA_JSON each).
  const summaryLimit = aiContextSummaryLimit_();
  const allPriorCanonSummaries = compactCanonSummaryBundle_(getCanonSummariesBefore_(sh, chapterNo, summaryLimit));
  const recentSummaries = getChapterSummaries_(sh, Math.max(1,chapterNo-12), chapterNo-1);

  // Read the last three full chapter texts, not only the immediately previous one.
  const previousFullChapters = [];
  for (let n=Math.max(1, chapterNo-3); n<chapterNo; n++) {
    try {
      previousFullChapters.push({number:n, text:getLatestChapterText_(sh, n)});
    } catch (_) {}
  }

  // A small amount of forward roadmap context prevents a rewrite from breaking
  // the setup required by the next chapters without leaking prose from the future.
  // v5.1: small forward window only (was 120 full summaries) — enough to protect
  // downstream setup, without leaking far-future reveals or burning tokens.
  const nextRoadmapPlans = getRoadmapChapterRange_(sh, chapterNo+1, chapterNo+3);
  const futureCanonSummaries = compactCanonSummaryBundle_(getCanonSummariesAfter_(sh, chapterNo, 10));

  return {
    blueprint:bp,
    bible:bible,
    protectedCanon:getProtectedCanonContext_(sh),
    masterRoadmap:master,
    currentChapterPlan:plan,
    nextRoadmapPlans:nextRoadmapPlans,
    futureCanonSummaries:futureCanonSummaries,
    centralStoryMemory:memory,
    styleLock:styleLock,
    allPriorCanonSummaries:allPriorCanonSummaries,
    recentChapterSummaries:recentSummaries,
    previousFullChapters:previousFullChapters,
    targetChapter:chapterNo,
    // v5.1: explicit word target (was buried inside the context blob; models ignored it).
    targetWords:Number((bp && (bp.targetWordsPerChapter || bp.wordsPerChapter)) || defaultWords_()),
    hardRules:[
      'Bible and approved roadmap are authoritative.',
      'Before writing or rewriting, reconcile the target with all prior canon summaries and the last three full chapters.',
      'Never reveal protected canon before its allowed reveal window.',
      'Character knowledge boundaries are mandatory.',
      'Preserve causal continuity with previous chapters.',
      'Do not contradict already CANON chapters.',
      'Do not change established facts merely to improve prose.',
      'Check the next three roadmap plans so the ending does not break downstream setup.',
      'If later CANON chapters already exist, the rewrite must remain compatible with their established facts and states unless the admin explicitly requests a retcon.',
      'Reach the roadmap ending state without mechanically listing roadmap beats.',
      'If Style Lock is enabled, its prose rules are binding. Preserve the established voice, POV, tense, sentence rhythm, dialogue style, paragraph density, imagery level, and banned tendencies.'
    ]
  };
}

/* ========================================================================== */
/* DATABASE                                                                    */
/* ========================================================================== */

function ensureCentralDb_() {
  const ss=getDb_();
  // Admin / Telegram only. Legacy Web sheets, if present from v4, are left
  // untouched so migrateV4WebDataToMultiDb() can import them safely.
  ensureSheet_(ss,SNF.SHEETS.INDEX,SNF.INDEX_HEADERS);
  ensureSheet_(ss,SNF.SHEETS.JOBS,SNF.JOB_HEADERS);
  ensureSheet_(ss,SNF.SHEETS.SESSIONS,SNF.SESSION_HEADERS);
  ensureSheet_(ss,SNF.SHEETS.LOGS,SNF.LOG_HEADERS);
  ensureSheet_(ss,SNF.SHEETS.PUBLIC_USERS,SNF.PUBLIC_USER_HEADERS);
  return ss;
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const range = sh.getRange(1,1,1,headers.length);
  const existing = range.getValues()[0];
  if (existing.join('|') !== headers.join('|')) {
    range.setValues([headers]);
    range.setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

var SNF_SS_RUNTIME_CACHE_={};

function openSpreadsheetCached_(id){
  id=String(id||'').trim();
  if(!id)throw new Error('Spreadsheet ID kosong.');
  if(SNF_SS_RUNTIME_CACHE_[id])return SNF_SS_RUNTIME_CACHE_[id];
  const ss=SpreadsheetApp.openById(id);
  SNF_SS_RUNTIME_CACHE_[id]=ss;
  return ss;
}

function getDb_(){return openSpreadsheetCached_(getCentralDbId_());}

function getUserRegistryDbId_(){
  const p=PropertiesService.getScriptProperties();
  let id=String(p.getProperty('USER_REGISTRY_DB_ID')||'').trim();
  if(id){
    try{openSpreadsheetCached_(id);return id;}catch(_){}
  }
  return ensureUserRegistryDb_().getId();
}

function ensureUserRegistryDb_(){
  const p=PropertiesService.getScriptProperties();
  let id=String(p.getProperty('USER_REGISTRY_DB_ID')||'').trim();
  let ss=null;
  if(id){try{ss=openSpreadsheetCached_(id);}catch(_){}}

  if(!ss){
    const root=ensureRootFolder_();
    const webRoot=getOrCreateChildFolder_(root,'WEB_USERS');
    const files=webRoot.getFilesByName('User NovelForge DB');
    while(files.hasNext()&&!ss){
      const f=files.next();
      try{ss=openSpreadsheetCached_(f.getId());}catch(_){}
    }
    if(!ss){
      ss=SpreadsheetApp.create('User NovelForge DB');
      SNF_SS_RUNTIME_CACHE_[ss.getId()]=ss;
      try{DriveApp.getFileById(ss.getId()).moveTo(webRoot);}catch(_){}
    }
    p.setProperty('USER_REGISTRY_DB_ID',ss.getId());
  }

  ensureSheet_(ss,SNF.SHEETS.WEB_USERS,SNF.WEB_USER_HEADERS);
  ensureSheet_(ss,SNF.SHEETS.WEB_SESSIONS,SNF.WEB_SESSION_HEADERS);
  ensureSheet_(ss,SNF.SHEETS.WEB_NOVELS,SNF.INDEX_HEADERS);
  ensureSheet_(ss,SNF.SHEETS.WEB_JOBS,SNF.WEB_JOB_DIR_HEADERS);
  ensureSheet_(ss,SNF.SHEETS.LOGS,SNF.LOG_HEADERS);

  const def=ss.getSheetByName('Sheet1');
  if(def && ss.getSheets().length>1){try{ss.deleteSheet(def);}catch(_){}}
  return ss;
}

function getWebRegistryDb_(){return openSpreadsheetCached_(getUserRegistryDbId_());}
function getWebRegistrySheet_(name){
  const sh=getWebRegistryDb_().getSheetByName(name);
  if(!sh)throw new Error('Registry sheet tidak ditemukan: '+name+'. Jalankan setupSmartNovelForge().');
  return sh;
}
function getWebUserSystemSheet_(userId,name,headers){
  const ss=ensureWebUserDb_(String(userId||'').toUpperCase());
  return ensureSheet_(ss,name,headers);
}
function getWebUserIndexSheet_(userId){return getWebUserSystemSheet_(userId,SNF.SHEETS.INDEX,SNF.INDEX_HEADERS);}
function getWebUserJobsSheet_(userId){return getWebUserSystemSheet_(userId,SNF.SHEETS.JOBS,SNF.JOB_HEADERS);}

function getSystemSheet_(name) { return getDb_().getSheetByName(name); }

function getNovelSheet_(novelId){
  const idx=getNovelIndex_(String(novelId||'').toUpperCase());
  if(!idx)throw new Error('Novel tidak ditemukan: '+novelId);
  let ss=getDb_();
  if(String(idx.OWNER_TYPE||'')==='WEB_USER'){
    const dbId=String(idx.DB_ID||'')||String((webUserById_(idx.OWNER_ID)||{}).DB_ID||'');
    if(!dbId)throw new Error('Database private Web user belum tersedia: '+novelId);
    ss=openSpreadsheetCached_(dbId);
  }
  const sh=ss.getSheetByName(String(novelId||'').toUpperCase());
  if(!sh)throw new Error('Novel sheet tidak ditemukan: '+novelId);
  return sh;
}

function createNovelSheet_(novelId,ownerId){
  let ss=getDb_();
  if(/^WUSR_[A-Z0-9]+$/i.test(String(ownerId||'')))ss=ensureWebUserDb_(String(ownerId).toUpperCase());
  let sh=ss.getSheetByName(novelId);
  if(!sh)sh=ss.insertSheet(novelId);
  sh.getRange(1,1,1,SNF.NOVEL_HEADERS.length).setValues([SNF.NOVEL_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function upsertNovelIndex_(obj){
  const isWeb=String(obj.OWNER_TYPE||'')==='WEB_USER'||/^WUSR_[A-Z0-9]+$/i.test(String(obj.OWNER_ID||''));
  if(isWeb){
    const uid=String(obj.OWNER_ID||'').toUpperCase();
    const ss=ensureWebUserDb_(uid);
    obj.OWNER_ID=uid;obj.OWNER_TYPE='WEB_USER';obj.SOURCE=obj.SOURCE||'WEB';obj.DB_ID=ss.getId();
    const sh=ensureSheet_(ss,SNF.SHEETS.INDEX,SNF.INDEX_HEADERS);
    const row=findRowByFirstCol_(sh,obj.NOVEL_ID);
    const vals=SNF.INDEX_HEADERS.map(function(h){return obj[h]!==undefined?obj[h]:'';});
    if(row)sh.getRange(row,1,1,vals.length).setValues([vals]);else sh.appendRow(vals);
    upsertWebNovelDirectory_(obj);
    return;
  }

  const sh=getSystemSheet_(SNF.SHEETS.INDEX);
  const row=findRowByFirstCol_(sh,obj.NOVEL_ID);
  const vals=SNF.INDEX_HEADERS.map(function(h){return obj[h]!==undefined?obj[h]:'';});
  if(row)sh.getRange(row,1,1,vals.length).setValues([vals]);else sh.appendRow(vals);
}

function updateNovelIndexFields_(novelId,fields){
  novelId=String(novelId||'').toUpperCase();
  const admin=getSystemSheet_(SNF.SHEETS.INDEX);
  const ar=findRowByFirstCol_(admin,novelId);
  if(ar){
    Object.keys(fields).forEach(function(k){
      const c=SNF.INDEX_HEADERS.indexOf(k)+1;if(c>0)admin.getRange(ar,c).setValue(fields[k]);
    });
    admin.getRange(ar,SNF.INDEX_HEADERS.indexOf('UPDATED_AT')+1).setValue(isoNow_());
    return;
  }

  const dir=getWebNovelDirectory_(novelId);
  if(!dir)throw new Error('Index novel tidak ditemukan: '+novelId);
  const uid=String(dir.OWNER_ID||'').toUpperCase();
  const sh=getWebUserIndexSheet_(uid),row=findRowByFirstCol_(sh,novelId);
  if(!row)throw new Error('Index private novel tidak ditemukan: '+novelId);
  Object.keys(fields).forEach(function(k){
    const c=SNF.INDEX_HEADERS.indexOf(k)+1;if(c>0)sh.getRange(row,c).setValue(fields[k]);
  });
  sh.getRange(row,SNF.INDEX_HEADERS.indexOf('UPDATED_AT')+1).setValue(isoNow_());
  const fresh=rowObject_(SNF.INDEX_HEADERS,sh.getRange(row,1,1,SNF.INDEX_HEADERS.length).getValues()[0]);
  upsertWebNovelDirectory_(fresh);
}

function getNovelIndex_(novelId){
  novelId=String(novelId||'').trim().toUpperCase();
  if(!novelId)return null;

  // Telegram/Admin DB first.
  const admin=getSystemSheet_(SNF.SHEETS.INDEX);
  const ar=findRowByFirstCol_(admin,novelId);
  if(ar)return rowObject_(SNF.INDEX_HEADERS,admin.getRange(ar,1,1,SNF.INDEX_HEADERS.length).getValues()[0]);

  // Web directory contains metadata only and routes to the private user DB.
  try{return getWebNovelDirectory_(novelId);}catch(_){return null;}
}

function listNovels_() {
  const sh = getSystemSheet_(SNF.SHEETS.INDEX);
  if (sh.getLastRow()<2) return [];
  return sh.getRange(2,1,sh.getLastRow()-1,SNF.INDEX_HEADERS.length).getValues().map(function(r){return rowObject_(SNF.INDEX_HEADERS,r);});
}

function upsertNovelRecord_(sh, type, key, chapter, arc, title, data, status, version, fileId) {
  const row = findNovelRecordRow_(sh,type,key);
  const now = isoNow_();
  const old = row ? sh.getRange(row,1,1,SNF.NOVEL_HEADERS.length).getValues()[0] : null;
  const ver = version || (old ? Number(old[7]||0)+1 : 1);
  const values = [type,key,chapter||'',arc||'',title||'',JSON.stringify(data == null ? {} : data),status||'',ver,fileId||'',now];
  if (row) sh.getRange(row,1,1,values.length).setValues([values]);
  else sh.appendRow(values);
  return ver;
}

function getNovelRecord_(sh,type,key) {
  const row = findNovelRecordRow_(sh,type,key);
  if (!row) return null;
  const vals = sh.getRange(row,1,1,SNF.NOVEL_HEADERS.length).getValues()[0];
  const o = rowObject_(SNF.NOVEL_HEADERS, vals);
  o.DATA = safeJson_(o.DATA_JSON, {});
  return o;
}

function getNovelRecordData_(sh,type,key) {
  const r = getNovelRecord_(sh,type,key);
  return r ? r.DATA : null;
}

function getNovelRecordFileId_(sh,type,key) {
  const r = getNovelRecord_(sh,type,key);
  return r ? String(r.FILE_ID||'') : '';
}

function getRecordVersion_(sh,type,key) {
  const r = getNovelRecord_(sh,type,key);
  return r ? Number(r.VERSION||0) : 0;
}
function nextRecordVersion_(sh,type,key) { return getRecordVersion_(sh,type,key)+1; }

function updateNovelRecordStatus_(sh,type,key,status) {
  const row = findNovelRecordRow_(sh,type,key);
  if (!row) return;
  sh.getRange(row,7).setValue(status);
  sh.getRange(row,10).setValue(isoNow_());
}

function findNovelRecordRow_(sh,type,key) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const vals = sh.getRange(2,1,last-1,2).getValues();
  for (let i=0;i<vals.length;i++) {
    if (String(vals[i][0])===String(type) && String(vals[i][1])===String(key)) return i+2;
  }
  return 0;
}

function getCanonSummariesBefore_(sh, chapterNo, maxItems) {
  const last = sh.getLastRow();
  if (last < 2) return {throughChapter:0,omittedEarlier:false,summaries:[]};
  const vals = sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
  const out=[];
  vals.forEach(function(r){
    if (String(r[0])!=='CHAPTER_SUMMARY' || String(r[6])!=='CANON') return;
    const n=Number(r[2]||0);
    if (!n || n>=Number(chapterNo)) return;
    out.push({
      number:n,
      title:String(r[4]||''),
      version:Number(r[7]||1),
      data:safeJson_(r[5],{})
    });
  });
  out.sort(function(a,b){return a.number-b.number;});
  const limit=Math.max(20,Number(maxItems||120));
  const trimmed=out.length>limit?out.slice(out.length-limit):out;
  return {
    throughChapter:out.length?out[out.length-1].number:0,
    omittedEarlier:out.length>trimmed.length,
    omittedCount:Math.max(0,out.length-trimmed.length),
    summaries:trimmed
  };
}

function getCanonSummariesAfter_(sh, chapterNo, maxItems) {
  const last = sh.getLastRow();
  if (last < 2) return {fromChapter:0,omittedLater:false,summaries:[]};
  const vals = sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
  const out=[];
  vals.forEach(function(r){
    if (String(r[0])!=='CHAPTER_SUMMARY' || String(r[6])!=='CANON') return;
    const n=Number(r[2]||0);
    if (!n || n<=Number(chapterNo)) return;
    out.push({
      number:n,
      title:String(r[4]||''),
      version:Number(r[7]||1),
      data:safeJson_(r[5],{})
    });
  });
  out.sort(function(a,b){return a.number-b.number;});
  const limit=Math.max(20,Number(maxItems||120));
  const trimmed=out.length>limit?out.slice(0,limit):out;
  return {
    fromChapter:out.length?out[0].number:0,
    omittedLater:out.length>trimmed.length,
    omittedCount:Math.max(0,out.length-trimmed.length),
    summaries:trimmed
  };
}

function getProtectedCanonContext_(sh) {
  const out=[];
  const last=sh.getLastRow();
  if (last>=2) {
    const vals=sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
    vals.forEach(function(r){
      if (String(r[0])==='PROTECTED_CANON') {
        out.push({key:String(r[1]||''),status:String(r[6]||''),data:safeJson_(r[5],{})});
      }
    });
  }
  const mem=getNovelRecordData_(sh,'MEMORY','PROTECTED_CANON');
  if (mem) out.push({key:'MEMORY_PROTECTED_CANON',status:'CANON',data:mem});
  return out;
}

function getRoadmapChapterRange_(sh,start,end) {
  if (end < start) return [];
  const out=[];
  for (let n=start;n<=end;n++) {
    const d=getNovelRecordData_(sh,'ROADMAP_CHAPTER',chapterKey_(n));
    if (d) out.push(d);
  }
  return out;
}

function getChapterSummaries_(sh,start,end) {
  if (end < start) return [];
  const out=[];
  for (let n=start;n<=end;n++) {
    const r=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
    if (r) out.push({number:n,status:r.STATUS,title:r.TITLE,data:r.DATA});
  }
  return out;
}

function getLatestChapterText_(sh,n) {
  const r = getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
  if (!r || !r.FILE_ID) throw new Error('Chapter ' + n + ' belum mempunyai file.');
  return DriveApp.getFileById(String(r.FILE_ID)).getBlob().getDataAsString('UTF-8');
}

function getReviewForJob_(sh,jobId) {
  return getNovelRecordData_(sh,'REVIEW','JOB_'+jobId);
}


/* ========================================================================== */
/* TRANSLATION CENTER                                                         */
/* ========================================================================== */

function normalizeLanguageCode_(value){
  const s = String(value || '').trim().toLowerCase();
  if (['id','id-id','indo','indonesia','indonesian','bahasa','bahasa indonesia'].indexOf(s) >= 0) return 'id';
  if (['en','en-us','en-gb','english','inggris'].indexOf(s) >= 0) return 'en';
  if (['ja','ja-jp','jp','japanese','jepang','nihongo'].indexOf(s) >= 0) return 'ja';
  return s || 'id';
}

function languageName_(code){
  const c = normalizeLanguageCode_(code);
  if (c === 'id') return 'Indonesia';
  if (c === 'en') return 'English';
  if (c === 'ja') return 'Japanese';
  return String(code || 'Unknown');
}

function defaultTranslationTargetCode_(sourceLanguage){
  const src = normalizeLanguageCode_(sourceLanguage);
  return src === 'id' ? 'en' : 'id';
}

function translationConfig_(novelId){
  const sh = getNovelSheet_(novelId);
  const idx = getNovelIndex_(novelId);
  const existing = getNovelRecordData_(sh,'TRANSLATION_CONFIG','MASTER') || {};
  return Object.assign({
    targetCode:defaultTranslationTargetCode_(idx && idx.LANGUAGE),
    autoEnabled:false,
    preserveNames:true,
    preserveLoreTerms:true,
    proseMode:'natural literary translation'
  }, existing);
}

function saveTranslationConfig_(novelId,cfg){
  const sh = getNovelSheet_(novelId);
  const next = Object.assign({}, translationConfig_(novelId), cfg || {}, {updatedAt:isoNow_()});
  upsertNovelRecord_(sh,'TRANSLATION_CONFIG','MASTER','','','',next,'ACTIVE','','');
  return next;
}

function setTranslationTarget_(novelId,targetCode){
  return saveTranslationConfig_(novelId,{targetCode:normalizeLanguageCode_(targetCode)});
}

function translationRecordKey_(targetCode,chapterNo){
  return String(normalizeLanguageCode_(targetCode)).toUpperCase() + '_CH_' + pad3_(chapterNo);
}

function countTranslatedCanon_(novelId,targetCode){
  const sh = getNovelSheet_(novelId);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const prefix = String(normalizeLanguageCode_(targetCode)).toUpperCase() + '_CH_';
  const vals = sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
  let count = 0;
  vals.forEach(function(r){
    if (String(r[0]) === 'TRANSLATION' &&
        String(r[1]).indexOf(prefix) === 0 &&
        String(r[6]) === 'COMPLETE') count++;
  });
  return count;
}

function nextUntranslatedCanon_(novelId,targetCode){
  const idx = getNovelIndex_(novelId);
  if (!idx) return 0;
  const sh = getNovelSheet_(novelId);
  const latest = Number(idx.LATEST_CANON || 0);
  for (let n=1;n<=latest;n++){
    const canon = getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
    if (!canon || String(canon.STATUS) !== 'CANON') continue;
    const tr = getNovelRecord_(sh,'TRANSLATION',translationRecordKey_(targetCode,n));
    if (!tr || String(tr.STATUS) !== 'COMPLETE') return n;
  }
  return 0;
}

function parseTranslateRangeArg_(arg,latestCanon){
  const latest = Number(latestCanon || 0);
  if (!latest) return null;
  const s = String(arg || '').trim().toLowerCase();
  if (!s || s === 'next') {
    return {start:1,end:1,nextMode:true};
  }
  if (s === 'all') return {start:1,end:latest};
  let m = s.match(/^(\d{1,4})$/);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= latest ? {start:n,end:n} : null;
  }
  m = s.match(/^(\d{1,4})\s*[–—-]\s*(\d{1,4})$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  const max = Math.max(1,Math.min(1000,Number(prop_('TRANSLATE_MAX_RANGE') || 1000)));
  if (!a || !b || b < a || b > latest || (b-a+1) > max) return null;
  return {start:a,end:b};
}

function handleTranslateCommand_(chatId,userId,session,arg){
  const novelId = session.activeNovelId || '';
  if (!novelId) {
    sendMessage_(chatId, '📚 Pilih novel dulu dengan /novels lalu <code>/use NVL_xxxx</code>.');
    return;
  }
  const idx = getNovelIndex_(novelId);
  if (!idx || !Number(idx.LATEST_CANON || 0)) {
    sendMessage_(chatId, '❌ Novel ini belum mempunyai chapter Canon untuk diterjemahkan.');
    return;
  }

  if (!String(arg || '').trim()) {
    sendTranslationCenter_(chatId, novelId);
    return;
  }

  const parts = String(arg).trim().split(/\s+/);
  const rangeArg = parts[0];
  const targetCode = normalizeLanguageCode_(parts[1] || translationConfig_(novelId).targetCode || defaultTranslationTargetCode_(idx.LANGUAGE));
  let range = parseTranslateRangeArg_(rangeArg, Number(idx.LATEST_CANON || 0));
  if (!range) {
    sendMessage_(chatId,
      'Format: <code>/translate 1-50 id</code>, <code>/translate all id</code>, atau buka <code>/translate</code>.');
    return;
  }
  if (range.nextMode) {
    const next = nextUntranslatedCanon_(novelId,targetCode);
    if (!next) {
      sendMessage_(chatId,'✅ Semua Canon sudah diterjemahkan ke '+escapeHtml_(languageName_(targetCode))+'.');
      return;
    }
    range = {start:next,end:next};
  }
  startTranslationJob_(chatId,userId,novelId,range,targetCode);
}

function sendTranslationCenter_(chatId,novelId){
  const idx = getNovelIndex_(novelId);
  if (!idx) throw new Error('Novel tidak ditemukan.');
  const cfg = translationConfig_(novelId);
  const targetCode = normalizeLanguageCode_(cfg.targetCode);
  const latest = Number(idx.LATEST_CANON || 0);
  const translated = countTranslatedCanon_(novelId,targetCode);
  const next = nextUntranslatedCanon_(novelId,targetCode);

  sendMessage_(chatId,
    '🌐 <b>TRANSLATION CENTER</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n\n' +
    'Source      : <b>' + escapeHtml_(idx.LANGUAGE || '-') + '</b>\n' +
    'Target      : <b>' + escapeHtml_(languageName_(targetCode)) + '</b>\n' +
    'Canon       : <b>' + latest + '</b>\n' +
    'Translated  : <b>' + translated + '</b>\n' +
    'Next        : <b>' + (next ? ('Chapter ' + next) : 'Complete') + '</b>\n' +
    'Auto        : <b>' + (cfg.autoEnabled ? '🟢 ON' : '⚪ OFF') + '</b>\n\n' +
    'Engine      : <b>Google Translate</b>\n\n' +
    'Output Drive:\n<code>NOVEL/Translate/' + escapeHtml_(safeFileName_(idx.TITLE)) + '/Chapter_XXX.txt</code>',
    keyboard_([
      [
        {text:'🇮🇩 Indonesia',callback_data:'TR_LANG|' + novelId + '|id'},
        {text:'🇬🇧 English',callback_data:'TR_LANG|' + novelId + '|en'},
        {text:'🇯🇵 Japanese',callback_data:'TR_LANG|' + novelId + '|ja'}
      ],
      [
        {text:'▶️ NEXT',callback_data:'TR_NEXT|' + novelId + '|' + targetCode},
        {text:'📚 RANGE',callback_data:'TR_RANGE|' + novelId + '|' + targetCode}
      ],
      [
        {text:'🌐 ALL CANON',callback_data:'TR_ALL|' + novelId + '|' + targetCode}
      ],
      [
        {text:(cfg.autoEnabled?'🟢':'⚪')+' AUTO TRANSLATE',callback_data:'TR_AUTO|' + novelId}
      ],
      [
        {text:'↩️ KEMBALI',callback_data:'NOVEL_VIEW|' + novelId}
      ]
    ]));
}

function startTranslationJob_(chatId,userId,novelId,range,targetCode){
  const idx = getNovelIndex_(novelId);
  if (!idx) throw new Error('Novel tidak ditemukan.');

  const start = Number(range.start), end = Number(range.end);
  if (!start || !end || end < start) throw new Error('Range translate tidak valid.');

  const max = Math.max(1,Math.min(2000,Number(prop_('TRANSLATE_MAX_RANGE') || 1000)));
  if ((end-start+1) > max) {
    throw new Error('Range translate terlalu besar. Maksimum saat ini ' + max + ' chapter per job.');
  }

  targetCode = normalizeLanguageCode_(targetCode);
  setTranslationTarget_(novelId,targetCode);

  const msgId = sendMessage_(chatId,
    '🌐 <b>BULK TRANSLATION JOB</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
    '🎯 Requested: Chapter ' + start + (end!==start?('–'+end):'') + '\n' +
    '📚 Latest Canon: <b>' + Number(idx.LATEST_CANON || 0) + '</b>\n' +
    '🌍 ' + escapeHtml_(idx.LANGUAGE || '-') + ' → <b>' + escapeHtml_(languageName_(targetCode)) + '</b>\n' +
    '🔧 Engine: <b>Google Translate</b>\n\n' +
    '⏳ Masuk queue...\n' +
    '<i>Chapter yang belum Canon / file-nya belum tersedia akan dilewati, bukan menggagalkan seluruh job.</i>');

  const jobId = createJob_({
    novelId:novelId,chatId:chatId,userId:userId,
    type:'TRANSLATE_BATCH',stage:'TRANSLATE',progress:1,status:'QUEUED',messageId:msgId,
    data:{
      startChapter:start,
      endChapter:end,
      nextChapter:start,
      targetCode:targetCode,
      translated:0,
      alreadyTranslated:0,
      skipped:[],
      requestedCount:(end-start+1)
    }
  });

  return jobId;
}

function translateChaptersPerWorkerStep_(){
  return Math.max(1,Math.min(10,Number(prop_('TRANSLATE_CHAPTERS_PER_STEP') || 5)));
}

function translateWorkerBudgetMs_(){
  return Math.max(30000,Math.min(270000,Number(prop_('TRANSLATE_WORKER_BUDGET_MS') || 220000)));
}

function jobTranslateBatch_(job){
  const d = job.DATA || {};
  const start = Number(d.startChapter);
  const end = Number(d.endChapter);
  let n = Number(d.nextChapter || start);
  const targetCode = normalizeLanguageCode_(d.targetCode || 'id');
  const idx = getNovelIndex_(job.NOVEL_ID);
  const sh = getNovelSheet_(job.NOVEL_ID);

  if (job.STAGE !== 'TRANSLATE') {
    throw new Error('Unknown TRANSLATE_BATCH stage: ' + job.STAGE);
  }

  const startedAt = Date.now();
  const maxPerStep = translateChaptersPerWorkerStep_();
  const budgetMs = translateWorkerBudgetMs_();

  let processedThisStep = 0;
  let translatedCount = Number(d.translated || 0);
  let alreadyCount = Number(d.alreadyTranslated || 0);
  let skipped = Array.isArray(d.skipped) ? d.skipped.slice() : [];

  while (n <= end &&
         processedThisStep < maxPerStep &&
         (Date.now() - startedAt) < budgetMs) {

    const pctBefore = Math.max(
      2,
      Math.min(96,Math.round(((n-start)/Math.max(1,end-start+1))*92)+3)
    );

    safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
      '🌐 <b>BULK TRANSLATING</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
      '🎯 Range: Chapter ' + start + '–' + end + '\n' +
      '📚 Processing: <b>Chapter ' + n + '</b>\n' +
      '🌍 → <b>' + escapeHtml_(languageName_(targetCode)) + '</b>\n' +
      '🔧 Google Translate\n\n' +
      progressBar_(pctBefore) + ' ' + pctBefore + '%\n\n' +
      '✅ New: ' + translatedCount +
      ' • ♻️ Existing: ' + alreadyCount +
      ' • ⏭ Skipped: ' + skipped.length);

    const canon = getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));

    // Missing or not-yet-canon chapters no longer abort a 1-50 / 1-100 job.
    if (!canon || String(canon.STATUS) !== 'CANON' || !canon.FILE_ID) {
      if (skipped.indexOf(n) < 0) skipped.push(n);
      n++;
      processedThisStep++;

      updateJobFields_(job.JOB_ID,{
        STATUS:'RUNNING',
        PROGRESS:Math.max(2,Math.min(96,Math.round(((n-start)/Math.max(1,end-start+1))*96))),
        DATA_JSON:JSON.stringify(Object.assign({},d,{
          nextChapter:n,
          translated:translatedCount,
          alreadyTranslated:alreadyCount,
          skipped:skipped
        }))
      });
      continue;
    }

    const sourceVersion = Number(canon.VERSION || 1);
    const existing = getNovelRecord_(sh,'TRANSLATION',translationRecordKey_(targetCode,n));

    // Don't spend Google Translate calls again if this exact Canon version
    // was already translated.
    if (existing &&
        String(existing.STATUS) === 'COMPLETE' &&
        Number((existing.DATA || {}).sourceVersion || existing.VERSION || 0) === sourceVersion &&
        existing.FILE_ID) {
      alreadyCount++;
      n++;
      processedThisStep++;

      updateJobFields_(job.JOB_ID,{
        STATUS:'RUNNING',
        PROGRESS:Math.max(2,Math.min(96,Math.round(((n-start)/Math.max(1,end-start+1))*96))),
        DATA_JSON:JSON.stringify(Object.assign({},d,{
          nextChapter:n,
          translated:translatedCount,
          alreadyTranslated:alreadyCount,
          skipped:skipped
        }))
      });
      continue;
    }

    // If this chapter throws, nextChapter stays at n. Jobs retry will resume
    // exactly here without repeating all earlier translated chapters.
    const sourceText = DriveApp.getFileById(String(canon.FILE_ID))
      .getBlob().getDataAsString('UTF-8');

    const translated = translateChapterText_(job.NOVEL_ID,n,sourceText,targetCode);

    const folder = getTranslationNovelFolder_(job.NOVEL_ID);
    const file = upsertTextFile_(folder,'Chapter_' + pad3_(n) + '.txt',translated);

    const recordData = {
      chapter:n,
      sourceLanguage:String(idx.LANGUAGE || ''),
      targetLanguage:languageName_(targetCode),
      targetCode:targetCode,
      sourceVersion:sourceVersion,
      translatedAt:isoNow_(),
      engine:'Google Translate / LanguageApp',
      jobId:job.JOB_ID
    };

    upsertNovelRecord_(
      sh,
      'TRANSLATION',
      translationRecordKey_(targetCode,n),
      n,
      '',
      canon.TITLE || ('Chapter '+n),
      recordData,
      'COMPLETE',
      sourceVersion,
      file.getId()
    );

    translatedCount++;
    n++;
    processedThisStep++;

    // Persist checkpoint after EVERY chapter. If GAS is terminated later in
    // the same worker run, completed chapters are not lost/repeated.
    updateJobFields_(job.JOB_ID,{
      STATUS:'RUNNING',
      PROGRESS:Math.max(2,Math.min(96,Math.round(((n-start)/Math.max(1,end-start+1))*96))),
      DATA_JSON:JSON.stringify(Object.assign({},d,{
        nextChapter:n,
        translated:translatedCount,
        alreadyTranslated:alreadyCount,
        skipped:skipped
      }))
    });
  }

  if (n > end) {
    updateJobFields_(job.JOB_ID,{
      STATUS:'DONE',
      STAGE:'DONE',
      PROGRESS:100,
      DATA_JSON:JSON.stringify(Object.assign({},d,{
        nextChapter:n,
        translated:translatedCount,
        alreadyTranslated:alreadyCount,
        skipped:skipped
      }))
    });

    let skippedText = '';
    if (skipped.length) {
      skippedText =
        '\n⏭ Skipped: <b>' + skipped.length + '</b>' +
        '\n<code>' + escapeHtml_(compressChapterList_(skipped)) + '</code>';
    }

    safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
      '✅ <b>BULK TRANSLATION COMPLETE</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
      '🎯 Requested: Chapter ' + start + (end!==start?('–'+end):'') + '\n' +
      '🌍 Target: <b>' + escapeHtml_(languageName_(targetCode)) + '</b>\n\n' +
      '✅ New translations: <b>' + translatedCount + '</b>\n' +
      '♻️ Already existed: <b>' + alreadyCount + '</b>' +
      skippedText +
      '\n\n📂 <code>NOVEL/Translate/' +
      escapeHtml_(safeFileName_(idx.TITLE)) +
      '/</code>');
    return;
  }

  // More chapters remain. Keep the job RUNNING; the next worker tick resumes
  // from the persisted nextChapter checkpoint.
  const pct = Math.max(
    2,
    Math.min(96,Math.round(((n-start)/Math.max(1,end-start+1))*96))
  );

  safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
    '🌐 <b>BULK TRANSLATING</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
    '🎯 Chapter ' + start + '–' + end + '\n' +
    '➡️ Next: <b>Chapter ' + n + '</b>\n\n' +
    progressBar_(pct) + ' ' + pct + '%\n\n' +
    '✅ New: ' + translatedCount +
    ' • ♻️ Existing: ' + alreadyCount +
    ' • ⏭ Skipped: ' + skipped.length +
    '\n\n<i>Worker berikutnya akan lanjut otomatis.</i>');
}

function compressChapterList_(numbers){
  const nums = (numbers || [])
    .map(Number)
    .filter(function(n){return n > 0;})
    .sort(function(a,b){return a-b;});

  if (!nums.length) return '-';

  const ranges = [];
  let start = nums[0];
  let prev = nums[0];

  for (let i=1;i<=nums.length;i++){
    const cur = nums[i];

    if (i < nums.length && cur === prev + 1) {
      prev = cur;
      continue;
    }

    ranges.push(start === prev ? String(start) : (start + '-' + prev));

    if (i < nums.length) {
      start = cur;
      prev = cur;
    }
  }

  return ranges.join(', ');
}

function translateChapterText_(novelId,chapterNo,sourceText,targetCode){
  const idx = getNovelIndex_(novelId);
  const sourceCode = googleTranslateLanguageCode_(idx && idx.LANGUAGE);
  const target = googleTranslateLanguageCode_(targetCode);

  if (!target) throw new Error('Target language Google Translate tidak didukung: ' + targetCode);

  const source = String(sourceText || '');
  if (!source.trim()) throw new Error('Chapter ' + chapterNo + ' kosong.');

  if (sourceCode && sourceCode === target) return source;

  try {
    return googleTranslateLongText_(source, sourceCode, target);
  } catch (err) {
    throw new Error('Google Translate gagal pada Chapter ' + chapterNo + ': ' +
      String(err && err.message || err));
  }
}

function googleTranslateLanguageCode_(value){
  const s = String(value || '').trim().toLowerCase();
  if (['id','id-id','indo','indonesia','indonesian','bahasa','bahasa indonesia'].indexOf(s) >= 0) return 'id';
  if (['en','en-us','en-gb','english','inggris'].indexOf(s) >= 0) return 'en';
  if (['ja','ja-jp','jp','japanese','jepang','nihongo'].indexOf(s) >= 0) return 'ja';
  if (/^[a-z]{2,3}$/.test(s)) return s;
  return '';
}

function googleTranslateLongText_(text,sourceCode,targetCode){
  const chunks = splitTextForGoogleTranslate_(String(text || ''), 4200);
  const translated = [];

  for (let i=0;i<chunks.length;i++){
    const chunk = chunks[i];
    if (!String(chunk).trim()) {
      translated.push(chunk);
      continue;
    }

    let result = null;
    let lastErr = null;

    for (let attempt=1;attempt<=3;attempt++){
      try {
        result = LanguageApp.translate(chunk, sourceCode || '', targetCode);
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < 3) Utilities.sleep(attempt * 1200);
      }
    }

    if (result == null) throw lastErr || new Error('LanguageApp.translate mengembalikan hasil kosong.');
    translated.push(String(result));
  }

  return translated.join('');
}

function splitTextForGoogleTranslate_(text,maxChars){
  maxChars = Math.max(1000,Math.min(4500,Number(maxChars || 4200)));
  const src = String(text || '');
  if (src.length <= maxChars) return [src];

  const chunks = [];
  let buffer = '';
  const parts = src.split(/(\n\s*\n)/);

  function flush_(){
    if (buffer) {
      chunks.push(buffer);
      buffer = '';
    }
  }

  function addOversize_(part){
    let rest = String(part || '');
    while (rest.length > maxChars) {
      let cut = findSafeTranslationCut_(rest,maxChars);
      if (cut < 500) cut = maxChars;
      chunks.push(rest.slice(0,cut));
      rest = rest.slice(cut);
    }
    if (rest) buffer = rest;
  }

  for (let i=0;i<parts.length;i++){
    const part = parts[i];
    if ((buffer + part).length <= maxChars) {
      buffer += part;
      continue;
    }

    flush_();
    if (part.length > maxChars) addOversize_(part);
    else buffer = part;
  }

  flush_();
  return chunks;
}

function findSafeTranslationCut_(text,maxChars){
  const head = String(text || '').slice(0,maxChars);
  const candidates = [
    head.lastIndexOf('\n\n'),
    head.lastIndexOf('\n'),
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
    head.lastIndexOf('。'),
    head.lastIndexOf('！'),
    head.lastIndexOf('？'),
    head.lastIndexOf(' ')
  ];

  for (let i=0;i<candidates.length;i++){
    if (candidates[i] >= Math.floor(maxChars * 0.60)) return candidates[i] + 1;
  }
  return maxChars;
}

function buildTranslationGlossary_(bible){
  const preserve = [];
  function addName(x){
    const name = String(x && (x.name || x.title || x.term) || '').trim();
    if (name && preserve.indexOf(name) < 0) preserve.push(name);
  }
  (bible.characters || []).forEach(addName);
  (bible.locations || []).forEach(addName);
  (bible.factions || []).forEach(addName);
  (bible.terms || bible.glossary || []).forEach(function(x){
    if (typeof x === 'string') {
      if (preserve.indexOf(x) < 0) preserve.push(x);
    } else addName(x);
  });
  return preserve.slice(0,120);
}

function enqueueAutoTranslationAfterCanon_(sourceJob,start,end){
  const cfg = translationConfig_(sourceJob.NOVEL_ID);
  if (!cfg.autoEnabled) return null;
  const targetCode = normalizeLanguageCode_(cfg.targetCode);
  const msgId = sendMessage_(sourceJob.CHAT_ID,
    '🌐 <b>AUTO TRANSLATE QUEUED</b>\n\n' +
    'Chapter ' + start + (end!==start?('–'+end):'') +
    ' → <b>' + escapeHtml_(languageName_(targetCode)) + '</b>');
  return createJob_({
    novelId:sourceJob.NOVEL_ID,chatId:sourceJob.CHAT_ID,userId:sourceJob.USER_ID,
    type:'TRANSLATE_BATCH',stage:'TRANSLATE',progress:1,status:'QUEUED',messageId:msgId,
    data:{startChapter:start,endChapter:end,nextChapter:start,targetCode:targetCode,translated:0,auto:true}
  });
}

/* ========================================================================== */
/* CANON HEALTH CHECK                                                         */
/* ========================================================================== */

function healthChunkSize_(){
  return Math.max(8,Math.min(30,Number(prop_('HEALTH_CHUNK_SIZE') || 15)));
}

function healthMergeGroupSize_(){
  return Math.max(4,Math.min(15,Number(prop_('HEALTH_MERGE_GROUP_SIZE') || 10)));
}

function handleHealthCommand_(chatId,userId,session,arg){
  const novelId = session.activeNovelId || '';
  if (!novelId) {
    sendMessage_(chatId,'📚 Pilih novel dulu dengan /novels lalu <code>/use NVL_xxxx</code>.');
    return;
  }
  const idx = getNovelIndex_(novelId);
  if (!idx || !Number(idx.LATEST_CANON || 0)) {
    sendMessage_(chatId,'❌ Novel ini belum mempunyai Canon.');
    return;
  }
  if (!String(arg || '').trim()) {
    sendCanonHealthCenter_(chatId,novelId);
    return;
  }
  const range = parseReviewRangeArg_(arg,Number(idx.LATEST_CANON || 0));
  if (!range || range.end > Number(idx.LATEST_CANON || 0)) {
    sendMessage_(chatId,'Format: <code>/health</code>, <code>/health 1-100</code>, atau <code>/health all</code>.');
    return;
  }
  startCanonHealthJob_(chatId,userId,novelId,range);
}

function sendCanonHealthCenter_(chatId,novelId){
  const idx = getNovelIndex_(novelId);
  const sh = getNovelSheet_(novelId);
  const latest = getNovelRecordData_(sh,'CANON_HEALTH','LATEST') || null;
  let latestLine = 'Belum pernah diperiksa.';
  if (latest) {
    latestLine = healthStatusIcon_(latest.status) + ' <b>' + escapeHtml_(String(latest.status || 'UNKNOWN')) +
      '</b> • through Ch' + Number(latest.endChapter || 0) +
      ' • ' + escapeHtml_(String(latest.checkedAt || ''));
  }

  sendMessage_(chatId,
    '🩺 <b>CANON HEALTH CHECK</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
    '📚 Latest Canon: <b>' + Number(idx.LATEST_CANON || 0) + '</b>\n\n' +
    'Pemeriksaan terakhir:\n' + latestLine + '\n\n' +
    'AI akan memeriksa continuity, timeline, character knowledge, protected canon, roadmap drift, plot threads, foreshadowing, dan contradictions.',
    keyboard_([
      [{text:'🩺 CHECK ALL CANON',callback_data:'HEALTH_RUN|' + novelId}],
      [{text:'📋 LAST REPORT',callback_data:'HEALTH_VIEW|' + novelId}],
      [{text:'↩️ KEMBALI',callback_data:'NOVEL_VIEW|' + novelId}]
    ]));
}

function startCanonHealthJob_(chatId,userId,novelId,range){
  const idx = getNovelIndex_(novelId);
  if (!idx) throw new Error('Novel tidak ditemukan.');
  const latest = Number(idx.LATEST_CANON || 0);
  if (!latest) throw new Error('Novel belum mempunyai Canon.');
  const r = range || {start:1,end:latest};
  if (r.start < 1 || r.end > latest || r.end < r.start) throw new Error('Range Canon Health tidak valid.');

  const msgId = sendMessage_(chatId,
    '🩺 <b>CANON HEALTH CHECK</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
    '📚 Chapter ' + r.start + (r.end!==r.start?('–'+r.end):'') + '\n\n' +
    '⏳ Menyiapkan chunk audit...');

  return createJob_({
    novelId:novelId,chatId:chatId,userId:userId,
    type:'CANON_HEALTH',stage:'SCAN_CHUNKS',progress:2,status:'QUEUED',messageId:msgId,
    data:{
      startChapter:r.start,endChapter:r.end,
      nextChunkStart:r.start,
      chunkSize:healthChunkSize_(),
      chunkKeys:[],
      mergeIndex:0,
      groupKeys:[]
    }
  });
}

function jobCanonHealth_(job){
  const d = job.DATA || {};
  const start = Number(d.startChapter), end = Number(d.endChapter);
  const sh = getNovelSheet_(job.NOVEL_ID);
  const idx = getNovelIndex_(job.NOVEL_ID);

  if (job.STAGE === 'SCAN_CHUNKS') {
    const next = Number(d.nextChunkStart || start);
    if (next > end) {
      updateJobFields_(job.JOB_ID,{
        STATUS:'RUNNING',STAGE:'MERGE_GROUPS',PROGRESS:72,
        DATA_JSON:JSON.stringify(Object.assign({},d,{mergeIndex:0,groupKeys:Array.isArray(d.groupKeys)?d.groupKeys:[]}))
      });
      return;
    }

    const chunkEnd = Math.min(end,next + Number(d.chunkSize || healthChunkSize_()) - 1);
    const report = geminiJson_(promptCanonHealthChunk_(job.NOVEL_ID,next,chunkEnd));
    const key = 'JOB_' + job.JOB_ID + '_' + pad3_(next) + '_' + pad3_(chunkEnd);
    upsertNovelRecord_(sh,'HEALTH_CHUNK',key,next,'','Canon Health '+next+'-'+chunkEnd,
      {startChapter:next,endChapter:chunkEnd,report:report},'COMPLETE',1,'');

    const keys = Array.isArray(d.chunkKeys) ? d.chunkKeys.slice() : [];
    keys.push(key);
    const done = chunkEnd-start+1;
    const pct = Math.min(70,Math.round((done/Math.max(1,end-start+1))*68)+2);

    safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
      '🩺 <b>CANON HEALTH CHECK</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
      '📚 Audited: Chapter ' + start + '–' + chunkEnd + '\n\n' +
      progressBar_(pct) + ' ' + pct + '%\n' +
      healthStatusIcon_(report.status) + ' Chunk ' + next + '–' + chunkEnd + ': <b>' + escapeHtml_(String(report.status || 'UNKNOWN')) + '</b>');

    updateJobFields_(job.JOB_ID,{
      STATUS:'RUNNING',PROGRESS:pct,
      DATA_JSON:JSON.stringify(Object.assign({},d,{nextChunkStart:chunkEnd+1,chunkKeys:keys}))
    });
    return;
  }

  if (job.STAGE === 'MERGE_GROUPS') {
    const chunkKeys = Array.isArray(d.chunkKeys) ? d.chunkKeys : [];
    const groupSize = healthMergeGroupSize_();
    const mergeIndex = Number(d.mergeIndex || 0);

    if (mergeIndex >= chunkKeys.length) {
      updateJobFields_(job.JOB_ID,{STATUS:'RUNNING',STAGE:'FINALIZE_HEALTH',PROGRESS:91});
      return;
    }

    const subset = chunkKeys.slice(mergeIndex,mergeIndex+groupSize).map(function(k){
      return getNovelRecordData_(sh,'HEALTH_CHUNK',k) || {};
    });
    const merged = geminiJson_(promptCanonHealthMerge_(job.NOVEL_ID,start,end,subset));
    const groupNo = Math.floor(mergeIndex/groupSize)+1;
    const key = 'JOB_' + job.JOB_ID + '_GROUP_' + pad3_(groupNo);
    upsertNovelRecord_(sh,'HEALTH_GROUP',key,'','','Health Group '+groupNo,merged,'COMPLETE',1,'');

    const groups = Array.isArray(d.groupKeys) ? d.groupKeys.slice() : [];
    groups.push(key);
    const nextIndex = mergeIndex + groupSize;
    const pct = Math.min(90,72 + Math.round((nextIndex/Math.max(1,chunkKeys.length))*18));
    updateJobFields_(job.JOB_ID,{
      STATUS:'RUNNING',PROGRESS:pct,
      DATA_JSON:JSON.stringify(Object.assign({},d,{mergeIndex:nextIndex,groupKeys:groups}))
    });
    return;
  }

  if (job.STAGE === 'FINALIZE_HEALTH') {
    const groups = (Array.isArray(d.groupKeys)?d.groupKeys:[]).map(function(k){
      return getNovelRecordData_(sh,'HEALTH_GROUP',k) || {};
    });
    const report = geminiJson_(promptCanonHealthFinal_(job.NOVEL_ID,start,end,groups));
    report.startChapter = start;
    report.endChapter = end;
    report.checkedAt = isoNow_();

    const folders = getNovelRecordData_(sh,'META','FOLDERS') || {};
    const folder = getFolderByIdSafe_(folders['08_CONTINUITY']);
    const jsonFile = upsertTextFile_(folder,'canon_health_latest.json',JSON.stringify(report,null,2));
    upsertTextFile_(folder,'canon_health_' + timestampFile_() + '.json',JSON.stringify(report,null,2));
    upsertNovelRecord_(sh,'CANON_HEALTH','LATEST',end,'','Canon Health',report,'COMPLETE','',jsonFile.getId());

    updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'DONE',PROGRESS:100});
    safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),renderCanonHealthReport_(idx,report),keyboard_([
      [{text:'📋 DETAIL REPORT',url:jsonFile.getUrl()}],
      [{text:'📖 KEMBALI KE NOVEL',callback_data:'NOVEL_VIEW|' + job.NOVEL_ID}]
    ]));
    return;
  }

  throw new Error('Unknown CANON_HEALTH stage: ' + job.STAGE);
}

function promptCanonHealthChunk_(novelId,start,end){
  const sh = getNovelSheet_(novelId);
  const bible = getNovelRecordData_(sh,'BIBLE','MASTER') || {};
  const memory = getNovelRecordData_(sh,'MEMORY','STORY_MEMORY') || {};
  const timeline = getNovelRecordData_(sh,'TIMELINE','GLOBAL') || {};
  const knowledge = getNovelRecordData_(sh,'CHARACTER_KNOWLEDGE','GLOBAL') || {};
  const threads = getNovelRecordData_(sh,'PLOT_THREADS','GLOBAL') || {};
  const foreshadow = getNovelRecordData_(sh,'FORESHADOWING','GLOBAL') || {};
  const style = getNovelRecordData_(sh,'STYLE_LOCK','MASTER') || {};
  const summaries = getChapterSummaries_(sh,start,end).filter(function(x){return String(x.status)==='CANON';});
  const plans = getRoadmapChapterRange_(sh,start,end);
  const before = getCanonSummariesBefore_(sh,start,25);
  const after = getCanonSummariesAfter_(sh,end,25);

  return 'You are the Canon Health auditor for a long-running novel. Audit only the supplied evidence. ' +
    'Find concrete continuity risks and cite exact chapter numbers whenever possible. Do not invent missing events. ' +
    'A HEALTHY result means no material contradiction was found in this chunk. WARN means a plausible issue needs attention. ' +
    'CRITICAL means a direct canon contradiction, impossible timeline, protected-canon violation, or character knowledge leak exists.\n\n' +
    'Return COMPACT JSON:\n' + JSON.stringify({
      status:'HEALTHY|WARN|CRITICAL',
      summary:'string',
      contradictions:[{chapter:1,issue:'string',evidence:'string'}],
      timelineIssues:[{chapter:1,issue:'string'}],
      characterKnowledgeLeaks:[{chapter:1,character:'string',issue:'string'}],
      roadmapDrift:[{chapter:1,issue:'string'}],
      protectedCanonRisks:[{chapter:1,issue:'string'}],
      plotThreadRisks:[{chapter:1,issue:'string'}],
      foreshadowingRisks:[{chapter:1,issue:'string'}],
      styleDriftHints:[{chapter:1,issue:'string'}],
      recommendedChecks:['string']
    }) +
    '\n\nBIBLE:\n' + JSON.stringify(bible) +
    '\n\nPROTECTED CANON:\n' + JSON.stringify(getProtectedCanonContext_(sh)) +
    '\n\nMEMORY:\n' + JSON.stringify(memory) +
    '\n\nTIMELINE:\n' + JSON.stringify(timeline) +
    '\n\nCHARACTER KNOWLEDGE:\n' + JSON.stringify(knowledge) +
    '\n\nPLOT THREADS:\n' + JSON.stringify(threads) +
    '\n\nFORESHADOWING:\n' + JSON.stringify(foreshadow) +
    '\n\nSTYLE LOCK:\n' + JSON.stringify(style) +
    '\n\nROADMAP PLANS:\n' + JSON.stringify(plans) +
    '\n\nCANON SUMMARIES BEFORE CHUNK:\n' + JSON.stringify(before) +
    '\n\nCANON SUMMARIES IN CHUNK:\n' + JSON.stringify(summaries) +
    '\n\nCANON SUMMARIES AFTER CHUNK:\n' + JSON.stringify(after);
}

function promptCanonHealthMerge_(novelId,start,end,subset){
  return 'Merge these Canon Health chunk audits into one compact intermediate report. ' +
    'Deduplicate repeated issues, preserve chapter numbers, and do not upgrade severity without evidence. ' +
    'Return JSON:\n' + JSON.stringify({
      status:'HEALTHY|WARN|CRITICAL',
      summary:'string',
      keyIssues:[{chapter:1,category:'string',severity:'WARN|CRITICAL',issue:'string'}],
      timelineRisks:['string'],
      knowledgeRisks:['string'],
      roadmapRisks:['string'],
      threadRisks:['string'],
      protectedCanonRisks:['string'],
      recommendedActions:['string']
    }) +
    '\n\nNOVEL: ' + novelId +
    '\nRANGE: ' + start + '-' + end +
    '\nCHUNK REPORTS:\n' + JSON.stringify(subset);
}

function promptCanonHealthFinal_(novelId,start,end,groups){
  const sh = getNovelSheet_(novelId);
  const memory = getNovelRecordData_(sh,'MEMORY','STORY_MEMORY') || {};
  return 'You are the senior Canon Health editor. Produce the FINAL health report from the merged audit groups. ' +
    'Do not invent problems. Distinguish definite contradictions from warnings. Keep the result practical for an author managing hundreds of chapters.\n\n' +
    'Return JSON:\n' + JSON.stringify({
      status:'HEALTHY|WARN|CRITICAL',
      summary:'string',
      counts:{critical:0,warnings:0},
      criticalIssues:[{chapter:1,category:'string',issue:'string',suggestedFix:'string'}],
      warnings:[{chapter:1,category:'string',issue:'string',suggestedCheck:'string'}],
      healthyAreas:['string'],
      unresolvedThreads:['string'],
      continuityPriorities:['string'],
      safeToContinueWriting:true
    }) +
    '\n\nNOVEL: ' + novelId +
    '\nRANGE: ' + start + '-' + end +
    '\nCURRENT STORY MEMORY:\n' + JSON.stringify(memory) +
    '\n\nMERGED AUDITS:\n' + JSON.stringify(groups);
}

function healthStatusIcon_(status){
  const s = String(status || '').toUpperCase();
  if (s === 'HEALTHY') return '✅';
  if (s === 'CRITICAL') return '❌';
  return '⚠️';
}

function renderCanonHealthReport_(idx,report){
  const counts = report.counts || {};
  const critical = Array.isArray(report.criticalIssues) ? report.criticalIssues : [];
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  const lines = [];

  critical.slice(0,4).forEach(function(x){
    lines.push('❌ Ch' + Number(x.chapter || 0) + ' • ' + truncate_(String(x.issue || ''),180));
  });
  warnings.slice(0,4).forEach(function(x){
    lines.push('⚠️ Ch' + Number(x.chapter || 0) + ' • ' + truncate_(String(x.issue || ''),180));
  });

  return healthStatusIcon_(report.status) + ' <b>CANON HEALTH: ' + escapeHtml_(String(report.status || 'UNKNOWN')) + '</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
    '📚 Chapter ' + Number(report.startChapter || 0) + '–' + Number(report.endChapter || 0) + '\n\n' +
    '❌ Critical: <b>' + Number(counts.critical != null ? counts.critical : critical.length) + '</b>\n' +
    '⚠️ Warning : <b>' + Number(counts.warnings != null ? counts.warnings : warnings.length) + '</b>\n' +
    '✍️ Safe to continue: <b>' + (report.safeToContinueWriting === false ? 'CHECK REQUIRED' : 'YES') + '</b>\n\n' +
    '<b>Summary</b>\n' + escapeHtml_(truncate_(report.summary || '-',900)) +
    (lines.length ? '\n\n<b>Top findings</b>\n' + escapeHtml_(lines.join('\n')) : '');
}

function sendLatestCanonHealth_(chatId,novelId){
  const idx = getNovelIndex_(novelId);
  const sh = getNovelSheet_(novelId);
  const row = getNovelRecord_(sh,'CANON_HEALTH','LATEST');
  if (!row) {
    sendMessage_(chatId,'ℹ️ Belum ada Canon Health report. Jalankan <code>/health</code>.');
    return;
  }
  const kb = [];
  if (row.FILE_ID) kb.push([{text:'📋 OPEN FULL REPORT',url:DriveApp.getFileById(String(row.FILE_ID)).getUrl()}]);
  kb.push([{text:'↩️ KEMBALI',callback_data:'NOVEL_HEALTH|' + novelId}]);
  sendMessage_(chatId,renderCanonHealthReport_(idx,row.DATA),keyboard_(kb));
}

/* ========================================================================== */
/* STYLE LOCK                                                                  */
/* ========================================================================== */

function getStyleLock_(novelId){
  const sh = getNovelSheet_(novelId);
  return getNovelRecordData_(sh,'STYLE_LOCK','MASTER') || null;
}

function sendStyleCenter_(chatId,novelId){
  const idx = getNovelIndex_(novelId);
  if (!idx) throw new Error('Novel tidak ditemukan.');
  const style = getStyleLock_(novelId);
  const enabled = !!(style && style.enabled !== false);
  const status = style ? (enabled ? '🟢 ENABLED' : '⚪ DISABLED') : '⚪ NOT CREATED';

  sendMessage_(chatId,
    '🧬 <b>STYLE LOCK</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
    'Status: <b>' + status + '</b>\n\n' +
    (style
      ? 'Voice: ' + escapeHtml_(truncate_(style.voice || '-',220)) + '\n' +
        'POV: ' + escapeHtml_(style.pov || '-') + '\n' +
        'Tense: ' + escapeHtml_(style.tense || '-') + '\n' +
        'Pacing: ' + escapeHtml_(truncate_(style.pacing || '-',180))
      : 'Belum ada Style Profile. AI bisa menganalisis prose Canon dan Bible untuk membuatnya.') +
    '\n\nSaat aktif, WRITE dan REWRITE wajib mengikuti Style Lock.',
    keyboard_([
      [{text:style?'🔬 RE-ANALYZE STYLE':'🔬 ANALYZE & LOCK',callback_data:'STYLE_ANALYZE|' + novelId}],
      [
        {text:'📋 VIEW PROFILE',callback_data:'STYLE_VIEW|' + novelId},
        {text:enabled?'⏸ DISABLE':'▶️ ENABLE',callback_data:'STYLE_TOGGLE|' + novelId}
      ],
      [{text:'✏️ CUSTOM RULES',callback_data:'STYLE_EDIT|' + novelId}],
      [{text:'↩️ KEMBALI',callback_data:'NOVEL_VIEW|' + novelId}]
    ]));
}

function toggleStyleLock_(novelId){
  const sh = getNovelSheet_(novelId);
  let style = getNovelRecordData_(sh,'STYLE_LOCK','MASTER') || {};
  if (!Object.keys(style).length) {
    style = {
      enabled:true,
      voice:'Not analyzed yet',
      pov:'',
      tense:'',
      pacing:'',
      signatureRules:[],
      avoid:[],
      createdAt:isoNow_()
    };
  } else {
    style.enabled = style.enabled === false;
  }
  style.updatedAt = isoNow_();
  const folders = getNovelRecordData_(sh,'META','FOLDERS') || {};
  let fileId = '';
  if (folders['01_BIBLE']) {
    const f = upsertTextFile_(getFolderByIdSafe_(folders['01_BIBLE']),'style_lock.json',JSON.stringify(style,null,2));
    fileId = f.getId();
  }
  upsertNovelRecord_(sh,'STYLE_LOCK','MASTER','','','Style Lock',style,style.enabled===false?'DISABLED':'ENABLED','',fileId);
  return style;
}

function jobStyleAnalyze_(job){
  if (job.STAGE !== 'ANALYZE') throw new Error('Unknown STYLE_ANALYZE stage: ' + job.STAGE);
  const d = job.DATA || {};
  const sh = getNovelSheet_(job.NOVEL_ID);
  const idx = getNovelIndex_(job.NOVEL_ID);
  const bp = getNovelRecordData_(sh,'BLUEPRINT','MASTER') || {};
  const bible = getNovelRecordData_(sh,'BIBLE','MASTER') || {};
  const current = getNovelRecordData_(sh,'STYLE_LOCK','MASTER') || {};
  const samples = styleSamples_(job.NOVEL_ID);

  safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
    '🧬 <b>STYLE LOCK ANALYSIS</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n' +
    '📚 Samples: <b>' + samples.length + '</b> Canon chapter(s)\n\n' +
    '⏳ Building prose fingerprint...');

  const profile = geminiJson_(
    'You are the Style Director inside Smart Novel Forge. Build a durable STYLE LOCK for future chapters. ' +
    'Extract prose characteristics, not plot facts. The profile must be actionable enough that another writer can imitate the established narrative style without copying exact sentences. ' +
    'If ADMIN INSTRUCTION exists, treat it as authoritative and merge it with the observed style. ' +
    'Do not include copyrighted passages or long quotations from samples.\n\n' +
    'Return JSON:\n' + JSON.stringify({
      enabled:true,
      voice:'string',
      pov:'string',
      tense:'string',
      sentenceRhythm:'string',
      paragraphing:'string',
      dialogueStyle:'string',
      expositionStyle:'string',
      imagery:'string',
      emotionalTone:'string',
      pacing:'string',
      lexicalPreferences:['string'],
      signatureRules:['string'],
      avoid:['string'],
      dialogueRules:['string'],
      sceneRules:['string'],
      chapterEndingRules:['string']
    }) +
    '\n\nBLUEPRINT:\n' + JSON.stringify(bp) +
    '\n\nBIBLE STYLE/TONE CONTEXT:\n' + JSON.stringify({
      tone:bible.tone || bible.style || bible.writingStyle || '',
      pov:bible.pov || '',
      specialRules:bible.specialRules || []
    }) +
    '\n\nCURRENT STYLE LOCK:\n' + JSON.stringify(current) +
    '\n\nADMIN INSTRUCTION:\n' + String(d.instruction || '') +
    '\n\nCANON PROSE SAMPLES:\n' + JSON.stringify(samples)
  );

  profile.enabled = true;
  profile.updatedAt = isoNow_();
  profile.source = d.mode === 'custom' ? 'ADMIN_CUSTOM_PLUS_AI' : 'AI_CANON_ANALYSIS';

  const folders = getNovelRecordData_(sh,'META','FOLDERS') || {};
  const file = upsertTextFile_(getFolderByIdSafe_(folders['01_BIBLE']),'style_lock.json',JSON.stringify(profile,null,2));
  upsertNovelRecord_(sh,'STYLE_LOCK','MASTER','','','Style Lock',profile,'ENABLED','',file.getId());
  updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'DONE',PROGRESS:100});

  safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
    '✅ <b>STYLE LOCK ENABLED</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(idx.TITLE) + '</b>\n\n' +
    '🎙 Voice: ' + escapeHtml_(truncate_(profile.voice || '-',500)) + '\n' +
    '👁 POV: ' + escapeHtml_(profile.pov || '-') + '\n' +
    '⏱ Pacing: ' + escapeHtml_(truncate_(profile.pacing || '-',300)) + '\n\n' +
    'WRITE dan REWRITE sekarang otomatis menerima Style Lock ini.',
    keyboard_([
      [{text:'📋 VIEW FULL PROFILE',callback_data:'STYLE_VIEW|' + job.NOVEL_ID}],
      [{text:'📖 KEMBALI KE NOVEL',callback_data:'NOVEL_VIEW|' + job.NOVEL_ID}]
    ]));
}

function styleSamples_(novelId){
  const idx = getNovelIndex_(novelId);
  const sh = getNovelSheet_(novelId);
  const latest = Number(idx && idx.LATEST_CANON || 0);
  if (!latest) return [];

  const candidates = [
    1,
    Math.max(1,Math.round(latest/3)),
    Math.max(1,Math.round((latest*2)/3)),
    latest
  ];
  const seen = {};
  const out = [];
  candidates.forEach(function(n){
    if (seen[n]) return;
    seen[n] = true;
    try {
      const row = getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
      if (!row || String(row.STATUS) !== 'CANON') return;
      const text = getLatestChapterText_(sh,n);
      out.push({
        chapter:n,
        title:row.TITLE || ('Chapter '+n),
        excerpt:truncate_(text,5000)
      });
    } catch (_) {}
  });
  return out;
}

function sendStyleProfile_(chatId,novelId){
  const style = getStyleLock_(novelId);
  if (!style) {
    sendMessage_(chatId,'ℹ️ Style Lock belum dibuat. Tekan <b>ANALYZE & LOCK</b> terlebih dahulu.');
    return;
  }
  const rules = Array.isArray(style.signatureRules) ? style.signatureRules.slice(0,12) : [];
  const avoid = Array.isArray(style.avoid) ? style.avoid.slice(0,10) : [];
  sendMessage_(chatId,
    '🧬 <b>STYLE PROFILE</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    'Status: <b>' + (style.enabled===false?'DISABLED':'ENABLED') + '</b>\n\n' +
    '🎙 <b>Voice</b>\n' + escapeHtml_(truncate_(style.voice || '-',700)) + '\n\n' +
    '👁 <b>POV / Tense</b>\n' + escapeHtml_((style.pov || '-') + ' • ' + (style.tense || '-')) + '\n\n' +
    '🧱 <b>Sentence / Paragraph</b>\n' +
    escapeHtml_(truncate_((style.sentenceRhythm || '-') + '\n' + (style.paragraphing || '-'),700)) + '\n\n' +
    '💬 <b>Dialogue</b>\n' + escapeHtml_(truncate_(style.dialogueStyle || '-',550)) + '\n\n' +
    '⏱ <b>Pacing</b>\n' + escapeHtml_(truncate_(style.pacing || '-',500)) +
    (rules.length ? '\n\n🔒 <b>Signature Rules</b>\n' + escapeHtml_(rules.map(function(x){return '• '+x;}).join('\n')) : '') +
    (avoid.length ? '\n\n🚫 <b>Avoid</b>\n' + escapeHtml_(avoid.map(function(x){return '• '+x;}).join('\n')) : ''),
    keyboard_([[{text:'↩️ STYLE CENTER',callback_data:'NOVEL_STYLE|' + novelId}]])
  );
}


/* ========================================================================== */
/* NOVEL BRAIN TRACKERS                                                       */
/* ========================================================================== */

function sendNovelBrainCenter_(chatId,novelId){
  const idx=getNovelIndex_(novelId);
  if(!idx)throw new Error('Novel tidak ditemukan.');
  sendMessage_(chatId,
    '🧠 <b>NOVEL BRAIN</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>'+escapeHtml_(idx.TITLE)+'</b>\n\n' +
    'Data ini diperbarui setelah batch menjadi Canon.\n\n' +
    '🎭 Character & Knowledge Tracker\n' +
    '🧵 Plot Thread & Foreshadowing\n' +
    '🕰 Timeline Manager\n' +
    '🩺 Canon Health\n',
    keyboard_([
      [{text:'🎭 CHARACTERS',callback_data:'NOVEL_BRAIN_CHAR|' + novelId}],
      [{text:'🧵 THREADS',callback_data:'NOVEL_BRAIN_THREAD|' + novelId}],
      [{text:'🕰 TIMELINE',callback_data:'NOVEL_BRAIN_TIME|' + novelId}],
      [{text:'↩️ KEMBALI',callback_data:'NOVEL_VIEW|' + novelId}]
    ]));
}

function sendCharacterTracker_(chatId,novelId,query){
  const sh=getNovelSheet_(novelId);
  const idx=getNovelIndex_(novelId);
  const chars=getNovelRecordData_(sh,'CHARACTER_STATES','GLOBAL') || {};
  const keys=Object.keys(chars);

  if(!String(query||'').trim()){
    if(!keys.length){
      sendMessage_(chatId,'ℹ️ Character Tracker belum memiliki data. Canonize chapter terlebih dahulu.');
      return;
    }
    const lines=keys.slice(0,30).map(function(k){
      const c=chars[k]||{};
      return '• <b>'+escapeHtml_(c.name||k)+'</b> — '+escapeHtml_(truncate_(c.location||c.physicalState||'-',80));
    });
    sendMessage_(chatId,
      '🎭 <b>CHARACTER TRACKER</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📖 '+escapeHtml_(idx.TITLE)+'\n\n' +
      lines.join('\n') +
      '\n\nGunakan <code>/character Nama</code> untuk detail.');
    return;
  }

  const q=String(query).trim().toLowerCase();
  let found=null,foundKey='';
  keys.some(function(k){
    const c=chars[k]||{};
    if(String(k).toLowerCase()===q || String(c.name||'').toLowerCase().indexOf(q)>=0){
      found=c;foundKey=k;return true;
    }
    return false;
  });

  if(!found){
    sendMessage_(chatId,'❌ Karakter <b>'+escapeHtml_(query)+'</b> tidak ditemukan di Character Tracker.');
    return;
  }

  const knows=Array.isArray(found.knows)?found.knows:[];
  const doesnt=Array.isArray(found.doesNotKnow)?found.doesNotKnow:[];
  const goals=Array.isArray(found.goals)?found.goals:[];
  const rel=found.relationships&&typeof found.relationships==='object'?found.relationships:{};

  sendMessage_(chatId,
    '🎭 <b>'+escapeHtml_(found.name||foundKey)+'</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📍 Location: '+escapeHtml_(found.location||'-')+'\n' +
    '🩹 Physical: '+escapeHtml_(truncate_(found.physicalState||'-',500))+'\n' +
    '💭 Emotional: '+escapeHtml_(truncate_(found.emotionalState||'-',500))+'\n\n' +
    '<b>Goals</b>\n'+escapeHtml_(goals.slice(0,8).map(function(x){return '• '+x;}).join('\n')||'-')+'\n\n' +
    '<b>Knows</b>\n'+escapeHtml_(knows.slice(0,12).map(function(x){return '✅ '+x;}).join('\n')||'-')+'\n\n' +
    '<b>Does NOT know</b>\n'+escapeHtml_(doesnt.slice(0,12).map(function(x){return '❌ '+x;}).join('\n')||'-')+'\n\n' +
    '<b>Relationships</b>\n'+escapeHtml_(Object.keys(rel).slice(0,10).map(function(k){return '• '+k+': '+String(rel[k]);}).join('\n')||'-'));
}

function sendThreadTracker_(chatId,novelId){
  const sh=getNovelSheet_(novelId);
  const idx=getNovelIndex_(novelId);
  const threads=getNovelRecordData_(sh,'PLOT_THREADS','GLOBAL') || {};
  const fs=getNovelRecordData_(sh,'FORESHADOWING','GLOBAL') || [];
  const open=Array.isArray(threads.open)?threads.open:[];
  const resolved=Array.isArray(threads.resolved)?threads.resolved:[];

  const openLines=open.slice(0,15).map(function(x){
    return '🟢 Ch'+Number(x.introducedChapter||0)+' • '+truncate_(x.thread||x.id||'-',170);
  });
  const fsLines=(Array.isArray(fs)?fs:[]).slice(0,12).map(function(x){
    return '🪝 Ch'+Number(x.introducedChapter||0)+' • '+truncate_(x.clue||'-',160)+' ['+(x.status||'ACTIVE')+']';
  });

  sendMessage_(chatId,
    '🧵 <b>PLOT THREADS & FORESHADOWING</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 '+escapeHtml_(idx.TITLE)+'\n\n' +
    '<b>OPEN ('+open.length+')</b>\n'+escapeHtml_(openLines.join('\n')||'-')+'\n\n' +
    '<b>FORESHADOWING ('+(Array.isArray(fs)?fs.length:0)+')</b>\n'+escapeHtml_(fsLines.join('\n')||'-')+'\n\n' +
    '✅ Resolved threads: <b>'+resolved.length+'</b>');
}

function sendTimelineTracker_(chatId,novelId){
  const sh=getNovelSheet_(novelId);
  const idx=getNovelIndex_(novelId);
  const timeline=getNovelRecordData_(sh,'TIMELINE','GLOBAL') || [];
  const arr=Array.isArray(timeline)?timeline:[];
  const recent=arr.slice(Math.max(0,arr.length-25));
  sendMessage_(chatId,
    '🕰 <b>TIMELINE MANAGER</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 '+escapeHtml_(idx.TITLE)+'\n' +
    'Entries: <b>'+arr.length+'</b>\n\n' +
    escapeHtml_(recent.map(function(x){
      return 'Ch'+Number(x.chapter||0)+' • '+String(x.relativeTime||'-')+' — '+String(x.event||'-');
    }).join('\n')||'Belum ada timeline.'));
}

/* ========================================================================== */
/* AI USAGE / BUDGET MANAGER                                                  */
/* ========================================================================== */

function assertAiBudgetAvailable_(){
  const limit=Number(prop_('AI_DAILY_CALL_LIMIT')||0);
  if(!limit)return;
  const u=getAiUsageToday_();
  if(Number(u.total||0)>=limit){
    throw new Error('AI daily hard limit tercapai ('+limit+' successful calls). Ubah AI_DAILY_CALL_LIMIT atau tunggu hari berikutnya.');
  }
}

function aiUsageDayKey_(){
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
}

function inferAiTask_(prompt){
  const s=String(prompt||'').toLowerCase().slice(0,1800);
  if(s.indexOf('canon health')>=0 || s.indexOf('health auditor')>=0)return 'HEALTH';
  if(s.indexOf('style director')>=0 || s.indexOf('style lock')>=0)return 'STYLE';
  if(s.indexOf('continuity editor')>=0 || s.indexOf('review chapters')>=0)return 'REVIEW';
  if(s.indexOf('revision editor')>=0 || s.indexOf('rewrite one')>=0)return 'REWRITE';
  if(s.indexOf('write one complete')>=0 || s.indexOf('you are the writer')>=0)return 'WRITE';
  if(s.indexOf('visual bible')>=0)return 'VISUAL';
  return 'OTHER';
}

function recordAiUsage_(provider,prompt){
  try{
    const props=PropertiesService.getScriptProperties();
    const key='SNF_AI_USAGE_'+aiUsageDayKey_();
    const obj=safeJson_(props.getProperty(key),{})||{};
    obj.total=Number(obj.total||0)+1;
    obj.providers=obj.providers||{};
    obj.tasks=obj.tasks||{};
    obj.providers[provider]=Number(obj.providers[provider]||0)+1;
    const task=inferAiTask_(prompt);
    obj.tasks[task]=Number(obj.tasks[task]||0)+1;
    obj.updatedAt=isoNow_();
    props.setProperty(key,JSON.stringify(obj));
  }catch(_){}
}

function getAiUsageToday_(){
  return safeJson_(prop_('SNF_AI_USAGE_'+aiUsageDayKey_()),{})||{};
}

function aiBudgetMode_(){
  // v5.1: validate (was: any string passed through, e.g. a typo silently behaved as ECONOMY... or worse).
  const m=String(prop_('AI_BUDGET_MODE')||'ECONOMY').trim().toUpperCase();
  return ['ECONOMY','BALANCED','QUALITY'].indexOf(m)>=0?m:'ECONOMY';
}

function setAiBudgetMode_(mode){
  mode=String(mode||'ECONOMY').toUpperCase();
  if(['ECONOMY','BALANCED','QUALITY'].indexOf(mode)<0)mode='ECONOMY';
  PropertiesService.getScriptProperties().setProperty('AI_BUDGET_MODE',mode);
}

function sendAiUsage_(chatId){
  const u=getAiUsageToday_();
  const p=u.providers||{},t=u.tasks||{};
  const limit=Number(prop_('AI_DAILY_CALL_LIMIT')||0);
  sendMessage_(chatId,
    '💰 <b>AI USAGE & BUDGET</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📅 '+escapeHtml_(aiUsageDayKey_())+'\n' +
    'Mode: <b>'+escapeHtml_(aiBudgetMode_())+'</b>\n' +
    'Calls: <b>'+Number(u.total||0)+(limit?(' / '+limit):'')+'</b>\n\n' +
    '<b>Providers</b>\n' +
    'Gemini: '+Number(p.gemini||0)+'\n' +
    'OpenRouter: '+Number(p.openrouter||0)+'\n' +
    'Groq: '+Number(p.groq||0)+'\n' +
    'Agnes: '+Number(p.agnes||0)+'\n\n' +
    '<b>Tasks</b>\n' +
    '✍️ Write: '+Number(t.WRITE||0)+'\n' +
    '♻️ Rewrite: '+Number(t.REWRITE||0)+'\n' +
    '🔍 Review: '+Number(t.REVIEW||0)+'\n' +
    '🩺 Health: '+Number(t.HEALTH||0)+'\n' +
    '🧬 Style: '+Number(t.STYLE||0)+'\n' +
    '🎨 Visual: '+Number(t.VISUAL||0),
    keyboard_([
      [
        {text:'🟢 ECONOMY',callback_data:'AI_MODE||ECONOMY'},
        {text:'🟡 BALANCED',callback_data:'AI_MODE||BALANCED'},
        {text:'🔴 QUALITY',callback_data:'AI_MODE||QUALITY'}
      ]
    ]));
}

/* ========================================================================== */
/* SNAPSHOT + ROLLBACK                                                        */
/* ========================================================================== */

function ensureNovelStudioFolders_(novelId){
  const idx=getNovelIndex_(novelId);
  const sh=getNovelSheet_(novelId);
  const root=getFolderByIdSafe_(idx.FOLDER_ID);
  const folders=getNovelRecordData_(sh,'META','FOLDERS')||{};

  function ensure(name){
    if(folders[name]){
      try{return getFolderByIdSafe_(folders[name]);}catch(_){}
    }
    const f=getOrCreateChildFolder_(root,name);
    folders[name]=f.getId();
    return f;
  }

  ensure('11_VISUAL_BIBLE');
  const media=ensure('12_MEDIA');
  ensure('13_SNAPSHOTS');
  ensure('14_LORE');
  ensure('15_ANALYTICS');
  ensure('16_PUBLICATION');

  ['Cover','Characters','Chapters','Promo'].forEach(function(sub){
    const k='12_MEDIA/'+sub;
    if(!folders[k]){
      folders[k]=getOrCreateChildFolder_(media,sub).getId();
    }
  });

  const exp=getFolderByIdSafe_(folders['09_EXPORT']);
  ['TXT','DOCX','EPUB'].forEach(function(sub){
    const k='09_EXPORT/'+sub;
    if(!folders[k])folders[k]=getOrCreateChildFolder_(exp,sub).getId();
  });

  upsertNovelRecord_(sh,'META','FOLDERS','','','',folders,'ACTIVE',1,'');
  return folders;
}

function createCanonSnapshot_(chatId,novelId){
  const idx=getNovelIndex_(novelId);
  const sh=getNovelSheet_(novelId);
  const folders=ensureNovelStudioFolders_(novelId);
  const snapRoot=getFolderByIdSafe_(folders['13_SNAPSHOTS']);
  const snapId='SNAP_'+timestampFile_();
  const sf=snapRoot.createFolder(snapId);
  const canonCopy=sf.createFolder('05_CANON');

  const values=sh.getDataRange().getValues();
  sf.createFile('database.json',JSON.stringify(values,null,2),MimeType.PLAIN_TEXT);
  sf.createFile('index.json',JSON.stringify(idx,null,2),MimeType.PLAIN_TEXT);

  const canonFolder=getFolderByIdSafe_(folders['05_CANON']);
  const it=canonFolder.getFiles();
  while(it.hasNext()){
    const f=it.next();
    f.makeCopy(f.getName(),canonCopy);
  }

  const data={
    snapshotId:snapId,
    latestCanon:Number(idx.LATEST_CANON||0),
    currentChapter:Number(idx.CURRENT_CHAPTER||0),
    createdAt:isoNow_(),
    folderId:sf.getId()
  };
  upsertNovelRecord_(sh,'SNAPSHOT',snapId,'','','Snapshot '+snapId,data,'READY',1,sf.getId());

  sendMessage_(chatId,
    '💾 <b>SNAPSHOT CREATED</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 '+escapeHtml_(idx.TITLE)+'\n' +
    '📚 Canon through Chapter <b>'+data.latestCanon+'</b>\n' +
    '🆔 <code>'+snapId+'</code>\n\n' +
    'Database + 05_CANON sudah dibackup.',
    keyboard_([[{text:'📂 OPEN SNAPSHOT',url:sf.getUrl()}]]));
  return data;
}

function listSnapshotRecords_(novelId){
  const sh=getNovelSheet_(novelId);
  if(sh.getLastRow()<2)return [];
  const vals=sh.getRange(2,1,sh.getLastRow()-1,SNF.NOVEL_HEADERS.length).getValues();
  const out=[];
  vals.forEach(function(r){
    if(String(r[0])==='SNAPSHOT'){
      const o=rowObject_(SNF.NOVEL_HEADERS,r);
      out.push(o.DATA||safeJson_(o.DATA_JSON,{}));
    }
  });
  out.sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});
  return out;
}

function getSnapshotRecord_(novelId,snapshotId){
  return listSnapshotRecords_(novelId).filter(function(x){return String(x.snapshotId)===String(snapshotId);})[0]||null;
}

function sendRollbackCenter_(chatId,novelId){
  const snaps=listSnapshotRecords_(novelId).slice(0,10);
  if(!snaps.length){
    sendMessage_(chatId,'ℹ️ Belum ada snapshot. Gunakan <code>/snapshot</code> dulu.');
    return;
  }
  sendMessage_(chatId,
    '↩️ <b>ROLLBACK CENTER</b>\n\nPilih snapshot:',
    keyboard_(snaps.map(function(s){
      return [{text:'Ch'+Number(s.latestCanon||0)+' • '+String(s.snapshotId),callback_data:'ROLLBACK_PICK|'+novelId+'|'+s.snapshotId}];
    })));
}

function restoreCanonSnapshot_(chatId,novelId,snapshotId){
  const snap=getSnapshotRecord_(novelId,snapshotId);
  if(!snap)throw new Error('Snapshot tidak ditemukan.');
  const sf=getFolderByIdSafe_(snap.folderId);
  const dbIt=sf.getFilesByName('database.json');
  if(!dbIt.hasNext())throw new Error('database.json snapshot hilang.');
  const values=JSON.parse(dbIt.next().getBlob().getDataAsString('UTF-8'));

  const sh=getNovelSheet_(novelId);
  sh.clearContents();
  if(values.length&&values[0].length){
    sh.getRange(1,1,values.length,values[0].length).setValues(values);
  }

  const folders=getNovelRecordData_(sh,'META','FOLDERS')||ensureNovelStudioFolders_(novelId);
  const canonFolder=getFolderByIdSafe_(folders['05_CANON']);
  const old=canonFolder.getFiles();
  while(old.hasNext())old.next().setTrashed(true);

  const snapCanon=getOrCreateChildFolder_(sf,'05_CANON');
  const it=snapCanon.getFiles();
  while(it.hasNext()){
    const f=it.next();
    f.makeCopy(f.getName(),canonFolder);
  }

  updateNovelIndexFields_(novelId,{
    LATEST_CANON:Number(snap.latestCanon||0),
    CURRENT_CHAPTER:Number(snap.currentChapter||snap.latestCanon||0),
    STATUS:'ACTIVE',
    ACTIVE_JOB_ID:''
  });
  updateNovelJson_(novelId);

  sendMessage_(chatId,
    '✅ <b>ROLLBACK COMPLETE</b>\n\n' +
    'Snapshot: <code>'+escapeHtml_(snapshotId)+'</code>\n' +
    'Canon kembali ke Chapter <b>'+Number(snap.latestCanon||0)+'</b>.');
}

/* ========================================================================== */
/* EXPORT CENTER                                                              */
/* ========================================================================== */

function sendExportCenter_(chatId,novelId){
  const idx=getNovelIndex_(novelId);
  sendMessage_(chatId,
    '📦 <b>EXPORT CENTER</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 '+escapeHtml_(idx.TITLE)+'\n' +
    '📚 Canon: '+Number(idx.LATEST_CANON||0)+'\n\nPilih format:',
    keyboard_([
      [{text:'📄 TXT',callback_data:'EXPORT_TXT|'+novelId}],
      [{text:'📝 DOCX',callback_data:'EXPORT_DOCX|'+novelId}],
      [{text:'📚 EPUB',callback_data:'EXPORT_EPUB|'+novelId}],
      [{text:'↩️ KEMBALI',callback_data:'NOVEL_VIEW|'+novelId}]
    ]));
}

function collectCanonText_(novelId){
  const idx=getNovelIndex_(novelId),sh=getNovelSheet_(novelId);
  const parts=[];
  for(let n=1;n<=Number(idx.LATEST_CANON||0);n++){
    const r=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
    if(!r||String(r.STATUS)!=='CANON'||!r.FILE_ID)continue;
    const text=DriveApp.getFileById(String(r.FILE_ID)).getBlob().getDataAsString('UTF-8');
    parts.push({chapter:n,title:r.TITLE||('Chapter '+n),text:text});
  }
  return parts;
}

function exportNovel_(chatId,novelId,format){
  const idx=getNovelIndex_(novelId);
  const folders=ensureNovelStudioFolders_(novelId);
  const chapters=collectCanonText_(novelId);
  if(!chapters.length)throw new Error('Belum ada Canon untuk diexport.');
  const base=safeFileName_(idx.TITLE)+'_Canon_1-'+Number(idx.LATEST_CANON||0);

  if(format==='txt'){
    const body=idx.TITLE+'\n\n'+chapters.map(function(c){
      return 'CHAPTER '+c.chapter+(c.title?(' — '+c.title):'')+'\n\n'+c.text;
    }).join('\n\n============================================================\n\n');
    const f=upsertTextFile_(getFolderByIdSafe_(folders['09_EXPORT/TXT']),base+'.txt',body);
    sendMessage_(chatId,'✅ TXT export selesai.',keyboard_([[{text:'📄 OPEN TXT',url:f.getUrl()}]]));
    return;
  }

  const doc=DocumentApp.create(base+'_TEMP');
  const b=doc.getBody();
  b.appendParagraph(idx.TITLE).setHeading(DocumentApp.ParagraphHeading.TITLE);
  chapters.forEach(function(c){
    b.appendPageBreak();
    b.appendParagraph('Chapter '+c.chapter+(c.title?(' — '+c.title):'')).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    String(c.text||'').split(/\n+/).forEach(function(p){if(p.trim())b.appendParagraph(p);});
  });
  doc.saveAndClose();

  const mime=format==='docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/epub+zip';
  const ext=format==='docx'?'.docx':'.epub';
  const url='https://www.googleapis.com/drive/v3/files/'+doc.getId()+'/export?mimeType='+encodeURIComponent(mime);
  const res=UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}});
  const blob=res.getBlob().setName(base+ext);
  const folder=getFolderByIdSafe_(folders[format==='docx'?'09_EXPORT/DOCX':'09_EXPORT/EPUB']);
  const file=folder.createFile(blob);
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  sendMessage_(chatId,'✅ '+format.toUpperCase()+' export selesai.',keyboard_([[{text:'📦 OPEN FILE',url:file.getUrl()}]]));
}

/* ========================================================================== */
/* VISUAL BIBLE + ART GENERATOR                                               */
/* ========================================================================== */

function sendVisualBibleCenter_(chatId,novelId){
  const idx=getNovelIndex_(novelId),sh=getNovelSheet_(novelId);
  ensureNovelStudioFolders_(novelId);
  const vb=getNovelRecordData_(sh,'VISUAL_BIBLE','MASTER')||null;
  sendMessage_(chatId,
    '🎨 <b>VISUAL BIBLE</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 '+escapeHtml_(idx.TITLE)+'\n' +
    'Status: <b>'+(vb?'✅ READY':'⚪ NOT CREATED')+'</b>\n\n' +
    'Visual Bible menyimpan rupa karakter, pakaian, lokasi, palette, era, visual motifs, dan aturan konsistensi gambar.',
    keyboard_([
      [{text:vb?'🔬 REBUILD VISUAL BIBLE':'🧠 BUILD VISUAL BIBLE',callback_data:'VISUAL_BUILD|'+novelId}],
      [{text:'🖼 ART GENERATOR',callback_data:'ART_CENTER|'+novelId}],
      [{text:'↩️ KEMBALI',callback_data:'NOVEL_VIEW|'+novelId}]
    ]));
}

function startVisualBibleJob_(chatId,userId,novelId){
  const msg=sendMessage_(chatId,'🎨 <b>VISUAL BIBLE</b>\n\n⏳ Menganalisis Bible + Character Tracker...');
  createJob_({
    novelId:novelId,chatId:chatId,userId:userId,type:'VISUAL_BIBLE',
    stage:'BUILD',progress:5,status:'QUEUED',messageId:msg,data:{}
  });
}

function jobVisualBible_(job){
  const sh=getNovelSheet_(job.NOVEL_ID),idx=getNovelIndex_(job.NOVEL_ID);
  const bible=getNovelRecordData_(sh,'BIBLE','MASTER')||{};
  const chars=getNovelRecordData_(sh,'CHARACTER_STATES','GLOBAL')||{};
  const bp=getNovelRecordData_(sh,'BLUEPRINT','MASTER')||{};
  const visual=aiJson_(
    'You are the Visual Director for a long-form novel. Build a durable VISUAL BIBLE for consistent future cover and illustration generation. '+
    'Do not change story canon. Make descriptions visually concrete and reusable. Return JSON only:\n'+JSON.stringify({
      overallStyle:'string',
      eraAndTechnology:'string',
      colorPalette:['string'],
      visualMotifs:['string'],
      forbiddenVisualChanges:['string'],
      characters:{CHAR_ID:{name:'string',ageAppearance:'string',face:'string',hair:'string',eyes:'string',build:'string',skin:'string',clothing:'string',accessories:['string'],scarsOrMarks:['string'],expressionBaseline:'string',mustPreserve:['string']}},
      locations:{LOC_ID:{name:'string',architecture:'string',lighting:'string',palette:['string'],landmarks:['string'],mustPreserve:['string']}},
      coverDirection:{composition:'string',mood:'string',avoid:['string']}
    })+'\n\nBLUEPRINT:\n'+JSON.stringify(bp)+'\n\nBIBLE:\n'+JSON.stringify(bible)+'\n\nCURRENT CHARACTER STATES:\n'+JSON.stringify(chars)
  );
  visual.updatedAt=isoNow_();

  const folders=ensureNovelStudioFolders_(job.NOVEL_ID);
  const folder=getFolderByIdSafe_(folders['11_VISUAL_BIBLE']);
  const f=upsertTextFile_(folder,'visual_bible.json',JSON.stringify(visual,null,2));
  upsertNovelRecord_(sh,'VISUAL_BIBLE','MASTER','','','Visual Bible',visual,'ACTIVE',nextRecordVersion_(sh,'VISUAL_BIBLE','MASTER'),f.getId());

  updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'DONE',PROGRESS:100,DATA_JSON:JSON.stringify(Object.assign({},job.DATA||{},{resultFileId:f.getId()}))});
  safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
    '✅ <b>VISUAL BIBLE READY</b>\n\n' +
    '📖 '+escapeHtml_(idx.TITLE)+'\n' +
    '🎨 '+escapeHtml_(truncate_(visual.overallStyle||'-',600))+'\n\n' +
    'Folder: <code>11_VISUAL_BIBLE/visual_bible.json</code>',
    keyboard_([[{text:'🖼 GENERATE ART',callback_data:'ART_CENTER|'+job.NOVEL_ID}]]));
}

function sendArtCenter_(chatId,novelId){
  const idx=getNovelIndex_(novelId);
  sendMessage_(chatId,
    '🖼 <b>NOVEL MEDIA STUDIO</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 '+escapeHtml_(idx.TITLE)+'\n\n' +
    'Image provider: <b>OpenRouter Image API</b>\n' +
    'Model: <code>'+escapeHtml_(imageModel_())+'</code>\n\n' +
    'Gunakan juga:\n' +
    '<code>/art character Shu</code>\n' +
    '<code>/art chapter 41</code>',
    keyboard_([
      [{text:'📕 GENERATE COVER',callback_data:'ART_COVER|'+novelId}],
      [{text:'🖼 LATEST CHAPTER ART',callback_data:'ART_CHAPTER|'+novelId}],
      [{text:'↩️ VISUAL BIBLE',callback_data:'NOVEL_VISUAL|'+novelId}]
    ]));
}

function handleArtCommand_(chatId,userId,novelId,arg){
  const s=String(arg||'').trim();
  if(!s){sendArtCenter_(chatId,novelId);return;}
  if(/^cover$/i.test(s)){startArtJob_(chatId,userId,novelId,'cover',{});return;}
  let m=s.match(/^chapter\s+(\d+)$/i);
  if(m){startArtJob_(chatId,userId,novelId,'chapter',{chapter:Number(m[1])});return;}
  m=s.match(/^character\s+(.+)$/i);
  if(m){startArtJob_(chatId,userId,novelId,'character',{character:String(m[1]).trim()});return;}
  sendMessage_(chatId,'Format: <code>/art cover</code>, <code>/art character Shu</code>, atau <code>/art chapter 41</code>.');
}

function startArtJob_(chatId,userId,novelId,kind,opts){
  const msg=sendMessage_(chatId,'🖼 <b>ART GENERATION</b>\n\n⏳ Menyiapkan visual prompt...');
  createJob_({
    novelId:novelId,chatId:chatId,userId:userId,type:'ART_GENERATE',
    stage:'GENERATE',progress:5,status:'QUEUED',messageId:msg,
    data:Object.assign({kind:kind},opts||{})
  });
}

function imageModel_(){
  return prop_('IMAGE_MODEL')||'openai/gpt-image-2';
}

function jobArtGenerate_(job){
  const d=job.DATA||{},idx=getNovelIndex_(job.NOVEL_ID),sh=getNovelSheet_(job.NOVEL_ID);
  const vb=getNovelRecordData_(sh,'VISUAL_BIBLE','MASTER')||{};
  if(!Object.keys(vb).length)throw new Error('Visual Bible belum dibuat. Jalankan /visual lalu BUILD VISUAL BIBLE.');

  let prompt='';
  let sub='Promo',name='art_'+timestampFile_()+'.png';

  if(d.kind==='cover'){
    const bp=getNovelRecordData_(sh,'BLUEPRINT','MASTER')||{};
    prompt='Professional novel cover illustration, no logos, no watermark. Novel title concept: '+idx.TITLE+
      '. Genre: '+idx.GENRE+'. Visual Bible: '+JSON.stringify(vb)+
      '. Story premise: '+String(bp.description||bp.synopsis||bp.premise||'')+
      '. Create a strong vertical bookstore cover composition. Do not render title text unless naturally legible.';
    sub='Cover';name='Cover_'+timestampFile_()+'.png';
  }else if(d.kind==='character'){
    const q=String(d.character||'').toLowerCase();
    const chars=vb.characters||{};
    let c=null;
    Object.keys(chars).some(function(k){
      if(String(k).toLowerCase()===q||String(chars[k].name||'').toLowerCase().indexOf(q)>=0){c=chars[k];return true;}
      return false;
    });
    if(!c)throw new Error('Karakter tidak ditemukan di Visual Bible: '+d.character);
    prompt='Full character concept art, consistent novel visual bible. Character: '+JSON.stringify(c)+
      '. Overall visual style: '+String(vb.overallStyle||'')+
      '. Neutral readable composition, no watermark, no extra characters.';
    sub='Characters';name=safeFileName_(c.name||d.character)+'_'+timestampFile_()+'.png';
  }else if(d.kind==='chapter'){
    const ch=Number(d.chapter||0);
    const r=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(ch));
    if(!r||String(r.STATUS)!=='CANON')throw new Error('Chapter '+ch+' belum Canon.');
    prompt='Cinematic chapter illustration for Chapter '+ch+' of '+idx.TITLE+
      '. Chapter summary: '+JSON.stringify(r.DATA||{})+
      '. Visual Bible: '+JSON.stringify(vb)+
      '. Depict the single strongest visual moment without spoilers beyond this chapter. No text, no watermark.';
    sub='Chapters';name='Chapter_'+pad3_(ch)+'_'+timestampFile_()+'.png';
  }else{
    throw new Error('Unknown art kind: '+d.kind);
  }

  const blob=openRouterImageGenerate_(prompt);
  const folders=ensureNovelStudioFolders_(job.NOVEL_ID);
  const folder=getFolderByIdSafe_(folders['12_MEDIA/'+sub]);
  blob.setName(name);
  const file=folder.createFile(blob);
  recordAiUsage_('openrouter-image','IMAGE '+d.kind);
  upsertNovelRecord_(sh,'MEDIA','FILE_'+file.getId(),Number(d.chapter||0),'',name,{kind:d.kind,category:sub,fileId:file.getId(),url:file.getUrl(),createdAt:isoNow_(),chapter:Number(d.chapter||0),character:d.character||''},'READY',1,file.getId());

  updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'DONE',PROGRESS:100,DATA_JSON:JSON.stringify(Object.assign({},d,{resultFileId:file.getId(),resultFileUrl:file.getUrl(),resultName:name}))});
  safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
    '✅ <b>ART GENERATED</b>\n\n' +
    '📖 '+escapeHtml_(idx.TITLE)+'\n' +
    '🎨 '+escapeHtml_(d.kind.toUpperCase())+'\n' +
    '📂 <code>12_MEDIA/'+sub+'/'+escapeHtml_(name)+'</code>',
    keyboard_([[{text:'🖼 OPEN IMAGE',url:file.getUrl()}]]));
  if(job.CHAT_ID){try{sendTelegramPhotoFile_(job.CHAT_ID,file,'🎨 '+idx.TITLE+' — '+d.kind);}catch(_){}}
}

function openRouterImageGenerate_(prompt){
  const key=prop_('OPENROUTER_API_KEY');
  if(!key)throw new Error('OPENROUTER_API_KEY belum diset.');
  const res=UrlFetchApp.fetch('https://openrouter.ai/api/v1/images',{
    method:'post',
    headers:{
      Authorization:'Bearer '+key,
      'Content-Type':'application/json'
    },
    payload:JSON.stringify({
      model:imageModel_(),
      prompt:String(prompt),
      aspect_ratio:prop_('IMAGE_ASPECT_RATIO')||'2:3',
      n:1
    }),
    muteHttpExceptions:true
  });
  const status=res.getResponseCode(),body=res.getContentText();
  if(status<200||status>=300)throw new Error('OpenRouter Image HTTP '+status+': '+truncate_(body,1800));
  const obj=safeJson_(body,null);
  if(!obj||!Array.isArray(obj.data)||!obj.data.length||!obj.data[0].b64_json){
    throw new Error('OpenRouter Image response tidak berisi b64_json.');
  }
  const bytes=Utilities.base64Decode(obj.data[0].b64_json);
  const mt=String(obj.data[0].media_type||'image/png');
  return Utilities.newBlob(bytes,mt,'image.png');
}

function sendTelegramPhotoFile_(chatId,file,caption){
  const token=prop_('TELEGRAM_BOT_TOKEN');
  const res=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendPhoto',{
    method:'post',
    payload:{
      chat_id:String(chatId),
      caption:String(caption||''),
      photo:file.getBlob()
    },
    muteHttpExceptions:true
  });
  if(res.getResponseCode()<200||res.getResponseCode()>=300){
    throw new Error('Telegram sendPhoto gagal: '+truncate_(res.getContentText(),1000));
  }
}

/* ========================================================================== */
/* FULL AUTO PRODUCTION MODE                                                  */
/* ========================================================================== */

function parseAutoRange_(arg,next,target){
  const s=String(arg||'').trim().toLowerCase();
  let m=s.match(/^(\d{1,4})\s*[–—-]\s*(\d{1,4})$/);
  if(!m)return null;
  const a=Number(m[1]),b=Number(m[2]);
  if(!a||!b||b<a||a!==Number(next))return null;
  if(target&&b>target)return null;
  return {start:a,end:b};
}

function startAutoProduction_(chatId,userId,session,arg){
  const novelId=session.activeNovelId||'';
  if(!novelId){sendMessage_(chatId,'📚 Pilih novel dulu.');return;}
  const idx=getNovelIndex_(novelId),next=Number(idx.LATEST_CANON||0)+1,target=Number(idx.TARGET_CHAPTERS||0);
  const range=parseAutoRange_(arg,next,target);
  if(!range){
    sendMessage_(chatId,'Gunakan: <code>/autowrite '+next+'-'+Math.min(target||next+49,next+49)+'</code>\nStart harus Chapter berikutnya setelah Canon.');
    return;
  }

  const msg=sendMessage_(chatId,
    '🤖 <b>FULL AUTO PRODUCTION</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 '+escapeHtml_(idx.TITLE)+'\n' +
    '🎯 Chapter '+range.start+'–'+range.end+'\n' +
    'Batch: '+autoProductionBatchSize_()+'\n' +
    'Auto Review: ON\nAuto Rewrite: ON\nAuto Approve: ON\nAuto Canon: ON\n\n⏳ Starting...');
  const jid=createJob_({
    novelId:novelId,chatId:chatId,userId:userId,type:'AUTO_PRODUCTION',
    stage:'START_BATCH',progress:1,status:'QUEUED',messageId:msg,
    data:{startChapter:range.start,endChapter:range.end,currentStart:range.start,batchSize:autoProductionBatchSize_(),rewriteAttempts:0}
  });
  setSession_(userId,chatId,'AUTO_PRODUCTION',novelId,{jobId:jid});
}

function autoProductionBatchSize_(){
  return Math.max(2,Math.min(10,Number(prop_('AUTO_PRODUCTION_BATCH_SIZE')||5)));
}
function autoProductionMaxRewrite_(){
  return Math.max(0,Math.min(4,Number(prop_('AUTO_PRODUCTION_MAX_REWRITE')||2)));
}

function reviewPassesForAutoCanon_(review){
  if(!review)return false;
  if(String(review.verdict||'').toUpperCase()!=='PASS')return false;
  const sections=['storySynchronization','roadmapCompliance','bibleCompliance','continuity','downstreamCanon','characterKnowledge','timeline'];
  const blockWarn=String(prop_('AUTO_CANON_BLOCK_ON_WARN')||'true').toLowerCase()!=='false';
  for(let i=0;i<sections.length;i++){
    const x=review[sections[i]];
    if(!x)continue;
    const st=String(x.status||'PASS').toUpperCase();
    if(st==='FAIL')return false;
    if(blockWarn && ['continuity','characterKnowledge','timeline'].indexOf(sections[i])>=0 && st==='WARN')return false;
  }
  return true;
}

function parkAutoParent_(job,data,seconds){
  data=Object.assign({},data,{_nextRetryAtMs:Date.now()+Math.max(20,seconds||45)*1000});
  updateJobFields_(job.JOB_ID,{STATUS:'QUEUED',DATA_JSON:JSON.stringify(data)});
}

function jobAutoProduction_(job){
  const d=job.DATA||{},idx=getNovelIndex_(job.NOVEL_ID);
  const start=Number(d.startChapter),end=Number(d.endChapter),cur=Number(d.currentStart||start);
  if(cur>end){
    updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'DONE',PROGRESS:100});
    updateNovelIndexFields_(job.NOVEL_ID,{STATUS:'ACTIVE',ACTIVE_JOB_ID:''});
    safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
      '✅ <b>FULL AUTO PRODUCTION COMPLETE</b>\n\n' +
      '📖 '+escapeHtml_(idx.TITLE)+'\n' +
      '📚 Chapter '+start+'–'+end+' selesai diproduksi dan di-Canon.');
    return;
  }

  if(job.STAGE==='START_BATCH'){
    const chunkEnd=Math.min(end,cur+Number(d.batchSize||5)-1);
    const child=createJob_({
      novelId:job.NOVEL_ID,chatId:job.CHAT_ID,userId:job.USER_ID,
      type:'GENERATE_BATCH',stage:'GENERATE_CHAPTERS',progress:0,status:'QUEUED',messageId:job.MESSAGE_ID,
      data:{
        startChapter:cur,endChapter:chunkEnd,nextChapter:cur,mode:'draft',
        reason:'Full Auto Production. Follow canon, roadmap, Style Lock and continuity exactly.',
        source:'AUTO_PRODUCTION',autoParentJobId:job.JOB_ID
      }
    });
    const nd=Object.assign({},d,{childJobId:child,chunkStart:cur,chunkEnd:chunkEnd,rewriteAttempts:0});
    updateJobFields_(job.JOB_ID,{STAGE:'WAIT_CHILD',STATUS:'QUEUED',DATA_JSON:JSON.stringify(Object.assign(nd,{_nextRetryAtMs:Date.now()+45000}))});
    return;
  }

  if(job.STAGE==='WAIT_CHILD'){
    const child=getJob_(d.childJobId);
    if(!child)throw new Error('Auto child job hilang.');
    if(child.STATUS==='ERROR'||child.STATUS==='FAILED')throw new Error('Child generation gagal: '+String(child.LAST_ERROR||''));
    if(['AUTO_READY','WAITING_APPROVAL'].indexOf(String(child.STATUS))<0){
      parkAutoParent_(job,d,45);return;
    }

    const sh=getNovelSheet_(job.NOVEL_ID);
    const review=getReviewForJob_(sh,child.JOB_ID)||{};
    if(reviewPassesForAutoCanon_(review)){
      updateJobFields_(child.JOB_ID,{
        STATUS:'AUTO_APPROVED',
        STAGE:'AUTO_APPROVED',
        PROGRESS:100
      });

      safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
        '🤖 <b>AUTO APPROVED</b>\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '📖 '+escapeHtml_(idx.TITLE)+'\n' +
        '📚 Chapter <b>'+d.chunkStart+'–'+d.chunkEnd+'</b>\n' +
        '✅ AI Quality Gate: PASS\n' +
        '✅ Admin approval: SKIPPED\n\n' +
        '⏳ Canonizing & updating Novel Brain...');

      const fin=createJob_({
        novelId:job.NOVEL_ID,chatId:job.CHAT_ID,userId:job.USER_ID,
        type:'FINALIZE_BATCH',stage:'CANONIZE',progress:5,status:'QUEUED',messageId:job.MESSAGE_ID,
        data:{sourceJobId:child.JOB_ID,startChapter:d.chunkStart,endChapter:d.chunkEnd,source:'AUTO_PRODUCTION'}
      });
      updateJobFields_(job.JOB_ID,{STAGE:'WAIT_FINALIZE',STATUS:'QUEUED',DATA_JSON:JSON.stringify(Object.assign({},d,{finalizeJobId:fin,_nextRetryAtMs:Date.now()+45000}))});
      return;
    }

    const attempt=Number(d.rewriteAttempts||0);
    if(attempt<autoProductionMaxRewrite_()){
      updateJobFields_(child.JOB_ID,{STATUS:'AUTO_REWRITE',STAGE:'AUTO_REWRITE'});
      const rw=createJob_({
        novelId:job.NOVEL_ID,chatId:job.CHAT_ID,userId:job.USER_ID,
        type:'GENERATE_BATCH',stage:'GENERATE_CHAPTERS',progress:0,status:'QUEUED',messageId:job.MESSAGE_ID,
        data:{
          startChapter:d.chunkStart,endChapter:d.chunkEnd,nextChapter:d.chunkStart,mode:'revision',
          reason:'Auto-fix all concrete issues from the previous AI review. Preserve canon and roadmap.',
          sourceJobId:child.JOB_ID,
          source:'AUTO_PRODUCTION',
          autoParentJobId:job.JOB_ID
        }
      });
      updateJobFields_(job.JOB_ID,{STATUS:'QUEUED',DATA_JSON:JSON.stringify(Object.assign({},d,{childJobId:rw,rewriteAttempts:attempt+1,_nextRetryAtMs:Date.now()+45000}))});
      return;
    }

    updateJobFields_(job.JOB_ID,{STATUS:'ERROR',LAST_ERROR:'Auto review tetap tidak PASS setelah '+attempt+' rewrite attempt(s).'});
    safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),
      '🛑 <b>AUTO PRODUCTION PAUSED</b>\n\n' +
      'Chapter '+d.chunkStart+'–'+d.chunkEnd+' belum lolos Quality Gate setelah '+attempt+' rewrite.\n' +
      'Gunakan /jobs untuk review manual.');
    return;
  }

  if(job.STAGE==='WAIT_FINALIZE'){
    const fin=getJob_(d.finalizeJobId);
    if(!fin)throw new Error('Finalize job hilang.');
    if(fin.STATUS==='ERROR'||fin.STATUS==='FAILED')throw new Error('Finalize gagal: '+String(fin.LAST_ERROR||''));
    if(fin.STATUS!=='DONE'){
      parkAutoParent_(job,d,45);return;
    }

    const next=Number(d.chunkEnd)+1;
    const pct=Math.min(98,Math.round(((next-start)/Math.max(1,end-start+1))*100));
    updateNovelIndexFields_(job.NOVEL_ID,{ACTIVE_JOB_ID:job.JOB_ID,STATUS:'AUTO_PRODUCTION'});
    updateJobFields_(job.JOB_ID,{
      STAGE:'START_BATCH',STATUS:'QUEUED',PROGRESS:pct,
      DATA_JSON:JSON.stringify(Object.assign({},d,{currentStart:next,childJobId:'',finalizeJobId:'',rewriteAttempts:0,_nextRetryAtMs:0}))
    });
    return;
  }

  throw new Error('Unknown AUTO_PRODUCTION stage: '+job.STAGE);
}


/* ========================================================================== */
/* ADAPTIVE ROADMAP / REROADMAP                                               */
/* ========================================================================== */

function normalizeReRoadmapStrategy_(value){
  const s=String(value||'ADAPT').trim().toUpperCase();
  if(['RETURN','ORIGINAL','RETURN_TO_ORIGINAL'].indexOf(s)>=0)return 'RETURN';
  if(['NEW','NEW_DIRECTION','FRESH'].indexOf(s)>=0)return 'NEW';
  return 'ADAPT';
}
function reroadmapChunkSize_(){return Math.max(5,Math.min(20,Number(prop_('REROADMAP_CHUNK_SIZE')||10)));}
function reroadmapMaxDigestChapters_(){return Math.max(80,Math.min(500,Number(prop_('REROADMAP_MAX_DIGEST_CHAPTERS')||260)));}

function ensureAdaptiveRoadmapFolders_(novelId){
  const idx=getNovelIndex_(novelId),sh=getNovelSheet_(novelId),folders=getNovelRecordData_(sh,'META','FOLDERS')||{};
  const root=folders['02_ROADMAP']?getFolderByIdSafe_(folders['02_ROADMAP']):getOrCreateChildFolder_(getFolderByIdSafe_(idx.FOLDER_ID),'02_ROADMAP');
  const rr=getOrCreateChildFolder_(root,'REROADMAP'),wi=getOrCreateChildFolder_(root,'WHAT_IF');
  folders['02_ROADMAP']=root.getId();folders['02_ROADMAP/REROADMAP']=rr.getId();folders['02_ROADMAP/WHAT_IF']=wi.getId();
  upsertNovelRecord_(sh,'META','FOLDERS','','','',folders,'ACTIVE',1,'');
  return {root:root,reroadmap:rr,whatif:wi};
}
function adaptiveVersionFolder_(novelId,id,kind){
  const f=ensureAdaptiveRoadmapFolders_(novelId),parent=String(kind||'REROADMAP').toUpperCase()==='WHAT_IF'?f.whatif:f.reroadmap;
  return getOrCreateChildFolder_(parent,String(id));
}
function getActiveRoadmapVersionId_(sh){
  const d=getNovelRecordData_(sh,'ROADMAP_ACTIVE','ACTIVE')||{};
  return String(d.versionId||'MASTER').toUpperCase();
}
function listRoadmapVersionMeta_(sh){
  const out=[],last=sh.getLastRow();if(last<2)return out;
  const vals=sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
  vals.forEach(function(r){if(String(r[0])!=='ROADMAP_VERSION')return;const o=rowObject_(SNF.NOVEL_HEADERS,r),d=o.DATA||safeJson_(o.DATA_JSON,{})||{};if(d.versionId)out.push(d);});
  out.sort(function(a,b){if(a.versionId==='MASTER')return -1;if(b.versionId==='MASTER')return 1;return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});
  return out;
}
function roadmapVersionMeta_(sh,id){return getNovelRecordData_(sh,'ROADMAP_VERSION',String(id||'').toUpperCase())||null;}
function saveRoadmapVersionMeta_(sh,m){
  m=Object.assign({},m||{});m.versionId=String(m.versionId||'').toUpperCase();if(!m.versionId)throw new Error('versionId kosong.');
  upsertNovelRecord_(sh,'ROADMAP_VERSION',m.versionId,'','',m.versionId,m,m.status||'READY',nextRecordVersion_(sh,'ROADMAP_VERSION',m.versionId),m.folderId||m.snapshotFileId||'');
  return m;
}
function nextAdaptiveRoadmapId_(sh,prefix){
  prefix=String(prefix||'RR').toUpperCase();let max=0;
  listRoadmapVersionMeta_(sh).forEach(function(m){const x=String(m.versionId||'').match(new RegExp('^'+prefix+'_(\\d+)$'));if(x)max=Math.max(max,Number(x[1]||0));});
  return prefix+'_'+String(max+1).padStart(3,'0');
}
function ensureOriginalRoadmapVersion_(novelId){
  const sh=getNovelSheet_(novelId);let m=roadmapVersionMeta_(sh,'MASTER');if(m)return m;
  const idx=getNovelIndex_(novelId),master=getNovelRecordData_(sh,'ROADMAP_MASTER','MASTER')||{};
  const target=Math.max(Number(idx.TARGET_CHAPTERS||0),Number(master.targetChapters||0));if(!Object.keys(master).length)throw new Error('Master roadmap belum tersedia.');
  const snapshot={versionId:'MASTER',kind:'ORIGINAL',createdAt:isoNow_(),targetChapters:target,master:master,plans:getRoadmapChapterRange_(sh,1,target)};
  const root=ensureAdaptiveRoadmapFolders_(novelId).root,f=upsertTextFile_(root,'original_master_snapshot.json',JSON.stringify(snapshot,null,2));
  m={versionId:'MASTER',kind:'ORIGINAL',status:'ACTIVE',basedOnCanon:0,targetChapters:target,createdAt:isoNow_(),snapshotFileId:f.getId(),snapshotUrl:f.getUrl()};
  saveRoadmapVersionMeta_(sh,m);
  upsertNovelRecord_(sh,'ROADMAP_ACTIVE','ACTIVE','','','Active Roadmap',{versionId:'MASTER',activatedAt:isoNow_()},'ACTIVE',1,f.getId());
  return m;
}
function roadmapVersionPlanKey_(id,n){return String(id).toUpperCase()+'_CH_'+pad3_(n);}
function saveRoadmapVersionPlan_(sh,id,p){
  const n=Number(p&&p.number||0);if(!n)throw new Error('Chapter plan number hilang.');
  const key=roadmapVersionPlanKey_(id,n);
  upsertNovelRecord_(sh,'ROADMAP_VERSION_CHAPTER',key,n,p.arc||'',p.title||('Chapter '+n),p,'READY',nextRecordVersion_(sh,'ROADMAP_VERSION_CHAPTER',key),'');
}
function getRoadmapVersionPlans_(sh,id){
  const prefix=String(id||'').toUpperCase()+'_CH_',out=[],last=sh.getLastRow();if(last<2)return out;
  const vals=sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
  vals.forEach(function(r){if(String(r[0])!=='ROADMAP_VERSION_CHAPTER'||String(r[1]||'').indexOf(prefix)!==0)return;const o=rowObject_(SNF.NOVEL_HEADERS,r),d=o.DATA||safeJson_(o.DATA_JSON,{})||{};if(!d.number)d.number=Number(o.CHAPTER||0);if(d.number)out.push(d);});
  out.sort(function(a,b){return Number(a.number)-Number(b.number);});return out;
}
function getRoadmapVersionBundle_(novelId,id){
  id=String(id||'MASTER').toUpperCase();const sh=getNovelSheet_(novelId),meta=roadmapVersionMeta_(sh,id);
  if(id==='MASTER'){
    const mm=meta||ensureOriginalRoadmapVersion_(novelId),raw=DriveApp.getFileById(String(mm.snapshotFileId)).getBlob().getDataAsString('UTF-8'),obj=safeJson_(raw,null);
    if(!obj)throw new Error('Original roadmap snapshot rusak.');return {meta:mm,master:obj.master||{},plans:obj.plans||[],analysis:{},diff:{}};
  }
  if(!meta)throw new Error('Roadmap version tidak ditemukan: '+id);
  return {meta:meta,master:getNovelRecordData_(sh,'ROADMAP_VERSION_MASTER',id)||{},plans:getRoadmapVersionPlans_(sh,id),analysis:getNovelRecordData_(sh,'ROADMAP_VERSION_ANALYSIS',id)||{},diff:getNovelRecordData_(sh,'ROADMAP_VERSION_DIFF',id)||{}};
}
function compactCanonSummaryForReroadmap_(r){
  const d=r&&r.data||{},ev=d.keyEvents||d.events||d.majorEvents||[];
  return {chapter:Number(r.number||0),title:String(r.title||''),summary:truncate_(String(d.summary||d.chapterSummary||d.shortSummary||d.synopsis||''),650),keyEvents:Array.isArray(ev)?ev.slice(0,6):[],endingState:truncate_(String(d.endingState||d.endState||''),300),location:truncate_(String(d.location||d.primaryLocation||''),120)};
}
function reroadmapCanonDigest_(sh,latest){
  const all=getChapterSummaries_(sh,1,latest)
    .filter(function(r){return String(r.status||'')==='CANON';})
    .map(compactCanonSummaryForReroadmap_);
  const max=reroadmapMaxDigestChapters_();if(all.length<=max)return all;
  const first=all.slice(0,20),tailCount=Math.min(120,max-20),tail=all.slice(all.length-tailCount),mid=all.slice(20,all.length-tailCount),slots=Math.max(0,max-first.length-tail.length),sample=[];
  if(slots&&mid.length){const step=mid.length/slots;for(let i=0;i<slots;i++)sample.push(mid[Math.min(mid.length-1,Math.floor(i*step))]);}
  const by={};first.concat(sample,tail).forEach(function(x){by[x.chapter]=x;});return Object.keys(by).map(Number).sort(function(a,b){return a-b;}).map(function(k){return by[k];});
}
function repairCanonFileLinks_(novelId,startChapter,endChapter){
  const sh=getNovelSheet_(novelId);
  const idx=getNovelIndex_(novelId);
  const start=Math.max(1,Number(startChapter||1));
  const end=Math.min(Number(endChapter||idx.LATEST_CANON||0),Number(idx.LATEST_CANON||0));
  let repaired=0,missing=[];

  for(let n=start;n<=end;n++){
    const rec=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
    if(!rec || String(rec.STATUS)!=='CANON')continue;

    let canonFile;
    try{
      canonFile=getCanonFileStrict_(novelId,n);
    }catch(err){
      missing.push(n);
      continue;
    }

    if(String(rec.FILE_ID||'')!==String(canonFile.getId())){
      upsertNovelRecord_(
        sh,
        'CHAPTER_SUMMARY',
        chapterKey_(n),
        n,
        rec.ARC||'',
        rec.TITLE||('Chapter '+n),
        rec.DATA||{},
        'CANON',
        Number(rec.VERSION||1),
        canonFile.getId()
      );

      const metrics=getNovelRecord_(sh,'CHAPTER_METRICS',chapterKey_(n));
      if(metrics){
        upsertNovelRecord_(
          sh,
          'CHAPTER_METRICS',
          chapterKey_(n),
          n,
          metrics.ARC||rec.ARC||'',
          metrics.TITLE||rec.TITLE||('Chapter '+n),
          metrics.DATA||{},
          'CANON',
          Number(metrics.VERSION||rec.VERSION||1),
          canonFile.getId()
        );
      }
      repaired++;
    }
  }

  return {
    ok:true,
    novelId:novelId,
    start:start,
    end:end,
    repaired:repaired,
    missing:missing
  };
}

function repairActiveNovelCanonLinks(){
  const adminIds=String(prop_('ADMIN_USER_IDS')||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
  if(!adminIds.length)throw new Error('ADMIN_USER_IDS kosong.');

  // Utility intended to be run manually from Apps Script.
  // Repairs every novel rather than relying on a Telegram session.
  const rows=listNovels_();
  const results=[];
  rows.forEach(function(idx){
    if(!idx || !idx.NOVEL_ID || !Number(idx.LATEST_CANON||0))return;
    try{
      results.push(repairCanonFileLinks_(idx.NOVEL_ID,1,Number(idx.LATEST_CANON||0)));
    }catch(err){
      results.push({ok:false,novelId:idx.NOVEL_ID,error:String(err&&err.message||err)});
    }
  });
  Logger.log(JSON.stringify(results,null,2));
  return results;
}

function repairAllNovelCanonLinks(){
  return repairActiveNovelCanonLinks();
}

function getCanonFileStrict_(novelId,chapterNo){
  const sh=getNovelSheet_(novelId);
  const folders=getNovelRecordData_(sh,'META','FOLDERS')||{};
  const canonFolderId=folders['05_CANON'];
  if(!canonFolderId)throw new Error('Folder 05_CANON belum terdaftar untuk novel '+novelId+'.');

  const canonFolder=getFolderByIdSafe_(canonFolderId);
  const fileName='Chapter_'+pad3_(chapterNo)+'_CANON.txt';
  const it=canonFolder.getFilesByName(fileName);

  if(!it.hasNext()){
    throw new Error(
      'Canon source missing: 05_CANON/'+fileName+
      '. ReRoadmap tidak akan fallback ke 03_CHAPTERS/04_REVISED_CHAPTERS.'
    );
  }
  return it.next();
}

function getCanonTextStrict_(novelId,chapterNo){
  const sh=getNovelSheet_(novelId);
  const rec=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(chapterNo));
  if(!rec || String(rec.STATUS)!=='CANON'){
    throw new Error('Chapter '+chapterNo+' belum berstatus CANON di database.');
  }
  return getCanonFileStrict_(novelId,chapterNo).getBlob().getDataAsString('UTF-8');
}

function reroadmapLastFull_(novelId,sh,latest){
  const out=[];
  for(let n=Math.max(1,latest-2);n<=latest;n++){
    const rec=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
    if(!rec || String(rec.STATUS)!=='CANON')continue;

    const text=getCanonTextStrict_(novelId,n);
    out.push({
      chapter:n,
      source:'05_CANON',
      fileName:'Chapter_'+pad3_(n)+'_CANON.txt',
      text:truncate_(text,12000)
    });
  }
  return out;
}

function buildReRoadmapContext_(novelId){
  const idx=getNovelIndex_(novelId),sh=getNovelSheet_(novelId);ensureOriginalRoadmapVersion_(novelId);
  const latest=Number(idx.LATEST_CANON||0),activeId=getActiveRoadmapVersionId_(sh),orig=getRoadmapVersionBundle_(novelId,'MASTER'),active=activeId==='MASTER'?orig:getRoadmapVersionBundle_(novelId,activeId);
  return {novel:{title:idx.TITLE,language:idx.LANGUAGE,genre:idx.GENRE,latestCanon:latest,targetChapters:Number(idx.TARGET_CHAPTERS||0)},activeVersionId:activeId,blueprint:getNovelRecordData_(sh,'BLUEPRINT','MASTER')||{},bible:getNovelRecordData_(sh,'BIBLE','MASTER')||{},protectedCanon:getProtectedCanonContext_(sh),authorLocks:getNovelRecordData_(sh,'AUTHOR_LOCKS','MASTER')||{},originalMasterRoadmap:orig.master||{},activeMasterRoadmap:active.master||{},memory:getNovelRecordData_(sh,'MEMORY','STORY_MEMORY')||{},characters:getNovelRecordData_(sh,'CHARACTER_STATES','GLOBAL')||{},timeline:getNovelRecordData_(sh,'TIMELINE','GLOBAL')||[],threads:getNovelRecordData_(sh,'PLOT_THREADS','GLOBAL')||{},foreshadowing:getNovelRecordData_(sh,'FORESHADOWING','GLOBAL')||[],lore:getNovelRecordData_(sh,'WORLD_ENCYCLOPEDIA','MASTER')||{},canonDigest:reroadmapCanonDigest_(sh,latest),lastFullChapters:reroadmapLastFull_(novelId,sh,latest)};
}
function startReRoadmapJob_(chatId,userId,novelId,mode,strategy,premise){
  const idx=getNovelIndex_(novelId);if(!idx)throw new Error('Novel tidak ditemukan.');
  const latest=Number(idx.LATEST_CANON||0),target=Number(idx.TARGET_CHAPTERS||0);if(!latest)throw new Error('ReRoadmap membutuhkan Canon.');if(!target||latest>=target)throw new Error('Tidak ada future chapter untuk direncanakan.');
  const sh=getNovelSheet_(novelId);

  // Older SNF versions left Canon FILE_ID pointing to the draft/revision file.
  // Repair those links from the authoritative 05_CANON folder before planning.
  const canonRepair=repairCanonFileLinks_(novelId,1,latest);
  if(canonRepair.missing && canonRepair.missing.length){
    throw new Error(
      'ReRoadmap dihentikan karena file Canon tidak lengkap di 05_CANON. Missing: '+
      canonRepair.missing.slice(0,30).join(', ')+
      (canonRepair.missing.length>30?'…':'')
    );
  }

  ensureOriginalRoadmapVersion_(novelId);mode=String(mode||'REALIGN').toUpperCase()==='WHAT_IF'?'WHAT_IF':'REALIGN';strategy=normalizeReRoadmapStrategy_(strategy);premise=String(premise||'').trim();if(mode==='WHAT_IF'&&!premise)throw new Error('What-if premise wajib diisi.');
  const id=nextAdaptiveRoadmapId_(sh,mode==='WHAT_IF'?'WI':'RR'),folder=adaptiveVersionFolder_(novelId,id,mode==='WHAT_IF'?'WHAT_IF':'REROADMAP'),sourceId=getActiveRoadmapVersionId_(sh);
  saveRoadmapVersionMeta_(sh,{versionId:id,kind:mode==='WHAT_IF'?'WHAT_IF':'REROADMAP',status:'BUILDING',basedOnCanon:latest,sourceVersionId:sourceId,strategy:strategy,premise:premise,targetChapters:target,createdAt:isoNow_(),folderId:folder.getId(),folderUrl:folder.getUrl()});
  const msg=chatId?sendMessage_(chatId,(mode==='WHAT_IF'?'🌿':'🛣')+' <b>REROADMAP '+escapeHtml_(id)+'</b>\n\n📚 Canon Ch1–'+latest+' tetap immutable.\n🎯 Planning Ch'+(latest+1)+'–'+target+'\n🧭 '+escapeHtml_(strategy)+(premise?'\n💭 '+escapeHtml_(truncate_(premise,500)):'')+'\n\n⏳ Analyzing roadmap drift...'):'';
  const jid=createJob_({novelId:novelId,chatId:chatId||'',userId:userId||'',type:'REROADMAP',stage:'ANALYZE',progress:3,status:'QUEUED',messageId:msg||'',data:{versionId:id,mode:mode,strategy:strategy,premise:premise,basedOnCanon:latest,targetChapters:target,sourceVersionId:sourceId,nextPlanChapter:latest+1}});
  updateNovelIndexFields_(novelId,{ACTIVE_JOB_ID:jid,STATUS:'REROADMAP_ANALYSIS'});return {ok:true,jobId:jid,versionId:id};
}
function reroadmapAnalysisPrompt_(ctx,d){
  return 'You are the Adaptive Story Planner. CANON is immutable truth; roadmap drift is not automatically a continuity error. Analyze how Canon Ch1-'+d.basedOnCanon+' evolved relative to original and active roadmap. '+(d.mode==='WHAT_IF'?'Create analysis for a hypothetical future after current Canon. Premise: '+d.premise+'. ':'Official ReRoadmap candidate. Strategy='+d.strategy+'. ')+'ADAPT means follow current Canon naturally; RETURN means gradually reconnect only to still-valid old goals; NEW allows a substantially new future while preserving story promises. Return JSON only:\n'+JSON.stringify({divergenceStartChapter:1,coherenceStatus:'COHERENT|COHERENT_WITH_RISKS|BROKEN',overallAlignment:75,driftWindows:[{start:1,end:10,alignment:90,status:'GREEN|YELLOW|RED',notes:'string'}],preservedOriginalGoals:['string'],obsoleteOriginalBeats:['string'],postponedOriginalBeats:['string'],newCanonicalDirections:['string'],unresolvedThreadsToCarry:['string'],foreshadowingToProtect:['string'],characterArcsToPreserve:['string'],timelineConstraints:['string'],protectedReveals:['string'],recommendedFutureDirection:'string',reasoning:'string'})+'\n\nCONTEXT:\n'+JSON.stringify(ctx);
}
function reroadmapMasterPrompt_(ctx,d,a){
  const next=Number(d.basedOnCanon)+1,target=Number(d.targetChapters);
  return 'Design the FUTURE MASTER ROADMAP from Ch'+next+' through Ch'+target+'. Canon Ch1-'+d.basedOnCanon+' cannot be changed. Future beats must follow current character states, knowledge, timeline, open threads, foreshadowing, lore, protected canon and author locks. Strategy='+d.strategy+'. '+(d.mode==='WHAT_IF'?'Sandbox premise: '+d.premise+'. ':'')+'Return JSON only:\n'+JSON.stringify({title:'string',targetChapters:target,basedOnCanon:Number(d.basedOnCanon),versionId:d.versionId,planningPhilosophy:'string',endingDirection:'string',preservedLongTermGoals:['string'],changedLongTermGoals:['string'],globalRules:['string'],arcs:[{arc:1,title:'string',startChapter:next,endChapter:target,goal:'string',conflict:'string',emotionalArc:'string',requiredEvents:['string'],protectedReveals:['string'],continuityBridgeFromCanon:'string'}]})+'\n\nANALYSIS:\n'+JSON.stringify(a)+'\n\nSTATE:\n'+JSON.stringify({novel:ctx.novel,blueprint:ctx.blueprint,bible:ctx.bible,protectedCanon:ctx.protectedCanon,authorLocks:ctx.authorLocks,memory:ctx.memory,characters:ctx.characters,timeline:ctx.timeline,threads:ctx.threads,foreshadowing:ctx.foreshadowing,lore:ctx.lore,originalMasterRoadmap:ctx.originalMasterRoadmap,activeMasterRoadmap:ctx.activeMasterRoadmap,lastFullChapters:ctx.lastFullChapters});
}
function reroadmapPlansPrompt_(ctx,d,a,m,start,end,prev){
  return 'Expand Adaptive Master Roadmap into EXACT future chapter plans Ch'+start+'-'+end+'. Every number must appear exactly once. No prose. Preserve causal continuity, pacing, character knowledge, threads, reveal timing and next-chapter bridge. Return JSON only:\n'+JSON.stringify({chapters:[{number:start,arc:1,title:'string',objective:'string',goal:'string',requiredEvents:['string'],emotionalBeat:'string',characterFocus:['string'],continuityRequirements:['string'],mustNotReveal:['string'],plotThreadsAdvanced:['string'],foreshadowing:['string'],endingState:'string'}]})+'\n\nMASTER:\n'+JSON.stringify(m)+'\n\nANALYSIS:\n'+JSON.stringify(a)+'\n\nCURRENT STATE:\n'+JSON.stringify({memory:ctx.memory,characters:ctx.characters,timeline:(ctx.timeline||[]).slice(-40),threads:ctx.threads,foreshadowing:ctx.foreshadowing,protectedCanon:ctx.protectedCanon,authorLocks:ctx.authorLocks,lastFullChapters:ctx.lastFullChapters})+'\n\nPREVIOUS NEW PLANS:\n'+JSON.stringify(prev||[]);
}
function reroadmapDiffPrompt_(oldB,newB,a,d){
  const next=Number(d.basedOnCanon)+1,oldPlans=(oldB.plans||[]).filter(function(x){return Number(x.number)>=next;}).slice(0,30),newPlans=(newB.plans||[]).slice(0,30);
  return 'Compare old roadmap with adaptive roadmap. Canon deviation is not a flaw by itself. Explain preservation and changes. Return JSON only:\n'+JSON.stringify({summary:'string',preserved:['string'],changed:['string'],added:['string'],removed:['string'],postponed:['string'],chapterComparisons:[{range:'81-85',oldDirection:'string',newDirection:'string',reason:'string'}],endingImpact:'string',risks:['string']})+'\n\nOLD MASTER:\n'+JSON.stringify(oldB.master||{})+'\nOLD FUTURE SAMPLE:\n'+JSON.stringify(oldPlans)+'\nNEW MASTER:\n'+JSON.stringify(newB.master||{})+'\nNEW FUTURE SAMPLE:\n'+JSON.stringify(newPlans)+'\nANALYSIS:\n'+JSON.stringify(a||{});
}
function jobReRoadmap_(job){
  const d=job.DATA||{},id=String(d.versionId||'').toUpperCase();if(!id)throw new Error('REROADMAP versionId hilang.');
  const idx=getNovelIndex_(job.NOVEL_ID),sh=getNovelSheet_(job.NOVEL_ID),latest=Number(idx.LATEST_CANON||0);if(latest!==Number(d.basedOnCanon||0))throw new Error('Canon berubah sejak ReRoadmap dimulai. Generate ReRoadmap baru.');
  const folder=adaptiveVersionFolder_(job.NOVEL_ID,id,d.mode==='WHAT_IF'?'WHAT_IF':'REROADMAP'),meta=roadmapVersionMeta_(sh,id)||{};
  if(job.STAGE==='ANALYZE'){
    safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),'🛣 <b>'+escapeHtml_(id)+' — DRIFT ANALYSIS</b>\n\nCanon tetap source of truth...');
    const ctx=buildReRoadmapContext_(job.NOVEL_ID),a=aiJson_(reroadmapAnalysisPrompt_(ctx,d));a.versionId=id;a.basedOnCanon=latest;a.generatedAt=isoNow_();
    const f=upsertTextFile_(folder,'divergence_analysis.json',JSON.stringify(a,null,2));upsertNovelRecord_(sh,'ROADMAP_VERSION_ANALYSIS',id,'','','Adaptive Analysis',a,'READY',nextRecordVersion_(sh,'ROADMAP_VERSION_ANALYSIS',id),f.getId());
    saveRoadmapVersionMeta_(sh,Object.assign({},meta,{status:'BUILDING',divergenceStartChapter:Number(a.divergenceStartChapter||0),overallAlignment:Number(a.overallAlignment||0),coherenceStatus:String(a.coherenceStatus||''),driftWindows:Array.isArray(a.driftWindows)?a.driftWindows:[],analysisFileId:f.getId()}));
    updateJobFields_(job.JOB_ID,{STAGE:'MASTER',PROGRESS:20,STATUS:'RUNNING'});return;
  }
  if(job.STAGE==='MASTER'){
    const ctx=buildReRoadmapContext_(job.NOVEL_ID),a=getNovelRecordData_(sh,'ROADMAP_VERSION_ANALYSIS',id)||{},m=aiJson_(reroadmapMasterPrompt_(ctx,d,a));m.versionId=id;m.basedOnCanon=latest;m.targetChapters=Number(d.targetChapters||idx.TARGET_CHAPTERS||0);m.adaptiveRoadmap=true;m.kind=d.mode==='WHAT_IF'?'WHAT_IF':'REROADMAP';m.strategy=d.strategy;if(d.premise)m.whatIfPremise=d.premise;m.generatedAt=isoNow_();
    if(!Array.isArray(m.arcs)||!m.arcs.length)throw new Error('Adaptive roadmap tidak memiliki arcs.');
    const f=upsertTextFile_(folder,'roadmap_master.json',JSON.stringify(m,null,2));upsertNovelRecord_(sh,'ROADMAP_VERSION_MASTER',id,'','',m.title||id,m,'READY',nextRecordVersion_(sh,'ROADMAP_VERSION_MASTER',id),f.getId());
    saveRoadmapVersionMeta_(sh,Object.assign({},roadmapVersionMeta_(sh,id)||meta,{masterFileId:f.getId(),targetChapters:m.targetChapters,status:'BUILDING'}));
    updateJobFields_(job.JOB_ID,{STAGE:'PLANS',PROGRESS:28,STATUS:'RUNNING',DATA_JSON:JSON.stringify(Object.assign({},d,{targetChapters:m.targetChapters,nextPlanChapter:latest+1}))});return;
  }
  if(job.STAGE==='PLANS'){
    const target=Number(d.targetChapters||idx.TARGET_CHAPTERS||0),start=Number(d.nextPlanChapter||latest+1);if(start>target){updateJobFields_(job.JOB_ID,{STAGE:'DIFF',PROGRESS:88,STATUS:'RUNNING'});return;}
    const end=Math.min(target,start+reroadmapChunkSize_()-1),ctx=buildReRoadmapContext_(job.NOVEL_ID),a=getNovelRecordData_(sh,'ROADMAP_VERSION_ANALYSIS',id)||{},m=getNovelRecordData_(sh,'ROADMAP_VERSION_MASTER',id)||{},existing=getRoadmapVersionPlans_(sh,id),prev=existing.slice(-3),r=aiJson_(reroadmapPlansPrompt_(ctx,d,a,m,start,end,prev)),arr=Array.isArray(r.chapters)?r.chapters:[],by={};arr.forEach(function(x){if(x&&Number(x.number))by[Number(x.number)]=x;});
    const missing=[];for(let n=start;n<=end;n++)if(!by[n])missing.push(n);if(missing.length)throw new Error('ReRoadmap plan missing: '+missing.join(', '));
    const chunk=[];for(let n=start;n<=end;n++){const p=by[n];p.number=n;p.adaptiveVersionId=id;p.basedOnCanon=latest;saveRoadmapVersionPlan_(sh,id,p);chunk.push(p);}
    upsertTextFile_(folder,'chapters_'+pad3_(start)+'_'+pad3_(end)+'.json',JSON.stringify({versionId:id,chapters:chunk},null,2));
    const next=end+1,pct=Math.max(30,Math.min(87,Math.round(30+((next-(latest+1))/Math.max(1,target-latest))*57)));updateJobFields_(job.JOB_ID,{STAGE:next>target?'DIFF':'PLANS',PROGRESS:pct,STATUS:'RUNNING',DATA_JSON:JSON.stringify(Object.assign({},d,{nextPlanChapter:next,targetChapters:target}))});return;
  }
  if(job.STAGE==='DIFF'){
    const a=getNovelRecordData_(sh,'ROADMAP_VERSION_ANALYSIS',id)||{},oldB=getRoadmapVersionBundle_(job.NOVEL_ID,String(d.sourceVersionId||'MASTER')),newB={master:getNovelRecordData_(sh,'ROADMAP_VERSION_MASTER',id)||{},plans:getRoadmapVersionPlans_(sh,id)},diff=aiJson_(reroadmapDiffPrompt_(oldB,newB,a,d));diff.versionId=id;diff.generatedAt=isoNow_();
    const f=upsertTextFile_(folder,'roadmap_diff.json',JSON.stringify(diff,null,2));upsertNovelRecord_(sh,'ROADMAP_VERSION_DIFF',id,'','','Roadmap Diff',diff,'READY',nextRecordVersion_(sh,'ROADMAP_VERSION_DIFF',id),f.getId());
    updateJobFields_(job.JOB_ID,{STAGE:'FINALIZE',PROGRESS:96,STATUS:'RUNNING'});return;
  }
  if(job.STAGE==='FINALIZE'){
    const m=getNovelRecordData_(sh,'ROADMAP_VERSION_MASTER',id)||{},a=getNovelRecordData_(sh,'ROADMAP_VERSION_ANALYSIS',id)||{},diff=getNovelRecordData_(sh,'ROADMAP_VERSION_DIFF',id)||{},plans=getRoadmapVersionPlans_(sh,id),status=d.mode==='WHAT_IF'?'SANDBOX':'CANDIDATE';
    const f=upsertTextFile_(folder,'roadmap.json',JSON.stringify({versionId:id,kind:d.mode==='WHAT_IF'?'WHAT_IF':'REROADMAP',status:status,basedOnCanon:latest,strategy:d.strategy,premise:d.premise||'',master:m,plans:plans,analysis:a,diff:diff},null,2));
    saveRoadmapVersionMeta_(sh,Object.assign({},roadmapVersionMeta_(sh,id)||meta,{status:status,completedAt:isoNow_(),packageFileId:f.getId(),chapterPlans:plans.length,diffSummary:String(diff.summary||'')}));
    updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'DONE',PROGRESS:100});updateNovelIndexFields_(job.NOVEL_ID,{ACTIVE_JOB_ID:'',STATUS:'ACTIVE'});
    if(job.CHAT_ID){
      if(d.mode==='WHAT_IF')editMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),'🌿 <b>WHAT-IF ROADMAP READY</b>\n\nVersion <code>'+escapeHtml_(id)+'</code>\nBranch after Ch'+latest+'\n✅ SANDBOX only. Canon & active roadmap unchanged.',keyboard_([[{text:'📋 VIEW',callback_data:'RR_VIEW|'+job.NOVEL_ID+'|'+id}],[{text:'🛣 CENTER',callback_data:'REROADMAP_CENTER|'+job.NOVEL_ID}]]));
      else editMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),'🛣 <b>REROADMAP CANDIDATE READY</b>\n\nVersion <code>'+escapeHtml_(id)+'</code>\nBased on Canon Ch1–'+latest+'\nAlignment '+Number(a.overallAlignment||0)+'%\nDivergence ~ Ch'+Number(a.divergenceStartChapter||0)+'\n\n'+escapeHtml_(truncate_(diff.summary||a.recommendedFutureDirection||'',900))+'\n\nCanon belum berubah.',keyboard_([[{text:'✅ SET ACTIVE',callback_data:'RR_ACTIVATE|'+job.NOVEL_ID+'|'+id}],[{text:'🌿 SAVE AS WHAT-IF',callback_data:'RR_SANDBOX|'+job.NOVEL_ID+'|'+id}],[{text:'📋 VIEW DIFF',callback_data:'RR_VIEW|'+job.NOVEL_ID+'|'+id}],[{text:'🗑 DISCARD',callback_data:'RR_DISCARD|'+job.NOVEL_ID+'|'+id}]]));
    }return;
  }
  throw new Error('Unknown REROADMAP stage: '+job.STAGE);
}
function canonicalActualRoadmapPlan_(r){
  const n=Number(r&&r.number||0),d=r&&r.data||{},ev=d.keyEvents||d.events||d.majorEvents||[];
  return {number:n,arc:d.arc||'',title:r.title||('Chapter '+n),objective:String(d.summary||d.chapterSummary||'Established Canon.'),goal:String(d.summary||d.chapterSummary||'Preserve Canon.'),requiredEvents:Array.isArray(ev)?ev.slice(0,10):[],emotionalBeat:String(d.emotionalBeat||''),characterFocus:Array.isArray(d.characterFocus)?d.characterFocus:[],continuityRequirements:['Immutable Canon history.'],mustNotReveal:[],endingState:String(d.endingState||d.endState||''),canonicalActual:true,sourceDerived:true};
}
function validateRoadmapPlanCoverage_(plans,start,end){
  const by={};(plans||[]).forEach(function(p){if(p&&Number(p.number))by[Number(p.number)]=true;});const miss=[];for(let n=start;n<=end;n++)if(!by[n])miss.push(n);if(miss.length)throw new Error('Roadmap version missing Ch '+miss.slice(0,30).join(', ')+(miss.length>30?'…':''));
}
function activateAdaptiveRoadmapVersion_(novelId,id,actor){
  id=String(id||'').toUpperCase();const idx=getNovelIndex_(novelId),sh=getNovelSheet_(novelId);if(!idx)throw new Error('Novel tidak ditemukan.');ensureOriginalRoadmapVersion_(novelId);
  const oldId=getActiveRoadmapVersionId_(sh),latest=Number(idx.LATEST_CANON||0),b=getRoadmapVersionBundle_(novelId,id),meta=b.meta||{};if(id!=='MASTER'&&Number(meta.basedOnCanon||0)!==latest)throw new Error('Roadmap '+id+' stale: dibuat pada Canon Ch'+Number(meta.basedOnCanon||0)+', sekarang Ch'+latest+'. Generate ReRoadmap baru.');
  const target=Number(meta.targetChapters||b.master.targetChapters||idx.TARGET_CHAPTERS||0);let plans;
  if(id==='MASTER'){plans=(b.plans||[]).slice();validateRoadmapPlanCoverage_(plans,1,target);}
  else {const canon=getChapterSummaries_(sh,1,latest).map(canonicalActualRoadmapPlan_),future=(b.plans||[]).filter(function(p){return Number(p.number)>latest;});validateRoadmapPlanCoverage_(future,latest+1,target);plans=canon.concat(future);}
  const master=JSON.parse(JSON.stringify(b.master||{}));master.activeVersionId=id;master.adaptiveRoadmap=id!=='MASTER';master.basedOnCanon=id==='MASTER'?0:latest;master.activatedAt=isoNow_();master.targetChapters=target;
  const ver=nextRecordVersion_(sh,'ROADMAP_MASTER','MASTER');deleteNovelRecordsByTypes_(sh,['ROADMAP_ARC','ROADMAP_CHAPTER']);upsertNovelRecord_(sh,'ROADMAP_MASTER','MASTER','','',master.title||idx.TITLE,master,'ACTIVE',ver,meta.masterFileId||meta.snapshotFileId||'');syncArcRecords_(sh,master,ver);plans.forEach(function(p){const n=Number(p.number);upsertNovelRecord_(sh,'ROADMAP_CHAPTER',chapterKey_(n),n,p.arc||'',p.title||('Chapter '+n),p,'ACTIVE',ver,'');});
  upsertNovelRecord_(sh,'ROADMAP_ACTIVE','ACTIVE','','','Active Roadmap',{versionId:id,previousVersionId:oldId,activatedAt:isoNow_(),activatedBy:actor||'ADMIN',basedOnCanon:id==='MASTER'?0:latest},'ACTIVE',nextRecordVersion_(sh,'ROADMAP_ACTIVE','ACTIVE'),meta.packageFileId||meta.snapshotFileId||'');
  if(oldId&&oldId!==id){const old=roadmapVersionMeta_(sh,oldId);if(old){old.status=oldId==='MASTER'?'ORIGINAL':'ARCHIVED';old.archivedAt=isoNow_();saveRoadmapVersionMeta_(sh,old);}}
  const fresh=roadmapVersionMeta_(sh,id)||meta;fresh.status='ACTIVE';fresh.activatedAt=isoNow_();fresh.activatedBy=actor||'ADMIN';saveRoadmapVersionMeta_(sh,fresh);
  const root=ensureAdaptiveRoadmapFolders_(novelId).root,status=readJsonFileIfExists_(root,'roadmap_status.json')||{};status.activeAdaptiveVersion=id;status.previousAdaptiveVersion=oldId;status.activatedAt=isoNow_();upsertTextFile_(root,'roadmap_status.json',JSON.stringify(status,null,2));upsertTextFile_(root,'ACTIVE_ADAPTIVE_ROADMAP.json',JSON.stringify({versionId:id,activatedAt:isoNow_(),basedOnCanon:id==='MASTER'?0:latest,master:master},null,2));
  updateNovelIndexFields_(novelId,{TARGET_CHAPTERS:target,STATUS:'ACTIVE',ACTIVE_JOB_ID:''});updateNovelJson_(novelId);return {ok:true,versionId:id,latestCanon:latest,nextChapter:latest+1,targetChapters:target};
}
function saveRoadmapCandidateAsSandbox_(novelId,id){
  id=String(id||'').toUpperCase();const sh=getNovelSheet_(novelId),m=roadmapVersionMeta_(sh,id);if(!m)throw new Error('Version tidak ditemukan.');if(getActiveRoadmapVersionId_(sh)===id)throw new Error('Roadmap ACTIVE tidak dapat dijadikan sandbox.');m.kind='WHAT_IF';m.status='SANDBOX';m.savedAsWhatIfAt=isoNow_();saveRoadmapVersionMeta_(sh,m);return {ok:true,versionId:id};
}
function discardRoadmapVersion_(novelId,id){
  id=String(id||'').toUpperCase();if(id==='MASTER')throw new Error('MASTER tidak dapat di-discard.');const sh=getNovelSheet_(novelId),m=roadmapVersionMeta_(sh,id);if(!m)throw new Error('Version tidak ditemukan.');if(getActiveRoadmapVersionId_(sh)===id)throw new Error('Roadmap ACTIVE tidak dapat di-discard.');m.status='DISCARDED';m.discardedAt=isoNow_();saveRoadmapVersionMeta_(sh,m);return {ok:true};
}
function getRoadmapCenterData_(novelId){
  const idx=getNovelIndex_(novelId),sh=getNovelSheet_(novelId),active=getActiveRoadmapVersionId_(sh),metas=listRoadmapVersionMeta_(sh);if(!metas.some(function(x){return x.versionId==='MASTER';}))metas.unshift({versionId:'MASTER',kind:'ORIGINAL',status:active==='MASTER'?'ACTIVE':'ORIGINAL',basedOnCanon:0,targetChapters:Number(idx.TARGET_CHAPTERS||0)});
  const v=metas.filter(function(x){return x.status!=='BUILDING';}),latest=v.filter(function(x){return x.versionId!=='MASTER';}).sort(function(a,b){return String(b.completedAt||b.createdAt||'').localeCompare(String(a.completedAt||a.createdAt||''));})[0]||null;
  return {activeVersionId:active,latestCanon:Number(idx.LATEST_CANON||0),targetChapters:Number(idx.TARGET_CHAPTERS||0),nextChapter:Number(idx.LATEST_CANON||0)+1,versions:v.slice(0,30),latestAnalysis:latest?{versionId:latest.versionId,overallAlignment:Number(latest.overallAlignment||0),divergenceStartChapter:Number(latest.divergenceStartChapter||0),coherenceStatus:String(latest.coherenceStatus||''),driftWindows:latest.driftWindows||[],diffSummary:String(latest.diffSummary||'')}:null};
}
function sendReRoadmapCenter_(chatId,novelId){
  const idx=getNovelIndex_(novelId),c=getRoadmapCenterData_(novelId);let text='🛣 <b>ADAPTIVE ROADMAP CENTER</b>\n━━━━━━━━━━━━━━━━━━\n📖 <b>'+escapeHtml_(idx.TITLE)+'</b>\n📚 Canon Ch1–'+c.latestCanon+'\n🟢 Active <code>'+escapeHtml_(c.activeVersionId)+'</code>\n🎯 Future Ch'+c.nextChapter+'–'+c.targetChapters+'\n\n';
  if(c.latestAnalysis)text+='📊 Latest drift: '+c.latestAnalysis.overallAlignment+'% alignment • divergence ~ Ch'+c.latestAnalysis.divergenceStartChapter+' • '+escapeHtml_(c.latestAnalysis.coherenceStatus||'-')+'\n\n';
  c.versions.filter(function(x){return x.versionId!=='MASTER';}).slice(0,8).forEach(function(v){text+=(v.status==='ACTIVE'?'✅':v.kind==='WHAT_IF'?'🌿':'▫️')+' <code>'+escapeHtml_(v.versionId)+'</code> • '+escapeHtml_(v.status||'-')+' • base Ch'+Number(v.basedOnCanon||0)+'\n';});
  text+='\nCanon tidak pernah diubah oleh ReRoadmap.';
  sendMessage_(chatId,text,keyboard_([[{text:'🔄 ADAPT NATURALLY',callback_data:'RR_START|'+novelId+'|ADAPT'},{text:'↩️ RETURN',callback_data:'RR_START|'+novelId+'|RETURN'}],[{text:'🧭 NEW DIRECTION',callback_data:'RR_START|'+novelId+'|NEW'}]]));
}
function sendRoadmapVersionDetail_(chatId,novelId,id){
  const b=getRoadmapVersionBundle_(novelId,id),m=b.meta||{},a=b.analysis||{},d=b.diff||{};let text='🗺 <b>'+escapeHtml_(id)+'</b>\n━━━━━━━━━━━━━━━━━━\nStatus '+escapeHtml_(m.status||'-')+' • '+escapeHtml_(m.kind||'-')+'\nBase Canon Ch'+Number(m.basedOnCanon||0)+'\nStrategy '+escapeHtml_(m.strategy||'-')+'\nPlans '+Number((b.plans||[]).length)+'\n\n';
  if(m.premise)text+='🌿 '+escapeHtml_(truncate_(m.premise,700))+'\n\n';if(a.overallAlignment!==undefined)text+='📊 Alignment '+Number(a.overallAlignment||0)+'% • divergence Ch'+Number(a.divergenceStartChapter||0)+' • '+escapeHtml_(a.coherenceStatus||'-')+'\n\n';if(d.summary)text+='🔀 '+escapeHtml_(truncate_(d.summary,1000))+'\n';
  const rows=[];if(m.status==='CANDIDATE'){rows.push([{text:'✅ SET ACTIVE',callback_data:'RR_ACTIVATE|'+novelId+'|'+id}],[{text:'🌿 SAVE WHAT-IF',callback_data:'RR_SANDBOX|'+novelId+'|'+id}],[{text:'🗑 DISCARD',callback_data:'RR_DISCARD|'+novelId+'|'+id}]);}rows.push([{text:'🛣 CENTER',callback_data:'REROADMAP_CENTER|'+novelId}]);sendMessage_(chatId,text,keyboard_(rows));
}

/* ========================================================================== */
/* JOB DATABASE                                                                */
/* ========================================================================== */

function createJob_(x){
  x=x||{};
  const id='JOB_'+Utilities.getUuid().replace(/-/g,'').slice(0,12).toUpperCase();
  const now=isoNow_();
  let ownerId=String(x.ownerId||''),ownerType=String(x.ownerType||''),channel=String(x.channel||'').toUpperCase();

  if((!ownerId||!ownerType)&&x.novelId){
    const idx=getNovelIndex_(String(x.novelId));
    if(idx){if(!ownerId)ownerId=String(idx.OWNER_ID||'');if(!ownerType)ownerType=String(idx.OWNER_TYPE||'');}
  }
  const uid=String(x.userId||'');
  if(!ownerType)ownerType=/^WUSR_[A-Z0-9]+$/i.test(uid)?'WEB_USER':'TELEGRAM_ADMIN';
  if(!ownerId)ownerId=ownerType==='WEB_USER'?uid.toUpperCase():(uid?'TG_'+uid:'ADMIN');
  if(!channel)channel=ownerType==='WEB_USER'?'WEB':'TELEGRAM';

  const values=[
    id,x.novelId||'',x.chatId||'',x.userId||'',x.type||'',x.stage||'',x.progress||0,x.status||'QUEUED',
    x.messageId||'',JSON.stringify(x.data||{}),'',now,now,ownerId,ownerType,channel
  ];
  const job=rowObject_(SNF.JOB_HEADERS,values);

  if(ownerType==='WEB_USER'){
    const webUid=String(ownerId||uid).toUpperCase();
    const ss=ensureWebUserDb_(webUid),sh=ensureSheet_(ss,SNF.SHEETS.JOBS,SNF.JOB_HEADERS);
    sh.appendRow(values);
    upsertWebJobDirectory_(job,ss.getId());
  }else{
    getSystemSheet_(SNF.SHEETS.JOBS).appendRow(values);
  }
  return id;
}

function getJob_(jobId){
  jobId=String(jobId||'').trim().toUpperCase();
  const admin=getSystemSheet_(SNF.SHEETS.JOBS);
  const ar=findRowByFirstCol_(admin,jobId);
  if(ar){
    const o=rowObject_(SNF.JOB_HEADERS,admin.getRange(ar,1,1,SNF.JOB_HEADERS.length).getValues()[0]);
    o.DATA=safeJson_(o.DATA_JSON,{});return o;
  }

  let loc=null;try{loc=getWebJobDirectory_(jobId);}catch(_){}
  if(!loc)return null;
  const uid=String(loc.USER_ID||'').toUpperCase();
  if(!uid)return null;
  return getWebJobForUser_(uid,jobId);
}

function getNextRunnableJob_(){
  const now=Date.now(),candidates=[];

  // Telegram/Admin queue.
  const admin=getSystemSheet_(SNF.SHEETS.JOBS);
  if(admin.getLastRow()>=2){
    admin.getRange(2,1,admin.getLastRow()-1,SNF.JOB_HEADERS.length).getValues().forEach(function(r){
      const o=rowObject_(SNF.JOB_HEADERS,r);o.DATA=safeJson_(o.DATA_JSON,{});
      if(o.STATUS!=='QUEUED'&&o.STATUS!=='RUNNING')return;
      const retryAt=Number((o.DATA||{})._nextRetryAtMs||0);if(retryAt&&now<retryAt)return;
      candidates.push({kind:'ADMIN',job:o,updated:String(o.UPDATED_AT||o.CREATED_AT||'')});
    });
  }

  // Web queue directory: light metadata only. Open the user DB only for the chosen job.
  try{
    const dir=webJobDirectorySheet_();
    if(dir.getLastRow()>=2){
      dir.getRange(2,1,dir.getLastRow()-1,SNF.WEB_JOB_DIR_HEADERS.length).getValues().forEach(function(r){
        const d=rowObject_(SNF.WEB_JOB_DIR_HEADERS,r),s=String(d.STATUS||'').toUpperCase();
        if(s==='QUEUED'||s==='RUNNING')candidates.push({kind:'WEB',dir:d,updated:String(d.UPDATED_AT||d.CREATED_AT||'')});
      });
    }
  }catch(_){}

  if(!candidates.length)return null;
  candidates.sort(function(a,b){return String(a.updated).localeCompare(String(b.updated));});
  for(let i=0;i<candidates.length;i++){
    const c=candidates[i];
    if(c.kind==='ADMIN')return c.job;
    // v5.1 fix: one orphaned directory entry (deleted user / trashed DB) must
    // never throw here — the exception used to escape processSmartNovelForgeJobs
    // (no catch around getNextRunnableJob_) and stall the ENTIRE job queue.
    let j=null;
    try{
      j=getJob_(c.dir.JOB_ID);
    }catch(err){
      log_('ERROR','getNextRunnableJob_','Web job directory entry tidak bisa dibuka; dilewati.',{jobId:String((c.dir&&c.dir.JOB_ID)||''),error:String(err&&err.message||err)});
      continue;
    }
    if(!j)continue;
    // v5.1 watchdog: RUNNING tanpa update > 45 menit dianggap stale
    // (trigger pernah mati / eksekusi terputus) → antrekan ulang otomatis.
    if(String(j.STATUS||'').toUpperCase()==='RUNNING'){
      const updatedAt=Date.parse(String(j.UPDATED_AT||j.CREATED_AT||''))||0;
      if(updatedAt && (now-updatedAt)>45*60*1000){
        try{
          updateJobFields_(j.JOB_ID,{STATUS:'QUEUED',LAST_ERROR:'Auto-requeue: stale RUNNING terdeteksi worker.'});
          log_('WARN','job-watchdog','Stale RUNNING job di-requeue otomatis.',{jobId:j.JOB_ID});
        }catch(_){}
        continue;
      }
    }
    const retryAt=Number((j.DATA||{})._nextRetryAtMs||0);
    if(!retryAt||now>=retryAt)return j;
  }
  return null;
}

function updateJobFields_(jobId,fields){
  jobId=String(jobId||'').trim().toUpperCase();
  const admin=getSystemSheet_(SNF.SHEETS.JOBS);
  const ar=findRowByFirstCol_(admin,jobId);
  if(ar){
    Object.keys(fields).forEach(function(k){const c=SNF.JOB_HEADERS.indexOf(k)+1;if(c>0)admin.getRange(ar,c).setValue(fields[k]);});
    admin.getRange(ar,SNF.JOB_HEADERS.indexOf('UPDATED_AT')+1).setValue(isoNow_());
    return;
  }

  const loc=getWebJobDirectory_(jobId);
  if(!loc)throw new Error('Job tidak ditemukan: '+jobId);
  const uid=String(loc.USER_ID||'').toUpperCase(),sh=getWebUserJobsSheet_(uid),row=findRowByFirstCol_(sh,jobId);
  if(!row)throw new Error('Web job tidak ditemukan: '+jobId);
  Object.keys(fields).forEach(function(k){const c=SNF.JOB_HEADERS.indexOf(k)+1;if(c>0)sh.getRange(row,c).setValue(fields[k]);});
  sh.getRange(row,SNF.JOB_HEADERS.indexOf('UPDATED_AT')+1).setValue(isoNow_());
  const fresh=rowObject_(SNF.JOB_HEADERS,sh.getRange(row,1,1,SNF.JOB_HEADERS.length).getValues()[0]);
  upsertWebJobDirectory_(fresh,String(loc.DB_ID||ensureWebUserDb_(uid).getId()));
}

/* ========================================================================== */
/* SESSION DATABASE                                                            */
/* ========================================================================== */

function getSession_(userId,chatId){
  const sh=getSystemSheet_(SNF.SHEETS.SESSIONS);
  const row=findRowByFirstCol_(sh,userId);
  if(!row){
    setSession_(userId,chatId,'IDLE','',{});
    return {userId:userId,chatId:chatId,state:'IDLE',activeNovelId:'',data:{}};
  }
  const v=sh.getRange(row,1,1,SNF.SESSION_HEADERS.length).getValues()[0];
  let activeNovelId=String(v[3]||'');
  if(activeNovelId){
    const idx=getNovelIndex_(activeNovelId);
    if(!idx || !isTelegramAdminNovel_(idx)){
      activeNovelId='';
      setSession_(userId,chatId,'IDLE','',{});
    }
  }
  return {userId:String(v[0]),chatId:String(v[1]),state:String(v[2]||'IDLE'),activeNovelId:activeNovelId,data:safeJson_(v[4],{})};
}

function setSession_(userId,chatId,state,activeNovelId,data){
  const sh=getSystemSheet_(SNF.SHEETS.SESSIONS);
  const row=findRowByFirstCol_(sh,userId);
  const vals=[String(userId),String(chatId),state||'IDLE',activeNovelId||'',JSON.stringify(data||{}),isoNow_()];
  if(row)sh.getRange(row,1,1,vals.length).setValues([vals]); else sh.appendRow(vals);
}

/* ========================================================================== */
/* DRIVE WORKSPACE                                                             */
/* ========================================================================== */

function ensureRootFolder_(){
  const props=PropertiesService.getScriptProperties();
  const configured=props.getProperty('ROOT_FOLDER_ID');
  if(configured){
    try{return DriveApp.getFolderById(configured);}catch(_){ }
  }
  const it=DriveApp.getFoldersByName(SNF.ROOT_FOLDER_NAME);
  const folder=it.hasNext()?it.next():DriveApp.createFolder(SNF.ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID',folder.getId());
  return folder;
}


function ensureTranslateRoot_(){
  return getOrCreateChildFolder_(ensureRootFolder_(), 'Translate');
}

function getTranslationNovelFolder_(novelId){
  const idx = getNovelIndex_(novelId);
  if (!idx) throw new Error('Novel tidak ditemukan: ' + novelId);
  const root = ensureTranslateRoot_();
  return getOrCreateChildFolder_(root, safeFileName_(idx.TITLE || novelId));
}

function createNovelWorkspace_(novelId,bp,ownerId){
  const root=ensureRootFolder_();
  let parent=root;
  if(ownerId){
    if(/^WUSR_[A-Z0-9]+$/i.test(String(ownerId))){
      parent=ensureWebUserFolder_(String(ownerId).toUpperCase());
    }else{
      const usersRoot=getOrCreateChildFolder_(root,'LEGACY_USERS');
      parent=getOrCreateChildFolder_(usersRoot,safeFileName_(ownerId));
    }
  }else{
    parent=getOrCreateChildFolder_(root,'ADMIN');
  }
  const title=safeFileName_(bp.title||'Untitled Novel');
  const nf=parent.createFolder(novelId+' - '+title);
  const folders={};
  SNF.FOLDERS.forEach(function(name){folders[name]=nf.createFolder(name).getId();});
  const exportFolder=getFolderByIdSafe_(folders['09_EXPORT']);
  folders['09_EXPORT/TXT']=exportFolder.createFolder('TXT').getId();
  folders['09_EXPORT/DOCX']=exportFolder.createFolder('DOCX').getId();
  folders['09_EXPORT/EPUB']=exportFolder.createFolder('EPUB').getId();

  const mediaFolder=getFolderByIdSafe_(folders['12_MEDIA']);
  folders['12_MEDIA/Cover']=mediaFolder.createFolder('Cover').getId();
  folders['12_MEDIA/Characters']=mediaFolder.createFolder('Characters').getId();
  folders['12_MEDIA/Chapters']=mediaFolder.createFolder('Chapters').getId();
  folders['12_MEDIA/Promo']=mediaFolder.createFolder('Promo').getId();

  createNovelSheet_(novelId,ownerId||'');
  const blueprintFile=getFolderByIdSafe_(folders['01_BIBLE']).createFile('blueprint.json',JSON.stringify(bp,null,2),MimeType.PLAIN_TEXT);
  nf.createFile('novel.json',JSON.stringify({
    novelId:novelId,title:bp.title||'',language:bp.language||'',status:'BUILDING',currentChapter:0,currentArc:1,
    latestCanonChapter:0,databaseSheet:novelId,ownerId:ownerId||'ADMIN',createdAt:isoNow_(),version:1
  },null,2),MimeType.PLAIN_TEXT);

  return {rootId:nf.getId(),folders:folders,blueprintFileId:blueprintFile.getId()};
}

function upsertVersionedJson_(folderId,base,version,obj){
  const folder=getFolderByIdSafe_(folderId);
  return folder.createFile(base+'_v'+version+'.json',JSON.stringify(obj,null,2),MimeType.PLAIN_TEXT);
}

function upsertTextFile_(folder,name,content){
  const it=folder.getFilesByName(name);
  if(it.hasNext()){
    const f=it.next();
    f.setContent(String(content));
    return f;
  }
  return folder.createFile(name,String(content),MimeType.PLAIN_TEXT);
}

function getFolderByIdSafe_(id){
  if(!id)throw new Error('Folder ID kosong.');
  return DriveApp.getFolderById(String(id));
}

function updateNovelJson_(novelId){
  const index=getNovelIndex_(novelId);
  const sh=getNovelSheet_(novelId);
  const bp=getNovelRecordData_(sh,'BLUEPRINT','MASTER')||{};
  const root=getFolderByIdSafe_(index.FOLDER_ID);
  const data={
    novelId:novelId,title:index.TITLE,language:index.LANGUAGE,status:index.STATUS,
    currentChapter:Number(index.CURRENT_CHAPTER||0),latestCanonChapter:Number(index.LATEST_CANON||0),
    targetChapters:Number(bp.targetChapters||index.TARGET_CHAPTERS||0),databaseSheet:novelId,updatedAt:isoNow_(),version:1
  };
  upsertTextFile_(root,'novel.json',JSON.stringify(data,null,2));
}

/* ========================================================================== */
/* RECORD SYNC HELPERS                                                         */
/* ========================================================================== */

function syncBibleRecords_(sh,bible,ver){
  (bible.characters||[]).forEach(function(c,i){upsertNovelRecord_(sh,'CHARACTER',c.id||('CHAR_'+pad3_(i+1)),'','',c.name||'',c,'DRAFT',ver,'');});
  (bible.locations||[]).forEach(function(c,i){upsertNovelRecord_(sh,'LOCATION',c.id||('LOC_'+pad3_(i+1)),'','',c.name||'',c,'DRAFT',ver,'');});
  (bible.factions||[]).forEach(function(c,i){upsertNovelRecord_(sh,'FACTION',c.id||('FAC_'+pad3_(i+1)),'','',c.name||'',c,'DRAFT',ver,'');});
  (bible.protectedCanon||[]).forEach(function(c,i){upsertNovelRecord_(sh,'PROTECTED_CANON',c.id||('PC_'+pad3_(i+1)),'','','',c,'LOCKED',ver,'');});
}

function syncArcRecords_(sh,roadmap,ver){
  (roadmap.arcs||[]).forEach(function(a,i){
    upsertNovelRecord_(sh,'ROADMAP_ARC','ARC_'+pad2_(Number(a.arc||i+1)),'',a.arc||i+1,a.title||'',a,'DRAFT',ver,'');
  });
}

function markNovelFoundationCanon_(novelId){
  const sh=getNovelSheet_(novelId);
  const last=sh.getLastRow();
  if(last<2)return;
  const vals=sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
  for(let i=0;i<vals.length;i++){
    const type=String(vals[i][0]);
    if(['BLUEPRINT','BIBLE','CHARACTER','LOCATION','FACTION','PROTECTED_CANON','ROADMAP_MASTER','ROADMAP_ARC','ROADMAP_CHAPTER'].indexOf(type)>=0){
      sh.getRange(i+2,7).setValue(type==='PROTECTED_CANON'?'LOCKED':'CANON');
      sh.getRange(i+2,10).setValue(isoNow_());
    }
  }
  updateNovelIndexFields_(novelId,{STATUS:'FOUNDATION_APPROVED'});
}

function syncMemoryArtifacts_(sh,memory,folder,ver){
  const pieces={
    'CURRENT_STORY_STATE':memory.currentStoryState||'',
    'CHARACTER_STATES':memory.characters||{},
    'TIMELINE':memory.timeline||[],
    'PLOT_THREADS':{open:memory.openPlotThreads||[],resolved:memory.resolvedPlotThreads||[]},
    'FORESHADOWING':memory.foreshadowing||[],
    'CHARACTER_KNOWLEDGE':{readerKnowledge:memory.readerKnowledge||[],characters:memory.characters||{}},
    'CONTINUITY_WARNINGS':memory.continuityWarnings||[]
  };
  Object.keys(pieces).forEach(function(k){
    const file=upsertTextFile_(folder,k.toLowerCase()+'.json',JSON.stringify(pieces[k],null,2));
    upsertNovelRecord_(sh,k,'GLOBAL','','','',pieces[k],'CANON',ver,file.getId());
  });
}

function buildCanonManifest_(sh){
  const last=sh.getLastRow();
  const chapters=[];
  if(last>=2){
    const vals=sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
    vals.forEach(function(r){
      if(r[0]==='CHAPTER_SUMMARY'&&r[6]==='CANON')chapters.push({key:r[1],chapter:r[2],title:r[4],version:r[7],sourceFileId:r[8]});
    });
  }
  chapters.sort(function(a,b){return Number(a.chapter)-Number(b.chapter);});
  return {updatedAt:isoNow_(),chapters:chapters};
}

/* ========================================================================== */
/* RENDER TELEGRAM                                                             */
/* ========================================================================== */

function sendHome_(chatId){
  sendMessage_(chatId,
    '🔥 <b>SMART NOVEL FORGE</b>\n' +
    '<i>AI Writer • Story Director • Continuity Editor</i>\n\n' +
    'Pilih <b>📚 NOVEL</b> untuk membuka library novel, atau <b>✨ CREATE</b> untuk membuat novel baru.\n\n' +
    'Command cepat:\n' +
    '✍️ /write next — buat chapter berikutnya\n' +
    '🔍 /review 1-5 — review chapter\n' +
    '♻️ /rewrite 3 — revisi/rewrite chapter\n' +
    '🌐 /translate — Translation Center\n' +
    '🩺 /health — Canon Health Check\n' +
    '🧬 /style — Style Lock\n' +
    '🤖 /ai — Multi-AI Router\n' +
    '🎭 /character Shu — Character Tracker\n' +
    '🧵 /threads — Plot Threads\n' +
    '🕰 /timeline — Timeline\n' +
    '💰 /aiusage — AI Usage\n' +
    '🤖 /autowrite 41-100 — Full Auto\n' +
    '🎨 /art — Cover & Art\n' +
    '⚙️ /jobs — job Admin + clear completed\n' +
    '🌐 /webnovels — monitor novel Web User\n' +
    '🔄 /scan — sinkronisasi Drive\\n\\n' +
    '💬 <b>NOVEL AGENT (v5.2):</b> kamu juga bisa ketik bahasa bebas, misal\\n' +
    '<i>"lanjut tulis chapter berikutnya"</i>, <i>"tulis sampai tamat"</i>,\\n' +
    '<i>"review chapter 1-10"</i>, atau <i>"siapa karakter utamanya?"</i>\\n' +
    '— AI akan memahami dan menjalankan perintahnya.',
    mainMenuKeyboard_());
}

function mainMenuKeyboard_(){
  return {
    keyboard:[
      [{text:'📚 NOVEL'},{text:'✨ CREATE'}],
      [{text:'🌐 WEB NOVELS'},{text:'⚙️ JOBS'}]
    ],
    resize_keyboard:true,is_persistent:true,one_time_keyboard:false
  };
}

function renderBlueprint_(bp){
  const protagonist=bp.protagonist||{};
  return '📋 <b>NOVEL BLUEPRINT</b>\n\n' +
    '📖 <b>'+escapeHtml_(bp.title||'Untitled')+'</b>\n\n' +
    '📝 '+escapeHtml_(truncate_(bp.description||'',700))+'\n\n' +
    '🎭 <b>Genre</b>\n'+escapeHtml_((bp.genres||[]).join(' • ')||'-')+'\n\n' +
    '👤 <b>Protagonist</b>\n'+escapeHtml_((protagonist.name||'-')+(protagonist.role?' — '+protagonist.role:''))+'\n\n' +
    '🌍 <b>Setting</b>\n'+escapeHtml_(bp.setting||'-')+'\n\n' +
    '📚 <b>Target</b>\n'+Number(bp.targetChapters||120)+' chapters • ~'+Number(bp.targetWordsPerChapter||1800)+' words/chapter\n\n' +
    '🎥 <b>POV</b>\n'+escapeHtml_(bp.pov||'-')+'\n\n' +
    '⏱ <b>Pacing</b>\n'+escapeHtml_(bp.pacing||'-')+'\n\n' +
    '🧩 <b>Core Mystery / Conflict</b>\n'+escapeHtml_(truncate_((bp.coreMystery||bp.coreConflict||'-'),650))+'\n\n' +
    '🔒 <b>Special Rules</b>\n'+escapeHtml_((bp.specialRules||[]).slice(0,8).map(function(x){return '• '+x;}).join('\n')||'-')+'\n\n' +
    'Sudah sesuai dengan bayanganmu?';
}

function renderFoundationProgress_(stage,pct,title){
  return '🔥 <b>FORGING NEW NOVEL</b>\n\n' +
    '<b>'+escapeHtml_(title||'Novel')+'</b>\n\n' +
    progressBar_(pct)+' '+pct+'%\n\n' +
    '✅ Project Database\n' +
    (pct>=10?'✅':'⏳')+' Drive Workspace\n' +
    (pct>=28?'✅':'⬜')+' Novel Bible\n' +
    (pct>=35?'✅':'⬜')+' Master Roadmap\n' +
    (pct>=65?'✅':'⬜')+' Detailed Chapter Plans\n' +
    (pct>=72?'✅':'⬜')+' Consistency Audit\n\n' +
    '🧠 <i>'+escapeHtml_(stage)+'</i>';
}

function renderFoundationReady_(bp,roadmap){
  const arcs=(roadmap.arcs||[]).length;
  return '🎉 <b>NOVEL FOUNDATION READY</b>\n\n' +
    '📖 <b>'+escapeHtml_(bp.title||'Untitled')+'</b>\n\n' +
    '✅ Novel Bible\n✅ Character Bible\n✅ World Rules\n✅ Protected Canon\n✅ Master Roadmap\n✅ '+arcs+' Story Arcs\n✅ '+Number(bp.targetChapters||0)+' Chapter Plans\n\n' +
    '🟡 <b>WAITING ADMIN APPROVAL</b>\n\n' +
    'Periksa Bible dan Roadmap. Jika diterima, bot akan testing menulis Chapter 1–'+defaultBatchSize_()+'.';
}

function renderBatchProgress_(start,end,current,stage,pct,label){
  let lines=[];
  for(let n=start;n<=end;n++){
    let icon='⬜';
    if(n<current)icon='✅'; else if(n===current&&current<=end)icon='⏳';
    lines.push(icon+' Chapter '+n);
  }
  return '✍️ <b>'+escapeHtml_(label)+'</b>\n\n' +
    progressBar_(pct)+' '+pct+'%\n\n' + lines.join('\n') +
    '\n\n🧠 <i>'+escapeHtml_(stage)+'</i>';
}

function renderBatchReady_(novelId,start,end,review){
  const index=getNovelIndex_(novelId);
  const verdict=String(review.verdict||'UNKNOWN').toUpperCase();
  const icon=reviewStatusIcon_(verdict);
  const syncStatus=String(
    review && review.storySynchronization && review.storySynchronization.status ||
    review && review.continuity && review.continuity.status ||
    'UNKNOWN'
  ).toUpperCase();
  const syncIcon=reviewStatusIcon_(syncStatus);
  return '🧪 <b>BATCH GENERATION COMPLETE</b>\n\n' +
    '📖 <b>'+escapeHtml_(index?index.TITLE:novelId)+'</b>\n' +
    'Chapter '+start+'–'+end+'\n\n' +
    '✅ Chapter files generated\n✅ Continuity review complete\n✅ Admin preview created\n\n' +
    '🔍 AI Review : '+icon+' <b>'+escapeHtml_(verdict)+'</b>\n' +
    '🔗 Story Sync: '+syncIcon+' <b>'+escapeHtml_(syncStatus)+'</b>\n' +
    escapeHtml_(truncate_(review.summary||'',700))+'\n\n' +
    '🟡 <b>WAITING ADMIN APPROVAL</b>';
}


function chapterRangeLabel_(start,end) {
  start=Number(start||0);
  end=Number(end||start||0);
  return start===end ? String(start) : (start+'–'+end);
}

function batchApprovalKeyboard_(job) {
  const d=job.DATA || {};
  const start=Number(d.startChapter||0);
  const end=Number(d.endChapter||start||0);
  const index=getNovelIndex_(job.NOVEL_ID);
  const sh=getNovelSheet_(job.NOVEL_ID);

  let driveUrl='';
  try { driveUrl=index && index.FOLDER_ID ? getFolderByIdSafe_(index.FOLDER_ID).getUrl() : ''; } catch (_) {}

  let previewUrl=String(d.previewUrl||'');
  if (!previewUrl) {
    const folders=getNovelRecordData_(sh,'META','FOLDERS') || {};
    try { previewUrl=getFolderByIdSafe_(folders['00_ADMIN_PREVIEW']).getUrl(); } catch (_) {}
  }

  let reviewUrl=String(d.reviewUrl||'');
  if (!reviewUrl) {
    const reviewFileId=getNovelRecordFileId_(sh,'REVIEW','JOB_'+job.JOB_ID);
    try { reviewUrl=reviewFileId ? DriveApp.getFileById(reviewFileId).getUrl() : ''; } catch (_) {}
  }

  // Telegram URL buttons require a valid URL. Fall back to the novel folder.
  previewUrl=previewUrl || driveUrl;
  reviewUrl=reviewUrl || previewUrl || driveUrl;

  const rows=[];
  if (previewUrl) rows.push([{text:'📖 Buka Chapter '+chapterRangeLabel_(start,end),url:previewUrl}]);

  const reviewRow=[{text:'🔍 AI Review',callback_data:'BATCH_REREVIEW|'+job.JOB_ID}];
  if (reviewUrl) reviewRow.push({text:'📄 Hasil Review',url:reviewUrl});
  rows.push(reviewRow);

  if (driveUrl) rows.push([{text:'📂 Drive',url:driveUrl}]);

  rows.push([
    {text:'✅ ACCEPT',callback_data:'BATCH_ACCEPT|'+job.JOB_ID},
    {text:'🗑 HAPUS / CANCEL',callback_data:'BATCH_CANCEL|'+job.JOB_ID}
  ]);
  rows.push([{text:'🔄 Regenerate',callback_data:'BATCH_REGEN|'+job.JOB_ID}]);

  return {inline_keyboard:rows};
}

function snapshotNovelRecord_(record) {
  if (!record) return null;
  return {
    TYPE:String(record.TYPE||''),
    KEY:String(record.KEY||''),
    CHAPTER:record.CHAPTER||'',
    ARC:record.ARC||'',
    TITLE:String(record.TITLE||''),
    DATA:record.DATA || safeJson_(record.DATA_JSON,{}),
    STATUS:String(record.STATUS||''),
    VERSION:Number(record.VERSION||1),
    FILE_ID:String(record.FILE_ID||'')
  };
}

function restoreNovelRecordSnapshot_(sh,snapshot) {
  if (!snapshot) return false;
  upsertNovelRecord_(
    sh,
    snapshot.TYPE,
    snapshot.KEY,
    snapshot.CHAPTER,
    snapshot.ARC,
    snapshot.TITLE,
    snapshot.DATA || {},
    snapshot.STATUS,
    Number(snapshot.VERSION||1),
    snapshot.FILE_ID || ''
  );
  return true;
}

function deleteNovelRecord_(sh,type,key) {
  const row=findNovelRecordRow_(sh,type,key);
  if (!row) return false;
  sh.deleteRow(row);
  return true;
}

function trashDriveFileSafe_(fileId) {
  fileId=String(fileId||'').trim();
  if (!fileId) return false;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return true;
  } catch (err) {
    log_('WARN','trashDriveFileSafe_','Gagal memindahkan file ke Trash',{fileId:fileId,error:String(err && err.message || err)});
    return false;
  }
}

function trashFilesByExactName_(folderId,fileName) {
  let count=0;
  if (!folderId || !fileName) return count;
  try {
    const it=getFolderByIdSafe_(folderId).getFilesByName(fileName);
    while (it.hasNext()) {
      try {
        it.next().setTrashed(true);
        count++;
      } catch (_) {}
    }
  } catch (_) {}
  return count;
}

function cancelAndDeleteBatch_(job,userId) {
  if (!job) throw new Error('Job tidak ditemukan.');
  if (String(job.STATUS)!=='WAITING_APPROVAL') {
    throw new Error('Batch sudah tidak menunggu approval.');
  }

  const d=job.DATA || {};
  const start=Number(d.startChapter||0);
  const end=Number(d.endChapter||start||0);
  if (!start || !end) throw new Error('Range chapter job tidak valid.');

  const sh=getNovelSheet_(job.NOVEL_ID);
  const index=getNovelIndex_(job.NOVEL_ID);
  const folders=getNovelRecordData_(sh,'META','FOLDERS') || {};
  const rollback=d.rollbackRecords || {};
  const generated=Array.isArray(d.generatedFiles) ? d.generatedFiles : [];
  const generatedIds={};

  let deletedFiles=0;
  let deletedRecords=0;
  let restoredRecords=0;
  let protectedCanon=0;

  generated.forEach(function(x){
    const id=String(x && x.fileId || '');
    if (!id) return;
    generatedIds[id]=true;
    if (trashDriveFileSafe_(id)) deletedFiles++;
  });

  for (let n=start; n<=end; n++) {
    const key=chapterKey_(n);
    const current=getNovelRecord_(sh,'CHAPTER_SUMMARY',key);

    if (current && String(current.STATUS)==='CANON') {
      protectedCanon++;
      continue;
    }

    const snap=Object.prototype.hasOwnProperty.call(rollback,String(n))
      ? rollback[String(n)]
      : undefined;

    if (snap) {
      if (current && current.FILE_ID && String(current.FILE_ID)!==String(snap.FILE_ID||'')) {
        if (!generatedIds[String(current.FILE_ID)] && trashDriveFileSafe_(current.FILE_ID)) deletedFiles++;
      }
      restoreNovelRecordSnapshot_(sh,snap);
      restoredRecords++;
      continue;
    }

    if (!current) continue;

    const generatedByThisJob=String(current.DATA && current.DATA.generatedByJobId || '')===String(job.JOB_ID);
    const exactFile=generatedIds[String(current.FILE_ID||'')];

    // Legacy jobs made before v2.2.3 did not store generatedFiles/job IDs.
    // For those jobs, a non-canon record in the cancelled range is treated as
    // the draft created by that approval job.
    const legacySafeFallback=generated.length===0;

    if (generatedByThisJob || exactFile || legacySafeFallback) {
      if (current.FILE_ID && !generatedIds[String(current.FILE_ID)] && trashDriveFileSafe_(current.FILE_ID)) deletedFiles++;
      if (deleteNovelRecord_(sh,'CHAPTER_SUMMARY',key)) deletedRecords++;
    }
  }

  // Remove review generated specifically for this job.
  const reviewRecord=getNovelRecord_(sh,'REVIEW','JOB_'+job.JOB_ID);
  if (reviewRecord) {
    if (reviewRecord.FILE_ID && trashDriveFileSafe_(reviewRecord.FILE_ID)) deletedFiles++;
    deleteNovelRecord_(sh,'REVIEW','JOB_'+job.JOB_ID);
  }

  // Remove admin preview. New jobs store the exact file ID; legacy jobs fall
  // back to the deterministic preview filename.
  if (d.previewFileId) {
    if (trashDriveFileSafe_(d.previewFileId)) deletedFiles++;
  } else if (folders['00_ADMIN_PREVIEW']) {
    deletedFiles += trashFilesByExactName_(
      folders['00_ADMIN_PREVIEW'],
      'CHAPTER_'+pad3_(start)+'_'+pad3_(end)+'_ADMIN_PREVIEW.txt'
    );
  }

  const nd=Object.assign({},d,{
    cancelledAt:isoNow_(),
    cancelledBy:String(userId||''),
    deletedFiles:deletedFiles,
    deletedRecords:deletedRecords,
    restoredRecords:restoredRecords
  });
  updateJobFields_(job.JOB_ID,{
    STATUS:'CANCELLED',
    STAGE:'ADMIN_CANCELLED',
    PROGRESS:100,
    LAST_ERROR:'',
    DATA_JSON:JSON.stringify(nd)
  });

  if (index) {
    const fields={};
    if (String(index.ACTIVE_JOB_ID||'')===String(job.JOB_ID)) fields.ACTIVE_JOB_ID='';
    if (Number(index.LATEST_CANON||0)>0) fields.STATUS='ACTIVE';
    else if (String(index.SOURCE||'')==='DRIVE_IMPORT') fields.STATUS='FOUNDATION_IMPORTED';
    else fields.STATUS='FOUNDATION_APPROVED';
    updateNovelIndexFields_(job.NOVEL_ID,fields);
  }

  if (userId && job.CHAT_ID) {
    setSession_(String(userId),String(job.CHAT_ID),'IDLE',job.NOVEL_ID,{});
  }

  return {
    ok:true,
    jobId:job.JOB_ID,
    novelId:job.NOVEL_ID,
    startChapter:start,
    endChapter:end,
    deletedFiles:deletedFiles,
    deletedRecords:deletedRecords,
    restoredRecords:restoredRecords,
    protectedCanon:protectedCanon
  };
}


function renderActiveRereviewProgress_(novelId,start,end,reviewCount){
  const index=getNovelIndex_(novelId);
  return '🔍 <b>AI REVIEW ULANG</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>'+escapeHtml_(index?index.TITLE:novelId)+'</b>\n' +
    '📚 Chapter '+start+(end!==start?('–'+end):'')+'\n' +
    '🔁 Review #'+Number(reviewCount||1)+'\n\n' +
    '⏳ Sinkronisasi dengan Bible\n' +
    '⏳ Roadmap chapter target\n' +
    '⏳ Chapter & canon sebelumnya\n' +
    '⏳ Character state / knowledge\n' +
    '⏳ Timeline & plot threads\n' +
    '⏳ Bridge ke chapter berikutnya\n' +
    '⏳ Cross-chapter aggregate review\n\n' +
    '<i>Job masuk queue dan diproses worker otomatis.</i>';
}

function reviewStatusIcon_(status){
  status=String(status||'UNKNOWN').toUpperCase();
  return status==='PASS'?'✅':(status==='FAIL'?'❌':'⚠️');
}

function progressBar_(pct){
  const full=Math.max(0,Math.min(10,Math.round(Number(pct||0)/10)));
  return '█'.repeat(full)+'░'.repeat(10-full);
}

function sendNovelList_(chatId,userId){
  const view = buildNovelListView_();
  sendMessage_(chatId, view.text, view.keyboard);
}

function buildNovelListView_(){
  const list = listNovels_().filter(isTelegramAdminNovel_).slice(0,25);
  if (!list.length) {
    return {
      text:'📚 <b>NOVEL</b>\n━━━━━━━━━━━━━━━━━━\nBelum ada novel.\n\nTekan <b>✨ CREATE</b> untuk membuat novel baru atau jalankan /scan jika kamu sudah menaruh novel manual di Drive.',
      keyboard:keyboard_([[{text:'✨ CREATE NOVEL',callback_data:'NOVEL_CREATE'}]])
    };
  }

  const rows = list.map(function(n){
    const canon = Number(n.LATEST_CANON || 0);
    const target = Number(n.TARGET_CHAPTERS || 0);
    const icon = String(n.STATUS || '').indexOf('NEEDS_ROADMAP') >= 0 ? '🟡' : (canon > 0 ? '📖' : '📘');
    let label = icon + ' ' + truncate_(n.TITLE || n.NOVEL_ID, 42);
    if (target) label += '  [' + canon + '/' + target + ']';
    else if (canon) label += '  [' + canon + ']';
    return [{text:label, callback_data:'NOVEL_VIEW|' + n.NOVEL_ID}];
  });
  rows.push([{text:'✨ CREATE NOVEL',callback_data:'NOVEL_CREATE'}]);

  return {
    text:'📚 <b>NOVEL LIBRARY</b>\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      'Pilih novel untuk membuka workspace-nya.\n\n' +
      '📖 = sudah punya canon\n' +
      '📘 = foundation/draft\n' +
      '🟡 = perlu memilih roadmap',
    keyboard:keyboard_(rows)
  };
}

function buildNovelDetailView_(novelId){
  const n = getNovelIndex_(novelId);
  if (!n || !isTelegramAdminNovel_(n)) throw new Error('Novel Telegram Admin tidak ditemukan: ' + novelId);

  const sh = getNovelSheet_(novelId);
  const bp = getNovelRecordData_(sh,'BLUEPRINT','MASTER') || {};
  const roadmap = getNovelRecordData_(sh,'ROADMAP_MASTER','MASTER') ||
    getNovelRecordData_(sh,'ROADMAP','MASTER') || {};

  const genres = Array.isArray(bp.genres) && bp.genres.length
    ? bp.genres.join(' • ')
    : (n.GENRE || '-');

  const canon = Number(n.LATEST_CANON || 0);
  const target = Number(n.TARGET_CHAPTERS || bp.targetChapters || 0);
  const next = canon + 1;
  const roadmapName = roadmap.sourceFile || roadmap.source || roadmap.title || roadmap.name || '';

  let text =
    '📖 <b>' + escapeHtml_(n.TITLE) + '</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '🆔 <code>' + escapeHtml_(n.NOVEL_ID) + '</code>\n' +
    '🎭 ' + escapeHtml_(genres || '-') + '\n' +
    '🌐 ' + escapeHtml_(n.LANGUAGE || bp.language || '-') + '\n' +
    '📚 Canon: <b>' + canon + (target ? (' / ' + target) : '') + '</b>\n' +
    '➡️ Next: <b>Chapter ' + next + '</b>\n' +
    '⚙️ ' + escapeHtml_(n.STATUS || '-') + '\n';

  if (roadmapName) {
    text += '🗺 ' + escapeHtml_(truncate_(roadmapName,80)) + '\n';
  }

  text += '\nPilih menu untuk mengelola novel ini.';

  const rows = [];

  // New dedicated information page.
  rows.push([
    {text:'📋 DETAIL NOVEL', callback_data:'NOVEL_INFO|' + novelId}
  ]);

  if (target && next > target) {
    rows.push([
      {text:'✅ Semua chapter target selesai',callback_data:'NOVEL_VIEW|' + novelId}
    ]);
  } else {
    rows.push([
      {text:'✍️ BUAT CHAPTER ' + next,callback_data:'NOVEL_WRITE_NEXT|' + novelId}
    ]);
  }

  rows.push([
    {text:'♻️ REVISI CHAPTER',callback_data:'NOVEL_REWRITE_PICK|' + novelId},
    {text:'🧰 TOOLS',callback_data:'NOVEL_TOOLS|' + novelId}
  ]);

  rows.push([
    {text:'🌐 TRANSLATE',callback_data:'NOVEL_TRANSLATE|' + novelId},
    {text:'🩺 CANON HEALTH',callback_data:'NOVEL_HEALTH|' + novelId}
  ]);

  rows.push([
    {text:'🧬 STYLE LOCK',callback_data:'NOVEL_STYLE|' + novelId},
    {text:'🗺 ROADMAP',callback_data:'NOVEL_ROADMAPS|' + novelId}
  ]);

  rows.push([
    {text:'🛣 REROADMAP',callback_data:'REROADMAP_CENTER|' + novelId}
  ]);

  rows.push([
    {text:'🧠 NOVEL BRAIN',callback_data:'NOVEL_BRAIN|' + novelId},
    {text:'🎨 VISUAL / ART',callback_data:'NOVEL_VISUAL|' + novelId}
  ]);

  rows.push([
    {text:'📦 EXPORT',callback_data:'NOVEL_EXPORT|' + novelId},
    {text:'💾 SNAPSHOT',callback_data:'SNAPSHOT_CREATE|' + novelId}
  ]);

  rows.push([
    {text:'⬅️ KEMBALI KE NOVEL',callback_data:'NOVEL_LIST'}
  ]);

  return {text:text,keyboard:keyboard_(rows)};
}

function sendNovelInformation_(chatId, novelId){
  const info = buildNovelInformation_(novelId);

  // POST 1 — metadata. Original title/genre/language are preserved.
  sendMessage_(chatId,
    '📚 <b>NOVEL INFORMATION</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(info.title) + '</b>\n\n' +
    '🎭 Genre    : ' + escapeHtml_(info.genre || '-') + '\n' +
    '📚 Chapter  : <b>' + info.latestCanon +
      (info.targetChapters ? (' / ' + info.targetChapters) : '') + '</b>\n' +
    '🌐 Language : ' + escapeHtml_(info.language || '-') + '\n' +
    (info.type ? '📘 Type     : ' + escapeHtml_(info.type) + '\n' : '') +
    (info.pov ? '👁 POV      : ' + escapeHtml_(info.pov) + '\n' : '') +
    (info.status ? '⚙️ Status   : ' + escapeHtml_(info.status) + '\n' : '') +
    '\n🆔 <code>' + escapeHtml_(info.novelId) + '</code>'
  );

  // POST 2 — synopsis only. It can be translated for Telegram display,
  // but nothing is ever written back to Blueprint/Bible/Roadmap.
  let synopsisText = info.synopsis || 'Sinopsis belum tersedia di Blueprint, Bible, atau Roadmap.';
  let translated = false;
  let translationFailed = false;

  if (info.synopsis && shouldTranslateSynopsisToIndonesian_(info.language, info.synopsis)) {
    try {
      synopsisText = translateSynopsisForTelegram_(info.synopsis);
      translated = true;
    } catch (err) {
      translationFailed = true;
      log_('WARN','telegram-synopsis-translation',
        String(err && err.message || err),
        {novelId:novelId});
      synopsisText = info.synopsis;
    }
  }

  let footer = '';
  if (translated) {
    footer =
      '\n\n<i>🌐 Sinopsis diterjemahkan ke Bahasa Indonesia hanya untuk tampilan Telegram. ' +
      'Data asli di Bible/Roadmap tidak diubah.</i>';
  } else if (translationFailed) {
    footer =
      '\n\n<i>⚠️ Terjemahan sedang tidak tersedia, jadi bot menampilkan sinopsis asli. ' +
      'Data novel tetap tidak berubah.</i>';
  }

  sendMessage_(chatId,
    '📝 <b>SINOPSIS</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n\n' +
    escapeHtml_(truncate_(synopsisText, 3400)) +
    footer,
    keyboard_([
      [{text:'📖 KEMBALI KE NOVEL', callback_data:'NOVEL_VIEW|' + novelId}]
    ])
  );
}

function buildNovelInformation_(novelId){
  const n = getNovelIndex_(novelId);
  if (!n) throw new Error('Novel tidak ditemukan: ' + novelId);

  const sh = getNovelSheet_(novelId);
  const bp = getNovelRecordData_(sh,'BLUEPRINT','MASTER') || {};
  const bible = getNovelRecordData_(sh,'BIBLE','MASTER') || {};
  const roadmap = getNovelRecordData_(sh,'ROADMAP_MASTER','MASTER') ||
    getNovelRecordData_(sh,'ROADMAP','MASTER') || {};

  const synopsis = firstUsefulText_([
    bp.synopsis,
    bible.synopsis,
    roadmap.synopsis,

    bp.description,
    bible.description,
    roadmap.description,

    bp.premise,
    bible.premise,
    roadmap.premise,

    bp.logline,
    bible.logline,
    roadmap.logline,

    bible.summary,
    roadmap.summary,
    roadmap.overview,
    bible.corePremise
  ]);

  let genre = '';
  if (Array.isArray(bp.genres) && bp.genres.length) {
    genre = bp.genres.join(' • ');
  } else if (Array.isArray(bible.genres) && bible.genres.length) {
    genre = bible.genres.join(' • ');
  } else {
    genre = String(n.GENRE || bp.genre || bible.genre || roadmap.genre || '');
  }

  const typeRaw =
    bp.type ||
    bible.type ||
    roadmap.type ||
    (String(genre).toLowerCase().indexOf('fanfic') >= 0 ||
     String(genre).toLowerCase().indexOf('fan-fic') >= 0
      ? 'Fan-Fic'
      : 'Novel');

  return {
    novelId:String(n.NOVEL_ID || novelId),
    title:String(n.TITLE || bp.title || 'Untitled Novel'),
    genre:String(genre || '-'),
    language:String(n.LANGUAGE || bp.language || bible.language || roadmap.language || '-'),
    latestCanon:Number(n.LATEST_CANON || 0),
    targetChapters:Number(n.TARGET_CHAPTERS || bp.targetChapters || roadmap.targetChapters || 0),
    type:String(typeRaw || ''),
    pov:String(bp.pov || bible.pov || roadmap.pov || ''),
    status:String(n.STATUS || ''),
    synopsis:String(synopsis || '')
  };
}

function shouldTranslateSynopsisToIndonesian_(language, text){
  const lang = String(language || '').trim().toLowerCase();

  if (/indonesia|indonesian|bahasa indonesia|id-id|^id$/.test(lang)) {
    return false;
  }

  if (/english|inggris|en-us|en-gb|^en$/.test(lang)) {
    return true;
  }

  // Fallback heuristic when legacy/imported metadata has no reliable language.
  const sample = ' ' + String(text || '').toLowerCase()
    .replace(/[^a-zA-ZÀ-ÿ\s]/g,' ')
    .replace(/\s+/g,' ') + ' ';

  const enWords = [
    ' the ',' and ',' of ',' to ',' in ',' is ',' was ',' with ',' from ',
    ' that ',' his ',' her ',' into ',' as ',' for ',' but ',' when ',' who '
  ];

  const idWords = [
    ' yang ',' dan ',' dari ',' dengan ',' untuk ',' adalah ',' sebagai ',
    ' ini ',' itu ',' pada ',' dalam ',' tetapi ',' ketika ',' seorang ',
    ' menjadi ',' karena ',' tidak '
  ];

  let en = 0, id = 0;
  enWords.forEach(function(w){ if (sample.indexOf(w) >= 0) en++; });
  idWords.forEach(function(w){ if (sample.indexOf(w) >= 0) id++; });

  return en > id;
}

function translateSynopsisForTelegram_(sourceText){
  const source = String(sourceText || '').trim();
  if (!source) return '';

  const cache = CacheService.getScriptCache();
  const key = telegramSynopsisCacheKey_(source);
  const cached = cache.get(key);
  if (cached) return cached;

  const translated = String(geminiText_(
    'Translate the following NOVEL SYNOPSIS into natural, publication-quality Bahasa Indonesia. ' +
    'This translation is ONLY for an admin Telegram display. ' +
    'Preserve character names, place names, lore terms, titles, plot facts, tone, ambiguity, and spoilers exactly. ' +
    'Do not summarize. Do not expand. Do not explain. Do not add markdown headings. ' +
    'If the text is already Indonesian, return it unchanged. ' +
    'Return ONLY the translated synopsis text.\n\n' +
    'SOURCE SYNOPSIS:\n' + truncate_(source, 3600)
  ) || '').trim();

  if (!translated) throw new Error('Gemini mengembalikan terjemahan kosong.');

  // ScriptCache accepts short-lived display data only; source DB is untouched.
  try {
    cache.put(key, truncate_(translated, 9000), 21600); // 6 hours
  } catch (_) {}

  return translated;
}

function telegramSynopsisCacheKey_(text){
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );

  const hex = bytes.map(function(b){
    const v = (Number(b) + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');

  return 'snf_syn_id_' + hex.slice(0,48);
}

function firstUsefulText_(values){
  for (let i=0;i<(values||[]).length;i++) {
    const v = values[i];
    if (v == null) continue;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length) return v.map(String).join(' ');
    if (typeof v === 'object') {
      const s = v.text || v.summary || v.description || v.premise || v.logline;
      if (s) return String(s).trim();
    }
  }
  return '';
}

function sendNovelStatus_(chatId,novelId){
  if(!novelId){sendMessage_(chatId,'Belum ada novel aktif. Gunakan /novels lalu /use NVL_0001.');return;}
  const n=getNovelIndex_(novelId);
  if(!n || !isTelegramAdminNovel_(n)){sendMessage_(chatId,'Novel aktif tidak ditemukan pada workspace Telegram Admin.');return;}
  sendMessage_(chatId,
    '📊 <b>NOVEL STATUS</b>\n\n' +
    '📖 <b>'+escapeHtml_(n.TITLE)+'</b>\n' +
    '🆔 <code>'+n.NOVEL_ID+'</code>\n' +
    '📚 Canon: '+Number(n.LATEST_CANON||0)+' / '+Number(n.TARGET_CHAPTERS||0)+'\n' +
    '⚙️ Status: '+escapeHtml_(n.STATUS)+'\n' +
    '🌐 '+escapeHtml_(n.LANGUAGE||'')+'\n' +
    '🎭 '+escapeHtml_(n.GENRE||''));
}

function sendJobs_(chatId,userId){
  const view = buildJobsListView_(userId);
  sendMessage_(chatId, view.text, view.keyboard);
}

function getJobsForUser_(userId, limit){
  const sh = getSystemSheet_(SNF.SHEETS.JOBS);
  if (sh.getLastRow() < 2) return [];
  const vals = sh.getRange(2,1,sh.getLastRow()-1,SNF.JOB_HEADERS.length).getValues();
  const jobs = vals.map(function(r){
    const o = rowObject_(SNF.JOB_HEADERS,r);
    o.DATA = safeJson_(o.DATA_JSON,{});
    return o;
  }).filter(function(j){
    return jobChannel_(j)==='TELEGRAM' &&
      jobOwnerType_(j)==='TELEGRAM_ADMIN' &&
      String(j.USER_ID)===String(userId);
  });
  jobs.sort(function(a,b){
    return String(b.UPDATED_AT || b.CREATED_AT || '').localeCompare(String(a.UPDATED_AT || a.CREATED_AT || ''));
  });
  return jobs.slice(0, Math.max(1, Number(limit || 12)));
}

function jobStatusIcon_(status){
  const s = String(status || '').toUpperCase();
  if (s === 'ERROR' || s === 'FAILED') return '❌';
  if (s === 'RUNNING') return '⚙️';
  if (s === 'QUEUED') return '⏳';
  if (s === 'WAITING_APPROVAL') return '🟡';
  if (s === 'DONE' || s === 'COMPLETED' || s === 'SUCCESS') return '✅';
  if (s === 'CANCELLED') return '🚫';
  return '▫️';
}


function isJobComplete100_(j){
  return ['DONE','COMPLETED','SUCCESS','APPROVED'].indexOf(String(j&&j.STATUS||'').toUpperCase())>=0&&Number(j&&j.PROGRESS||0)>=100;
}

function getTelegramOwnedJob_(jobId,userId){
  const j=getJob_(String(jobId||'').toUpperCase());
  if(!j||jobChannel_(j)!=='TELEGRAM'||jobOwnerType_(j)!=='TELEGRAM_ADMIN'||String(j.USER_ID||'')!==String(userId||'')){
    throw new Error('Job ini bukan milik Telegram Admin saat ini.');
  }
  return j;
}

function clearCompletedTelegramJobs_(userId){
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new Error('Worker sedang aktif. Coba lagi.');
  try{
    const sh=getSystemSheet_(SNF.SHEETS.JOBS);if(sh.getLastRow()<2)return {ok:true,deleted:0};
    const vals=sh.getRange(2,1,sh.getLastRow()-1,SNF.JOB_HEADERS.length).getValues(),rows=[];
    vals.forEach(function(r,i){
      const j=rowObject_(SNF.JOB_HEADERS,r);
      if(jobChannel_(j)==='TELEGRAM'&&jobOwnerType_(j)==='TELEGRAM_ADMIN'&&String(j.USER_ID||'')===String(userId||'')&&isJobComplete100_(j))rows.push(i+2);
    });
    rows.sort(function(a,b){return b-a;}).forEach(function(r){sh.deleteRow(r);});
    return {ok:true,deleted:rows.length};
  }finally{lock.releaseLock();}
}


function retryAllFailedTelegramJobs_(userId,runWorker){
  const jobs=getJobsForUser_(userId,500).filter(function(j){
    const s=String(j.STATUS||'').toUpperCase();return s==='ERROR'||s==='FAILED';
  });
  const results=[];
  jobs.forEach(function(j){
    try{results.push(retryJobById_(j.JOB_ID,false));}
    catch(err){results.push({ok:false,jobId:j.JOB_ID,error:String(err&&err.message||err)});}
  });
  const out={ok:true,retried:results.filter(function(x){return x.ok;}).length,failed:results.filter(function(x){return !x.ok;}).length,jobs:results};
  if(runWorker!==false&&out.retried){try{processSmartNovelForgeJobs();}catch(_){}}
  return out;
}

function buildJobsListView_(userId){
  const all=getJobsForUser_(userId,500),jobs=all.slice(0,12);
  if(!all.length)return {text:'⚙️ <b>JOB MANAGER</b>\n━━━━━━━━━━━━━━━━━━\nBelum ada job Telegram Admin.',keyboard:keyboard_([[{text:'🔃 Refresh',callback_data:'JOB_REFRESH_LIST'}]])};

  let active=0,errors=0,completed=0;
  all.forEach(function(j){
    const s=String(j.STATUS||'').toUpperCase();
    if(['QUEUED','RUNNING','WAITING_APPROVAL'].indexOf(s)>=0)active++;
    if(s==='ERROR'||s==='FAILED')errors++;
    if(isJobComplete100_(j))completed++;
  });
  const rows=jobs.map(function(j){
    const d=j.DATA||{},range=Number(d.startChapter||0)?(' Ch'+Number(d.startChapter)+(Number(d.endChapter||0)!==Number(d.startChapter||0)?'–'+Number(d.endChapter||0):'')):'';
    return [{text:jobStatusIcon_(j.STATUS)+' '+truncate_(String(j.TYPE||'JOB').replace(/_/g,' '),18)+range+' • '+Number(j.PROGRESS||0)+'%',callback_data:'JOB_VIEW|'+j.JOB_ID}];
  });
  if(completed)rows.push([{text:'🧹 Clear Completed ('+completed+')',callback_data:'JOB_CLEAR_COMPLETED'}]);
  rows.push([{text:'🔃 Refresh',callback_data:'JOB_REFRESH_LIST'}]);
  return {text:'⚙️ <b>JOB MANAGER — ADMIN</b>\n━━━━━━━━━━━━━━━━━━\n🟢 Aktif / waiting : <b>'+active+'</b>\n❌ Error           : <b>'+errors+'</b>\n✅ Completed       : <b>'+completed+'</b>\n📋 Total history   : <b>'+all.length+'</b>\n\nJob Web User tetap terpisah.',keyboard:keyboard_(rows)};
}

function buildJobDetailView_(jobId,userId){
  const job = getJob_(String(jobId || '').toUpperCase());
  if (!job) {
    return {
      text:'❌ <b>JOB TIDAK DITEMUKAN</b>\n\nJob mungkin sudah dihapus.',
      keyboard:keyboard_([[{text:'↩️ JOBS',callback_data:'JOB_LIST'}]])
    };
  }

  if (jobChannel_(job)!=='TELEGRAM' || jobOwnerType_(job)!=='TELEGRAM_ADMIN' ||
      (userId && String(job.USER_ID)!==String(userId))) {
    throw new Error('Job ini bukan milik session Telegram admin saat ini.');
  }

  const index = job.NOVEL_ID ? getNovelIndex_(job.NOVEL_ID) : null;
  const d = job.DATA || {};
  const status = String(job.STATUS || '').toUpperCase();
  const canRetry = status === 'ERROR' || status === 'FAILED';
  const range = Number(d.startChapter || 0)
    ? ('Chapter ' + Number(d.startChapter) + (Number(d.endChapter || 0) !== Number(d.startChapter || 0) ? '–' + Number(d.endChapter || 0) : ''))
    : '';
  const error = String(job.LAST_ERROR || d._lastAutoRetryError || d._previousError || '').trim();
  const autoRetryCount = Number(d._autoRetryCount || 0);
  const autoRetryMax = Number(d._autoRetryMax || autoRetryMax_());
  const nextAutoRetry = String(d._nextRetryAt || '');

  let text =
    jobStatusIcon_(status) + ' <b>JOB DETAIL</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '🆔 <code>' + escapeHtml_(job.JOB_ID) + '</code>\n' +
    (index ? '📖 <b>' + escapeHtml_(index.TITLE || job.NOVEL_ID) + '</b>\n' : '') +
    (job.NOVEL_ID ? '📚 <code>' + escapeHtml_(job.NOVEL_ID) + '</code>\n' : '') +
    '\n⚙️ Type     : <b>' + escapeHtml_(String(job.TYPE || '-').replace(/_/g,' ')) + '</b>\n' +
    '📍 Stage    : <b>' + escapeHtml_(String(job.STAGE || '-').replace(/_/g,' ')) + '</b>\n' +
    '📊 Progress : <b>' + Number(job.PROGRESS || 0) + '%</b>\n' +
    '🏷 Status   : <b>' + escapeHtml_(status || '-') + '</b>\n' +
    (range ? '✍️ Target   : <b>' + escapeHtml_(range) + '</b>\n' : '') +
    '🕒 Created  : <code>' + escapeHtml_(String(job.CREATED_AT || '-')) + '</code>\n' +
    '🔄 Updated  : <code>' + escapeHtml_(String(job.UPDATED_AT || '-')) + '</code>';

  if (autoRetryCount > 0) {
    text += '\n🔁 Auto Retry: <b>' + autoRetryCount + ' / ' + autoRetryMax + '</b>';
    if (nextAutoRetry && String(status) === 'QUEUED') {
      text += '\n⏳ Next Try  : <code>' + escapeHtml_(nextAutoRetry) + '</code>';
    }
    if (d._autoRetryExhausted) {
      text += '\n🛑 Auto retry sudah habis pada checkpoint ini.';
    }
  }

  if (String(job.TYPE || '') === 'TRANSLATE_BATCH') {
    text += '\n🌍 Translate : <b>' + escapeHtml_(languageName_(d.targetCode || 'id')) + '</b>';
  }

  if (error) {
    text += '\n\n❌ <b>Last Error</b>\n<code>' + escapeHtml_(truncate_(error,700)) + '</code>';
  }

  const rows = [];
  if (canRetry) {
    rows.push([{text:'🔄 RETRY JOB',callback_data:'JOB_RETRY|' + job.JOB_ID}]);
  }
  rows.push([{text:(status === 'RUNNING' || status === 'QUEUED') ? '🛑 CANCEL & DELETE' : '🗑 HAPUS JOB',callback_data:'JOB_DELETE|' + job.JOB_ID}]);
  rows.push([
    {text:'🔃 Refresh',callback_data:'JOB_REFRESH|' + job.JOB_ID},
    {text:'↩️ Jobs',callback_data:'JOB_LIST'}
  ]);

  if (job.NOVEL_ID && getNovelIndex_(job.NOVEL_ID)) {
    rows.push([{text:'📖 Buka Novel',callback_data:'NOVEL_VIEW|' + job.NOVEL_ID}]);
  }

  return {text:text,keyboard:keyboard_(rows)};
}

function deleteJobById_(jobId,userId){
  jobId = String(jobId || '').trim().toUpperCase();
  if (!jobId) throw new Error('JOB_ID kosong.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(7000)) {
    throw new Error('Worker sedang memproses job. Coba hapus lagi beberapa detik.');
  }

  try {
    const sh = getSystemSheet_(SNF.SHEETS.JOBS);
    const row = findRowByFirstCol_(sh,jobId);
    if (!row) throw new Error('Job tidak ditemukan: ' + jobId);

    const job = getJob_(jobId);
    if (!job) throw new Error('Job tidak ditemukan: ' + jobId);

    if (jobChannel_(job)!=='TELEGRAM' || jobOwnerType_(job)!=='TELEGRAM_ADMIN' ||
        (userId && String(job.USER_ID)!==String(userId))) {
      throw new Error('Job ini bukan milik session Telegram admin saat ini.');
    }

    // Clear active-job pointer so the novel is not stuck after deleting a job.
    if (job.NOVEL_ID) {
      const idx = getNovelIndex_(job.NOVEL_ID);
      if (idx && String(idx.ACTIVE_JOB_ID || '') === jobId) {
        const fields = {ACTIVE_JOB_ID:''};
        if (Number(idx.LATEST_CANON || 0) > 0) fields.STATUS = 'ACTIVE';
        else if (String(idx.SOURCE || '') === 'DRIVE_IMPORT') fields.STATUS = 'FOUNDATION_IMPORTED';
        updateNovelIndexFields_(job.NOVEL_ID,fields);
      }
    }

    // Reset the admin conversation only when this exact job was attached to it.
    if (userId && job.CHAT_ID) {
      const s = getSession_(String(userId),String(job.CHAT_ID));
      if (s && s.data && String(s.data.jobId || '') === jobId) {
        setSession_(String(userId),String(job.CHAT_ID),'IDLE',job.NOVEL_ID || s.activeNovelId || '',{});
      }
    }

    // Deleting a job is intentionally record-only. Novel files / canon stay intact.
    sh.deleteRow(row);

    log_('INFO','delete-job:' + jobId,'Job record deleted by admin.',{
      novelId:job.NOVEL_ID || '',
      type:job.TYPE || '',
      stage:job.STAGE || '',
      previousStatus:job.STATUS || ''
    });

    return {
      ok:true,
      jobId:jobId,
      novelId:job.NOVEL_ID || '',
      previousStatus:String(job.STATUS || '')
    };
  } finally {
    lock.releaseLock();
  }
}


function buildWebNovelsAdminView_(page){
  page=Math.max(1,Number(page||1));const all=listWebNovelDirectory_().sort(function(a,b){return String(b.UPDATED_AT||'').localeCompare(String(a.UPDATED_AT||''));});
  const per=8,pages=Math.max(1,Math.ceil(all.length/per));if(page>pages)page=pages;
  const items=all.slice((page-1)*per,page*per),rows=[];
  items.forEach(function(n){
    const u=webUserById_(n.OWNER_ID),owner=u&&u.USERNAME?'@'+u.USERNAME:String(n.OWNER_ID||'WEB');
    rows.push([{text:'📖 '+truncate_(String(n.TITLE||n.NOVEL_ID),24)+' • '+truncate_(owner,14),callback_data:'WEBNOVEL_VIEW|'+n.NOVEL_ID}]);
  });
  const nav=[];if(page>1)nav.push({text:'⬅️',callback_data:'WEBNOVELS_LIST|'+(page-1)});if(page<pages)nav.push({text:'➡️',callback_data:'WEBNOVELS_LIST|'+(page+1)});if(nav.length)rows.push(nav);
  rows.push([{text:'🔃 Refresh',callback_data:'WEBNOVELS_LIST|'+page}]);
  return {text:'🌐 <b>WEB USER NOVELS</b>\\n━━━━━━━━━━━━━━━━━━\\n📚 Total: <b>'+all.length+'</b>\\n📄 Page: <b>'+page+'/'+pages+'</b>\\n\\nAdmin melihat metadata saja; job Web tidak dicampur ke /jobs.',keyboard:keyboard_(rows)};
}

function buildWebNovelAdminDetail_(novelId){
  const n=getWebNovelDirectory_(novelId);if(!n)throw new Error('Novel Web tidak ditemukan.');
  const u=webUserById_(n.OWNER_ID)||{};
  return {text:'🌐 <b>WEB NOVEL DETAIL</b>\\n━━━━━━━━━━━━━━━━━━\\n📖 <b>'+escapeHtml_(n.TITLE||n.NOVEL_ID)+'</b>\\n🆔 <code>'+escapeHtml_(n.NOVEL_ID)+'</code>\\n👤 Owner: <b>@'+escapeHtml_(u.USERNAME||n.OWNER_ID||'-')+'</b>\\n📧 '+escapeHtml_(u.EMAIL||'-')+'\\n🏷 Status: <b>'+escapeHtml_(n.STATUS||'-')+'</b>\\n📚 Canon: <b>'+Number(n.LATEST_CANON||0)+'/'+Number(n.TARGET_CHAPTERS||0)+'</b>\\n🌍 '+escapeHtml_(n.LANGUAGE||'-')+'\\n🎭 '+escapeHtml_(truncate_(n.GENRE||'-',180))+'\\n🕒 '+escapeHtml_(String(n.UPDATED_AT||'-'))+'\\n\\n🔒 Isi chapter/file privat tidak ditampilkan.',keyboard:keyboard_([[{text:'↩️ Web Novels',callback_data:'WEBNOVELS_LIST|1'}]])};
}

function sendWebNovelsAdmin_(chatId,page){const v=buildWebNovelsAdminView_(page);sendMessage_(chatId,v.text,v.keyboard);}

function sendPublicStats_(chatId){
  const usersSh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);
  const users=Math.max(0,usersSh.getLastRow()-1);
  const novels=listWebNovelDirectory_();
  const dir=webJobDirectorySheet_();let active=0,errors=0;
  if(dir.getLastRow()>=2){
    dir.getRange(2,1,dir.getLastRow()-1,SNF.WEB_JOB_DIR_HEADERS.length).getValues().forEach(function(r){
      const j=rowObject_(SNF.WEB_JOB_DIR_HEADERS,r),s=String(j.STATUS||'').toUpperCase();
      if(['QUEUED','RUNNING','WAITING_APPROVAL'].indexOf(s)>=0)active++;
      if(s==='ERROR'||s==='FAILED')errors++;
    });
  }
  sendMessage_(chatId,'📊 <b>WEB APP SUMMARY</b>\n\n👤 Registered users: '+users+'\n📚 Web novels: '+novels.length+'\n⚙️ Active / waiting jobs: '+active+'\n❌ Job errors: '+errors+'\n\n🌐 Gunakan /webnovels untuk melihat metadata novel pengguna Web.');
}

function sendPublicJobs_(chatId){
  sendMessage_(chatId,'🔒 <b>WEB JOBS ARE PRIVATE</b>\n\nDetail job milik pengguna Web tidak ditampilkan di Telegram Admin. Gunakan menu Jobs pada akun Web masing-masing.');
}

function setPublicUserStatus_(userId,status){
  const id=String(userId||'').trim().toUpperCase();
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS),row=findRowByFirstCol_(sh,id);
  if(!row)throw new Error('Web user tidak ditemukan: '+id);
  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('STATUS')+1).setValue(status);
  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('UPDATED_AT')+1).setValue(isoNow_());
  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('LAST_SEEN')+1).setValue(isoNow_());

  // Revoking an account also invalidates its active Web sessions.
  if(String(status)!=='ACTIVE'){
    const ss=getWebRegistrySheet_(SNF.SHEETS.WEB_SESSIONS);
    if(ss.getLastRow()>=2){
      const vals=ss.getRange(2,1,ss.getLastRow()-1,SNF.WEB_SESSION_HEADERS.length).getValues();
      const rows=[];
      vals.forEach(function(r,i){
        const s=rowObject_(SNF.WEB_SESSION_HEADERS,r);
        if(String(s.USER_ID||'')===id)rows.push(i+2);
      });
      rows.reverse().forEach(function(r){ss.deleteRow(r);});
    }
  }
  try{CacheService.getScriptCache().remove('SNF_WEBUSER_'+id);}catch(_){}
}

/* ========================================================================== */
/* TELEGRAM API                                                                */
/* ========================================================================== */

function tgApi_(method,payload){
  const token=prop_('TELEGRAM_BOT_TOKEN');
  if(!token)throw new Error('TELEGRAM_BOT_TOKEN belum diset.');
  const res=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+method,{
    method:'post',contentType:'application/json',payload:JSON.stringify(payload||{}),muteHttpExceptions:true
  });
  const code=res.getResponseCode();
  const body=res.getContentText();
  let obj; try{obj=JSON.parse(body);}catch(_){obj={ok:false,description:body};}
  if(code<200||code>=300||!obj.ok)throw new Error('Telegram '+method+' failed: '+truncate_(body,1800));
  return obj.result;
}

function sendMessage_(chatId,text,replyMarkup){
  const p={chat_id:String(chatId),text:String(text),parse_mode:'HTML',disable_web_page_preview:true};
  if(replyMarkup)p.reply_markup=replyMarkup;
  const r=tgApi_('sendMessage',p);
  return r.message_id;
}

function editMessage_(chatId,messageId,text,replyMarkup){
  if(!chatId || !messageId || !Number(messageId)) return null;
  const p={chat_id:String(chatId),message_id:Number(messageId),text:String(text),parse_mode:'HTML',disable_web_page_preview:true};
  if(replyMarkup)p.reply_markup=replyMarkup;
  try{return tgApi_('editMessageText',p);}catch(err){
    if(String(err).indexOf('message is not modified')>=0)return null;
    throw err;
  }
}

// v5.1: notifications must never fail a job. The checkpoint is the source of
// truth; a transient Telegram failure (or a blocked bot) used to throw out of
// processOneJobStep_ AFTER the checkpoint was persisted, marking healthy jobs
// ERROR for no real reason. All job-step handlers now use these wrappers.
function safeEditMessage_(chatId,messageId,text,replyMarkup){
  try{return editMessage_(chatId,messageId,text,replyMarkup);}
  catch(err){log_('WARN','telegram-notify','Progress notification gagal; job tetap jalan.',{error:String(err&&err.message||err)});return null;}
}

function safeSendMessage_(chatId,text,replyMarkup){
  try{return sendMessage_(chatId,text,replyMarkup);}
  catch(err){log_('WARN','telegram-notify','Progress notification gagal; job tetap jalan.',{error:String(err&&err.message||err)});return null;}
}

function answerCallback_(id,text,alert){
  try{return tgApi_('answerCallbackQuery',{callback_query_id:id,text:text||'',show_alert:!!alert});}catch(_){return null;}
}

function keyboard_(rows){return {inline_keyboard:rows};}

/* ========================================================================== */
/* NORMALIZATION / VALIDATION                                                  */
/* ========================================================================== */

function normalizeBlueprint_(bp){
  if(!bp||typeof bp!=='object')throw new Error('Blueprint invalid.');
  bp.title=String(bp.title||'Untitled Novel').trim().slice(0,160);
  bp.description=String(bp.description||'').trim();
  bp.genres=Array.isArray(bp.genres)?bp.genres.slice(0,8).map(String):[];
  bp.subgenres=Array.isArray(bp.subgenres)?bp.subgenres.slice(0,8).map(String):[];
  bp.language=String(bp.language||'English').trim().slice(0,40);
  bp.targetChapters=Math.max(5,Math.min(2000,parseInt(bp.targetChapters,10)||120));
  bp.targetWordsPerChapter=Math.max(700,Math.min(6000,parseInt(bp.targetWordsPerChapter,10)||defaultWords_()));
  bp.pov=String(bp.pov||'Third Person Limited');
  bp.tone=Array.isArray(bp.tone)?bp.tone.slice(0,10).map(String):[];
  bp.pacing=String(bp.pacing||'Balanced');
  bp.protagonist=bp.protagonist&&typeof bp.protagonist==='object'?bp.protagonist:{name:'',role:'',traits:[]};
  bp.specialRules=Array.isArray(bp.specialRules)?bp.specialRules.slice(0,40).map(String):[];
  bp.prohibitedEvents=Array.isArray(bp.prohibitedEvents)?bp.prohibitedEvents.slice(0,40).map(String):[];
  return bp;
}

function validateChapterResult_(r,n,targetWords){
  if(!r||typeof r!=='object')throw new Error('Chapter '+n+' response invalid.');
  if(!String(r.chapter_text||'').trim())throw new Error('Chapter '+n+' kosong.');
  // v5.1: validate real word count (was: 1500 chars ≈ 250 words, so a 400-word
  // chapter used to pass as "done").
  const words=String(r.chapter_text).split(/\s+/).filter(Boolean).length;
  const target=Math.max(300,Number(targetWords||1800));
  const minWords=Math.round(target*0.5);
  if(words<minWords)throw new Error('Chapter '+n+' terlalu pendek ('+words+' kata, target ~'+target+', minimal '+minWords+').');
  if(!r.summary)r.summary='';
}

/* ========================================================================== */

/* ========================================================================== */
/* WEB ACCOUNT AUTH + OWNERSHIP ISOLATION                                     */
/* ========================================================================== */

function webSessionDays_(){
  return Math.max(1,Math.min(90,Number(prop_('WEB_SESSION_DAYS')||30)));
}

function webPasswordMinLength_(){
  return Math.max(8,Math.min(32,Number(prop_('WEB_PASSWORD_MIN_LENGTH')||8)));
}

function webPasswordRounds_(){
  return Math.max(200,Math.min(5000,Number(prop_('WEB_PASSWORD_ROUNDS')||800)));
}

function webAuthPepper_(){
  const props=PropertiesService.getScriptProperties();
  let p=String(props.getProperty('WEB_AUTH_PEPPER')||'');
  if(!p){
    p=randomToken_()+randomToken_();
    props.setProperty('WEB_AUTH_PEPPER',p);
  }
  return p;
}

function normalizeWebUsername_(v){
  return String(v||'').trim().toLowerCase();
}

function normalizeWebEmail_(v){
  return String(v||'').trim().toLowerCase();
}

function validateWebUsername_(username){
  const u=normalizeWebUsername_(username);
  if(!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(u)){
    throw new Error('Username harus 3–24 karakter: huruf, angka, titik, underscore, atau dash.');
  }
  return u;
}

function validateWebEmail_(email){
  const e=normalizeWebEmail_(email);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length>180){
    throw new Error('Alamat email tidak valid.');
  }
  return e;
}

function validateWebPassword_(password){
  const p=String(password||'');
  if(p.length<webPasswordMinLength_())throw new Error('Password minimal '+webPasswordMinLength_()+' karakter.');
  if(p.length>160)throw new Error('Password terlalu panjang.');
  return p;
}


function webPasswordHash_(password,salt){
  let value=String(salt)+'|'+String(password)+'|'+webAuthPepper_();
  const rounds=webPasswordRounds_();
  for(let i=0;i<rounds;i++){
    value=hashSecret_(value+'|'+i+'|'+salt);
  }
  return value;
}

function webPasswordHashWithPepper_(password,salt,pepper,rounds){
  let value=String(salt)+'|'+String(password)+'|'+String(pepper||'');
  rounds=Math.max(200,Math.min(5000,Number(rounds||800)));
  for(let i=0;i<rounds;i++){
    value=hashSecret_(value+'|'+i+'|'+salt);
  }
  return value;
}

function legacyWebAuthPepper_(){
  return String(prop_('WEB_AUTH_PEPPER_LEGACY')||'');
}

function legacyWebPasswordRounds_(){
  return Math.max(200,Math.min(5000,Number(prop_('WEB_PASSWORD_ROUNDS_LEGACY')||800)));
}



function webUserById_(userId){
  const id=String(userId||'').trim().toUpperCase();
  if(!id)return null;
  const cache=CacheService.getScriptCache(),key='SNF_WEBUSER_'+id;
  const hit=cache.get(key);
  if(hit)return safeJson_(hit,null);
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);
  const row=findRowByFirstCol_(sh,id);
  if(!row)return null;
  const u=rowObject_(SNF.WEB_USER_HEADERS,sh.getRange(row,1,1,SNF.WEB_USER_HEADERS.length).getValues()[0]);
  try{cache.put(key,JSON.stringify(u),300);}catch(_){}
  return u;
}


function webUsersByIdentifier_(identifier){
  const key=String(identifier||'').trim().toLowerCase();
  if(!key)return [];
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);
  if(sh.getLastRow()<2)return [];
  const vals=sh.getRange(2,1,sh.getLastRow()-1,SNF.WEB_USER_HEADERS.length).getValues();
  const out=[];
  for(let i=0;i<vals.length;i++){
    const u=rowObject_(SNF.WEB_USER_HEADERS,vals[i]);
    if(String(u.USERNAME||'').toLowerCase()===key || String(u.EMAIL||'').toLowerCase()===key){
      u.__ROW=i+2;
      out.push(u);
    }
  }
  out.sort(function(a,b){
    return String(b.UPDATED_AT||b.LAST_LOGIN||b.CREATED_AT||'')
      .localeCompare(String(a.UPDATED_AT||a.LAST_LOGIN||a.CREATED_AT||''));
  });
  return out;
}

function webUserByIdentifier_(identifier){
  const users=webUsersByIdentifier_(identifier);
  return users.length?users[0]:null;
}



function publicWebUserView_(u){
  return {
    id:String(u.USER_ID||''),
    username:String(u.USERNAME||''),
    email:String(u.EMAIL||''),
    status:String(u.STATUS||'ACTIVE'),
    createdAt:String(u.CREATED_AT||''),
    lastLogin:String(u.LAST_LOGIN||'')
  };
}

function ensureWebUserFolder_(userId){
  userId=String(userId||'').trim().toUpperCase();
  if(!/^WUSR_[A-Z0-9]+$/.test(userId))throw new Error('WEB USER_ID tidak valid.');
  const user=webUserById_(userId);
  if(!user)throw new Error('Web user tidak ditemukan.');

  if(user.ROOT_FOLDER_ID){
    try{return DriveApp.getFolderById(String(user.ROOT_FOLDER_ID));}catch(_){}
  }

  const root=ensureRootFolder_();
  const usersRoot=getOrCreateChildFolder_(root,'WEB_USERS');
  const folder=getOrCreateChildFolder_(usersRoot,userId);
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);
  const row=findRowByFirstCol_(sh,userId);
  if(row){
    sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('ROOT_FOLDER_ID')+1).setValue(folder.getId());
    sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('UPDATED_AT')+1).setValue(isoNow_());
  }
  return folder;
}

// v5.1: uncached single-row read (webUserById_ is cached 300s).
function webUserRowFresh_(userId){
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);
  const row=findRowByFirstCol_(sh,String(userId||'').trim().toUpperCase());
  if(!row)return null;
  return rowObject_(SNF.WEB_USER_HEADERS,sh.getRange(row,1,1,SNF.WEB_USER_HEADERS.length).getValues()[0]);
}

function ensureWebUserDb_(userId){
  userId=String(userId||'').trim().toUpperCase();
  if(!/^WUSR_[A-Z0-9]+$/.test(userId))throw new Error('WEB USER_ID tidak valid.');
  const user=webUserById_(userId);
  if(!user)throw new Error('Web user tidak ditemukan.');

  const wantedName=safeFileName_(String(user.USERNAME||userId))+'_NovelForge_DB';
  if(user.DB_ID){
    try{
      const existing=openSpreadsheetCached_(String(user.DB_ID));
      // Renaming is metadata-only and done only when needed.
      if(existing.getName()!==wantedName){try{existing.rename(wantedName);}catch(_){}}
      return existing;
    }catch(_){}
  }

  return ensureWebUserDbLocked_(userId, wantedName);
}

// v5.1 fix: provisioning was lock-free — two concurrent first logins created
// two spreadsheets and split the user's data. Serialized with tryLock (never
// waitLock: this also runs inside the worker, which already holds the lock).
function ensureWebUserDbLocked_(userId, wantedName){
  const lock=LockService.getScriptLock();
  const got=lock.tryLock(8000);
  try{
    if(got){
      // Fresh read inside the lock — the loser of the race sees the winner's DB_ID.
      const fresh=webUserRowFresh_(userId);
      if(fresh && fresh.DB_ID){
        try{return openSpreadsheetCached_(String(fresh.DB_ID));}catch(_){}
      }
    }
    const folder=ensureWebUserFolder_(userId);
    let ss=null;
    const files=folder.getFilesByName(wantedName);
    while(files.hasNext()&&!ss){
      try{ss=openSpreadsheetCached_(files.next().getId());}catch(_){}
    }
    if(!ss){
      ss=SpreadsheetApp.create(wantedName);
      SNF_SS_RUNTIME_CACHE_[ss.getId()]=ss;
      try{DriveApp.getFileById(ss.getId()).moveTo(folder);}catch(_){}
    }

    ensureSheet_(ss,SNF.SHEETS.INDEX,SNF.INDEX_HEADERS);
    ensureSheet_(ss,SNF.SHEETS.JOBS,SNF.JOB_HEADERS);
    ensureSheet_(ss,SNF.SHEETS.LOGS,SNF.LOG_HEADERS);
    ensureSheet_(ss,SNF.SHEETS.SETTINGS,SNF.SETTING_HEADERS);
    const def=ss.getSheetByName('Sheet1');
    if(def && ss.getSheets().length>1){try{ss.deleteSheet(def);}catch(_){}}

    const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);
    const row=findRowByFirstCol_(sh,userId);
    if(row){
      sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('DB_ID')+1).setValue(ss.getId());
      sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('UPDATED_AT')+1).setValue(isoNow_());
    }
    try{CacheService.getScriptCache().remove('SNF_WEBUSER_'+userId);}catch(_){}
    return ss;
  }finally{
    if(got){try{lock.releaseLock();}catch(_){}}
  }
}

function cleanupExpiredWebSessions_(){
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_SESSIONS);
  if(sh.getLastRow()<2)return 0;
  const vals=sh.getRange(2,1,sh.getLastRow()-1,SNF.WEB_SESSION_HEADERS.length).getValues();
  const now=Date.now(), rows=[];
  vals.forEach(function(r,i){
    const o=rowObject_(SNF.WEB_SESSION_HEADERS,r);
    const exp=Date.parse(String(o.EXPIRES_AT||''))||0;
    if(String(o.STATUS||'ACTIVE')!=='ACTIVE' || (exp && exp<=now))rows.push(i+2);
  });
  rows.reverse().slice(0,200).forEach(function(row){sh.deleteRow(row);});
  return rows.length;
}

function createWebSession_(userId){
  cleanupExpiredWebSessions_();
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_SESSIONS);
  const sessionId='WSES_'+randomCode_(18);
  const token=randomToken_();
  const now=new Date();
  const exp=new Date(now.getTime()+webSessionDays_()*86400000);
  sh.appendRow([
    sessionId,String(userId).toUpperCase(),hashSecret_(token),
    now.toISOString(),exp.toISOString(),now.toISOString(),'ACTIVE'
  ]);
  return {sessionId:sessionId,token:token};
}

function authWebUser_(auth){
  if(!auth || !auth.sessionId || !auth.token)throw new Error('AUTH_REQUIRED');
  const sid=String(auth.sessionId||'').trim().toUpperCase();
  const tokenHash=hashSecret_(String(auth.token));
  const cache=CacheService.getScriptCache(),ck='SNF_WEBSESSION_'+sid;
  const cached=safeJson_(cache.get(ck),null);
  if(cached && String(cached.hash||'')===tokenHash){
    const u=webUserById_(cached.userId);
    if(u && String(u.STATUS||'ACTIVE')==='ACTIVE')return u;
  }

  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_SESSIONS);
  const row=findRowByFirstCol_(sh,sid);
  if(!row)throw new Error('SESSION_EXPIRED');
  const s=rowObject_(SNF.WEB_SESSION_HEADERS,sh.getRange(row,1,1,SNF.WEB_SESSION_HEADERS.length).getValues()[0]);
  if(String(s.STATUS||'ACTIVE')!=='ACTIVE')throw new Error('SESSION_EXPIRED');
  if(tokenHash!==String(s.SESSION_HASH||''))throw new Error('SESSION_INVALID');
  const exp=Date.parse(String(s.EXPIRES_AT||''))||0;
  if(exp && exp<=Date.now()){
    sh.deleteRow(row);
    throw new Error('SESSION_EXPIRED');
  }
  const u=webUserById_(String(s.USER_ID||''));
  if(!u)throw new Error('ACCOUNT_NOT_FOUND');
  if(String(u.STATUS||'ACTIVE')!=='ACTIVE')throw new Error('ACCOUNT_DISABLED');
  try{cache.put(ck,JSON.stringify({userId:u.USER_ID,hash:tokenHash}),300);}catch(_){}
  return u;
}

function webLoginAttemptKey_(identifier){
  return 'SNF_LOGIN_'+hashSecret_(String(identifier||'').toLowerCase()).slice(0,24);
}

function assertWebLoginAllowed_(identifier){
  const cache=CacheService.getScriptCache();
  const n=Number(cache.get(webLoginAttemptKey_(identifier))||0);
  if(n>=8)throw new Error('Terlalu banyak percobaan login. Coba lagi sekitar 15 menit.');
}

function noteWebLoginFailure_(identifier){
  const cache=CacheService.getScriptCache();
  const key=webLoginAttemptKey_(identifier);
  const n=Number(cache.get(key)||0)+1;
  cache.put(key,String(n),900);
}

function clearWebLoginFailures_(identifier){
  CacheService.getScriptCache().remove(webLoginAttemptKey_(identifier));
}

function webRegister(username,email,password){
  ensureUserRegistryDb_();
  const uName=validateWebUsername_(username);
  const mail=validateWebEmail_(email);
  const pass=validateWebPassword_(password);
  const salt=randomToken_().slice(0,32);
  const passHash=webPasswordHash_(pass,salt);
  let userId='';

  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try{
    if(webUserByIdentifier_(uName))throw new Error('Username sudah digunakan.');
    if(webUserByIdentifier_(mail))throw new Error('Email sudah digunakan.');
    const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);
    do{userId='WUSR_'+randomCode_(10);}while(findRowByFirstCol_(sh,userId));
    const now=isoNow_();
    sh.appendRow([userId,uName,mail,passHash,salt,'ACTIVE','','',now,now,now,now,dayKey_(),0,0]);
  }finally{lock.releaseLock();}

  // Database user is provisioned lazily after login, keeping registration light.
  const auth=createWebSession_(userId);
  const user=webUserById_(userId);
  return {ok:true,authenticated:true,auth:auth,user:publicWebUserView_(user),version:SNF.VERSION};
}


function webLogin(identifier,password){
  ensureUserRegistryDb_();
  const id=String(identifier||'').trim().toLowerCase();
  if(!id)throw new Error('Masukkan username atau email.');
  assertWebLoginAllowed_(id);

  const candidates=webUsersByIdentifier_(id);
  if(!candidates.length){
    noteWebLoginFailure_(id);
    throw new Error('Username/email atau password salah.');
  }

  const rawPassword=String(password||'');
  const legacyPepper=legacyWebAuthPepper_();
  let user=null;
  let matchedLegacy=false;

  for(let i=0;i<candidates.length;i++){
    const u=candidates[i];
    if(String(u.STATUS||'ACTIVE')!=='ACTIVE')continue;

    const salt=String(u.PASSWORD_SALT||'');
    const expected=String(u.PASSWORD_HASH||'');
    if(!salt||!expected)continue;

    if(webPasswordHash_(rawPassword,salt)===expected){
      user=u;
      break;
    }

    if(legacyPepper){
      const legacyHash=webPasswordHashWithPepper_(
        rawPassword,
        salt,
        legacyPepper,
        legacyWebPasswordRounds_()
      );
      if(legacyHash===expected){
        user=u;
        matchedLegacy=true;
        break;
      }
    }
  }

  if(!user){
    noteWebLoginFailure_(id);
    const active=candidates.some(function(u){return String(u.STATUS||'ACTIVE')==='ACTIVE';});
    if(!active)throw new Error('Akun tidak aktif.');
    throw new Error('Username/email atau password salah.');
  }

  clearWebLoginFailures_(id);

  const now=isoNow_();
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);
  const row=findRowByFirstCol_(sh,String(user.USER_ID||''));
  if(!row)throw new Error('Akun registry tidak ditemukan.');

  if(matchedLegacy){
    const newSalt=randomToken_().slice(0,32);
    const newHash=webPasswordHash_(rawPassword,newSalt);
    sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('PASSWORD_HASH')+1).setValue(newHash);
    sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('PASSWORD_SALT')+1).setValue(newSalt);
  }

  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('LAST_LOGIN')+1).setValue(now);
  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('LAST_SEEN')+1).setValue(now);
  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('UPDATED_AT')+1).setValue(now);

  try{CacheService.getScriptCache().remove('SNF_WEBUSER_'+String(user.USER_ID||''));}catch(_){}

  const auth=createWebSession_(user.USER_ID);
  return {
    ok:true,
    authenticated:true,
    auth:auth,
    user:publicWebUserView_(webUserById_(user.USER_ID)),
    version:SNF.VERSION,
    passwordUpgraded:matchedLegacy
  };
}




function diagnoseWebAuth(){
  ensureUserRegistryDb_();
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);

  const report={
    version:SNF.VERSION,
    registryDbId:getUserRegistryDbId_(),
    currentPepperSet:!!String(prop_('WEB_AUTH_PEPPER')||''),
    legacyPepperSet:!!String(prop_('WEB_AUTH_PEPPER_LEGACY')||''),
    rounds:webPasswordRounds_(),
    legacyRounds:legacyWebPasswordRounds_(),
    users:[],
    duplicateUsernames:[],
    duplicateEmails:[]
  };

  if(sh.getLastRow()>=2){
    const vals=sh.getRange(2,1,sh.getLastRow()-1,SNF.WEB_USER_HEADERS.length).getValues();
    const byUsername={},byEmail={};

    vals.forEach(function(r){
      const u=rowObject_(SNF.WEB_USER_HEADERS,r);
      const un=String(u.USERNAME||'').toLowerCase();
      const em=String(u.EMAIL||'').toLowerCase();

      if(un)(byUsername[un]||(byUsername[un]=[])).push(String(u.USER_ID||''));
      if(em)(byEmail[em]||(byEmail[em]=[])).push(String(u.USER_ID||''));

      report.users.push({
        userId:String(u.USER_ID||''),
        username:String(u.USERNAME||''),
        email:String(u.EMAIL||''),
        status:String(u.STATUS||'ACTIVE'),
        hasPasswordHash:!!String(u.PASSWORD_HASH||''),
        hasPasswordSalt:!!String(u.PASSWORD_SALT||''),
        hasDbId:!!String(u.DB_ID||''),
        updatedAt:String(u.UPDATED_AT||'')
      });
    });

    Object.keys(byUsername).forEach(function(k){
      if(byUsername[k].length>1)report.duplicateUsernames.push({username:k,userIds:byUsername[k]});
    });
    Object.keys(byEmail).forEach(function(k){
      if(byEmail[k].length>1)report.duplicateEmails.push({email:k,userIds:byEmail[k]});
    });
  }

  Logger.log(JSON.stringify(report,null,2));
  return report;
}

function repairWebPasswordFromProperties(){
  ensureUserRegistryDb_();

  const props=PropertiesService.getScriptProperties();
  const identifier=String(props.getProperty('WEB_REPAIR_IDENTIFIER')||'').trim();
  const password=String(props.getProperty('WEB_REPAIR_PASSWORD')||'');
  const wantedUserId=String(props.getProperty('WEB_REPAIR_USER_ID')||'').trim().toUpperCase();

  if(!identifier)throw new Error('Set Script Property WEB_REPAIR_IDENTIFIER terlebih dahulu.');
  if(!password)throw new Error('Set Script Property WEB_REPAIR_PASSWORD terlebih dahulu.');

  validateWebPassword_(password);

  const matches=webUsersByIdentifier_(identifier);
  if(!matches.length)throw new Error('Akun tidak ditemukan: '+identifier);

  let user=null;

  if(wantedUserId){
    user=matches.find(function(u){
      return String(u.USER_ID||'').toUpperCase()===wantedUserId;
    })||null;

    if(!user)throw new Error('WEB_REPAIR_USER_ID tidak cocok.');
  }else if(matches.length===1){
    user=matches[0];
  }else{
    throw new Error(
      'Ada '+matches.length+' akun dengan username/email yang sama. '+
      'Set WEB_REPAIR_USER_ID ke salah satu: '+
      matches.map(function(u){return String(u.USER_ID||'');}).join(', ')
    );
  }

  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS);
  const row=findRowByFirstCol_(sh,String(user.USER_ID||''));
  if(!row)throw new Error('Row akun tidak ditemukan.');

  const salt=randomToken_().slice(0,32);
  const hash=webPasswordHash_(password,salt);

  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('PASSWORD_HASH')+1).setValue(hash);
  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('PASSWORD_SALT')+1).setValue(salt);
  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('STATUS')+1).setValue('ACTIVE');
  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('UPDATED_AT')+1).setValue(isoNow_());

  const sess=getWebRegistrySheet_(SNF.SHEETS.WEB_SESSIONS);
  if(sess.getLastRow()>=2){
    const vals=sess.getRange(2,1,sess.getLastRow()-1,SNF.WEB_SESSION_HEADERS.length).getValues();
    const rows=[];
    vals.forEach(function(r,i){
      const s=rowObject_(SNF.WEB_SESSION_HEADERS,r);
      if(String(s.USER_ID||'').toUpperCase()===String(user.USER_ID||'').toUpperCase()){
        rows.push(i+2);
      }
    });
    rows.reverse().forEach(function(r){sess.deleteRow(r);});
  }

  try{CacheService.getScriptCache().remove('SNF_WEBUSER_'+String(user.USER_ID||''));}catch(_){}
  try{clearWebLoginFailures_(identifier);}catch(_){}

  props.deleteProperty('WEB_REPAIR_PASSWORD');

  const result={
    ok:true,
    userId:String(user.USER_ID||''),
    username:String(user.USERNAME||''),
    email:String(user.EMAIL||''),
    message:'Password diperbarui. WEB_REPAIR_PASSWORD sudah dihapus otomatis.'
  };

  Logger.log(JSON.stringify(result,null,2));
  return result;
}

function webLogout(auth){
  if(auth&&auth.sessionId){
    const sid=String(auth.sessionId||'').trim().toUpperCase();
    const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_SESSIONS);
    const row=findRowByFirstCol_(sh,sid);
    if(row)sh.deleteRow(row);
    try{CacheService.getScriptCache().remove('SNF_WEBSESSION_'+sid);}catch(_){}
  }
  return {ok:true};
}

// v5.1: "log out everywhere" — a stolen session token used to stay valid up to
// 30 days because webLogout only deleted the presented session row.
function webLogoutAll(auth){
  const user=authWebUser_(auth);
  const uid=String(user.USER_ID||'').toUpperCase();
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_SESSIONS);
  const cache=CacheService.getScriptCache();
  if(sh.getLastRow()>=2){
    const vals=sh.getRange(2,1,sh.getLastRow()-1,SNF.WEB_SESSION_HEADERS.length).getValues();
    const rows=[];
    vals.forEach(function(r,i){
      const o=rowObject_(SNF.WEB_SESSION_HEADERS,r);
      if(String(o.USER_ID||'').toUpperCase()===uid){
        rows.push(i+2);
        try{cache.remove('SNF_WEBSESSION_'+String(o.SESSION_ID||'').toUpperCase());}catch(_){}
      }
    });
    rows.reverse().forEach(function(row){try{sh.deleteRow(row);}catch(_){}});
  }
  return {ok:true};
}

// Web Admin login is intentionally disabled. Telegram Admin and Web users are isolated.
function webAdminLogin(){throw new Error('Web Admin Studio dinonaktifkan. Gunakan Telegram untuk workspace admin.');}
function webAdminLogout(){return {ok:true};}
function isStudioAdminAuth_(){return false;}
function isStudioAdminUser_(){return false;}


function webNovelDirectorySheet_(){return getWebRegistrySheet_(SNF.SHEETS.WEB_NOVELS);}
function webJobDirectorySheet_(){return getWebRegistrySheet_(SNF.SHEETS.WEB_JOBS);}

function upsertWebNovelDirectory_(obj){
  const sh=webNovelDirectorySheet_();
  const row=findRowByFirstCol_(sh,String(obj.NOVEL_ID||'').toUpperCase());
  const values=SNF.INDEX_HEADERS.map(function(h){return obj[h]!==undefined?obj[h]:'';});
  if(row)sh.getRange(row,1,1,values.length).setValues([values]);else sh.appendRow(values);
}

function getWebNovelDirectory_(novelId){
  const sh=webNovelDirectorySheet_(),row=findRowByFirstCol_(sh,String(novelId||'').toUpperCase());
  if(!row)return null;
  return rowObject_(SNF.INDEX_HEADERS,sh.getRange(row,1,1,SNF.INDEX_HEADERS.length).getValues()[0]);
}

function listWebNovelDirectory_(){
  const sh=webNovelDirectorySheet_();
  if(sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,SNF.INDEX_HEADERS.length).getValues()
    .map(function(r){return rowObject_(SNF.INDEX_HEADERS,r);});
}

function getWebNovelIndexForUser_(userId,novelId){
  userId=String(userId||'').toUpperCase();
  novelId=String(novelId||'').toUpperCase();
  const sh=getWebUserIndexSheet_(userId),row=findRowByFirstCol_(sh,novelId);
  if(!row)return null;
  const n=rowObject_(SNF.INDEX_HEADERS,sh.getRange(row,1,1,SNF.INDEX_HEADERS.length).getValues()[0]);
  if(String(n.OWNER_TYPE||'')!=='WEB_USER'||String(n.OWNER_ID||'').toUpperCase()!==userId)return null;
  return n;
}

function upsertWebJobDirectory_(job,dbId){
  const sh=webJobDirectorySheet_();
  const row=findRowByFirstCol_(sh,String(job.JOB_ID||'').toUpperCase());
  const vals=[
    job.JOB_ID||'',job.USER_ID||job.OWNER_ID||'',dbId||'',job.NOVEL_ID||'',
    job.TYPE||'',job.STAGE||'',Number(job.PROGRESS||0),job.STATUS||'',
    job.CREATED_AT||isoNow_(),job.UPDATED_AT||isoNow_()
  ];
  if(row)sh.getRange(row,1,1,vals.length).setValues([vals]);else sh.appendRow(vals);
}

function getWebJobDirectory_(jobId){
  const sh=webJobDirectorySheet_(),row=findRowByFirstCol_(sh,String(jobId||'').toUpperCase());
  if(!row)return null;
  return rowObject_(SNF.WEB_JOB_DIR_HEADERS,sh.getRange(row,1,1,SNF.WEB_JOB_DIR_HEADERS.length).getValues()[0]);
}

function removeWebJobDirectory_(jobId){
  const sh=webJobDirectorySheet_(),row=findRowByFirstCol_(sh,String(jobId||'').toUpperCase());
  if(row)sh.deleteRow(row);
}

function getWebJobForUser_(userId,jobId){
  userId=String(userId||'').toUpperCase();
  const sh=getWebUserJobsSheet_(userId),row=findRowByFirstCol_(sh,String(jobId||'').toUpperCase());
  if(!row)return null;
  const j=rowObject_(SNF.JOB_HEADERS,sh.getRange(row,1,1,SNF.JOB_HEADERS.length).getValues()[0]);
  j.DATA=safeJson_(j.DATA_JSON,{});
  return webCanAccessJob_(userId,j)?j:null;
}

function webCanAccessNovel_(userId,index){
  if(!index)return false;
  return String(index.OWNER_TYPE||'')==='WEB_USER' &&
    String(index.OWNER_ID||'')===String(userId||'');
}

function jobOwnerType_(job){
  const explicit=String(job&&job.OWNER_TYPE||'').toUpperCase();
  if(explicit)return explicit;
  const uid=String(job&&job.USER_ID||'');
  return /^WUSR_[A-Z0-9]+$/i.test(uid)?'WEB_USER':'TELEGRAM_ADMIN';
}

function jobChannel_(job){
  const explicit=String(job&&job.CHANNEL||'').toUpperCase();
  if(explicit)return explicit;
  return jobOwnerType_(job)==='WEB_USER'?'WEB':'TELEGRAM';
}

function jobOwnerId_(job){
  const explicit=String(job&&job.OWNER_ID||'');
  if(explicit)return explicit;
  const uid=String(job&&job.USER_ID||'');
  return jobOwnerType_(job)==='WEB_USER'?uid.toUpperCase():(uid?'TG_'+uid:'ADMIN');
}

function webCanAccessJob_(userId,job){
  if(!job)return false;
  return jobChannel_(job)==='WEB' &&
    jobOwnerType_(job)==='WEB_USER' &&
    jobOwnerId_(job)===String(userId||'').toUpperCase();
}

function isTelegramAdminNovel_(index){
  return !!index && String(index.OWNER_TYPE||'')==='TELEGRAM_ADMIN';
}

/* ========================================================================== */
/* ========================================================================== */
/* PUBLIC WEB APP API                                                         */
/* ========================================================================== */

/**
 * Called when the public Web App opens.
 * auth = {userId, token} from browser localStorage, or null for a new visitor.
 */
function webBootstrap(auth){
  if(!auth||!auth.sessionId)return {ok:true,authenticated:false,version:SNF.VERSION,settings:publicSettings_()};
  try{return webResumeSession(auth);}
  catch(_){return {ok:true,authenticated:false,version:SNF.VERSION,settings:publicSettings_()};}
}

function webResumeSession(auth){
  const user=authWebUser_(auth);
  return {
    ok:true,authenticated:true,version:SNF.VERSION,auth:auth,
    user:publicWebUserView_(user),settings:publicSettings_()
  };
}

function webLoadLibrary(auth){
  const user=authWebUser_(auth);
  const ss=ensureWebUserDb_(user.USER_ID);
  return {
    ok:true,
    user:publicWebUserView_(user),
    databaseName:ss.getName(),
    novels:webListNovels(auth)
  };
}

// Legacy recovery-token flow is intentionally removed from the public Web App.
function webRecover(){throw new Error('Recovery Key login sudah dinonaktifkan. Gunakan username/email dan password.');}

function webListNovels(auth){
  const user=authWebUser_(auth),sh=getWebUserIndexSheet_(user.USER_ID);
  if(sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,SNF.INDEX_HEADERS.length).getValues()
    .map(function(r){return rowObject_(SNF.INDEX_HEADERS,r);})
    .filter(function(n){return webCanAccessNovel_(user.USER_ID,n)&&String(n.STATUS||'')!=='DELETED';})
    .map(publicNovelCard_)
    .sort(function(a,b){return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));});
}

function webStartBlueprint(auth, idea, options) {
  const user=authWebUser_(auth);
  assertNoRunningPublicJob_(user.USER_ID);
  reservePublicQuota_(user.USER_ID,0,1);
  const cleanIdea=String(idea||'').trim();
  if(cleanIdea.length<20) throw new Error('Ceritakan idemu sedikit lebih detail (minimal sekitar 20 karakter).');
  const opts=options && typeof options==='object' ? options : {};
  const enriched=cleanIdea+'\n\nSTRUCTURED CREATOR PREFERENCES (only use fields that are not blank):\n'+JSON.stringify(opts);
  const jobId=createJob_({novelId:'',chatId:'',userId:user.USER_ID,type:'BLUEPRINT_EXTRACT',stage:'EXTRACT',progress:5,status:'QUEUED',messageId:'',data:{idea:enriched,source:'WEB_USER'}});
  return {ok:true,jobId:jobId};
}

function webRandomBlueprint(auth, options) {
  const user=authWebUser_(auth);
  assertNoRunningPublicJob_(user.USER_ID);
  reservePublicQuota_(user.USER_ID,0,1);
  const opts=options && typeof options==='object' ? options : {};
  const jobId=createJob_({novelId:'',chatId:'',userId:user.USER_ID,type:'BLUEPRINT_RANDOM',stage:'RANDOM',progress:5,status:'QUEUED',messageId:'',data:{source:'WEB_USER',preferences:opts}});
  return {ok:true,jobId:jobId};
}

function webUpdateBlueprint(auth, blueprint, instruction) {
  const user=authWebUser_(auth);
  assertNoRunningPublicJob_(user.USER_ID);
  reservePublicQuota_(user.USER_ID,0,1);
  if(!instruction || String(instruction).trim().length<3) throw new Error('Tulis perubahan yang ingin dilakukan.');
  const bp=normalizeBlueprint_(JSON.parse(JSON.stringify(blueprint||{})));
  const jobId=createJob_({novelId:'',chatId:'',userId:user.USER_ID,type:'BLUEPRINT_UPDATE',stage:'UPDATE',progress:8,status:'QUEUED',messageId:'',data:{blueprint:bp,instruction:String(instruction),mode:'edit',source:'WEB_USER'}});
  return {ok:true,jobId:jobId};
}

function webBuildNovel(auth, blueprint) {
  const user=authWebUser_(auth);
  assertNoRunningPublicJob_(user.USER_ID);
  reservePublicQuota_(user.USER_ID,1,1);
  const bp=normalizeBlueprint_(JSON.parse(JSON.stringify(blueprint||{})));
  bp.targetChapters=Math.min(bp.targetChapters,publicMaxTargetChapters_());
  const novelId=randomNovelId_();
  const jobId=createJob_({
    novelId:novelId,chatId:'',userId:user.USER_ID,type:'FOUNDATION',stage:'CREATE_WORKSPACE',progress:2,status:'QUEUED',messageId:'',
    ownerId:user.USER_ID,ownerType:'WEB_USER',channel:'WEB',
    data:{mode:'create',blueprint:bp,nextPlanStart:1,source:'WEB_USER',ownerId:user.USER_ID,requestedNovelId:novelId}
  });
  return {ok:true,jobId:jobId,novelId:novelId};
}

function webGetJob(auth, jobId) {
  const user=authWebUser_(auth);
  const job=getJob_(String(jobId||''));
  if(!job || !webCanAccessJob_(user.USER_ID,job)) throw new Error('Job tidak ditemukan.');
  return publicJobView_(job);
}

function webPumpJob(auth, jobId) {
  const user=authWebUser_(auth);
  let job=getJob_(String(jobId||''));
  if(!job || !webCanAccessJob_(user.USER_ID,job)) throw new Error('Job tidak ditemukan.');
  if(['QUEUED','RUNNING'].indexOf(String(job.STATUS))<0) return publicJobView_(job);
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(80)) return publicJobView_(job);
  try {
    job=getJob_(String(jobId));
    if(job && ['QUEUED','RUNNING'].indexOf(String(job.STATUS))>=0) {
      try {
        if(String(job.TYPE)==='AUTO_PRODUCTION'){
          const pd=job.DATA||{};
          const childId=String(pd.finalizeJobId||pd.childJobId||'');
          if(childId){
            const child=getJob_(childId);
            if(child && ['QUEUED','RUNNING'].indexOf(String(child.STATUS))>=0){
              processOneJobStep_(child);
              job=getJob_(String(jobId))||job;
            }
          }
        }
        processOneJobStep_(job);
      } catch(err) {
        const msg=String(err&&err.stack||err);
        updateJobFields_(job.JOB_ID,{STATUS:'ERROR',LAST_ERROR:truncate_(msg,4000)});
        log_('ERROR','webPump:'+job.JOB_ID,msg,job.DATA||{});
      }
    }
  } finally { lock.releaseLock(); }
  return publicJobView_(getJob_(String(jobId)));
}

function webGetWorkspace(auth, novelId) {
  const user=authWebUser_(auth);
  const index=assertNovelOwned_(user.USER_ID,novelId);
  const sh=getNovelSheet_(index.NOVEL_ID);
  const bp=getNovelRecordData_(sh,'BLUEPRINT','MASTER')||{};
  const bible=getNovelRecordData_(sh,'BIBLE','MASTER')||null;
  const roadmap=getNovelRecordData_(sh,'ROADMAP_MASTER','MASTER')||null;
  const plans=getRoadmapChapterRange_(sh,1,Math.min(Number(index.TARGET_CHAPTERS||0),50));
  const summaries=getChapterSummaries_(sh,1,Number(index.CURRENT_CHAPTER||0));
  let activeJob=null;
  if(index.ACTIVE_JOB_ID){
    const j=getJob_(String(index.ACTIVE_JOB_ID));
    if(j && webCanAccessJob_(user.USER_ID,j)) activeJob=publicJobView_(j);
  }
  return {
    ok:true,
    novel:publicNovelCard_(index),
    blueprint:bp,
    bible:bible,
    roadmap:roadmap,
    chapterPlans:plans,
    chapterSummaries:summaries,
    reviews:webNovelReviewCards_(sh,12),
    activeJob:activeJob
  };
}


function webGetChapterIndex(auth,novelId){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);
  const sh=getNovelSheet_(novelId),out=[];
  if(sh.getLastRow()>=2){
    sh.getRange(2,1,sh.getLastRow()-1,SNF.NOVEL_HEADERS.length).getValues().forEach(function(r){
      if(String(r[0])!=='CHAPTER_SUMMARY')return;
      const n=Number(r[2]||0);if(!n)return;
      out.push({number:n,chapter:n,title:String(r[4]||('Chapter '+n)),status:String(r[6]||''),updatedAt:String(r[9]||'')});
    });
  }
  out.sort(function(a,b){return a.number-b.number;});
  return {ok:true,chapters:out};
}

function webGetRoadmapCenterFast(auth,novelId){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);
  return {ok:true,roadmapCenter:getRoadmapCenterData_(novelId)};
}

function webGetCanonStatusFast(auth,novelId){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);
  const sh=getNovelSheet_(novelId);
  return {ok:true,canonHealth:getNovelRecordData_(sh,'CANON_HEALTH','LATEST')||null,contradictionAlarm:getNovelRecordData_(sh,'CONTRADICTION_ALARM','LATEST')||null};
}

function webGetPublicationMetadataFast(auth,novelId){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);
  return {ok:true,publicationMetadata:publicationMetadataMap_(getNovelSheet_(novelId))};
}

function webGetRoadmapPage(auth, novelId, start, limit) {
  const user=authWebUser_(auth);
  const index=assertNovelOwned_(user.USER_ID,novelId);
  const s=Math.max(1,Number(start||1));
  const lim=Math.max(1,Math.min(100,Number(limit||30)));
  const e=Math.min(Number(index.TARGET_CHAPTERS||s+lim-1),s+lim-1);
  return {ok:true,start:s,end:e,plans:getRoadmapChapterRange_(getNovelSheet_(novelId),s,e)};
}

function webGetChapter(auth, novelId, chapterNo) {
  const user=authWebUser_(auth);
  assertNovelOwned_(user.USER_ID,novelId);
  const n=Number(chapterNo);
  if(!n || n<1) throw new Error('Nomor chapter tidak valid.');
  const sh=getNovelSheet_(novelId);
  const rec=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
  if(!rec || !rec.FILE_ID) throw new Error('Chapter '+n+' belum tersedia.');
  return {ok:true,chapter:n,title:rec.TITLE,status:rec.STATUS,summary:rec.DATA,text:DriveApp.getFileById(String(rec.FILE_ID)).getBlob().getDataAsString('UTF-8')};
}

function webGetBatchPreview(auth, jobId) {
  const user=authWebUser_(auth);
  const job=getJob_(jobId);
  if(!job || !webCanAccessJob_(user.USER_ID,job)) throw new Error('Job tidak ditemukan.');
  assertNovelOwned_(user.USER_ID,job.NOVEL_ID);
  const d=job.DATA||{};
  const start=Number(d.startChapter||1), end=Number(d.endChapter||start);
  const sh=getNovelSheet_(job.NOVEL_ID);
  const chapters=[];
  for(let n=start;n<=end;n++){
    const r=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
    if(r && r.FILE_ID) chapters.push({number:n,title:r.TITLE,status:r.STATUS,summary:r.DATA,text:DriveApp.getFileById(String(r.FILE_ID)).getBlob().getDataAsString('UTF-8')});
  }
  return {ok:true,start:start,end:end,review:getReviewForJob_(sh,job.JOB_ID)||{},chapters:chapters};
}

function webApproveFoundation(auth, jobId) {
  const user=authWebUser_(auth);
  const job=ownedJob_(user.USER_ID,jobId,'FOUNDATION');
  if(job.STATUS!=='WAITING_APPROVAL') throw new Error('Foundation sudah tidak menunggu approval.');
  markNovelFoundationCanon_(job.NOVEL_ID);
  updateJobFields_(job.JOB_ID,{STATUS:'DONE',PROGRESS:100,STAGE:'APPROVED'});
  reservePublicQuota_(user.USER_ID,0,1);
  const size=defaultBatchSize_();
  const batchJob=createJob_({novelId:job.NOVEL_ID,chatId:'',userId:user.USER_ID,type:'GENERATE_BATCH',stage:'GENERATE_CHAPTERS',progress:0,status:'QUEUED',messageId:'',data:{startChapter:1,endChapter:size,nextChapter:1,mode:'draft',reason:'Initial public test batch after approved foundation.',source:'WEB'}});
  updateNovelIndexFields_(job.NOVEL_ID,{ACTIVE_JOB_ID:batchJob,STATUS:'GENERATING_TEST_CHAPTERS'});
  return {ok:true,jobId:batchJob,novelId:job.NOVEL_ID};
}

function webReviseFoundation(auth, jobId, reason) {
  const user=authWebUser_(auth);
  const old=ownedJob_(user.USER_ID,jobId,'FOUNDATION');
  if(['WAITING_APPROVAL','REJECTED'].indexOf(String(old.STATUS))<0) throw new Error('Foundation tidak dapat direvisi pada status ini.');
  if(String(reason||'').trim().length<5) throw new Error('Tuliskan alasan revisi lebih jelas.');
  updateJobFields_(old.JOB_ID,{STATUS:'REJECTED',STAGE:'USER_REJECTED'});
  reservePublicQuota_(user.USER_ID,0,1);
  const newJob=createJob_({novelId:old.NOVEL_ID,chatId:'',userId:user.USER_ID,type:'FOUNDATION',stage:'GENERATE_BIBLE',progress:10,status:'QUEUED',messageId:'',data:{mode:'revise',reason:String(reason),nextPlanStart:1,source:'WEB',ownerId:user.USER_ID}});
  updateNovelIndexFields_(old.NOVEL_ID,{ACTIVE_JOB_ID:newJob,STATUS:'REVISING_FOUNDATION'});
  return {ok:true,jobId:newJob,novelId:old.NOVEL_ID};
}

// v5.1: atomic claim of a WAITING_APPROVAL job. Prevents double-approve /
// double-revise races (double-click in web UI, double-tap in Telegram) from
// creating two follow-up jobs. Ownership must be checked by the caller first;
// the status check + transition here is atomic under the script lock.
function claimWaitingJobById_(jobId, newStatus, newStage) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const j = getJob_(String(jobId||'').toUpperCase());
    if (!j) throw new Error('Job tidak ditemukan.');
    if (String(j.STATUS||'') !== 'WAITING_APPROVAL') throw new Error('Job sudah tidak menunggu approval.');
    updateJobFields_(j.JOB_ID, {STATUS:newStatus, STAGE:newStage});
    return getJob_(j.JOB_ID) || j;
  } finally {
    lock.releaseLock();
  }
}

function webApproveBatch(auth, jobId) {
  const user=authWebUser_(auth);
  const source=ownedJob_(user.USER_ID,jobId,'GENERATE_BATCH');
  claimWaitingJobById_(source.JOB_ID,'APPROVED','USER_APPROVED');
  reservePublicQuota_(user.USER_ID,0,1);
  const d=source.DATA||{};
  const fin=createJob_({novelId:source.NOVEL_ID,chatId:'',userId:user.USER_ID,type:'FINALIZE_BATCH',stage:'CANONIZE',progress:5,status:'QUEUED',messageId:'',data:{sourceJobId:source.JOB_ID,startChapter:d.startChapter,endChapter:d.endChapter,source:'WEB'}});
  updateNovelIndexFields_(source.NOVEL_ID,{ACTIVE_JOB_ID:fin,STATUS:'CANONIZING'});
  return {ok:true,jobId:fin,novelId:source.NOVEL_ID};
}

function webReviseBatch(auth, jobId, reason) {
  const user=authWebUser_(auth);
  const old=ownedJob_(user.USER_ID,jobId,'GENERATE_BATCH');
  if(String(reason||'').trim().length<5) throw new Error('Tuliskan alasan revisi lebih jelas.');
  claimWaitingJobById_(old.JOB_ID,'REJECTED','USER_REJECTED');
  reservePublicQuota_(user.USER_ID,0,1);
  const d=old.DATA||{};
  const next=createJob_({novelId:old.NOVEL_ID,chatId:'',userId:user.USER_ID,type:'GENERATE_BATCH',stage:'GENERATE_CHAPTERS',progress:0,status:'QUEUED',messageId:'',data:{startChapter:Number(d.startChapter),endChapter:Number(d.endChapter),nextChapter:Number(d.startChapter),mode:'revision',reason:String(reason),sourceJobId:old.JOB_ID,source:'WEB'}});
  updateNovelIndexFields_(old.NOVEL_ID,{ACTIVE_JOB_ID:next,STATUS:'REVISING_CHAPTERS'});
  return {ok:true,jobId:next,novelId:old.NOVEL_ID};
}

function webRegenerateBatch(auth, jobId) {
  return webReviseBatch(auth,jobId,'Regenerate the entire batch from scratch. Preserve all canon, Bible, roadmap, character knowledge and required story outcomes, but rewrite execution and prose.');
}

function webNextBatch(auth, novelId) {
  const user=authWebUser_(auth);
  const index=assertNovelOwned_(user.USER_ID,novelId);
  assertNoRunningPublicJob_(user.USER_ID);
  reservePublicQuota_(user.USER_ID,0,1);
  const target=Number(index.TARGET_CHAPTERS||0);
  const start=Number(index.LATEST_CANON||0)+1;
  if(target && start>target) throw new Error('Target novel sudah tercapai.');
  const end=target?Math.min(target,start+defaultBatchSize_()-1):start+defaultBatchSize_()-1;
  const jid=createJob_({novelId:index.NOVEL_ID,chatId:'',userId:user.USER_ID,type:'GENERATE_BATCH',stage:'GENERATE_CHAPTERS',progress:0,status:'QUEUED',messageId:'',data:{startChapter:start,endChapter:end,nextChapter:start,mode:'draft',reason:'Continue approved canon according to Bible, roadmap and current story memory.',source:'WEB'}});
  updateNovelIndexFields_(index.NOVEL_ID,{ACTIVE_JOB_ID:jid,STATUS:'GENERATING_CHAPTERS'});
  return {ok:true,jobId:jid,novelId:index.NOVEL_ID,start:start,end:end};
}


/** Start a fresh AI continuity review for one existing chapter from the Web App. */
function webReviewChapter(auth, novelId, chapterNo) {
  const user=authWebUser_(auth);
  const index=assertNovelOwned_(user.USER_ID,novelId);
  assertNoRunningPublicJob_(user.USER_ID);
  reservePublicQuota_(user.USER_ID,0,1);

  const n=Number(chapterNo||0);
  if(!n || n<1) throw new Error('Nomor chapter tidak valid.');
  const sh=getNovelSheet_(index.NOVEL_ID);
  const rec=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
  if(!rec || !rec.FILE_ID) throw new Error('Chapter '+n+' belum mempunyai file untuk direview.');

  const jid=createJob_({
    novelId:index.NOVEL_ID,chatId:'',userId:user.USER_ID,
    type:'REVIEW_ONLY',stage:'REVIEW',progress:5,status:'QUEUED',messageId:'',
    data:{startChapter:n,endChapter:n,source:'WEB_ACTIVE_REVIEW',reviewCount:1}
  });
  updateNovelIndexFields_(index.NOVEL_ID,{ACTIVE_JOB_ID:jid,STATUS:'REVIEWING_CHAPTER'});
  return {ok:true,jobId:jid,novelId:index.NOVEL_ID,chapter:n};
}

/** Rewrite a single existing chapter while preserving Bible/Roadmap/continuity context. */
function webRewriteChapter(auth, novelId, chapterNo, reason, sourceJobId) {
  const user=authWebUser_(auth);
  const index=assertNovelOwned_(user.USER_ID,novelId);
  const n=Number(chapterNo||0);
  if(!n || n<1) throw new Error('Nomor chapter tidak valid.');
  const why=String(reason||'').trim();
  if(why.length<5) throw new Error('Tuliskan alasan revisi sedikit lebih jelas.');

  const sh=getNovelSheet_(index.NOVEL_ID);
  const rec=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));
  if(!rec || !rec.FILE_ID) throw new Error('Chapter '+n+' belum mempunyai file yang bisa direwrite.');

  // If the rewrite comes directly from a completed review screen, close that review job.
  // v5.1 fix: the running-job guard used to live in the else branch, so ANY
  // sourceJobId (even garbage) skipped it → unlimited concurrent batch jobs.
  if(sourceJobId){
    const source=getJob_(String(sourceJobId));
    if(source && webCanAccessJob_(user.USER_ID,source) && source.TYPE==='REVIEW_ONLY'){
      updateJobFields_(source.JOB_ID,{STATUS:'DONE',STAGE:'REWRITE_REQUESTED',PROGRESS:100});
    }
  }
  assertNoRunningPublicJob_(user.USER_ID);

  reservePublicQuota_(user.USER_ID,0,1);
  const jid=createJob_({
    novelId:index.NOVEL_ID,chatId:'',userId:user.USER_ID,
    type:'GENERATE_BATCH',stage:'GENERATE_CHAPTERS',progress:0,status:'QUEUED',messageId:'',
    data:{
      startChapter:n,endChapter:n,nextChapter:n,mode:'revision',reason:why,
      sourceJobId:String(sourceJobId||''),source:'WEB_MANUAL_REWRITE'
    }
  });
  updateNovelIndexFields_(index.NOVEL_ID,{ACTIVE_JOB_ID:jid,STATUS:'REVISING_CHAPTERS'});
  return {ok:true,jobId:jid,novelId:index.NOVEL_ID,chapter:n};
}

/** Re-run AI review on the same waiting batch/review job using the latest Novel Brain. */
function webRereviewJob(auth, jobId) {
  const user=authWebUser_(auth);
  const job=getJob_(String(jobId||''));
  if(!job || !webCanAccessJob_(user.USER_ID,job)) throw new Error('Job tidak ditemukan.');
  assertNovelOwned_(user.USER_ID,job.NOVEL_ID);
  if(String(job.STATUS)!=='WAITING_APPROVAL') throw new Error('Job sudah tidak menunggu review/approval.');
  if(['GENERATE_BATCH','REVIEW_ONLY'].indexOf(String(job.TYPE))<0) throw new Error('Tipe job ini tidak mendukung review ulang.');

  reservePublicQuota_(user.USER_ID,0,1);
  const d=Object.assign({},job.DATA||{});
  d.reviewCount=Number(d.reviewCount||1)+1;
  d.reviewRequestedAt=isoNow_();
  d.reviewRequestedBy=user.USER_ID;
  d.reviewMode='ACTIVE_REREVIEW_WEB';

  updateJobFields_(job.JOB_ID,{
    STATUS:'QUEUED',
    STAGE:job.TYPE==='GENERATE_BATCH'?'REVIEW_BATCH':'REVIEW',
    PROGRESS:job.TYPE==='GENERATE_BATCH'?88:5,
    LAST_ERROR:'',
    DATA_JSON:JSON.stringify(d)
  });
  updateNovelIndexFields_(job.NOVEL_ID,{ACTIVE_JOB_ID:job.JOB_ID,STATUS:'REVIEWING_CHAPTER'});
  return {ok:true,jobId:job.JOB_ID,novelId:job.NOVEL_ID};
}

/** Cancel/delete the current unapproved generated batch. Canon is protected. */
function webCancelBatch(auth, jobId) {
  const user=authWebUser_(auth);
  const job=ownedJob_(user.USER_ID,jobId,'GENERATE_BATCH');
  if(String(job.STATUS)!=='WAITING_APPROVAL') throw new Error('Batch sudah tidak menunggu approval.');
  const result=cancelAndDeleteBatch_(job,user.USER_ID);
  return Object.assign({ok:true},result);
}

/** Close a manual REVIEW_ONLY job without changing the chapter. */
function webCloseReview(auth, jobId) {
  const user=authWebUser_(auth);
  const job=ownedJob_(user.USER_ID,jobId,'REVIEW_ONLY');
  if(String(job.STATUS)!=='WAITING_APPROVAL') throw new Error('Review ini sudah tidak aktif.');
  updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'REVIEW_CLOSED',PROGRESS:100});
  const index=getNovelIndex_(job.NOVEL_ID);
  if(index && String(index.ACTIVE_JOB_ID||'')===String(job.JOB_ID)){
    updateNovelIndexFields_(job.NOVEL_ID,{ACTIVE_JOB_ID:'',STATUS:Number(index.LATEST_CANON||0)>0?'ACTIVE':'FOUNDATION_APPROVED'});
  }
  return {ok:true,novelId:job.NOVEL_ID};
}

/** Lightweight recent review history for the Web workspace. */
function webListReviews(auth, novelId) {
  const user=authWebUser_(auth);
  const index=assertNovelOwned_(user.USER_ID,novelId);
  return webNovelReviewCards_(getNovelSheet_(index.NOVEL_ID),30);
}

function webNovelReviewCards_(sh, limit) {
  const last=sh.getLastRow();
  if(last<2) return [];
  const vals=sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues();
  const out=[];
  vals.forEach(function(r){
    if(String(r[0])!=='REVIEW') return;
    const data=safeJson_(r[5],{});
    out.push({
      key:String(r[1]||''),title:String(r[4]||'Review'),status:String(r[6]||''),
      version:Number(r[7]||1),updatedAt:String(r[9]||''),
      verdict:String(data.verdict||''),summary:truncate_(data.summary||'',360),
      roadmapStatus:String(data.roadmapCompliance&&data.roadmapCompliance.status||''),
      continuityStatus:String(data.storySynchronization&&data.storySynchronization.status||data.continuity&&data.continuity.status||'')
    });
  });
  out.sort(function(a,b){return String(b.updatedAt).localeCompare(String(a.updatedAt));});
  return out.slice(0,Math.max(1,Math.min(100,Number(limit||20))));
}

/* ========================================================================== */
/* PUBLIC WEB SECURITY / QUOTA HELPERS                                        */
/* ========================================================================== */


/* ========================================================================== */
/* INTELLIGENCE STUDIO: LORE / QUALITY / ANALYTICS / DIFF / PUBLISH          */
/* ========================================================================== */

function getRecordsByType_(sh,type){
  if(!sh || sh.getLastRow()<2)return [];
  const vals=sh.getRange(2,1,sh.getLastRow()-1,SNF.NOVEL_HEADERS.length).getValues();
  return vals.filter(function(r){return String(r[0])===String(type);}).map(function(r){
    const o=rowObject_(SNF.NOVEL_HEADERS,r);o.DATA=safeJson_(o.DATA_JSON,{});return o;
  });
}

function buildWorldEncyclopediaBaseline_(bible,memory){
  bible=bible||{};memory=memory||{};
  const existing=memory.worldEncyclopedia&&typeof memory.worldEncyclopedia==='object'?memory.worldEncyclopedia:{};
  function asArray(v){return Array.isArray(v)?v:[];}
  const locations=asArray(existing.locations).slice();
  const organizations=asArray(existing.organizations).slice();
  const seenLoc={};locations.forEach(function(x){seenLoc[String(x.name||x.id||'').toLowerCase()]=1;});
  (Array.isArray(bible.locations)?bible.locations:[]).forEach(function(x,i){
    const k=String(x.name||x.id||'').toLowerCase();if(k&&seenLoc[k])return;
    locations.push({id:x.id||('LOC_'+pad3_(i+1)),name:x.name||('Location '+(i+1)),description:x.description||x.role||'',firstSeenChapter:Number(x.firstSeenChapter||0),currentState:'',facts:Array.isArray(x.facts)?x.facts:[]});
  });
  const seenOrg={};organizations.forEach(function(x){seenOrg[String(x.name||x.id||'').toLowerCase()]=1;});
  const factions=Array.isArray(bible.factions)?bible.factions:(Array.isArray(bible.organizations)?bible.organizations:[]);
  factions.forEach(function(x,i){const k=String(x.name||x.id||'').toLowerCase();if(k&&seenOrg[k])return;organizations.push({id:x.id||('ORG_'+pad3_(i+1)),name:x.name||('Organization '+(i+1)),description:x.description||x.role||'',members:Array.isArray(x.members)?x.members:[],facts:Array.isArray(x.facts)?x.facts:[]});});
  return {
    updatedThroughChapter:Number(memory.throughChapter||0),updatedAt:isoNow_(),
    locations:locations,organizations:organizations,
    items:asArray(existing.items),races:asArray(existing.races),systems:asArray(existing.systems),
    historicalEvents:asArray(existing.historicalEvents),terminology:asArray(existing.terminology)
  };
}

function syncWorldEncyclopedia_(novelId,sh,memory,version){
  const bible=getNovelRecordData_(sh,'BIBLE','MASTER')||{};
  const lore=buildWorldEncyclopediaBaseline_(bible,memory||{});
  if(memory && memory.worldEncyclopedia && typeof memory.worldEncyclopedia==='object'){
    Object.keys(memory.worldEncyclopedia).forEach(function(k){if(Array.isArray(memory.worldEncyclopedia[k]))lore[k]=memory.worldEncyclopedia[k];});
    lore.updatedThroughChapter=Number(memory.throughChapter||lore.updatedThroughChapter||0);
  }
  const folders=ensureNovelStudioFolders_(novelId),folder=getFolderByIdSafe_(folders['14_LORE']);
  const f=upsertTextFile_(folder,'world_encyclopedia.json',JSON.stringify(lore,null,2));
  upsertNovelRecord_(sh,'WORLD_ENCYCLOPEDIA','MASTER','','','World Encyclopedia',lore,'CANON',Number(version||1),f.getId());
  return lore;
}

function loreFlatten_(lore){
  const out=[];
  const cats=['locations','organizations','items','races','systems','historicalEvents','terminology'];
  cats.forEach(function(cat){(Array.isArray(lore&&lore[cat])?lore[cat]:[]).forEach(function(x){out.push({category:cat,name:x.name||x.term||x.id||'-',data:x});});});
  return out;
}

function sendLoreSearch_(chatId,novelId,query){
  const sh=getNovelSheet_(novelId),idx=getNovelIndex_(novelId);
  let lore=getNovelRecordData_(sh,'WORLD_ENCYCLOPEDIA','MASTER');
  if(!lore)lore=buildWorldEncyclopediaBaseline_(getNovelRecordData_(sh,'BIBLE','MASTER')||{},getNovelRecordData_(sh,'MEMORY','STORY_MEMORY')||{});
  const all=loreFlatten_(lore),q=String(query||'').trim().toLowerCase();
  const rows=(q?all.filter(function(x){return JSON.stringify(x).toLowerCase().indexOf(q)>=0;}):all).slice(0,20);
  const counts={};all.forEach(function(x){counts[x.category]=Number(counts[x.category]||0)+1;});
  let text='📚 <b>WORLD ENCYCLOPEDIA</b>\n━━━━━━━━━━━━━━━━━━\n📖 '+escapeHtml_(idx.TITLE)+'\n'+
    'Locations '+Number(counts.locations||0)+' • Orgs '+Number(counts.organizations||0)+' • Items '+Number(counts.items||0)+' • Terms '+Number(counts.terminology||0)+'\n\n';
  if(q)text+='🔎 <b>'+escapeHtml_(query)+'</b>\n\n';
  text+=rows.map(function(x){const d=x.data||{};return '• <b>'+escapeHtml_(x.name)+'</b> <code>'+escapeHtml_(x.category)+'</code>\n  '+escapeHtml_(truncate_(d.description||d.meaning||(Array.isArray(d.facts)?d.facts.join('; '):''),220));}).join('\n\n')||'Belum ada lore terstruktur.';
  text+='\n\nGunakan <code>/lore refresh</code> untuk rebuild AI tanpa mengubah Canon.';
  sendMessage_(chatId,text);
}

function startLoreBuildJob_(chatId,userId,novelId){
  const msg=chatId?sendMessage_(chatId,'📚 <b>WORLD ENCYCLOPEDIA</b>\n\n⏳ Rebuilding lore database...'):'';
  const jid=createJob_({novelId:novelId,chatId:chatId||'',userId:userId||'',type:'LORE_BUILD',stage:'BUILD',progress:5,status:'QUEUED',messageId:msg||'',data:{source:'MANUAL'}});
  return jid;
}

function jobLoreBuild_(job){
  const sh=getNovelSheet_(job.NOVEL_ID),idx=getNovelIndex_(job.NOVEL_ID);
  const bible=getNovelRecordData_(sh,'BIBLE','MASTER')||{},memory=getNovelRecordData_(sh,'MEMORY','STORY_MEMORY')||{};
  const current=getNovelRecordData_(sh,'WORLD_ENCYCLOPEDIA','MASTER')||buildWorldEncyclopediaBaseline_(bible,memory);
  const summaries=getChapterSummaries_(sh,Math.max(1,Number(idx.LATEST_CANON||0)-39),Number(idx.LATEST_CANON||0)).filter(function(x){return String(x.status)==='CANON';});
  const lore=aiJson_('You are a continuity librarian. Build a concise WORLD ENCYCLOPEDIA using only supplied canon. Never invent. Merge duplicate entities and preserve exact names. Return JSON only with keys locations, organizations, items, races, systems, historicalEvents, terminology. Each entry should include stable id/name, short description, facts, and firstSeenChapter when known.\n\nBIBLE:\n'+JSON.stringify(bible)+'\n\nCURRENT LORE:\n'+JSON.stringify(current)+'\n\nSTORY MEMORY:\n'+JSON.stringify(memory)+'\n\nRECENT CANON SUMMARIES:\n'+JSON.stringify(summaries));
  lore.updatedThroughChapter=Number(idx.LATEST_CANON||0);lore.updatedAt=isoNow_();
  const folders=ensureNovelStudioFolders_(job.NOVEL_ID),folder=getFolderByIdSafe_(folders['14_LORE']);
  const f=upsertTextFile_(folder,'world_encyclopedia.json',JSON.stringify(lore,null,2));
  upsertNovelRecord_(sh,'WORLD_ENCYCLOPEDIA','MASTER','','','World Encyclopedia',lore,'CANON',nextRecordVersion_(sh,'WORLD_ENCYCLOPEDIA','MASTER'),f.getId());
  updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'DONE',PROGRESS:100});
  safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),'✅ <b>WORLD ENCYCLOPEDIA UPDATED</b>\n\n📖 '+escapeHtml_(idx.TITLE)+'\n📚 Through Chapter '+Number(idx.LATEST_CANON||0));
}

function analyticsTokens_(text){
  return String(text||'').toLowerCase().match(/[a-z0-9À-ÿ\u3040-\u30ff\u3400-\u9fff]+(?:['’\-][a-z0-9À-ÿ]+)*/g)||[];
}

function analyticsStopWords_(){
  return {'the':1,'and':1,'that':1,'this':1,'with':1,'from':1,'into':1,'were':1,'was':1,'his':1,'her':1,'she':1,'him':1,'for':1,'but':1,'not':1,'you':1,'your':1,'they':1,'their':1,'then':1,'than':1,'there':1,'have':1,'had':1,'has':1,'yang':1,'dan':1,'dari':1,'untuk':1,'dengan':1,'itu':1,'ini':1,'dia':1,'mereka':1,'pada':1,'dalam':1,'tidak':1,'akan':1,'sudah':1,'saat':1,'ketika':1,'sebuah':1};
}

function extractPhraseFingerprint_(text){
  const toks=analyticsTokens_(text).filter(function(x){return x.length>=3 && !/[\u3040-\u30ff\u3400-\u9fff]/.test(x);});
  const stop=analyticsStopWords_(),counts={};
  for(let i=0;i<toks.length-2;i++){
    const a=toks[i],b=toks[i+1],c=toks[i+2];
    if(stop[a]||stop[c])continue;
    const p=a+' '+b+' '+c;
    counts[p]=Number(counts[p]||0)+1;
  }
  return Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]||a.localeCompare(b);}).slice(0,24).map(function(p){return {phrase:p,count:counts[p]};});
}

function countRegexHits_(text,words){
  const s=' '+String(text||'').toLowerCase().replace(/[^a-z0-9À-ÿ\s]/g,' ')+' ';let n=0;
  words.forEach(function(w){const re=new RegExp('\\b'+String(w).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g');const m=s.match(re);if(m)n+=m.length;});return n;
}

function shortSignature_(text,fromEnd){
  const toks=analyticsTokens_(text).filter(function(x){return x.length>1;});
  const a=fromEnd?toks.slice(-5):toks.slice(0,5);return a.join(' ');
}

function chapterQualityMetrics_(text,chapterNo){
  text=String(text||'');const toks=analyticsTokens_(text),wordCount=toks.length;
  const paras=text.split(/\n\s*\n+/).map(function(x){return x.trim();}).filter(Boolean);
  const sentences=text.split(/[.!?。！？]+/).map(function(x){return x.trim();}).filter(Boolean);
  const dialogueParas=paras.filter(function(p){return /^[\"“「]/.test(p)||(/[\"“”「」]/.test(p)&&p.length<700);});
  let dialogueWords=0;dialogueParas.forEach(function(p){dialogueWords+=analyticsTokens_(p).length;});
  const dialogueRatio=wordCount?dialogueWords/wordCount:0;
  const action=countRegexHits_(text,['run','ran','rush','strike','struck','attack','fight','fought','slash','slam','grab','dodge','explode','shot','fire','sprint','lari','menyerang','memukul','menebas','menghindar','ledakan','berlari']);
  const exposition=countRegexHits_(text,['because','remembered','history','years','explained','known','once','formerly','sebab','karena','sejarah','tahun','menjelaskan','dahulu']);
  const mystery=countRegexHits_(text,['secret','mystery','unknown','strange','why','who','clue','hidden','mysterious','rahasia','misteri','aneh','mengapa','siapa','petunjuk','tersembunyi']);
  const avgSentence=sentences.length?wordCount/sentences.length:0;
  const actionDensity=wordCount?action/(wordCount/1000):0, expositionDensity=wordCount?exposition/(wordCount/1000):0;
  let pace='BALANCED';if(actionDensity>14||dialogueRatio>0.48||avgSentence<11)pace='FAST';else if(expositionDensity>12||dialogueRatio<0.18||avgSentence>22)pace='SLOW';
  const opening=(paras[0]||text.slice(0,280)).slice(0,320),ending=(paras[paras.length-1]||text.slice(-320)).slice(-320);
  let openingScore=5,endingScore=5;const hookWarnings=[];
  if(/[?!！？]/.test(opening))openingScore++;if(/^[\"“「]/.test(opening))openingScore++;if(countRegexHits_(opening,['blood','scream','door','dead','ran','attack','why','who','darah','teriak','mati','mengapa','siapa'])>0)openingScore++;
  if(/[?!！？]$/.test(ending.trim()))endingScore++;if(countRegexHits_(ending,['but','until','realized','suddenly','secret','truth','however','namun','tiba','menyadari','rahasia','kebenaran'])>0)endingScore+=2;
  if(opening.length<50){openingScore--;hookWarnings.push('Opening sangat pendek.');}if(ending.length<50){endingScore--;hookWarnings.push('Ending sangat pendek.');}
  openingScore=Math.max(1,Math.min(10,openingScore));endingScore=Math.max(1,Math.min(10,endingScore));
  return {
    chapter:Number(chapterNo||0),wordCount:wordCount,charCount:text.length,paragraphCount:paras.length,sentenceCount:sentences.length,
    avgSentenceWords:Number(avgSentence.toFixed(2)),dialogueRatio:Number(dialogueRatio.toFixed(3)),sceneBreaks:(text.match(/^\s*(?:\*{3,}|#{3,}|—{3,})\s*$/gm)||[]).length,
    actionDensity:Number(actionDensity.toFixed(2)),expositionDensity:Number(expositionDensity.toFixed(2)),mysterySignals:mystery,pacingLabel:pace,
    hook:{openingScore:openingScore,endingScore:endingScore,openingType:/^[\"“「]/.test(opening)?'DIALOGUE':(/[?!！？]/.test(opening)?'QUESTION/TENSION':'NARRATIVE'),endingType:/[?!！？]$/.test(ending.trim())?'CLIFF/TENSION':'CLOSE',warnings:hookWarnings},
    openingSnippet:opening,endingSnippet:ending,openingSignature:shortSignature_(opening,false),endingSignature:shortSignature_(ending,true),phraseFingerprint:extractPhraseFingerprint_(text),updatedAt:isoNow_()
  };
}

function chapterMetricRecords_(sh,start,end){
  const rows=getRecordsByType_(sh,'CHAPTER_METRICS');
  return rows.filter(function(r){const n=Number(r.CHAPTER||0);return String(r.STATUS)==='CANON' && (!start||n>=start) && (!end||n<=end);}).sort(function(a,b){return Number(a.CHAPTER)-Number(b.CHAPTER);});
}

function aggregateAnalytics_(novelId){
  const idx=getNovelIndex_(novelId),sh=getNovelSheet_(novelId),rows=chapterMetricRecords_(sh,1,Number(idx.LATEST_CANON||0));
  let words=0,dialogue=0,avgSent=0,openHook=0,endHook=0;const pace={FAST:0,BALANCED:0,SLOW:0},series=[];
  rows.forEach(function(r){const m=r.DATA||{};words+=Number(m.wordCount||0);dialogue+=Number(m.dialogueRatio||0);avgSent+=Number(m.avgSentenceWords||0);openHook+=Number(m.hook&&m.hook.openingScore||0);endHook+=Number(m.hook&&m.hook.endingScore||0);pace[m.pacingLabel||'BALANCED']=Number(pace[m.pacingLabel||'BALANCED']||0)+1;series.push({chapter:Number(r.CHAPTER),words:Number(m.wordCount||0),dialogueRatio:Number(m.dialogueRatio||0),pacing:m.pacingLabel||'BALANCED',openingHook:Number(m.hook&&m.hook.openingScore||0),endingHook:Number(m.hook&&m.hook.endingScore||0)});});
  const n=rows.length||1;
  return {throughChapter:Number(idx.LATEST_CANON||0),metricCoverage:rows.length,totalCanon:Number(idx.LATEST_CANON||0),coveragePct:Number(idx.LATEST_CANON||0)?Math.round(rows.length/Number(idx.LATEST_CANON)*100):0,totalWords:words,avgWords:rows.length?Math.round(words/rows.length):0,avgDialogueRatio:rows.length?Number((dialogue/n).toFixed(3)):0,avgSentenceWords:rows.length?Number((avgSent/n).toFixed(2)):0,avgOpeningHook:rows.length?Number((openHook/n).toFixed(2)):0,avgEndingHook:rows.length?Number((endHook/n).toFixed(2)):0,pacing:pace,series:series,updatedAt:isoNow_()};
}

function buildQualityReport_(novelId){
  const idx=getNovelIndex_(novelId),sh=getNovelSheet_(novelId),rows=chapterMetricRecords_(sh,1,Number(idx.LATEST_CANON||0));
  const phrase={},openSig={},endSig={},weakOpen=[],weakEnd=[];
  rows.forEach(function(r){const m=r.DATA||{},ch=Number(r.CHAPTER);(m.phraseFingerprint||[]).forEach(function(x){const p=String(x.phrase||'');if(!p)return;if(!phrase[p])phrase[p]={phrase:p,chapters:[],count:0};phrase[p].chapters.push(ch);phrase[p].count+=Number(x.count||1);});const os=String(m.openingSignature||'');if(os){openSig[os]=openSig[os]||[];openSig[os].push(ch);}const es=String(m.endingSignature||'');if(es){endSig[es]=endSig[es]||[];endSig[es].push(ch);}if(Number(m.hook&&m.hook.openingScore||0)<5)weakOpen.push(ch);if(Number(m.hook&&m.hook.endingScore||0)<5)weakEnd.push(ch);});
  const repeatedPhrases=Object.keys(phrase).map(function(k){return phrase[k];}).filter(function(x){return x.chapters.length>=3;}).sort(function(a,b){return b.chapters.length-a.chapters.length||b.count-a.count;}).slice(0,15);
  const repeatedOpenings=Object.keys(openSig).filter(function(k){return openSig[k].length>=2;}).map(function(k){return {signature:k,chapters:openSig[k]};}).sort(function(a,b){return b.chapters.length-a.chapters.length;}).slice(0,10);
  const repeatedEndings=Object.keys(endSig).filter(function(k){return endSig[k].length>=2;}).map(function(k){return {signature:k,chapters:endSig[k]};}).sort(function(a,b){return b.chapters.length-a.chapters.length;}).slice(0,10);
  return {repetition:{phrases:repeatedPhrases,repeatedOpenings:repeatedOpenings,repeatedEndings:repeatedEndings},hooks:{weakOpenings:weakOpen,weakEndings:weakEnd},pacing:aggregateAnalytics_(novelId).pacing,contradiction:getNovelRecordData_(sh,'CONTRADICTION_ALARM','LATEST')||{},metricCoverage:rows.length,totalCanon:Number(idx.LATEST_CANON||0),updatedAt:isoNow_()};
}

function buildCanonContradictionAlarm_(sh,memory,latestCanon){
  const items=[];memory=memory||{};latestCanon=Number(latestCanon||0);
  (Array.isArray(memory.continuityWarnings)?memory.continuityWarnings:[]).forEach(function(w){items.push({severity:'WARN',type:'SEMANTIC_CONTINUITY',message:String(w)});});
  const rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,SNF.NOVEL_HEADERS.length).getValues():[];const canon={};
  rows.forEach(function(r){if(String(r[0])==='CHAPTER_SUMMARY'&&String(r[6])==='CANON')canon[Number(r[2])]=1;});
  for(let n=1;n<=latestCanon;n++){if(!canon[n])items.push({severity:'FAIL',type:'MISSING_CANON',chapter:n,message:'Canon sequence missing Chapter '+n+'.'});}
  const chars=memory.characters&&typeof memory.characters==='object'?memory.characters:{};
  Object.keys(chars).forEach(function(k){const c=chars[k]||{},kn=(c.knows||[]).map(function(x){return String(x).trim().toLowerCase();}),dn=(c.doesNotKnow||[]).map(function(x){return String(x).trim().toLowerCase();});kn.forEach(function(x){if(x&&dn.indexOf(x)>=0)items.push({severity:'FAIL',type:'KNOWLEDGE_CONFLICT',character:c.name||k,message:(c.name||k)+' both knows and does not know: '+x});});});
  (Array.isArray(memory.timeline)?memory.timeline:[]).forEach(function(x){const ch=Number(x.chapter||0);if(ch<1||ch>latestCanon)items.push({severity:'WARN',type:'TIMELINE_RANGE',chapter:ch,message:'Timeline entry points outside current Canon range.'});});
  let status='OK';if(items.some(function(x){return x.severity==='FAIL';}))status='FAIL';else if(items.length)status='WARN';
  return {status:status,throughChapter:latestCanon,total:items.length,failCount:items.filter(function(x){return x.severity==='FAIL';}).length,warnCount:items.filter(function(x){return x.severity==='WARN';}).length,items:items.slice(0,100),updatedAt:isoNow_()};
}

function syncCanonContradictionAlarm_(novelId,sh,memory,latestCanon,version){
  const alarm=buildCanonContradictionAlarm_(sh,memory,latestCanon),folders=ensureNovelStudioFolders_(novelId),folder=getFolderByIdSafe_(folders['08_CONTINUITY']);
  const f=upsertTextFile_(folder,'contradiction_alarm_latest.json',JSON.stringify(alarm,null,2));
  upsertNovelRecord_(sh,'CONTRADICTION_ALARM','LATEST',latestCanon,'','Canon Contradiction Alarm',alarm,alarm.status,Number(version||1),f.getId());return alarm;
}

function syncAnalyticsReport_(novelId){
  const sh=getNovelSheet_(novelId),analytics=aggregateAnalytics_(novelId),quality=buildQualityReport_(novelId),folders=ensureNovelStudioFolders_(novelId),folder=getFolderByIdSafe_(folders['15_ANALYTICS']);
  const data={analytics:analytics,quality:quality,updatedAt:isoNow_()},f=upsertTextFile_(folder,'analytics_latest.json',JSON.stringify(data,null,2));
  upsertNovelRecord_(sh,'ANALYTICS_REPORT','LATEST',analytics.throughChapter,'','Novel Analytics',data,'READY',nextRecordVersion_(sh,'ANALYTICS_REPORT','LATEST'),f.getId());return data;
}

function sendQualityReport_(chatId,novelId){
  const q=buildQualityReport_(novelId),a=aggregateAnalytics_(novelId),c=q.contradiction||{};
  sendMessage_(chatId,'🧪 <b>QUALITY INSPECTOR</b>\n━━━━━━━━━━━━━━━━━━\n'+
    'Metrics: <b>'+q.metricCoverage+'/'+q.totalCanon+'</b> chapter\n'+
    'Repeated phrases: <b>'+q.repetition.phrases.length+'</b>\n'+
    'Weak openings: <b>'+q.hooks.weakOpenings.length+'</b>\n'+
    'Weak endings: <b>'+q.hooks.weakEndings.length+'</b>\n'+
    'Pacing: FAST '+Number(a.pacing.FAST||0)+' • BAL '+Number(a.pacing.BALANCED||0)+' • SLOW '+Number(a.pacing.SLOW||0)+'\n'+
    'Contradiction Alarm: <b>'+escapeHtml_(c.status||'N/A')+'</b> ('+Number(c.total||0)+')\n\n'+
    (q.repetition.phrases.slice(0,5).map(function(x){return '🔁 '+escapeHtml_(x.phrase)+' — Ch '+x.chapters.join(', ');}).join('\n')||'Tidak ada repetition lintas chapter yang menonjol.')+
    '\n\nGunakan <code>/analytics refresh</code> jika coverage belum 100%.');
}

function sendNovelAnalytics_(chatId,novelId){
  const a=aggregateAnalytics_(novelId);
  sendMessage_(chatId,'📈 <b>NOVEL ANALYTICS</b>\n━━━━━━━━━━━━━━━━━━\n'+
    'Canon: <b>'+a.totalCanon+'</b>\nMetrics coverage: <b>'+a.metricCoverage+' ('+a.coveragePct+'%)</b>\n'+
    'Total words: <b>'+a.totalWords+'</b>\nAvg words/chapter: <b>'+a.avgWords+'</b>\n'+
    'Avg dialogue: <b>'+Math.round(a.avgDialogueRatio*100)+'%</b>\nAvg sentence: <b>'+a.avgSentenceWords+' words</b>\n'+
    'Hook opening/end: <b>'+a.avgOpeningHook+' / '+a.avgEndingHook+'</b>\n'+
    'Pacing: FAST '+Number(a.pacing.FAST||0)+' • BAL '+Number(a.pacing.BALANCED||0)+' • SLOW '+Number(a.pacing.SLOW||0)+'\n\n'+
    (a.coveragePct<100?'Gunakan <code>/analytics refresh</code> untuk backfill chapter lama.':'✅ Analytics coverage lengkap.'));
}

function analyticsChaptersPerStep_(){return Math.max(1,Math.min(12,Number(prop_('ANALYTICS_CHAPTERS_PER_STEP')||5)));}

function startAnalyticsBackfillJob_(chatId,userId,novelId){
  const idx=getNovelIndex_(novelId),latest=Number(idx&&idx.LATEST_CANON||0);if(!latest)throw new Error('Belum ada Canon.');
  const msg=chatId?sendMessage_(chatId,'📈 <b>ANALYTICS BACKFILL</b>\n\n⏳ Scanning Canon 1–'+latest+'...'):'';
  return createJob_({novelId:novelId,chatId:chatId||'',userId:userId||'',type:'ANALYTICS_BACKFILL',stage:'SCAN',progress:1,status:'QUEUED',messageId:msg||'',data:{startChapter:1,endChapter:latest,nextChapter:1,processed:0,source:'MANUAL'}});
}

function jobAnalyticsBackfill_(job){
  const d=job.DATA||{},sh=getNovelSheet_(job.NOVEL_ID),idx=getNovelIndex_(job.NOVEL_ID);let n=Number(d.nextChapter||1),end=Number(d.endChapter||idx.LATEST_CANON||0),done=Number(d.processed||0),step=0,max=analyticsChaptersPerStep_();
  while(n<=end&&step<max){const r=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));if(r&&String(r.STATUS)==='CANON'&&r.FILE_ID){const text=DriveApp.getFileById(String(r.FILE_ID)).getBlob().getDataAsString('UTF-8'),m=chapterQualityMetrics_(text,n);upsertNovelRecord_(sh,'CHAPTER_METRICS',chapterKey_(n),n,r.ARC||'',r.TITLE||('Chapter '+n),m,'CANON',Number(r.VERSION||1),r.FILE_ID);done++;}n++;step++;}
  const pct=Math.max(2,Math.min(96,Math.round(((n-1)/Math.max(1,end))*96)));updateJobFields_(job.JOB_ID,{STATUS:'RUNNING',PROGRESS:pct,DATA_JSON:JSON.stringify(Object.assign({},d,{nextChapter:n,processed:done}))});
  safeEditMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),'📈 <b>ANALYTICS BACKFILL</b>\n\nChapter '+Math.min(n,end)+' / '+end+'\n'+progressBar_(pct)+' '+pct+'%');
  if(n>end){syncAnalyticsReport_(job.NOVEL_ID);updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'DONE',PROGRESS:100});editMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),'✅ <b>ANALYTICS READY</b>\n\nCoverage diperbarui sampai Chapter '+end+'.');}
}

function publicationMetadataMap_(sh){
  const out={};getRecordsByType_(sh,'PUBLICATION_METADATA').forEach(function(r){out[String(r.KEY||'GENERIC').toLowerCase()]=r.DATA||{};});return out;
}

function normalizePublicationPlatform_(p){
  p=String(p||'generic').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'');
  const allowed=['generic','webnovel','fizzo','scribblehub','royalroad','wattpad','tapas','honeyfeed'];return allowed.indexOf(p)>=0?p:'generic';
}

function startPublicationMetadataJob_(chatId,userId,novelId,platform){
  platform=normalizePublicationPlatform_(platform);const msg=chatId?sendMessage_(chatId,'🏷️ <b>PUBLICATION METADATA</b>\n\n⏳ Building '+escapeHtml_(platform)+' package...'):'';
  return createJob_({novelId:novelId,chatId:chatId||'',userId:userId||'',type:'PUBLICATION_METADATA',stage:'GENERATE',progress:10,status:'QUEUED',messageId:msg||'',data:{platform:platform,source:'MANUAL'}});
}

function jobPublicationMetadata_(job){
  const d=job.DATA||{},platform=normalizePublicationPlatform_(d.platform),sh=getNovelSheet_(job.NOVEL_ID),idx=getNovelIndex_(job.NOVEL_ID);
  const bp=getNovelRecordData_(sh,'BLUEPRINT','MASTER')||{},bible=getNovelRecordData_(sh,'BIBLE','MASTER')||{},memory=getNovelRecordData_(sh,'MEMORY','STORY_MEMORY')||{},lore=getNovelRecordData_(sh,'WORLD_ENCYCLOPEDIA','MASTER')||{};
  const meta=aiJson_('You are a novel publishing metadata editor. Create publication-ready metadata for platform profile "'+platform+'". Do not invent plot facts beyond the supplied material. Do not claim compliance with platform rules; platformNotes are stylistic suggestions only. Return JSON only:\n'+JSON.stringify({platform:platform,title:'string',alternativeTitles:['string'],oneLineHook:'string',shortBlurb:'string',longSynopsis:'string',genres:['string'],tags:['string'],contentWarnings:['string'],targetAudience:'string',sellingPoints:['string'],characterHighlights:['string'],coverBrief:'string',authorNote:'string',platformNotes:['string']})+'\n\nBLUEPRINT:\n'+JSON.stringify(bp)+'\n\nBIBLE:\n'+JSON.stringify(bible)+'\n\nCURRENT STORY MEMORY:\n'+JSON.stringify(memory)+'\n\nLORE:\n'+JSON.stringify(lore));
  meta.platform=platform;meta.generatedAt=isoNow_();const folders=ensureNovelStudioFolders_(job.NOVEL_ID),folder=getFolderByIdSafe_(folders['16_PUBLICATION']),name='publication_metadata_'+platform+'.json',f=upsertTextFile_(folder,name,JSON.stringify(meta,null,2));
  upsertNovelRecord_(sh,'PUBLICATION_METADATA',platform.toUpperCase(),'','','Publication Metadata — '+platform,meta,'READY',nextRecordVersion_(sh,'PUBLICATION_METADATA',platform.toUpperCase()),f.getId());
  updateJobFields_(job.JOB_ID,{STATUS:'DONE',STAGE:'DONE',PROGRESS:100});editMessage_(job.CHAT_ID,Number(job.MESSAGE_ID),'✅ <b>PUBLICATION METADATA READY</b>\n\n'+escapeHtml_(idx.TITLE)+'\nProfile: <b>'+escapeHtml_(platform)+'</b>');
}

function getCanonChapterText_(novelId,chapterNo){
  const sh=getNovelSheet_(novelId),folders=getNovelRecordData_(sh,'META','FOLDERS')||{},id=folders['05_CANON'];if(!id)return '';
  const it=getFolderByIdSafe_(id).getFilesByName('Chapter_'+pad3_(chapterNo)+'_CANON.txt');if(!it.hasNext())return '';return it.next().getBlob().getDataAsString('UTF-8');
}

function diffUnits_(text){return String(text||'').split(/\n\s*\n+/).map(function(x){return x.trim();}).filter(Boolean).slice(0,240);}

function paragraphDiff_(oldText,newText){
  const a=diffUnits_(oldText),b=diffUnits_(newText),n=a.length,m=b.length,dp=[];for(let i=0;i<=n;i++)dp[i]=new Array(m+1).fill(0);
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const blocks=[];let i=0,j=0,add=0,del=0;while(i<n&&j<m){if(a[i]===b[j]){blocks.push({type:'same',text:a[i]});i++;j++;}else if(dp[i+1][j]>=dp[i][j+1]){blocks.push({type:'del',text:a[i++]});del++;}else{blocks.push({type:'add',text:b[j++]});add++;}}while(i<n){blocks.push({type:'del',text:a[i++]});del++;}while(j<m){blocks.push({type:'add',text:b[j++]});add++;}
  return {blocks:blocks,added:add,removed:del,unchanged:blocks.filter(function(x){return x.type==='same';}).length,truncated:String(oldText||'').split(/\n\s*\n+/).length>240||String(newText||'').split(/\n\s*\n+/).length>240};
}

/* ========================================================================== */
/* WEBVIEW STUDIO API                                                         */
/* ========================================================================== */

function webGetStudioData(auth,novelId){
  const user=authWebUser_(auth);
  const idx=assertNovelOwned_(user.USER_ID,novelId);
  const sh=getNovelSheet_(idx.NOVEL_ID);
  return {
    ok:true,
    characters:getNovelRecordData_(sh,'CHARACTER_STATES','GLOBAL')||{},
    plotThreads:getNovelRecordData_(sh,'PLOT_THREADS','GLOBAL')||{},
    foreshadowing:getNovelRecordData_(sh,'FORESHADOWING','GLOBAL')||[],
    timeline:getNovelRecordData_(sh,'TIMELINE','GLOBAL')||[],
    styleLock:getStyleLock_(idx.NOVEL_ID)||null,
    visualBible:getNovelRecordData_(sh,'VISUAL_BIBLE','MASTER')||null,
    canonHealth:getNovelRecordData_(sh,'CANON_HEALTH','LATEST')||null,
    worldEncyclopedia:getNovelRecordData_(sh,'WORLD_ENCYCLOPEDIA','MASTER')||buildWorldEncyclopediaBaseline_(getNovelRecordData_(sh,'BIBLE','MASTER')||{},getNovelRecordData_(sh,'MEMORY','STORY_MEMORY')||{}),
    contradictionAlarm:getNovelRecordData_(sh,'CONTRADICTION_ALARM','LATEST')||null,
    analytics:aggregateAnalytics_(idx.NOVEL_ID),
    quality:buildQualityReport_(idx.NOVEL_ID),
    publicationMetadata:publicationMetadataMap_(sh),
    roadmapCenter:getRoadmapCenterData_(idx.NOVEL_ID),
    translation:translationConfig_(idx.NOVEL_ID),
    snapshots:listSnapshotRecords_(idx.NOVEL_ID).slice(0,20),
    media:webListMediaInternal_(idx.NOVEL_ID),
    ai:webAiStatusObject_()
  };
}

function webListJobs(auth,novelId,limit){
  const user=authWebUser_(auth),sh=getWebUserJobsSheet_(user.USER_ID);
  if(sh.getLastRow()<2)return [];
  const wanted=String(novelId||'').trim().toUpperCase();
  const jobs=sh.getRange(2,1,sh.getLastRow()-1,SNF.JOB_HEADERS.length).getValues()
    .map(function(r){const o=rowObject_(SNF.JOB_HEADERS,r);o.DATA=safeJson_(o.DATA_JSON,{});return o;})
    .filter(function(j){return webCanAccessJob_(user.USER_ID,j)&&(!wanted||String(j.NOVEL_ID||'').toUpperCase()===wanted);});
  jobs.sort(function(a,b){return String(b.UPDATED_AT||b.CREATED_AT||'').localeCompare(String(a.UPDATED_AT||a.CREATED_AT||''));});
  return jobs.slice(0,Math.max(1,Math.min(200,Number(limit||60)))).map(publicJobView_);
}

function webGetJobCounts(auth,novelId){
  const list=webListJobs(auth,novelId||'',200);
  const out={all:list.length,active:0,error:0,completed:0,waiting:0};
  list.forEach(function(j){
    const s=String(j.status||'').toUpperCase();
    if(s==='QUEUED'||s==='RUNNING')out.active++;
    if(s==='WAITING_APPROVAL')out.waiting++;
    if(s==='ERROR'||s==='FAILED')out.error++;
    if(j.isComplete)out.completed++;
  });
  return out;
}

function webRetryJob(auth,jobId){
  const user=authWebUser_(auth);
  const job=getJob_(String(jobId||'').toUpperCase());
  if(!job||!webCanAccessJob_(user.USER_ID,job))throw new Error('Job tidak ditemukan.');
  const result=retryJobById_(job.JOB_ID,false);
  const fresh=getJob_(job.JOB_ID);
  return Object.assign({},result,{job:fresh?publicJobView_(fresh):null});
}

function webDeleteJob(auth,jobId){
  const user=authWebUser_(auth),id=String(jobId||'').trim().toUpperCase();
  const job=getWebJobForUser_(user.USER_ID,id);
  if(!job)throw new Error('Job tidak ditemukan.');
  const s=String(job.STATUS||'').toUpperCase();
  if(s==='QUEUED'||s==='RUNNING')throw new Error('Job masih aktif. Tunggu selesai/error sebelum menghapus history.');

  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000))throw new Error('Worker sedang aktif. Coba beberapa detik lagi.');
  try{
    const sh=getWebUserJobsSheet_(user.USER_ID),row=findRowByFirstCol_(sh,id);
    if(row)sh.deleteRow(row);
    removeWebJobDirectory_(id);
    if(job.NOVEL_ID){
      const idx=getWebNovelIndexForUser_(user.USER_ID,job.NOVEL_ID);
      if(idx&&String(idx.ACTIVE_JOB_ID||'')===id)updateNovelIndexFields_(job.NOVEL_ID,{ACTIVE_JOB_ID:''});
    }
    return {ok:true,jobId:id};
  }finally{lock.releaseLock();}
}

function webClearCompletedJobs(auth,novelId){
  const user=authWebUser_(auth),wanted=String(novelId||'').trim().toUpperCase();
  const done=['DONE','COMPLETED','SUCCESS','APPROVED'];
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('Worker sedang aktif. Coba lagi beberapa detik.');
  try{
    const sh=getWebUserJobsSheet_(user.USER_ID);
    if(sh.getLastRow()<2)return {ok:true,deleted:0};
    const vals=sh.getRange(2,1,sh.getLastRow()-1,SNF.JOB_HEADERS.length).getValues(),rows=[];
    vals.forEach(function(r,i){
      const j=rowObject_(SNF.JOB_HEADERS,r);
      if(!webCanAccessJob_(user.USER_ID,j))return;
      if(wanted&&String(j.NOVEL_ID||'').toUpperCase()!==wanted)return;
      if(done.indexOf(String(j.STATUS||'').toUpperCase())>=0&&Number(j.PROGRESS||0)>=100)rows.push({row:i+2,id:j.JOB_ID});
    });
    rows.sort(function(a,b){return b.row-a.row;}).forEach(function(x){sh.deleteRow(x.row);try{removeWebJobDirectory_(x.id);}catch(_){}});
    return {ok:true,deleted:rows.length};
  }finally{lock.releaseLock();}
}

function webStartWriteRange(auth,novelId,start,end){
  const user=authWebUser_(auth),idx=assertNovelOwned_(user.USER_ID,novelId);
  assertNoRunningPublicJob_(user.USER_ID);reservePublicQuota_(user.USER_ID,0,1);
  const a=Number(start),b=Number(end),next=Number(idx.LATEST_CANON||0)+1,target=Number(idx.TARGET_CHAPTERS||0);
  if(!a||!b||b<a)throw new Error('Range chapter tidak valid.');
  if(a!==next)throw new Error('Write harus mulai dari Chapter '+next+'.');
  if(target&&b>target)throw new Error('Target novel hanya sampai Chapter '+target+'.');
  if(b-a+1>20)throw new Error('Manual Write maksimal 20 chapter per batch. Untuk range panjang gunakan Full Auto Production.');
  const jid=createJob_({novelId:idx.NOVEL_ID,chatId:'',userId:user.USER_ID,type:'GENERATE_BATCH',stage:'GENERATE_CHAPTERS',progress:0,status:'QUEUED',messageId:'',data:{startChapter:a,endChapter:b,nextChapter:a,mode:'draft',reason:'Continue approved canon according to Bible, roadmap, Style Lock and current story memory.',source:'WEB_USER'}});
  updateNovelIndexFields_(idx.NOVEL_ID,{ACTIVE_JOB_ID:jid,STATUS:'GENERATING_CHAPTERS'});
  return {ok:true,jobId:jid,start:a,end:b};
}

function webStartAutoProduction(auth,novelId,start,end){
  const user=authWebUser_(auth),idx=assertNovelOwned_(user.USER_ID,novelId);
  assertNoRunningPublicJob_(user.USER_ID);reservePublicQuota_(user.USER_ID,0,1);
  const a=Number(start),b=Number(end),next=Number(idx.LATEST_CANON||0)+1,target=Number(idx.TARGET_CHAPTERS||0);
  if(!a||!b||b<a||a!==next)throw new Error('Full Auto harus mulai dari Chapter '+next+'.');
  if(target&&b>target)throw new Error('Target novel hanya sampai Chapter '+target+'.');
  const jid=createJob_({novelId:idx.NOVEL_ID,chatId:'',userId:user.USER_ID,type:'AUTO_PRODUCTION',stage:'START_BATCH',progress:1,status:'QUEUED',messageId:'',data:{startChapter:a,endChapter:b,currentStart:a,batchSize:autoProductionBatchSize_(),rewriteAttempts:0,source:'WEB_USER'}});
  updateNovelIndexFields_(idx.NOVEL_ID,{ACTIVE_JOB_ID:jid,STATUS:'AUTO_PRODUCTION'});
  return {ok:true,jobId:jid,start:a,end:b};
}

function webStartTranslation(auth,novelId,start,end,targetCode){
  const user=authWebUser_(auth),idx=assertNovelOwned_(user.USER_ID,novelId);
  const a=Number(start),b=Number(end);
  if(!a||!b||b<a)throw new Error('Range translate tidak valid.');
  const max=Math.max(1,Math.min(2000,Number(prop_('TRANSLATE_MAX_RANGE')||1000)));
  if(b-a+1>max)throw new Error('Range translate maksimum '+max+' chapter/job.');
  const target=normalizeLanguageCode_(targetCode||'id');
  setTranslationTarget_(idx.NOVEL_ID,target);
  const jid=createJob_({novelId:idx.NOVEL_ID,chatId:'',userId:user.USER_ID,type:'TRANSLATE_BATCH',stage:'TRANSLATE',progress:1,status:'QUEUED',messageId:'',data:{startChapter:a,endChapter:b,nextChapter:a,targetCode:target,translated:0,alreadyTranslated:0,skipped:[],requestedCount:b-a+1,source:'WEB_USER'}});
  return {ok:true,jobId:jid,start:a,end:b,targetCode:target};
}

function webStartCanonHealth(auth,novelId,start,end){
  const user=authWebUser_(auth),idx=assertNovelOwned_(user.USER_ID,novelId);
  assertNoRunningPublicJob_(user.USER_ID);reservePublicQuota_(user.USER_ID,0,1);
  const latest=Number(idx.LATEST_CANON||0),a=Number(start||1),b=Number(end||latest);
  if(!latest||a<1||b<a||b>latest)throw new Error('Range Canon Health tidak valid.');
  const jid=createJob_({novelId:idx.NOVEL_ID,chatId:'',userId:user.USER_ID,type:'CANON_HEALTH',stage:'SCAN_CHUNKS',progress:2,status:'QUEUED',messageId:'',data:{startChapter:a,endChapter:b,nextChunkStart:a,chunkSize:healthChunkSize_(),chunkKeys:[],mergeIndex:0,groupKeys:[],source:'WEB_USER'}});
  return {ok:true,jobId:jid};
}

function webStartStyleAnalysis(auth,novelId,instruction){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);
  assertNoRunningPublicJob_(user.USER_ID);reservePublicQuota_(user.USER_ID,0,1);
  const text=String(instruction||'').trim();
  const jid=createJob_({novelId:novelId,chatId:'',userId:user.USER_ID,type:'STYLE_ANALYZE',stage:'ANALYZE',progress:10,status:'QUEUED',messageId:'',data:{mode:text?'custom':'analyze',instruction:text,source:'WEB_USER'}});
  return {ok:true,jobId:jid};
}

function webToggleStyleLock(auth,novelId){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);
  return {ok:true,styleLock:toggleStyleLock_(novelId)};
}

function webStartVisualBible(auth,novelId){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);
  assertNoRunningPublicJob_(user.USER_ID);reservePublicQuota_(user.USER_ID,0,1);
  const jid=createJob_({novelId:novelId,chatId:'',userId:user.USER_ID,type:'VISUAL_BIBLE',stage:'BUILD',progress:5,status:'QUEUED',messageId:'',data:{source:'WEB_USER'}});
  return {ok:true,jobId:jid};
}

function webStartArt(auth,novelId,kind,options){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);
  const opts=options&&typeof options==='object'?options:{};
  kind=String(kind||'').toLowerCase();
  if(['cover','character','chapter'].indexOf(kind)<0)throw new Error('Jenis art tidak valid.');
  const data=Object.assign({kind:kind,source:'WEB_USER'},opts);
  const jid=createJob_({novelId:novelId,chatId:'',userId:user.USER_ID,type:'ART_GENERATE',stage:'GENERATE',progress:5,status:'QUEUED',messageId:'',data:data});
  return {ok:true,jobId:jid};
}

function webCreateSnapshot(auth,novelId){
  const user=authWebUser_(auth);const idx=assertNovelOwned_(user.USER_ID,novelId);
  const sh=getNovelSheet_(novelId),folders=ensureNovelStudioFolders_(novelId),snapRoot=getFolderByIdSafe_(folders['13_SNAPSHOTS']);
  const snapId='SNAP_'+timestampFile_(),sf=snapRoot.createFolder(snapId),canonCopy=sf.createFolder('05_CANON');
  const values=sh.getDataRange().getValues();
  sf.createFile('database.json',JSON.stringify(values,null,2),MimeType.PLAIN_TEXT);
  sf.createFile('index.json',JSON.stringify(idx,null,2),MimeType.PLAIN_TEXT);
  const canonFolder=getFolderByIdSafe_(folders['05_CANON']),it=canonFolder.getFiles();
  while(it.hasNext()){const f=it.next();f.makeCopy(f.getName(),canonCopy);}
  const data={snapshotId:snapId,latestCanon:Number(idx.LATEST_CANON||0),currentChapter:Number(idx.CURRENT_CHAPTER||0),createdAt:isoNow_(),folderId:sf.getId(),url:sf.getUrl()};
  upsertNovelRecord_(sh,'SNAPSHOT',snapId,'','','Snapshot '+snapId,data,'READY',1,sf.getId());
  return {ok:true,snapshot:data};
}

function webRollbackSnapshot(auth,novelId,snapshotId){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);
  const snap=getSnapshotRecord_(novelId,snapshotId);if(!snap)throw new Error('Snapshot tidak ditemukan.');
  const sf=getFolderByIdSafe_(snap.folderId),dbIt=sf.getFilesByName('database.json');if(!dbIt.hasNext())throw new Error('database.json snapshot hilang.');
  const values=JSON.parse(dbIt.next().getBlob().getDataAsString('UTF-8'));
  const sh=getNovelSheet_(novelId);sh.clearContents();if(values.length&&values[0].length)sh.getRange(1,1,values.length,values[0].length).setValues(values);
  const folders=getNovelRecordData_(sh,'META','FOLDERS')||ensureNovelStudioFolders_(novelId),canonFolder=getFolderByIdSafe_(folders['05_CANON']);
  const old=canonFolder.getFiles();while(old.hasNext())old.next().setTrashed(true);
  const snapCanon=getOrCreateChildFolder_(sf,'05_CANON'),it=snapCanon.getFiles();while(it.hasNext()){const f=it.next();f.makeCopy(f.getName(),canonFolder);}
  updateNovelIndexFields_(novelId,{LATEST_CANON:Number(snap.latestCanon||0),CURRENT_CHAPTER:Number(snap.currentChapter||snap.latestCanon||0),STATUS:'ACTIVE',ACTIVE_JOB_ID:''});
  updateNovelJson_(novelId);
  return {ok:true,latestCanon:Number(snap.latestCanon||0)};
}

function webExportNovel(auth,novelId,format){
  const user=authWebUser_(auth);const idx=assertNovelOwned_(user.USER_ID,novelId);
  format=String(format||'txt').toLowerCase();if(['txt','docx','epub'].indexOf(format)<0)throw new Error('Format export tidak valid.');
  const folders=ensureNovelStudioFolders_(novelId),chapters=collectCanonText_(novelId);if(!chapters.length)throw new Error('Belum ada Canon untuk diexport.');
  const base=safeFileName_(idx.TITLE)+'_Canon_1-'+Number(idx.LATEST_CANON||0);let file;
  if(format==='txt'){
    const body=idx.TITLE+'\n\n'+chapters.map(function(c){return 'CHAPTER '+c.chapter+(c.title?(' — '+c.title):'')+'\n\n'+c.text;}).join('\n\n============================================================\n\n');
    file=upsertTextFile_(getFolderByIdSafe_(folders['09_EXPORT/TXT']),base+'.txt',body);
  }else{
    const doc=DocumentApp.create(base+'_TEMP'),b=doc.getBody();b.appendParagraph(idx.TITLE).setHeading(DocumentApp.ParagraphHeading.TITLE);
    chapters.forEach(function(c){b.appendPageBreak();b.appendParagraph('Chapter '+c.chapter+(c.title?(' — '+c.title):'')).setHeading(DocumentApp.ParagraphHeading.HEADING1);String(c.text||'').split(/\n+/).forEach(function(p){if(p.trim())b.appendParagraph(p);});});
    doc.saveAndClose();
    const mime=format==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/epub+zip',ext=format==='docx'?'.docx':'.epub';
    const url='https://www.googleapis.com/drive/v3/files/'+doc.getId()+'/export?mimeType='+encodeURIComponent(mime);
    const res=UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}});file=getFolderByIdSafe_(folders[format==='docx'?'09_EXPORT/DOCX':'09_EXPORT/EPUB']).createFile(res.getBlob().setName(base+ext));DriveApp.getFileById(doc.getId()).setTrashed(true);
  }
  return {ok:true,name:file.getName(),fileId:file.getId(),url:file.getUrl(),format:format};
}


function webStartLoreBuild(auth,novelId){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);assertNoRunningPublicJob_(user.USER_ID);reservePublicQuota_(user.USER_ID,0,1);
  const jid=createJob_({novelId:novelId,chatId:'',userId:user.USER_ID,type:'LORE_BUILD',stage:'BUILD',progress:5,status:'QUEUED',messageId:'',data:{source:'WEB_USER'}});return {ok:true,jobId:jid};
}

function webGetAnalytics(auth,novelId){const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);return {ok:true,analytics:aggregateAnalytics_(novelId),quality:buildQualityReport_(novelId)};}

function webStartAnalyticsBackfill(auth,novelId){
  const user=authWebUser_(auth),idx=assertNovelOwned_(user.USER_ID,novelId),latest=Number(idx.LATEST_CANON||0);if(!latest)throw new Error('Belum ada Canon.');
  const jid=createJob_({novelId:novelId,chatId:'',userId:user.USER_ID,type:'ANALYTICS_BACKFILL',stage:'SCAN',progress:1,status:'QUEUED',messageId:'',data:{startChapter:1,endChapter:latest,nextChapter:1,processed:0,source:'WEB_USER'}});return {ok:true,jobId:jid};
}

function webGetChapterDiff(auth,novelId,chapterNo){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);const n=Number(chapterNo);if(!n)throw new Error('Chapter tidak valid.');
  const sh=getNovelSheet_(novelId),rec=getNovelRecord_(sh,'CHAPTER_SUMMARY',chapterKey_(n));if(!rec||!rec.FILE_ID)throw new Error('Chapter tidak ditemukan.');
  const current=DriveApp.getFileById(String(rec.FILE_ID)).getBlob().getDataAsString('UTF-8'),canon=getCanonChapterText_(novelId,n);
  if(!canon)return {ok:true,chapter:n,title:rec.TITLE||'',hasCanon:false,currentText:current,diff:{blocks:[{type:'add',text:current}],added:1,removed:0,unchanged:0}};
  return {ok:true,chapter:n,title:rec.TITLE||'',hasCanon:true,status:rec.STATUS,version:Number(rec.VERSION||1),diff:paragraphDiff_(canon,current)};
}

function webStartPublicationMetadata(auth,novelId,platform){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);assertNoRunningPublicJob_(user.USER_ID);reservePublicQuota_(user.USER_ID,0,1);platform=normalizePublicationPlatform_(platform);
  const jid=createJob_({novelId:novelId,chatId:'',userId:user.USER_ID,type:'PUBLICATION_METADATA',stage:'GENERATE',progress:10,status:'QUEUED',messageId:'',data:{platform:platform,source:'WEB_USER'}});return {ok:true,jobId:jid,platform:platform};
}


function webStartReRoadmap(auth,novelId,mode,strategy,premise){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);assertNoRunningPublicJob_(user.USER_ID);reservePublicQuota_(user.USER_ID,0,1);
  mode=String(mode||'REALIGN').toUpperCase()==='WHAT_IF'?'WHAT_IF':'REALIGN';strategy=normalizeReRoadmapStrategy_(strategy||'ADAPT');premise=String(premise||'').trim();if(mode==='WHAT_IF'&&premise.length<8)throw new Error('What-if premise terlalu pendek.');
  return startReRoadmapJob_('',user.USER_ID,novelId,mode,strategy,premise);
}
function webGetRoadmapVersion(auth,novelId,id){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);const b=getRoadmapVersionBundle_(novelId,String(id||'').toUpperCase());return {ok:true,meta:b.meta||{},master:b.master||{},analysis:b.analysis||{},diff:b.diff||{},plans:(b.plans||[]).slice(0,1000)};
}
function webActivateReRoadmap(auth,novelId,id){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);return activateAdaptiveRoadmapVersion_(novelId,String(id||'').toUpperCase(),'WEB_USER:'+user.USER_ID);
}
function webSaveReRoadmapAsWhatIf(auth,novelId,id){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);return saveRoadmapCandidateAsSandbox_(novelId,String(id||'').toUpperCase());
}
function webDiscardReRoadmap(auth,novelId,id){
  const user=authWebUser_(auth);assertNovelOwned_(user.USER_ID,novelId);return discardRoadmapVersion_(novelId,String(id||'').toUpperCase());
}

function webAiStatusObject_(){
  const order=aiProviderOrder_(),usage=getAiUsageToday_(),configured={gemini:!!prop_('GEMINI_API_KEY'),openrouter:!!prop_('OPENROUTER_API_KEY'),groq:!!prop_('GROQ_API_KEY'),agnes:!!prop_('AGNES_API_KEY')};
  return {
    mode:aiBudgetMode_(),
    routerMode:aiRouterMode_(),
    router:aiRouterStatusObject_(),
    order:order,
    lastProvider:lastAiProvider_(),
    usage:usage,
    dailyLimit:Number(prop_('AI_DAILY_CALL_LIMIT')||0),
    configured:configured,
    models:{gemini:geminiModel_(),openrouter:openRouterModel_(),groq:groqModel_(),agnes:agnesModel_(),image:imageModel_()}
  };
}

function webGetAiStatus(auth){authWebUser_(auth);return {ok:true,ai:webAiStatusObject_()};}
function webSetAiMode(auth,mode){authWebUser_(auth);throw new Error('AI Budget Mode dikelola server dan tidak dapat diubah oleh akun Web.');}

function webListMediaInternal_(novelId){
  const sh=getNovelSheet_(novelId),folders=getNovelRecordData_(sh,'META','FOLDERS')||{},out=[];
  ['Cover','Characters','Chapters','Promo'].forEach(function(cat){
    const id=folders['12_MEDIA/'+cat];if(!id)return;
    try{const it=getFolderByIdSafe_(id).getFiles();while(it.hasNext()&&out.length<60){const f=it.next();out.push({category:cat,name:f.getName(),fileId:f.getId(),url:f.getUrl(),updatedAt:String(f.getLastUpdated())});}}catch(_){}
  });
  out.sort(function(a,b){return String(b.updatedAt).localeCompare(String(a.updatedAt));});return out.slice(0,60);
}

// Legacy anonymous Public User / Recovery Key flow removed in v4.
// New Web accounts use _WEB_USERS + _WEB_SESSIONS and webRegister/webLogin/webLogout.

function touchWebUser_(userId){
  const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS),row=findRowByFirstCol_(sh,String(userId||'').toUpperCase());
  if(!row)return;
  sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('LAST_SEEN')+1).setValue(isoNow_());
}

function publicSettings_(){
  return {
    maxNovelsPerDay:publicMaxNovelsPerDay_(),
    maxAiJobsPerDay:publicMaxAiJobsPerDay_(),
    maxActiveNovels:publicMaxActiveNovels_(),
    batchSize:defaultBatchSize_(),
    maxTargetChapters:publicMaxTargetChapters_(),
    model:geminiModel_(),
    translateMaxRange:Math.max(1,Math.min(2000,Number(prop_('TRANSLATE_MAX_RANGE')||1000))),
    autoBatchSize:autoProductionBatchSize_(),
    imageModel:imageModel_()
  };
}

function reservePublicQuota_(userId,novelDelta,aiDelta){
  userId=String(userId||'').toUpperCase();novelDelta=Number(novelDelta||0);aiDelta=Number(aiDelta||0);
  const lock=LockService.getScriptLock();lock.waitLock(5000);
  try{
    const sh=getWebRegistrySheet_(SNF.SHEETS.WEB_USERS),row=findRowByFirstCol_(sh,userId);
    if(!row)throw new Error('Web user tidak ditemukan.');
    const u=rowObject_(SNF.WEB_USER_HEADERS,sh.getRange(row,1,1,SNF.WEB_USER_HEADERS.length).getValues()[0]);
    const today=dayKey_();let novels=Number(u.NOVELS_TODAY||0),jobs=Number(u.AI_JOBS_TODAY||0);
    if(String(u.DAY_KEY)!==today){novels=0;jobs=0;}
    if(novelDelta>0){
      const idx=getWebUserIndexSheet_(userId);
      let active=0;
      if(idx.getLastRow()>=2){
        idx.getRange(2,1,idx.getLastRow()-1,SNF.INDEX_HEADERS.length).getValues().forEach(function(r){
          const n=rowObject_(SNF.INDEX_HEADERS,r);if(String(n.STATUS||'')!=='DELETED')active++;
        });
      }
      if(active>=publicMaxActiveNovels_())throw new Error('Batas novel aktif tercapai ('+publicMaxActiveNovels_()+').');
      if(novels+novelDelta>publicMaxNovelsPerDay_())throw new Error('Batas pembuatan novel hari ini tercapai ('+publicMaxNovelsPerDay_()+').');
    }
    if(aiDelta>0&&jobs+aiDelta>publicMaxAiJobsPerDay_())throw new Error('Batas AI job hari ini tercapai ('+publicMaxAiJobsPerDay_()+').');
    novels+=novelDelta;jobs+=aiDelta;
    sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('DAY_KEY')+1).setValue(today);
    sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('NOVELS_TODAY')+1).setValue(novels);
    sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('AI_JOBS_TODAY')+1).setValue(jobs);
    sh.getRange(row,SNF.WEB_USER_HEADERS.indexOf('LAST_SEEN')+1).setValue(isoNow_());
    try{CacheService.getScriptCache().remove('SNF_WEBUSER_'+userId);}catch(_){}
  }finally{lock.releaseLock();}
}

function assertNoRunningPublicJob_(userId){
  userId=String(userId||'').toUpperCase();
  const sh=getWebUserJobsSheet_(userId);if(sh.getLastRow()<2)return;
  const vals=sh.getRange(2,1,sh.getLastRow()-1,SNF.JOB_HEADERS.length).getValues();
  const hit=vals.map(function(r){return rowObject_(SNF.JOB_HEADERS,r);}).find(function(j){
    return webCanAccessJob_(userId,j)&&['QUEUED','RUNNING'].indexOf(String(j.STATUS||''))>=0;
  });
  if(hit)throw new Error('Masih ada proses AI yang berjalan: '+hit.TYPE+' • '+hit.PROGRESS+'%. Buka menu Jobs untuk melihat progresnya.');
}

function assertNovelOwned_(userId,novelId){
  const n=getWebNovelIndexForUser_(String(userId||'').toUpperCase(),String(novelId||'').toUpperCase());
  if(!n)throw new Error('Novel tidak ditemukan atau bukan milik session ini.');
  return n;
}

function ownedJob_(userId,jobId,type){
  const j=getJob_(String(jobId||''));
  if(!j || !webCanAccessJob_(userId,j)) throw new Error('Job tidak ditemukan.');
  if(type && String(j.TYPE)!==String(type)) throw new Error('Tipe job tidak sesuai.');
  if(j.NOVEL_ID) assertNovelOwned_(userId,j.NOVEL_ID);
  return j;
}

function publicJobView_(j){
  const d=j.DATA||safeJson_(j.DATA_JSON,{})||{};
  const status=String(j.STATUS||'').toUpperCase();
  const progress=Number(j.PROGRESS||0);
  const complete=['DONE','COMPLETED','SUCCESS','APPROVED'].indexOf(status)>=0 && progress>=100;
  const out={
    id:j.JOB_ID,
    novelId:j.NOVEL_ID||'',
    type:j.TYPE,
    stage:j.STAGE,
    progress:progress,
    status:status,
    error:j.LAST_ERROR||d._lastAutoRetryError||d._previousError||'',
    createdAt:j.CREATED_AT||'',
    updatedAt:j.UPDATED_AT||'',
    channel:jobChannel_(j),
    retryCount:Number(d._retryCount||0),
    autoRetryCount:Number(d._autoRetryCount||0),
    canRetry:status==='ERROR'||status==='FAILED',
    isComplete:complete
  };
  if(j.TYPE==='BLUEPRINT_EXTRACT'||j.TYPE==='BLUEPRINT_RANDOM'||j.TYPE==='BLUEPRINT_UPDATE') out.blueprint=d.blueprint||null;
  if(j.TYPE==='GENERATE_BATCH'||j.TYPE==='REVIEW_ONLY'){
    out.startChapter=Number(d.startChapter||0);
    out.endChapter=Number(d.endChapter||d.startChapter||0);
    out.nextChapter=Number(d.nextChapter||0);
    out.mode=d.mode|| (j.TYPE==='REVIEW_ONLY'?'review':'draft');
    out.reviewCount=Number(d.reviewCount||0);
  }
  if(['TRANSLATE_BATCH','CANON_HEALTH','AUTO_PRODUCTION'].indexOf(String(j.TYPE))>=0){
    out.startChapter=Number(d.startChapter||0);
    out.endChapter=Number(d.endChapter||d.startChapter||0);
    out.nextChapter=Number(d.nextChapter||d.currentStart||0);
  }
  if(j.TYPE==='TRANSLATE_BATCH')out.targetCode=d.targetCode||'';
  if(j.TYPE==='ART_GENERATE'){out.kind=d.kind||'';out.chapter=Number(d.chapter||0);out.character=d.character||'';}
  out.label=publicStageLabel_(j);
  return out;
}

function publicStageLabel_(j){
  const map={
    EXTRACT:'Understanding your idea',RANDOM:'Creating an original concept',UPDATE:'Improving your blueprint',READY:'Blueprint ready',
    CREATE_WORKSPACE:'Creating private workspace',GENERATE_BIBLE:'Building Novel Bible',GENERATE_MASTER_ROADMAP:'Designing master roadmap',GENERATE_CHAPTER_PLANS:'Planning detailed chapters',BUILD_FOUNDATION_PREVIEW:'Final consistency audit',WAIT_FOUNDATION_APPROVAL:'Waiting for your approval',APPROVED:'Foundation approved',
    GENERATE_CHAPTERS:'Writing chapters',REVIEW_BATCH:'Continuity & quality review',BUILD_BATCH_PREVIEW:'Preparing reading preview',WAIT_BATCH_APPROVAL:'Waiting for chapter approval',
    REVIEW:'Synchronizing chapter with Bible & roadmap',WAIT_REVIEW_ACTION:'Review ready',REVIEW_CLOSED:'Review closed',REWRITE_REQUESTED:'Rewrite requested',
    CANONIZE:'Locking approved chapters as canon',UPDATE_MEMORY:'Updating Novel Brain',COMPLETE:'Finalizing memory',DONE:'Complete',
    TRANSLATE:'Translating canon chapters',SCAN_CHUNKS:'Auditing canon chunks',MERGE_GROUPS:'Merging health findings',FINAL_REPORT:'Building Canon Health report',
    ANALYZE:'Analyzing style',BUILD:'Building Visual Bible',GENERATE:'Generating artwork',START_BATCH:'Starting auto-production batch',WAIT_CHILD:'Waiting for auto writing/review',WAIT_FINALIZE:'Finalizing auto-production batch'
  };
  if(j.TYPE==='GENERATE_BATCH' && j.STAGE==='GENERATE_CHAPTERS'){
    const d=j.DATA||{}, n=Number(d.nextChapter||d.startChapter||0);
    return (d.mode==='revision'?'Rewriting':'Writing')+' Chapter '+n;
  }
  return map[j.STAGE]||String(j.STAGE||'Working');
}

function publicNovelCard_(n){
  return {id:n.NOVEL_ID,title:n.TITLE,status:n.STATUS,currentChapter:Number(n.CURRENT_CHAPTER||0),latestCanon:Number(n.LATEST_CANON||0),targetChapters:Number(n.TARGET_CHAPTERS||0),language:n.LANGUAGE||'',genre:n.GENRE||'',updatedAt:n.UPDATED_AT||'',activeJobId:n.ACTIVE_JOB_ID||''};
}

function publicMaxNovelsPerDay_(){return Math.max(1,Math.min(20,Number(prop_('PUBLIC_MAX_NOVELS_DAY')||2)));}
function publicMaxAiJobsPerDay_(){return Math.max(3,Math.min(200,Number(prop_('PUBLIC_MAX_AI_JOBS_DAY')||20)));}
function publicMaxActiveNovels_(){return Math.max(1,Math.min(20,Number(prop_('PUBLIC_MAX_ACTIVE_NOVELS')||3)));}
function publicMaxTargetChapters_(){return Math.max(10,Math.min(2000,Number(prop_('PUBLIC_MAX_TARGET_CHAPTERS')||500)));}

function randomNovelId_(){
  let id=''; const sh=getSystemSheet_(SNF.SHEETS.INDEX);
  do{id='NVL_'+randomCode_(8);}while(findRowByFirstCol_(sh,id));
  return id;
}
function randomCode_(len){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let out='', bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.getUuid()+Utilities.getUuid());
  for(let i=0;i<len;i++) out+=chars[Math.abs(bytes[i%bytes.length])%chars.length];
  return out;
}
function randomToken_(){return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function normalizeRecovery_(x){return String(x||'').trim().toUpperCase().replace(/\s+/g,'');}
function hashSecret_(s){
  const b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(b).replace(/=+$/,'');
}
function dayKey_(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'Asia/Jakarta','yyyy-MM-dd');}

function getOrCreateChildFolder_(parent,name){
  const it=parent.getFoldersByName(name); return it.hasNext()?it.next():parent.createFolder(name);
}

function notifyAdmins_(html){
  const raw=prop_('ADMIN_USER_IDS'); if(!raw || !prop_('TELEGRAM_BOT_TOKEN')) return;
  raw.split(',').map(function(x){return x.trim();}).filter(Boolean).forEach(function(chat){try{sendMessage_(chat,html);}catch(_){}});
}

/* ========================================================================== */
/* MANUAL DRIVE IMPORT                                                        */
/* ========================================================================== */

/**
 * Import one manually prepared novel folder from NOVEL/ADMIN into the central DB.
 *
 * Example from the Apps Script editor:
 *   importAdminNovelFromDrive('The World That Wept, The Blade That Danced');
 *
 * If the roadmap folder contains multiple candidates, pass the active file:
 *   importAdminNovelFromDrive('The World That Wept, The Blade That Danced', {
 *     activeRoadmapFile: 'roadmap_50_ch_source.txt'
 *   });
 */
function importAdminNovelFromDrive(folderNameOrId, options) {
  ensureCentralDb_();
  const opt = options && typeof options === 'object' ? options : {};
  const root = ensureRootFolder_();
  const adminRoot = getOrCreateChildFolder_(root, 'ADMIN');
  const novelFolder = resolveAdminNovelFolder_(adminRoot, folderNameOrId);
  if (!novelFolder) throw new Error('Folder novel tidak ditemukan di NOVEL/ADMIN: ' + folderNameOrId);

  const existingByFolder = findNovelIndexByFolderId_(novelFolder.getId());
  const novelJson = readJsonFileIfExists_(novelFolder, 'novel.json') || {};
  let novelId = existingByFolder ? String(existingByFolder.NOVEL_ID) : String(novelJson.novelId || '').trim().toUpperCase();
  if (!/^NVL_[A-Z0-9_]+$/.test(novelId)) novelId = nextNovelId_();

  const collision = getNovelIndex_(novelId);
  if (collision && String(collision.FOLDER_ID || '') !== novelFolder.getId()) {
    novelId = nextNovelId_();
  }

  const sh = createNovelSheet_(novelId);
  const folders = ensureManualNovelFolderMap_(novelFolder);
  upsertNovelRecord_(sh, 'META', 'FOLDERS', '', '', '', folders, 'SYSTEM', 1, '');

  // Import any database_seed.csv first. Later normalized records overwrite matching keys.
  importDatabaseSeedIfPresent_(novelFolder, sh);

  const bibleInfo = importManualBibleFolder_(sh, folders['01_BIBLE'], opt);
  importManualCanonMemoryContinuity_(sh, folders);

  let blueprint = getNovelRecordData_(sh, 'BLUEPRINT', 'MASTER') || bibleInfo.blueprint || {};
  blueprint = normalizeImportedBlueprint_(blueprint, novelJson, bibleInfo.bible, novelFolder.getName());
  const bpFile = upsertTextFile_(getFolderByIdSafe_(folders['01_BIBLE']), 'blueprint_imported.json', JSON.stringify(blueprint, null, 2));
  upsertNovelRecord_(sh, 'BLUEPRINT', 'MASTER', '', '', blueprint.title || novelFolder.getName(), blueprint, 'DRAFT', '', bpFile.getId());

  const roadmapInfo = importManualRoadmapSources_(sh, folders['02_ROADMAP'], opt);
  const seededMaster = getNovelRecordData_(sh,'ROADMAP_MASTER','MASTER') || {};
  const seededCh1 = getNovelRecordData_(sh,'ROADMAP_CHAPTER','CH_001') || {};
  const hasSeededRoadmap = Object.keys(seededMaster).length > 0 && Object.keys(seededCh1).length > 0;

  let roadmapResult = {normalized:false, reason:'NO_ROADMAP'};
  if (roadmapInfo.selectedFile) {
    if (roadmapNeedsNormalization_(sh, roadmapInfo.selectedFile, opt)) {
      if (opt.deferAi && hasSeededRoadmap) {
        roadmapResult = {
          normalized:true,
          reused:true,
          sourceFile:'DATABASE_SEED',
          sourceFileId:'',
          targetChapters:Number(seededMaster.targetChapters || blueprint.targetChapters || 0),
          chapterPlansImported:countNovelRecordsByType_(sh,'ROADMAP_CHAPTER'),
          version:Number(getRecordVersion_(sh,'ROADMAP_MASTER','MASTER') || 1)
        };
      } else if (opt.deferAi) {
        roadmapResult = {
          normalized:false,
          reason:'ROADMAP_NEEDS_NORMALIZATION',
          sourceFile:roadmapInfo.selectedFile.getName(),
          targetChapters:Number(blueprint.targetChapters || 0),
          message:'Roadmap ditemukan tetapi belum dinormalisasi. Gunakan /roadmaps lalu /roadmap NOMOR.'
        };
      } else {
        roadmapResult = normalizeImportedRoadmap_(sh, folders['02_ROADMAP'], roadmapInfo.selectedFile, blueprint);
      }
    } else {
      roadmapResult = existingImportedRoadmapResult_(sh, roadmapInfo.selectedFile);
    }
  } else if (hasSeededRoadmap) {
    roadmapResult = {
      normalized:true,
      reused:true,
      sourceFile:'DATABASE_SEED',
      sourceFileId:'',
      targetChapters:Number(seededMaster.targetChapters || blueprint.targetChapters || 0),
      chapterPlansImported:countNovelRecordsByType_(sh,'ROADMAP_CHAPTER'),
      version:Number(getRecordVersion_(sh,'ROADMAP_MASTER','MASTER') || 1)
    };
  } else if (roadmapInfo.candidates.length > 1) {
    roadmapResult = {
      normalized:false,
      reason:'MULTIPLE_ROADMAPS',
      candidates:roadmapInfo.candidates,
      message:'Beberapa roadmap ditemukan. Pilih activeRoadmapFile lalu import ulang.'
    };
  } else if (roadmapInfo.candidates.length === 1 && opt.deferAi) {
    roadmapResult = {
      normalized:false,
      reason:'ROADMAP_NEEDS_NORMALIZATION',
      sourceFile:roadmapInfo.candidates[0],
      message:'Roadmap ditemukan tetapi belum dinormalisasi. Gunakan /roadmaps lalu /roadmap 1.'
    };
  }

  if (roadmapResult.targetChapters && !Number(blueprint.targetChapters || 0)) {
    blueprint.targetChapters = Number(roadmapResult.targetChapters);
    const bpFile2 = upsertTextFile_(getFolderByIdSafe_(folders['01_BIBLE']), 'blueprint_imported.json', JSON.stringify(blueprint, null, 2));
    upsertNovelRecord_(sh, 'BLUEPRINT', 'MASTER', '', '', blueprint.title || novelFolder.getName(), blueprint, 'DRAFT', '', bpFile2.getId());
  }

  const title = String(blueprint.title || novelJson.title || stripNovelIdPrefix_(novelFolder.getName()) || 'Untitled Novel');
  const language = String(blueprint.language || novelJson.language || 'English');
  const genres = Array.isArray(blueprint.genres) ? blueprint.genres.join(', ') : String(blueprint.genre || novelJson.genre || '');
  const target = Number(blueprint.targetChapters || novelJson.targetChapters || roadmapResult.targetChapters || 0);
  const currentChapter = detectCurrentChapterFromSheet_(sh);
  const latestCanon = detectLatestCanonFromSheet_(sh);
  const now = isoNow_();
  const old = getNovelIndex_(novelId);

  let status = 'IMPORTED';
  const hasBibleMaster = !!getNovelRecordData_(sh,'BIBLE','MASTER');
  if (roadmapResult.normalized && hasBibleMaster) status = 'FOUNDATION_IMPORTED';
  else if (roadmapInfo.candidates.length > 1 || roadmapResult.reason === 'ROADMAP_NEEDS_NORMALIZATION') status = 'IMPORTED_NEEDS_ROADMAP';
  else if (!hasBibleMaster) status = 'IMPORTED_NEEDS_BIBLE';

  upsertNovelIndex_({
    NOVEL_ID: novelId,
    TITLE: title,
    SHEET_NAME: novelId,
    FOLDER_ID: novelFolder.getId(),
    STATUS: status,
    CURRENT_CHAPTER: currentChapter,
    LATEST_CANON: latestCanon,
    LANGUAGE: language,
    GENRE: genres,
    TARGET_CHAPTERS: target,
    CREATED_AT: old && old.CREATED_AT ? old.CREATED_AT : (novelJson.createdAt || now),
    UPDATED_AT: now,
    ACTIVE_JOB_ID: '',
    OWNER_ID: 'ADMIN',
    OWNER_TYPE: 'TELEGRAM_ADMIN',
    SOURCE: 'DRIVE_IMPORT',
    DB_ID: getCentralDbId_()
  });

  const mergedNovelJson = Object.assign({}, novelJson, {
    novelId:novelId,
    title:title,
    language:language,
    status:status,
    currentChapter:currentChapter,
    latestCanonChapter:latestCanon,
    targetChapters:target,
    databaseSheet:novelId,
    ownerId:'ADMIN',
    folderId:novelFolder.getId(),
    importedAt:now,
    version:Number(novelJson.version || 1)
  });
  upsertTextFile_(novelFolder, 'novel.json', JSON.stringify(mergedNovelJson, null, 2));

  const result = {
    ok:true,
    novelId:novelId,
    title:title,
    folderId:novelFolder.getId(),
    sheetName:novelId,
    status:status,
    bibleImported:!!bibleInfo.bible,
    roadmap:roadmapResult,
    roadmapCandidates:roadmapInfo.candidates,
    currentChapter:currentChapter,
    latestCanon:latestCanon,
    targetChapters:target
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Scan NOVEL/ADMIN automatically. No title/folder Script Property is required.
 * - New folders are imported into _INDEX and get a novel sheet.
 * - Existing folders are re-synced from Drive.
 * - One unambiguous roadmap is normalized automatically only when new/changed.
 * - Multiple roadmaps are imported as sources and wait for /roadmap selection.
 */
function scanNovelDrive() {
  ensureCentralDb_();
  const root = ensureRootFolder_();
  const adminRoot = getOrCreateChildFolder_(root, 'ADMIN');
  const adminIt = adminRoot.getFolders();
  const results = [];

  while (adminIt.hasNext()) {
    const folder = adminIt.next();
    try {
      const r = importAdminNovelFromDrive(folder.getId(), {deferAi:true, scanMode:true});
      results.push(Object.assign({path:'NOVEL/ADMIN/' + folder.getName()}, r));
    } catch (err) {
      results.push({
        ok:false,
        path:'NOVEL/ADMIN/' + folder.getName(),
        folderId:folder.getId(),
        error:String(err && err.message || err)
      });
    }
  }

  // Public Web App workspaces are normally created/registered by the app itself.
  // We still scan them to detect orphan folders without modifying ownership.
  const publicScan = [];
  const usersIt = root.getFoldersByName('USERS');
  if (usersIt.hasNext()) {
    const usersRoot = usersIt.next();
    const ownerIt = usersRoot.getFolders();
    while (ownerIt.hasNext()) {
      const ownerFolder = ownerIt.next();
      const novelIt = ownerFolder.getFolders();
      while (novelIt.hasNext()) {
        const nf = novelIt.next();
        const idx = findNovelIndexByFolderId_(nf.getId());
        publicScan.push({
          ownerId:ownerFolder.getName(),
          folder:nf.getName(),
          folderId:nf.getId(),
          registered:!!idx,
          novelId:idx ? idx.NOVEL_ID : ''
        });
      }
    }
  }

  const summary = {
    ok:true,
    rootFolderId:root.getId(),
    adminScanned:results.length,
    importedOrSynced:results.filter(function(x){return x.ok;}).length,
    errors:results.filter(function(x){return !x.ok;}).length,
    needsRoadmapSelection:results.filter(function(x){
      return x.ok && x.roadmap && x.roadmap.reason === 'MULTIPLE_ROADMAPS';
    }).length,
    admin:results,
    publicFolders:publicScan,
    orphanPublicFolders:publicScan.filter(function(x){return !x.registered;}).length
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

/** Backward-compatible name. */

function telegramFriendlyError_(err) {
  let msg = String(err && err.message || err || '').trim();
  if (!msg) return 'Terjadi error yang tidak diketahui.';

  // Jangan kirim raw JSON/model output yang sangat panjang ke Telegram.
  if (/Gemini JSON parse gagal/i.test(msg)) {
    return 'Gemini mengembalikan JSON yang tidak lengkap/valid. Detail teknis sudah disimpan di <code>_LOGS</code>.';
  }
  if (/HTTP 429|rate limit|too_many_requests/i.test(msg)) {
    return 'Gemini sedang terkena rate limit. Gunakan <code>/retry JOB_ID</code> setelah quota tersedia atau ganti model.';
  }

  msg = msg.replace(/\s*Output:\s*[\s\S]*$/i, '').trim();
  return escapeHtml_(truncate_(msg, 240));
}

function renderNovelScanReport_(result) {
  const rows = result.admin || [];
  let text =
    '🔄 <b>NOVEL DRIVE SCAN</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📂 Ditemukan     : <b>' + Number(result.adminScanned || 0) + '</b>\n' +
    '✅ Tersinkron    : <b>' + Number(result.importedOrSynced || 0) + '</b>\n' +
    '🟡 Perlu tindakan: <b>' + Number(result.needsRoadmapSelection || 0) + '</b>\n' +
    '❌ Gagal         : <b>' + Number(result.errors || 0) + '</b>';

  rows.slice(0, 12).forEach(function(r){
    text += '\n\n';
    if (!r.ok) {
      text +=
        '❌ <b>' + escapeHtml_(r.title || r.path || r.folder || 'Unknown Novel') + '</b>\n' +
        '└ ' + telegramFriendlyError_(r.error || 'Import/sync gagal.');
      return;
    }

    const needsRoadmap = r.status === 'IMPORTED_NEEDS_ROADMAP' ||
      (r.roadmap && r.roadmap.reason === 'ROADMAP_NEEDS_NORMALIZATION') ||
      (r.roadmapCandidates && r.roadmapCandidates.length > 1);
    const needsBible = r.status === 'IMPORTED_NEEDS_BIBLE';
    const mark = (needsRoadmap || needsBible) ? '🟡' : '✅';

    text += mark + ' <b>' + escapeHtml_(r.title || r.path || r.novelId) + '</b>\n' +
      '├ ID: <code>' + escapeHtml_(r.novelId || '-') + '</code>\n' +
      '├ Canon: <b>' + Number(r.latestCanon || 0) + '</b> / ' + Number(r.targetChapters || 0) + '\n' +
      '└ Status: <code>' + escapeHtml_(r.status || 'IMPORTED') + '</code>';

    if (needsRoadmap) {
      text += '\n   🗺 Roadmap perlu dipilih/dinormalisasi → <code>/use ' + escapeHtml_(r.novelId) + '</code> lalu <code>/roadmaps</code>';
    }
    if (needsBible) {
      text += '\n   📕 Bible masih berupa source mentah; tambahkan <code>novel_bible.json</code> lalu scan ulang.';
    }
  });

  if (rows.length > 12) text += '\n\n… dan <b>' + (rows.length - 12) + '</b> novel lainnya.';
  if (!result.errors && !result.needsRoadmapSelection) text += '\n\n✅ <b>Scan selesai.</b>';
  return text;
}

function sendNovelScanReport_(chatId, result) {
  return sendMessage_(chatId, renderNovelScanReport_(result));
}

function getRoadmapCandidatesForNovel_(novelId) {
  const index = getNovelIndex_(String(novelId || '').trim().toUpperCase());
  if (!index) throw new Error('Novel tidak ditemukan: ' + novelId);
  const sh = getNovelSheet_(index.NOVEL_ID);
  const folders = getNovelRecordData_(sh, 'META', 'FOLDERS') || {};
  if (!folders['02_ROADMAP']) throw new Error('Folder 02_ROADMAP belum terdaftar. Jalankan /scan dulu.');
  const info = importManualRoadmapSources_(sh, folders['02_ROADMAP'], {});
  return {index:index, sheet:sh, folders:folders, candidates:info.candidates || [], selectedName:info.selectedName || ''};
}

function sendRoadmapCandidates_(chatId, novelId) {
  if (!novelId) {
    sendMessage_(chatId,
      '🗺 <b>PILIH NOVEL DULU</b>\n\n' +
      'Gunakan <code>/novels</code>, lalu <code>/use NVL_xxxx</code>.');
    return;
  }

  const x = getRoadmapCandidatesForNovel_(novelId);
  let text =
    '🗺 <b>ROADMAP</b>\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📖 <b>' + escapeHtml_(x.index.TITLE || novelId) + '</b>\n' +
    '🆔 <code>' + escapeHtml_(x.index.NOVEL_ID || novelId) + '</code>';

  if (!x.candidates.length) {
    text += '\n\n❌ Tidak ada roadmap di <code>02_ROADMAP</code>.';
    sendMessage_(chatId, text);
    return;
  }

  text += '\n\n<b>Pilihan:</b>';
  x.candidates.forEach(function(name, i){
    const active = x.selectedName === name;
    text +=
      '\n' + (active ? '✅' : '▫️') + ' <b>' + (i + 1) + '.</b> ' +
      '<code>' + escapeHtml_(name) + '</code>' +
      (active ? '  <b>ACTIVE</b>' : '');
  });

  text +=
    '\n\nPilih dengan <code>/roadmap NOMOR</code>' +
    '\nContoh: <code>/roadmap 2</code>' +
    '\n\n🛣 Untuk menyesuaikan future roadmap dengan Canon aktual: <code>/reroadmap</code>.';

  sendMessage_(chatId, text);
}

function activateRoadmapByNumber_(novelId, choice) {
  const x = getRoadmapCandidatesForNovel_(novelId);
  const n = Number(choice || 0);
  if (!n || n < 1 || n > x.candidates.length) {
    throw new Error('Pilihan roadmap tidak valid. Tersedia 1-' + x.candidates.length + '. Gunakan /roadmaps.');
  }
  const fileName = x.candidates[n-1];
  const result = activateImportedRoadmap(x.index.NOVEL_ID, fileName);

  // Save selection inside the novel itself, so future scans do not need Script Properties.
  const roadmapFolder = getFolderByIdSafe_(x.folders['02_ROADMAP']);
  const status = readJsonFileIfExists_(roadmapFolder, 'roadmap_status.json') || {};
  status.activeRoadmapFile = fileName;
  status.activeRoadmap = fileName;
  status.selectedAt = isoNow_();
  status.selectedBy = 'TELEGRAM_ADMIN';
  upsertTextFile_(roadmapFolder, 'roadmap_status.json', JSON.stringify(status, null, 2));

  return Object.assign({title:x.index.TITLE, sourceFile:fileName}, result);
}

/**
 * Rebuild only the active roadmap in the DB after a manual roadmap file was changed.
 * Example:
 *   activateImportedRoadmap('NVL_0007', 'my_master_roadmap.txt');
 */
function activateImportedRoadmap(novelId, fileName) {
  const index = getNovelIndex_(String(novelId || '').trim().toUpperCase());
  if (!index) throw new Error('Novel tidak ditemukan di _INDEX: ' + novelId);

  const sh = getNovelSheet_(index.NOVEL_ID);
  const folders = getNovelRecordData_(sh,'META','FOLDERS') || {};
  if (!folders['02_ROADMAP']) throw new Error('Folder 02_ROADMAP belum terdaftar. Jalankan /scan dahulu.');

  const folder = getFolderByIdSafe_(folders['02_ROADMAP']);
  const file = getFileByNameExact_(folder,fileName);
  if (!file) throw new Error('File roadmap tidak ditemukan: ' + fileName);

  const bp = getNovelRecordData_(sh,'BLUEPRINT','MASTER') || {};
  const result = roadmapNeedsNormalization_(sh,file,{})
    ? normalizeImportedRoadmap_(sh,folders['02_ROADMAP'],file,bp)
    : existingImportedRoadmapResult_(sh,file);

  if (result.targetChapters && !Number(bp.targetChapters || 0)) {
    bp.targetChapters = Number(result.targetChapters);
    const bpf = upsertTextFile_(getFolderByIdSafe_(folders['01_BIBLE']),'blueprint_imported.json',JSON.stringify(bp,null,2));
    upsertNovelRecord_(sh,'BLUEPRINT','MASTER','','',bp.title || index.TITLE || '',bp,'DRAFT','',bpf.getId());
  }

  updateNovelIndexFields_(index.NOVEL_ID,{
    STATUS:'FOUNDATION_IMPORTED',
    TARGET_CHAPTERS:Number(result.targetChapters || index.TARGET_CHAPTERS || 0)
  });
  Logger.log(JSON.stringify(result,null,2));
  return result;
}

/** Optional no-argument helper. Set IMPORT_NOVEL_FOLDER and optionally IMPORT_ACTIVE_ROADMAP_FILE in Script Properties. */

function resolveAdminNovelFolder_(adminRoot, folderNameOrId) {
  const q = String(folderNameOrId || '').trim();
  if (!q) throw new Error('Nama/ID folder novel kosong.');
  try {
    const byId = DriveApp.getFolderById(q);
    const parents = byId.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === adminRoot.getId()) return byId;
    }
  } catch (_) {}
  const it = adminRoot.getFoldersByName(q);
  if (it.hasNext()) return it.next();
  // Also allow folder names prefixed with NVL_xxx - Title.
  const all = adminRoot.getFolders();
  const lower = q.toLowerCase();
  while (all.hasNext()) {
    const f = all.next();
    const name = f.getName();
    if (name.toLowerCase() === lower || stripNovelIdPrefix_(name).toLowerCase() === lower) return f;
  }
  return null;
}

function stripNovelIdPrefix_(name) {
  return String(name || '').replace(/^NVL_[A-Z0-9_]+\s*-\s*/i, '').trim();
}

function findNovelIndexByFolderId_(folderId) {
  const list = listNovels_();
  for (let i=0;i<list.length;i++) if (String(list[i].FOLDER_ID || '') === String(folderId)) return list[i];
  return null;
}

function ensureManualNovelFolderMap_(novelFolder) {
  const folders = {};
  SNF.FOLDERS.forEach(function(name){
    folders[name] = getOrCreateChildFolder_(novelFolder, name).getId();
  });
  const exp = getFolderByIdSafe_(folders['09_EXPORT']);
  ['TXT','DOCX','EPUB'].forEach(function(n){ folders['09_EXPORT/'+n] = getOrCreateChildFolder_(exp,n).getId(); });
  return folders;
}

function importDatabaseSeedIfPresent_(novelFolder, sh) {
  const f = getFileByNameExact_(novelFolder, 'database_seed.csv');
  if (!f) return 0;
  const rows = Utilities.parseCsv(readDriveFileText_(f));
  if (!rows || rows.length < 2) return 0;
  const h = rows[0].map(function(x){return String(x || '').trim().toUpperCase();});
  let count = 0;
  rows.slice(1).forEach(function(r){
    if (!r || !r.length) return;
    const o = {};
    h.forEach(function(k,i){o[k]=r[i] !== undefined ? r[i] : '';});
    if (!o.TYPE || !o.KEY) return;
    let data = o.DATA_JSON || o.DATA || '';
    let parsed;
    try { parsed = data ? JSON.parse(data) : {}; } catch (_) { parsed = {text:String(data)}; }
    upsertNovelRecord_(sh, o.TYPE, o.KEY, o.CHAPTER || '', o.ARC || '', o.TITLE || '', parsed,
      o.STATUS || 'IMPORTED', Number(o.VERSION || 1), o.FILE_ID || '');
    count++;
  });
  return count;
}

function importManualBibleFolder_(sh, folderId, options) {
  const folder = getFolderByIdSafe_(folderId);
  const files = listReadableFiles_(folder);
  let blueprint = null;
  let bible = null;
  let bibleFileId = '';
  let characters = null;

  files.forEach(function(f){
    const name = f.getName().toLowerCase();
    const text = readDriveFileText_(f);
    const obj = parseJsonMaybe_(text);
    upsertNovelRecord_(sh, 'BIBLE_SOURCE', sourceKeyFromFile_(f), '', '', f.getName(),
      {fileName:f.getName(), mimeType:f.getMimeType(), text:obj ? undefined : text, json:obj || undefined}, 'IMPORTED', '', f.getId());
    if (name === 'blueprint.json' || name === 'blueprint_imported.json') blueprint = obj || blueprint;
    if (name === 'novel_bible.json' || name === 'bible.json') { bible = obj || bible; bibleFileId = f.getId(); }
    if (name === 'characters.json') characters = obj || characters;
  });

  const opt = options || {};
  const existingBible = getNovelRecordData_(sh,'BIBLE','MASTER') || null;

  if (bible) {
    const ver = nextRecordVersion_(sh, 'BIBLE', 'MASTER');
    upsertNovelRecord_(sh, 'BIBLE', 'MASTER', '', '', '', bible, 'DRAFT', ver, bibleFileId);
    importCharacterObject_(sh, characters || bible.characters, ver);
    importNamedArrayRecords_(sh, 'LOCATION', bible.locations, 'LOC_', ver);
    importNamedArrayRecords_(sh, 'FACTION', bible.factions, 'FAC_', ver);
    importProtectedCanon_(sh, bible.protectedCanon, ver);
  } else if (existingBible) {
    bible = existingBible;
  } else if (files.length && !opt.deferAi) {
    const sourceText = files.map(function(f){return 'FILE: '+f.getName()+'\n'+readDriveFileText_(f);}).join('\n\n---\n\n');
    const normalized = geminiJson_(
      'Normalize the following manually authored novel Bible material into one database object. Preserve the author material; do not invent major lore.\n' +
      'Return {"premise":"","themes":[],"tone":[],"pov":"","worldRules":[],"characters":[],"locations":[],"factions":[],"protectedCanon":[],"authorSecrets":[],"styleGuide":{}}.\n\n' +
      sourceText
    );
    const ver = nextRecordVersion_(sh, 'BIBLE', 'MASTER');
    upsertNovelRecord_(sh, 'BIBLE', 'MASTER', '', '', '', normalized, 'DRAFT', ver, '');
    syncBibleRecords_(sh, normalized, ver);
    bible = normalized;
  }
  return {
    blueprint:blueprint,
    bible:bible,
    needsNormalization:!bible && files.length > 0,
    files:files.map(function(f){return f.getName();})
  };
}

function importCharacterObject_(sh, data, ver) {
  if (!data) return;
  if (Array.isArray(data)) {
    data.forEach(function(c,i){
      const key = String(c && (c.id || c.name) || ('CHAR_'+pad3_(i+1))).replace(/[^A-Za-z0-9_\-]/g,'_').toUpperCase();
      upsertNovelRecord_(sh,'CHARACTER',key,'','',c && c.name || key,c || {},'DRAFT',ver,'');
    });
    return;
  }
  if (typeof data === 'object') {
    Object.keys(data).forEach(function(k){
      const c = data[k];
      upsertNovelRecord_(sh,'CHARACTER',String(k).replace(/[^A-Za-z0-9_\-]/g,'_').toUpperCase(),'','',c && c.name || k,c || {},'DRAFT',ver,'');
    });
  }
}

function importNamedArrayRecords_(sh, type, data, prefix, ver) {
  if (!Array.isArray(data)) return;
  data.forEach(function(x,i){
    const key = String(x && (x.id || x.name) || (prefix+pad3_(i+1))).replace(/[^A-Za-z0-9_\-]/g,'_').toUpperCase();
    upsertNovelRecord_(sh,type,key,'','',x && x.name || key,x || {},'DRAFT',ver,'');
  });
}

function importProtectedCanon_(sh, data, ver) {
  if (!data) return;
  const arr = Array.isArray(data) ? data : (Array.isArray(data.rules) ? data.rules : []);
  arr.forEach(function(x,i){
    const obj = typeof x === 'string' ? {rule:x} : x;
    upsertNovelRecord_(sh,'PROTECTED_CANON','PC_'+pad3_(i+1),'','','',obj,'LOCKED',ver,'');
  });
}

function importManualRoadmapSources_(sh, folderId, options) {
  const folder = getFolderByIdSafe_(folderId);
  const files = listReadableFiles_(folder).filter(function(f){
    const n = f.getName().toLowerCase();
    return n.indexOf('readme') < 0 &&
      n.indexOf('imported_active_roadmap_normalized') < 0 &&
      n.indexOf('roadmap_status') < 0;
  });

  const candidates = [];
  files.forEach(function(f){
    const text = readDriveFileText_(f);
    const obj = parseJsonMaybe_(text);
    upsertNovelRecord_(sh, 'ROADMAP_SOURCE', sourceKeyFromFile_(f), '', '', f.getName(),
      {fileName:f.getName(), mimeType:f.getMimeType(), text:obj ? undefined : text, json:obj || undefined},
      'IMPORTED', '', f.getId());
    if (isRoadmapCandidateFile_(f.getName(), obj)) candidates.push(f.getName());
  });

  candidates.sort(function(a,b){ return a.localeCompare(b); });

  const opt = options || {};
  let selectedName = String(opt.activeRoadmapFile || '').trim();

  // Optional file-based selection. This lives inside the novel folder, not Script Properties.
  if (!selectedName) {
    const status = readJsonFileIfExists_(folder, 'roadmap_status.json') || {};
    const fromStatus = status.activeRoadmapFile || status.activeRoadmap || status.selectedRoadmap || status.sourceFile || '';
    if (fromStatus && candidates.indexOf(String(fromStatus)) >= 0) selectedName = String(fromStatus);
  }

  // Automatic selection is safe only when there is one unambiguous source.
  if (!selectedName) {
    const preferred = candidates.filter(function(n){
      return /(^|[_\- ])active[_\- ]?roadmap/i.test(n) || /^master_roadmap/i.test(n);
    });
    if (preferred.length === 1) selectedName = preferred[0];
    else if (candidates.length === 1) selectedName = candidates[0];
  }

  const selectedFile = selectedName ? getFileByNameExact_(folder, selectedName) : null;
  return {candidates:candidates, selectedFile:selectedFile, selectedName:selectedName};
}

function isRoadmapCandidateFile_(name, obj) {
  const n=String(name||'').toLowerCase();
  if (n.indexOf('status')>=0 || n.indexOf('readme')>=0) return false;
  if (n.indexOf('roadmap')>=0 || n.indexOf('chapter_plan')>=0 || n.indexOf('arc_plan')>=0) return true;
  return !!(obj && (obj.arcs || obj.chapters || obj.chapterCount || obj.explicitBeats));
}

function normalizeImportedRoadmap_(sh, folderId, file, blueprint) {
  const folder = getFolderByIdSafe_(folderId);
  const source = readDriveFileText_(file);
  if (!source.trim()) throw new Error('Roadmap kosong: ' + file.getName());

  const targetHint = Number(blueprint.targetChapters || detectTargetChapterCount_(source) || 0);
  const master = geminiJson_(
    'You are importing an AUTHOR-WRITTEN roadmap into Smart Novel Forge. Preserve the source as authoritative. ' +
    'Do not replace its story with a new one. Do not add major plot twists, deaths, romances, factions, or reveals not supported by the source. Normalize structure only.\n\n' +
    'Return JSON: {"title":"","targetChapters":0,"premise":"","endingDirection":"","arcs":[{"arc":1,"title":"","chapters":"1-10","goal":"","conflict":"","emotionalArc":"","requiredEvents":[],"protectedReveals":[]}],"globalRules":[],"sourceFile":"'+escapePrompt_(file.getName())+'"}.\n' +
    (targetHint ? 'Target chapter hint: '+targetHint+'\n' : '') +
    'AUTHOR ROADMAP:\n'+source
  );

  const target = Math.max(1,Number(master.targetChapters || targetHint || detectTargetChapterCount_(source) || 1));
  master.targetChapters = target;
  master.sourceFile = file.getName();
  master.importedFromDrive = true;

  // Build and validate the full replacement first. The current active roadmap is
  // left untouched if Gemini fails midway.
  const chunkSize = Math.max(5,Math.min(30,Number(prop_('ROADMAP_CHUNK_SIZE') || 20)));
  const plans = [];
  for (let start=1; start<=target; start+=chunkSize) {
    const end = Math.min(target,start+chunkSize-1);
    const chunk = geminiJson_(
      'Convert the AUTHOR ROADMAP into per-chapter database plans for chapters '+start+'-'+end+'. ' +
      'The source is authoritative. Do not invent major events. If multiple chapters are grouped, create only minimal connective goals inside that group and mark sourceDerived:true. ' +
      'Every chapter number from '+start+' through '+end+' MUST appear exactly once.\n\n' +
      'Return {"chapters":[{"number":1,"arc":1,"title":"","goal":"","requiredEvents":[],"emotionalBeat":"","characterFocus":[],"continuityRequirements":[],"mustNotReveal":[],"endingState":"","sourceDerived":true}]}.\n\n' +
      'MASTER NORMALIZATION:\n'+JSON.stringify(master)+'\n\nAUTHOR ROADMAP:\n'+source
    );
    const arr = Array.isArray(chunk.chapters) ? chunk.chapters : [];
    const byNo = {};
    arr.forEach(function(c){ byNo[Number(c.number)] = c; });
    const missing = [];
    for (let n=start; n<=end; n++) {
      if (!byNo[n]) missing.push(n);
      else plans.push(byNo[n]);
    }
    if (missing.length) throw new Error('Import roadmap tidak lengkap. Missing chapter: '+missing.join(', '));
  }

  const ver = nextRecordVersion_(sh,'ROADMAP_MASTER','MASTER');
  deleteNovelRecordsByTypes_(sh,['ROADMAP_ARC','ROADMAP_CHAPTER']);
  upsertNovelRecord_(sh,'ROADMAP_MASTER','MASTER','','',master.title || blueprint.title || '',master,'DRAFT',ver,file.getId());
  syncArcRecords_(sh,master,ver);
  plans.forEach(function(c){
    const n=Number(c.number);
    upsertNovelRecord_(sh,'ROADMAP_CHAPTER',chapterKey_(n),n,c.arc||'',c.title||('Chapter '+n),c,'DRAFT',ver,file.getId());
  });

  const normalizedFile = upsertTextFile_(folder,'IMPORTED_ACTIVE_ROADMAP_NORMALIZED_v'+ver+'.json',JSON.stringify(master,null,2));
  const meta = {
    sourceFile:file.getName(),
    sourceFileId:file.getId(),
    fingerprint:roadmapFingerprint_(file),
    targetChapters:target,
    normalizedAt:isoNow_(),
    version:ver
  };
  upsertNovelRecord_(sh,'ROADMAP_IMPORT_META','ACTIVE','','',file.getName(),meta,'SYSTEM',ver,file.getId());

  return {
    normalized:true,
    reused:false,
    sourceFile:file.getName(),
    sourceFileId:file.getId(),
    normalizedFileId:normalizedFile.getId(),
    targetChapters:target,
    chapterPlansImported:plans.length,
    version:ver
  };
}

function roadmapFingerprint_(file) {
  let updated='', size='';
  try { updated = String(file.getLastUpdated().getTime()); } catch (_) {}
  try { size = String(file.getSize()); } catch (_) {}
  return [file.getId(),updated,size].join('|');
}

function roadmapNeedsNormalization_(sh,file,opt) {
  if (opt && opt.force) return true;
  const meta = getNovelRecordData_(sh,'ROADMAP_IMPORT_META','ACTIVE') || {};
  if (!getNovelRecordData_(sh,'ROADMAP_MASTER','MASTER')) return true;
  if (!getNovelRecordData_(sh,'ROADMAP_CHAPTER','CH_001')) return true;
  return String(meta.sourceFileId || '') !== String(file.getId()) ||
    String(meta.fingerprint || '') !== roadmapFingerprint_(file);
}

function existingImportedRoadmapResult_(sh,file) {
  const master = getNovelRecordData_(sh,'ROADMAP_MASTER','MASTER') || {};
  const meta = getNovelRecordData_(sh,'ROADMAP_IMPORT_META','ACTIVE') || {};
  return {
    normalized:true,
    reused:true,
    sourceFile:file.getName(),
    sourceFileId:file.getId(),
    targetChapters:Number(master.targetChapters || meta.targetChapters || 0),
    version:Number(meta.version || getRecordVersion_(sh,'ROADMAP_MASTER','MASTER') || 1)
  };
}

function deleteNovelRecordsByTypes_(sh,types) {
  const wanted = {};
  (types || []).forEach(function(t){ wanted[String(t)] = true; });
  const last = sh.getLastRow();
  if (last < 2) return;
  const vals = sh.getRange(2,1,last-1,1).getValues();
  for (let i=vals.length-1; i>=0; i--) {
    if (wanted[String(vals[i][0] || '')]) sh.deleteRow(i+2);
  }
}

function normalizeImportedBlueprint_(bp, novelJson, bible, folderName) {
  const out = bp && typeof bp === 'object' ? JSON.parse(JSON.stringify(bp)) : {};
  out.title = out.title || novelJson.title || stripNovelIdPrefix_(folderName) || 'Untitled Novel';
  out.language = out.language || novelJson.language || 'English';
  out.targetChapters = Number(out.targetChapters || novelJson.targetChapters || 0);
  if (!Array.isArray(out.genres)) {
    const g = out.genre || novelJson.genre || '';
    out.genres = Array.isArray(g) ? g : String(g).split(',').map(function(x){return x.trim();}).filter(Boolean);
  }
  if (!out.description && bible) out.description = bible.logline || bible.premise || bible.description || '';
  if (!out.pov && bible) out.pov = bible.pov || '';
  if (!out.tone && bible) out.tone = bible.tone || [];
  out.importedFromDrive = true;
  return out;
}

function importManualCanonMemoryContinuity_(sh, folders) {
  // Canon chapter prose stays in Drive. During scan we only bind its FILE_ID to
  // CHAPTER_SUMMARY, avoiding huge Sheet writes and making /scan dramatically faster.
  const canonId = folders['05_CANON'];
  if (canonId) {
    const canonFolder = getFolderByIdSafe_(canonId);
    listReadableFiles_(canonFolder).forEach(function(f){
      const name = f.getName();
      const m = name.match(/^Chapter[_ ]?(\d{1,4})(?:_CANON)?\.(?:txt|md)$/i);
      if (m) {
        const n = Number(m[1]);
        const key = chapterKey_(n);
        const old = getNovelRecord_(sh,'CHAPTER_SUMMARY',key);
        if (old) {
          upsertNovelRecord_(sh,'CHAPTER_SUMMARY',key,n,old.ARC || '',old.TITLE || ('Chapter '+n),
            old.DATA || {},'CANON',Number(old.VERSION || 1),f.getId());
        } else {
          upsertNovelRecord_(sh,'CHAPTER_SUMMARY',key,n,'','Chapter '+n,
            {chapter:n,summary:'',fileName:name,importedCanonFile:true},'CANON',1,f.getId());
        }
        return;
      }

      // Small canon metadata/guardrail files may be indexed normally.
      const lower = name.toLowerCase();
      if (/canon_manifest\.json$/.test(lower) || /guardrail|manifest|protected/.test(lower)) {
        const text = readDriveFileText_(f);
        const obj = parseJsonMaybe_(text);
        upsertNovelRecord_(sh,'CANON_SOURCE',sourceKeyFromFile_(f),'','','',
          obj || {fileName:name,text:text},'IMPORTED','',f.getId());
        if (/canon_manifest\.json$/.test(lower) && obj) {
          upsertNovelRecord_(sh,'CANON_MANIFEST','GLOBAL','','','',obj,'CANON','',f.getId());
        }
      }
    });
  }

  const specs = [
    ['07_MEMORY','MEMORY_SOURCE'],
    ['08_CONTINUITY','CONTINUITY_SOURCE']
  ];
  specs.forEach(function(s){
    const folderId=folders[s[0]]; if(!folderId)return;
    listReadableFiles_(getFolderByIdSafe_(folderId)).forEach(function(f){
      const text=readDriveFileText_(f); const obj=parseJsonMaybe_(text);
      upsertNovelRecord_(sh,s[1],sourceKeyFromFile_(f),'','',f.getName(),obj || {text:text},'IMPORTED','',f.getId());
      const base=f.getName().toLowerCase().replace(/\.[^.]+$/,'');
      if(base==='story_memory' && obj) upsertNovelRecord_(sh,'MEMORY','STORY_MEMORY','','','',obj,'CANON','',f.getId());
      else if(base==='current_story_state' && obj) upsertNovelRecord_(sh,'CURRENT_STORY_STATE','GLOBAL','','','',obj,'CANON','',f.getId());
      else if(base==='character_states' && obj) upsertNovelRecord_(sh,'CHARACTER_STATES','GLOBAL','','','',obj,'CANON','',f.getId());
      else if(base==='timeline' && obj) upsertNovelRecord_(sh,'TIMELINE','GLOBAL','','','',obj,'CANON','',f.getId());
      else if(base==='plot_threads' && obj) upsertNovelRecord_(sh,'PLOT_THREADS','GLOBAL','','','',obj,'CANON','',f.getId());
      else if(base==='foreshadowing' && obj) upsertNovelRecord_(sh,'FORESHADOWING','GLOBAL','','','',obj,'CANON','',f.getId());
      else if(base==='character_knowledge' && obj) upsertNovelRecord_(sh,'CHARACTER_KNOWLEDGE','GLOBAL','','','',obj,'CANON','',f.getId());
      else if(base==='protected_canon' && obj) importProtectedCanon_(sh,obj,nextRecordVersion_(sh,'PROTECTED_CANON','PC_001'));
    });
  });
}

function countNovelRecordsByType_(sh,type) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const vals = sh.getRange(2,1,last-1,1).getValues();
  let count = 0;
  vals.forEach(function(r){ if (String(r[0] || '') === String(type || '')) count++; });
  return count;
}

function listReadableFiles_(folder) {
  const out=[]; const it=folder.getFiles();
  while(it.hasNext()){
    const f=it.next(); const mt=String(f.getMimeType()||''); const n=f.getName().toLowerCase();
    if(mt==='application/vnd.google-apps.document' || mt.indexOf('text/')===0 || /\.(txt|json|md|csv)$/i.test(n)) out.push(f);
  }
  return out;
}

function getFileByNameExact_(folder, name) {
  const it=folder.getFilesByName(String(name||'')); return it.hasNext()?it.next():null;
}

function readJsonFileIfExists_(folder,name) {
  const f=getFileByNameExact_(folder,name); if(!f)return null;
  return parseJsonMaybe_(readDriveFileText_(f));
}

function readDriveFileText_(file) {
  const mt=String(file.getMimeType()||'');
  if(mt==='application/vnd.google-apps.document') return DocumentApp.openById(file.getId()).getBody().getText();
  return file.getBlob().getDataAsString('UTF-8');
}

function parseJsonMaybe_(text) {
  try { return JSON.parse(String(text||'').trim()); } catch (_) { return null; }
}

function sourceKeyFromFile_(file) {
  return 'FILE_'+String(file.getId()).replace(/[^A-Za-z0-9]/g,'').slice(-20).toUpperCase();
}

function detectTargetChapterCount_(text) {
  const s=String(text||''); let max=0; let m;
  const re=/(?:chapter|chapters|ch|bab|babak)\s*(\d{1,4})(?:\s*[–—-]\s*(\d{1,4}))?/gi;
  while((m=re.exec(s))!==null){max=Math.max(max,Number(m[1]||0),Number(m[2]||0));}
  return max;
}

function detectCurrentChapterFromSheet_(sh) {
  const last=sh.getLastRow(); if(last<2)return 0;
  const vals=sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues(); let max=0;
  vals.forEach(function(r){ if(String(r[0])==='CHAPTER_SUMMARY') max=Math.max(max,Number(r[2]||0)); });
  return max;
}

function detectLatestCanonFromSheet_(sh) {
  const last=sh.getLastRow(); if(last<2)return 0;
  const vals=sh.getRange(2,1,last-1,SNF.NOVEL_HEADERS.length).getValues(); let max=0;
  vals.forEach(function(r){ if(String(r[0])==='CHAPTER_SUMMARY' && String(r[6])==='CANON') max=Math.max(max,Number(r[2]||0)); });
  return max;
}

function escapePrompt_(s) {
  return String(s||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n]+/g,' ');
}

/* TEST FUNCTIONS                                                              */
/* ========================================================================== */

function testGeminiConnection() {
  const text = geminiProviderText_(
    'Return exactly this JSON object and nothing else: {"ok":true,"provider":"gemini"}'
  );
  const r = parseJsonLoose_(text);
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

function testAiRouterConnection() {
  const r = aiJson_(
    'Return exactly this JSON object: {"ok":true,"message":"Smart Novel Forge Multi-AI Router connected"}'
  );
  Logger.log(JSON.stringify({
    result:r,
    provider:lastAiProvider_(),
    mode:aiRouterMode_(),
    order:aiProviderOrder_(),
    router:aiRouterStatusObject_()
  }, null, 2));
  return r;
}

function testOpenRouterConnection() {
  const text = openRouterProviderText_(
    'Reply with exactly: OPENROUTER_OK'
  );
  Logger.log(text);
  return text;
}

function testGroqConnection() {
  const text = groqProviderText_(
    'Reply with exactly: GROQ_OK'
  );
  Logger.log(text);
  return text;
}

function testAgnesConnection() {
  const text = agnesProviderText_(
    'Reply with exactly: AGNES_OK'
  );
  Logger.log(text);
  return text;
}

function testTelegramConnection() {
  const admins = prop_('ADMIN_USER_IDS').split(',').map(function(x){return x.trim();}).filter(String);
  if (!admins.length) throw new Error('ADMIN_USER_IDS kosong.');
  const r = sendMessage_(admins[0], '✅ <b>Smart Novel Forge</b>\nTelegram connection OK.');
  Logger.log('message_id=' + r);
  return r;
}

function testDatabaseConnection() {
  const ss = ensureCentralDb_();
  const result = {id:ss.getId(), title:ss.getName(), sheets:ss.getSheets().map(function(s){return s.getName();})};
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runWorkerNow() {
  processSmartNovelForgeJobs();
}

/* ========================================================================== */
/* MISC HELPERS                                                                */
/* ========================================================================== */

function validateRequiredProperties_(){
  ['TELEGRAM_BOT_TOKEN','WEB_APP_URL','WEBHOOK_SECRET','ADMIN_USER_IDS'].forEach(function(k){
    if(!prop_(k))throw new Error('Script Property wajib belum diisi: '+k);
  });

  if (!prop_('GEMINI_API_KEY') &&
      !prop_('OPENROUTER_API_KEY') &&
      !prop_('GROQ_API_KEY') &&
      !prop_('AGNES_API_KEY')) {
    throw new Error(
      'Minimal satu AI API key wajib diisi: GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, atau AGNES_API_KEY.'
    );
  }
}


function ensureWorkerTrigger_(){
  const exists = ScriptApp.getProjectTriggers().some(function(t){
    return t.getHandlerFunction() === 'processSmartNovelForgeJobs';
  });
  if (!exists) ScriptApp.newTrigger('processSmartNovelForgeJobs').timeBased().everyMinutes(1).create();
}

function installWorkerTrigger_(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction()==='processSmartNovelForgeJobs')ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processSmartNovelForgeJobs').timeBased().everyMinutes(1).create();
}

function isAdmin_(userId){
  const raw=prop_('ADMIN_USER_IDS');
  if(!raw)return false;
  return raw.split(',').map(function(x){return x.trim();}).indexOf(String(userId))>=0;
}

function isDuplicateUpdate_(id){
  if(id===undefined||id===null)return false;
  const c=CacheService.getScriptCache();
  const k='tg_update_'+id;
  if(c.get(k))return true;
  // v5.1: 600s -> 3600s. Telegram redeliveries after long outages re-executed
  // non-idempotent commands like /snapshot.
  c.put(k,'1',3600);
  return false;
}

function getCentralDbId_(){return prop_('CENTRAL_DB_ID')||SNF.DEFAULT_DB_ID;}
function geminiModel_(){return prop_('GEMINI_MODEL')||SNF.DEFAULT_MODEL;}
function geminiModels_(){
  const primary=geminiModel_();
  const raw=prop_('GEMINI_FALLBACK_MODELS')||'gemini-3.5-flash-lite,gemini-3.1-flash-lite';
  const out=[primary].concat(raw.split(',').map(function(x){return x.trim();}).filter(Boolean));
  return out.filter(function(x,i){return out.indexOf(x)===i;});
}
function roadmapChunkSize_(){return Math.max(5,Math.min(40,Number(prop_('ROADMAP_CHUNK_SIZE')||20)));}
function defaultBatchSize_(){return Math.max(1,Math.min(10,Number(prop_('DEFAULT_BATCH_SIZE')||5)));}
function defaultWords_(){return Math.max(700,Math.min(6000,Number(prop_('DEFAULT_WORDS')||1800)));}
function prop_(k){return String(PropertiesService.getScriptProperties().getProperty(k)||'').trim();}
function isoNow_(){return new Date().toISOString();}
function timestampFile_(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'Asia/Jakarta','yyyyMMdd_HHmmss');}
function pad2_(n){return ('0'+Number(n)).slice(-2);}
function pad3_(n){return ('00'+Number(n)).slice(-3);}
function chapterKey_(n){return 'CH_'+pad3_(n);}

function nextNovelId_(){
  const novels=listNovels_(); let max=0;
  novels.forEach(function(n){const m=String(n.NOVEL_ID||'').match(/^NVL_(\d+)$/);if(m)max=Math.max(max,Number(m[1]));});
  return 'NVL_'+('0000'+(max+1)).slice(-4);
}

function safeFileName_(s){return String(s||'Untitled').replace(/[\\/:*?"<>|#%{}~]/g,' ').replace(/\s+/g,' ').trim().slice(0,120)||'Untitled';}
function truncate_(s,n){s=String(s==null?'':s);return s.length>n?s.slice(0,n-1)+'…':s;}
function escapeHtml_(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function safeJson_(s,fallback){try{return typeof s==='object'?s:JSON.parse(String(s||''));}catch(_){return fallback;}}
function prettyObject_(o){return JSON.stringify(o||{},null,2);}

function rowObject_(headers,row){const o={};headers.forEach(function(h,i){o[h]=row[i];});return o;}
function findRowByFirstCol_(sh,value){
  const last=sh.getLastRow();if(last<2)return 0;
  const vals=sh.getRange(2,1,last-1,1).getValues();
  for(let i=0;i<vals.length;i++)if(String(vals[i][0])===String(value))return i+2;
  return 0;
}

function log_(level,source,message,data){
  try{getSystemSheet_(SNF.SHEETS.LOGS).appendRow([isoNow_(),level,source,truncate_(message,5000),JSON.stringify(data||{})]);}catch(_){}
}

// v5.1: _LOGS grew unbounded (every job event + retry WARN). Prune rows older
// than 90 days; runs at most once per day per worker execution.
function pruneLogs_(){
  try{
    const cache=CacheService.getScriptCache();
    if(cache.get('SNF_LOG_PRUNE_DAY')===dayKey_())return;
    cache.put('SNF_LOG_PRUNE_DAY',dayKey_(),86400);
    const sh=getSystemSheet_(SNF.SHEETS.LOGS);
    const last=sh.getLastRow();
    if(last<2)return;
    const cutoff=Date.now()-90*86400000;
    const vals=sh.getRange(2,1,last-1,1).getValues();
    const rows=[];
    vals.forEach(function(r,i){
      const t=Date.parse(String(r[0]||''));
      if(t&&t<cutoff)rows.push(i+2);
    });
    // Delete in chunks to stay inside the 6-minute execution budget.
    rows.reverse().slice(0,2000).forEach(function(row){sh.deleteRow(row);});
    if(rows.length)log_('INFO','pruneLogs_','Log lama dihapus.',{deleted:Math.min(rows.length,2000)});
  }catch(_){}
}

/* ========================================================================== */
/* UNIVERSAL JOB RETRY                                                        */
/* ========================================================================== */

/**
 * Public wrapper for Telegram command installer.
 * Apps Script helper functions ending with '_' may not appear in the Run menu.
 */
function setTelegramCommands() {
  return setTelegramCommands_();
}

/**
 * Public retry helper for Apps Script editor.
 * Set Script Property RETRY_JOB_ID = JOB_XXXXXXXXXXXX, then run retryJob().
 */
function retryJob() {
  const jobId = String(prop_('RETRY_JOB_ID') || '').trim().toUpperCase();
  if (!jobId) {
    throw new Error(
      'RETRY_JOB_ID belum diisi di Script Properties. Contoh: JOB_E06A36CA94F1'
    );
  }
  const result = retryJobById_(jobId, true);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Retry one failed job without resetting its stage/progress/checkpoint.
 * DATA_JSON is preserved and receives small retry metadata only.
 */
function retryJobById_(jobId, runNow) {
  jobId = String(jobId || '').trim().toUpperCase();
  if (!jobId) throw new Error('JOB_ID kosong.');

  const job = getJob_(jobId);
  if (!job) throw new Error('Job tidak ditemukan: ' + jobId);

  const status = String(job.STATUS || '').toUpperCase();
  if (['DONE','COMPLETED','SUCCESS','WAITING_APPROVAL'].indexOf(status) >= 0) {
    throw new Error('Job ' + jobId + ' tidak dapat di-retry karena statusnya ' + status + '.');
  }
  if (status !== 'ERROR' && status !== 'FAILED') {
    throw new Error('Job ' + jobId + ' bukan ERROR/FAILED. Status sekarang: ' + (status || '-'));
  }

  const data = job.DATA || safeJson_(job.DATA_JSON, {});
  const retryCount = Number(data._retryCount || 0) + 1;
  data._retryCount = retryCount;
  data._lastRetryAt = isoNow_();
  data._previousError = String(job.LAST_ERROR || data._lastAutoRetryError || '').slice(0, 1200);

  // A manual retry gives this checkpoint a fresh automatic retry budget.
  data._autoRetryCount = 0;
  data._autoRetryKey = '';
  data._autoRetryExhausted = false;
  data._nextRetryAtMs = 0;
  data._nextRetryAt = '';

  updateJobFields_(jobId, {
    STATUS: 'QUEUED',
    LAST_ERROR: '',
    DATA_JSON: JSON.stringify(data)
  });

  log_('INFO', 'retry:' + jobId,
    'Job di-retry dari checkpoint terakhir.', {
      stage: job.STAGE || '',
      progress: Number(job.PROGRESS || 0),
      retryCount: retryCount
    });

  if (runNow !== false) {
    try {
      processSmartNovelForgeJobs();
    } catch (err) {
      log_('ERROR', 'retry-worker:' + jobId,
        String(err && err.stack || err), {});
    }
  }

  const fresh = getJob_(jobId) || job;
  return {
    ok: true,
    jobId: jobId,
    previousStatus: status,
    currentStatus: String(fresh.STATUS || 'QUEUED'),
    stage: String(fresh.STAGE || job.STAGE || ''),
    progress: Number(fresh.PROGRESS || job.PROGRESS || 0),
    retryCount: retryCount
  };
}

/**
 * Public Apps Script function.
 * Queues every ERROR/FAILED job, then starts one worker pass.
 */
function retryAllFailedJobs(runWorker){
  const sh=getSystemSheet_(SNF.SHEETS.JOBS);
  if(sh.getLastRow()<2)return {ok:true,retried:0,failed:0,jobs:[]};
  const failed=sh.getRange(2,1,sh.getLastRow()-1,SNF.JOB_HEADERS.length).getValues()
    .map(function(r){const o=rowObject_(SNF.JOB_HEADERS,r);o.DATA=safeJson_(o.DATA_JSON,{});return o;})
    .filter(function(j){const s=String(j.STATUS||'').toUpperCase();return jobChannel_(j)==='TELEGRAM'&&jobOwnerType_(j)==='TELEGRAM_ADMIN'&&(s==='ERROR'||s==='FAILED');});
  const results=[];failed.forEach(function(j){try{results.push(retryJobById_(j.JOB_ID,false));}catch(err){results.push({ok:false,jobId:j.JOB_ID,error:String(err&&err.message||err)});}});
  const out={ok:true,retried:results.filter(function(x){return x.ok;}).length,failed:results.filter(function(x){return !x.ok;}).length,jobs:results};
  if(runWorker!==false&&out.retried){try{processSmartNovelForgeJobs();}catch(_){}}
  return out;
}

/**
 * Public no-argument wrapper for Apps Script dropdown.
 * Reads:
 *   IMPORT_NOVEL_FOLDER
 *   IMPORT_ACTIVE_ROADMAP_FILE
 * from Script Properties.
 *
 * Safe behavior:
 * - If the novel is already registered in _INDEX, rebuild only its active roadmap.
 * - If it is not registered yet, import the novel first and activate the configured roadmap.
 */

/** Public dropdown helper: scan NOVEL root and sync admin novels. */
function scanNovels() {
  return scanNovelDrive();
}
