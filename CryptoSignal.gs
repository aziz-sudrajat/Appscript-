/**
 * AZZATSSINS — Crypto Auto Signal Bot (Google Apps Script)
 * ==========================================================
 * SINGLE-FILE BUILD — gabungan dari 8 modul:
 *   Config | Data | Signal | Patterns | Gate | Post | Track | Bot
 *
 * CARA PAKAI: copy SELURUH isi file ini ke 1 file Code.gs di Apps Script editor.
 * Semua API key/token dibaca dari Script Properties — TIDAK ADA secret di file ini.
 * Hasil audit 2026-10-10: tidak ada token, API key, URL deployment, atau chat ID
 * yang hardcoded. (Satu temuan fungsi hilang saat porting — aiGenerateText_ —
 * sudah di-restore sebagai wrapper ke pool Gemini.)
 *
 * Setup: 1) setupBot  2) applyTuning  3) deploy Web App (/exec)  4) checkWebhook
 */

/* ==================================================================
 * SECTION: Config.gs  (0 functions)
 * ================================================================== */

/**
 * Config.gs — AZZATSSINS crypto signal bot (remake, crypto-only).
 */

const CFG = Object.freeze({
  TZ: 'Asia/Jakarta',
  WEB_APP_URL: '',
  TELEGRAM_CHANNEL_ID: '-1003923510939',
  TELEGRAM_CHANNEL_AUTOPOST_ENABLED: true,
  THREADS_API_BASE: 'https://graph.threads.net/v1.0',
  THREADS_MAX_CHARS: 480,
  BINANCE_SQUARE_API_URL: 'https://www.binance.com/bapi/composite/v1/public/pgc/openApi/content/add',
  BINANCE_SQUARE_MAX_CHARS: 900,
  BINANCE_SQUARE_API_V2: 'https://www.binance.com/bapi/composite/v2/public/pgc/openApi',
  QUICKCHART_RENDER_URL: 'https://quickchart.io/chart',
  QUICKCHART_CREATE_URL: 'https://quickchart.io/chart/create',
  CHART_CANDLES: 72,
  CHART_WIDTH: 1080,
  CHART_HEIGHT: 720,
  CHART_TP_AUTOPOST: true,
  GEMINI_MODEL: 'gemini-2.5-flash', // v13.6: 'gemini-3.8-flash' is not a valid model id
  // v11.1: authorized multi-key Gemini failover pool.
  GEMINI_POOL_MAX_KEYS: 4,
  GEMINI_ROLLING_MODE: 'FAILOVER', // FAILOVER = keep healthy key; ROUND_ROBIN = rotate every success.
  GEMINI_RATE_LIMIT_COOLDOWN_MINUTES: 120,
  GEMINI_TRANSIENT_COOLDOWN_MINUTES: 5,
  GEMINI_TRANSIENT_RETRIES: 2,
  GEMINI_TRANSIENT_RETRY_BASE_MS: 1200,
  GEMINI_ERROR_COOLDOWN_MINUTES: 90,
  GEMINI_AUTH_COOLDOWN_MINUTES: 360,

  DEFAULT_INTERVAL: '15m',
  MTF_CRYPTO_ENABLED: true,
  MTF_SCALP_INTERVAL: '15m',
  MTF_SWING_INTERVAL: '4h',
  MTF_CACHE_SECONDS: 90,

  DERIVATIVES_ENABLED: true,
  DERIVATIVES_CACHE_SECONDS: 120,
  DERIVATIVES_DEFAULT_PERIOD: '4h',
  DERIVATIVES_ORDERBOOK_DEPTH: 200,
  DERIVATIVES_WALL_TOP_N: 5,
  DERIVATIVES_SCORE_ENABLED: true,
  DERIVATIVES_MTF_ENRICH_ENABLED: true,
  DERIVATIVES_LIQ_LEVELS: [0.006,0.010,0.016,0.025,0.040],
  DERIVATIVES_TRY_BINANCE_BYBIT: false,
  DERIVATIVES_GEO_BLOCK_COOLDOWN_HOURS: 12,
  DERIVATIVES_ADVANCED_HISTORY_POINTS: 12,
  DERIVATIVES_LIQ_SPIKE_THRESHOLD: 3.0,
  DERIVATIVES_HEATMAP_SYMBOLS: ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','SUIUSDT','PEPEUSDT','BNBUSDT'],
  DERIVATIVES_HEATMAP_LIMIT: 8,
  DERIVATIVES_HEATMAP_CACHE_SECONDS: 300,

  // v13.6 — pre-publish deep check gate (DeepCheck.gs + Patterns.gs).
  DEEPCHECK_ENABLED: true,
  HOOK_IMAGE_ENABLED: true, // gambar 1 tiap post = AI hook via Agnes (AI_KEY_AGNES)
  DEEPCHECK_FAIL_OPEN: true, // if the gate itself errors, let the post through (logged)
  PATTERN_MIN_CONFIDENCE: 55,
  PATTERN_VETO_ENABLED: true,
  NEWS_SENTIMENT_VETO_ENABLED: true,
  NEWS_LOOKBACK_HOURS: 6,
  NEWS_SENTIMENT_MAX_ITEMS: 8,
  DERIV_LEVERAGE_RISK_VETO: 90,
  DERIV_FUNDING_EXTREME: 0.001,
  DERIV_SQUEEZE_RISK_VETO: 85,
  DERIV_TOP_TRADER_VETO_LONG: 35,
  LIQ_WALL_VETO_DISTANCE_PCT: 0.5,
  LIQ_WALL_MIN_NOTIONAL_USD: 250000,

  // v13.7 — bullish-only + 15m/30m MTF confirmation filter (replaces 15m+4H dual post).
  BULLISH_ONLY: true,
  MTF_CONFIRM_INTERVAL: '30m',
  MTF_CONFIRM_REQUIRED: true,
  MTF_CONFIRM_TOP_N: 8,
  MTF_DUAL_POST_ENABLED: false,

  // v13.9 — balanced mode: more signals, tiered quality (hard vetoes -> score penalties).
  MTF_CONFIRM_MODE: 'LEAN', // STRICT = 30m must be BULLISH WATCH; LEAN = 30m not bearish + bullish lean
  MIN_QUALITY_TO_POST: 55, // holistic bar: quality = 40 + strength*10 + deep-check delta
  PATTERN_VETO_CONFIDENCE: 85, // (was 70)
  DERIV_TOP_TRADER_EXTREME_LONG: 25, // hard veto only when this extreme
  LIQ_WALL_WARN_DISTANCE_PCT: 1.0, // penalty zone (veto only < 0.5%)
  AUTO_TIMEFRAME: '15m',
  KLINES_LIMIT: 220,
  SIGNAL_MIN_SCORE: 5,
  AUTO_MIN_STRENGTH: 3,
  AUTO_SCAN_MINUTES: 10,
  AUTO_POST_MINUTES: 45,
  COIN_COOLDOWN_MINUTES: 120,
  // --- Signal quality upgrades (2026-10-09) ---
  MIN_24H_VOLUME_USD: 2000000, // coin di bawah volume ini dicoret dari universe
  H1_TREND_BONUS: 8,           // bonus quality bila trend 1h bullish selaras
  H1_TREND_PENALTY: 10,        // penalti bila trend 1h bearish berlawanan
  HIGH_CONVICTION_MIN_QUALITY: 80, // badge HIGH CONVICTION
  FRESHNESS_MAX_DRIFT_PCT: 0.4, // batalkan post bila harga lari >x% dari entry
  BTC_DUMP_WARN_PCT: 2,   // BTC turun >x%/1h -> penalti semua signal LONG
  BTC_DUMP_VETO_PCT: 3,   // BTC turun >x%/1h -> veto (circuit breaker)
  BTC_DUMP_PENALTY: 15,   // besar penalti quality saat BTC lemah
  HOUR_STATS_MIN_N: 10,   // min sampel per jam utk hour-boost aktif
  HOUR_BOOST: 5,
  MTF_CONFIRM_4H_ENABLED: true, // konfirmasi kedua: analisa 4h (soft scoring)
  MTF_CONFIRM_4H_BOOST: 6,     // bonus bila 4h bullish
  MTF_CONFIRM_4H_PENALTY: 10,
  STABLECOINS: ['USDT','USDC','DAI','USDG','FDUSD','TUSD','USDP','PYUSD','USDE','USTC','LUSD','FRAX','GUSD','BUSD','EURI','XAUT'],
  PROGRESS_DIGEST_HOURS: 4, // rekap progres signal aktif ke admin tiap N jam
  ACTIVE_SCAN_LIMIT: 100,

  COIN_PAGE_SIZE: 18,

  ATR_PERIOD: 14,
  SWING_LOOKBACK: 12,
  ENTRY_MAX_PULLBACK_ATR: 0.50,
  ENTRY_ZONE_ATR: 0.10,
  STOP_ATR_MIN: 1.25,
  STOP_ATR_MAX: 2.00,
  TP1_RR: 1.50,
  TP2_RR: 2.25,
  TP3_RR: 3.00,

  DEFAULT_FAVORITES: ['BTCUSDT','ETHUSDT','SOLUSDT','SUIUSDT','AVAXUSDT','WLDUSDT','DOGEUSDT','PEPEUSDT'],


  // Public-page only: no login, cookie, paywall bypass, or private endpoint.



  // v13.1 — X publisher. Credentials live in one programmatically-created
  // X_AUTH_JSON Script Property; do not hardcode secrets in source.
  X_API_BASE: 'https://api.x.com/2',
  X_MAX_CHARS: 280,
  X_PUBLISHER_ENABLED: false,
  X_AUTO_SIGNAL_ENABLED: true,
  X_AUTO_TP_ENABLED: true,
  X_MANUAL_MIRROR_ENABLED: true,
  X_CRYPTO_ENABLED: true,
  X_TP_STANDALONE_IF_NO_ROOT: true,

  HEALTH_CACHE_MINUTES: 30,
  SIGNAL_LIFECYCLE_MAX_ACTIVE: 30,
  CRYPTO_SIGNAL_EXPIRY_HOURS: 24,
  NEWS_CHECK_MINUTES: 30,
  NEWS_MIN_SCORE: 80,
  NEWS_MIN_SOURCES: 2,
  NEWS_POST_COOLDOWN_MINUTES: 180,
  NEWS_MAX_POSTS_PER_DAY: 3,
  BACKTEST_STEP_HOURS: 6,

  WEB_CACHE_SECONDS: 120,
  WEB_SIGNAL_LIMIT: 120,
  WEB_NEWS_LIMIT: 60,
  THREADS_INSIGHTS_REFRESH_MINUTES: 60,
  THREADS_INSIGHTS_BATCH_SIZE: 10,
  THREADS_INSIGHTS_MAX_AGE_DAYS: 30,

  // v10.5: quiet strength tracking + more reliable TP lifecycle monitoring.
  SIGNAL_STRENGTH_ALERTS_ENABLED: false,
  LIFECYCLE_BAR_LIMIT: 300,
  LIFECYCLE_ERROR_NOTICE_MINUTES: 360,

  // v10.6: one admin-reviewed daily win-rate report for yesterday's posted signals.
  DAILY_WINRATE_REVIEW_ENABLED: true,
  DAILY_WINRATE_REVIEW_HOUR: 8,
  DAILY_WINRATE_NEAR_TP_PCT: 80,
  DAILY_WINRATE_THREADS_POST_ENABLED: true,
  DAILY_WINRATE_TELEGRAM_POST_ENABLED: true,
  DAILY_WINRATE_SQUARE_POST_ENABLED: false,

  // v11.0: platform-specific creator engines.
  PUBLIC_SIGNAL_LANGUAGE: 'EN',

  // Binance Square Creator Engine.
  SQUARE_MODE: 'HIGH',
  SQUARE_QUEUE_BATCH: 2,
  SQUARE_MIN_POST_GAP_MINUTES: 8,
  SQUARE_DUPLICATE_HOURS: 6,
  SQUARE_CAMPAIGN_SCAN_MINUTES: 60,
  SQUARE_CAMPAIGN_AUTO_DISCOVERY: true,
  SQUARE_CAMPAIGN_AUTO_QUEUE: true,
  SQUARE_WRITE_TO_EARN_ENABLED: true,
  SQUARE_NEAR_TP_PCT: 80,
  SQUARE_MARKET_PULSE_MINUTES: 180,
  SQUARE_URGENT_POST_GAP_MINUTES: 2,
  SQUARE_US_POLICY_NEWS_ENABLED: true,
  SQUARE_US_POLICY_NEWS_CHECK_MINUTES: 60,
  SQUARE_US_POLICY_NEWS_POST_COOLDOWN_MINUTES: 360,
  SQUARE_US_POLICY_NEWS_MAX_POSTS_PER_DAY: 2,
  SQUARE_US_POLICY_NEWS_MIN_SCORE: 78,
  SQUARE_MAX_QUEUE: 80,

  // Threads Creator Engine.
  THREADS_TOPIC_TAG_ENABLED: true,
  THREADS_AUTO_FOLLOWUP_ENABLED: false,
  THREADS_REPLY_MONITOR_ENABLED: true,
  THREADS_REPLY_CHECK_MINUTES: 60,
  THREADS_FOLLOWUP_DELAY_MINUTES: 3
});

/**
 * Tracked universe. OKX is the only crypto market-data provider.
 */

/* =========================================================
 * MULTI-AI ROUTER v11.4
 *
 * IMPORTANT:
 * - Because your Script Properties UI is already full, non-Gemini provider
 *   API keys may be pasted directly below.
 * - Do NOT paste keys into Telegram/chat/logs.
 * - Direct source keys are visible in Apps Script version history.
 * - Gemini can keep using the existing 4-key GEMINI_API_KEY pool.
 *
 * Put one or more keys inside the array for each provider:
 *   OPENROUTER: ['sk-or-...']
 *   GROQ:       ['gsk_...']
 * etc.
 * ========================================================= */



const COINS = Object.freeze({
  CORE: [
    'BTCUSDT','ETHUSDT','BNBUSDT','XRPUSDT','SOLUSDT','ADAUSDT','TRXUSDT','DOGEUSDT',
    'LINKUSDT','LTCUSDT','BCHUSDT','XLMUSDT'
  ],
  LAYER1: [
    'BTCUSDT','ETHUSDT','SOLUSDT','SUIUSDT','AVAXUSDT','TONUSDT','NEARUSDT','APTUSDT',
    'SEIUSDT','HBARUSDT','ICPUSDT','ATOMUSDT','DOTUSDT','ALGOUSDT','VETUSDT','ETCUSDT',
    'EGLDUSDT','FILUSDT','KASUSDT','INJUSDT','TIAUSDT'
  ],
  MEME: [
    'DOGEUSDT','SHIBUSDT','PEPEUSDT','BONKUSDT','WIFUSDT','FLOKIUSDT','BRETTUSDT',
    'PUMPUSDT','TRUMPUSDT','SPXUSDT','MOGUSDT','BABYDOGEUSDT','TURBOUSDT','PNUTUSDT',
    'POPCATUSDT','MEWUSDT','BOMEUSDT','FARTCOINUSDT'
  ],
  AI: [
    'WLDUSDT','TAOUSDT','RENDERUSDT','FETUSDT','VIRTUALUSDT','GRTUSDT','ARKMUSDT',
    'AIXBTUSDT','KAITOUSDT','ATHUSDT','IOUSDT','AKTUSDT','NEARUSDT'
  ],
  DEFI: [
    'AAVEUSDT','UNIUSDT','ONDOUSDT','ENAUSDT','JUPUSDT','PENDLEUSDT','CRVUSDT',
    'LDOUSDT','RUNEUSDT','COMPUSDT','SNXUSDT','DYDXUSDT','1INCHUSDT','CAKEUSDT',
    'GMXUSDT','SUSHIUSDT','MKRUSDT'
  ],
  LAYER2: [
    'ARBUSDT','OPUSDT','STRKUSDT','ZKUSDT','MNTUSDT','IMXUSDT','POLUSDT','STXUSDT',
    'METISUSDT','ZROUSDT'
  ],
  ALT: [
    'WLDUSDT','ONDOUSDT','ENAUSDT','JUPUSDT','INJUSDT','RENDERUSDT','FETUSDT','TAOUSDT',
    'THETAUSDT','ARUSDT','GALAUSDT','SANDUSDT','MANAUSDT','AXSUSDT','FLOWUSDT',
    'CHZUSDT','QNTUSDT','XTZUSDT','IOTAUSDT','NEOUSDT','ZECUSDT','DASHUSDT'
  ]
});


/**
 * IDX tracked universe. Symbols are stored without the .JK suffix.
 * AUTO screening only uses IDX_STOCKS.LIQUID + favorites, while all
 * categories remain available for manual analysis from Telegram.
 */

/* ==================================================================
 * SECTION: Data.gs  (63 functions)
 * ================================================================== */

/**
 * Data.gs — market data: OKX candles, derivatives, liquidity, news, universe sweep.
 */

function fetchJson_(url, options) {
  const res = UrlFetchApp.fetch(url, options || {});
  const raw = res.getContentText();
  const body = safeJsonParse_(raw);
  if (body) return body;
  return { ok:false, http_code:res.getResponseCode(), raw:raw.slice(0,1000) };
}



function marketHeaders_() {
  return { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 GAS-Crypto-Signal-Bot-v7.1' };
}


/* =========================================================
 * IDX YAHOO DATA + MULTI-TIMEFRAME SCANNER
 * ========================================================= */



function toQuery_(obj) {
  return Object.keys(obj).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])); }).join('&');
}



function safeJsonParse_(s) {
  try { return JSON.parse(String(s || '')); } catch (_) { return null; }
}



function errorText_(err) {
  return err && err.message ? err.message : String(err || 'Unknown error');
}



function getKlinesWithProvider_(symbol, interval, limit) {
  try {
    const c = getOkxClosedKlines_(symbol, interval, limit);
    if (c.length >= 80) return { candles:c, provider:'OKX' };
    throw new Error('candle hanya ' + c.length);
  } catch (err) {
    throw new Error('Market data OKX gagal untuk ' + symbol + '\n' + errorText_(err));
  }
}



function getOkxClosedKlines_(symbol, interval, limit) {
  const inst = okxInstrumentId_(symbol);
  const bar = okxInterval_(interval);
  if (!inst || !bar) throw new Error('Mapping OKX tidak tersedia.');

  const requestLimit = Math.min(Math.max(Number(limit) + 2, 80), 300);
  const url = 'https://www.okx.com/api/v5/market/candles?instId=' + encodeURIComponent(inst) +
    '&bar=' + encodeURIComponent(bar) + '&limit=' + requestLimit;
  const res = UrlFetchApp.fetch(url, { method:'get', muteHttpExceptions:true, headers:marketHeaders_() });
  const code = res.getResponseCode();
  const raw = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('OKX HTTP ' + code + ': ' + raw.slice(0, 250));
  const body = safeJsonParse_(raw);
  if (!body || String(body.code) !== '0' || !Array.isArray(body.data)) throw new Error('OKX invalid response.');

  return parseOkxRows_(body.data, interval, limit);
}



function fetchOkxKlinesBatch_(symbols, interval, limit) {
  const bar = okxInterval_(interval);
  if (!bar) return {};

  const result = {};
  const requestLimit = Math.min(Math.max(Number(limit) + 2, 80), 300);
  const valid = symbols.filter(function(symbol) { return !!okxInstrumentId_(symbol); });
  const chunks = chunk_(valid, 12);

  chunks.forEach(function(group, groupIndex) {
    const requests = group.map(function(symbol) {
      return {
        url: 'https://www.okx.com/api/v5/market/candles?instId=' + encodeURIComponent(okxInstrumentId_(symbol)) +
          '&bar=' + encodeURIComponent(bar) + '&limit=' + requestLimit,
        method: 'get',
        muteHttpExceptions: true,
        headers: marketHeaders_()
      };
    });

    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function(res, i) {
      const symbol = group[i];
      try {
        const code = res.getResponseCode();
        const raw = res.getContentText();
        if (code < 200 || code >= 300) throw new Error('HTTP ' + code);
        const body = safeJsonParse_(raw);
        if (!body || String(body.code) !== '0' || !Array.isArray(body.data)) {
          throw new Error('invalid response');
        }
        const candles = parseOkxRows_(body.data, interval, limit);
        if (candles.length < 80) throw new Error('candle ' + candles.length);
        result[symbol] = { candles:candles, provider:'OKX' };
      } catch (err) {
        console.log('Batch OKX gagal ' + symbol + ': ' + errorText_(err));
      }
    });

    if (groupIndex < chunks.length - 1) Utilities.sleep(120);
  });

  return result;
}



function parseOkxRows_(rows, interval, limit) {
  const dur = intervalToMs_(interval);
  return rows.map(function(k) {
    const t = Number(k[0]);
    return {
      openTime:t,
      open:Number(k[1]),
      high:Number(k[2]),
      low:Number(k[3]),
      close:Number(k[4]),
      volume:Number(k[5]),
      closeTime:t + dur - 1,
      confirmed:String(k[8]) === '1'
    };
  }).filter(function(c) {
    return c.confirmed && isFinite(c.openTime) && isFinite(c.close);
  }).sort(function(a, b) {
    return a.openTime - b.openTime;
  }).slice(-limit);
}



function okxInterval_(interval) {
  return ({ '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','6h':'6Hutc','12h':'12Hutc','1d':'1Dutc' })[interval] || null;
}



function okxInstrumentId_(symbol) {
  const s = normalizeSymbol_(symbol);
  if (/^[A-Z0-9]+USDT$/.test(s)) return s.slice(0, -4) + '-USDT';
  if (/^[A-Z0-9]+USDC$/.test(s)) return s.slice(0, -4) + '-USDC';
  return null;
}



function intervalToMs_(interval) {
  const m = { '1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'12h':43200000,'1d':86400000 };
  if (!m[interval]) throw new Error('Interval tidak dikenal: ' + interval);
  return m[interval];
}



function aggregateCandles_(candles, factor, limit) {
  factor = Math.max(1, Number(factor) || 1);
  if (factor <= 1) return candles.slice(-(limit || candles.length));
  var out = [];
  for (var i = 0; i < candles.length; i += factor) {
    var slice = candles.slice(i, i + factor);
    if (slice.length < factor) break;
    var first = slice[0], last = slice[slice.length - 1];
    var high = Math.max.apply(null, slice.map(function(c){ return Number(c.high); }));
    var low = Math.min.apply(null, slice.map(function(c){ return Number(c.low); }));
    var volume = slice.reduce(function(sum, c){ return sum + Number(c.volume || 0); }, 0);
    out.push({
      openTime: first.openTime,
      open: Number(first.open),
      high: high,
      low: low,
      close: Number(last.close),
      volume: volume,
      closeTime: last.closeTime
    });
  }
  return out.slice(-(limit || out.length));
}



function derivBase_(symbol) {
  return normalizeDerivativesSymbol_(symbol).replace(/USDT$/,'');
}



function derivSafe_(fn) {
  try { return {ok:true,data:fn()}; } catch(e) { return {ok:false,error:errorText_(e)}; }
}



function derivFetchProviderJson_(provider, url, label) {
  provider = String(provider || '').toUpperCase();
  var blocked = derivProviderBlockInfo_(provider);
  if (blocked) throw new Error(provider + ' unavailable from Apps Script region (cooldown).');

  var r = UrlFetchApp.fetch(url, {
    method:'get',
    muteHttpExceptions:true,
    followRedirects:true,
    headers:{'Accept':'application/json','User-Agent':'AZZATSSINS-Trading-Bot/12.0.1'}
  });
  var code = Number(r.getResponseCode());
  var raw = String(r.getContentText() || '');

  if (code < 200 || code >= 300) {
    if (derivLooksGeoBlocked_(code, raw)) {
      derivMarkProviderBlocked_(provider, code, 'regional restriction');
      throw new Error(provider + ' unavailable from Apps Script region (' + code + ').');
    }
    throw new Error((label || provider) + ' HTTP ' + code + ': ' + raw.replace(/\s+/g,' ').slice(0,160));
  }
  var body = safeJsonParse_(raw);
  if (body == null) throw new Error((label || provider) + ' invalid JSON.');
  return body;
}



function derivCached_(key, ttl, fn) {
  var cache = CacheService.getScriptCache();
  var c = cache.get(key);
  if (c) {
    var x = safeJsonParse_(c);
    if (x != null) return x;
  }
  var out = fn();
  try { cache.put(key, JSON.stringify(out), Math.max(30, Math.min(Number(ttl || 120), 3600))); } catch (_) {}
  return out;
}



function derivClamp_(v,min,max) {
  v=Number(v||0); return Math.max(min,Math.min(max,v));
}



function derivCount_(v) {
  v = Number(v || 0);
  if (!isFinite(v)) v = 0;
  return Math.round(v).toLocaleString('en-US');
}



function normalizeDerivativesSymbol_(input) {
  var s = String(input || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!s) s = 'BTCUSDT';
  if (!/USDT$/.test(s)) s += 'USDT';
  return s;
}



function normalizeSymbol_(s) {
  let x = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!x) return '';
  if (!/(USDT|USDC)$/.test(x)) x += 'USDT';
  return x;
}



function getDerivativesSnapshot_(symbol, period, force) {
  symbol=normalizeDerivativesSymbol_(symbol); period=derivPeriod_(period);
  var cache=CacheService.getScriptCache(), key='DERIV_SNAPSHOT_V120_'+symbol+'_'+period;
  if(!force){var c=cache.get(key);if(c){var z=safeJsonParse_(c);if(z)return z;}}

  var out={
    symbol:symbol,period:period,at:Date.now(),
    longShort:[
      derivSafe_(function(){return derivGateLongShort_(symbol,period);}),
      derivSafe_(function(){return derivBitgetLongShort_(symbol,period);})
    ],
    funding:[
      derivSafe_(function(){return derivGateFunding_(symbol);}),
      derivSafe_(function(){return derivBitgetFunding_(symbol);}),
      derivSafe_(function(){return derivOkxFunding_(symbol);})
    ],
    oi:[
      derivSafe_(function(){return derivGateOi_(symbol,period);}),
      derivSafe_(function(){return derivBitgetOi_(symbol);}),
      derivSafe_(function(){return derivOkxOi_(symbol);})
    ],
    taker:derivSafe_(function(){return derivGateTaker_(symbol,period);})
  };

  var ls=out.longShort.filter(function(x){return x.ok;}).map(function(x){return x.data;});
  out.aggregateLong=ls.length?ls.reduce(function(s,x){return s+Number(x.longPct||0);},0)/ls.length:null;
  out.aggregateShort=ls.length?100-out.aggregateLong:null;

  var fs=out.funding.filter(function(x){return x.ok;}).map(function(x){return x.data;});
  out.aggregateFunding=fs.length?fs.reduce(function(s,x){return s+Number(x.rate||0);},0)/fs.length:null;

  var ois=out.oi.filter(function(x){return x.ok&&x.data.changePct!=null;}).map(function(x){return x.data;});
  out.aggregateOiChange=ois.length?ois.reduce(function(s,x){return s+Number(x.changePct||0);},0)/ois.length:null;
  out.score=calculateDerivativesScore_(out);

  try{cache.put(key,JSON.stringify(out),Math.max(30,Number(CFG.DERIVATIVES_CACHE_SECONDS||120)));}catch(_){}
  return out;
}



function getAdvancedDerivativesSnapshot_(symbol, period, force) {
  symbol=normalizeDerivativesSymbol_(symbol); period=derivPeriod_(period);
  var cache=CacheService.getScriptCache(), key='DERIV_ADV_SNAPSHOT_V120_'+symbol+'_'+period;
  if(!force){var c=cache.get(key);if(c){var z=safeJsonParse_(c);if(z)return z;}}
  var base=getDerivativesSnapshot_(symbol,period,force);
  var gate=derivGateAdvanced_(symbol,period,force);
  var multi=derivMultiExchangeDivergence_(symbol,period);
  var walls=derivSafe_(function(){return derivLiquidityWalls_(symbol);});
  var liqMap=derivSafe_(function(){return getEstimatedLiquidationZones_(symbol,period);});

  var out={
    symbol:symbol,period:period,at:Date.now(),
    base:base,gate:gate,multiExchange:multi,
    walls:walls.ok?walls.data:null,
    liquidationMap:liqMap.ok?liqMap.data:null,
    scores:{
      derivatives:Number(base.score&&base.score.value||50),
      smartMoney:Number(gate.derived.smartMoneyScore||50),
      leverageRisk:Number(gate.derived.leverageRiskIndex||0),
      squeezeRisk:Math.max(Number(gate.derived.longSqueezeRisk||0),Number(gate.derived.shortSqueezeRisk||0)),
      crowding:Number(gate.derived.crowdingIndex||0),
      whaleConcentration:Number(gate.derived.whaleConcentrationIndex||0),
      exchangeDivergence:Number(multi.divergenceScore||0)
    }
  };
  out.composite=Math.round(derivClamp_(
    out.scores.derivatives*.32 + out.scores.smartMoney*.28 +
    (100-out.scores.leverageRisk)*.18 +
    (100-out.scores.exchangeDivergence)*.12 +
    (100-out.scores.crowding)*.10,0,100));
  try{cache.put(key,JSON.stringify(out),Math.max(30,Number(CFG.DERIVATIVES_CACHE_SECONDS||120)));}catch(_){}
  return out;
}



function calculateDerivativesScore_(snap) {
  var score=50, notes=[], longPct=Number(snap.aggregateLong), funding=Number(snap.aggregateFunding), oi=Number(snap.aggregateOiChange);
  var taker=snap.taker&&snap.taker.ok?snap.taker.data:null;

  if(isFinite(longPct)&&longPct>0){
    if(longPct>=65){score-=10;notes.push('crowded longs');}
    else if(longPct<=35){score+=10;notes.push('crowded shorts');}
    else if(longPct>=55){score-=3;notes.push('mild long crowding');}
    else if(longPct<=45){score+=3;notes.push('mild short crowding');}
  }
  if(isFinite(funding)){
    if(funding>=0.0005){score-=10;notes.push('high positive funding');}
    else if(funding<=-0.0005){score+=10;notes.push('negative funding');}
    else if(funding>0)score-=2; else if(funding<0)score+=2;
  }
  if(isFinite(oi)){
    if(oi>=8){score+=8;notes.push('OI expanding fast');}
    else if(oi>=3){score+=4;notes.push('OI rising');}
    else if(oi<=-8){score-=8;notes.push('OI contracting fast');}
    else if(oi<=-3){score-=4;notes.push('OI falling');}
  }
  if(taker){
    var br=Number(taker.buySellRatio||0);
    if(br>=1.2){score+=6;notes.push('aggressive buyers');}
    else if(br>0&&br<=0.8){score-=6;notes.push('aggressive sellers');}
  }
  score=derivClamp_(score,0,100);
  return {value:Math.round(score),bias:derivScoreLabel_(score,'BULLISH DERIVATIVES','BEARISH DERIVATIVES','NEUTRAL / BALANCED'),notes:notes};
}

/* ---------- Gate advanced analytics ---------- */



function derivGateContract_(symbol) {
  return derivBase_(symbol) + '_USDT';
}



function derivGateTicker_(symbol) {
  symbol = normalizeDerivativesSymbol_(symbol);
  var contract = derivGateContract_(symbol);
  return derivCached_('DERIV_GATE_TICKER_V120_'+symbol, Math.min(60,CFG.DERIVATIVES_CACHE_SECONDS), function(){
    var url = 'https://api.gateio.ws/api/v4/futures/usdt/tickers?' + toQuery_({contract:contract});
    var b = derivFetchProviderJson_('GATE', url, 'Gate futures ticker');
    var rows = Array.isArray(b) ? b : [];
    var x = rows.filter(function(r){return String(r.contract||'')===contract;})[0] || rows[0];
    if(!x) throw new Error('Gate ticker empty.');
    return x;
  });
}



function derivGateFunding_(symbol) {
  symbol = normalizeDerivativesSymbol_(symbol);
  var t = derivGateTicker_(symbol);
  return {exchange:'Gate',rate:Number(t.funding_rate||0),at:Number(t.t||Date.now())};
}



function derivGateOi_(symbol, period) {
  var rows = derivGateStats_(symbol, period, 2);
  var last = rows[rows.length-1], prev = rows.length>1 ? rows[rows.length-2] : last;
  var nowVal=Number(last.open_interest_usd||0), prevVal=Number(prev.open_interest_usd||nowVal);
  return {exchange:'Gate',value:nowVal,changePct:prevVal?((nowVal-prevVal)/prevVal*100):0,at:Number(last.time||0)*1000||Date.now()};
}



function derivGateLongShort_(symbol, period) {
  var rows = derivGateStats_(symbol, period, 2), x = rows[rows.length-1];
  var ratio = Number(x.lsr_account || 0);
  if (!(ratio > 0)) throw new Error('Gate long/short ratio unavailable.');
  var longPct = ratioToLongPct_(ratio);
  return {exchange:'Gate',longPct:longPct,shortPct:100-longPct,ratio:ratio,at:Number(x.time||0)*1000||Date.now()};
}



function derivGateTaker_(symbol, period) {
  var rows=derivGateStats_(symbol,period,2), x=rows[rows.length-1];
  var ratio=Number(x.lsr_taker||0);
  if(!(ratio>0)){
    var l=Number(x.long_taker_size||0), s=Number(x.short_taker_size||0);
    ratio=s>0?l/s:0;
  }
  if(!(ratio>0))throw new Error('Gate taker ratio unavailable.');
  return {exchange:'Gate',buySellRatio:ratio,buyPct:ratioToLongPct_(ratio),sellPct:100-ratioToLongPct_(ratio),at:Number(x.time||0)*1000||Date.now()};
}

/* ---------- Bitget public derivatives data ---------- */



function derivGateStats_(symbol, period, limit) {
  symbol = normalizeDerivativesSymbol_(symbol);
  var contract = derivGateContract_(symbol);
  var interval = derivGateInterval_(period);
  limit = Math.max(2, Math.min(Number(limit || 2), 100));
  return derivCached_('DERIV_GATE_STATS_V120_'+symbol+'_'+interval+'_'+limit, CFG.DERIVATIVES_CACHE_SECONDS, function(){
    var url = 'https://api.gateio.ws/api/v4/futures/usdt/contract_stats?' + toQuery_({
      contract:contract, interval:interval, limit:limit
    });
    var b = derivFetchProviderJson_('GATE', url, 'Gate futures stats');
    if (!Array.isArray(b) || !b.length) throw new Error('Gate futures stats empty.');
    b.sort(function(a,b){ return Number(a.time||0)-Number(b.time||0); });
    return b;
  });
}



function derivGateAdvanced_(symbol, period, force) {
  symbol=normalizeDerivativesSymbol_(symbol); period=derivPeriod_(period);
  var key='DERIV_GATE_ADV_V120_'+symbol+'_'+period;
  var cache=CacheService.getScriptCache();
  if(!force){var c=cache.get(key);if(c){var z=safeJsonParse_(c);if(z)return z;}}

  var count=Math.max(6,Math.min(40,Number(CFG.DERIVATIVES_ADVANCED_HISTORY_POINTS||12)));
  var rows=derivGateStats_(symbol,period,count);
  var last=rows[rows.length-1], prev=rows.length>1?rows[rows.length-2]:last;
  var ticker=derivGateTicker_(symbol);

  function pct(r){return ratioToLongPct_(Number(r||0));}

  // Rolling liquidation window that matches the requested period.
  // Example: 4H = sum of the latest sixteen Gate 15m buckets.
  var liqWindow=derivGateLiquidationWindow_(symbol,period,force);
  var longLiq=Number(liqWindow.longUsd||0);
  var shortLiq=Number(liqWindow.shortUsd||0);
  var totalLiq=Number(liqWindow.totalUsd||0);
  var avgLiq=Number(liqWindow.avgHistoryUsd||0);
  var spike=Number(liqWindow.spikeRatio||0);

  var oi=Number(last.open_interest_usd||0), prevOi=Number(prev.open_interest_usd||oi);
  var oiChange=prevOi?((oi-prevOi)/prevOi*100):0;
  var volume24=Number(ticker.volume_24h_quote||ticker.volume_24h_usd||0);
  var priceChange=Number(ticker.change_percentage||0);
  var funding=Number(ticker.funding_rate||0);
  var mark=Number(last.mark_price||ticker.mark_price||ticker.last||0);

  var retailLong=pct(last.lsr_account);
  var topAccountLong=pct(last.top_lsr_account);
  var topPositionLong=pct(last.top_lsr_size);
  var takerLong=pct(last.lsr_taker);
  var divergence=topAccountLong-retailLong;

  var topLongSize=Number(last.top_long_size||0), topShortSize=Number(last.top_short_size||0);
  var oiContracts=Number(last.open_interest||0);
  var whaleConcentration=oiContracts>0?(topLongSize+topShortSize)/oiContracts*100:0;
  whaleConcentration=derivClamp_(whaleConcentration,0,100);

  var longUsers=Number(last.long_users||0), shortUsers=Number(last.short_users||0);
  var topLongAccounts=Number(last.top_long_account||0), topShortAccounts=Number(last.top_short_account||0);
  var topAccountCount=topLongAccounts+topShortAccounts, allUserCount=longUsers+shortUsers;

  var oiVolumeRatio=volume24>0?oi/volume24:0;
  var liqOiRatio=oi>0?totalLiq/oi*100:0;
  var fundingOiPressure=funding*oi;

  var crowding=Math.abs(retailLong-50)*2;
  var fundingCrowd=Math.min(100,Math.abs(funding)*100000);
  var oiVolRisk=Math.min(100,oiVolumeRatio*100);
  var spikeRisk=Math.min(100,Math.max(0,spike-1)*25);
  var leverageRisk=Math.round(derivClamp_(crowding*.28+fundingCrowd*.22+oiVolRisk*.25+spikeRisk*.25,0,100));

  var longSqueeze=Math.round(derivClamp_(
    Math.max(0,retailLong-50)*1.25 +
    Math.max(0,funding)*90000 +
    Math.max(0,oiChange)*1.2 +
    (longLiq>shortLiq?Math.min(25,spike*6):0),0,100));
  var shortSqueeze=Math.round(derivClamp_(
    Math.max(0,50-retailLong)*1.25 +
    Math.max(0,-funding)*90000 +
    Math.max(0,oiChange)*1.2 +
    (shortLiq>longLiq?Math.min(25,spike*6):0),0,100));

  var smart=50;
  smart+=(topAccountLong-50)*.35;
  smart+=(topPositionLong-50)*.35;
  smart+=(takerLong-50)*.2;
  smart+=derivClamp_(divergence,-25,25)*.25;
  if(oiChange>3)smart+=(priceChange>=0?4:-4);
  smart=Math.round(derivClamp_(smart,0,100));

  var regime='BALANCED';
  if(priceChange>0.8&&oiChange>2)regime='LEVERAGE BUILDUP • BULLISH';
  else if(priceChange<-0.8&&oiChange>2)regime='LEVERAGE BUILDUP • BEARISH';
  else if(priceChange>0.8&&oiChange<-2&&shortLiq>longLiq)regime='SHORT SQUEEZE';
  else if(priceChange<-0.8&&oiChange<-2&&longLiq>shortLiq)regime='LONG FLUSH';
  else if(oiChange<-3)regime='DELEVERAGING';
  else if(spike>=Number(CFG.DERIVATIVES_LIQ_SPIKE_THRESHOLD||3))regime='LIQUIDATION EVENT';

  var liqDelta=shortLiq-longLiq;
  var liqBias=liqDelta>0?'SHORT LIQUIDATIONS DOMINANT':(liqDelta<0?'LONG LIQUIDATIONS DOMINANT':'BALANCED');
  var whaleLabel=Math.abs(divergence)>=10
    ? (divergence>0?'WHALES MORE LONG THAN CROWD':'WHALES MORE SHORT THAN CROWD')
    : 'WHALE / CROWD ALIGNMENT';

  var out={
    symbol:symbol,period:period,at:Number(last.time||0)*1000||Date.now(),
    markPrice:mark,priceChangePct:priceChange,fundingRate:funding,
    openInterestUsd:oi,openInterestContracts:oiContracts,oiChangePct:oiChange,
    volume24hQuote:volume24,oiVolumeRatio:oiVolumeRatio,
    actualLiquidations:{
      longUsd:longLiq,shortUsd:shortLiq,totalUsd:totalLiq,
      longSize:Number(liqWindow.longSize||0),shortSize:Number(liqWindow.shortSize||0),
      windowPeriod:period,sourceInterval:liqWindow.sourceInterval,windowPoints:liqWindow.points,
      deltaUsd:liqDelta,bias:liqBias,
      longDominance:totalLiq?longLiq/totalLiq*100:0,
      shortDominance:totalLiq?shortLiq/totalLiq*100:0,
      avgHistoryUsd:avgLiq,spikeRatio:spike,
      spike:spike>=Number(CFG.DERIVATIVES_LIQ_SPIKE_THRESHOLD||3)
    },
    positioning:{
      retailLongPct:retailLong,retailShortPct:100-retailLong,
      topAccountLongPct:topAccountLong,topAccountShortPct:100-topAccountLong,
      topPositionLongPct:topPositionLong,topPositionShortPct:100-topPositionLong,
      whaleRetailDivergencePct:divergence,whaleRetailLabel:whaleLabel,
      topLongSize:topLongSize,topShortSize:topShortSize,
      topLongAccounts:topLongAccounts,topShortAccounts:topShortAccounts,
      longUsers:longUsers,shortUsers:shortUsers,
      whaleConcentrationPct:whaleConcentration,
      topAccountSharePct:allUserCount?topAccountCount/allUserCount*100:0
    },
    takerFlow:{
      ratio:Number(last.lsr_taker||0),
      longPct:takerLong,shortPct:100-takerLong,
      longSize:Number(last.long_taker_size||0),
      shortSize:Number(last.short_taker_size||0)
    },
    derived:{
      oiVolumeRatio:oiVolumeRatio,
      liquidationOiRatioPct:liqOiRatio,
      fundingOiPressure:fundingOiPressure,
      crowdingIndex:Math.round(derivClamp_(crowding,0,100)),
      whaleConcentrationIndex:Math.round(whaleConcentration),
      leverageRiskIndex:leverageRisk,
      longSqueezeRisk:longSqueeze,
      shortSqueezeRisk:shortSqueeze,
      squeezeBias:longSqueeze>shortSqueeze?'LONG SQUEEZE RISK':(shortSqueeze>longSqueeze?'SHORT SQUEEZE RISK':'BALANCED'),
      smartMoneyScore:smart,
      smartMoneyBias:derivScoreLabel_(smart,'BULLISH SMART MONEY','BEARISH SMART MONEY','NEUTRAL SMART MONEY'),
      regime:regime,
      oiLiquidationMatrix:{
        priceDirection:priceChange>0.25?'UP':(priceChange<-0.25?'DOWN':'FLAT'),
        oiDirection:oiChange>1?'UP':(oiChange<-1?'DOWN':'FLAT'),
        liquidationDominance:liqDelta>0?'SHORTS':(liqDelta<0?'LONGS':'BALANCED'),
        interpretation:regime
      }
    },
    raw:{
      topLsrAccount:Number(last.top_lsr_account||0),
      topLsrSize:Number(last.top_lsr_size||0),
      lsrAccount:Number(last.lsr_account||0),
      lsrTaker:Number(last.lsr_taker||0)
    }
  };

  try{cache.put(key,JSON.stringify(out),Math.max(30,Number(CFG.DERIVATIVES_CACHE_SECONDS||120)));}catch(_){}
  return out;
}



function derivGateInterval_(period) {
  period = derivPeriod_(period);
  return ['5m','15m','30m','1h','4h','8h','1d','3d','7d'].indexOf(period) >= 0 ? period : '4h';
}



function derivGateLiquidationWindow_(symbol, period, force) {
  symbol = normalizeDerivativesSymbol_(symbol);
  period = derivPeriod_(period);
  var spec = derivGateLiqWindowSpec_(period);
  var points = Math.max(1, Number(spec.points || 1));
  var historyPoints = Math.min(100, Math.max(points + 2, points * 3));
  var key = 'DERIV_GATE_LIQ_WINDOW_V1201_' + symbol + '_' + period + '_' + spec.interval + '_' + historyPoints;
  var cache = CacheService.getScriptCache();

  if (!force) {
    var c = cache.get(key);
    if (c) {
      var z = safeJsonParse_(c);
      if (z) return z;
    }
  }

  var rows = derivGateStats_(symbol, spec.interval, historyPoints);
  if (!rows.length) throw new Error('Gate liquidation window empty.');

  var currentRows = rows.slice(-points);
  function rowTotal(r) {
    return derivGateLiqUsdFromRow_(r,'long') + derivGateLiqUsdFromRow_(r,'short');
  }
  function sumSide(arr, side) {
    return arr.reduce(function(s,r){ return s + derivGateLiqUsdFromRow_(r,side); }, 0);
  }

  var longUsd = sumSide(currentRows,'long');
  var shortUsd = sumSide(currentRows,'short');
  var totalUsd = longUsd + shortUsd;

  var prior = rows.slice(0, Math.max(0, rows.length - points));
  var priorTotals = [];
  for (var end = prior.length; end >= points; end -= points) {
    priorTotals.unshift(prior.slice(end-points,end).reduce(function(s,r){ return s + rowTotal(r); },0));
  }
  var avgHistoryUsd = priorTotals.length
    ? priorTotals.reduce(function(a,b){ return a+b; },0) / priorTotals.length
    : 0;

  var last = currentRows[currentRows.length-1] || rows[rows.length-1] || {};
  var spikeRatio = avgHistoryUsd > 0 ? totalUsd / avgHistoryUsd : (totalUsd > 0 ? 1 : 0);

  var out = {
    symbol:symbol,
    requestedPeriod:period,
    sourceInterval:spec.interval,
    points:currentRows.length,
    from:Number(currentRows[0] && currentRows[0].time || 0) * 1000 || 0,
    to:Number(last.time || 0) * 1000 || Date.now(),
    longUsd:longUsd,
    shortUsd:shortUsd,
    totalUsd:totalUsd,
    longSize:currentRows.reduce(function(s,r){ return s + Number(r.long_liq_size || 0); },0),
    shortSize:currentRows.reduce(function(s,r){ return s + Number(r.short_liq_size || 0); },0),
    avgHistoryUsd:avgHistoryUsd,
    spikeRatio:spikeRatio
  };

  try {
    cache.put(key, JSON.stringify(out), Math.max(30, Number(CFG.DERIVATIVES_CACHE_SECONDS || 120)));
  } catch (_) {}
  return out;
}



function derivGateLiqWindowSpec_(period) {
  period = derivPeriod_(period);
  var map = {
    '5m':  {interval:'5m', points:1},
    '15m': {interval:'5m', points:3},
    '30m': {interval:'5m', points:6},
    '1h':  {interval:'15m',points:4},
    '2h':  {interval:'15m',points:8},
    '4h':  {interval:'15m',points:16},
    '6h':  {interval:'30m',points:12},
    '8h':  {interval:'30m',points:16},
    '12h': {interval:'1h', points:12},
    '1d':  {interval:'1h', points:24},
    '3d':  {interval:'4h', points:18},
    '7d':  {interval:'4h', points:42}
  };
  return map[period] || map['4h'];
}



function derivGateLiqUsdFromRow_(row, side) {
  row = row || {};
  side = String(side || 'long');
  var usdNew = Number(row[side + '_liq_usd_new']);
  var usdOld = Number(row[side + '_liq_usd']);
  var amount = Number(row[side + '_liq_amount']);
  var mark = Number(row.mark_price || 0);

  if (isFinite(usdNew) && usdNew > 0) return usdNew;
  if (isFinite(usdOld) && usdOld > 0) return usdOld;
  if (isFinite(amount) && amount > 0 && isFinite(mark) && mark > 0) return amount * mark;
  return 0;
}



function derivBitgetFunding_(symbol) {
  symbol=normalizeDerivativesSymbol_(symbol);
  return derivCached_('DERIV_BG_FUND_V120_'+symbol,CFG.DERIVATIVES_CACHE_SECONDS,function(){
    var b=derivFetchProviderJson_('BITGET','https://api.bitget.com/api/v2/mix/market/current-fund-rate?'+toQuery_({symbol:symbol,productType:'USDT-FUTURES'}),'Bitget funding');
    var rows=b&&Array.isArray(b.data)?b.data:[];
    if(!rows.length)throw new Error('Bitget funding empty.');
    return {exchange:'Bitget',rate:Number(rows[0].fundingRate||0),at:Number(b.requestTime||Date.now())};
  });
}



function derivBitgetOi_(symbol) {
  symbol=normalizeDerivativesSymbol_(symbol);
  return derivCached_('DERIV_BG_OI_V120_'+symbol,CFG.DERIVATIVES_CACHE_SECONDS,function(){
    var b=derivFetchProviderJson_('BITGET','https://api.bitget.com/api/v2/mix/market/open-interest?'+toQuery_({symbol:symbol,productType:'USDT-FUTURES'}),'Bitget OI');
    var rows=b&&b.data&&Array.isArray(b.data.openInterestList)?b.data.openInterestList:[];
    if(!rows.length)throw new Error('Bitget OI empty.');
    return {exchange:'Bitget',value:Number(rows[0].size||0),changePct:null,at:Number((b.data&&b.data.ts)||b.requestTime||Date.now())};
  });
}

/* ---------- OKX public derivatives data ---------- */



function derivBitgetLongShort_(symbol, period) {
  symbol=normalizeDerivativesSymbol_(symbol); var p=derivBitgetPeriod_(period);
  return derivCached_('DERIV_BG_LS_V120_'+symbol+'_'+p,CFG.DERIVATIVES_CACHE_SECONDS,function(){
    var b=derivFetchProviderJson_('BITGET','https://api.bitget.com/api/v2/mix/market/long-short?'+toQuery_({symbol:symbol,period:p}),'Bitget long/short');
    var rows=b&&Array.isArray(b.data)?b.data:[];
    if(!rows.length)throw new Error('Bitget long/short empty.');
    rows.sort(function(a,b){return Number(a.ts||0)-Number(b.ts||0);});
    var x=rows[rows.length-1], l=Number(x.longRatio||0), s=Number(x.shortRatio||0), total=l+s;
    return {exchange:'Bitget',longPct:total?l/total*100:0,shortPct:total?s/total*100:0,ratio:Number(x.longShortRatio||0)||(s?l/s:0),at:Number(x.ts||Date.now())};
  });
}



function derivBitgetPeriod_(period) {
  period = derivPeriod_(period);
  if (period === '1d') return '1Dutc';
  if (period === '8h') return '4h';
  if (period === '3d' || period === '7d') return '1Dutc';
  return ['5m','15m','30m','1h','4h'].indexOf(period) >= 0 ? period : '4h';
}



function derivOkxInst_(symbol) {
  return derivBase_(symbol) + '-USDT-SWAP';
}



function derivOkxFunding_(symbol) {
  symbol=normalizeDerivativesSymbol_(symbol); var inst=derivOkxInst_(symbol);
  return derivCached_('DERIV_OKX_FUND_V120_'+symbol,CFG.DERIVATIVES_CACHE_SECONDS,function(){
    var b=derivFetchProviderJson_('OKX','https://www.okx.com/api/v5/public/funding-rate?'+toQuery_({instId:inst}),'OKX funding');
    var x=b&&Array.isArray(b.data)&&b.data.length?b.data[0]:null;
    if(!x)throw new Error('OKX funding empty.');
    return {exchange:'OKX',rate:Number(x.fundingRate||0),at:Number(x.fundingTime||x.ts||Date.now())};
  });
}



function derivOkxOi_(symbol) {
  symbol=normalizeDerivativesSymbol_(symbol); var inst=derivOkxInst_(symbol);
  return derivCached_('DERIV_OKX_OI_V120_'+symbol,CFG.DERIVATIVES_CACHE_SECONDS,function(){
    var b=derivFetchProviderJson_('OKX','https://www.okx.com/api/v5/public/open-interest?'+toQuery_({instType:'SWAP',instId:inst}),'OKX OI');
    var x=b&&Array.isArray(b.data)&&b.data.length?b.data[0]:null;
    if(!x)throw new Error('OKX OI empty.');
    return {exchange:'OKX',value:Number(x.oiUsd||x.oiCcy||x.oi||0),changePct:null,at:Number(x.ts||Date.now())};
  });
}



function derivOkxOrderBook_(symbol) {
  symbol=normalizeDerivativesSymbol_(symbol); var inst=derivOkxInst_(symbol);
  return derivCached_('DERIV_OKX_BOOK_V120_'+symbol,30,function(){
    var b=derivFetchProviderJson_('OKX','https://www.okx.com/api/v5/market/books?'+toQuery_({instId:inst,sz:Math.min(400,Math.max(50,Number(CFG.DERIVATIVES_ORDERBOOK_DEPTH||200)))}),'OKX order book');
    var x=b&&Array.isArray(b.data)&&b.data.length?b.data[0]:null;
    if(!x)throw new Error('OKX order book empty.');
    function parse(rows){return(rows||[]).map(function(r){return{price:Number(r[0]),size:Number(r[1]),orders:Number(r[3]||0)};}).filter(function(r){return r.price>0&&r.size>0;});}
    return {exchange:'OKX',bids:parse(x.bids),asks:parse(x.asks),at:Number(x.ts||Date.now())};
  });
}

/* ---------- Base multi-exchange snapshot ---------- */



function derivPeriod_(period) {
  period = String(period || CFG.DERIVATIVES_DEFAULT_PERIOD || '4h').toLowerCase();
  return ['5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','7d'].indexOf(period) >= 0 ? period : '4h';
}



function derivLiquidityWalls_(symbol) {
  var book=derivOkxOrderBook_(symbol), mid=0;
  if(book.bids.length&&book.asks.length)mid=(book.bids[0].price+book.asks[0].price)/2;
  function top(rows){
    return rows.map(function(x){return{price:x.price,size:x.size,notional:x.price*x.size,distancePct:mid?((x.price-mid)/mid*100):0};})
      .sort(function(a,b){return b.notional-a.notional;})
      .slice(0,Math.max(3,Number(CFG.DERIVATIVES_WALL_TOP_N||5)));
  }
  return {symbol:normalizeDerivativesSymbol_(symbol),mid:mid,bids:top(book.bids),asks:top(book.asks),at:book.at};
}



function getEstimatedLiquidationZones_(symbol, period) {
  symbol=normalizeDerivativesSymbol_(symbol);
  var snap=getDerivativesSnapshot_(symbol,period,false);
  var adv=derivGateAdvanced_(symbol,period,false);
  var price=Number(adv.markPrice||0);
  if(!(price>0)){
    try{var a=analyzeSymbol_(symbol,'15m');price=Number(a.price||0);}catch(_){}
  }
  var atrPct=.01;
  try{var a2=analyzeSymbol_(symbol,'15m');atrPct=price>0?Number(a2.atr||0)/price:.01;}catch(_){}
  var longPct=Number(snap.aggregateLong!=null?snap.aggregateLong:adv.positioning.retailLongPct||50);
  var funding=Number(snap.aggregateFunding!=null?snap.aggregateFunding:adv.fundingRate||0);
  var levels=CFG.DERIVATIVES_LIQ_LEVELS||[0.006,0.010,0.016,0.025,0.040], downside=[],upside=[];

  levels.forEach(function(d,i){
    var vol=derivClamp_(atrPct/.01,.7,1.8), decay=1/(1+i*.28);
    var longW=(longPct/50)*(1+Math.max(0,funding)*800)*vol;
    var shortW=((100-longPct)/50)*(1+Math.max(0,-funding)*800)*vol;
    downside.push({price:price*(1-d),distancePct:-d*100,intensity:longW*decay,side:'LONG_LIQ'});
    upside.push({price:price*(1+d),distancePct:d*100,intensity:shortW*decay,side:'SHORT_LIQ'});
  });
  return {symbol:symbol,price:price,downside:downside,upside:upside,model:'AZZATSSINS ESTIMATED LIQUIDATION MODEL',actual:adv.actualLiquidations};
}

/* ---------- Composite advanced snapshot ---------- */



function derivMultiExchangeDivergence_(symbol, period) {
  var ls=[], funding=[];
  [
    derivSafe_(function(){return derivGateLongShort_(symbol,period);}),
    derivSafe_(function(){return derivBitgetLongShort_(symbol,period);})
  ].forEach(function(r){if(r.ok)ls.push(r.data);});
  [
    derivSafe_(function(){return derivGateFunding_(symbol);}),
    derivSafe_(function(){return derivBitgetFunding_(symbol);}),
    derivSafe_(function(){return derivOkxFunding_(symbol);})
  ].forEach(function(r){if(r.ok)funding.push(r.data);});

  var longVals=ls.map(function(x){return Number(x.longPct||0);});
  var fundVals=funding.map(function(x){return Number(x.rate||0);});
  var lsSpread=longVals.length?Math.max.apply(null,longVals)-Math.min.apply(null,longVals):0;
  var fundSpread=fundVals.length?Math.max.apply(null,fundVals)-Math.min.apply(null,fundVals):0;
  var score=Math.round(derivClamp_(lsSpread*3 + Math.abs(fundSpread)*100000,0,100));
  return {longShort:ls,funding:funding,longShortSpreadPct:lsSpread,fundingSpread:fundSpread,divergenceScore:score,label:score>=45?'HIGH EXCHANGE DIVERGENCE':(score>=20?'MODERATE DIVERGENCE':'LOW DIVERGENCE')};
}

/* ---------- Visible liquidity + estimated liquidation zones ---------- */



function ratioToLongPct_(ratio) {
  ratio = Number(ratio || 0);
  return ratio > 0 ? ratio / (1 + ratio) * 100 : 50;
}



function derivLooksGeoBlocked_(code, raw) {
  code = Number(code || 0);
  var s = String(raw || '').toLowerCase();
  return code === 451 ||
    (code === 403 && (
      s.indexOf('restricted location') >= 0 ||
      s.indexOf('block access from your country') >= 0 ||
      s.indexOf('cloudfront') >= 0 ||
      s.indexOf('eligibility') >= 0
    ));
}



function derivMarkProviderBlocked_(provider, code, reason) {
  var hours = Math.max(1, Number(CFG.DERIVATIVES_GEO_BLOCK_COOLDOWN_HOURS || 12));
  var x = {
    provider:String(provider || '').toUpperCase(),
    code:Number(code || 0),
    reason:String(reason || 'geo/restriction'),
    until:Date.now() + hours * 3600000
  };
  try {
    CacheService.getScriptCache().put(
      derivProviderBlockKey_(provider),
      JSON.stringify(x),
      Math.min(21600, Math.round(hours * 3600))
    );
  } catch (_) {}
  return x;
}



function derivProviderBlockInfo_(provider) {
  try {
    var raw = CacheService.getScriptCache().get(derivProviderBlockKey_(provider));
    if (!raw) return null;
    var x = safeJsonParse_(raw);
    if (!x || Number(x.until || 0) <= Date.now()) return null;
    return x;
  } catch (_) { return null; }
}



function derivProviderBlockKey_(provider) {
  return 'DERIV_PROVIDER_BLOCK_V120_' + String(provider || '').toUpperCase();
}



function getProviderHealth_(force){ return refreshProviderHealth_(!!force); }



function refreshProviderHealth_(force){
  var p=PropertiesService.getScriptProperties();
  var old=safeJsonParse_(p.getProperty('PROVIDER_HEALTH')||'');
  if(!force&&old&&Date.now()-Number(old.at||0)<CFG.HEALTH_CACHE_MINUTES*60000)return old;
  var h={at:Date.now(),providers:{}};
  h.providers.OKX=probeProvider_('OKX','https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
  h.providers.Yahoo=probeProvider_('Yahoo','https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK?range=1d&interval=15m');
  h.providers.LacakSaham=probeProvider_('LacakSaham','https://lacaksaham.id/stock/BBCA');
  h.providers.XAUS=probeProvider_('XAUS','https://xaus.com/api/v1/spot?compact=1');
  p.setProperty('PROVIDER_HEALTH',JSON.stringify(h));
  try{var sh=dbSheet_('ProviderHealth');Object.keys(h.providers).forEach(function(k){var x=h.providers[k];sh.appendRow([h.at,k,x.ok?'OK':'ERROR',x.code,x.ms,x.message]);});}catch(_){}
  return h;
}



function probeProvider_(name,url){ const t=Date.now(); try{ const r=UrlFetchApp.fetch(url,{method:'get',muteHttpExceptions:true,headers:marketHeaders_()}); const c=r.getResponseCode(); return {ok:c>=200&&c<300,code:c,ms:Date.now()-t,message:c>=200&&c<300?'OK':truncateCodePoints_(r.getContentText(),80)};}catch(e){return{ok:false,code:0,ms:Date.now()-t,message:errorText_(e)};} }



function domainFromTitleSource_(t){var m=String(t||'').match(/\s-\s([^\-]+)$/);return m?m[1].trim():'';}
function fetchGoogleNewsRss_(){
  const q='(IHSG OR saham Indonesia OR rupiah OR Bank Indonesia OR nikel OR batubara OR CPO)'; const url='https://news.google.com/rss/search?'+toQuery_({q:q,hl:'id',gl:'ID',ceid:'ID:id'});
  const r=UrlFetchApp.fetch(url,{muteHttpExceptions:true}); if(r.getResponseCode()<200||r.getResponseCode()>=300)throw new Error('HTTP '+r.getResponseCode()); const doc=XmlService.parse(r.getContentText()), items=doc.getRootElement().getChild('channel').getChildren('item');
  return items.slice(0,60).map(function(it){const title=it.getChildText('title')||'', link=it.getChildText('link')||'', pub=it.getChildText('pubDate')||''; return{title:title,url:link,domain:domainFromTitleSource_(title),publishedAt:Date.parse(pub)||Date.now(),source:'Google News'};}).filter(function(x){return x.title&&x.url;});
}



function fetchCryptoLifecycleBars_(symbols) {
  const out = {};
  const uniq = unique_(symbols.map(normalizeSymbol_)).filter(Boolean);
  if (!uniq.length) return out;

  const reqs = uniq.map(function(s) {
    return {
      url:'https://www.okx.com/api/v5/market/candles?instId=' + encodeURIComponent(okxInstrumentId_(s)) + '&bar=5m&limit=' + encodeURIComponent(String(CFG.LIFECYCLE_BAR_LIMIT || 300)),
      method:'get',
      muteHttpExceptions:true,
      headers:marketHeaders_()
    };
  });

  const rs = UrlFetchApp.fetchAll(reqs);
  rs.forEach(function(res, i) {
    try {
      const b = safeJsonParse_(res.getContentText());
      if (res.getResponseCode() < 200 || res.getResponseCode() >= 300 || !b || String(b.code) !== '0' || !Array.isArray(b.data)) return;
      const candles = b.data.map(function(k) {
        const t = Number(k[0]);
        return {
          openTime:t,
          open:Number(k[1]),
          high:Number(k[2]),
          low:Number(k[3]),
          close:Number(k[4]),
          closeTime:t + 5*60000 - 1,
          confirmed:String(k[8] == null ? '1' : k[8])
        };
      }).filter(function(c) {
        return c.confirmed === '1' && [c.openTime,c.high,c.low,c.close].every(isFinite);
      }).sort(function(a,b){ return a.openTime-b.openTime; });
      out[uniq[i]] = candles;
    } catch (_) {}
  });
  return out;
}


function derivScoreLabel_(v,bull,bear,neutral) {
  v=Number(v||0);
  if(v>=65)return bull;
  if(v<=35)return bear;
  return neutral;
}

/* ---------- Gate public derivatives data ---------- */


/* ================= UNIVERSE SWEEP (all coins, every cycle) =================
 * Quota math: 300 coins x klines every 10 min = 43k req/day > GAS quota (20k).
 * So: ONE ticker sweep (1 req) covers the whole universe every cycle,
 * and full klines analysis runs on ~100 relevant coins (movers+favorites+active).
 */
function getAllSpotSymbols_() {
  var p = PropertiesService.getScriptProperties();
  try {
    var cached = JSON.parse(p.getProperty('ALL_SPOT_SYMBOLS') || 'null');
    if (cached && Date.now() - Number(cached.at || 0) < 24 * 3600000 &&
        Array.isArray(cached.symbols) && cached.symbols.length > 50) return cached.symbols;
  } catch (_) {}
  var syms = [];
  try {
    var res = fetchJson_('https://www.okx.com/api/v5/public/instruments?instType=SPOT',
      { headers: marketHeaders_(), muteHttpExceptions: true });
    (res.data || []).forEach(function(it) {
      if (String(it.quoteCcy || '') === 'USDT' && String(it.state || '') === 'live')
        syms.push(normalizeSymbol_(String(it.instId || '')));
    });
  } catch (e) { console.log('instruments: ' + errorText_(e)); }
  syms = syms.filter(Boolean);
  if (syms.length > 50) {
    try { p.setProperty('ALL_SPOT_SYMBOLS', JSON.stringify({ at: Date.now(), symbols: syms })); } catch (_) {}
    return syms;
  }
  try { return getAllTrackedSymbols_(); } catch (_) { return []; }
}

function fetchAllSpotTickers_() {
  var res = fetchJson_('https://www.okx.com/api/v5/market/tickers?instType=SPOT',
    { headers: marketHeaders_(), muteHttpExceptions: true });
  var out = {};
  (res.data || []).forEach(function(t) {
    var sym = normalizeSymbol_(String(t.instId || ''));
    if (!/USDT$/.test(sym)) return;
    var last = Number(t.last || 0), open = Number(t.open24h || 0);
    if (!last || !open) return;
    out[sym] = { last: last, chg24: (last - open) / open, volCcy24h: Number(t.volCcy24h || 0) };
  });
  return out;
}

/* Top movers by |24h change| weighted with volume. Returns bot-format symbols. */
function getTopMovers_(n) {
  n = Math.max(10, Number(n) || 60);
  var tickers;
  try { tickers = fetchAllSpotTickers_(); } catch (e) { console.log('tickers: ' + errorText_(e)); return []; }
  var minVol = Number(getProp_('MIN_24H_VOLUME_USD', false) || CFG.MIN_24H_VOLUME_USD || 2000000);
  var stables = CFG.STABLECOINS || [];
  var scored = Object.keys(tickers).filter(function(sym) {
    if (stables.indexOf(baseSymbol_(sym)) >= 0) return false; // coret stablecoin
    return Number(tickers[sym].volCcy24h || 0) >= minVol; // coret coin sepi
  }).map(function(sym) {
    var t = tickers[sym];
    var score = Math.abs(t.chg24) * Math.log10(t.volCcy24h + 1);
    return { sym: sym, score: score, chg24: t.chg24 };
  });
  scored.sort(function(x, y) { return y.score - x.score; });
  return scored.slice(0, n).map(function(x) { return x.sym; });
}

/* ==================================================================
 * SECTION: Signal.gs  (53 functions)
 * ================================================================== */

/**
 * Signal.gs — indicators + analyze + trade plan + 30m confirm + universe scan + direction state.
 */

function emaSeries_(values, period) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * alpha + out[i - 1] * (1 - alpha));
  return out;
}




function rsiWilder_(values, period) {
  if (values.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses += -d;
  }
  let ag = gains / period, al = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    ag = ((ag * (period - 1)) + (d > 0 ? d : 0)) / period;
    al = ((al * (period - 1)) + (d < 0 ? -d : 0)) / period;
  }
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}




function rsiSeriesWilder_(values, period) {
  const out = new Array(values.length).fill(null);
  if (!values || values.length <= period) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses += -d;
  }
  let ag = gains / period, al = losses / period;
  out[period] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    ag = ((ag * (period - 1)) + (d > 0 ? d : 0)) / period;
    al = ((al * (period - 1)) + (d < 0 ? -d : 0)) / period;
    out[i] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  }
  return out;
}




function macd_(values, fast, slow, signalPeriod) {
  const f = emaSeries_(values, fast), s = emaSeries_(values, slow);
  const line = values.map(function(_, i) { return f[i] - s[i]; });
  const sig = emaSeries_(line, signalPeriod);
  const i = line.length - 1;
  return { macdLine: line[i], signalLine: sig[i], histogram: line[i] - sig[i] };
}




function atrWilder_(candles, period) {
  if (!candles || candles.length < period + 1) return 0;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const h = Number(candles[i].high), l = Number(candles[i].low), pc = Number(candles[i - 1].close);
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = average_(tr.slice(0, period));
  for (let i = period; i < tr.length; i++) atr = ((atr * (period - 1)) + tr[i]) / period;
  return atr;
}




function atrSeriesWilder_(candles, period) {
  const out = new Array(candles.length).fill(null);
  if (!candles || candles.length < period + 1) return out;
  const tr = new Array(candles.length).fill(null);
  for (let i = 1; i < candles.length; i++) {
    const h = Number(candles[i].high), l = Number(candles[i].low), pc = Number(candles[i - 1].close);
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let atr = average_(tr.slice(1, period + 1));
  out[period] = atr;
  for (let i = period + 1; i < candles.length; i++) {
    atr = ((atr * (period - 1)) + tr[i]) / period;
    out[i] = atr;
  }
  return out;
}




function adx_(candles, period) {
  if (!candles || candles.length < period * 2 + 2) return { adx:0, plusDI:0, minusDI:0 };
  const tr=[], pdm=[], mdm=[];
  for (let i=1; i<candles.length; i++) {
    const up = Number(candles[i].high) - Number(candles[i-1].high);
    const down = Number(candles[i-1].low) - Number(candles[i].low);
    pdm.push(up > down && up > 0 ? up : 0);
    mdm.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(
      Number(candles[i].high) - Number(candles[i].low),
      Math.abs(Number(candles[i].high) - Number(candles[i-1].close)),
      Math.abs(Number(candles[i].low) - Number(candles[i-1].close))
    ));
  }
  let trSm = tr.slice(0,period).reduce(function(a,b){return a+b;},0);
  let pSm = pdm.slice(0,period).reduce(function(a,b){return a+b;},0);
  let mSm = mdm.slice(0,period).reduce(function(a,b){return a+b;},0);
  const dx=[];
  let plusDI=0, minusDI=0;
  for (let i=period; i<tr.length; i++) {
    if (i > period) {
      trSm = trSm - trSm/period + tr[i];
      pSm = pSm - pSm/period + pdm[i];
      mSm = mSm - mSm/period + mdm[i];
    }
    plusDI = trSm ? 100 * pSm / trSm : 0;
    minusDI = trSm ? 100 * mSm / trSm : 0;
    const den = plusDI + minusDI;
    dx.push(den ? 100 * Math.abs(plusDI - minusDI) / den : 0);
  }
  if (!dx.length) return { adx:0, plusDI:plusDI, minusDI:minusDI };
  let adx = average_(dx.slice(0, Math.min(period, dx.length)));
  for (let i=period; i<dx.length; i++) adx = ((adx * (period - 1)) + dx[i]) / period;
  return { adx:adx, plusDI:plusDI, minusDI:minusDI };
}




function bollinger_(values, period, mult) {
  if (!values || values.length < period) return { upper:0, mid:0, lower:0 };
  const win=values.slice(-period).map(Number);
  const mid=average_(win);
  const variance=average_(win.map(function(x){return Math.pow(x-mid,2);}));
  const sd=Math.sqrt(Math.max(0,variance));
  return { upper:mid+mult*sd, mid:mid, lower:mid-mult*sd };
}




function stochasticRsi_(closes, rsiPeriod, stochPeriod, smoothD) {
  const rs = rsiSeriesWilder_(closes, rsiPeriod);
  const valid=[];
  for (let i=0; i<rs.length; i++) if (rs[i] != null && isFinite(rs[i])) valid.push({i:i,v:rs[i]});
  if (valid.length < stochPeriod + smoothD) return { k:50, d:50 };
  const ks=[];
  for (let x=Math.max(stochPeriod-1, valid.length - smoothD - 2); x<valid.length; x++) {
    const start = Math.max(0, x - stochPeriod + 1);
    const win = valid.slice(start, x+1).map(function(z){return z.v;});
    const lo = Math.min.apply(null, win), hi = Math.max.apply(null, win);
    ks.push(hi === lo ? 50 : (valid[x].v - lo) / (hi - lo) * 100);
  }
  const k = ks[ks.length - 1];
  const d = average_(ks.slice(-smoothD));
  return { k:k, d:d };
}




function supertrend_(candles, period, multiplier) {
  if (!candles || candles.length < period + 5) return { direction:'NEUTRAL', value:0 };
  const atr = atrSeriesWilder_(candles, period);
  let finalUpper = null, finalLower = null, trend = 1, st = 0;
  for (let i=period; i<candles.length; i++) {
    const hl2 = (Number(candles[i].high) + Number(candles[i].low)) / 2;
    const a = Number(atr[i] || 0);
    const basicUpper = hl2 + multiplier * a;
    const basicLower = hl2 - multiplier * a;
    if (finalUpper === null) {
      finalUpper = basicUpper; finalLower = basicLower;
    } else {
      const prevClose = Number(candles[i-1].close);
      finalUpper = basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
      finalLower = basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;
    }
    const close = Number(candles[i].close);
    if (trend === -1 && close > finalUpper) trend = 1;
    else if (trend === 1 && close < finalLower) trend = -1;
    st = trend === 1 ? finalLower : finalUpper;
  }
  return { direction:trend === 1 ? 'BULLISH' : 'BEARISH', value:st };
}




function obvSlope_(candles, lookback) {
  if (!candles || candles.length < lookback + 2) return 0;
  const obv=[0];
  for (let i=1; i<candles.length; i++) {
    const prev=obv[i-1], c=Number(candles[i].close), pc=Number(candles[i-1].close), v=Number(candles[i].volume||0);
    obv.push(c>pc ? prev+v : (c<pc ? prev-v : prev));
  }
  const n=Math.max(1,lookback||5);
  return obv[obv.length-1] - obv[Math.max(0,obv.length-1-n)];
}




function moneyFlowIndex_(candles, period) {
  if (!candles || candles.length < period + 1) return 50;
  let pos=0, neg=0;
  const start = candles.length - period;
  for (let i=start; i<candles.length; i++) {
    if (i <= 0) continue;
    const tp = (Number(candles[i].high)+Number(candles[i].low)+Number(candles[i].close))/3;
    const prevTp = (Number(candles[i-1].high)+Number(candles[i-1].low)+Number(candles[i-1].close))/3;
    const flow = tp * Number(candles[i].volume || 0);
    if (tp >= prevTp) pos += flow; else neg += flow;
  }
  if (neg === 0) return pos > 0 ? 100 : 50;
  const ratio = pos / neg;
  return 100 - 100/(1+ratio);
}




function regimeBonus_(regime,signal){
  regime=String(regime||''); signal=String(signal||'');
  if(signal==='BULLISH WATCH'&&regime==='TRENDING BULLISH') return 12;
  if(signal==='BEARISH WATCH'&&regime==='TRENDING BEARISH') return 12;
  if(regime==='HIGH VOLATILITY') return -4;
  if(regime==='RANGING') return -2;
  return 2;
}




function classifyMarketRegime_(price,e9,e21,e50,atr,adxVal){
  price=Number(price); atr=Number(atr||0); adxVal=Number(adxVal||0);
  const atrPct=price?atr/price*100:0;
  const alignedBull=e9>e21&&e21>e50, alignedBear=e9<e21&&e21<e50;
  if(atrPct>=3.5) return 'HIGH VOLATILITY';
  if(adxVal>=23 && alignedBull) return 'TRENDING BULLISH';
  if(adxVal>=23 && alignedBear) return 'TRENDING BEARISH';
  if(adxVal<18) return 'RANGING';
  return 'MIXED / TRANSITION';
}




function analyzeCandles_(symbol, interval, candles, provider) {
  if (!Array.isArray(candles) || candles.length < 80) throw new Error('Candle tidak cukup: ' + (candles ? candles.length : 0));

  const opens = candles.map(function(c) { return c.open; });
  const closes = candles.map(function(c) { return c.close; });
  const volumes = candles.map(function(c) { return c.volume; });

  const ema9a = emaSeries_(closes, 9);
  const ema21a = emaSeries_(closes, 21);
  const ema50a = emaSeries_(closes, 50);
  const macd = macd_(closes, 12, 26, 9);
  const rsi = rsiWilder_(closes, 14);
  const atr = atrWilder_(candles, CFG.ATR_PERIOD);
  const adxPack = adx_(candles, 14);

  const i = closes.length - 1;
  const price = closes[i];
  const open = opens[i];
  const prev = closes[i - 1];
  const ema9 = ema9a[i];
  const ema21 = ema21a[i];
  const ema50 = ema50a[i];
  const avgVol20 = average_(volumes.slice(Math.max(0, i - 20), i));
  const volumeRatio = avgVol20 > 0 ? volumes[i] / avgVol20 : 1;
  const changePct = prev ? ((price / prev) - 1) * 100 : 0;

  let bull = 0, bear = 0;
  const rb = [], rs = [];

  if (ema9 > ema21) { bull++; rb.push('EMA9 > EMA21'); } else { bear++; rs.push('EMA9 < EMA21'); }
  if (ema21 > ema50) { bull++; rb.push('EMA21 > EMA50'); } else { bear++; rs.push('EMA21 < EMA50'); }
  if (price > ema21) { bull++; rb.push('price > EMA21'); } else { bear++; rs.push('price < EMA21'); }
  if (ema21 > ema21a[i - 1]) { bull++; rb.push('EMA21 rising'); } else if (ema21 < ema21a[i - 1]) { bear++; rs.push('EMA21 falling'); }
  if (rsi >= 52 && rsi <= 72) { bull++; rb.push('RSI bullish'); }
  if (rsi <= 48 && rsi >= 28) { bear++; rs.push('RSI bearish'); }
  if (macd.histogram > 0) { bull++; rb.push('MACD +'); } else if (macd.histogram < 0) { bear++; rs.push('MACD -'); }
  if (price > open) { bull++; rb.push('green candle'); } else if (price < open) { bear++; rs.push('red candle'); }
  if (volumeRatio >= 1.15) {
    if (price >= open) { bull++; rb.push('volume confirmation'); }
    else { bear++; rs.push('volume confirmation'); }
  }

  let signal = 'NEUTRAL', score = Math.max(bull, bear), reasons = [];
  if (bull >= CFG.SIGNAL_MIN_SCORE && bull - bear >= 2) {
    signal = 'BULLISH WATCH'; score = bull; reasons = rb;
  } else if (bear >= CFG.SIGNAL_MIN_SCORE && bear - bull >= 2) {
    signal = 'BEARISH WATCH'; score = bear; reasons = rs;
  }

  // 5 points -> 3/5, 6 -> 4/5, 7+ -> 5/5.
  const strength = signal === 'NEUTRAL' ? 0 : Math.min(5, Math.max(1, Math.round(score / 1.5)));
  const warning = rsi >= 72 ? 'RSI overbought' : (rsi <= 28 ? 'RSI oversold' : '');

  const plan = signal === 'NEUTRAL' ? null : buildTradePlan_({
    signal: signal, price: price, ema9: ema9, ema21: ema21, atr: atr, candles: candles
  });

  const regime = classifyMarketRegime_(price, ema9, ema21, ema50, atr, adxPack.adx);

  return {
    symbol: symbol, interval: interval, provider: provider || '-', signal: signal, strength: strength, regime:regime,
    score: score, bullScore: bull, bearScore: bear, price: price, changePct: changePct,
    ema9: ema9, ema21: ema21, ema50: ema50, rsi: rsi,
    macdLine: macd.macdLine, macdSignal: macd.signalLine, macdHistogram: macd.histogram,
    volumeRatio: volumeRatio, atr14: atr, adx:adxPack.adx, plusDI:adxPack.plusDI, minusDI:adxPack.minusDI, reasons: reasons, warning: warning,
    tradePlan: plan, candleCloseTime: candles[candles.length - 1].closeTime
  };
}




function analyzeSymbol_(symbol, interval) {
  const pack = getKlinesWithProvider_(normalizeSymbol_(symbol), interval, CFG.KLINES_LIMIT);
  return analyzeCandles_(normalizeSymbol_(symbol), interval, pack.candles, pack.provider);
}




function buildTradePlan_(x) {
  const signal = x.signal;
  const price = Number(x.price), ema9 = Number(x.ema9), ema21 = Number(x.ema21);
  let atr = Number(x.atr);
  if (!isFinite(atr) || atr <= 0) atr = Math.max(price * 0.005, 0.00000001);

  const recent = (x.candles || []).slice(-CFG.SWING_LOOKBACK);
  const swingLow = recent.length ? Math.min.apply(null, recent.map(function(c) { return Number(c.low); })) : price - atr;
  const swingHigh = recent.length ? Math.max.apply(null, recent.map(function(c) { return Number(c.high); })) : price + atr;

  let entry, stop;
  if (signal === 'BULLISH WATCH') {
    const pullback = Math.min(price, Math.max(ema9, ema21));
    entry = Math.max(price - CFG.ENTRY_MAX_PULLBACK_ATR * atr, pullback);
    stop = Math.min(entry - CFG.STOP_ATR_MIN * atr, swingLow - 0.10 * atr);
    stop = Math.max(stop, entry - CFG.STOP_ATR_MAX * atr);
  } else {
    const pullback = Math.max(price, Math.min(ema9, ema21));
    entry = Math.min(price + CFG.ENTRY_MAX_PULLBACK_ATR * atr, pullback);
    stop = Math.max(entry + CFG.STOP_ATR_MIN * atr, swingHigh + 0.10 * atr);
    stop = Math.min(stop, entry + CFG.STOP_ATR_MAX * atr);
  }

  const risk = Math.max(Math.abs(entry - stop), atr * 0.5);
  const dir = signal === 'BULLISH WATCH' ? 1 : -1;
  const tp1 = entry + dir * risk * CFG.TP1_RR;
  const tp2 = entry + dir * risk * CFG.TP2_RR;
  const tp3 = entry + dir * risk * CFG.TP3_RR;
  const zone = CFG.ENTRY_ZONE_ATR * atr;

  return {
    entry: entry, entryLow: entry - zone, entryHigh: entry + zone,
    stopLoss: stop, tp1: tp1, tp2: tp2, tp3: tp3,
    rr1: Math.abs(tp1 - entry) / risk, rr2: Math.abs(tp2 - entry) / risk, rr3: Math.abs(tp3 - entry) / risk,
    riskPct: entry ? risk / entry * 100 : 0,
    atr: atr, support: swingLow, resistance: swingHigh
  };
}




function smartCryptoScore_(a){ const rr=a.tradePlan?Number(a.tradePlan.rr1||0):0; return (a.strength||0)*20 + Math.min(15,(a.volumeRatio||0)*6) + regimeBonus_(a.regime,a.signal) + Math.min(10,rr*4) - (a.warning?5:0); }




function signalNowCryptoQuality_(a) {
  // smartCryptoScore_ normally tops out around the 130s. Normalize to a readable 0–100 rank.
  const raw = Number(smartCryptoScore_(a) || 0);
  return Math.max(0, Math.min(100, Math.round(raw / 1.37)));
}




function compareSmartCryptoSignals_(a,b){ return smartCryptoScore_(b)-smartCryptoScore_(a) || compareSignals_(a,b); }
/* v13.7: sort MTF-confirmed bullish candidates by combined 15m + 30m strength. */
/* v13.9: 30m confirmation pass logic shared by auto cycle, manual post, and deep-check.
   STRICT = 30m must be a full BULLISH WATCH. LEAN = 30m not bearish + bullish lean. */




function compareSignals_(a, b) {
  if (b.strength !== a.strength) return b.strength - a.strength;
  if (b.score !== a.score) return b.score - a.score;
  return Math.abs(b.changePct) - Math.abs(a.changePct);
}

/* =========================================================
 * POSTING / ANTI-DUPLICATE / HISTORY
 * ========================================================= */




function compareMtfConfirmedSignals_(x, y) {
  function s3(v) {
    return Number(v.strength || 0) +
           Number(v.mtfConfirm && v.mtfConfirm.strength || 0) +
           Number(v.mtfConfirm4h && v.mtfConfirm4h.strength || 0);
  }
  var xs = s3(x), ys = s3(y);
  if (ys !== xs) return ys - xs;
  return compareSmartCryptoSignals_(x, y);
}

/* 4h second confirmation — SOFT: tidak pernah veto (jumlah post tidak berkurang),
   hanya bonus bila searah / penalti bila berlawanan. */
function mtfConfirm4hPass_(c) {
  var boost = Number(CFG.MTF_CONFIRM_4H_BOOST || 6);
  var penalty = Number(CFG.MTF_CONFIRM_4H_PENALTY || 10);
  if (!c) return { pass: true, boost: 0, note: 'tidak ada data 4h' };
  var sig = String(c.signal || '');
  var isBull = sig.indexOf('BULL') === 0;
  var isBear = sig.indexOf('BEAR') === 0;
  if (isBull && c.tradePlan) return { pass: true, boost: boost };
  if (isBear) return { pass: true, boost: 0, penalty: -penalty };
  var bullScore = Number(c.bullScore || 0), bearScore = Number(c.bearScore || 0);
  if (bullScore >= bearScore) return { pass: true, boost: 3, lean: true };
  return { pass: true, boost: 0, penalty: -5, weak: true };
}




function mtfConfirmPass_(c) {
  if (!c) return { pass:false, reason:'tidak ada data 30m' };
  var mode = String(CFG.MTF_CONFIRM_MODE || 'LEAN').toUpperCase();
  var sig = String(c.signal || '');
  var isBull = sig.indexOf('BULL') === 0;
  var isBear = sig.indexOf('BEAR') === 0;
  if (mode === 'STRICT') {
    return (isBull && !!c.tradePlan)
      ? { pass:true, boost:8 }
      : { pass:false, reason:'30m ' + sig + ' (mode STRICT butuh BULLISH)' };
  }
  if (isBear) return { pass:false, reason:'30m bearish (' + sig + ')' };
  var bullScore = Number(c.bullScore || 0), bearScore = Number(c.bearScore || 0);
  if (isBull && c.tradePlan) return { pass:true, boost:8 };
  if (bullScore >= bearScore) return { pass:true, boost:3, lean:true };
  return { pass:true, boost:0, penalty:-5, weak:true };
}




function scanActiveMarket_(interval) {
  const symbols = selectActiveSymbols_();
  const batch = fetchOkxKlinesBatch_(symbols, interval, CFG.KLINES_LIMIT);
  const results = [];
  const errors = [];

  symbols.forEach(function(symbol) {
    try {
      let pack = batch[symbol];
      if (!pack || !pack.candles || pack.candles.length < 80) {
        pack = getKlinesWithProvider_(symbol, interval, CFG.KLINES_LIMIT);
      }
      results.push(analyzeCandles_(symbol, interval, pack.candles, pack.provider));
    } catch (err) {
      errors.push(symbol + ': ' + errorText_(err));
    }
  });

  results.sort(compareSignals_);
  try {
    dirStateUpdateBatch_(results.map(function(a) { return { symbol: a.symbol, dir: dirOfSignal_(a.signal) }; }));
  } catch (_) {}
  return { symbols: symbols, results: results, errors: errors };
}




/** Stablecoin tidak pernah jadi kandidat signal. */
function isStablecoin_(symbol) {
  var base = '';
  try { base = baseSymbol_(symbol); } catch (_) { return false; }
  var list = CFG.STABLECOINS || [];
  return list.indexOf(base) >= 0;
}

function selectActiveSymbols_() {
  var limit = getActiveScanLimit_();
  var out = [];
  function add(s) {
    s = normalizeSymbol_(s);
    if (!s || isStablecoin_(s)) return;
    if (out.indexOf(s) < 0 && out.length < limit) out.push(s);
  }
  try { getFavorites_().forEach(add); } catch (_) {}
  try { getActiveSignalSymbols_().forEach(add); } catch (_) {}
  try { getTopMovers_(limit).forEach(add); } catch (_) {}
  try { getAllTrackedSymbols_().forEach(add); } catch (_) {}
  return out;
}

function getActiveSignalSymbols_() {
  var rows = [];
  try { rows = getSignalRows_(); } catch (_) { return []; }
  var out = [];
  rows.forEach(function(r) {
    var st = String(r.status || 'ACTIVE').toUpperCase();
    if (['ACTIVE', 'TP1_HIT', 'TP2_HIT'].indexOf(st) >= 0) {
      var s = normalizeSymbol_(r.symbol);
      if (s && out.indexOf(s) < 0) out.push(s);
    }
  });
  return out;
}

function getFavorites_() {
  const raw = getProp_('FAVORITES', false) || CFG.DEFAULT_FAVORITES.join(',');
  // Crypto-only: only explicit USDT/USDC pairs survive. This drops IDX/forex
  // leftovers (e.g. BMRI, BBRI) from old FAVORITES properties — normalizeSymbol_
  // would otherwise turn them into fake "BMRIUSDT" symbols.
  return unique_(raw.split(',')
    .map(function(x) { return String(x || '').trim().toUpperCase(); })
    .filter(function(x) { return !!x && /(USDT|USDC)$/.test(x); })
    .map(normalizeSymbol_)
    .filter(Boolean));
}

/** One-time: reset FAVORITES property to the crypto-only default. */
function resetFavoritesToCrypto() {
  PropertiesService.getScriptProperties().setProperty('FAVORITES', CFG.DEFAULT_FAVORITES.join(','));
  console.log('FAVORITES reset: ' + CFG.DEFAULT_FAVORITES.join(','));
  return { ok: true, favorites: CFG.DEFAULT_FAVORITES };
}




function getCategorySymbols_(cat) {
  switch (String(cat || '').toLowerCase()) {
    case 'fav': return getFavorites_();
    case 'trend': return getTrendingTracked_(60);
    case 'l1': return unique_(COINS.LAYER1);
    case 'meme': return unique_(COINS.MEME);
    case 'ai': return unique_(COINS.AI);
    case 'defi': return unique_(COINS.DEFI);
    case 'l2': return unique_(COINS.LAYER2);
    case 'alt': return unique_(COINS.ALT);
    case 'all': return getAllTrackedSymbols_().sort();
    default: return getFavorites_();
  }
}




function getActiveScanLimit_() { return Math.max(8, Math.min(120, getIntProp_('ACTIVE_SCAN_LIMIT', CFG.ACTIVE_SCAN_LIMIT))); }




function getTrendingTracked_(limit) {
  try {
    return getTrackedTickerRows_().slice(0, limit || 60).map(function(r) { return r.symbol; });
  } catch (_) {
    return getAllTrackedSymbols_().slice(0, limit || 60);
  }
}




function getTrackedTickerRows_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'CRYPTO_TRACKED_TICKERS_V4_OKX_ONLY';
  const cached = cache.get(cacheKey);
  if (cached) {
    const parsed = safeJsonParse_(cached);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  }

  const rows = getOkxTrackedTickerRows_();
  if (!rows.length) throw new Error('OKX ticker kosong.');
  try { cache.put(cacheKey, JSON.stringify(rows), 300); } catch (_) {}
  return rows;
}




function getOkxTrackedTickerRows_() {
  const url = 'https://www.okx.com/api/v5/market/tickers?instType=SPOT';
  const res = UrlFetchApp.fetch(url, { method:'get', muteHttpExceptions:true, headers:marketHeaders_() });
  const code = res.getResponseCode();
  const raw = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('HTTP ' + code + ': ' + raw.slice(0, 300));

  const body = safeJsonParse_(raw);
  if (!body || String(body.code) !== '0' || !Array.isArray(body.data)) {
    throw new Error('ticker response tidak valid');
  }

  const tracked = {};
  getAllTrackedSymbols_().forEach(function(s) { tracked[s] = true; });

  return body.data.map(function(x) {
    const inst = String(x.instId || '').toUpperCase();
    const symbol = inst.replace(/-/g, '');
    const last = Number(x.last || 0);
    const open24h = Number(x.open24h || 0);
    const turnover = Number(x.volCcy24h || 0); // SPOT: quote-currency volume, e.g. USDT.
    return {
      symbol: symbol,
      turnover: turnover,
      volume: Number(x.vol24h || 0),
      lastPrice: last,
      changePct: open24h > 0 ? ((last / open24h) - 1) * 100 : 0,
      provider: 'OKX'
    };
  }).filter(function(x) {
    return tracked[x.symbol] && isFinite(x.turnover) && x.turnover > 0 && isFinite(x.lastPrice) && x.lastPrice > 0;
  }).sort(function(a, b) {
    return b.turnover - a.turnover;
  });
}


/* =========================================================
 * IDX UNIVERSE / SCREENING
 * ========================================================= */




function saveLastScan_(results, errors) {
  const compact = {
    at: Date.now(), atText: nowText_(),
    top: results.slice(0, 10).map(function(a) {
      return { symbol:a.symbol, signal:a.signal, strength:a.strength, score:a.score, interval:a.interval };
    }),
    errors: errors.slice(0, 5)
  };
  PropertiesService.getScriptProperties().setProperty('LAST_SCAN', JSON.stringify(compact));
}




function processSignalStrengthChanges_(results,type){
  const p=PropertiesService.getScriptProperties(); const now=Date.now();
  (results||[]).slice(0,20).forEach(function(a){
    const key='WATCH_STATE_'+type+'_'+(type==='IDX'?a.ticker:a.symbol); const old=safeJsonParse_(p.getProperty(key)||'')||{};
    const score=type==='IDX'?Number(a.setupScore||0):Number(a.strength||0)*20+Number(a.score||0);
    const oldScore=Number(old.score||score), delta=score-oldScore, strengthDelta=Number(a.strength||0)-Number(old.strength||a.strength||0);
    const lastNotice=Number(old.noticeAt||0);
    // v10.5: keep watch-state internally, but do not spam Telegram with SIGNAL UPGRADE/DOWNGRADE.
    // It can be re-enabled explicitly from Script Properties if ever needed.
    if(getBoolProp_('SIGNAL_STRENGTH_ALERTS_ENABLED', CFG.SIGNAL_STRENGTH_ALERTS_ENABLED) &&
       old.signal===a.signal && a.signal!=='NEUTRAL' && (Math.abs(strengthDelta)>=1 || Math.abs(delta)>=10) && now-lastNotice>3600000){
      notifyAdmin_([(delta>0||strengthDelta>0?'⬆️ SIGNAL UPGRADE':'⬇️ SIGNAL DOWNGRADE'), (type==='IDX'?'🇮🇩 '+a.ticker:'🪙 '+a.symbol), 'Strength: '+(old.strength||0)+'/5 → '+(a.strength||0)+'/5', type==='IDX'?'Setup score: '+Math.round(oldScore)+' → '+Math.round(score):'Regime: '+(a.regime||'-')].join('\n'));
      old.noticeAt=now;
    }
    p.setProperty(key,JSON.stringify({signal:a.signal,strength:a.strength,score:score,noticeAt:old.noticeAt||0,squareNoticeAt:old.squareNoticeAt||0,at:now}));
  });
}




function getDefaultTimeframe_() {
  const tf = getProp_('DEFAULT_TIMEFRAME', false) || CFG.DEFAULT_INTERVAL;
  return ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d'].indexOf(tf) >= 0 ? tf : CFG.DEFAULT_INTERVAL;
}




function baseSymbol_(s) { return String(s || '').replace(/USDT$|USDC$/,''); }




function directionIcon_(d) {
  return d === 'BULLISH' ? '🟢' : (d === 'BEARISH' ? '🔴' : '⚪');
}




function formatScanSummary_(results, errors, interval) {
  const lines = ['📡 ACTIVE MARKET SCAN • ' + interval, 'Scanned: ' + results.length + ' coin', ''];
  const shown = results.slice(0, 15);
  shown.forEach(function(a) {
    const icon = a.signal === 'BULLISH WATCH' ? '🟢' : (a.signal === 'BEARISH WATCH' ? '🔴' : '⚪');
    lines.push(icon + ' ' + baseSymbol_(a.symbol) + ' • ' + (a.strength || '-') + '/5 • B' + a.bullScore + '/S' + a.bearScore + ' • RSI ' + round_(a.rsi,1));
  });
  if (results.length > shown.length) lines.push('… +' + (results.length - shown.length) + ' coin lainnya');
  if (errors.length) lines.push('', 'Skipped/error: ' + errors.length);
  lines.push('', 'Klik coin di bawah untuk detail.');
  return lines.join('\n');
}




function average_(a) { if (!a || !a.length) return 0; return a.reduce(function(s,x){ return s + Number(x || 0); },0) / a.length; }




function unique_(a) { const seen = {}; return a.filter(function(x) { if (!x || seen[x]) return false; seen[x] = true; return true; }); }




function chunk_(arr, n) { const out=[]; for (let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; }




function signed_(n,d) { n=round_(n,d); return (n>0?'+':'') + n; }




function formatPctSigned_(n,d) {
  n=Number(n||0); return (n>0?'+':'')+round_(n,d==null?2:d)+'%';
}



function getAllTrackedSymbols_() {
  return unique_([].concat(COINS.CORE, COINS.LAYER1, COINS.MEME, COINS.AI, COINS.DEFI, COINS.LAYER2, COINS.ALT));
}


/* ================= DIRECTION STATE =================
 * Tracks per-coin market direction across cycles so autopost never repeats
 * the same coin + same direction unless the direction actually changed.
 * Sharded across 4 properties (GAS property value limit is 9KB).
 */
var DIR_SHARDS = 4;
function dirShard_(symbol) { return 'DIR_STATE_' + (String(symbol).charCodeAt(0) % DIR_SHARDS); }

function dirOfSignal_(signal) {
  var s = String(signal || '');
  if (s.indexOf('BULL') === 0) return 'BULL';
  if (s.indexOf('BEAR') === 0) return 'BEAR';
  return 'NEUTRAL';
}

function dirStateRead_(key) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '{}'); }
  catch (_) { return {}; }
}

/* updates: [{symbol, dir}] — call once per scan cycle. */
function dirStateUpdateBatch_(updates) {
  var p = PropertiesService.getScriptProperties();
  var now = Date.now();
  var shards = {};
  updates.forEach(function(u) {
    var key = dirShard_(u.symbol);
    var st = shards[key] || (shards[key] = dirStateRead_(key));
    var cur = st[u.symbol] || {};
    if (cur.seen && cur.seen !== u.dir) cur.dirChangedAt = now;
    cur.seen = u.dir;
    cur.seenAt = now;
    st[u.symbol] = cur;
  });
  Object.keys(shards).forEach(function(key) {
    var st = shards[key], names = Object.keys(st);
    // prune: drop entries not seen in 48h, hard cap 150 per shard
    var cutoff = now - 48 * 3600000;
    names.forEach(function(nm) { if (Number(st[nm].seenAt || 0) < cutoff) delete st[nm]; });
    names = Object.keys(st);
    if (names.length > 150) {
      names.sort(function(a, b) { return Number(st[a].seenAt || 0) - Number(st[b].seenAt || 0); });
      names.slice(0, names.length - 150).forEach(function(nm) { delete st[nm]; });
    }
    try { p.setProperty(key, JSON.stringify(st)); } catch (e) { console.log('dirState save: ' + errorText_(e)); }
  });
}

function dirStateMarkPosted_(symbol, dir) {
  var key = dirShard_(symbol);
  var st = dirStateRead_(key);
  var cur = st[symbol] || {};
  cur.posted = dir;
  cur.postedAt = Date.now();
  st[symbol] = cur;
  try { PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(st)); } catch (_) {}
}

/* Block repost of the same coin + same direction unless direction changed since last post. */
function directionGate_(symbol, dir) {
  var cur = dirStateRead_(dirShard_(symbol))[symbol];
  if (!cur || !cur.posted) return { allowed: true, reason: 'first post' };
  if (String(cur.posted) === String(dir) && Number(cur.dirChangedAt || 0) <= Number(cur.postedAt || 0)) {
    return { allowed: false, reason: baseSymbol_(symbol) + ' already posted ' + dir + ' — no direction change since last post' };
  }
  return { allowed: true, reason: 'direction changed since last post' };
}

/* ==================================================================
 * SECTION: Patterns.gs  (18 functions)
 * ================================================================== */

/**
 * AZZATSSINS v13.6 — PATTERN RECOGNITION MODULE (Patterns.gs)
 * Chart pattern + candlestick pattern detection for crypto signals.
 * Pure technical computation (no network). Safe to call from deep-check gate.
 *
 * Main entry: analyzeChartPatterns_(symbol, interval, candles)
 *   -> { ok, symbol, interval, patterns:[...], bias, confidence, summary }
 *
 * Each pattern: { name, type, direction:'BULLISH'|'BEARISH'|'NEUTRAL',
 *                 confidence:0-100, status:'CONFIRMED'|'FORMING',
 *                 level, target, stopHint, note }
 */

/* =========================================================
 * ZIGZAG SWING DETECTION
 * ========================================================= */

function zigzagSwings_(candles, depth) {
  depth = Math.max(3, Math.min(12, Number(depth) || 5));
  var raw = [], i, k;
  for (i = depth; i < candles.length - depth; i++) {
    var isH = true, isL = true;
    for (k = i - depth; k <= i + depth; k++) {
      if (k === i) continue;
      if (Number(candles[k].high) >= Number(candles[i].high)) isH = false;
      if (Number(candles[k].low) <= Number(candles[i].low)) isL = false;
      if (!isH && !isL) break;
    }
    if (isH) raw.push({ index: i, price: Number(candles[i].high), type: 'H', time: candles[i].time || candles[i].closeTime || 0 });
    else if (isL) raw.push({ index: i, price: Number(candles[i].low), type: 'L', time: candles[i].time || candles[i].closeTime || 0 });
  }
  // Enforce strict alternation H,L,H,L... keep the more extreme of same-type runs.
  var out = [];
  raw.forEach(function(p) {
    var last = out[out.length - 1];
    if (last && last.type === p.type) {
      if (p.type === 'H' && p.price > last.price) out[out.length - 1] = p;
      else if (p.type === 'L' && p.price < last.price) out[out.length - 1] = p;
    } else {
      out.push(p);
    }
  });
  return out;
}

function patternAtr_(candles) {
  try {
    var a = atrWilder_(candles, 14);
    if (isFinite(a) && a > 0) return a;
  } catch (_) {}
  var last = candles[candles.length - 1];
  return Math.max(Number(last.close) * 0.01, 1e-9);
}

function patternLastCloses_(candles, n) {
  return candles.slice(-n).map(function(c) { return Number(c.close); });
}

/* Linear regression slope (price per candle) over swing points. */
function swingSlope_(points) {
  var n = points.length;
  if (n < 2) return 0;
  var sx = 0, sy = 0, sxx = 0, sxy = 0, i;
  for (i = 0; i < n; i++) { sx += points[i].index; sy += points[i].price; }
  var mx = sx / n, my = sy / n;
  for (i = 0; i < n; i++) {
    var dx = points[i].index - mx;
    sxx += dx * dx; sxy += dx * (points[i].price - my);
  }
  return sxx > 0 ? sxy / sxx : 0;
}

/* =========================================================
 * DOUBLE TOP / DOUBLE BOTTOM
 * ========================================================= */

function detectDoubleTopBottom_(swings, candles, atr) {
  var out = [];
  if (swings.length < 3) return out;
  var closes = patternLastCloses_(candles, 1);
  var price = closes[0];

  for (var i = 0; i + 2 < swings.length; i++) {
    var p1 = swings[i], mid = swings[i + 1], p2 = swings[i + 2];
    // Need L,H,L (bottom) or H,L,H (top)
    var isBottom = (p1.type === 'L' && mid.type === 'H' && p2.type === 'L');
    var isTop = (p1.type === 'H' && mid.type === 'L' && p2.type === 'H');
    if (!isBottom && !isTop) continue;

    var span = p2.index - p1.index;
    if (span < 10 || span > 90) continue; // too tight or too stretched

    var levelDiff = Math.abs(p1.price - p2.price);
    if (levelDiff > 0.45 * atr) continue; // lows/highs not parallel enough

    var neckline = mid.price;
    var depth = Math.abs(neckline - (p1.price + p2.price) / 2);
    if (depth < 0.9 * atr) continue; // pattern too shallow to matter

    var base = (p1.price + p2.price) / 2;
    var confirmed = false, forming = false;
    if (isBottom) {
      if (price > neckline + 0.1 * atr) confirmed = true;
      else if (price > neckline - 0.6 * atr) forming = true;
    } else {
      if (price < neckline - 0.1 * atr) confirmed = true;
      else if (price < neckline + 0.6 * atr) forming = true;
    }
    if (!confirmed && !forming) continue;

    var symmetry = Math.max(0, 1 - levelDiff / (0.45 * atr));
    var confidence = Math.round(52 + symmetry * 22 + (confirmed ? 14 : 0) + Math.min(12, depth / atr * 4));
    confidence = Math.min(96, confidence);

    out.push({
      name: isBottom ? 'Double Bottom' : 'Double Top',
      type: isBottom ? 'DOUBLE_BOTTOM' : 'DOUBLE_TOP',
      direction: isBottom ? 'BULLISH' : 'BEARISH',
      confidence: confidence,
      status: confirmed ? 'CONFIRMED' : 'FORMING',
      level: neckline,
      target: isBottom ? neckline + depth : neckline - depth,
      stopHint: isBottom ? base - 0.4 * atr : base + 0.4 * atr,
      note: (confirmed ? 'Neckline break confirmed' : 'Approaching neckline') +
            ' • depth ' + (depth / atr).toFixed(1) + ' ATR'
    });
  }
  return out;
}

/* =========================================================
 * TRIANGLES (ascending / descending / symmetric)
 * ========================================================= */

function detectTriangles_(swings, candles, atr) {
  var out = [];
  if (swings.length < 5) return out;
  var take = swings.slice(-9);
  var highs = take.filter(function(p) { return p.type === 'H'; });
  var lows = take.filter(function(p) { return p.type === 'L'; });
  if (highs.length < 2 || lows.length < 2) return out;

  var sH = swingSlope_(highs) / atr; // slope in ATR per candle
  var sL = swingSlope_(lows) / atr;
  var price = Number(candles[candles.length - 1].close);
  var flatTol = 0.012;

  var kind = null, direction = 'NEUTRAL';
  if (Math.abs(sH) <= flatTol && sL > flatTol) { kind = 'ASCENDING_TRIANGLE'; direction = 'BULLISH'; }
  else if (sH < -flatTol && Math.abs(sL) <= flatTol) { kind = 'DESCENDING_TRIANGLE'; direction = 'BEARISH'; }
  else if (sH < -flatTol && sL > flatTol) { kind = 'SYMMETRIC_TRIANGLE'; direction = 'NEUTRAL'; }
  else return out;

  // Convergence check: projected lines must meet within reasonable distance.
  var lastH = highs[highs.length - 1], lastL = lows[lows.length - 1];
  var span = Math.max(1, lastH.index - highs[0].index + (lastL.index - lows[0].index));
  var gap = Math.abs(lastH.price - lastL.price);
  if (gap > 6 * atr) return out; // not a real triangle, just drift

  var upper = lastH.price, lower = lastL.price;
  var brokenUp = price > upper + 0.1 * atr;
  var brokenDown = price < lower - 0.1 * atr;
  var status = (brokenUp || brokenDown) ? 'CONFIRMED' : 'FORMING';
  if (status === 'CONFIRMED') {
    direction = brokenUp ? 'BULLISH' : 'BEARISH';
    kind = kind + '_BREAKOUT';
  } else if (direction === 'NEUTRAL') {
    // symmetric without breakout: lean with position inside triangle
    var mid = (upper + lower) / 2;
    direction = price >= mid ? 'BULLISH' : 'BEARISH';
  }

  var touches = highs.length + lows.length;
  var confidence = Math.round(50 + Math.min(20, touches * 3) + (status === 'CONFIRMED' ? 14 : 0));
  confidence = Math.min(94, confidence);
  var height = Math.max(atr, gap);

  out.push({
    name: kind.split('_').map(function(w){ return w.charAt(0) + w.slice(1).toLowerCase(); }).join(' '),
    type: kind,
    direction: direction,
    confidence: status === 'CONFIRMED' ? confidence : Math.max(40, confidence - 18),
    status: status,
    level: brokenDown ? lower : upper,
    target: direction === 'BULLISH' ? price + height : (direction === 'BEARISH' ? price - height : price),
    stopHint: direction === 'BULLISH' ? lower - 0.3 * atr : (direction === 'BEARISH' ? upper + 0.3 * atr : price),
    note: touches + ' touches • ' + status.toLowerCase() + ' • span ' + span + ' candles'
  });
  return out;
}

/* =========================================================
 * WEDGES (rising = bearish, falling = bullish)
 * ========================================================= */

function detectWedges_(swings, candles, atr) {
  var out = [];
  if (swings.length < 5) return out;
  var take = swings.slice(-9);
  var highs = take.filter(function(p) { return p.type === 'H'; });
  var lows = take.filter(function(p) { return p.type === 'L'; });
  if (highs.length < 2 || lows.length < 2) return out;

  var sH = swingSlope_(highs) / atr;
  var sL = swingSlope_(lows) / atr;
  var tol = 0.012;
  var kind = null, direction = 'NEUTRAL';

  // Rising wedge: both rising, upper flatter -> converges upward -> bearish
  if (sH > tol && sL > tol && sH < sL * 0.85) { kind = 'RISING_WEDGE'; direction = 'BEARISH'; }
  // Falling wedge: both falling, lower flatter -> converges downward -> bullish
  else if (sH < -tol && sL < -tol && sH < sL * 1.15) { kind = 'FALLING_WEDGE'; direction = 'BULLISH'; }
  else return out;

  var lastH = highs[highs.length - 1], lastL = lows[lows.length - 1];
  var gap = Math.abs(lastH.price - lastL.price);
  if (gap > 6 * atr || gap < 0.4 * atr) return out;

  var price = Number(candles[candles.length - 1].close);
  var brokenUp = price > lastH.price + 0.1 * atr;
  var brokenDown = price < lastL.price - 0.1 * atr;
  var status = (brokenUp || brokenDown) ? 'CONFIRMED' : 'FORMING';
  if (status === 'CONFIRMED') direction = brokenUp ? 'BULLISH' : 'BEARISH';

  var confidence = Math.round(52 + Math.min(16, (highs.length + lows.length) * 2.5) + (status === 'CONFIRMED' ? 12 : 0));
  confidence = Math.min(93, confidence);

  out.push({
    name: kind === 'RISING_WEDGE' ? 'Rising Wedge' : 'Falling Wedge',
    type: kind,
    direction: direction,
    confidence: status === 'CONFIRMED' ? confidence : Math.max(40, confidence - 16),
    status: status,
    level: brokenDown ? lastL.price : lastH.price,
    target: direction === 'BULLISH' ? price + gap : price - gap,
    stopHint: direction === 'BULLISH' ? lastL.price - 0.3 * atr : lastH.price + 0.3 * atr,
    note: 'converging ' + (kind === 'RISING_WEDGE' ? 'upward' : 'downward') + ' • ' + status.toLowerCase()
  });
  return out;
}

/* =========================================================
 * HEAD & SHOULDERS (and inverse)
 * ========================================================= */

function detectHeadShoulders_(swings, candles, atr) {
  var out = [];
  if (swings.length < 6) return out;
  var price = Number(candles[candles.length - 1].close);

  // Need alternating L,H,L,H,L,H at the tail
  var tail = swings.slice(-6);
  var want = ['L', 'H', 'L', 'H', 'L', 'H'];
  for (var w = 0; w < 6; w++) if (tail[w].type !== want[w]) return out;

  var norm = detectHeadShouldersSide_(tail, price, atr);
  if (norm) out.push(norm);
  return out;
}

function detectHeadShouldersSide_(tail, price, atr) {
  // Classic top Head & Shoulders: the head is a high.
  // (Inverse is handled separately by detectInverseHeadShoulders_.)
  var l0 = tail[0], s1 = tail[1], l1 = tail[2], head = tail[3], l2 = tail[4], s2 = tail[5];
  var shoulderTol = 0.55 * atr, headMin = 0.55 * atr;

  if (!(head.price > s1.price + headMin && head.price > s2.price + headMin)) return null;
  if (Math.abs(s1.price - s2.price) > shoulderTol) return null;

  var neckline = (l1.price + l2.price) / 2;
  var neckSlope = Math.abs(l2.price - l1.price);
  if (neckSlope > 0.8 * atr) return null; // neckline too slanted

  var height = Math.abs(head.price - neckline);
  if (height < 1.0 * atr) return null;

  var broken = price < neckline - 0.1 * atr;
  var nearNeck = price < neckline + 0.6 * atr;
  if (!broken && !nearNeck) return null;
  var status = broken ? 'CONFIRMED' : 'FORMING';

  var sym = Math.max(0, 1 - Math.abs(s1.price - s2.price) / shoulderTol);
  var confidence = Math.round(54 + sym * 20 + (broken ? 14 : 0));
  confidence = Math.min(95, confidence);

  return {
    name: 'Head & Shoulders',
    type: 'HEAD_SHOULDERS',
    direction: 'BEARISH',
    confidence: confidence,
    status: status,
    level: neckline,
    target: neckline - height,
    stopHint: Math.max(s1.price, s2.price) + 0.4 * atr,
    note: 'neckline ' + status.toLowerCase() + ' • height ' + (height / atr).toFixed(1) + ' ATR'
  };
}

function detectInverseHeadShoulders_(swings, candles, atr) {
  var out = [];
  if (swings.length < 6) return out;
  var price = Number(candles[candles.length - 1].close);
  var tail = swings.slice(-6);
  var want = ['H', 'L', 'H', 'L', 'H', 'L'];
  for (var w = 0; w < 6; w++) if (tail[w].type !== want[w]) return out;

  var h0 = tail[0], s1 = tail[1], h1 = tail[2], head = tail[3], h2 = tail[4], s2 = tail[5];
  var shoulderTol = 0.55 * atr, headMin = 0.55 * atr;
  if (!(head.price < s1.price - headMin && head.price < s2.price - headMin)) return out;
  if (Math.abs(s1.price - s2.price) > shoulderTol) return out;

  var neckline = (h1.price + h2.price) / 2;
  if (Math.abs(h2.price - h1.price) > 0.8 * atr) return out;
  var height = Math.abs(neckline - head.price);
  if (height < 1.0 * atr) return out;

  var broken = price > neckline + 0.1 * atr;
  var nearNeck = price > neckline - 0.6 * atr;
  if (!broken && !nearNeck) return out;
  var status = broken ? 'CONFIRMED' : 'FORMING';

  var sym = Math.max(0, 1 - Math.abs(s1.price - s2.price) / shoulderTol);
  var confidence = Math.round(54 + sym * 20 + (broken ? 14 : 0));
  confidence = Math.min(95, confidence);

  out.push({
    name: 'Inverse Head & Shoulders',
    type: 'INV_HEAD_SHOULDERS',
    direction: 'BULLISH',
    confidence: confidence,
    status: status,
    level: neckline,
    target: neckline + height,
    stopHint: Math.min(s1.price, s2.price) - 0.4 * atr,
    note: 'neckline ' + status.toLowerCase() + ' • height ' + (height / atr).toFixed(1) + ' ATR'
  });
  return out;
}

/* =========================================================
 * RECTANGLE / RANGE (breakout)
 * ========================================================= */

function detectRectangles_(swings, candles, atr) {
  var out = [];
  if (swings.length < 5) return out;
  var take = swings.slice(-10);
  var highs = take.filter(function(p) { return p.type === 'H'; });
  var lows = take.filter(function(p) { return p.type === 'L'; });
  if (highs.length < 2 || lows.length < 2) return out;

  function parallel(pts) {
    var mx = Math.max.apply(null, pts.map(function(p) { return p.price; }));
    var mn = Math.min.apply(null, pts.map(function(p) { return p.price; }));
    return (mx - mn) <= 0.35 * atr ? (mx + mn) / 2 : null;
  }
  var res = parallel(highs.slice(-3));
  var sup = parallel(lows.slice(-3));
  if (res == null || sup == null) return out;
  var height = res - sup;
  if (height < 0.8 * atr || height > 8 * atr) return out;

  var price = Number(candles[candles.length - 1].close);
  var brokenUp = price > res + 0.1 * atr;
  var brokenDown = price < sup - 0.1 * atr;
  var inside = !brokenUp && !brokenDown &&
               price < res + 0.5 * atr && price > sup - 0.5 * atr;
  if (!brokenUp && !brokenDown && !inside) return out;

  var status = (brokenUp || brokenDown) ? 'CONFIRMED' : 'FORMING';
  var direction = brokenUp ? 'BULLISH' : (brokenDown ? 'BEARISH' : 'NEUTRAL');
  var touches = Math.min(3, highs.length) + Math.min(3, lows.length);
  var confidence = Math.round(50 + touches * 5 + (status === 'CONFIRMED' ? 14 : 0));
  confidence = Math.min(93, confidence);

  out.push({
    name: 'Rectangle Range' + (status === 'CONFIRMED' ? ' Breakout' : ''),
    type: 'RECTANGLE',
    direction: direction,
    confidence: status === 'CONFIRMED' ? confidence : 45,
    status: status,
    level: brokenDown ? sup : res,
    target: direction === 'BULLISH' ? res + height : (direction === 'BEARISH' ? sup - height : price),
    stopHint: direction === 'BULLISH' ? sup - 0.3 * atr : (direction === 'BEARISH' ? res + 0.3 * atr : price),
    note: touches + ' touches • range ' + (height / atr).toFixed(1) + ' ATR • ' + status.toLowerCase()
  });
  return out;
}

/* =========================================================
 * FLAG / PENNANT (pole + tight consolidation)
 * ========================================================= */

function detectFlags_(candles, swings, atr) {
  var out = [];
  if (swings.length < 2 || candles.length < 30) return out;
  var price = Number(candles[candles.length - 1].close);

  // Find impulsive poles ending at the most recent swings
  for (var s = swings.length - 1; s >= Math.max(1, swings.length - 3); s--) {
    var tip = swings[s], base = swings[s - 1];
    var bullPole = (tip.type === 'H' && base.type === 'L');
    var bearPole = (tip.type === 'L' && base.type === 'H');
    if (!bullPole && !bearPole) continue;

    var poleMove = Math.abs(tip.price - base.price);
    var poleSpan = tip.index - base.index;
    if (poleMove < 2.2 * atr || poleSpan > 14 || poleSpan < 2) continue;

    // Consolidation: candles after the pole tip
    var cons = candles.slice(tip.index + 1);
    if (cons.length < 4 || cons.length > 24) continue;
    var cHigh = Math.max.apply(null, cons.map(function(c) { return Number(c.high); }));
    var cLow = Math.min.apply(null, cons.map(function(c) { return Number(c.low); }));
    var consRange = cHigh - cLow;
    if (consRange > 1.25 * atr) continue; // not tight enough

    // Consolidation must not retrace more than 50% of the pole
    var retrace = bullPole ? (tip.price - cLow) / poleMove : (cHigh - tip.price) / poleMove;
    if (retrace > 0.55) continue;

    var brokenUp = bullPole && price > cHigh + 0.05 * atr;
    var brokenDown = bearPole && price < cLow - 0.05 * atr;
    var status = (brokenUp || brokenDown) ? 'CONFIRMED' : 'FORMING';
    var direction = bullPole ? 'BULLISH' : 'BEARISH';
    if (status === 'CONFIRMED') direction = brokenUp ? 'BULLISH' : 'BEARISH';

    var confidence = Math.round(55 + Math.min(15, poleMove / atr * 3) + (status === 'CONFIRMED' ? 12 : 0) - retrace * 10);
    confidence = Math.min(94, Math.max(40, confidence));

    out.push({
      name: (bullPole ? 'Bull' : 'Bear') + ' Flag' + (status === 'CONFIRMED' ? ' Breakout' : ''),
      type: bullPole ? 'BULL_FLAG' : 'BEAR_FLAG',
      direction: direction,
      confidence: confidence,
      status: status,
      level: bullPole ? cHigh : cLow,
      target: bullPole ? price + poleMove * 0.9 : price - poleMove * 0.9,
      stopHint: bullPole ? cLow - 0.3 * atr : cHigh + 0.3 * atr,
      note: 'pole ' + (poleMove / atr).toFixed(1) + ' ATR in ' + poleSpan + 'c • cons range ' +
            (consRange / atr).toFixed(2) + ' ATR • ' + status.toLowerCase()
    });
    break; // only the most recent pole matters
  }
  return out;
}

/* =========================================================
 * CANDLESTICK PATTERNS (last 2-3 candles)
 * ========================================================= */

function candleParts_(c) {
  var o = Number(c.open), h = Number(c.high), l = Number(c.low), cl = Number(c.close);
  var body = Math.abs(cl - o);
  var range = Math.max(h - l, 1e-12);
  return {
    o: o, h: h, l: l, c: cl, body: body, range: range,
    bull: cl > o, bear: cl < o,
    upper: h - Math.max(o, cl), lower: Math.min(o, cl) - l,
    mid: (o + cl) / 2
  };
}

function detectCandlestickPatterns_(candles, atr) {
  var out = [];
  if (candles.length < 3) return out;
  var a = candleParts_(candles[candles.length - 2]);
  var b = candleParts_(candles[candles.length - 1]);
  var c = candleParts_(candles[candles.length - 3]);

  function push(name, type, direction, confidence, note) {
    out.push({ name: name, type: type, direction: direction, confidence: confidence,
               status: 'CONFIRMED', level: b.c, target: b.c, stopHint: b.c, note: note || '' });
  }

  // Engulfing
  if (a.bear && b.bull && b.o <= a.c && b.c >= a.o && b.body > a.body * 1.05)
    push('Bullish Engulfing', 'BULL_ENGULFING', 'BULLISH', 68, 'body ' + (b.body / atr).toFixed(2) + ' ATR');
  if (a.bull && b.bear && b.o >= a.c && b.c <= a.o && b.body > a.body * 1.05)
    push('Bearish Engulfing', 'BEAR_ENGULFING', 'BEARISH', 68, 'body ' + (b.body / atr).toFixed(2) + ' ATR');

  // Hammer / Shooting star (needs small body, long one-sided wick)
  if (b.body <= b.range * 0.35 && b.lower >= b.body * 2 && b.upper <= b.body * 0.6)
    push('Hammer', 'HAMMER', 'BULLISH', 60, 'lower wick ' + (b.lower / atr).toFixed(2) + ' ATR');
  if (b.body <= b.range * 0.35 && b.upper >= b.body * 2 && b.lower <= b.body * 0.6)
    push('Shooting Star', 'SHOOTING_STAR', 'BEARISH', 60, 'upper wick ' + (b.upper / atr).toFixed(2) + ' ATR');

  // Doji (indecision — neutral, useful as veto context only)
  if (b.body <= b.range * 0.08 && b.range > atr * 0.25)
    push('Doji', 'DOJI', 'NEUTRAL', 45, 'indecision at ' + b.c);

  // Morning / Evening star
  if (c.bear && c.body > atr * 0.4 && a.body < c.body * 0.4 && b.bull && b.body > atr * 0.4 && b.c > c.mid)
    push('Morning Star', 'MORNING_STAR', 'BULLISH', 72, '3-candle reversal');
  if (c.bull && c.body > atr * 0.4 && a.body < c.body * 0.4 && b.bear && b.body > atr * 0.4 && b.c < c.mid)
    push('Evening Star', 'EVENING_STAR', 'BEARISH', 72, '3-candle reversal');

  // Harami
  if (c.bear && c.body > atr * 0.5 && b.bull && b.o > c.c && b.c < c.o)
    push('Bullish Harami', 'BULL_HARAMI', 'BULLISH', 55, 'inside prior body');
  if (c.bull && c.body > atr * 0.5 && b.bear && b.o < c.c && b.c > c.o)
    push('Bearish Harami', 'BEAR_HARAMI', 'BEARISH', 55, 'inside prior body');

  return out;
}

/* =========================================================
 * ORCHESTRATION
 * ========================================================= */

function analyzeChartPatterns_(symbol, interval, candles) {
  var result = { ok: false, symbol: symbol, interval: interval, patterns: [],
                 bias: 'NEUTRAL', confidence: 0, summary: '' };
  try {
    if (!Array.isArray(candles) || candles.length < 40)
      return result;
    var atr = patternAtr_(candles);
    var swings = zigzagSwings_(candles, 5);
    var found = [];
    found = found.concat(detectDoubleTopBottom_(swings, candles, atr));
    found = found.concat(detectTriangles_(swings, candles, atr));
    found = found.concat(detectWedges_(swings, candles, atr));
    found = found.concat(detectHeadShoulders_(swings, candles, atr));
    found = found.concat(detectInverseHeadShoulders_(swings, candles, atr));
    found = found.concat(detectRectangles_(swings, candles, atr));
    found = found.concat(detectFlags_(candles, swings, atr));
    found = found.concat(detectCandlestickPatterns_(candles, atr));

    // Deduplicate: keep highest-confidence per direction family on same status
    var seen = {};
    var patterns = [];
    found.sort(function(x, y) { return y.confidence - x.confidence; });
    found.forEach(function(p) {
      var key = p.direction + '|' + p.status;
      if (!seen[key] || p.type.indexOf('DOJI') === 0) { seen[key] = true; patterns.push(p); }
    });

    var bullW = 0, bearW = 0;
    patterns.forEach(function(p) {
      var w = p.confidence * (p.status === 'CONFIRMED' ? 1 : 0.45);
      if (p.direction === 'BULLISH') bullW += w;
      else if (p.direction === 'BEARISH') bearW += w;
    });
    var bias = 'NEUTRAL', confidence = 0;
    if (bullW > bearW * 1.25 && bullW >= 40) { bias = 'BULLISH'; confidence = Math.min(95, Math.round(bullW / 2.2)); }
    else if (bearW > bullW * 1.25 && bearW >= 40) { bias = 'BEARISH'; confidence = Math.min(95, Math.round(bearW / 2.2)); }

    result.ok = true;
    result.patterns = patterns;
    result.bias = bias;
    result.confidence = confidence;
    result.swings = swings.length;
    result.summary = patterns.length
      ? patterns.map(function(p) { return (p.status === 'CONFIRMED' ? '✅ ' : '⏳ ') + p.name + ' ' + p.confidence; }).join(' • ')
      : 'no clear pattern';
    return result;
  } catch (e) {
    result.error = String((e && e.message) || e);
    return result;
  }
}

/* Score contribution of patterns vs the indicator signal.
   Returns { delta, veto, vetoReason, notes[] } */
function patternSignalAdjustment_(patterns, signal) {
  var adj = { delta: 0, veto: false, vetoReason: '', notes: [] };
  var sig = String(signal || '').toUpperCase();
  var sigDir = sig.indexOf('BULL') >= 0 ? 'BULLISH' : (sig.indexOf('BEAR') >= 0 ? 'BEARISH' : 'NEUTRAL');
  if (sigDir === 'NEUTRAL' || !patterns || !patterns.length) return adj;

  var minConf = Number(CFG.PATTERN_MIN_CONFIDENCE || 55);
  patterns.forEach(function(p) {
    if (p.direction === 'NEUTRAL' || p.confidence < minConf) return;
    var aligned = (p.direction === sigDir);
    var weight = p.status === 'CONFIRMED' ? 1 : 0.4;
    if (aligned) {
      var boost = Math.round(6 * weight + p.confidence / 25 * weight);
      adj.delta += boost;
      adj.notes.push('+' + boost + ' ' + p.name + ' ' + p.status.toLowerCase());
    } else {
      var cut = Math.round(10 * weight + p.confidence / 20 * weight);
      adj.delta -= cut;
      adj.notes.push('-' + cut + ' ' + p.name + ' berlawanan arah');
      var vetoConf = Number(CFG.PATTERN_VETO_CONFIDENCE || 85);
      if (p.status === 'CONFIRMED' && p.confidence >= vetoConf && CFG.PATTERN_VETO_ENABLED !== false) {
        adj.veto = true;
        adj.vetoReason = p.name + ' CONFIRMED berlawanan arah signal (conf ' + p.confidence + ')';
      }
    }
  });
  adj.delta = Math.max(-30, Math.min(30, adj.delta));
  return adj;
}

/* Manual test hook (run from GAS editor):
   testPatternDetection_('BTCUSDT','15m') */
function testPatternDetection_(symbol, interval) {
  symbol = symbol || 'BTCUSDT'; interval = interval || '15m';
  var pack = getKlinesWithProvider_(normalizeSymbol_(symbol), interval, 220);
  var r = analyzeChartPatterns_(symbol, interval, pack.candles);
  console.log(JSON.stringify({ bias: r.bias, confidence: r.confidence, summary: r.summary,
    patterns: r.patterns.map(function(p){ return p.name+'|'+p.direction+'|'+p.status+'|'+p.confidence; }) }, null, 2));
  return r;
}

/* Public wrapper (muncul di dropdown Run) */
function testPatternDetection() { return testPatternDetection_('BTCUSDT', '15m'); }

/* ==================================================================
 * SECTION: Gate.gs  (20 functions)
 * ================================================================== */

/**
 * AZZATSSINS v13.6 — PRE-PUBLISH DEEP CHECK GATE (DeepCheck.gs)
 * Second-pass re-analysis right before a signal is posted to
 * Threads / Binance Square / X / Telegram channel.
 *
 * Combines: chart patterns + MTF alignment + indicators (already in `a`)
 *          + derivatives (liquidations, top traders, whale, squeeze risk)
 *          + liquidity walls + coin news sentiment (Gemini).
 *
 * Main entry: prePublishDeepCheck_(a, mtfBundle)
 *   -> { pass:true|false, vetoReason, scoreDelta, notes[], details{} }
 *
 * Only CRYPTO is deep-checked. FOREX/IDX pass through untouched.
 */

var DEEPCHECK_COIN_NAMES_ = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple',
  DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche', LINK: 'chainlink',
  BNB: 'binance coin', SUI: 'sui', PEPE: 'pepe coin', WLD: 'worldcoin',
  ARB: 'arbitrum', OP: 'optimism', INJ: 'injective', NEAR: 'near protocol',
  ATOM: 'cosmos', DOT: 'polkadot', LTC: 'litecoin', TRX: 'tron'
};

function deepCheckSignalDir_(a) {
  var s = String(a && a.signal || '').toUpperCase();
  if (s.indexOf('BULL') >= 0) return 'BULLISH';
  if (s.indexOf('BEAR') >= 0) return 'BEARISH';
  return 'NEUTRAL';
}

function prePublishDeepCheck_(a) {
  var out = { pass: true, vetoReason: '', scoreDelta: 0, notes: [], details: {} };
  try {
    var assetType = String(a && a.assetType || 'CRYPTO').toUpperCase();
    if (assetType !== 'CRYPTO') return out; // only crypto is deep-checked
    var dir = deepCheckSignalDir_(a);
    if (dir === 'NEUTRAL' || !a.tradePlan) {
      out.pass = false; out.vetoReason = 'signal NEUTRAL / tanpa trade plan';
      return out;
    }

    // 1. Chart patterns (fresh candles, not the scan snapshot)
    try {
      var pc = deepCheckPatterns_(a, dir);
      out.details.patterns = pc.summary;
      out.scoreDelta += pc.delta;
      pc.notes.forEach(function(n) { out.notes.push(n); });
      if (pc.veto) { out.pass = false; out.vetoReason = pc.vetoReason; return out; }
    } catch (e1) { out.notes.push('pattern check skipped: ' + errorText_(e1)); }

    // 2. MTF confirmation (15m + 30m both bullish)
    try {
      var mc = deepCheckMtf_(a, dir);
      out.scoreDelta += mc.delta;
      mc.notes.forEach(function(n) { out.notes.push(n); });
      if (mc.veto) { out.pass = false; out.vetoReason = mc.vetoReason; return out; }
    } catch (e2) { out.notes.push('mtf check skipped: ' + errorText_(e2)); }

    // 3. Derivatives: liquidations, top traders, whale, squeeze risk
    try {
      var dc = deepCheckDerivatives_(a, dir);
      out.details.derivatives = dc.brief;
      out.scoreDelta += dc.delta;
      dc.notes.forEach(function(n) { out.notes.push(n); });
      if (dc.veto) { out.pass = false; out.vetoReason = dc.vetoReason; return out; }
    } catch (e3) { out.notes.push('derivatives check skipped: ' + errorText_(e3)); }

    // 4. Visible liquidity walls
    try {
      var lc = deepCheckLiquidity_(a, dir);
      lc.notes.forEach(function(n) { out.notes.push(n); });
      if (lc.veto) { out.pass = false; out.vetoReason = lc.vetoReason; return out; }
    } catch (e4) { out.notes.push('liquidity check skipped: ' + errorText_(e4)); }

    // 5. Coin news sentiment (Gemini)
    if (getBoolProp_('NEWS_SENTIMENT_VETO_ENABLED', CFG.NEWS_SENTIMENT_VETO_ENABLED)) {
      try {
        var nc = deepCheckNews_(a, dir);
        out.details.news = nc.brief;
        nc.notes.forEach(function(n) { out.notes.push(n); });
        if (nc.veto) { out.pass = false; out.vetoReason = nc.vetoReason; return out; }
      } catch (e5) { out.notes.push('news check skipped: ' + errorText_(e5)); }
    }

    // 6. 1H trend alignment (soft modifier, bukan veto — jumlah post tidak berkurang)
    try {
      var h1 = deepCheckH1Trend_(a, dir);
      out.details.h1trend = h1.brief;
      out.scoreDelta += h1.delta;
      h1.notes.forEach(function(n) { out.notes.push(n); });
    } catch (e6) { out.notes.push('1h trend check skipped: ' + errorText_(e6)); }

    // 7. BTC breadth: circuit breaker saat BTC dump
    try {
      var bb = deepCheckBtcBreadth_(a, dir);
      out.details.btcbreadth = bb.brief;
      out.scoreDelta += bb.delta;
      bb.notes.forEach(function(n) { out.notes.push(n); });
      if (bb.veto) { out.pass = false; out.vetoReason = bb.vetoReason; return out; }
    } catch (e7) { out.notes.push('btc breadth skipped: ' + errorText_(e7)); }

    // 8. Hour-of-day boost dari histori sendiri
    try {
      var hb = deepCheckHourBoost_(a, dir);
      out.scoreDelta += hb.delta;
      hb.notes.forEach(function(n) { out.notes.push(n); });
    } catch (e8) { out.notes.push('hour boost skipped: ' + errorText_(e8)); }

    out.scoreDelta = Math.max(-40, Math.min(40, out.scoreDelta));
    // v13.9: holistic quality bar — one transparent threshold instead of many hard vetoes.
    var minQ = Number(CFG.MIN_QUALITY_TO_POST || 55);
    var qNow = deepCheckQualityScore_(a, out);
    out.details.quality = qNow;
    if (qNow < minQ) {
      out.pass = false;
      out.vetoReason = 'quality ' + qNow + '/100 below minimum ' + minQ;
    }
    return out;
  } catch (e) {
    out.notes.push('deepcheck error: ' + errorText_(e));
    return out;
  }
}

/* ---------------- 1. Patterns ---------------- */

function deepCheckPatterns_(a, dir) {
  var r = { delta: 0, veto: false, vetoReason: '', notes: [], summary: '' };
  var pack = getKlinesWithProvider_(normalizeSymbol_(a.symbol), String(a.interval || '15m'), 220);
  var pr = analyzeChartPatterns_(a.symbol, a.interval, pack.candles);
  r.summary = pr.summary;
  if (!pr.ok || !pr.patterns.length) {
    r.notes.push('pattern: tidak ada pola jelas');
    return r;
  }
  var adj = patternSignalAdjustment_(pr.patterns, a.signal);
  r.delta = adj.delta;
  adj.notes.forEach(function(n) { r.notes.push('pattern ' + n); });
  if (adj.veto) { r.veto = true; r.vetoReason = adj.vetoReason; }
  return r;
}

/* ---------------- 2. MTF confirmation (15m + 30m) ---------------- */

function deepCheckMtf_(a, dir) {
  var r = { delta: 0, veto: false, vetoReason: '', notes: [] };
  var c = a.mtfConfirm;
  if (!c) { r.notes.push('mtf: konfirmasi 30m tidak tersedia'); return r; }
  var chk = mtfConfirmPass_(c);
  if (!chk.pass) {
    r.veto = true;
    r.vetoReason = 'konfirmasi 30m gagal: ' + chk.reason;
    return r;
  }
  var boost = Number(a.mtfConfirmBoost || chk.boost || 0);
  var pen = Number(a.mtfConfirmPenalty || chk.penalty || 0);
  if (boost) r.notes.push('mtf +' + boost + ': 15m & 30m bullish' + (chk.lean ? ' lean' : ' confluence'));
  if (pen) { r.delta += pen; r.notes.push('mtf ' + pen + ': weak 30m lean'); }
  else r.delta += boost;

  // 4h second confirmation (soft scoring; dihitung on-demand bila belum ada)
  if (getBoolProp_('MTF_CONFIRM_4H_ENABLED', CFG.MTF_CONFIRM_4H_ENABLED)) {
    var c4 = a.mtfConfirm4h;
    if (!c4) {
      try { c4 = analyzeSymbol_(a.symbol, '4h'); a.mtfConfirm4h = c4; }
      catch (e4) { r.notes.push('mtf 4h: data tidak tersedia'); }
    }
    if (c4) {
      var chk4 = mtfConfirm4hPass_(c4);
      var b4 = Number(a.mtfConfirm4hBoost || chk4.boost || 0);
      var p4 = Number(a.mtfConfirm4hPenalty || chk4.penalty || 0);
      var sig4 = String(c4.signal || '');
      if (b4) { r.delta += b4; r.notes.push('mtf 4h +' + b4 + ': 15m/30m/4h searah' + (chk4.lean ? ' lean' : '')); }
      if (p4) { r.delta += p4; r.notes.push('mtf 4h ' + p4 + ': 4h ' + sig4.toLowerCase()); }
      if (!b4 && !p4) r.notes.push('mtf 4h: netral');
    }
  }
  return r;
}

/* ---------------- 3. Derivatives ---------------- */

function deepCheckDerivatives_(a, dir) {
  var r = { delta: 0, veto: false, vetoReason: '', notes: [], brief: '' };
  var adv = getAdvancedDerivativesSnapshot_(a.symbol, CFG.DERIVATIVES_DEFAULT_PERIOD || '4h', false);
  if (!adv || !adv.gate) { r.notes.push('deriv: snapshot tidak tersedia'); return r; }
  var g = adv.gate, d = g.derived || {}, pos = g.positioning || {}, liq = g.actualLiquidations || {};
  var levRisk = Number(d.leverageRiskIndex || 0);
  var funding = Number(g.fundingRate || 0);
  var fundExtreme = Number(CFG.DERIV_FUNDING_EXTREME || 0.001);

  r.brief = 'levRisk ' + levRisk + ' • fund ' + funding +
            ' • smart ' + Number(d.smartMoneyScore || 50) +
            ' • regime ' + String(d.regime || '-');

  // a. Leverage crowding (v13.9: hard veto only when extreme, else penalty)
  if (levRisk >= Number(CFG.DERIV_LEVERAGE_RISK_VETO || 90)) {
    r.veto = true;
    r.vetoReason = 'leverage risk index ' + levRisk + '/100 — pasar terlalu crowded, risiko flush tinggi';
    return r;
  }
  if (levRisk >= 70) { r.delta -= 10; r.notes.push('deriv -10: leverage risk ' + levRisk); }

  // b. Extreme funding against the signal direction = crowded trade
  if (Math.abs(funding) >= fundExtreme) {
    var fundBullish = funding > 0; // positive funding = longs pay shorts = crowded long
    var against = (dir === 'BULLISH' && fundBullish) || (dir === 'BEARISH' && !fundBullish);
    if (against) {
      r.veto = true;
      r.vetoReason = 'funding ekstrem ' + funding + ' berlawanan arah signal ' + dir + ' (crowded ' +
                     (fundBullish ? 'long' : 'short') + ', rawan squeeze)';
      return r;
    }
    r.delta += 5; r.notes.push('deriv +5: Funding supports direction');
  }

  // c. Squeeze risk against the signal
  var sqRisk = dir === 'BULLISH' ? Number(d.longSqueezeRisk || 0) : Number(d.shortSqueezeRisk || 0);
  if (sqRisk >= Number(CFG.DERIV_SQUEEZE_RISK_VETO || 85)) {
    r.veto = true;
    r.vetoReason = (dir === 'BULLISH' ? 'long' : 'short') + ' squeeze risk ' + sqRisk +
                   '/100 searah signal — setup rawan stop-hunt';
    return r;
  }
  if (sqRisk >= 65) { r.delta -= 8; r.notes.push('deriv -8: squeeze risk ' + sqRisk); }

  // d. Top traders / whale positioning against the signal
  var topLong = Number(pos.topAccountLongPct || 50);
  var divergence = Number(pos.whaleRetailDivergencePct || 0);
  var extLong = Number(CFG.DERIV_TOP_TRADER_EXTREME_LONG || 25);
  var whaleShortX = dir === 'BULLISH' && topLong <= extLong && divergence <= -15;
  var whaleLongX = dir === 'BEARISH' && topLong >= (100 - extLong) && divergence >= 15;
  if (whaleShortX || whaleLongX) {
    r.veto = true;
    r.vetoReason = 'top traders sangat berlawanan arah (' + String(pos.whaleRetailLabel || '') +
                   ', top long ' + topLong + '%)';
    return r;
  }
  var penLong = Number(CFG.DERIV_TOP_TRADER_VETO_LONG || 35);
  if ((dir === 'BULLISH' && topLong <= penLong && divergence <= -10) ||
      (dir === 'BEARISH' && topLong >= (100 - penLong) && divergence >= 10)) {
    r.delta -= 12; r.notes.push('deriv -12: top traders against (' + topLong + '% long)');
  }
  var smartScore = Number(d.smartMoneyScore || 50);
  if ((dir === 'BULLISH' && smartScore >= 60) || (dir === 'BEARISH' && smartScore <= 40)) {
    r.delta += 6; r.notes.push('deriv +6: Smart money aligned');
  } else if ((dir === 'BULLISH' && smartScore <= 40) || (dir === 'BEARISH' && smartScore >= 60)) {
    r.delta -= 6; r.notes.push('deriv -6: Smart money against signal');
  }

  // e. Liquidation event regime = stand aside (informational)
  if (String(d.regime || '').indexOf('LIQUIDATION EVENT') >= 0) {
    r.delta -= 15; r.notes.push('deriv -15: liquidation event (high volatility)');
  }
  if (liq.spike) r.notes.push('deriv note: liquidation spike x' + Number(liq.spikeRatio || 0).toFixed(1));

  return r;
}

/* ---------------- 4. Liquidity walls ---------------- */

function deepCheckLiquidity_(a, dir) {
  var r = { veto: false, vetoReason: '', notes: [] };
  var walls = derivLiquidityWalls_(a.symbol);
  if (!walls || !walls.mid) { r.notes.push('liq: order book tidak tersedia'); return r; }
  var vetoDist = Number(CFG.LIQ_WALL_VETO_DISTANCE_PCT || 0.5);
  var warnDist = Number(CFG.LIQ_WALL_WARN_DISTANCE_PCT || 1.0);
  var minNotional = Number(CFG.LIQ_WALL_MIN_NOTIONAL_USD || 250000);
  var side = dir === 'BULLISH' ? walls.asks : walls.bids; // walls blocking the move
  function bigWalls(maxD) {
    return (side || []).filter(function(w) {
      return Math.abs(Number(w.distancePct || 999)) <= maxD && Number(w.notional || 0) >= minNotional;
    }).sort(function(x, y) { return y.notional - x.notional; });
  }
  var blockers = bigWalls(vetoDist);
  if (blockers.length) {
    var b = blockers[0];
    r.veto = true;
    r.vetoReason = 'liquidity wall ' + (dir === 'BULLISH' ? 'ask' : 'bid') + ' besar $' +
                   Math.round(Number(b.notional || 0) / 1000) + 'k di ' + b.price +
                   ' (' + Number(b.distancePct).toFixed(2) + '% dari harga) menghadang arah ' + dir;
    return r;
  }
  var warners = bigWalls(warnDist);
  if (warners.length) {
    r.delta -= 8;
    r.notes.push('liq -8: ' + (dir === 'BULLISH' ? 'ask' : 'bid') + ' wall $' + Math.round(Number(warners[0].notional || 0) / 1000) + 'k within ' + warnDist + '%');
  } else {
    r.notes.push('liq: tidak ada wall besar <' + warnDist + '% menghadang');
  }
  return r;
}

/* ---------------- 5. Coin news sentiment ---------------- */

function deepCheckNews_(a, dir) {
  var r = { veto: false, vetoReason: '', notes: [], brief: '' };
  var items = fetchCryptoCoinNews_(a.symbol, Number(CFG.NEWS_LOOKBACK_HOURS || 6));
  if (!items.length) { r.notes.push('news: tidak ada berita <' + CFG.NEWS_LOOKBACK_HOURS + ' jam'); return r; }
  var s = classifyCoinNewsSentiment_(a.symbol, items, dir);
  r.brief = s.sentiment + ' ' + s.impact + '/100 • ' + items.length + ' berita';
  r.notes.push('news: ' + s.sentiment + ' impact ' + s.impact + ' — ' + s.reason);
  if (s.sentiment === 'BEARISH' && dir === 'BULLISH' && s.impact >= 70) {
    r.veto = true;
    r.vetoReason = 'berita bearish berdampak tinggi (' + s.impact + '/100): ' + s.reason;
  } else if (s.sentiment === 'BULLISH' && dir === 'BEARISH' && s.impact >= 70) {
    r.veto = true;
    r.vetoReason = 'berita bullish berdampak tinggi (' + s.impact + '/100): ' + s.reason;
  }
  return r;
}

function fetchCryptoCoinNews_(symbol, hours) {
  var base = baseSymbol_(symbol);
  var q = (DEEPCHECK_COIN_NAMES_[base] || base.toLowerCase()) + ' crypto';
  var url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) +
            '%20when%3A' + Math.max(1, Math.min(24, Number(hours) || 6)) + 'h&hl=en-US&gl=US&ceid=US:en';
  var out = [];
  try {
    var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return out;
    var xml = res.getContentText();
    var re = /<item>([\s\S]*?)<\/item>/g, m;
    var cutoff = Date.now() - (Number(hours) || 6) * 3600000;
    while ((m = re.exec(xml)) && out.length < Number(CFG.NEWS_SENTIMENT_MAX_ITEMS || 8)) {
      var block = m[1];
      var t = /<title>([\s\S]*?)<\/title>/.exec(block);
      var pd = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block);
      var lk = /<link>([\s\S]*?)<\/link>/.exec(block);
      if (!t) continue;
      var title = String(t[1]).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      var pub = pd ? Date.parse(pd[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()) : Date.now();
      if (!isFinite(pub) || pub < cutoff) continue;
      out.push({ title: title, publishedAt: pub,
                 link: lk ? lk[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '' });
    }
  } catch (e) { console.log('fetchCryptoCoinNews_: ' + errorText_(e)); }
  return out;
}

function classifyCoinNewsSentiment_(symbol, items, dir) {
  var fallback = { sentiment: 'NEUTRAL', impact: 0, reason: 'AI sentiment gagal, fallback netral' };
  try {
    var titles = items.map(function(x, i) { return (i + 1) + '. ' + x.title; }).join('\n');
    var prompt = [
      'You are a crypto news sentiment classifier. Current signal direction: ' + dir + '.',
      'Classify the aggregate sentiment of these ' + baseSymbol_(symbol) + ' headlines from the last hours.',
      'Reply with ONLY a JSON object: {"sentiment":"BULLISH|BEARISH|NEUTRAL","impact":0-100,"reason":"max 90 chars"}.',
      'impact = how strongly this news could move price in the next hours.',
      'Headlines:',
      titles
    ].join('\n');
    var raw = aiGenerateText_(prompt, { maxOutputTokens: 120, temperature: 0.1 }, 'NEWS_SENTIMENT_' + baseSymbol_(symbol));
    var jm = /{[\s\S]*}/.exec(String(raw || ''));
    if (!jm) return fallback;
    var o = safeJsonParse_(jm[0]) || {};
    var sent = String(o.sentiment || 'NEUTRAL').toUpperCase();
    if (['BULLISH', 'BEARISH', 'NEUTRAL'].indexOf(sent) < 0) sent = 'NEUTRAL';
    return { sentiment: sent,
             impact: Math.max(0, Math.min(100, Number(o.impact || 0))),
             reason: String(o.reason || '').slice(0, 90) };
  } catch (e) {
    console.log('classifyCoinNewsSentiment_: ' + errorText_(e));
    return fallback;
  }
}

/* Manual test hook (run from GAS editor):
   testDeepCheck_('BTCUSDT') */
function testDeepCheck_(symbol) {
  symbol = symbol || 'BTCUSDT';
  var a = analyzeSymbol_(symbol, '15m');
  a.assetType = 'CRYPTO';
  try { a.mtfConfirm = analyzeSymbol_(symbol, String(CFG.MTF_CONFIRM_INTERVAL || '30m')); }
  catch (e) { console.log('mtf confirm: ' + errorText_(e)); }
  var r = prePublishDeepCheck_(a);
  console.log(JSON.stringify({ pass: r.pass, vetoReason: r.vetoReason,
    scoreDelta: r.scoreDelta, notes: r.notes, details: r.details }, null, 2));
  return r;
}

/* Public wrapper (muncul di dropdown Run) */
function testDeepCheck() { return testDeepCheck_('BTCUSDT'); }

/* =========================================================
 * v13.8 — QUALITY SCORE + TOP REASONS + PAPER TRACK RECORD
 * ========================================================= */

/* Single 0-100 quality number from the deep-check gate. */
function deepCheckQualityScore_(a, dc) {
  var q = 40 + Number(a.strength || 0) * 10 + Number(dc.scoreDelta || 0);
  return Math.max(5, Math.min(98, Math.round(q)));
}

/* Top-N scored reasons from deep-check notes, e.g. 'Bull Flag confirmed'. */
function deepCheckTopReasons_(dc, n) {
  n = Math.max(1, Math.min(5, Number(n) || 3));
  var scored = [];
  (dc.notes || []).forEach(function(t) {
    var m = /\+(\d+)\s*[:\-]?\s*(.+)$/.exec(String(t));
    if (m) scored.push({ score: Number(m[1]), text: String(m[2]).trim() });
  });
  scored.sort(function(x, y) { return y.score - x.score; });
  return scored.slice(0, n).map(function(s) {
    var t = s.text;
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
}

/* Paper track record from closed crypto signals in the Signals sheet. */
function paperTrackStats_(days) {
  days = Math.max(7, Number(days) || 30);
  var since = Date.now() - days * 86400000;
  var out = { signals: 0, wins: 0, losses: 0, winRate: 0, totalR: 0 };
  try {
    var rows = getSignalRows_().filter(function(r) {
      var st = String(r.status || 'ACTIVE').toUpperCase();
      return Number(r.postedAt || 0) >= since &&
        String(r.assetType || '').toUpperCase() === 'CRYPTO' &&
        ['ACTIVE', 'TP1_HIT', 'TP2_HIT'].indexOf(st) < 0 && st !== 'AMBIGUOUS';
    });
    var sumR = 0;
    rows.forEach(function(r) {
      var rr = Number(r.resultR || 0);
      sumR += rr;
      if (rr > 0) out.wins++;
      else if (rr < 0) out.losses++;
    });
    var closed = out.wins + out.losses;
    out.signals = rows.length;
    out.winRate = closed ? Math.round(out.wins / closed * 100) : 0;
    out.totalR = Math.round(sumR * 10) / 10;
  } catch (e) { console.log('paperTrackStats_: ' + errorText_(e)); }
  return out;
}

function paperTrackLine_(days) {
  var s = paperTrackStats_(days);
  if (!s.signals) return '';
  return '📊 Paper ' + days + 'D: ' + s.winRate + '% WR \u2022 ' +
    (s.totalR >= 0 ? '+' : '') + s.totalR + 'R (' + s.signals + ' signals)';
}

/* Public wrapper (Run dropdown) */
function testPaperTrack() {
  var s = paperTrackStats_(30);
  console.log(JSON.stringify(s));
  console.log(paperTrackLine_(30));
  return s;
}

/* ---------------- 6. 1H trend alignment (soft) ---------------- */
function deepCheckH1Trend_(a, dir) {
  var r = { delta: 0, notes: [], brief: '' };
  var bonus = Number(CFG.H1_TREND_BONUS || 8);
  var penalty = Number(CFG.H1_TREND_PENALTY || 10);
  var pack = getKlinesWithProvider_(normalizeSymbol_(a.symbol), '1h', 60);
  var candles = (pack && pack.candles) || [];
  if (candles.length < 55) { r.notes.push('1h trend: data kurang'); r.brief = 'nodata'; return r; }
  var closes = candles.map(function(c) { return Number(c.c); });
  var e = emaSeries_(closes, 50);
  var emaNow = e[e.length - 1], emaPrev = e[e.length - 11];
  var last = closes[closes.length - 1];
  if (last > emaNow && emaNow >= emaPrev) {
    r.delta = bonus; r.brief = 'bullish';
    r.notes.push('1h trend bullish selaras (+' + bonus + ')');
  } else if (last < emaNow && emaNow <= emaPrev) {
    r.delta = -penalty; r.brief = 'bearish';
    r.notes.push('1h trend bearish berlawanan (-' + penalty + ')');
  } else {
    r.brief = 'mixed';
    r.notes.push('1h trend mixed (netral)');
  }
  a.h1Trend = r.brief;
  return r;
}

/* ---------------- 7. BTC breadth (circuit breaker) ----------------
 * Altcoin LONG jarang selamat saat BTC dump keras. Ini pelindung pasar,
 * bukan pengetat biasa: hanya aktif saat BTC benar-benar jatuh.
 */
function deepCheckBtcBreadth_(a, dir) {
  var r = { delta: 0, veto: false, vetoReason: '', notes: [], brief: '' };
  var warnPct = Number(getProp_('BTC_DUMP_WARN_PCT', false) || CFG.BTC_DUMP_WARN_PCT || 2);
  var vetoPct = Number(getProp_('BTC_DUMP_VETO_PCT', false) || CFG.BTC_DUMP_VETO_PCT || 3);
  var penalty = Number(getProp_('BTC_DUMP_PENALTY', false) || CFG.BTC_DUMP_PENALTY || 15);
  var pack = getKlinesWithProvider_('BTCUSDT', '1h', 5);
  var candles = (pack && pack.candles) || [];
  if (candles.length < 2) { r.notes.push('btc breadth: data kurang'); return r; }
  var first = Number(candles[0].c), last = Number(candles[candles.length - 1].c);
  if (!first) { r.notes.push('btc breadth: data kurang'); return r; }
  var chgPct = (last - first) / first * 100;
  r.brief = round_(chgPct, 2) + '%/1h';
  if (chgPct <= -vetoPct) {
    r.veto = true;
    r.vetoReason = 'BTC dump ' + round_(chgPct, 2) + '%/1h — circuit breaker, LONG ditahan';
  } else if (chgPct <= -warnPct) {
    r.delta = -penalty;
    r.notes.push('BTC lemah ' + round_(chgPct, 2) + '%/1h (-' + penalty + ')');
  } else {
    r.notes.push('BTC breadth OK (' + round_(chgPct, 2) + '%/1h)');
  }
  return r;
}

/* ---------------- 8. Hour-of-day boost (dari data sendiri) ----------------
 * Jam-jam dengan histori WR bagus dapat bonus, jam yang buruk dapat penalti.
 * Hanya aktif bila sampel cukup (HOUR_STATS_MIN_N); tanpa data = netral.
 */
function getHourlyStats_() {
  var p = PropertiesService.getScriptProperties();
  var ts = Number(p.getProperty('HOURLY_STATS_TS') || 0);
  if (Date.now() - ts < 6 * 3600000) {
    try { var c = JSON.parse(p.getProperty('HOURLY_STATS_CACHE') || 'null'); if (c) return c; } catch (_) {}
  }
  var stats = {};
  getSignalRows_().forEach(function(r) {
    var st = String(r.status || '');
    var win = /^TP[123]_HIT$/.test(st) || Number(r.highestTarget || 0) >= 1;
    var loss = st === 'STOPPED';
    if (!win && !loss) return;
    var h;
    try { h = Number(Utilities.formatDate(new Date(Number(r.postedAt || 0)), CFG.TZ, 'H')); }
    catch (_) { return; }
    var g = stats[h] || (stats[h] = { n: 0, win: 0 });
    g.n++; if (win) g.win++;
  });
  p.setProperty('HOURLY_STATS_CACHE', JSON.stringify(stats));
  p.setProperty('HOURLY_STATS_TS', String(Date.now()));
  return stats;
}

function deepCheckHourBoost_(a, dir) {
  var r = { delta: 0, notes: [] };
  var minN = Number(getProp_('HOUR_STATS_MIN_N', false) || CFG.HOUR_STATS_MIN_N || 10);
  var bonus = Number(getProp_('HOUR_BOOST', false) || CFG.HOUR_BOOST || 5);
  var h = Number(Utilities.formatDate(new Date(), CFG.TZ, 'H'));
  var g = getHourlyStats_()[h];
  if (!g || g.n < minN) { r.notes.push('jam ' + h + ': histori kurang (' + (g ? g.n : 0) + '/' + minN + ')'); return r; }
  var wr = g.win / g.n * 100;
  if (wr >= 60) { r.delta = bonus; r.notes.push('jam ' + h + ' histori bagus: WR ' + Math.round(wr) + '% (+' + bonus + ')'); }
  else if (wr <= 35) { r.delta = -bonus; r.notes.push('jam ' + h + ' histori buruk: WR ' + Math.round(wr) + '% (-' + bonus + ')'); }
  else r.notes.push('jam ' + h + ' histori netral: WR ' + Math.round(wr) + '%');
  return r;
}

/* ==================================================================
 * SECTION: Post.gs  (78 functions)
 * ================================================================== */

/**
 * Post.gs — captions + chart + hook image + publishers: Threads / Square / X / Telegram.
 */

function threadsRiskDisclaimer_() {
  return '⚠️ NFA — For educational purposes only. Always DYOR & screen the market before entering. Signals may fail. Use proper risk management.';
}








function buildThreadsCaption_(lines) {
  const disclaimer = threadsRiskDisclaimer_();
  const separator = '\n\n';
  const reserve = codePointLength_(disclaimer) + codePointLength_(separator);
  const bodyMax = Math.max(1, CFG.THREADS_MAX_CHARS - reserve);
  const body = truncateCodePoints_(lines.filter(Boolean).join('\n').trim(), bodyMax);
  return body + separator + disclaimer;
}








function buildCryptoBullishCaption_(a) {
  var p = a.tradePlan || {};
  var coin = baseSymbol_(a.symbol);
  var mc = a.mtfConfirm;
  var dc = a.deepCheck || null;
  var quality = dc ? deepCheckQualityScore_(a, dc)
                   : Math.max(5, Math.min(98, Math.round(40 + Number(a.strength || 0) * 10)));
  var reasons = dc ? deepCheckTopReasons_(dc, 3) : [];
  var paper = '';
  try { paper = paperTrackLine_(30); } catch (_) {}
  var hcMin = Number(CFG.HIGH_CONVICTION_MIN_QUALITY || 80);
  var tfLine = '🟢 $' + coin + ' LONG \u2022 ' + String(a.interval || '15m');
  if (a.mtfConfirm && a.mtfConfirm4h) tfLine += ' \u2022 30m ✅ \u2022 4h ' +
    (String(a.mtfConfirm4h.signal || '').indexOf('BEAR') === 0 ? '⚠️' : '✅');
  else if (a.mtfConfirm) tfLine += ' \u2022 30m ✅';
  var lines = [ tfLine ];
  if (quality >= hcMin) lines.push('🔥 HIGH CONVICTION');
  lines.push('Quality ' + quality + '/100' + (quality >= 75 ? ' \u2705' : ''));
  if (reasons.length) {
    lines.push('Why this setup:');
    reasons.forEach(function(r) { lines.push('\u2022 ' + r); });
  }
  lines.push(
    'Entry ' + compactPrice_(p.entryLow) + ' \u2013 ' + compactPrice_(p.entryHigh),
    'TP ' + compactPrice_(p.tp1) + ' / ' + compactPrice_(p.tp2) + ' / ' + compactPrice_(p.tp3),
    'SL ' + compactPrice_(p.stopLoss) + ' \u2022 R:R 1:' + round_(Number(p.rr1 || 0), 2)
  );
  if (paper) lines.push(paper);
  if (a.publicId) lines.push('🆔 ' + a.publicId);
  lines.push('$' + coin + ' #Crypto #DYOR #AZZATSSINS');
  return buildThreadsCaption_(lines);
}








function fallbackCaption_(a) {
  const type = String(a && a.assetType || 'CRYPTO').toUpperCase();
  const p = a.tradePlan;
  const icon = a.signal === 'BULLISH WATCH' ? '🟢' : '🔴';

  if (type === 'FOREX') {
    return buildThreadsCaption_([
      icon + ' XAUUSD • ' + a.interval + ' • ' + a.signal + ' ' + a.strength + '/5',
      'Entry ' + formatPrice_(p.entryLow) + ' - ' + formatPrice_(p.entryHigh),
      'TP1 ' + formatPrice_(p.tp1) + ' | TP2 ' + formatPrice_(p.tp2) + ' | TP3 ' + formatPrice_(p.tp3),
      'SL ' + formatPrice_(p.stopLoss),
      'XAU setup based on EMA, RSI, MACD, ATR and price structure.',
      '#XAUUSD #Gold #Forex #Trading'
    ]);
  }

  return buildThreadsCaption_([
    icon + ' ' + baseSymbol_(a.symbol) + '/USDT • ' + a.interval + ' • ' + a.signal + ' ' + a.strength + '/5',
    'Entry ' + formatPrice_(p.entryLow) + ' - ' + formatPrice_(p.entryHigh),
    'TP1 ' + formatPrice_(p.tp1) + ' | TP2 ' + formatPrice_(p.tp2) + ' | TP3 ' + formatPrice_(p.tp3),
    'SL ' + formatPrice_(p.stopLoss),
    'Technical setup based on EMA, RSI, MACD, volume and ATR.',
    '#' + baseSymbol_(a.symbol) + ' #Crypto #Trading'
  ]);
}








function compactPrice_(v) {
  var n = Number(v || 0);
  if (!n) return '-';
  if (n >= 1000) {
    var k = n / 1000;
    return (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
  }
  return String(round_(n, n < 1 ? 6 : 2));
}








function compactMoney_(n) {
  n = Number(n || 0);
  if (n >= 1e9) return '$' + round_(n/1e9,1) + 'B';
  if (n >= 1e6) return '$' + round_(n/1e6,1) + 'M';
  if (n >= 1e3) return '$' + round_(n/1e3,1) + 'K';
  return '$' + round_(n,0);
}








function formatPrice_(n) {
  n = Number(n);
  if (!isFinite(n)) return '-';
  let d = 2;
  if (Math.abs(n) < 1) d = 6;
  if (Math.abs(n) < 0.01) d = 8;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d });
}








function round_(n,d) { const p=Math.pow(10,d||0); return Math.round(Number(n)*p)/p; }








function codePointLength_(value) {
  return Array.from(String(value == null ? '' : value)).length;
}


/* =========================================================
 * CRYPTO DUAL-TIMEFRAME SIGNAL v11.7
 * SCALPING 15m + SWING 4H
 * ========================================================= */








function truncateCodePoints_(s, max) {
  const a=Array.from(String(s || ''));
  return a.length <= max ? a.join('') : a.slice(0, Math.max(0,max-1)).join('') + '…';
}








function buildSquareBullishSignalContent_(a,campaign) {
  var coin=baseSymbol_(a.symbol), p=a.tradePlan||{};
  var dc=a.deepCheck||null;
  var quality=dc?deepCheckQualityScore_(a,dc):Math.max(5,Math.min(98,Math.round(40+Number(a.strength||0)*10)));
  var reasons=dc?deepCheckTopReasons_(dc,3):[];
  var paper='';
  try { paper=paperTrackLine_(30); } catch(_){}
  var lines=[
    '🟢 $'+coin+' LONG \u2022 '+String(a.interval||'15m'),
    'Quality '+quality+'/100'+(quality>=75?' \u2705':'')
  ];
  if(reasons.length){
    lines.push('Why this setup:');
    reasons.forEach(function(r){ lines.push('\u2022 '+r); });
  }
  lines.push(
    'Entry: '+compactPrice_(p.entryLow)+' \u2013 '+compactPrice_(p.entryHigh),
    'TP: '+compactPrice_(p.tp1)+' / '+compactPrice_(p.tp2)+' / '+compactPrice_(p.tp3),
    'Stop Loss: '+compactPrice_(p.stopLoss)+' (R:R 1:'+round_(Number(p.rr1||0),2)+')'
  );
  if(paper) lines.push(paper);
  lines.push('$'+coin+' #'+coin+' #Crypto #DYOR #AZZATSSINS');
  var out=lines.filter(function(x){return x!=='';}).join('\n');
  if(campaign) out+='\n\nCampaign context: '+String(campaign.title||campaign.token||'CreatorPad')+'.';
  return ensureSquareCompliance_(out,a.symbol,campaign);
}








function ensureSquareCompliance_(text,symbol,campaign) {
  var out=String(text||'').trim();
  var coin=baseSymbol_(normalizeSymbol_(symbol||''));
  if(coin && getBoolProp_('SQUARE_WRITE_TO_EARN_ENABLED',CFG.SQUARE_WRITE_TO_EARN_ENABLED)) {
    if(out.indexOf('$'+coin)<0) out += '\n\n$'+coin;
  }
  if(campaign) {
    var token=String(campaign.token||'').toUpperCase();
    var hashtag=String(campaign.hashtag||'').trim();
    var mention=String(campaign.mention||'').trim();
    if(token && out.indexOf('$'+token)<0) out += '\n$'+token;
    if(hashtag && out.toLowerCase().indexOf(hashtag.toLowerCase())<0) out += ' '+hashtag;
    if(mention && out.toLowerCase().indexOf(mention.toLowerCase())<0) out += ' '+mention;
    var minChars=Math.max(0,Number(campaign.minChars||0));
    if(minChars && codePointLength_(out)<minChars) {
      out += '\n\nThis post discusses the current market structure, momentum and risk levels for the campaign asset using observable technical data.';
    }
  }
  if(out.indexOf('NFA')<0 && out.toLowerCase().indexOf('not financial advice')<0) {
    out += '\n\nNFA — DYOR and use proper risk management.';
  }
  return truncateCodePoints_(out,CFG.BINANCE_SQUARE_MAX_CHARS);
}








function validateSquareContent_(text,symbol,campaign) {
  var errors=[], t=String(text||'').trim();
  if(!t) errors.push('empty');
  if(codePointLength_(t)>CFG.BINANCE_SQUARE_MAX_CHARS) errors.push('too_long');
  var indo=/\b(dan|yang|untuk|dengan|belum|saham|berbasis|mendukung|harga saat|jangan|dipost)\b/i;
  if(indo.test(t)) errors.push('not_english_only');
  var coin=baseSymbol_(normalizeSymbol_(symbol||''));
  if(coin && getBoolProp_('SQUARE_WRITE_TO_EARN_ENABLED',CFG.SQUARE_WRITE_TO_EARN_ENABLED) && t.indexOf('$'+coin)<0) errors.push('missing_cashtag');
  if(campaign) {
    var min=Math.max(0,Number(campaign.minChars||0));
    if(min && codePointLength_(t)<min) errors.push('below_campaign_min_chars');
    if(campaign.token && t.indexOf('$'+String(campaign.token).toUpperCase())<0) errors.push('missing_campaign_token');
    if(campaign.hashtag && t.toLowerCase().indexOf(String(campaign.hashtag).toLowerCase())<0) errors.push('missing_campaign_hashtag');
    if(campaign.mention && t.toLowerCase().indexOf(String(campaign.mention).toLowerCase())<0) errors.push('missing_campaign_mention');
  }
  return {ok:!errors.length,errors:errors};
}








function shouldPublishXSignal_(type,source){if(!getBoolProp_('X_PUBLISHER_ENABLED',CFG.X_PUBLISHER_ENABLED)||!xAuthStatus_().configured||!xAssetEnabled_(type))return false;var auto=String(source||'').indexOf('AUTO')===0;return auto?getBoolProp_('X_AUTO_SIGNAL_ENABLED',CFG.X_AUTO_SIGNAL_ENABLED):getBoolProp_('X_MANUAL_MIRROR_ENABLED',CFG.X_MANUAL_MIRROR_ENABLED);}








function xAssetEnabled_(type){return getBoolProp_('X_CRYPTO_ENABLED',CFG.X_CRYPTO_ENABLED);}




function xAuth_(){var raw=getProp_('X_AUTH_JSON',false);var x=safeJsonParse_(raw||'{}')||{};return x;}








function xAuthStatus_(){var a=xAuth_();return {configured:!!((a.consumerKey&&a.consumerSecret&&a.accessToken&&a.accessTokenSecret)||a.oauth2UserToken),oauth1:!!(a.consumerKey&&a.consumerSecret&&a.accessToken&&a.accessTokenSecret),oauth2User:!!a.oauth2UserToken,bearerStored:!!a.bearerToken};}








function xCreatePost_(text,replyToId){
  var a=xAuth_(),url=CFG.X_API_BASE+'/tweets',caption=truncateCodePoints_(String(text||'').trim(),CFG.X_MAX_CHARS);
  if(!caption)throw new Error('X post text kosong.');
  var payload={text:caption};if(replyToId)payload.reply={in_reply_to_tweet_id:String(replyToId)};
  var headers={'Content-Type':'application/json'},mode='';
  if(a.consumerKey&&a.consumerSecret&&a.accessToken&&a.accessTokenSecret){headers.Authorization=xOAuth1Header_('POST',url,a);mode='OAuth1';}
  else if(a.oauth2UserToken){headers.Authorization='Bearer '+a.oauth2UserToken;mode='OAuth2 user';}
  else if(a.bearerToken){headers.Authorization='Bearer '+a.bearerToken;mode='Bearer';}
  else throw new Error('X_AUTH_JSON belum dikonfigurasi. Jalankan installXAuthFromDrive().');

  var res=UrlFetchApp.fetch(url,{
    method:'post',muteHttpExceptions:true,followRedirects:true,
    contentType:'application/json',headers:headers,payload:JSON.stringify(payload)
  });
  var code=Number(res.getResponseCode()),raw=String(res.getContentText()||''),body=safeJsonParse_(raw);

  if(code===402 && raw.toLowerCase().indexOf('credits depleted')>=0){
    PropertiesService.getScriptProperties().setProperty('X_PUBLISHER_ENABLED','false');
    PropertiesService.getScriptProperties().setProperty('X_LAST_ERROR','credits depleted');
    PropertiesService.getScriptProperties().setProperty('X_LAST_ERROR_AT',String(Date.now()));
    throw new Error('X API credits depleted. X Publisher otomatis PAUSED; destination lain tetap berjalan.');
  }

  if(code<200||code>=300||!body||!body.data||!body.data.id){
    var hint=(mode==='Bearer'?' Bearer token bisa merupakan app-only token; gunakan OAuth1 user credentials atau OAuth2 user token.':'');
    throw new Error('X create post HTTP '+code+': '+raw.slice(0,420)+hint);
  }

  PropertiesService.getScriptProperties().deleteProperty('X_LAST_ERROR');
  PropertiesService.getScriptProperties().deleteProperty('X_LAST_ERROR_AT');
  return {id:String(body.data.id),text:String(body.data.text||caption),mode:mode};
}








function xParseCredentialFile_(raw){
  var j=safeJsonParse_(raw);if(j&&typeof j==='object')return j;
  var o={};String(raw||'').split(/\r?\n/).forEach(function(line){var m=line.match(/^\s*([A-Za-z0-9_ -]+)\s*[:=]\s*(.*?)\s*$/);if(!m)return;var k=m[1].toUpperCase().replace(/[^A-Z0-9]/g,'');var v=m[2];var map={CONSUMERKEY:'consumerKey',APIKEY:'consumerKey',CONSUMERTOKEN:'consumerKey',CONSUMERSECRET:'consumerSecret',APISECRET:'consumerSecret',ACCESSKEYSECRET:'consumerSecret',ACCESSTOKEN:'accessToken',ACCESSTOKENSECRET:'accessTokenSecret',BEARERTOKEN:'bearerToken',OAUTH2USERTOKEN:'oauth2UserToken',USERBEARERTOKEN:'oauth2UserToken'};if(map[k])o[map[k]]=v;});return o;
}








function xOAuth1Header_(method,url,auth){
  var oauth={oauth_consumer_key:auth.consumerKey,oauth_nonce:Utilities.getUuid().replace(/-/g,''),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_token:auth.accessToken,oauth_version:'1.0'};
  var pairs=Object.keys(oauth).map(function(k){return [xPct_(k),xPct_(oauth[k])];}).sort(function(a,b){return a[0]===b[0]?(a[1]<b[1]?-1:a[1]>b[1]?1:0):(a[0]<b[0]?-1:1);});
  var norm=pairs.map(function(p){return p[0]+'='+p[1];}).join('&');var base=String(method).toUpperCase()+'&'+xPct_(url)+'&'+xPct_(norm);var key=xPct_(auth.consumerSecret)+'&'+xPct_(auth.accessTokenSecret);var sig=Utilities.base64Encode(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1,base,key));oauth.oauth_signature=sig;
  return 'OAuth '+Object.keys(oauth).sort().map(function(k){return xPct_(k)+'="'+xPct_(oauth[k])+'"';}).join(', ');
}








function xDirShort_(a){var s=String(a&&a.signal||'').toUpperCase();return s.indexOf('BEAR')>=0?'SHORT':s.indexOf('BULL')>=0?'LONG':'WAIT';}








function xPct_(s){return encodeURIComponent(String(s)).replace(/[!'()*]/g,function(c){return '%'+c.charCodeAt(0).toString(16).toUpperCase();});}








function postToThreads_(text) { return postToThreadsLegacy_(text); }




function postToThreadsLegacy_(text) {
  const token = getProp_('THREADS_ACCESS_TOKEN', true);
  const caption = truncateCodePoints_(String(text || '').trim(), CFG.THREADS_MAX_CHARS);
  if (!caption) throw new Error('Caption kosong.');

  const createUrl = CFG.THREADS_API_BASE + '/me/threads?' + toQuery_({
    media_type: 'TEXT', text: caption, access_token: token
  });
  const cRes = UrlFetchApp.fetch(createUrl, { method:'post', muteHttpExceptions:true });
  const cCode = cRes.getResponseCode(), cRaw = cRes.getContentText(), c = safeJsonParse_(cRaw);
  if (cCode < 200 || cCode >= 300 || !c || !c.id) throw new Error('Threads create HTTP ' + cCode + ': ' + cRaw.slice(0, 600));

  waitThreadsContainer_(c.id, token);

  const publishUrl = CFG.THREADS_API_BASE + '/me/threads_publish?' + toQuery_({ creation_id:c.id, access_token:token });
  let last = '';
  for (let i = 0; i < 3; i++) {
    const pRes = UrlFetchApp.fetch(publishUrl, { method:'post', muteHttpExceptions:true });
    last = pRes.getContentText();
    const body = safeJsonParse_(last);
    if (pRes.getResponseCode() >= 200 && pRes.getResponseCode() < 300 && body && body.id) return body;
    if (i < 2) Utilities.sleep(1000 * (i + 1));
  }
  throw new Error('Threads publish gagal: ' + last.slice(0, 600));
}








function postToThreadsImage_(text, imageUrl) { return postToThreadsImageLegacy_(text, imageUrl); }




function postToThreadsImageLegacy_(text, imageUrl) {
  const token=getProp_('THREADS_ACCESS_TOKEN',true);
  const caption=truncateCodePoints_(String(text||'').trim(),CFG.THREADS_MAX_CHARS);
  if(!caption) throw new Error('Caption kosong.');
  if(!/^https:\/\//i.test(String(imageUrl||''))) throw new Error('Threads image URL tidak valid.');

  // Warm the public image URL before Meta fetches it.
  try { UrlFetchApp.fetch(imageUrl,{method:'get',muteHttpExceptions:true,followRedirects:true}); } catch(_){}

  const createUrl=CFG.THREADS_API_BASE+'/me/threads?'+toQuery_({
    media_type:'IMAGE',
    image_url:String(imageUrl),
    text:caption,
    access_token:token
  });
  const cRes=UrlFetchApp.fetch(createUrl,{method:'post',muteHttpExceptions:true});
  const cRaw=cRes.getContentText(), c=safeJsonParse_(cRaw);
  if(cRes.getResponseCode()<200 || cRes.getResponseCode()>=300 || !c || !c.id) throw new Error('Threads image create HTTP '+cRes.getResponseCode()+': '+cRaw.slice(0,600));

  waitThreadsContainer_(c.id,token);
  const publishUrl=CFG.THREADS_API_BASE+'/me/threads_publish?'+toQuery_({creation_id:c.id,access_token:token});
  let last='';
  for(let i=0;i<3;i++){
    const pRes=UrlFetchApp.fetch(publishUrl,{method:'post',muteHttpExceptions:true});
    last=pRes.getContentText();
    const body=safeJsonParse_(last);
    if(pRes.getResponseCode()>=200 && pRes.getResponseCode()<300 && body && body.id) return body;
    if(i<2) Utilities.sleep(1000*(i+1));
  }
  throw new Error('Threads image publish gagal: '+last.slice(0,600));
}








function waitThreadsContainer_(id, token) {
  for (let i = 0; i < 4; i++) {
    try {
      const url = CFG.THREADS_API_BASE + '/' + encodeURIComponent(id) + '?' + toQuery_({ fields:'status,error_message', access_token:token });
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions:true });
      const b = safeJsonParse_(res.getContentText());
      if (res.getResponseCode() >= 200 && res.getResponseCode() < 300 && b) {
        if (b.status === 'FINISHED' || b.status === 'PUBLISHED') return;
        if (b.status === 'ERROR' || b.status === 'EXPIRED') throw new Error(b.error_message || b.status);
      }
    } catch (err) { console.log('Threads status: ' + errorText_(err)); }
    Utilities.sleep(700);
  }
}








function refreshThreadsAccessToken_() {
  const p = PropertiesService.getScriptProperties();
  const token = getProp_('THREADS_ACCESS_TOKEN', true);
  const url = 'https://graph.threads.net/refresh_access_token?' + toQuery_({ grant_type:'th_refresh_token', access_token:token });
  const res = UrlFetchApp.fetch(url, { method:'get', muteHttpExceptions:true });
  const raw = res.getContentText(), b = safeJsonParse_(raw);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300 || !b || !b.access_token) throw new Error('Refresh token gagal: ' + raw.slice(0, 600));
  p.setProperty('THREADS_ACCESS_TOKEN', b.access_token);
  return b;
}








function postToBinanceSquare_(text) {
  const key = getBinanceSquareApiKey_();
  if (!key) throw new Error('BINANCE_SQUARE_OPENAPI_KEY belum dikonfigurasi.');

  const bodyTextOnly = truncateCodePoints_(String(text || '').trim(), CFG.BINANCE_SQUARE_MAX_CHARS);
  if (!bodyTextOnly) throw new Error('Caption Binance Square kosong.');

  const res = UrlFetchApp.fetch(CFG.BINANCE_SQUARE_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Square-OpenAPI-Key': key,
      'clienttype': 'binanceSkill'
    },
    payload: JSON.stringify({ contentType: 1, bodyTextOnly: bodyTextOnly }),
    muteHttpExceptions: true,
    followRedirects: true
  });

  const httpCode = res.getResponseCode();
  const raw = res.getContentText();

  // Official Binance Square helper treats 504 on /content/add as submitted successfully,
  // but no content ID may be available.
  if (httpCode === 504) {
    return { ok:true, id:'', link:'', status:'success_without_post_id', httpCode:504 };
  }

  const body = safeJsonParse_(raw);
  if (httpCode < 200 || httpCode >= 300) {
    throw new Error('Binance Square HTTP ' + httpCode + ': ' + raw.slice(0, 600));
  }
  if (!body || String(body.code) !== '000000') {
    throw new Error('Binance Square API [' + String(body && body.code || '?') + ']: ' + String(body && body.message || raw).slice(0, 500));
  }

  const data = body.data || {};
  const id = data.id ? String(data.id) : '';
  const link = String(data.shareLink || (id ? 'https://www.binance.com/square/post/' + id : ''));
  return { ok:true, id:id, link:link, status:'published', httpCode:httpCode };
}








function postToBinanceSquareImage_(text, blob, fileName) {
  const imageUrl=uploadBinanceSquareImage_(blob,fileName);
  const key=getBinanceSquareApiKey_();
  const bodyTextOnly=truncateCodePoints_(String(text||'').trim(),CFG.BINANCE_SQUARE_MAX_CHARS);
  const res=UrlFetchApp.fetch(CFG.BINANCE_SQUARE_API_URL,{
    method:'post',
    contentType:'application/json',
    headers:{'X-Square-OpenAPI-Key':key,'clienttype':'binanceSkill'},
    payload:JSON.stringify({contentType:1,bodyTextOnly:bodyTextOnly,imageList:[imageUrl]}),
    muteHttpExceptions:true,
    followRedirects:true
  });
  const httpCode=res.getResponseCode(), raw=res.getContentText();
  if(httpCode===504) return {ok:true,id:'',link:'',status:'success_without_post_id',httpCode:504,imageUrl:imageUrl};
  const body=safeJsonParse_(raw);
  if(httpCode<200 || httpCode>=300) throw new Error('Binance Square HTTP '+httpCode+': '+raw.slice(0,600));
  if(!body || String(body.code)!=='000000') throw new Error('Binance Square API ['+String(body&&body.code||'?')+']: '+String(body&&body.message||raw).slice(0,500));
  const data=body.data||{}, id=data.id?String(data.id):'', link=String(data.shareLink||(id?'https://www.binance.com/square/post/'+id:''));
  return {ok:true,id:id,link:link,status:'published',httpCode:httpCode,imageUrl:imageUrl};
}








function uploadBinanceSquareImage_(blob, fileName) {
  if (!blob) throw new Error('Image blob kosong.');
  const name=String(fileName || ('azzatssins-chart-'+Date.now()+'.png')).replace(/[^A-Za-z0-9._-]/g,'_');
  const pre=binanceSquareApiV2_('/image/presignedUrl',{imageName:name});
  if(!pre.presignedUrl || !pre.fileTicket) throw new Error('Binance Square presigned URL tidak lengkap.');

  const put=UrlFetchApp.fetch(pre.presignedUrl,{
    method:'put',
    contentType:blob.getContentType() || 'image/png',
    payload:blob.getBytes(),
    muteHttpExceptions:true,
    followRedirects:true
  });
  if(put.getResponseCode()<200 || put.getResponseCode()>=300){
    throw new Error('Binance Square S3 upload HTTP '+put.getResponseCode()+': '+put.getContentText().slice(0,300));
  }

  for(let i=0;i<10;i++){
    const st=binanceSquareApiV2_('/image/imageStatus',{fileTicket:pre.fileTicket});
    if(Number(st.status)===1 && st.imageUrl) return String(st.imageUrl);
    if(Number(st.status)===2) throw new Error('Binance Square image processing gagal: '+String(st.failedReason||'unknown'));
    Utilities.sleep(3000);
  }
  throw new Error('Binance Square image processing timeout.');
}








function binanceSquareApiV2_(endpoint, body) {
  const key = getBinanceSquareApiKey_();
  if (!key) throw new Error('BINANCE_SQUARE_OPENAPI_KEY belum dikonfigurasi.');
  const res = UrlFetchApp.fetch(CFG.BINANCE_SQUARE_API_V2 + endpoint, {
    method:'post',
    contentType:'application/json',
    headers:{'X-Square-OpenAPI-Key':key,'clienttype':'binanceSkill'},
    payload:JSON.stringify(body || {}),
    muteHttpExceptions:true,
    followRedirects:true
  });
  const raw=res.getContentText();
  const json=safeJsonParse_(raw);
  if(res.getResponseCode()<200 || res.getResponseCode()>=300) throw new Error('Binance Square media HTTP '+res.getResponseCode()+': '+raw.slice(0,500));
  if(!json || String(json.code)!=='000000') throw new Error('Binance Square media ['+String(json&&json.code||'?')+']: '+String(json&&json.message||raw).slice(0,400));
  return json.data || {};
}








function getBinanceSquareApiKey_() {
  return String(getProp_('BINANCE_SQUARE_OPENAPI_KEY', false) || '').trim();
}







function splitText_(s, max) {
  s = String(s || '');
  max = Math.max(500, Number(max) || 3900);
  var out = [];
  while (s.length > max) {
    var cut = s.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    out.push(s.slice(0, cut));
    s = s.slice(cut).replace(/^\n+/, '');
  }
  if (s) out.push(s);
  return out;
}

function sendTelegram_(text, chatId, options) {
  options = options || {};
  const chunks = splitText_(String(text), 3900);
  let last = null;
  chunks.forEach(function(chunk, idx) {
    const payload = { chat_id:String(chatId || getProp_('TELEGRAM_CHAT_ID', true)), text:chunk, disable_web_page_preview:'true' };
    if (options.replyMarkup && idx === chunks.length - 1) payload.reply_markup = JSON.stringify(options.replyMarkup);
    const r = fetchJson_(telegramApi_('sendMessage'), { method:'post', payload:payload, muteHttpExceptions:true });
    if (!r.ok) throw new Error('Telegram sendMessage: ' + JSON.stringify(r));
    last = r;
  });
  return last;
}








function sendTelegramChannelPost_(text, chartBlob, imageUrls) {
  if (!isTelegramChannelAutopostEnabled_()) return { ok:true, skipped:'channel autopost disabled' };
  var channelId = getTelegramChannelId_();
  if (!channelId) return { ok:true, skipped:'channel id empty' };

  var urls = (imageUrls || []).filter(function(u) { return /^https:\/\//i.test(String(u || '')); });
  if (urls.length >= 2) {
    try { return sendTelegramMediaGroup_(channelId, text, urls.slice(0, 10)); }
    catch (mgErr) { console.error('Telegram channel media group gagal: ' + errorText_(mgErr)); }
  } else if (urls.length === 1) {
    try { return sendTelegramPhotoUrl_(channelId, urls[0], text); }
    catch (uErr) { console.error('Telegram channel photo url gagal: ' + errorText_(uErr)); }
  }

  if (chartBlob) {
    try {
      return sendTelegramPhoto_(chartBlob, truncateCodePoints_(String(text || ''), 1000), channelId);
    } catch (photoErr) {
      console.error('Telegram channel photo gagal: ' + errorText_(photoErr));
    }
  }
  return sendTelegram_(String(text || ''), channelId);
}

function sendTelegramPhoto_(blob, caption, chatId) {
  if(!blob) throw new Error('Telegram photo blob kosong.');
  const payload={
    chat_id:String(chatId || getProp_('TELEGRAM_CHAT_ID',true)),
    photo:blob,
    caption:truncateCodePoints_(String(caption||''),1000)
  };
  const res=UrlFetchApp.fetch(telegramApi_('sendPhoto'),{method:'post',payload:payload,muteHttpExceptions:true});
  const raw=res.getContentText(), body=safeJsonParse_(raw);
  if(res.getResponseCode()<200 || res.getResponseCode()>=300 || !body || !body.ok) throw new Error('Telegram sendPhoto HTTP '+res.getResponseCode()+': '+raw.slice(0,500));
  return body;
}

/**
 * Normalize a Telegram channel ID.
 * Telegram Bot API channel/supergroup IDs normally use the -100... prefix.
 * The configured value may also be an @channelusername.
 */








function telegramApi_(method) {
  var p = PropertiesService.getScriptProperties();
  var token = String(p.getProperty('TELEGRAM_BOT_TOKEN') || p.getProperty('TELEGRAM_TOKEN') || '').trim();
  if (!token) throw new Error('Script Property belum diisi: TELEGRAM_BOT_TOKEN');
  return 'https://api.telegram.org/bot' + token + '/' + method;
}








function getTelegramChannelId_() {
  var raw = String(getProp_('TELEGRAM_CHANNEL_ID', false) || CFG.TELEGRAM_CHANNEL_ID || '').trim();
  if (!raw) return '';
  if (/^@\w+$/.test(raw)) return raw;
  if (/^-100\d+$/.test(raw)) return raw;
  if (/^100\d+$/.test(raw)) return '-' + raw;
  if (/^-?\d+$/.test(raw)) return raw;
  throw new Error('TELEGRAM_CHANNEL_ID tidak valid: ' + raw);
}








function isTelegramChannelAutopostEnabled_() {
  return getBoolProp_('TELEGRAM_CHANNEL_AUTOPOST_ENABLED', CFG.TELEGRAM_CHANNEL_AUTOPOST_ENABLED);
}

/**
 * Send one public post to the configured Telegram channel.
 * If a chart blob is available, it is posted as a photo with caption.
 * Otherwise the message falls back to plain text.
 */








function editOrSend_(chatId, messageId, text, inlineKeyboard) {
  if (messageId) {
    const r = editTelegram_(chatId, messageId, text, inlineKeyboard || []);
    if (r && r.ok) return r;
    // "message is not modified" is harmless, but fallback keeps navigation responsive.
    console.log('editMessage fallback: ' + JSON.stringify(r));
  }
  return sendTelegram_(text, chatId, { replyMarkup: { inline_keyboard:inlineKeyboard || [] } });
}








function editTelegram_(chatId, messageId, text, inlineKeyboard) {
  const payload = {
    chat_id:String(chatId), message_id:String(messageId), text:truncateCodePoints_(String(text), 4000),
    disable_web_page_preview:'true', reply_markup:JSON.stringify({ inline_keyboard:inlineKeyboard || [] })
  };
  return fetchJson_(telegramApi_('editMessageText'), { method:'post', payload:payload, muteHttpExceptions:true });
}








function inlineBtn_(text, callbackData) {
  return { text:String(text), callback_data:String(callbackData) };
}








function answerCallback_(id) {
  if (!id) return;
  try {
    UrlFetchApp.fetch(telegramApi_('answerCallbackQuery'), {
      method:'post', payload:{ callback_query_id:id }, muteHttpExceptions:true
    });
  } catch (_) {}
}








function answerCallbackToast_(_) {
  // Reserved for future callback toast. Keeping navigation silent is more reliable on GAS.
}








function canPostSignal_(a, force) {
  if (force) return { allowed: true, reason: 'forced' };
  const old = safeJsonParse_(getProp_(signalStateKey_(a.symbol, a.interval), false) || '');
  if (!old || !old.postedAt) return { allowed: true, reason: 'first signal' };
  if (old.signal !== a.signal) return { allowed: true, reason: 'direction changed' };

  const elapsed = (Date.now() - Number(old.postedAt)) / 60000;
  const cooldown = getCoinCooldownMinutes_();
  if (elapsed < cooldown) return { allowed: false, reason: 'coin cooldown ' + Math.ceil(cooldown - elapsed) + 'm' };

  // Even after cooldown, avoid a near-identical repost unless setup materially changed.
  const oldEntry = old.tradePlan && Number(old.tradePlan.entry);
  const newEntry = a.tradePlan && Number(a.tradePlan.entry);
  const entryMovePct = oldEntry && newEntry ? Math.abs(newEntry / oldEntry - 1) * 100 : 999;
  if (old.strength === a.strength && entryMovePct < 0.50) {
    return { allowed: false, reason: 'setup hampir sama (entry berubah <0.5%)' };
  }
  return { allowed: true, reason: 'setup changed' };
}








function canAutoPostNow_() {
  const last = Number(getProp_('LAST_AUTO_POST_AT', false) || 0);
  if (!last) return { allowed: true, reason: 'first' };
  const elapsed = (Date.now() - last) / 60000;
  const wait = getAutoPostMinutes_();
  var mode={label:'crypto'};
  if (elapsed >= wait) return { allowed: true, reason: mode.label + ' interval passed' };
  return { allowed: false, reason: mode.label + ' signal interval ' + Math.ceil(wait - elapsed) + 'm' };
}








function getAutoPostMinutes_() {
  // v11.6 signal cadence supports 15 / 30 / 60 minute public signal modes.
  return Math.max(15, getIntProp_('AUTO_POST_MINUTES', CFG.AUTO_POST_MINUTES));
}








function getCoinCooldownMinutes_() { return Math.max(60, getIntProp_('COIN_COOLDOWN_MINUTES', CFG.COIN_COOLDOWN_MINUTES)); }








function savePostedSignal_(a, threadId, source, caption, platformRefs) {
  platformRefs=platformRefs||{};
  var p = PropertiesService.getScriptProperties();
  var s = {
    assetType: a.assetType || 'CRYPTO', ticker: a.ticker || null,
    symbol: a.symbol, interval: a.interval, signal: a.signal, strength: a.strength,
    setupScore: a.setupScore || null,
    price: a.price, tradePlan: a.tradePlan, threadId: threadId,
    source: source || '-', postedAt: Date.now(), postedAtText: nowText_(), xPostId:String(platformRefs.xPostId||'')
  };
  p.setProperty(signalStateKey_(a.symbol, a.interval), JSON.stringify(s));
  p.setProperty('LAST_SIGNAL', JSON.stringify(s));

  var hist = getHistory_();
  hist.unshift({
    assetType:s.assetType, ticker:s.ticker, symbol:s.symbol, interval:s.interval, signal:s.signal,
    strength:s.strength, setupScore:s.setupScore, threadId:s.threadId, source:s.source,
    postedAt:s.postedAt, postedAtText:s.postedAtText
  });
  p.setProperty('SIGNAL_HISTORY', JSON.stringify(hist.slice(0, 20)));
  var lifecycleId = '';
  try { lifecycleId = recordSignalLifecycle_(a, threadId, source || '-', String(platformRefs.xPostId||'')) || ''; } catch (err) { console.log('DB signal: ' + errorText_(err)); }
  try { recordDailyPostedSignal_(a, lifecycleId, source || '-'); } catch (err0) { console.log('DailyPosted signal: ' + errorText_(err0)); }
  try {
    var type = 'CRYPTO_SIGNAL';
    var topic = 'CRYPTO';
    if (String(a.assetType || '').toUpperCase() === 'IDX') { type = 'IDX_SIGNAL'; topic = 'IDX'; }
    else if (String(a.assetType || '').toUpperCase() === 'FOREX') { type = 'FOREX_SIGNAL'; topic = 'FOREX'; }
    recordThreadsPost_(threadId, {
      createdAt: Date.now(),
      type: type,
      asset: a.ticker || a.symbol || '',
      topic: topic,
      signal: a.signal || '', strength: a.strength || 0, source: source || '', text: caption || ''
    });
  } catch (err2) { console.log('ThreadsPosts signal: ' + errorText_(err2)); }
}








function recordDailyPostedSignal_(a, signalId, source) {
  if (!a) return;
  var day = ensureDailyPostedDay_();
  var side = String(a.signal || '').toUpperCase() === 'BEARISH WATCH' ? 'SHORT' : 'LONG';
  dbSheet_('DailyPosted').appendRow([
    day,
    signalId || '',
    String(a.assetType || 'CRYPTO').toUpperCase(),
    a.ticker || a.symbol || '',
    a.interval || '15m',
    side,
    Date.now(),
    source || '',
    Number(a.price || 0)
  ]);
}








function getTodayPostedRows_() {
  var day = ensureDailyPostedDay_();
  var sh = dbSheet_('DailyPosted');
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2,1,n-1,DB_HEADERS.DailyPosted.length).getValues().map(function(r){
    return rowObj_(DB_HEADERS.DailyPosted, r);
  }).filter(function(r){ return String(r.day) === day && String(r.signalId || r.symbol || '').trim(); });
}








function ensureDailyPostedDay_() {
  var p = PropertiesService.getScriptProperties();
  var today = marketDayKey_(Date.now());
  var stored = String(p.getProperty('DAILY_POSTED_DAY') || '');
  var sh = dbSheet_('DailyPosted');

  if (stored !== today) {
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, DB_HEADERS.DailyPosted.length).clearContent();
    p.setProperty('DAILY_POSTED_DAY', today);
  }
  return today;
}








function recordXPost_(r,meta){if(!r||!r.id)return;meta=meta||{};try{console.log('XPosts log: '+String(r.id)+' '+String(meta.type||''));}catch(e){console.log('XPosts log: '+errorText_(e));}}








function saveLastBinanceSquarePost_(a, r, source, text) {
  const p = PropertiesService.getScriptProperties();
  const row = {
    at:Date.now(), atText:nowText_(), symbol:String(a && a.symbol || ''), interval:String(a && a.interval || ''),
    signal:String(a && a.signal || ''), strength:Number(a && a.strength || 0), source:String(source || ''),
    id:String(r && r.id || ''), link:String(r && r.link || ''), status:String(r && r.status || 'published'),
    text:truncateCodePoints_(String(text || ''), 1000)
  };
  p.setProperty('LAST_BINANCE_SQUARE_POST', JSON.stringify(row));
}








function previewThreadsPost_(chatId, messageId, symbol, interval) {
  // v13.7: bullish-only single-TF preview with 30m confirmation.
  var seed = analyzeSymbol_(symbol, interval);
  var bullish = String(seed.signal).indexOf('BULL') === 0 && !!seed.tradePlan;
  var confirm = null, confirmOk = false;
  try {
    confirm = analyzeSymbol_(symbol, String(CFG.MTF_CONFIRM_INTERVAL || '30m'));
    confirmOk = String(confirm.signal).indexOf('BULL') === 0 && !!confirm.tradePlan;
  } catch (e) { console.log('preview MTF confirm: ' + errorText_(e)); }
  if (!bullish) {
    return editOrSend_(chatId, messageId, '\u26AA ' + baseSymbol_(symbol) + ' tidak ada setup BULLISH pada ' + interval + ' (' + seed.signal + '). Bullish-only mode.', [
      [inlineBtn_('🔄 REFRESH', 'postpreview:' + symbol + ':' + interval)],
      [inlineBtn_('🔙 BACK', 'ana:' + symbol + ':' + interval)]
    ]);
  }
  seed.mtfConfirm = confirm;

  var caption = buildCryptoBullishCaption_(seed);
  var destinations = 'Threads' + (shouldPublishXSignal_('CRYPTO','MANUAL')?' + X':'') + ((getBoolProp_('BINANCE_SQUARE_AUTO_ENABLED', false) && getBinanceSquareApiKey_())?' + Binance Square':'');
  var text = '🧵 POST PREVIEW \u2022 BULLISH ONLY\nMTF: 15m \u2705 + 30m ' + (confirmOk ? '\u2705' : '\u26A0\uFE0F ' + (confirm ? confirm.signal : 'error')) +
    '\nDestination: ' + destinations + '\n\n' + caption + '\n\nPost sekarang?';
  editOrSend_(chatId, messageId, text, [
    [inlineBtn_('\u2705 CONFIRM POST', 'postconfirm:' + symbol + ':' + interval)],
    [inlineBtn_('\u274C CANCEL', 'ana:' + symbol + ':' + interval)]
  ]);
}








function confirmThreadsPost_(chatId, messageId, symbol, interval) {
  editOrSend_(chatId, messageId, '🚀 Posting ' + symbol + (getBoolProp_('BINANCE_SQUARE_AUTO_ENABLED', false) ? ' ke Threads + Binance Square...' : ' ke Threads...'), []);
  const a = analyzeSymbol_(symbol, interval);
  const r = publishSignal_(a, true, 'MANUAL');
  if (!r.posted) return editOrSend_(chatId, messageId, r.message, [[inlineBtn_('🔙 BACK', 'ana:' + symbol + ':' + interval)]]);
  editOrSend_(chatId, messageId, r.message, [
    [inlineBtn_('🔄 ANALYZE AGAIN', 'ana:' + symbol + ':' + interval)],
    [inlineBtn_('🏠 MENU', 'home')]
  ]);
}








function createSignalChartAsset_(candles, meta) {
  const n=candles.length;
  const closes=candles.map(function(c){return Number(c.close);});
  const e9=emaSeries_(closes,9), e21=emaSeries_(closes,21), e50=emaSeries_(closes,50);
  const cData=candles.map(function(c){return{x:Number(c.openTime),o:Number(c.open),h:Number(c.high),l:Number(c.low),c:Number(c.close)};});
  const volData=candles.map(function(c){return{x:Number(c.openTime),y:Number(c.volume||0)};});
  function lineData(arr){return candles.map(function(c,i){return{x:Number(c.openTime),y:Number(arr[i]||c.close)};});}

  const hitStatus=String(meta.status||'');
  const hitNo=/TP([123])_HIT/.test(hitStatus)?Number(hitStatus.match(/TP([123])_HIT/)[1]):0;
  const titleStatus=hitNo?('TP'+hitNo+' HIT • +'+round_(Number(meta.observedR||0),2)+'R'):(String(meta.signal||'SIGNAL'));
  const mainTitle='AZZATSSINS TRADING • '+String(meta.symbol)+' • '+String(meta.interval).toUpperCase();
  const subTitle=titleStatus+(meta.strength?' • Strength '+meta.strength+'/5':'')+(meta.setupScore?' • Score '+meta.setupScore+'/100':'');

  function levelLine(label,value,color,width){
    if(!isFinite(value)||value<=0) return null;
    return {
      type:'line',yMin:value,yMax:value,borderColor:color,borderWidth:width||1.5,borderDash:[7,5],
      label:{display:true,content:label,position:'end',backgroundColor:color,color:'#07101f',font:{size:11,weight:'bold'},padding:4}
    };
  }

  const annotations={};
  if(meta.entryLow>0 && meta.entryHigh>0){
    annotations.entry={
      type:'box',yMin:Math.min(meta.entryLow,meta.entryHigh),yMax:Math.max(meta.entryLow,meta.entryHigh),
      backgroundColor:'rgba(80,150,255,0.10)',borderColor:'rgba(80,150,255,0.70)',borderWidth:1,
      label:{display:true,content:'ENTRY',position:'start',backgroundColor:'#4f9cff',color:'#07101f',font:{size:11,weight:'bold'}}
    };
  }
  const tps=[meta.tp1,meta.tp2,meta.tp3];
  tps.forEach(function(v,i){
    const no=i+1, hit=hitNo>=no;
    const x=levelLine('TP'+no+(hit?' ✓':''),Number(v),hit?'#35e6a5':'#7ce7bd',hit?3:1.4);
    if(x) annotations['tp'+no]=x;
  });
  const sl=levelLine('SL',Number(meta.stopLoss),'#ff6f7f',1.7); if(sl)annotations.sl=sl;
  const last=levelLine('LAST',Number(meta.lastPrice),'#f4f7fb',1); if(last){last.borderDash=[2,5];last.label.backgroundColor='#d9e5f6';annotations.last=last;}

  const maxVol=Math.max.apply(null,candles.map(function(c){return Number(c.volume||0);}).concat([1]));
  const chart={
    type:'candlestick',
    data:{datasets:[
      {label:'Price',data:cData,color:{up:'#27d980',down:'#f05b78',unchanged:'#9aa8bb'},borderColor:{up:'#27d980',down:'#f05b78',unchanged:'#9aa8bb'},order:1},
      {type:'line',label:'EMA 9',data:lineData(e9),borderColor:'#f0b44d',borderWidth:1.6,pointRadius:0,tension:0.18,order:2},
      {type:'line',label:'EMA 21',data:lineData(e21),borderColor:'#ed4e91',borderWidth:1.6,pointRadius:0,tension:0.18,order:3},
      {type:'line',label:'EMA 50',data:lineData(e50),borderColor:'#42c7e8',borderWidth:1.6,pointRadius:0,tension:0.18,order:4},
      {type:'bar',label:'Volume',data:volData,yAxisID:'yVol',backgroundColor:'rgba(63,209,150,0.28)',borderWidth:0,barPercentage:0.8,order:10}
    ]},
    options:{
      parsing:false,
      animation:false,
      normalized:true,
      layout:{padding:{top:10,right:16,bottom:4,left:8}},
      plugins:{
        legend:{display:true,position:'top',align:'start',labels:{color:'#a9b7cc',boxWidth:14,font:{size:10}}},
        title:{display:true,text:mainTitle,color:'#eef5ff',align:'start',font:{size:18,weight:'bold'},padding:{bottom:2}},
        subtitle:{display:true,text:subTitle,color:hitNo?'#54efb3':'#91a3bd',align:'start',font:{size:12,weight:'bold'},padding:{bottom:8}},
        annotation:{annotations:annotations}
      },
      scales:{
        x:{type:'time',time:{unit:chartTimeUnit_(meta.interval),displayFormats:{minute:'HH:mm',hour:'HH:mm',day:'dd MMM'}},grid:{color:'rgba(118,139,168,0.10)'},ticks:{color:'#8495ad',maxTicksLimit:9,font:{size:9}}},
        y:{position:'right',grid:{color:'rgba(118,139,168,0.12)'},ticks:{color:'#a9b7cc',font:{size:10}}},
        yVol:{display:false,position:'left',min:0,suggestedMax:maxVol*4.5,grid:{display:false}}
      }
    }
  };

  const request={
    width:CFG.CHART_WIDTH,height:CFG.CHART_HEIGHT,devicePixelRatio:1,format:'png',
    backgroundColor:'#07101f',version:'4',chart:chart
  };
  const fileName=('AZZATSSINS_'+String(meta.symbol)+'_'+String(meta.interval)+'_'+String(meta.status||'SIGNAL')+'.png').replace(/[^A-Za-z0-9._-]/g,'_');
  const blob=renderQuickChartBlob_(request).setName(fileName);
  const url=createQuickChartShortUrl_(request);
  warmChartUrl_(url);
  return {blob:blob,url:url,fileName:fileName};
}








function buildSignalChartAsset_(a,extra) {
  extra=extra||{};
  var symbol=normalizeSymbol_(a.symbol);
  var interval=String(a.interval||CFG.DEFAULT_INTERVAL);
  var candles=getOkxClosedKlines_(symbol,interval,CFG.CHART_CANDLES);
  if(!candles||candles.length<30)throw new Error('Candle chart tidak cukup: '+(candles?candles.length:0));

  var plan=a.tradePlan||{entryLow:Number(a.entryLow||0),entryHigh:Number(a.entryHigh||0),entry:Number(a.entry||0),tp1:Number(a.tp1||0),tp2:Number(a.tp2||0),tp3:Number(a.tp3||0),stopLoss:Number(a.stopLoss||0)};
  return createSignalChartAsset_(candles,{
    assetType:'CRYPTO',symbol:symbol,interval:interval,signal:a.signal?String(a.signal):(String(a.side||'').toUpperCase()==='SHORT'?'SHORT':'LONG'),
    strength:Number(a.strength||0),setupScore:Number(a.setupScore||0),entryLow:Number(plan.entryLow||0),entryHigh:Number(plan.entryHigh||0),
    tp1:Number(plan.tp1||0),tp2:Number(plan.tp2||0),tp3:Number(plan.tp3||0),stopLoss:Number(plan.stopLoss||0),
    lastPrice:Number(a.price||a.lastPrice||candles[candles.length-1].close||0),status:String(extra.status||'NEW_SIGNAL'),observedR:Number(extra.observedR||0)
  });
}








function renderQuickChartBlob_(request) {
  const res=UrlFetchApp.fetch(CFG.QUICKCHART_RENDER_URL,{
    method:'post',contentType:'application/json',payload:JSON.stringify(request),
    muteHttpExceptions:true,followRedirects:true
  });
  if(res.getResponseCode()<200 || res.getResponseCode()>=300) throw new Error('QuickChart render HTTP '+res.getResponseCode()+': '+res.getContentText().slice(0,400));
  const blob=res.getBlob();
  if(!/^image\//i.test(blob.getContentType()||'')) throw new Error('QuickChart tidak mengembalikan image: '+blob.getContentType());
  return blob;
}








function createQuickChartShortUrl_(request) {
  const res=UrlFetchApp.fetch(CFG.QUICKCHART_CREATE_URL,{
    method:'post',contentType:'application/json',payload:JSON.stringify(request),
    muteHttpExceptions:true,followRedirects:true
  });
  const raw=res.getContentText(), b=safeJsonParse_(raw);
  if(res.getResponseCode()<200 || res.getResponseCode()>=300 || !b || !b.success || !b.url) throw new Error('QuickChart create URL gagal: '+raw.slice(0,400));
  return String(b.url);
}








function warmChartUrl_(url) {
  for(let i=0;i<3;i++){
    try{
      const r=UrlFetchApp.fetch(url,{method:'get',muteHttpExceptions:true,followRedirects:true});
      if(r.getResponseCode()>=200 && r.getResponseCode()<300 && /^image\//i.test(r.getBlob().getContentType()||'')) return true;
    }catch(_){}
    Utilities.sleep(700*(i+1));
  }
  return false;
}








function chartTimeUnit_(interval){
  interval=String(interval||'15m').toLowerCase();
  if(interval==='1d')return'day';
  if(interval.indexOf('h')>=0)return'hour';
  return'minute';
}








function derivCompactLine_(symbol) {
  var d=getCompactDerivativesContext_(symbol);
  if(!d)return '';
  var parts=['Deriv '+d.score+'/100','Smart '+d.smartMoney+'/100'];
  if(d.oiChange!=null)parts.push('OI '+formatPctSigned_(d.oiChange,1));
  if(d.funding!=null)parts.push('Fund '+formatFunding_(d.funding));
  return parts.join(' • ');
}

/* ---------- Tests ---------- */


/**
 * Slim crypto-only publish pipeline: gate -> caption -> chart -> Threads/Square/X/Telegram.
 */






/* ================= FRESHNESS GUARD =================
 * Batalkan post bila harga sudah lari terlalu jauh di atas entry zone
 * sejak analisa dibuat. Entry basi = signal basi (follower masuk terlambat).
 * LONG only: yang dicek hanya drift ke atas; harga turun = entry lebih baik.
 */
function freshnessCheck_(a) {
  var maxDrift = Number(getProp_('FRESHNESS_MAX_DRIFT_PCT', false) || CFG.FRESHNESS_MAX_DRIFT_PCT || 0.4);
  var p = (a && a.tradePlan) || {};
  var entryHigh = Number(p.entryHigh || 0);
  if (!entryHigh) return { ok: true, skipped: 'no_entry' };
  var last = 0;
  try {
    var tickers = fetchAllSpotTickers_();
    var t = tickers[normalizeSymbol_(a.symbol)];
    last = Number((t && t.last) || 0);
  } catch (e) { return { ok: true, skipped: 'price_unavailable' }; }
  if (!last) return { ok: true, skipped: 'price_unavailable' };
  var driftPct = (last - entryHigh) / entryHigh * 100;
  if (driftPct > maxDrift) {
    return { ok: false, driftPct: driftPct,
             reason: 'harga +' + round_(driftPct, 2) + '% di atas entry (batas +' + maxDrift + '%) — entry basi' };
  }
  return { ok: true, driftPct: driftPct };
}

function publishSignal_(a, force, source) {
  if (!a) return { posted:false, message:'⚪ Analysis kosong.' };
  // Public signal ID — bisa diaudit follower di halaman track record.
  if (!a.publicId) {
    a.publicId = 'AZ-' + Utilities.formatDate(new Date(), CFG.TZ, 'MMdd') + '-' +
                 String(Math.floor(Math.random() * 900 + 100));
  }

  // Bullish-only: bearish/short signals are never posted.
  if (CFG.BULLISH_ONLY && String(a.signal).indexOf('BULL') !== 0) {
    return { posted:false, message:'⚪ Bullish-only mode: signal ' + a.signal + ' tidak dipost.' };
  }

  // 30m confirmation (LEAN). The auto cycle already attaches a.mtfConfirm.
  if (CFG.MTF_CONFIRM_REQUIRED && !force) {
    try {
      var chk0 = a.mtfConfirm ? mtfConfirmPass_(a.mtfConfirm) : { pass:false };
      if (!chk0.pass) {
        var mc = analyzeSymbol_(a.symbol, String(CFG.MTF_CONFIRM_INTERVAL || '30m'));
        var chk = mtfConfirmPass_(mc);
        if (!chk.pass) return { posted:false, message:'⚪ Konfirmasi 30m gagal (' + chk.reason + ') — tidak dipost.' };
        a.mtfConfirm = mc;
        a.mtfConfirmBoost = chk.boost || 0;
        a.mtfConfirmPenalty = chk.penalty || 0;
      }
    } catch (mtfErr) {
      return { posted:false, message:'❌ Konfirmasi MTF gagal: ' + errorText_(mtfErr) };
    }
  }

  if (a.signal === 'NEUTRAL' || !a.tradePlan)
    return { posted:false, message:'⚪ Signal masih NEUTRAL, tidak dipost.' };

  var gate = canPostSignal_(a, !!force);
  if (!gate.allowed) return { posted:false, message:'⏳ Tidak dipost: ' + gate.reason };

  // Direction-change dedup: never repost the same coin + same direction
  // unless the market direction changed since the last post.
  if (!force) {
    var dg = directionGate_(a.symbol, 'BULL');
    if (!dg.allowed) return { posted:false, message:'⏳ ' + dg.reason };
  }

  // Deep-check gate: patterns + MTF + derivatives + liquidity + news.
  if (getBoolProp_('DEEPCHECK_ENABLED', CFG.DEEPCHECK_ENABLED)) {
    try {
      var dcGate = prePublishDeepCheck_(a);
      if (dcGate.notes && dcGate.notes.length)
        console.log('DeepCheck [' + a.symbol + ']: ' + dcGate.notes.join(' | '));
      if (!dcGate.pass) {
        try { notifyAdmin_('🛡 DeepCheck VETO ' + a.symbol + ' • ' + a.signal + '\n' + dcGate.vetoReason); } catch (_) {}
        return { posted:false, message:'🛡 DeepCheck veto: ' + dcGate.vetoReason };
      }
      a.deepCheck = dcGate;
      a.qualityScore = deepCheckQualityScore_(a, dcGate);
    } catch (dcErr) {
      console.log('DeepCheck error: ' + errorText_(dcErr));
      if (!CFG.DEEPCHECK_FAIL_OPEN)
        return { posted:false, message:'🛡 DeepCheck error: ' + errorText_(dcErr) };
    }
  }

  // Freshness guard: harga tidak boleh sudah lari dari entry zone.
  try {
    var fr = freshnessCheck_(a);
    if (!fr.ok) {
      try { notifyAdmin_('⏱ Freshness guard ' + a.symbol + ': ' + fr.reason + ' — tidak dipost.'); } catch (_) {}
      return { posted:false, message:'⏱ Freshness guard: ' + fr.reason };
    }
  } catch (frErr) { console.log('Freshness: ' + errorText_(frErr)); }

  var caption;
  try { caption = buildCryptoBullishCaption_(a); }
  catch (err) { console.error('Caption fallback: ' + errorText_(err)); caption = fallbackCaption_(a); }
  caption = truncateCodePoints_(caption.trim(), CFG.THREADS_MAX_CHARS);

  var chart = null, chartError = '';
  try { chart = buildSignalChartAsset_(a, { status:'NEW_SIGNAL', observedR:0 }); }
  catch (err2) { chartError = errorText_(err2); console.error('Signal chart: ' + chartError); }

  var hookUrl = null;
  try { hookUrl = buildHookImage_(a); } catch (hookErr) { console.log('Hook: ' + errorText_(hookErr)); }

  var isAutoSource = String(source || '').indexOf('AUTO') === 0;
  var channelEnabled = isAutoSource && isTelegramChannelAutopostEnabled_();
  var squareEnabled = getBoolProp_('BINANCE_SQUARE_AUTO_ENABLED', false) && !!getBinanceSquareApiKey_();
  var xEnabled = shouldPublishXSignal_('CRYPTO', source || 'UNKNOWN');

  var threads = null, threadsError = '';
  try {
    if (hookUrl && chart && chart.url) threads = postToThreadsCarousel_(caption, [hookUrl, chart.url]);
    else if (chart && chart.url) threads = postToThreadsImage_(caption, chart.url);
    else threads = postToThreads_(caption);
  } catch (err3) {
    threadsError = errorText_(err3);
    console.error('Threads image publish: ' + threadsError);
    try { threads = postToThreads_(caption); threadsError = chart ? 'image gagal, text fallback OK' : threadsError; }
    catch (err4) { threadsError = errorText_(err4); }
  }

  var square = null, squareError = '';
  if (squareEnabled) {
    try {
      var squareCaption = buildSquareBullishSignalContent_(a, null);
      var sqImages = hookUrl ? [hookUrl] : [];
      square = postToBinanceSquareImages_(squareCaption, sqImages, chart && chart.blob ? chart.blob : null, chart && chart.fileName);
      saveLastBinanceSquarePost_(a, square, source || 'UNKNOWN', squareCaption);
    } catch (err5) {
      squareError = errorText_(err5);
      console.error('Binance Square: ' + squareError);
      try {
        square = postToBinanceSquare_(buildSquareBullishSignalContent_(a, null));
        squareError = 'image failed, text fallback OK';
      } catch (err6) { squareError = errorText_(err6); }
    }
  }

  var xPost = null, xError = '';
  if (xEnabled) {
    try {
      var xText = buildXSignalCaption_(a);
      xPost = xCreatePost_(xText, '');
      recordXPost_(xPost, { type:'SIGNAL', asset:a.symbol || '', interval:a.interval || '', source:source || 'UNKNOWN', text:xText });
    } catch (xe) { xError = errorText_(xe); console.error('X publish: ' + xError); }
  }

  var channel = null, channelError = '';
  if (channelEnabled) {
    try {
      var chUrls = [];
      if (hookUrl) chUrls.push(hookUrl);
      if (chart && chart.url) chUrls.push(chart.url);
      channel = sendTelegramChannelPost_(caption, chart && chart.blob ? chart.blob : null, chUrls);
    }
    catch (err7) { channelError = errorText_(err7); console.error('Telegram channel publish: ' + channelError); }
  }

  if (!threads && !square && !xPost && !(channel && !channel.skipped)) {
    var problems = [];
    if (threadsError) problems.push('Threads: ' + threadsError);
    if (squareEnabled && squareError) problems.push('Square: ' + squareError);
    if (xEnabled && xError) problems.push('X: ' + xError);
    if (channelEnabled && channelError) problems.push('Telegram Channel: ' + channelError);
    throw new Error('Semua destination gagal. ' + problems.join(' | '));
  }

  var threadId = threads && threads.id ? String(threads.id) : '';
  savePostedSignal_(a, threadId, source || 'UNKNOWN', caption, { xPostId: xPost && xPost.id || '' });
  try { dirStateMarkPosted_(a.symbol, 'BULL'); } catch (_) {}

  var p = a.tradePlan;
  var msg = [
    '✅ SIGNAL PUBLISHED' + (isAutoSource ? ' • AUTO' : ''),
    a.symbol + ' • ' + a.interval + ' • Quality ' + (a.qualityScore || '-') + '/100',
    a.signal + ' • Strength ' + a.strength + '/5' +
      (a.mtfConfirm ? ' • 30m ' + Number(a.mtfConfirm.strength || 0) + '/5 ✅' : ''),
    'Entry: ' + formatPrice_(p.entryLow) + ' - ' + formatPrice_(p.entryHigh),
    'TP1: ' + formatPrice_(p.tp1) + ' | TP2: ' + formatPrice_(p.tp2) + ' | TP3: ' + formatPrice_(p.tp3),
    'SL: ' + formatPrice_(p.stopLoss),
    chart ? 'Chart: ✅ attached' : 'Chart: ⚠️ ' + (chartError || 'unavailable'),
    threads ? 'Threads: ✅ ' + (threadId || 'published') : 'Threads: ❌ ' + threadsError,
    xEnabled ? (xPost ? 'X: ✅ ' + String(xPost.id || 'published') : 'X: ❌ ' + xError) : 'X: ⏸ OFF',
    squareEnabled ? (square ? 'Square: ✅ ' + (square.id || square.status || 'published') : 'Square: ❌ ' + squareError) : 'Square: ⏸ OFF',
    channelEnabled ? (channel && !channel.skipped ? 'Telegram Channel: ✅' : 'Telegram Channel: ❌ ' + (channelError || 'unknown')) : 'Telegram Channel: ⏸ OFF/manual'
  ].join('\n');

  if (isAutoSource) {
    try {
      if (chart && chart.blob) sendTelegramPhoto_(chart.blob, msg, getProp_('TELEGRAM_CHAT_ID', true));
      else notifyAdmin_(msg);
    } catch (err8) { notifyAdmin_(msg); }
  }
  return { posted:true, id:threadId || '', channelPosted:!!(channel && !channel.skipped), message:msg };
}

/** Crypto-only X caption. */






function buildXSignalCaption_(a) {
  var mc = a.mtfConfirm;
  var q = a.qualityScore || Math.max(5, Math.min(98, Math.round(40 + Number(a.strength || 0) * 10)));
  var lines = [
    '🟢 $' + baseSymbol_(a.symbol) + ' LONG • Quality ' + q + '/100' +
      (q >= Number(CFG.HIGH_CONVICTION_MIN_QUALITY || 80) ? ' 🔥HIGH CONVICTION' : ''),
    String(a.interval || '15m').toUpperCase() + ' ' + Number(a.strength || 0) + '/5' +
      (mc ? ' • 30m ' + Number(mc.strength || 0) + '/5 ✅' : '') +
      (a.mtfConfirm4h ? ' • 4h ' + Number(a.mtfConfirm4h.strength || 0) + '/5 ' +
        (String(a.mtfConfirm4h.signal || '').indexOf('BEAR') === 0 ? '⚠️' : '✅') : ''),
    'Entry ' + compactPrice_(a.tradePlan.entryLow) + ' • TP ' + compactPrice_(a.tradePlan.tp1),
    '$' + baseSymbol_(a.symbol) + ' #Crypto #DYOR #AZZATSSINS'
  ];
  return truncateCodePoints_(lines.filter(Boolean).join('\n'), CFG.X_MAX_CHARS);
}






function signalStateKey_(symbol, interval) {
  return 'SIGNAL_STATE_' + symbol + '_' + interval;
}







function getCompactDerivativesContext_(symbol) {
  if(!CFG.DERIVATIVES_ENABLED||!CFG.DERIVATIVES_MTF_ENRICH_ENABLED)return null;
  try{
    var a=getAdvancedDerivativesSnapshot_(symbol,CFG.DERIVATIVES_DEFAULT_PERIOD,false);
    return {
      score:Number(a.base.score&&a.base.score.value||50),
      smartMoney:Number(a.gate.derived.smartMoneyScore||50),
      leverageRisk:Number(a.gate.derived.leverageRiskIndex||0),
      bias:String(a.base.score&&a.base.score.bias||'NEUTRAL'),
      oiChange:a.base.aggregateOiChange,
      funding:a.base.aggregateFunding,
      regime:String(a.gate.derived.regime||'BALANCED')
    };
  }catch(_){return null;}
}







function formatFunding_(rate) {
  return formatPctSigned_(Number(rate||0)*100,4);
}







function recordThreadsPost_() { return ''; }






function getHistory_() { return []; }

/* ================= HOOK IMAGE (gambar 1) =================
 * AI-generated scroll-stopper via Agnes AI. Fail-soft: null = post tanpa hook.
 * Key: Script Properties AI_KEY_AGNES (fallback AGNES_API_KEY).
 */
function getAgnesKey_() {
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('AI_KEY_AGNES') || p.getProperty('AGNES_API_KEY') || '';
}

function buildHookImage_(a) {
  if (!getBoolProp_('HOOK_IMAGE_ENABLED', true)) return null;
  var key = getAgnesKey_();
  if (!key) { console.log('Hook image: AI_KEY_AGNES belum diset — skip.'); return null; }
  var coin = baseSymbol_(a.symbol);
  var q = Number(a.qualityScore || 0);
  var reasons = [];
  try { reasons = a.deepCheck ? deepCheckTopReasons_(a.deepCheck, 1) : []; } catch (_) {}
  var theme = reasons.length ? reasons[0] : 'bullish breakout momentum';
  var prompt = 'Crypto trading signal announcement card, bold neon style, dark background. ' +
    'Huge bold glowing text "' + coin + ' LONG", big green upward arrow, rising green candlesticks, ' +
    'a badge reading "Quality ' + q + '/100", visual theme: ' + theme + '. ' +
    'Dramatic professional crypto art, dark green and black, ultra high contrast, no watermark, square 1:1.';
  try {
    var res = UrlFetchApp.fetch('https://apihub.agnes-ai.com/v1/images/generations', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify({
        model: 'agnes-image-2.5-flash', prompt: prompt,
        size: '1K', ratio: '1:1', extra_body: { response_format: 'url' }
      }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) { console.log('Agnes HTTP ' + res.getResponseCode()); return null; }
    var body = safeJsonParse_(res.getContentText());
    var url = body && body.data && body.data[0] && body.data[0].url;
    if (url && /^https:\/\//i.test(String(url))) { console.log('Hook image OK'); return String(url); }
  } catch (e) { console.log('Hook image: ' + errorText_(e)); }
  return null;
}

/* ================= THREADS CAROUSEL =================
 * Gambar 1 = hook, gambar 2 = chart. Fallback: 1 gambar / teks.
 */
function postToThreadsCarousel_(text, imageUrls) {
  var token = getProp_('THREADS_ACCESS_TOKEN', true);
  var caption = truncateCodePoints_(String(text || '').trim(), CFG.THREADS_MAX_CHARS);
  if (!caption) throw new Error('Caption kosong.');
  var urls = (imageUrls || []).filter(function(u) { return /^https:\/\//i.test(String(u || '')); }).slice(0, 10);
  if (urls.length < 2) {
    return urls.length === 1 ? postToThreadsImageLegacy_(text, urls[0]) : postToThreadsLegacy_(text);
  }
  urls.forEach(function(u) {
    try { UrlFetchApp.fetch(u, { method: 'get', muteHttpExceptions: true, followRedirects: true }); } catch (_) {}
  });
  var children = urls.map(function(u) {
    var cUrl = CFG.THREADS_API_BASE + '/me/threads?' + toQuery_({ media_type: 'IMAGE', image_url: String(u), access_token: token });
    var cRes = UrlFetchApp.fetch(cUrl, { method: 'post', muteHttpExceptions: true });
    var c = safeJsonParse_(cRes.getContentText());
    if (cRes.getResponseCode() < 200 || cRes.getResponseCode() >= 300 || !c || !c.id)
      throw new Error('Threads child create HTTP ' + cRes.getResponseCode() + ': ' + String(cRes.getContentText()).slice(0, 300));
    waitThreadsContainer_(c.id, token);
    return c.id;
  });
  var carUrl = CFG.THREADS_API_BASE + '/me/threads?' + toQuery_({
    media_type: 'CAROUSEL', children: children.join(','), text: caption, access_token: token
  });
  var carRes = UrlFetchApp.fetch(carUrl, { method: 'post', muteHttpExceptions: true });
  var car = safeJsonParse_(carRes.getContentText());
  if (carRes.getResponseCode() < 200 || carRes.getResponseCode() >= 300 || !car || !car.id)
    throw new Error('Threads carousel create HTTP ' + carRes.getResponseCode() + ': ' + String(carRes.getContentText()).slice(0, 300));
  waitThreadsContainer_(car.id, token);
  var publishUrl = CFG.THREADS_API_BASE + '/me/threads_publish?' + toQuery_({ creation_id: car.id, access_token: token });
  var last = '';
  for (var i = 0; i < 3; i++) {
    var pRes = UrlFetchApp.fetch(publishUrl, { method: 'post', muteHttpExceptions: true });
    last = pRes.getContentText();
    var body = safeJsonParse_(last);
    if (pRes.getResponseCode() >= 200 && pRes.getResponseCode() < 300 && body && body.id) return body;
    if (i < 2) Utilities.sleep(1000 * (i + 1));
  }
  throw new Error('Threads carousel publish gagal: ' + last.slice(0, 600));
}

/* ================= BINANCE SQUARE MULTI-IMAGE =================
 * Square hanya menerima imageUrl hasil upload via API-nya sendiri
 * (presigned URL -> S3), bukan URL eksternal. Jadi setiap gambar
 * (hook URL maupun chart blob) di-upload dulu via uploadBinanceSquareImage_.
 */
function postToBinanceSquareImages_(text, imageUrls, chartBlob, fileName) {
  var urls = [];
  (imageUrls || []).forEach(function(u, i) {
    if (!/^https:\/\//i.test(String(u || ''))) return;
    try {
      var hb = UrlFetchApp.fetch(String(u), { muteHttpExceptions: true, followRedirects: true }).getBlob();
      urls.push(uploadBinanceSquareImage_(hb, 'azzatssins-hook-' + Date.now() + '-' + i + '.png'));
    } catch (e) { console.log('Square hook upload [' + i + ']: ' + errorText_(e)); }
  });
  if (chartBlob) {
    try { urls.push(uploadBinanceSquareImage_(chartBlob, fileName)); }
    catch (e) { console.log('Square chart upload: ' + errorText_(e)); }
  }
  urls = urls.slice(0, 9);
  var key = getBinanceSquareApiKey_();
  var bodyTextOnly = truncateCodePoints_(String(text || '').trim(), CFG.BINANCE_SQUARE_MAX_CHARS);
  if (!bodyTextOnly) throw new Error('Caption Binance Square kosong.');
  var payload = { contentType: 1, bodyTextOnly: bodyTextOnly };
  if (urls.length) payload.imageList = urls;
  var res = UrlFetchApp.fetch(CFG.BINANCE_SQUARE_API_URL, {
    method: 'post', contentType: 'application/json',
    headers: { 'X-Square-OpenAPI-Key': key, 'clienttype': 'binanceSkill' },
    payload: JSON.stringify(payload), muteHttpExceptions: true, followRedirects: true
  });
  var httpCode = res.getResponseCode(), raw = res.getContentText();
  if (httpCode === 504) return { ok: true, id: '', link: '', status: 'success_without_post_id', httpCode: 504 };
  var body = safeJsonParse_(raw);
  if (httpCode < 200 || httpCode >= 300) throw new Error('Binance Square HTTP ' + httpCode + ': ' + raw.slice(0, 600));
  if (!body || String(body.code) !== '000000') throw new Error('Binance Square API [' + String(body && body.code || '?') + ']: ' + String(body && body.message || raw).slice(0, 500));
  var data = body.data || {};
  return { ok: true, id: String(data.id || ''), link: String(data.link || ''), status: 'published', httpCode: httpCode };
}

/* ================= TELEGRAM MEDIA GROUP ================= */
function sendTelegramPhotoUrl_(chatId, photoUrl, caption) {
  var res = fetchJson_(telegramApi_('sendPhoto'), {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, photo: String(photoUrl), caption: truncateCodePoints_(String(caption || ''), 1024) }),
    muteHttpExceptions: true
  });
  if (!res.ok) throw new Error('sendPhoto url: ' + JSON.stringify(res).slice(0, 300));
  return res;
}

function sendTelegramMediaGroup_(chatId, caption, urls) {
  var media = urls.map(function(u, i) {
    var m = { type: 'photo', media: String(u) };
    if (i === 0) m.caption = truncateCodePoints_(String(caption || ''), 1024);
    return m;
  });
  var res = fetchJson_(telegramApi_('sendMediaGroup'), {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, media: media }),
    muteHttpExceptions: true
  });
  if (!res.ok) throw new Error('sendMediaGroup: ' + JSON.stringify(res).slice(0, 300));
  return res;
}

/* ==================================================================
 * SECTION: Track.gs  (54 functions)
 * ================================================================== */

/**
 * Track.gs — AZZATSSINS crypto signal bot (remake, crypto-only)
 * Signal lifecycle (TP/SL), paper stats, winrate review, backtest.
 */

const DB_HEADERS = Object.freeze({
  Signals:['id','assetType','symbol','interval','side','strength','setupScore','regime','entryLow','entryHigh','entry','tp1','tp2','tp3','stopLoss','status','highestTarget','resultR','postedAt','updatedAt','closedAt','threadId','source','lastPrice','lastNotifiedStrength','lastNotifiedScore','notes','xPostId'],
  DailyPosted:['day','signalId','assetType','symbol','interval','side','postedAt','source','initialPrice'],
  WinrateReports:['day','generatedAt','totalSignals','tpHit','stoppedBeforeTp','nearTp','activeOther','expired','ambiguous','resolved','winRate','avgR','status','postedAt','threadsId','telegramPosted','squareId','text'],
  News:['id','topic','title','url','domain','publishedAt','score','status','related','sourceCount','postedAt','threadId'],
  Backtest:['at','assetType','symbol','interval','trades','wins','losses','winRate','avgR','notes'],
  ProviderHealth:['at','provider','status','httpCode','latencyMs','message'],
  ThreadsPosts:['threadId','createdAt','type','asset','topic','signal','strength','source','text','permalink','lastCheckedAt'],
  ThreadsInsights:['at','threadId','ageHours','views','likes','replies','reposts','quotes','shares','engagement','type','asset','topic'],
  SquareQueue:['id','createdAt','scheduledAt','priority','status','contentType','symbol','interval','signalId','campaignId','text','chartUrl','attempts','lastAttemptAt','postedAt','squarePostId','squareLink','error','metaJson'],
  SquareCampaigns:['id','detectedAt','updatedAt','title','token','hashtag','mention','startAt','endAt','rewardText','minChars','sourceUrl','status','joined','rulesJson','lastNotifiedAt'],
  SquarePosts:['at','queueId','contentType','symbol','campaignId','postId','link','status','source','monetizationTags','text'],
  ThreadsReplies:['detectedAt','rootThreadId','replyId','username','text','timestamp','status'],
  ThreadsQueue:['id','createdAt','scheduledAt','status','type','rootThreadId','text','attempts','postedAt','replyId','error'],
  XPosts:['postId','createdAt','type','asset','interval','source','rootPostId','text','status','error']
});

var DB_SPREADSHEET_CACHE_ = null;

function dbSheet_(name) {
  if (!DB_HEADERS[name]) throw new Error('DB schema tidak dikenal: ' + name);

  let ss = DB_SPREADSHEET_CACHE_;
  if (!ss) {
    const id = getProp_('DB_SPREADSHEET_ID', false);
    if (id) {
      try { ss = SpreadsheetApp.openById(id); } catch (_) { ss = null; }
    }
    if (!ss) ss = ensureDatabase_();
    DB_SPREADSHEET_CACHE_ = ss;
  }

  let sh = ss.getSheetByName(name);
  if (!sh) {
    // Schema repair is rare; only run the expensive check when a sheet is actually missing.
    ss = ensureDatabase_();
    sh = ss.getSheetByName(name);
  }
  if (!sh) throw new Error('DB sheet tidak ada: ' + name);
  return sh;
}



function ensureDatabase_() {
  const p = PropertiesService.getScriptProperties();
  let id = p.getProperty('DB_SPREADSHEET_ID');
  let ss = null;

  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (_) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('AZZATSSINS_TRADING_BOT_DB');
    p.setProperty('DB_SPREADSHEET_ID', ss.getId());
  }

  Object.keys(DB_HEADERS).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);

    if (sh.getLastRow() === 0) {
      sh.appendRow(DB_HEADERS[name]);
    } else {
      const headers = DB_HEADERS[name];
      const width = Math.max(headers.length, sh.getLastColumn());
      const current = sh.getRange(1,1,1,width).getValues()[0].slice(0, headers.length);
      const mismatch = headers.some(function(h, i) { return String(current[i] || '') !== String(h); });
      if (mismatch) sh.getRange(1,1,1,headers.length).setValues([headers]);
    }

    try {
      sh.setFrozenRows(1);
      sh.getRange(1,1,1,DB_HEADERS[name].length).setFontWeight('bold');
    } catch (_) {}
  });

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (_) {}
  }

  DB_SPREADSHEET_CACHE_ = ss;
  return ss;
}



function getSignalRows_() {
  const sh=dbSheet_('Signals');
  const n=sh.getLastRow(); if(n<2) return [];
  const vals=sh.getRange(2,1,n-1,DB_HEADERS.Signals.length).getValues();
  return vals.map(function(r,i){ const o=rowObj_(DB_HEADERS.Signals,r); o._row=i+2; return o; });
}



function rowObj_(headers, row) { const o={}; headers.forEach(function(h,i){ o[h]=row[i]; }); return o; }



function recordSignalLifecycle_(a, threadId, source, xPostId) {
  if (!a || !a.tradePlan) return;
  var sh = dbSheet_('Signals');
  var p = a.tradePlan;
  var side = a.signal === 'BEARISH WATCH' ? 'SHORT' : 'LONG';
  var type = String(a.assetType || 'CRYPTO').toUpperCase();
  var prefix = type === 'IDX' ? 'I' : (type === 'FOREX' ? 'F' : 'C');
  var id = (a && a.publicId) ||
      prefix + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random()*900+100);
  sh.appendRow([
    id, type, a.ticker || a.symbol, a.interval || '15m', side,
    a.strength || 0, a.setupScore || '', a.regime || '', p.entryLow, p.entryHigh, p.entry,
    p.tp1,p.tp2,p.tp3,p.stopLoss,'ACTIVE',0,0,Date.now(),Date.now(),' ',threadId || '',source || '',a.price || '',a.strength || 0,a.setupScore || 0,'',String(xPostId||'')
  ]);
  return id;
}



function updateSignalLifecycle_() {
  var allRows = getSignalRows_();
  var monitor = lifecycleMonitorState_();
  var activeStatus = {ACTIVE:true, TP1_HIT:true, TP2_HIT:true};
  var rows = allRows.filter(function(r) {
    var id = String(r.id || '');
    return !!activeStatus[String(r.status || 'ACTIVE')] || !!(id && monitor[id] && monitor[id].pendingAlert);
  });
  var p = PropertiesService.getScriptProperties();
  p.setProperty('LAST_LIFECYCLE_RUN_AT', String(Date.now()));

  if (!rows.length) {
    saveLifecycleMonitorState_(monitor, {});
    return {ok:true,active:0,changed:0,pending:0};
  }

  var activeRows = rows.filter(function(r){ return !!activeStatus[String(r.status || 'ACTIVE')]; });
  var cbars = fetchCryptoLifecycleBars_(activeRows.map(function(r){ return r.symbol; }));

  var sh = dbSheet_('Signals');
  var changed = 0;
  var pending = 0;
  var now = Date.now();
  var activeIds = {};

  rows.forEach(function(r) {
    var id = String(r.id || '');
    if (!id) return;
    var st = monitor[id] || {};
    st.updatedAt = now;
    if (activeStatus[String(r.status || 'ACTIVE')]) activeIds[id] = true;

    // Retry a notification that failed after the DB status had already changed.
    if (!activeStatus[String(r.status || 'ACTIVE')]) {
      if (st.pendingAlert) {
        pending++;
        try {
          notifyLifecycleChange_(r, String(st.pendingStatus || r.status), Number(st.pendingHt || r.highestTarget || 0), Number(st.pendingR || r.resultR || 0));
          st.lastAlertKey = st.pendingAlert;
          st.pendingAlert = '';
          st.pendingStatus = '';
          st.pendingHt = 0;
          st.pendingR = 0;
          pending--;
        } catch (retryErr) {
          recordLifecycleError_(retryErr);
        }
      }
      monitor[id] = st;
      return;
    }

    var key = normalizeSymbol_(r.symbol);
    var allBars = cbars[key] || [];
    var cursorAt = Math.max(Number(r.postedAt || 0), Number(st.cursorAt || 0));
    var since = cursorAt - 1000;
    var bars = allBars.filter(function(b) {
      return Number(b.closeTime || b.openTime || 0) > since;
    });

    var ageH = (now - Number(r.postedAt || 0)) / 3600000;
    var expiry = CFG.CRYPTO_SIGNAL_EXPIRY_HOURS;

    var status = String(r.status || 'ACTIVE');
    var ht = Number(r.highestTarget || 0);
    var rr = Number(r.resultR || 0);
    var closedAt = r.closedAt || '';
    var note = String(r.notes || '');
    var lastPrice = Number(r.lastPrice || 0);

    for (var i=0; i<bars.length && !closedAt; i++) {
      var bar = bars[i];
      cursorAt = Math.max(cursorAt, Number(bar.closeTime || bar.openTime || 0));
      var longSide = String(r.side) !== 'SHORT';
      var stopHit = longSide ? Number(bar.low) <= Number(r.stopLoss) : Number(bar.high) >= Number(r.stopLoss);
      var t1 = longSide ? Number(bar.high) >= Number(r.tp1) : Number(bar.low) <= Number(r.tp1);
      var t2 = longSide ? Number(bar.high) >= Number(r.tp2) : Number(bar.low) <= Number(r.tp2);
      var t3 = longSide ? Number(bar.high) >= Number(r.tp3) : Number(bar.low) <= Number(r.tp3);
      var oldHt = ht;
      var touched = t3 ? 3 : (t2 ? 2 : (t1 ? 1 : 0));
      lastPrice = Number(bar.close || lastPrice || 0);

      // Same-candle TP/SL ordering cannot be reconstructed from OHLC.
      if (stopHit && touched > oldHt) {
        status = 'AMBIGUOUS';
        closedAt = now;
        note = 'TP' + touched + '/SL tersentuh dalam candle 5m yang sama';
        break;
      }

      if (touched > ht) {
        ht = touched;
        rr = ht >= 3 ? CFG.TP3_RR : (ht >= 2 ? CFG.TP2_RR : CFG.TP1_RR);
        status = 'TP' + ht + '_HIT';
        if (ht >= 3) {
          closedAt = now;
          break;
        }
      }

      if (stopHit && !closedAt) {
        rr = ht >= 2 ? CFG.TP2_RR : (ht >= 1 ? CFG.TP1_RR : -1);
        status = 'STOPPED';
        closedAt = now;
        break;
      }
    }

    if (!closedAt && ageH >= expiry) {
      status = 'EXPIRED';
      rr = ht >= 2 ? CFG.TP2_RR : (ht >= 1 ? CFG.TP1_RR : 0);
      closedAt = now;
      if (!note) note = 'Signal expired after ' + expiry + 'h';
    }

    var statusChanged = status !== String(r.status || '');
    var targetChanged = ht !== Number(r.highestTarget || 0);
    var closedChanged = String(closedAt || '') !== String(r.closedAt || '');
    var noteChanged = note !== String(r.notes || '');

    // updatedAt is only a freshness timestamp now; candle cursor is kept separately in Script Properties.
    sh.getRange(r._row,16,1,12).setValues([[
      status, ht, rr, r.postedAt || '', now, closedAt || '', r.threadId || '', r.source || '',
      lastPrice || '', r.lastNotifiedStrength || '', r.lastNotifiedScore || '', note
    ]]);
    r.status = status;
    r.highestTarget = ht;
    r.resultR = rr;
    r.closedAt = closedAt;
    r.lastPrice = lastPrice;
    st.cursorAt = cursorAt;

    if (statusChanged || targetChanged || closedChanged || noteChanged) changed++;

    if (statusChanged) {
      var alertKey = status + ':' + ht;
      st.pendingAlert = alertKey;
      st.pendingStatus = status;
      st.pendingHt = ht;
      st.pendingR = rr;
    }

    if (st.pendingAlert) {
      pending++;
      try {
        notifyLifecycleChange_(r, String(st.pendingStatus || status), Number(st.pendingHt || ht), Number(st.pendingR || rr));
        st.lastAlertKey = st.pendingAlert;
        st.pendingAlert = '';
        st.pendingStatus = '';
        st.pendingHt = 0;
        st.pendingR = 0;
        pending--;
      } catch (notifyErr) {
        recordLifecycleError_(notifyErr);
      }
    }

    monitor[id] = st;
  });

  saveLifecycleMonitorState_(monitor, activeIds);
  p.setProperty('LAST_LIFECYCLE_RUN_AT', String(Date.now()));
  return {ok:true,active:activeRows.length,changed:changed,pending:pending};
}



function notifyLifecycleChange_(r,status,ht,rr) {
  var icon = status==='STOPPED'?'❌':status==='AMBIGUOUS'?'⚠️':status==='EXPIRED'?'⏳':'✅';
  var assetHead = '🪙 ' + String(r.symbol);
  var privateText = [icon + ' SIGNAL UPDATE', assetHead, 'Status: ' + status, ht ? 'Highest target: TP' + ht : '', 'Observed R: ' + round_(rr,2), r.lastPrice ? 'Last: ' + formatPrice_(Number(r.lastPrice)) : '' ].filter(Boolean).join('\n');
  if (CFG.CHART_TP_AUTOPOST && /^TP[123]_HIT$/.test(String(status))) {
    try {
      publishTpUpdate_(r, status, ht, rr);
      return;
    } catch (err) {
      console.error('TP public autopost gagal: ' + errorText_(err));
    }
  }
  notifyAdmin_(privateText);
}



function publishTpUpdate_(r, status, ht, rr) {
  var symbol = normalizeSymbol_(r.symbol);
  var tpNo = Math.max(1, Math.min(3, Number(ht || (String(status).match(/[123]/) && String(status).match(/[123]/)[0]) || 1)));
  var last = Number(r.lastPrice || 0);
  var coin = baseSymbol_(symbol);
  var caption = [
    '✅ TP' + tpNo + ' HIT • $' + coin,
    String(r.interval || '15m').toUpperCase() + ' • ' + String(r.side || 'LONG'), '',
    'Target reached: TP' + tpNo,
    'Observed: +' + round_(Number(rr || 0), 2) + 'R',
    last ? 'Last: ' + formatPrice_(last) : '', '',
    'Entry: ' + formatPrice_(Number(r.entryLow || 0)) + ' - ' + formatPrice_(Number(r.entryHigh || 0)),
    'TP1: ' + formatPrice_(Number(r.tp1 || 0)) + (tpNo >= 1 ? ' ✅' : ''),
    'TP2: ' + formatPrice_(Number(r.tp2 || 0)) + (tpNo >= 2 ? ' ✅' : ''),
    'TP3: ' + formatPrice_(Number(r.tp3 || 0)) + (tpNo >= 3 ? ' ✅' : ''), '',
    '$' + coin + ' #Crypto #DYOR #AZZATSSINS', '',
    '⚠️ NFA — Educational purposes only. DYOR & manage risk.'
  ].filter(Boolean).join('\n');

  var chart = null, errs = [];
  try { chart = buildSignalChartAsset_(r, { status:status, observedR:rr }); }
  catch (chartErr) { errs.push('Chart: ' + errorText_(chartErr)); }

  var threads = null;
  try {
    threads = chart && chart.url
      ? postToThreadsImage_(truncateCodePoints_(caption, CFG.THREADS_MAX_CHARS), chart.url)
      : postToThreads_(truncateCodePoints_(caption, CFG.THREADS_MAX_CHARS));
  } catch (e) {
    errs.push('Threads: ' + errorText_(e));
    try { threads = postToThreads_(truncateCodePoints_(caption, CFG.THREADS_MAX_CHARS)); }
    catch (e2) { errs.push('Threads fallback: ' + errorText_(e2)); }
  }

  var xTp = null, xTpError = '';
  var xTpEnabled = getBoolProp_('X_PUBLISHER_ENABLED', CFG.X_PUBLISHER_ENABLED) &&
                   getBoolProp_('X_AUTO_TP_ENABLED', CFG.X_AUTO_TP_ENABLED) && xAuthStatus_().configured;
  if (xTpEnabled) {
    try {
      var xText = '✅ TP' + tpNo + ' HIT $' + coin + ' +' + round_(Number(rr || 0), 2) + 'R\n$' + coin + ' #Crypto #DYOR #AZZATSSINS';
      xTp = xCreatePost_(truncateCodePoints_(xText, CFG.X_MAX_CHARS), String(r.xPostId || ''));
    } catch (xte) { xTpError = errorText_(xte); errs.push('X: ' + xTpError); }
  }

  var square = null;
  if (getBoolProp_('BINANCE_SQUARE_AUTO_ENABLED', false) && !!getBinanceSquareApiKey_()) {
    try {
      var sqCaption = truncateCodePoints_(caption, CFG.BINANCE_SQUARE_MAX_CHARS);
      square = chart && chart.blob
        ? postToBinanceSquareImage_(sqCaption, chart.blob, chart.fileName)
        : postToBinanceSquare_(sqCaption);
    } catch (e4) { errs.push('Square: ' + errorText_(e4)); }
  }

  var channel = null, channelError = '';
  if (isTelegramChannelAutopostEnabled_()) {
    try { channel = sendTelegramChannelPost_(caption, chart && chart.blob ? chart.blob : null); }
    catch (e6) { channelError = errorText_(e6); errs.push('Telegram Channel: ' + channelError); }
  }

  var admin = [
    '✅ TP HIT DETECTED',
    '🪙 ' + symbol + ' • TP' + tpNo + ' HIT',
    'Observed R: ' + round_(Number(rr || 0), 2),
    chart ? 'Chart: ✅' : 'Chart: ⚠️ fallback text',
    threads ? 'Threads: ✅ ' + String(threads.id || 'published') : 'Threads: ❌',
    xTpEnabled ? (xTp ? 'X: ✅ ' + String(xTp.id || 'published') : 'X: ❌ ' + xTpError) : 'X: ⏸',
    square ? 'Binance Square: ✅' : 'Binance Square: ⏸/❌',
    channel && !channel.skipped ? 'Telegram Channel: ✅' : 'Telegram Channel: ⏸/❌',
    errs.length ? 'Fallback: ' + truncateCodePoints_(errs.join(' | '), 700) : ''
  ].filter(Boolean).join('\n');

  if (chart && chart.blob) {
    try { sendTelegramPhoto_(chart.blob, admin, getProp_('TELEGRAM_CHAT_ID', true)); }
    catch (e7) { notifyAdmin_(admin); }
  } else {
    notifyAdmin_(admin);
  }
  return { threads:threads, x:xTp, square:square, channel:channel, chartUrl:chart && chart.url || '' };
}

function lifecycleMonitorState_() {
  var raw = safeJsonParse_(getProp_('LIFECYCLE_MONITOR_STATE_V105', false) || '{}');
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}



function saveLifecycleMonitorState_(state, activeIds) {
  state = state || {};
  activeIds = activeIds || {};
  var now = Date.now();
  var keep = {};
  Object.keys(state).forEach(function(id) {
    var x = state[id] || {};
    var fresh = now - Number(x.updatedAt || 0) < 72 * 3600000;
    if (activeIds[id] || x.pendingAlert || fresh) keep[id] = x;
  });
  var ids = Object.keys(keep).sort(function(a,b){ return Number((keep[b]||{}).updatedAt||0) - Number((keep[a]||{}).updatedAt||0); });
  if (ids.length > 120) {
    var slim = {};
    ids.slice(0,120).forEach(function(id){ slim[id] = keep[id]; });
    keep = slim;
  }
  PropertiesService.getScriptProperties().setProperty('LIFECYCLE_MONITOR_STATE_V105', JSON.stringify(keep));
}



function recordLifecycleError_(err) {
  var p = PropertiesService.getScriptProperties();
  var msg = errorText_(err);
  p.setProperty('LAST_LIFECYCLE_ERROR', msg);
  p.setProperty('LAST_LIFECYCLE_ERROR_AT', String(Date.now()));
  var last = Number(p.getProperty('LAST_LIFECYCLE_ERROR_NOTICE_AT') || 0);
  var wait = Math.max(60, Number(CFG.LIFECYCLE_ERROR_NOTICE_MINUTES || 360)) * 60000;
  if (Date.now() - last >= wait) {
    try { notifyAdmin_('⚠️ TP MONITOR ERROR\n' + truncateCodePoints_(msg, 800) + '\n\nGunakan /tpcheck untuk diagnostik.'); } catch (_) {}
    p.setProperty('LAST_LIFECYCLE_ERROR_NOTICE_AT', String(Date.now()));
  }
}



function signalTp1ProgressPct_(r) {
  var entry = Number(r.entry || 0);
  if (!entry) {
    var lo = Number(r.entryLow || 0), hi = Number(r.entryHigh || 0);
    if (lo && hi) entry = (lo + hi) / 2;
    else entry = lo || hi || 0;
  }
  var last = Number(r.lastPrice || 0);
  var tp1 = Number(r.tp1 || 0);
  if (!(entry > 0) || !(last > 0) || !(tp1 > 0)) return 0;

  var longSide = String(r.side || '').toUpperCase() !== 'SHORT';
  var denom = longSide ? (tp1 - entry) : (entry - tp1);
  if (!(denom > 0)) return 0;
  var moved = longSide ? (last - entry) : (entry - last);
  return Math.max(0, Math.min(99.9, moved / denom * 100));
}



function getPerformanceStats_(days){
  const since=Date.now()-Number(days||30)*86400000;
  const rows=getSignalRows_().filter(function(r){return Number(r.postedAt)>=since && ['ACTIVE','TP1_HIT','TP2_HIT'].indexOf(String(r.status))<0;});
  const valid=rows.filter(function(r){return String(r.status)!=='AMBIGUOUS';});
  const wins=valid.filter(function(r){return Number(r.resultR)>0;}).length;
  const losses=valid.filter(function(r){return Number(r.resultR)<0;}).length;
  const flat=valid.filter(function(r){return Number(r.resultR)===0;}).length;
  const closed=wins+losses;
  return {total:rows.length,valid:valid.length,wins:wins,losses:losses,flat:flat,closed:closed,winRate:closed?wins/closed*100:0,avgR:valid.length?average_(valid.map(function(r){return Number(r.resultR||0);})):0};
}



function getDailyWinrateReport_(dayKey) {
  dayKey = String(dayKey || previousMarketDayKey_());
  var start = dayStartMs_(dayKey);
  var end = start + 86400000;
  var nearThreshold = Math.max(50, Math.min(99, getIntProp_('DAILY_WINRATE_NEAR_TP_PCT', CFG.DAILY_WINRATE_NEAR_TP_PCT)));

  var rows = getSignalRows_().filter(function(r){
    var t = Number(r.postedAt || 0);
    return t >= start && t < end;
  });

  var out = {
    day: dayKey,
    generatedAt: Date.now(),
    totalSignals: rows.length,
    tpHit: 0,
    stoppedBeforeTp: 0,
    nearTp: 0,
    activeOther: 0,
    expired: 0,
    ambiguous: 0,
    resolved: 0,
    winRate: 0,
    avgR: 0,
    nearThreshold: nearThreshold,
    details: []
  };

  var resolvedR = [];
  rows.forEach(function(r) {
    var status = String(r.status || 'ACTIVE').toUpperCase();
    var ht = Number(r.highestTarget || 0);
    var progress = signalTp1ProgressPct_(r);
    var item = {
      symbol:String(r.symbol || ''),
      assetType:String(r.assetType || ''),
      status:status,
      highestTarget:ht,
      resultR:Number(r.resultR || 0),
      progress:progress
    };

    if (ht >= 1) {
      out.tpHit++;
      out.resolved++;
      resolvedR.push(Number(r.resultR || (ht >= 3 ? CFG.TP3_RR : (ht >= 2 ? CFG.TP2_RR : CFG.TP1_RR))));
      item.bucket = 'TP';
    } else if (status === 'STOPPED') {
      out.stoppedBeforeTp++;
      out.resolved++;
      resolvedR.push(Number(r.resultR || -1));
      item.bucket = 'STOP';
    } else if (status === 'AMBIGUOUS') {
      out.ambiguous++;
      item.bucket = 'AMBIGUOUS';
    } else if (progress >= nearThreshold) {
      // "Near TP" remains useful even if the signal has just expired; it is
      // still shown separately and never counted as a win.
      out.nearTp++;
      item.bucket = 'NEAR';
    } else if (status === 'EXPIRED') {
      out.expired++;
      item.bucket = 'EXPIRED';
    } else {
      out.activeOther++;
      item.bucket = 'ACTIVE';
    }
    out.details.push(item);
  });

  out.winRate = out.resolved ? out.tpHit / out.resolved * 100 : 0;
  out.avgR = resolvedR.length ? average_(resolvedR) : 0;

  out.details.sort(function(a,b){
    var rank = {TP:5,NEAR:4,STOP:3,ACTIVE:2,EXPIRED:1,AMBIGUOUS:0};
    return (rank[b.bucket] || 0) - (rank[a.bucket] || 0) ||
      Number(b.highestTarget || 0) - Number(a.highestTarget || 0) ||
      Number(b.progress || 0) - Number(a.progress || 0);
  });
  return out;
}



function maybeSendDailyWinrateReview_() {
  if (!getBoolProp_('DAILY_WINRATE_REVIEW_ENABLED', CFG.DAILY_WINRATE_REVIEW_ENABLED)) return {ok:true,skipped:'disabled'};

  var p = PropertiesService.getScriptProperties();
  var today = marketDayKey_(Date.now());
  var hour = Number(Utilities.formatDate(new Date(), CFG.TZ, 'H'));
  var reviewHour = Math.max(0, Math.min(23, getIntProp_('DAILY_WINRATE_REVIEW_HOUR', CFG.DAILY_WINRATE_REVIEW_HOUR)));
  if (hour < reviewHour) return {ok:true,skipped:'not_due'};
  if (String(p.getProperty('LAST_DAILY_WINRATE_REVIEW_DAY') || '') === today) return {ok:true,skipped:'already_sent'};

  var dayKey = previousMarketDayKey_();
  var r = getDailyWinrateReport_(dayKey);
  if (!r.totalSignals) {
    p.setProperty('LAST_DAILY_WINRATE_REVIEW_DAY', today);
    return {ok:true,skipped:'no_yesterday_signals',day:dayKey};
  }

  saveDailyWinrateCandidate_(r);
  var saved = !!getWinrateReportRecord_(r.day);
  sendTelegram_(formatDailyWinrateAdmin_(r), getProp_('TELEGRAM_CHAT_ID', true), {
    replyMarkup:{inline_keyboard:dailyWinrateButtons_(r.day, saved)}
  });
  p.setProperty('LAST_DAILY_WINRATE_REVIEW_DAY', today);
  return {ok:true,sent:true,day:dayKey,total:r.totalSignals,winRate:r.winRate,tpHit:r.tpHit,nearTp:r.nearTp};
}



function formatDailyWinrateAdmin_(r) {
  var lines = [
    '📊 DAILY WINRATE REVIEW • ' + prettyDayKey_(r.day),
    '',
    'Signal terpost: ' + r.totalSignals,
    '✅ TP HIT: ' + r.tpHit,
    '❌ SL sebelum TP: ' + r.stoppedBeforeTp,
    '🟡 Near TP1 ≥' + r.nearThreshold + '%: ' + r.nearTp,
    '⏳ Active/lainnya: ' + r.activeOther,
    '⌛ Expired: ' + r.expired,
    '⚠️ Ambiguous: ' + r.ambiguous,
    '',
    r.resolved ? ('🎯 Winrate: ' + round_(r.winRate,1) + '% (' + r.tpHit + '/' + r.resolved + ' resolved)') : '🎯 Winrate: belum ada signal resolved',
    r.resolved ? ('📈 Avg observed R: ' + round_(r.avgR,2)) : '',
    '',
    'DETAIL'
  ].filter(Boolean);

  if (!r.details.length) lines.push('Tidak ada signal yang dipost pada tanggal ini.');
  else r.details.slice(0,18).forEach(function(x){ lines.push(dailyWinrateDetailLine_(x)); });
  if (r.details.length > 18) lines.push('… +' + (r.details.length - 18) + ' signal lainnya');

  lines.push(
    '',
    'Catatan: Near TP tidak dihitung sebagai win. Winrate hanya TP HIT vs SL sebelum TP pada signal yang sudah resolved.',
    'Pilih aksi admin di bawah.'
  );
  return lines.join('\n');
}



function formatDailyWinratePublic_(r) {
  var s = [
    '📊 AZZATSSINS DAILY SIGNAL REPORT',
    prettyDayKey_(r.day),
    '',
    'Signals: ' + r.totalSignals,
    '✅ TP hit: ' + r.tpHit,
    '❌ SL before TP: ' + r.stoppedBeforeTp,
    '🟡 Near TP1 ≥' + r.nearThreshold + '%: ' + r.nearTp,
    r.resolved ? ('🎯 Winrate: ' + round_(r.winRate,1) + '% (' + r.tpHit + '/' + r.resolved + ' resolved)') : '🎯 Win rate: no resolved signals yet',
    r.resolved ? ('📈 Avg observed R: ' + round_(r.avgR,2)) : '',
    '',
    'Near-TP signals are not counted as wins.',
    'NFA • DYOR'
  ].filter(Boolean).join('\n');
  return s;
}



function dailyWinrateButtons_(dayKey, saved) {
  var row = [];
  if (!saved) row.push(inlineBtn_('📝 CATAT', 'dwr:save:' + dayKey));
  row.push(inlineBtn_('📣 POST', 'dwr:post:' + dayKey));
  return [
    row,
    [inlineBtn_('🗑 HAPUS', 'dwr:delete:' + dayKey)],
    [inlineBtn_('🏠 MENU', 'home')]
  ];
}



function saveDailyWinrateCandidate_(r) {
  var p = PropertiesService.getScriptProperties();
  var c = {
    day:r.day,
    reviewDay:marketDayKey_(Date.now()),
    createdAt:Date.now()
  };
  p.setProperty('DAILY_WINRATE_PENDING', JSON.stringify(c));
}



function getDailyWinrateCandidate_() {
  return safeJsonParse_(getProp_('DAILY_WINRATE_PENDING', false) || '') || null;
}



function getWinrateReportRecord_(dayKey) {
  var sh = dbSheet_('WinrateReports');
  var n = sh.getLastRow();
  if (n < 2) return null;
  var vals = sh.getRange(2,1,n-1,DB_HEADERS.WinrateReports.length).getValues();
  for (var i=vals.length-1; i>=0; i--) {
    if (String(vals[i][0]) === String(dayKey)) {
      var o = rowObj_(DB_HEADERS.WinrateReports, vals[i]);
      o._row = i + 2;
      return o;
    }
  }
  return null;
}



function upsertDailyWinrateReport_(r, status, publishState) {
  publishState = publishState || {};
  var existing = getWinrateReportRecord_(r.day);
  var row = [
    r.day,
    Number(r.generatedAt || Date.now()),
    Number(r.totalSignals || 0),
    Number(r.tpHit || 0),
    Number(r.stoppedBeforeTp || 0),
    Number(r.nearTp || 0),
    Number(r.activeOther || 0),
    Number(r.expired || 0),
    Number(r.ambiguous || 0),
    Number(r.resolved || 0),
    Number(r.winRate || 0),
    Number(r.avgR || 0),
    String(status || (existing && existing.status) || 'RECORDED'),
    Number(publishState.postedAt || (existing && existing.postedAt) || 0),
    String(publishState.threadsId || (existing && existing.threadsId) || ''),
    String(typeof publishState.telegramPosted !== 'undefined' ? publishState.telegramPosted : (existing && existing.telegramPosted) || ''),
    String(publishState.squareId || (existing && existing.squareId) || ''),
    formatDailyWinratePublic_(r)
  ];
  var sh = dbSheet_('WinrateReports');
  if (existing && existing._row) sh.getRange(existing._row,1,1,row.length).setValues([row]);
  else sh.appendRow(row);
  return getWinrateReportRecord_(r.day);
}



function publishDailyWinrateReport_(r) {
  var existing = getWinrateReportRecord_(r.day) || {};
  var publicText = formatDailyWinratePublic_(r);
  var out = {
    telegramPosted:String(existing.telegramPosted || '').toLowerCase() === 'true',
    threadsId:String(existing.threadsId || ''),
    squareId:String(existing.squareId || ''),
    errors:[]
  };

  var telegramEnabled = getBoolProp_('DAILY_WINRATE_TELEGRAM_POST_ENABLED', CFG.DAILY_WINRATE_TELEGRAM_POST_ENABLED);
  var threadsEnabled = getBoolProp_('DAILY_WINRATE_THREADS_POST_ENABLED', CFG.DAILY_WINRATE_THREADS_POST_ENABLED);
  var squareEnabled = getBoolProp_('DAILY_WINRATE_SQUARE_POST_ENABLED', CFG.DAILY_WINRATE_SQUARE_POST_ENABLED);

  if (telegramEnabled && !out.telegramPosted) {
    try {
      var channelId = getTelegramChannelId_();
      if (!channelId) throw new Error('TELEGRAM_CHANNEL_ID kosong');
      sendTelegram_(publicText, channelId);
      out.telegramPosted = true;
      upsertDailyWinrateReport_(r, 'POSTING', {postedAt:Date.now(),telegramPosted:true,threadsId:out.threadsId,squareId:out.squareId});
    } catch (e1) {
      out.errors.push('Telegram Channel: ' + errorText_(e1));
    }
  }

  if (threadsEnabled && !out.threadsId) {
    try {
      var th = postToThreads_(publicText);
      out.threadsId = th && th.id ? String(th.id) : '';
      if (out.threadsId) {
        try {
          recordThreadsPost_(out.threadsId, {
            createdAt:Date.now(), type:'DAILY_WINRATE', asset:'ALL', topic:'PERFORMANCE',
            signal:'REPORT', strength:Math.round(Number(r.winRate || 0)), source:'DAILY_WINRATE', text:publicText
          });
        } catch (_) {}
      }
      upsertDailyWinrateReport_(r, 'POSTING', {postedAt:Date.now(),telegramPosted:out.telegramPosted,threadsId:out.threadsId,squareId:out.squareId});
    } catch (e2) {
      out.errors.push('Threads: ' + errorText_(e2));
    }
  }

  if (squareEnabled && !out.squareId) {
    try {
      var sq = postToBinanceSquare_(publicText);
      out.squareId = sq && sq.id ? String(sq.id) : (sq && sq.status ? String(sq.status) : 'posted');
      upsertDailyWinrateReport_(r, 'POSTING', {postedAt:Date.now(),telegramPosted:out.telegramPosted,threadsId:out.threadsId,squareId:out.squareId});
    } catch (e3) {
      out.errors.push('Binance Square: ' + errorText_(e3));
    }
  }

  var required = 0, success = 0;
  if (telegramEnabled) { required++; if (out.telegramPosted) success++; }
  if (threadsEnabled) { required++; if (out.threadsId) success++; }
  if (squareEnabled) { required++; if (out.squareId) success++; }

  if (!required) throw new Error('Semua destination Daily Winrate sedang OFF.');
  if (!success) throw new Error('Daily Winrate gagal dipost. ' + out.errors.join(' | '));

  out.complete = success === required;
  out.status = out.complete ? 'POSTED' : 'POSTED_PARTIAL';
  out.postedAt = Date.now();
  upsertDailyWinrateReport_(r, out.status, out);
  return out;
}



function maybeRunBacktestStep_(){
  const p=PropertiesService.getScriptProperties(); const last=Number(p.getProperty('LAST_BACKTEST_AT')||0); if(Date.now()-last<CFG.BACKTEST_STEP_HOURS*3600000) return {ok:true,skipped:'not_due'};
  const jobs=getFavorites_().slice(0,8).map(function(x){return 'C:'+x;});
  let idx=Number(p.getProperty('BACKTEST_CURSOR')||0)%Math.max(1,jobs.length), job=jobs[idx], parts=job.split(':'), typ=parts[0], sym=parts[1], r, note;
  r=backtestCryptoSymbol_(sym,'15m'); note='rolling 220 candles; TP1 vs SL first-touch';
  dbSheet_('Backtest').appendRow([Date.now(),'CRYPTO',sym,'15m',r.trades,r.wins,r.losses,r.winRate,r.avgR,note]);
  p.setProperty('BACKTEST_CURSOR',String(idx+1)); p.setProperty('LAST_BACKTEST_AT',String(Date.now())); return {ok:true,symbol:sym,assetType:typ,result:r};
}



function backtestCryptoSymbol_(symbol,tf){
  const pack=getKlinesWithProvider_(symbol,tf,220), c=pack.candles; let trades=0,wins=0,losses=0,sumR=0;
  for(let i=90;i<c.length-12;i+=3){
    let a; try{a=analyzeCandles_(symbol,tf,c.slice(0,i+1),pack.provider);}catch(_){continue;}
    if(a.signal==='NEUTRAL'||a.strength<4||!a.tradePlan) continue;
    trades++; const p=a.tradePlan, longSide=a.signal==='BULLISH WATCH'; let result=0;
    for(let j=i+1;j<Math.min(c.length,i+13);j++){
      const b=c[j], stop=longSide?b.low<=p.stopLoss:b.high>=p.stopLoss, tp=longSide?b.high>=p.tp1:b.low<=p.tp1;
      if(stop&&tp){result=0;break;} if(tp){result=p.rr1;break;} if(stop){result=-1;break;}
    }
    if(result>0)wins++; else if(result<0)losses++; sumR+=result;
  }
  const closed=wins+losses; return {trades:trades,wins:wins,losses:losses,winRate:closed?wins/closed*100:0,avgR:trades?sumR/trades:0};
}



function formatBacktestSummary_(){
  try{ const sh=dbSheet_('Backtest'), n=sh.getLastRow(); if(n<2)return '🧪 Backtest: belum ada data.'; const rows=sh.getRange(Math.max(2,n-4),1,Math.min(5,n-1),DB_HEADERS.Backtest.length).getValues(); return '🧪 AUTO BACKTEST\n'+rows.reverse().map(function(r){return r[2]+' '+r[3]+' • '+r[4]+' trade • Win '+round_(Number(r[7]),1)+'% • AvgR '+round_(Number(r[8]),2);}).join('\n'); }catch(e){return '🧪 Backtest unavailable: '+errorText_(e);} }



function runLifecycleCheckNow_(chatId) {
  var prefix = '';
  try {
    if (!hasAutoTrigger_()) ensureAutoTrigger_();
    var r = updateSignalLifecycle_();
    prefix = '✅ Manual lifecycle scan selesai • changed ' + Number(r.changed || 0) + ' • pending ' + Number(r.pending || 0);
  } catch (err) {
    recordLifecycleError_(err);
    prefix = '❌ Manual lifecycle scan error: ' + errorText_(err);
  }
  return sendTelegram_(prefix, chatId);
}

function getActiveSignalRows_() {
  return getSignalRows_().filter(function(r) {
    return ['ACTIVE','TP1_HIT','TP2_HIT'].indexOf(String(r.status)) >= 0;
  });
}



function marketDayKey_(ms) {
  return Utilities.formatDate(new Date(Number(ms || Date.now())), CFG.TZ, 'yyyy-MM-dd');
}



function previousMarketDayKey_() {
  var today = marketDayKey_(Date.now());
  return marketDayKey_(dayStartMs_(today) - 86400000);
}



function dayStartMs_(dayKey) {
  var s = String(dayKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Format tanggal tidak valid: ' + s);
  return new Date(s + 'T00:00:00+07:00').getTime();
}



function prettyDayKey_(dayKey) {
  return Utilities.formatDate(new Date(dayStartMs_(dayKey)), CFG.TZ, 'dd MMM yyyy');
}



function formatTime_(ms) { return Utilities.formatDate(new Date(Number(ms)), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }



function agoText_(ms) {
  var d=Date.now()-Number(ms||0),m=Math.floor(d/60000);
  if(m<1)return 'just now'; if(m<60)return m+'m ago';
  var h=Math.floor(m/60);if(h<24)return h+'h ago';
  return Math.floor(h/24)+'d ago';
}



function agoFutureText_(ms) {
  var d=Number(ms||0)-Date.now(),m=Math.max(0,Math.ceil(d/60000));
  if(m<60)return 'in '+m+'m';
  return 'in '+Math.ceil(m/60)+'h';
}

/* Additional callback aliases used by v11 menus. */
(function(){})();

/* =========================================================
 * v13.3.2 SAFE SOCIAL RESPONDER v2.0
 * Strict mention safety + AI auto-reply for Threads comments.
 *
 * Design goals:
 * - Mentions and comments are scanned from the official Threads API.
 * - Input is safety-classified BEFORE any public reply is generated.
 * - Unsafe/vulgar/spam/prompt-injection content is ignored publicly.
 * - Trading questions use live AZZATSSINS engines/data context.
 * - General safe questions use the existing Multi-AI Router.
 * - Generated output is safety-rechecked before posting.
 * - Replies are short, varied, contextual, and never claim human actions.
 * - First install baselines existing interactions so old comments are not replied to.
 * ========================================================= */



function nowText_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }



function getLastSignalText_() {
  const s = safeJsonParse_(getProp_('LAST_SIGNAL', false) || '');
  if (!s) return 'Belum ada signal yang dipost.';
  const p = s.tradePlan;
  return [
    '🕘 LAST SIGNAL',
    '🪙 ' + s.symbol + ' • ' + s.interval,
    s.signal + ' • Strength ' + s.strength + '/5',
    p ? 'Entry: ' + formatPrice_(p.entryLow) + ' - ' + formatPrice_(p.entryHigh) : '',
    p ? 'TP1: ' + formatPrice_(p.tp1) + ' | TP2: ' + formatPrice_(p.tp2) : '',
    p ? 'TP3: ' + formatPrice_(p.tp3) : '',
    p ? 'SL: ' + formatPrice_(p.stopLoss) : '',
    'Source: ' + (s.source || '-'),
    'Posted: ' + (s.postedAtText || formatTime_(s.postedAt))
  ].filter(Boolean).join('\n');
}



function showPerformance_(chatId,messageId){
  const p7=getPerformanceStats_(7), p30=getPerformanceStats_(30);
  const txt=['📊 PERFORMANCE','', '7D  • Win '+round_(p7.winRate,1)+'% • Avg R '+round_(p7.avgR,2)+' • Closed '+p7.closed, '30D • Win '+round_(p30.winRate,1)+'% • Avg R '+round_(p30.avgR,2)+' • Closed '+p30.closed, '', 'Statistik dihitung dari level TP/SL yang teramati bot, bukan hasil transaksi pribadi.', '', formatBacktestSummary_()].join('\n');
  editOrSend_(chatId,messageId,txt,[[inlineBtn_('📌 ACTIVE','active'),inlineBtn_('🏠 MENU','home')]]);
}


/* =========================================================
 * v10.6 DAILY POSTED SIGNALS + ADMIN-REVIEWED WINRATE
 * ========================================================= */

function dailyWinrateDetailLine_(x) {
  if (x.bucket === 'TP') return '✅ ' + x.symbol + ' • TP' + Math.max(1, Number(x.highestTarget || 1)) + ' HIT • R ' + round_(Number(x.resultR || 0),2);
  if (x.bucket === 'STOP') return '❌ ' + x.symbol + ' • SL sebelum TP';
  if (x.bucket === 'NEAR') return '🟡 ' + x.symbol + ' • near TP1 ~' + Math.round(Number(x.progress || 0)) + '%';
  if (x.bucket === 'EXPIRED') return '⌛ ' + x.symbol + ' • EXPIRED';
  if (x.bucket === 'AMBIGUOUS') return '⚠️ ' + x.symbol + ' • AMBIGUOUS';
  return '⏳ ' + x.symbol + ' • ' + (x.status || 'ACTIVE') + (x.progress > 0 ? ' • progress ' + Math.round(x.progress) + '%' : '');
}


/* =========================================================
 * PUBLIC WRAPPERS — muncul di dropdown Run (GAS menyembunyikan fungsi berakhiran _).
 * Fungsi inti tetap berjalan otomatis: lifecycle + backtest via trigger 10 menit,
 * performance via tombol 📊 PERFORMANCE di Telegram.
 * ========================================================= */

/** Manual lifecycle scan sekarang juga. Hasil dikirim ke admin Telegram. */
function runLifecycleCheck() {
  return runLifecycleCheckNow_(getProp_('TELEGRAM_CHAT_ID', true));
}

/** Tampilkan performance 7D/30D sekarang juga ke admin Telegram. */
function showPerformanceNow() {
  return showPerformance_(getProp_('TELEGRAM_CHAT_ID', true));
}

/** Paksa satu step backtest sekarang (lewati jeda waktu). */
function forceBacktestStep() {
  PropertiesService.getScriptProperties().setProperty('LAST_BACKTEST_AT', '0');
  return maybeRunBacktestStep_();
}

/* =========================================================
 * SIMPLE PERFORMANCE — per coin, harian & bulanan.
 * Format: coin | N trade | TP x / SL y | WR %
 * ========================================================= */
function perfRowsByCoin_(days) {
  var since = Number(days) <= 1
    ? dayStartMs_(marketDayKey_(Date.now()))
    : Date.now() - 30 * 86400000;
  var rows = getSignalRows_().filter(function(r) { return Number(r.postedAt || 0) >= since; });
  var byCoin = {};
  rows.forEach(function(r) {
    var sym = normalizeSymbol_(r.symbol);
    if (!sym) return;
    var g = byCoin[sym] || (byCoin[sym] = { coin: sym, trades: 0, tp: 0, sl: 0 });
    g.trades++;
    var ht = Number(r.highestTarget || 0);
    var st = String(r.status || '');
    if (ht >= 1 || /^TP[123]_HIT$/.test(st)) g.tp++;
    else if (st === 'STOPPED') g.sl++;
  });
  var list = Object.keys(byCoin).map(function(k) { return byCoin[k]; });
  list.forEach(function(g) {
    var resolved = g.tp + g.sl;
    g.wr = resolved ? Math.round(g.tp / resolved * 100) : 0;
  });
  list.sort(function(x, y) { return y.trades - x.trades || y.wr - x.wr; });
  return list;
}

function formatSimplePerf_(label, list) {
  var lines = ['📊 ' + label, ''];
  if (!list.length) {
    lines.push('Belum ada signal pada periode ini.');
  } else {
    list.forEach(function(g) {
      lines.push('🪙 ' + g.coin + ' | ' + g.trades + ' trade | TP ' + g.tp + 'x / SL ' + g.sl + 'x | WR ' + g.wr + '%');
    });
    if (list.length > 1) {
      var t = { trades: 0, tp: 0, sl: 0 };
      list.forEach(function(g) { t.trades += g.trades; t.tp += g.tp; t.sl += g.sl; });
      var wr = (t.tp + t.sl) ? Math.round(t.tp / (t.tp + t.sl) * 100) : 0;
      lines.push('', '📊 TOTAL | ' + t.trades + ' trade | TP ' + t.tp + 'x / SL ' + t.sl + 'x | WR ' + wr + '%');
    }
  }
  return lines.join('\n');
}

function showPerfMenu_(chatId, messageId) {
  return editOrSend_(chatId, messageId, '📊 PERFORMANCE — pilih periode:',
    [[inlineBtn_('📅 HARIAN', 'perfd'), inlineBtn_('🗓️ BULANAN', 'perfm')],
     [inlineBtn_('🏠 MENU', 'home')]]);
}

function showDailyPerf_(chatId, messageId) {
  var txt = formatSimplePerf_('PERFORMANCE HARIAN • ' + prettyDayKey_(marketDayKey_(Date.now())), perfRowsByCoin_(1));
  return editOrSend_(chatId, messageId, txt,
    [[inlineBtn_('🗓️ BULANAN', 'perfm'), inlineBtn_('🏠 MENU', 'home')]]);
}

function showMonthlyPerf_(chatId, messageId) {
  var txt = formatSimplePerf_('PERFORMANCE 30 HARI', perfRowsByCoin_(30));
  return editOrSend_(chatId, messageId, txt,
    [[inlineBtn_('📅 HARIAN', 'perfd'), inlineBtn_('🏠 MENU', 'home')]]);
}

/** Public wrappers — muncul di dropdown Run. */
function showDailyPerf() { return showDailyPerf_(getProp_('TELEGRAM_CHAT_ID', true)); }
function showMonthlyPerf() { return showMonthlyPerf_(getProp_('TELEGRAM_CHAT_ID', true)); }

/* ================= PROGRESS DIGEST =================
 * Rekap progres signal aktif tiap beberapa jam ke admin.
 * Hit TP/SL sendiri sudah dinotif real-time oleh updateSignalLifecycle_ (tiap 10 mnt);
 * digest ini untuk visibilitas progres yang masih berjalan.
 */
function maybeSendProgressDigest_() {
  var p = PropertiesService.getScriptProperties();
  var intervalH = Math.max(1, getIntProp_('PROGRESS_DIGEST_HOURS', 4));
  var last = Number(p.getProperty('LAST_PROGRESS_DIGEST_AT') || 0);
  if (Date.now() - last < intervalH * 3600000) return { ok: true, skipped: 'not_due' };
  var actives = getActiveSignalRows_();
  p.setProperty('LAST_PROGRESS_DIGEST_AT', String(Date.now()));
  if (!actives.length) return { ok: true, skipped: 'no_active' };
  var lines = ['⏳ SIGNAL PROGRESS • ' + nowText_(), ''];
  actives.forEach(function(r) {
    var pct = Math.round(signalTp1ProgressPct_(r));
    var rr = Number(r.resultR || 0);
    var entry = Number(r.entry || 0) || (Number(r.entryLow || 0) + Number(r.entryHigh || 0)) / 2;
    lines.push('🪙 ' + r.symbol + ' • ' + r.status +
      ' • TP1 ' + pct + '%' +
      (rr ? ' • R ' + round_(rr, 2) : '') +
      (r.lastPrice && entry ? ' • Last ' + compactPrice_(r.lastPrice) : ''));
  });
  lines.push('', 'Cek detail: tombol 📌 ACTIVE di Telegram.');
  notifyAdmin_(lines.join('\n'));
  return { ok: true, sent: actives.length };
}

/** Kirim rekap progres sekarang (abaikan jadwal). */
function sendProgressDigestNow() {
  PropertiesService.getScriptProperties().setProperty('LAST_PROGRESS_DIGEST_AT', '0');
  return maybeSendProgressDigest_();
}

/* =========================================================
 * PUBLIC TRACK RECORD — halaman verifikasi publik (?page=trackrecord).
 * Setiap signal tercatat dengan ID publiknya; tidak ada yang dihapus.
 * ========================================================= */
function signalRForPage_(r) {
  var rr = Number(r.resultR || 0);
  if (rr) return rr;
  var ht = Number(r.highestTarget || 0);
  var st = String(r.status || '');
  if (/^TP[123]_HIT$/.test(st) || ht >= 1) return ht >= 3 ? 3 : (ht >= 2 ? 2.25 : 1.5);
  if (st === 'STOPPED') return -1;
  return 0;
}

function trackRecordPage_() {
  var rows = [];
  try { rows = getSignalRows_(); } catch (e) { rows = []; }
  var closed = rows.filter(function(r) {
    var st = String(r.status || '');
    return /^TP[123]_HIT$/.test(st) || st === 'STOPPED';
  }).sort(function(x, y) {
    return Number(x.closedAt || x.updatedAt || 0) - Number(y.closedAt || y.updatedAt || 0);
  });

  var cum = 0, wins = 0, pts = [];
  closed.forEach(function(r) {
    var rr = signalRForPage_(r);
    cum += rr; if (rr > 0) wins++;
    pts.push({ r: cum, id: String(r.id || ''), sym: String(r.symbol || ''), st: String(r.status || '') });
  });
  var n = closed.length;
  var wr = n ? Math.round(wins / n * 100) : 0;
  var avgR = n ? cum / n : 0;

  // per-coin
  var byCoin = {};
  closed.forEach(function(r) {
    var sym = String(r.symbol || '?');
    var g = byCoin[sym] || (byCoin[sym] = { n: 0, w: 0, r: 0 });
    var rr = signalRForPage_(r);
    g.n++; g.r += rr; if (rr > 0) g.w++;
  });
  var coins = Object.keys(byCoin).map(function(k) {
    return { sym: k, n: byCoin[k].n, w: byCoin[k].w, r: byCoin[k].r,
             wr: byCoin[k].n ? Math.round(byCoin[k].w / byCoin[k].n * 100) : 0 };
  }).sort(function(x, y) { return y.n - x.n; });

  // SVG equity curve
  var W = 640, H = 240, PAD = 36;
  var min = Math.min.apply(null, [0].concat(pts.map(function(p) { return p.r; })));
  var max = Math.max.apply(null, [0].concat(pts.map(function(p) { return p.r; })));
  var span = (max - min) || 1;
  function X(i) { return (PAD + i / Math.max(1, pts.length - 1) * (W - 2 * PAD)).toFixed(1); }
  function Y(v) { return (H - PAD - (v - min) / span * (H - 2 * PAD)).toFixed(1); }
  var path = pts.map(function(p, i) { return (i ? 'L' : 'M') + X(i) + ' ' + Y(p.r); }).join(' ');
  var up = cum >= 0;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var coinRows = coins.map(function(c) {
    return '<tr><td>' + esc(c.sym) + '</td><td>' + c.n + '</td><td>' + c.w + '</td><td>' +
           (c.n - c.w) + '</td><td>' + c.wr + '%</td><td class="' + (c.r >= 0 ? 'pos' : 'neg') + '">' +
           (c.r >= 0 ? '+' : '') + c.r.toFixed(2) + 'R</td></tr>';
  }).join('');

  var sigRows = closed.slice(-20).reverse().map(function(r) {
    var rr = signalRForPage_(r);
    var badge = /^TP/.test(String(r.status)) ? 'tp' : 'sl';
    var when = '';
    try { when = Utilities.formatDate(new Date(Number(r.closedAt || r.updatedAt || 0)), CFG.TZ, 'dd MMM HH:mm'); } catch (_) {}
    return '<tr><td class="mono">' + esc(r.id) + '</td><td>' + esc(r.symbol) + '</td><td>' + when +
           '</td><td><span class="badge ' + badge + '">' + esc(r.status) + '</span></td><td class="' +
           (rr >= 0 ? 'pos' : 'neg') + '">' + (rr >= 0 ? '+' : '') + rr.toFixed(2) + 'R</td></tr>';
  }).join('');

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>AZZATSSINS — Verified Track Record</title><style>' +
    'body{background:#0d1117;color:#e6edf3;font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px}' +
    '.wrap{max-width:760px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}.sub{color:#8b949e;font-size:13px;margin-bottom:18px}' +
    '.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}' +
    '.stat{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;text-align:center}' +
    '.stat .v{font-size:22px;font-weight:700}.stat .l{font-size:11px;color:#8b949e;margin-top:4px}' +
    '.pos{color:#3fb950}.neg{color:#f85149}' +
    '.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:18px}' +
    'table{width:100%;border-collapse:collapse;font-size:13px}' +
    'th{text-align:left;color:#8b949e;font-weight:600;padding:8px;border-bottom:1px solid #30363d}' +
    'td{padding:8px;border-bottom:1px solid #21262d}.mono{font-family:monospace;font-size:12px}' +
    '.badge{font-size:11px;padding:2px 8px;border-radius:10px}.badge.tp{background:#1a3a24;color:#3fb950}.badge.sl{background:#3d1d1d;color:#f85149}' +
    'svg{width:100%;height:auto;display:block}' +
    '.foot{color:#8b949e;font-size:12px;text-align:center;margin-top:8px}' +
    '@media(max-width:560px){.stats{grid-template-columns:repeat(2,1fr)}}' +
    '</style></head><body><div class="wrap">' +
    '<h1>\u2694\uFE0F AZZATSSINS — Verified Track Record</h1>' +
    '<div class="sub">Setiap signal tercatat dengan ID publiknya. Tidak ada signal yang dihapus. #DYOR</div>' +
    '<div class="stats">' +
    '<div class="stat"><div class="v">' + n + '</div><div class="l">CLOSED TRADES</div></div>' +
    '<div class="stat"><div class="v">' + wr + '%</div><div class="l">WIN RATE</div></div>' +
    '<div class="stat"><div class="v ' + (avgR >= 0 ? 'pos' : 'neg') + '">' + (avgR >= 0 ? '+' : '') + avgR.toFixed(2) + 'R</div><div class="l">AVG R</div></div>' +
    '<div class="stat"><div class="v ' + (up ? 'pos' : 'neg') + '">' + (up ? '+' : '') + cum.toFixed(1) + 'R</div><div class="l">TOTAL R</div></div>' +
    '</div>' +
    '<div class="card"><h3 style="margin:0 0 10px;font-size:15px">Equity Curve (cumulative R)</h3>' +
    (pts.length ? '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
      '<line x1="' + PAD + '" y1="' + Y(0) + '" x2="' + (W - PAD) + '" y2="' + Y(0) + '" stroke="#30363d" stroke-dasharray="4"/>' +
      '<path d="' + path + '" fill="none" stroke="' + (up ? '#3fb950' : '#f85149') + '" stroke-width="2.5"/>' +
      '<text x="' + PAD + '" y="16" fill="#8b949e" font-size="11">' + max.toFixed(1) + 'R</text>' +
      '<text x="' + PAD + '" y="' + (H - 8) + '" fill="#8b949e" font-size="11">' + min.toFixed(1) + 'R</text>' +
      '</svg>' : '<div class="sub">Belum ada trade closed.</div>') + '</div>' +
    '<div class="card"><h3 style="margin:0 0 10px;font-size:15px">Per Coin</h3><table>' +
    '<tr><th>Coin</th><th>Trade</th><th>TP</th><th>SL</th><th>WR</th><th>Total R</th></tr>' + coinRows + '</table></div>' +
    '<div class="card"><h3 style="margin:0 0 10px;font-size:15px">Signal Terakhir (tutup)</h3><table>' +
    '<tr><th>ID</th><th>Coin</th><th>Closed</th><th>Hasil</th><th>R</th></tr>' + sigRows + '</table></div>' +
    '<div class="foot">AZZATSSINS &bull; update otomatis dari bot &bull; ' + esc(nowText_()) + '</div>' +
    '</div></body></html>';

  return HtmlService.createHtmlOutput(html).setTitle('AZZATSSINS — Verified Track Record');
}

/** URL halaman track record publik. */
function trackRecordUrl_() {
  try {
    var base = resolveWebAppUrl_();
    if (base && base.indexOf('/exec') > 0) return base + '?page=trackrecord';
  } catch (_) {}
  return '';
}

/* ==================================================================
 * SECTION: Bot.gs  (67 functions)
 * ================================================================== */

/**
 * Bot.gs — Telegram webhook + slim menu + auto cycle + setup.
 */

/** Halaman publik (track record). Webhook Telegram tetap via doPost. */
function doGet(e) {
  var page = String((e && e.parameter && e.parameter.page) || '').toLowerCase();
  if (page === 'trackrecord') {
    try { return trackRecordPage_(); }
    catch (err) { return HtmlService.createHtmlOutput('Track record tidak tersedia: ' + errorText_(err)); }
  }
  return HtmlService.createHtmlOutput('AZZATSSINS Bot API — OK');
}

function doPost(e) {
  try {
    if (!validateTelegramWebhookKey_(e)) return HtmlService.createHtmlOutput('ok');
    var raw = e && e.postData ? e.postData.contents : '';
    var update = safeJsonParse_(raw);
    if (!update || typeof update.update_id === 'undefined') return HtmlService.createHtmlOutput('ok');
    if (isProcessedUpdate_(update.update_id)) return HtmlService.createHtmlOutput('ok');
    handleTelegramUpdate_(update);
    markUpdateProcessed_(update.update_id);
    return HtmlService.createHtmlOutput('ok');
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    try { notifyAdmin_('❌ Webhook error\n' + errorText_(err)); } catch (_) {}
    return HtmlService.createHtmlOutput('ok');
  }
}




function resolveWebAppUrl_() {
  var p = PropertiesService.getScriptProperties();
  var manual = String(p.getProperty('WEB_APP_URL_MANUAL') || '').trim();
  if (manual) {
    if (manual.indexOf('/dev') >= 0) throw new Error('WEB_APP_URL_MANUAL masih URL /dev — pakai URL /exec dari Deploy > Manage deployments.');
    return manual;
  }
  var url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Web app belum di-deploy. Deploy > New version dulu, lalu jalankan setupBot lagi.');
  return url;
}

/** Bersihkan menu command lama + keyboard nyangkut di Telegram. Jalankan sekali bila perlu. */
function clearTelegramMenu() {
  var p = PropertiesService.getScriptProperties();
  var token = String(p.getProperty('TELEGRAM_BOT_TOKEN') || p.getProperty('TELEGRAM_TOKEN') || '').trim();
  if (!token) throw new Error('Token Telegram kosong');
  var chatId = p.getProperty('TELEGRAM_CHAT_ID');
  var api = 'https://api.telegram.org/bot' + token;
  var r1 = UrlFetchApp.fetch(api + '/deleteMyCommands', { muteHttpExceptions: true });
  console.log('deleteMyCommands: ' + r1.getContentText());
  if (chatId) {
    var r2 = UrlFetchApp.fetch(api + '/sendMessage', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: String(chatId),
        text: 'Menu lama dibersihkan. Kirim /start untuk menu baru.',
        reply_markup: { remove_keyboard: true }
      }),
      muteHttpExceptions: true
    });
    console.log('remove_keyboard: ' + r2.getContentText());
  }
  return { ok: true };
}

/** ONE-TIME: paste URL Web App (/exec) secara manual. RUN ONCE, THEN DELETE. */
function setWebAppUrlManual() {
  var URL_EXEC = 'PASTE_URL_WEB_APP_EXEC_DISINI';
  if (URL_EXEC.indexOf('PASTE_') === 0) throw new Error('Ganti dulu PASTE_URL_WEB_APP_EXEC_DISINI dengan URL /exec (Deploy > Manage deployments > Web app URL).');
  if (URL_EXEC.indexOf('/dev') >= 0) throw new Error('Jangan pakai URL /dev — pakai URL /exec dari deployment.');
  if (URL_EXEC.indexOf('/exec') < 0) throw new Error('URL tidak terlihat seperti Web app URL (/exec). Cek lagi.');
  PropertiesService.getScriptProperties().setProperty('WEB_APP_URL_MANUAL', URL_EXEC.trim());
  console.log('WEB_APP_URL_MANUAL tersimpan. Jalankan setupBot lagi, lalu HAPUS fungsi ini.');
  return { ok: true };
}




/** 🔎 CARI COIN — tanya nama coin, lalu tampilkan status/signal + news. */
function askCoinSearch_(chatId, messageId) {
  PropertiesService.getScriptProperties().setProperty('PENDING_INPUT_' + chatId, 'COIN_SEARCH');
  return editOrSend_(chatId, messageId,
    '🔎 CARI COIN\n\nKetik nama coin (mis. BTC, ETH, SOL)...',
    [[inlineBtn_('🏠 MENU', 'home')]]);
}

function showCoinSearch_(chatId, query) {
  var symbol = normalizeSymbol_(query);
  if (!symbol) return sendTelegram_('❌ Coin tidak dikenali. Coba lagi (mis. BTC).', chatId);
  var lines = ['🔎 ' + symbol, ''];
  try {
    var a = analyzeSymbol_(symbol, '15m');
    lines.push('Signal 15m: ' + a.signal + ' • Strength ' + (a.strength || 0) + '/5');
    if (a.regime) lines.push('Regime: ' + a.regime);
    var rsi = a.rsi14 != null ? a.rsi14 : (a.indicators && a.indicators.rsi14);
    if (rsi != null) lines.push('RSI(14): ' + round_(Number(rsi), 1));
    var p = a.tradePlan;
    if (p && String(a.signal).indexOf('BULL') === 0) {
      lines.push('Entry: ' + compactPrice_(p.entryLow) + ' – ' + compactPrice_(p.entryHigh));
      lines.push('TP: ' + compactPrice_(p.tp1) + ' / ' + compactPrice_(p.tp2) + ' / ' + compactPrice_(p.tp3));
      lines.push('SL: ' + compactPrice_(p.stopLoss));
    } else {
      lines.push('Belum ada trade plan (setup belum valid).');
    }
  } catch (e) {
    lines.push('❌ Analisa gagal: ' + errorText_(e));
  }
  try {
    var news = fetchCryptoCoinNews_(symbol, 24) || [];
    if (news.length) {
      lines.push('', '📰 News 24h:');
      news.slice(0, 3).forEach(function(n) {
        lines.push('• ' + String(n.title || '').slice(0, 100));
      });
    }
  } catch (_) {}
  lines.push('', 'Ketik coin lain atau /start untuk menu.');
  return sendTelegram_(lines.join('\n'), chatId);
}

/* =========================================================
 * DAILY MARKET BRIEF — ringkasan pasar tiap pagi (07:00).
 * Dikirim ke Telegram channel + Threads. Setup sekali via setupDailyBrief().
 * ========================================================= */
function buildMarketBriefText_() {
  var day = prettyDayKey_(marketDayKey_(Date.now()));
  var lines = ['\u2600\uFE0F MARKET BRIEF \u2022 ' + day, ''];
  var tickers = {};
  try { tickers = fetchAllSpotTickers_(); } catch (e) { return lines.join('\n') + 'Data pasar tidak tersedia.'; }

  function px(s) { var t = tickers[s]; return t ? Number(t.last || 0) : 0; }
  function chg(s) { var t = tickers[s]; return t ? Number(t.chg24 || 0) * 100 : 0; }
  function fmtC(c) { return (c >= 0 ? '+' : '') + round_(c, 1) + '%'; }

  var btc = px('BTCUSDT'), eth = px('ETHUSDT');
  if (btc) lines.push('\u20BF BTC ' + compactPrice_(btc) + ' (' + fmtC(chg('BTCUSDT')) + ' 24h)');
  if (eth) lines.push('\u039E ETH ' + compactPrice_(eth) + ' (' + fmtC(chg('ETHUSDT')) + ' 24h)');
  lines.push('');

  // Fear & Greed (alternative.me, gratis tanpa key)
  try {
    var fng = fetchJson_('https://api.alternative.me/fng/?limit=1', { muteHttpExceptions: true });
    var d = fng && fng.data && fng.data[0];
    if (d) lines.push('\U0001F628 Fear & Greed: ' + d.value + ' (' + d.value_classification + ')');
  } catch (_) {}

  // Breadth pasar
  var syms = Object.keys(tickers);
  if (syms.length) {
    var green = syms.filter(function(s) { return Number(tickers[s].chg24 || 0) > 0; }).length;
    lines.push('\U0001F4CA Breadth: ' + Math.round(green / syms.length * 100) + '% coins green (24h)');
  }

  // Top 3 gainers (volume >= $2M)
  var minVol = Number(getProp_('MIN_24H_VOLUME_USD', false) || CFG.MIN_24H_VOLUME_USD || 2000000);
  var gainers = syms
    .filter(function(s) { return Number(tickers[s].volCcy24h || 0) >= minVol; })
    .sort(function(x, y) { return tickers[y].chg24 - tickers[x].chg24; })
    .slice(0, 3);
  if (gainers.length) {
    lines.push('\U0001F680 Top movers: ' + gainers.map(function(s) {
      return baseSymbol_(s) + ' ' + fmtC(Number(tickers[s].chg24) * 100);
    }).join(' \u2022 '));
  }
  lines.push('');

  // 1 kalimat outlook dari trend BTC 1h
  try {
    var pack = getKlinesWithProvider_('BTCUSDT', '1h', 60);
    var closes = (pack.candles || []).map(function(c) { return Number(c.c); });
    if (closes.length >= 55) {
      var e = emaSeries_(closes, 50);
      var bull = closes[closes.length - 1] > e[e.length - 1] && e[e.length - 1] >= e[e.length - 11];
      lines.push('\U0001F4A1 BTC 1h trend ' + (bull ? 'bullish \u2014 tailwind untuk setup LONG hari ini.' : 'tidak bullish \u2014 selektif dengan setup LONG hari ini.'));
    }
  } catch (_) {}

  var trUrl = trackRecordUrl_();
  if (trUrl) { lines.push(''); lines.push('\U0001F4CA Verified track record: ' + trUrl); }
  lines.push('');
  lines.push('#Crypto #AZZATSSINS');
  return lines.join('\n');
}

function postDailyMarketBrief_() {
  var text = buildMarketBriefText_();
  var out = { ok: true };
  try {
    var ch = getTelegramChannelId_();
    if (ch && isTelegramChannelAutopostEnabled_()) { sendTelegram_(text, ch); out.telegram = 'sent'; }
    else out.telegram = 'skipped (channel belum dikonfigurasi)';
  } catch (e) { out.telegramError = errorText_(e); }
  try { postToThreads_(text); out.threads = 'sent'; }
  catch (e) { out.threadsError = errorText_(e); }
  try { notifyAdmin_('\u2600\uFE0F Market brief terkirim:\n\n' + text); } catch (_) {}
  return out;
}

/** Setup sekali: jadwalkan market brief tiap jam 7 pagi (zona waktu project GAS). */
function setupDailyBrief() {
  var handler = 'postDailyMarketBrief_';
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(7).create();
  console.log('Market brief dijadwalkan tiap jam 7 pagi (cek zona waktu project = Jakarta/GMT+7).');
  return { ok: true };
}

/** Test kirim brief sekarang tanpa menunggu jadwal. */
function testMarketBrief() {
  return postDailyMarketBrief_();
}

function handleTelegramUpdate_(update) {
  try {
    if (update.callback_query) return handleCallbackQuery_(update.callback_query);
    if (update.message) return handleTelegramText_(update.message);
  } catch (err) {
    console.error('handleTelegramUpdate_: ' + errorText_(err));
  }
}




function handleTelegramText_(msg) {
  var chatId = msg.chat && msg.chat.id;
  if (!chatId || !isAllowedChat_(chatId)) return;
  var text = String(msg.text || '').trim();
  var low = text.toLowerCase();
  var pendingKey = 'PENDING_INPUT_' + chatId;
  var pending = PropertiesService.getScriptProperties().getProperty(pendingKey);
  if (pending === 'COIN_SEARCH') {
    PropertiesService.getScriptProperties().deleteProperty(pendingKey);
    return showCoinSearch_(chatId, text);
  }
  if (low === '/start' || low === 'menu' || low === '/menu') return showMainMenu_(chatId);
  if (low.indexOf('signal now') === 0 || low === '/signalnow') return showSignalNow_(chatId);
  if (low.indexOf('scan') === 0 || low === '/scan') return slimScan_(chatId);
  if (low.indexOf('perf') === 0 || low === '/perf') return showPerfMenu_(chatId);
  if (low.indexOf('active') === 0) return showActiveSignals_(chatId);
  if (low === 'autopost on') { PropertiesService.getScriptProperties().setProperty('AUTO_POST_ENABLED', 'true'); return showMainMenu_(chatId, '✅ Autopost ON'); }
  if (low === 'autopost off') { PropertiesService.getScriptProperties().setProperty('AUTO_POST_ENABLED', 'false'); return showMainMenu_(chatId, '⛔ Autopost OFF'); }
  if (low === '/help' || low === 'help') return showHelp_(chatId);
  // unknown text -> hint
  sendTelegram_('Ketik /start untuk menu.', chatId);
}




function handleCallbackQuery_(cb) {
  var data = String(cb.data || '');
  var msg = cb.message || {};
  var chatId = msg.chat && msg.chat.id;
  var messageId = msg.message_id;
  try { answerCallback_(cb.id); } catch (_) {}
  if (!chatId || !isAllowedChat_(chatId)) return;
  var parts = data.split(':');
  var cmd = parts[0];
  if (cmd === 'home') return showMainMenu_(chatId, null, messageId);
  if (cmd === 'signalnow') return showSignalNow_(chatId, messageId);
  if (cmd === 'scan') return slimScan_(chatId, messageId);
  if (cmd === 'perf') return showPerfMenu_(chatId, messageId);
  if (cmd === 'perfd') return showDailyPerf_(chatId, messageId);
  if (cmd === 'perfm') return showMonthlyPerf_(chatId, messageId);
  if (cmd === 'search') return askCoinSearch_(chatId, messageId);
  if (cmd === 'active') return showActiveSignals_(chatId, messageId);
  if (cmd === 'help') return showHelp_(chatId, messageId);
  if (cmd === 'autoposton') { PropertiesService.getScriptProperties().setProperty('AUTO_POST_ENABLED', 'true'); return showMainMenu_(chatId, '✅ Autopost ON', messageId); }
  if (cmd === 'autopostoff') { PropertiesService.getScriptProperties().setProperty('AUTO_POST_ENABLED', 'false'); return showMainMenu_(chatId, '⛔ Autopost OFF', messageId); }
  if (cmd === 'postpreview' && parts[1]) return previewPost_(chatId, messageId, parts[1], parts[2] || '15m');
  if (cmd === 'postconfirm' && parts[1]) return confirmPost_(chatId, messageId, parts[1], parts[2] || '15m');
}

/* ================= MENU ================= */




function showMainMenu_(chatId, note, messageId) {
  var on = getBoolProp_('AUTO_POST_ENABLED', false);
  var lines = ['🤖 AZZATSSINS CRYPTO BOT', ''];
  if (note) { lines.push(note, ''); }
  lines.push('Autopost: ' + (on ? '🟢 ON' : '🔴 OFF'));
  try {
    var st = paperTrackStats_(30);
    if (st.signals) lines.push('Paper 30D: ' + st.winRate + '% WR • ' + (st.totalR >= 0 ? '+' : '') + st.totalR + 'R');
  } catch (_) {}
  var kb = [
    [inlineBtn_('🚀 SIGNAL NOW', 'signalnow'), inlineBtn_('🔍 SCAN', 'scan')],
    [inlineBtn_('📊 PERFORMANCE', 'perf'), inlineBtn_('📌 ACTIVE', 'active')],
    [inlineBtn_('🔎 CARI COIN', 'search'), inlineBtn_('❓ HELP', 'help')],
    [inlineBtn_(on ? '⛔ AUTOPOST OFF' : '✅ AUTOPOST ON', on ? 'autopostoff' : 'autoposton')]
  ];
  editOrSend_(chatId, messageId, lines.join('\n'), kb);
}




function showHelp_(chatId, messageId) {
  var txt = [
    '❓ HELP', '',
    '🚀 SIGNAL NOW — setup bullish terkuat saat ini',
    '🔍 SCAN — scan 30 coin, pilih manual untuk di-post',
    '📊 PERFORMANCE — win rate & avg R 7D/30D',
    '📌 ACTIVE — signal yang masih dipantau TP/SL',
    '🤖 AUTOPOST — nyala/matikan autopost terjadwal',
    '',
    'Alur autopost: sweep SEMUA coin tiap 10 mnt → analisa 100 coin teratas →',
    'filter bullish → konfirmasi 30m → deep-check 5 lapis → quality ≥ 55 → post.',
    'Anti-repost: coin + arah yang sama tidak dipost ulang kecuali arah market berubah.',
    'Caption EN + quality score + paper track record.'
  ].join('\n');
  editOrSend_(chatId, messageId, txt, [[inlineBtn_('🏠 MENU', 'home')]]);
}

/* ================= COMMANDS ================= */




function showSignalNow_(chatId, messageId) {
  editOrSend_(chatId, messageId, '🚀 SIGNAL NOW\n\nMencari setup bullish terkuat...', []);
  var tf = getProp_('AUTO_TIMEFRAME', false) || CFG.AUTO_TIMEFRAME || '15m';
  var minS = Math.max(3, getIntProp_('AUTO_MIN_STRENGTH', CFG.AUTO_MIN_STRENGTH));
  var scan, notes = [];
  try {
    scan = scanActiveMarket_(tf);
    saveLastScan_(scan.results, scan.errors);
  } catch (e) {
    return editOrSend_(chatId, messageId, '❌ Scan gagal: ' + errorText_(e), [[inlineBtn_('🏠 MENU', 'home')]]);
  }
  var cands = scan.results
    .filter(function(a) { return a && a.signal === 'BULLISH WATCH' && a.tradePlan && Number(a.strength || 0) >= minS; })
    .map(function(a) { return { key:a.symbol, a:a, quality:signalNowCryptoQuality_(a) }; })
    .sort(function(x, y) { return y.quality - x.quality; });

  if (!cands.length) {
    return editOrSend_(chatId, messageId,
      '🚀 SIGNAL NOW\n\n⚪ WAIT — belum ada setup bullish yang memenuhi filter.\n\nScanned: ' + scan.results.length + ' coin • min strength ' + minS + '/5\nBot tidak memaksakan entry.\n\n⚠️ NFA — selalu DYOR.',
      [[inlineBtn_('🔄 REFRESH', 'signalnow')], [inlineBtn_('🏠 MENU', 'home')]]);
  }
  var best = cands[0], a = best.a, p = a.tradePlan;
  var lines = [
    '🚀 SIGNAL NOW • BEST SETUP', '',
    '🟢 $' + baseSymbol_(a.symbol) + ' LONG • ' + tf,
    'Strength ' + a.strength + '/5 • Quality Rank ' + best.quality + '/100',
    'RSI ' + round_(a.rsi, 1) + ' • Vol ' + round_(a.volumeRatio, 2) + 'x • ' + (a.regime || ''), '',
    'Entry ' + compactPrice_(p.entryLow) + ' – ' + compactPrice_(p.entryHigh),
    'TP ' + compactPrice_(p.tp1) + ' / ' + compactPrice_(p.tp2) + ' / ' + compactPrice_(p.tp3),
    'SL ' + compactPrice_(p.stopLoss) + ' • R:R 1:' + round_(Number(p.rr1 || 0), 2)
  ];
  cands.slice(1, 4).forEach(function(x, i) {
    if (i === 0) lines.push('', '🥈 NEXT BEST');
    lines.push((i + 2) + '. $' + baseSymbol_(x.key) + ' • ' + x.quality + '/100 • ' + x.a.strength + '/5');
  });
  lines.push('', '⚠️ Quality Rank = ranking internal, bukan probabilitas profit. NFA/DYOR.');
  editOrSend_(chatId, messageId, lines.join('\n'), [
    [inlineBtn_('🧵 POST PREVIEW', 'postpreview:' + a.symbol + ':' + tf)],
    [inlineBtn_('🔄 REFRESH', 'signalnow')],
    [inlineBtn_('🏠 MENU', 'home')]
  ]);
}




function slimScan_(chatId, messageId) {
  editOrSend_(chatId, messageId, '🔍 Scanning 30 coin...', []);
  var tf = getProp_('AUTO_TIMEFRAME', false) || CFG.AUTO_TIMEFRAME || '15m';
  var scan = scanActiveMarket_(tf);
  saveLastScan_(scan.results, scan.errors);
  var best = scan.results.filter(function(a) { return a.signal !== 'NEUTRAL'; })
    .sort(compareSmartCryptoSignals_).slice(0, 9);
  var kb = [];
  for (var i = 0; i < best.length; i += 3) {
    kb.push(best.slice(i, i + 3).map(function(a) {
      return inlineBtn_(baseSymbol_(a.symbol) + ' ' + a.strength + '/5', 'postpreview:' + a.symbol + ':' + tf);
    }));
  }
  kb.push([inlineBtn_('🔄 SCAN AGAIN', 'scan'), inlineBtn_('🏠 MENU', 'home')]);
  editOrSend_(chatId, messageId, formatScanSummary_(scan.results, scan.errors, tf), kb);
}




function showActiveSignals_(chatId, messageId) {
  var rows = [];
  try { rows = getSignalRows_().filter(function(r) { return ['ACTIVE', 'TP1_HIT', 'TP2_HIT'].indexOf(String(r.status || 'ACTIVE').toUpperCase()) >= 0; }); } catch (_) {}
  var lines = ['📌 ACTIVE SIGNALS', ''];
  if (!rows.length) lines.push('Tidak ada signal aktif.');
  rows.slice(-15).reverse().forEach(function(r) {
    lines.push('🪙 ' + r.symbol + ' • ' + r.status + ' • ' + (r.side || 'LONG'));
  });
  editOrSend_(chatId, messageId, lines.join('\n'), [[inlineBtn_('📊 PERFORMANCE', 'perf'), inlineBtn_('🏠 MENU', 'home')]]);
}




function previewPost_(chatId, messageId, symbol, interval) {
  editOrSend_(chatId, messageId, '🔍 Analyzing ' + baseSymbol_(symbol) + ' ' + interval + '...', []);
  var a;
  try { a = analyzeSymbol_(symbol, interval); }
  catch (e) { return editOrSend_(chatId, messageId, '❌ ' + errorText_(e), [[inlineBtn_('🏠 MENU', 'home')]]); }
  if (String(a.signal).indexOf('BULL') !== 0 || !a.tradePlan) {
    return editOrSend_(chatId, messageId,
      '⚪ ' + baseSymbol_(symbol) + ' tidak ada setup BULLISH di ' + interval + ' (' + a.signal + ').',
      [[inlineBtn_('🔄 REFRESH', 'postpreview:' + symbol + ':' + interval)], [inlineBtn_('🏠 MENU', 'home')]]);
  }
  try {
    var mc = analyzeSymbol_(symbol, String(CFG.MTF_CONFIRM_INTERVAL || '30m'));
    var chk = mtfConfirmPass_(mc);
    if (!chk.pass) {
      return editOrSend_(chatId, messageId,
        '⚪ Konfirmasi 30m gagal (' + chk.reason + ') — tidak bisa dipost.',
        [[inlineBtn_('🏠 MENU', 'home')]]);
    }
    a.mtfConfirm = mc;
  } catch (e) {
    return editOrSend_(chatId, messageId, '❌ 30m: ' + errorText_(e), [[inlineBtn_('🏠 MENU', 'home')]]);
  }
  var p = a.tradePlan;
  var dest = ['Threads'];
  if (getBoolProp_('BINANCE_SQUARE_AUTO_ENABLED', false)) dest.push('Square');
  if (shouldPublishXSignal_('CRYPTO', 'MANUAL')) dest.push('X');
  editOrSend_(chatId, messageId, [
    '🧵 POST PREVIEW', '',
    '🟢 $' + baseSymbol_(symbol) + ' LONG • ' + interval,
    'Strength ' + a.strength + '/5 • 30m confirmed ✅',
    'Entry ' + compactPrice_(p.entryLow) + ' – ' + compactPrice_(p.entryHigh),
    'TP ' + compactPrice_(p.tp1) + ' / ' + compactPrice_(p.tp2) + ' / ' + compactPrice_(p.tp3),
    'SL ' + compactPrice_(p.stopLoss), '',
    'Post ke: ' + dest.join(' + ')
  ].join('\n'), [
    [inlineBtn_('✅ POST SEKARANG', 'postconfirm:' + symbol + ':' + interval)],
    [inlineBtn_('🔄 REFRESH', 'postpreview:' + symbol + ':' + interval)],
    [inlineBtn_('🏠 MENU', 'home')]
  ]);
}




function confirmPost_(chatId, messageId, symbol, interval) {
  editOrSend_(chatId, messageId, '🚀 Posting ' + baseSymbol_(symbol) + '...', []);
  var a = analyzeSymbol_(symbol, interval);
  // Manual posts must also pass the 30m confirmation (same bar as autopost).
  // force=true still bypasses cooldown/duplicate gates (explicit admin intent), but not MTF.
  try {
    var mc = analyzeSymbol_(symbol, String(CFG.MTF_CONFIRM_INTERVAL || '30m'));
    var chk = mtfConfirmPass_(mc);
    if (!chk.pass) {
      editOrSend_(chatId, messageId,
        '⚪ Konfirmasi 30m gagal (' + chk.reason + ') — tidak dipost.',
        [[inlineBtn_('🏠 MENU', 'home')]]);
      return;
    }
    a.mtfConfirm = mc;
    a.mtfConfirmBoost = chk.boost || 0;
    a.mtfConfirmPenalty = chk.penalty || 0;
  } catch (e) {
    editOrSend_(chatId, messageId,
      '❌ Konfirmasi 30m error: ' + errorText_(e),
      [[inlineBtn_('🏠 MENU', 'home')]]);
    return;
  }
  var r = publishSignal_(a, true, 'MANUAL');
  editOrSend_(chatId, messageId, r.message, [[inlineBtn_('🏠 MENU', 'home')]]);
}

/* ================= AUTO CYCLE ================= */




function autoMarketCycle_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return { ok:false, skipped:'locked' };
  try {
    var out = { ok:true, at:nowText_() };
    try { out.dailyPosted = { day:ensureDailyPostedDay_() }; } catch (err) { out.dailyPosted = { ok:false, error:errorText_(err) }; }
    if (getBoolProp_('AUTO_POST_ENABLED', false)) {
      try { out.crypto = runCryptoAutoCycleUnlocked_(); }
      catch (err) { out.crypto = { ok:false, error:errorText_(err) }; notifyAdmin_('❌ Crypto auto scan error\n' + errorText_(err)); }
    }
    try { out.lifecycle = updateSignalLifecycle_(); }
    catch (err) { out.lifecycle = { ok:false, error:errorText_(err) }; recordLifecycleError_(err); }
    try { out.digest = maybeSendProgressDigest_(); }
    catch (err) { out.digest = { ok:false, error:errorText_(err) }; }
    try { out.dailyWinrate = maybeSendDailyWinrateReview_(); } catch (err) { out.dailyWinrate = { ok:false, error:errorText_(err) }; }
    try { out.backtest = maybeRunBacktestStep_(); } catch (err) { out.backtest = { ok:false, error:errorText_(err) }; }
    return out;
  } finally { try { lock.releaseLock(); } catch (_) {} }
}

/* ================= SETUP ================= */




function setupBot() { return setupBot_(); }




function setupBot_() {
  setDefaultProp_('AUTO_POST_ENABLED', 'false');
  setDefaultProp_('AUTO_TIMEFRAME', String(CFG.AUTO_TIMEFRAME || '15m'));
  setDefaultProp_('AUTO_MIN_STRENGTH', String(CFG.AUTO_MIN_STRENGTH));
  setDefaultProp_('AUTO_POST_MINUTES', String(CFG.AUTO_POST_MINUTES));
  setDefaultProp_('COIN_COOLDOWN_MINUTES', String(CFG.COIN_COOLDOWN_MINUTES));
  setDefaultProp_('ACTIVE_SCAN_LIMIT', String(CFG.ACTIVE_SCAN_LIMIT));
  setDefaultProp_('DEEPCHECK_ENABLED', 'true');
  setDefaultProp_('BINANCE_SQUARE_AUTO_ENABLED', 'false');
  setDefaultProp_('X_PUBLISHER_ENABLED', 'false');
  setDefaultProp_('X_AUTO_SIGNAL_ENABLED', 'false');
  setDefaultProp_('DAILY_WINRATE_REVIEW_ENABLED', 'true');
  ensureDatabase_();
  var hook = null;
  try { hook = setTelegramWebhook_(); } catch (e) { console.log('webhook: ' + errorText_(e)); }
  cleanupLegacyTriggers_();
  ensureAutoTrigger_();
  return { ok:true, webhook:!!hook };
}

/** One-time: apply the balanced-mode (v13.9) property values. Run once, then delete. */



function applyTuning() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('AUTO_MIN_STRENGTH', '3');
  p.setProperty('AUTO_POST_MINUTES', '45');
  p.setProperty('COIN_COOLDOWN_MINUTES', '120');
  p.setProperty('ACTIVE_SCAN_LIMIT', '100');
  // recreate the time trigger at the new 10-minute interval
  try {
    cleanupLegacyTriggers_();
    ensureAutoTrigger_();
  } catch (e) { console.log('trigger: ' + errorText_(e)); }
  console.log('tuning applied: strength>=3, interval 45m, cooldown 120m, scan 30');
}




function runCryptoAutoCycleUnlocked_() {
  const interval = getProp_('AUTO_TIMEFRAME', false) || CFG.AUTO_TIMEFRAME;
  const scan = scanActiveMarket_(interval);
  if (!scan.results.length) return { ok:false, skipped:'no_results', errors:scan.errors };

  saveLastScan_(scan.results, scan.errors);
  try { processSignalStrengthChanges_(scan.results, 'CRYPTO'); } catch (_) {}
  const minStrength = getIntProp_('AUTO_MIN_STRENGTH', CFG.AUTO_MIN_STRENGTH);
  // v13.7: bullish-only — bearish/short signals never reach posting.
  const candidates = scan.results.filter(function(a) {
    return a.signal === 'BULLISH WATCH' && a.strength >= minStrength;
  }).sort(compareSmartCryptoSignals_);

  if (!candidates.length) return { ok:true, skipped:'no_bullish_signal' };

  // v13.7/13.9: MTF confirmation filter. v13.9 LEAN mode: 30m just needs to
  // not be bearish with a bullish lean (much less strict than full BULLISH WATCH).
  const confirmTf = String(CFG.MTF_CONFIRM_INTERVAL || '30m');
  const topN = Math.max(1, Number(CFG.MTF_CONFIRM_TOP_N || 8));
  const confirmed = [];
  candidates.slice(0, topN).forEach(function(a) {
    try {
      var c = analyzeSymbol_(a.symbol, confirmTf);
      var chk = mtfConfirmPass_(c);
      if (chk.pass) {
        a.mtfConfirm = c;
        a.mtfConfirmBoost = chk.boost || 0;
        a.mtfConfirmPenalty = chk.penalty || 0;
        // Konfirmasi kedua 4h (soft): hanya yang lolos 30m dicek 4h-nya.
        if (getBoolProp_('MTF_CONFIRM_4H_ENABLED', CFG.MTF_CONFIRM_4H_ENABLED)) {
          try {
            var c4 = analyzeSymbol_(a.symbol, '4h');
            var chk4 = mtfConfirm4hPass_(c4);
            a.mtfConfirm4h = c4;
            a.mtfConfirm4hBoost = chk4.boost || 0;
            a.mtfConfirm4hPenalty = chk4.penalty || 0;
          } catch (e4) { console.log('MTF 4h [' + a.symbol + ']: ' + errorText_(e4)); }
        }
        confirmed.push(a);
      } else {
        console.log('MTF filter [' + a.symbol + ']: ' + chk.reason + ' — dilewati');
      }
    } catch (e) { console.log('MTF confirm [' + a.symbol + ']: ' + errorText_(e)); }
  });
  confirmed.sort(compareMtfConfirmedSignals_);

  if (!confirmed.length) return { ok:true, skipped:'no_mtf_confirmed_bullish', scanned:scan.results.length };
  const globalGate = canAutoPostNow_();
  if (!globalGate.allowed) return { ok:true, skipped:globalGate.reason, best:confirmed[0] };

  for (let i = 0; i < confirmed.length; i++) {
    const a = confirmed[i];
    const coinGate = canPostSignal_(a, false);
    if (!coinGate.allowed) continue;
    const posted = publishSignal_(a, false, 'AUTO');
    if (posted.posted) {
      PropertiesService.getScriptProperties().setProperty('LAST_AUTO_POST_AT', String(Date.now()));
      return { ok:true, posted:true, symbol:a.symbol, id:posted.id };
    }
  }
  return { ok:true, skipped:'all_candidates_duplicate_or_cooldown' };
}





function getProp_(key, required) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (required && (!v || !String(v).trim())) throw new Error('Script Property belum diisi: ' + key);
  return v;
}





function getBoolProp_(key, fallback) {
  const v = getProp_(key, false);
  if (v === null || v === '') return !!fallback;
  return String(v).toLowerCase() === 'true';
}





function getIntProp_(key, fallback) {
  const n = Number(getProp_(key, false));
  return isFinite(n) && n > 0 ? Math.round(n) : fallback;
}





function setDefaultProp_(key, value) {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty(key)) p.setProperty(key, String(value));
}





function ensureAutoTrigger_() {
  const handler = 'autoMarketCycle_';
  const triggers = ScriptApp.getProjectTriggers();
  const found = triggers.some(function(t) { return t.getHandlerFunction() === handler; });
  if (!found) {
    ScriptApp.newTrigger(handler).timeBased().everyMinutes(CFG.AUTO_SCAN_MINUTES).create();
  }
}





function hasAutoTrigger_() {
  return ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === 'autoMarketCycle_';
  });
}





function cleanupLegacyTriggers_() {
  const legacy = ['scanAndAutoPost','autoScanTrigger','scheduledScan','autoMarketCycle','autoMarketCycle_'];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (legacy.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
}





function reinstallAutoTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (['autoMarketCycle','autoMarketCycle_'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ensureAutoTrigger_();
  return true;
}





function setTelegramWebhook_() {
  const p = PropertiesService.getScriptProperties();
  const url = resolveWebAppUrl_();
  if (url.indexOf('/dev') >= 0) {
    throw new Error('Web app masih URL /dev (test deployment) — Telegram tidak bisa akses (401). ' +
      'Buat deployment resmi: Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone. ' +
      'Lalu jalankan setupBot lagi.');
  }
  p.setProperty('WEB_APP_URL', url);

  let key = p.getProperty('TELEGRAM_WEBHOOK_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    p.setProperty('TELEGRAM_WEBHOOK_KEY', key);
  }

  const webhookUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'tgkey=' + encodeURIComponent(key);
  const res = fetchJson_(telegramApi_('setWebhook'), {
    method: 'post',
    payload: {
      url: webhookUrl,
      allowed_updates: JSON.stringify(['message', 'callback_query']),
      drop_pending_updates: 'false'
    },
    muteHttpExceptions: true
  });

  if (!res.ok) throw new Error('setWebhook gagal: ' + JSON.stringify(res));
  p.setProperty('TELEGRAM_WEBHOOK_URL', webhookUrl);
  return res;
}





function repairTelegramWebhook_() {
  const p = PropertiesService.getScriptProperties();
  p.setProperty('WEB_APP_URL', resolveWebAppUrl_());
  resetTelegramUpdateCursor_();
  return setTelegramWebhook_();
}

/**
 * Force-reinstall webhook so Telegram definitely subscribes to callback_query.
 * Reinstall webhook subscription after deployment changes when needed.
 */





function validateTelegramWebhookKey_(e) {
  const expected = getProp_('TELEGRAM_WEBHOOK_KEY', false);
  if (!expected) {
    console.error('TELEGRAM_WEBHOOK_KEY missing; webhook request rejected.');
    return false;
  }
  return String(e && e.parameter && e.parameter.tgkey || '') === String(expected);
}





function isAllowedChat_(chatId) {
  return String(chatId) === String(getProp_('TELEGRAM_CHAT_ID', true)).trim();
}

/* =========================================================
 * FORMATTERS
 * ========================================================= */





function isProcessedUpdate_(id) {
  const last = Number(getProp_('TELEGRAM_LAST_UPDATE_ID', false) || 0);
  return Number(id) <= last;
}





function markUpdateProcessed_(id) {
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_LAST_UPDATE_ID', String(id));
}





function notifyAdmin_(text) {
  return sendTelegram_(text, getProp_('TELEGRAM_CHAT_ID', true));
}





function diagnoseTelegram_() {
  const me = fetchJson_(telegramApi_('getMe'), { muteHttpExceptions: true });
  const wh = fetchJson_(telegramApi_('getWebhookInfo'), { muteHttpExceptions: true });
  const p = PropertiesService.getScriptProperties();
  const stored = String(p.getProperty('TELEGRAM_WEBHOOK_URL') || '');
  const report = {
    bot_ok: !!me.ok,
    bot_username: me.result ? me.result.username : null,
    configured_chat_id: p.getProperty('TELEGRAM_CHAT_ID') ? 'configured' : 'missing',
    telegram_channel_id: getTelegramChannelId_() || null,
    telegram_channel_autopost_enabled: getBoolProp_('TELEGRAM_CHANNEL_AUTOPOST_ENABLED', CFG.TELEGRAM_CHANNEL_AUTOPOST_ENABLED),
    web_app_url: p.getProperty('WEB_APP_URL') || null,
    stored_webhook_url: stored ? stored.replace(/([?&]tgkey=)[^&]+/i, '$1***') : null,
    telegram_webhook: wh.result ? {
      url:String(wh.result.url || '').replace(/([?&]tgkey=)[^&]+/i, '$1***'),
      pending_update_count:Number(wh.result.pending_update_count || 0),
      last_error_message:String(wh.result.last_error_message || ''),
      allowed_updates:wh.result.allowed_updates || []
    } : wh,
    auto_trigger: hasAutoTrigger_(),
    crypto_auto_post_enabled: getBoolProp_('AUTO_POST_ENABLED', false),
    idx_auto_post_enabled: getBoolProp_('IDX_AUTO_POST_ENABLED', false),
    tracked_coins: getAllTrackedSymbols_().length,
    last_processed_update_id: p.getProperty('TELEGRAM_LAST_UPDATE_ID') || null,
    last_callback_at: p.getProperty('TELEGRAM_LAST_CALLBACK_AT') || null
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}





/* ================= GEMINI API POOL (ported back — was dropped in remake) ================= */
function loadGeminiPoolState_() {
  var p = PropertiesService.getScriptProperties();
  var st = safeJsonParse_(p.getProperty('GEMINI_POOL_STATE_V1') || '') || {};
  if (!st.slots || typeof st.slots !== 'object') st.slots = {};
  st.activeSlot = Number(st.activeSlot || 1);
  if (!isFinite(st.activeSlot) || st.activeSlot < 1) st.activeSlot = 1;
  return st;
}


function saveGeminiPoolState_(st) {
  st = st || {slots:{}};
  if (!st.slots) st.slots = {};
  st.updatedAt = Date.now();
  // Keep rolling state packed in a single property as well.
  PropertiesService.getScriptProperties().setProperty('GEMINI_POOL_STATE_V1', JSON.stringify(st));
}


function geminiSlotState_(st, slot) {
  var key = String(slot);
  if (!st.slots[key] || typeof st.slots[key] !== 'object') {
    st.slots[key] = {
      cooldownUntil:0,
      failCount:0,
      successCount:0,
      lastSuccessAt:0,
      lastErrorAt:0,
      lastErrorCode:0,
      lastErrorType:'',
      lastError:''
    };
  }
  return st.slots[key];
}


function geminiKeyOrder_(keys, activeSlot) {
  if (!keys.length) return [];
  var idx = 0;
  for (var i=0; i<keys.length; i++) {
    if (Number(keys[i].slot) === Number(activeSlot)) { idx = i; break; }
  }
  return keys.slice(idx).concat(keys.slice(0, idx));
}


function geminiRollingMode_() {
  var v = String(getProp_('GEMINI_ROLLING_MODE', false) || CFG.GEMINI_ROLLING_MODE || 'FAILOVER').toUpperCase();
  return v === 'ROUND_ROBIN' ? 'ROUND_ROBIN' : 'FAILOVER';
}


function geminiCooldownText_(until) {
  var ms = Math.max(0, Number(until || 0) - Date.now());
  if (!ms) return 'ready';
  var min = Math.ceil(ms / 60000);
  if (min < 60) return min + 'm';
  var h = Math.floor(min / 60);
  var m = min % 60;
  return h + 'h' + (m ? ' ' + m + 'm' : '');
}


function setGeminiActiveAfterFailure_(st, keys, failedSlot) {
  if (!keys.length) return;
  var order = geminiKeyOrder_(keys, nextGeminiSlot_(keys, failedSlot));
  var now = Date.now();
  for (var i=0; i<order.length; i++) {
    var ss = geminiSlotState_(st, order[i].slot);
    if (Number(ss.cooldownUntil || 0) <= now) {
      st.activeSlot = Number(order[i].slot);
      return;
    }
  }
  st.activeSlot = Number(order[0].slot);
}


function assertManualOwnerRun_() {
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!active || !effective || active !== effective) {
    throw new Error('Function ini hanya boleh dijalankan manual dari Apps Script editor oleh pemilik script.');
  }
}

/** Kompatibilitas: router AI multi-provider tidak dibawa ke remake crypto-only.
 *  Satu-satunya provider teks yang dipakai adalah pool Gemini. */
function aiGenerateText_(prompt, generationConfig, purpose) {
  return geminiGenerateText_(prompt, generationConfig, purpose);
}

function geminiGenerateText_(prompt, generationConfig, purpose) {
  var keys = getGeminiApiKeys_();
  if (!keys.length) throw new Error('Gemini API pool kosong. Isi property GEMINI_API_KEY dengan 1-4 key dipisahkan tanda | atau baris baru.');

  var p = PropertiesService.getScriptProperties();
  var model = getProp_('GEMINI_MODEL', false) || CFG.GEMINI_MODEL || getProp_('GEMINI_MODEL', false) || CFG.GEMINI_MODEL;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  var st = loadGeminiPoolState_();
  var order = geminiKeyOrder_(keys, st.activeSlot);
  var mode = geminiRollingMode_();
  var now = Date.now();
  var available = order.filter(function(k) {
    return Number(geminiSlotState_(st, k.slot).cooldownUntil || 0) <= now;
  });

  if (!available.length) {
    var earliest = null;
    keys.forEach(function(k) {
      var until = Number(geminiSlotState_(st, k.slot).cooldownUntil || 0);
      if (until && (!earliest || until < earliest.until)) earliest = {slot:k.slot, until:until};
    });
    throw new Error(
      'Semua Gemini API key sedang cooldown.' +
      (earliest ? ' Key #' + earliest.slot + ' ready in ' + geminiCooldownText_(earliest.until) + '.' : '')
    );
  }

  var errors = [];
  for (var i=0; i<available.length; i++) {
    var item = available[i];
    var slotState = geminiSlotState_(st, item.slot);
    var started = Date.now();

    try {
      var req = geminiRawRequestWithRetry_(url, item.key, {
        contents:[{ role:'user', parts:[{ text:String(prompt || '') }] }],
        generationConfig:generationConfig || { maxOutputTokens:120 }
      });

      var code = Number(req.code || 0);
      var raw = String(req.raw || '');
      slotState.lastRequestAttempts = Number(req.attempts || 1);

      if (code >= 200 && code < 300) {
        var body = safeJsonParse_(raw);
        var out = extractGeminiText_(body);
        if (!out) {
          var emptyFailure = {type:'TRANSIENT', retry:true, cooldownMinutes:geminiCooldownMinutes_('TRANSIENT')};
          throw {__geminiFailure:true, code:code, raw:'empty response', cls:emptyFailure};
        }

        slotState.cooldownUntil = 0;
        slotState.failCount = 0;
        slotState.successCount = Number(slotState.successCount || 0) + 1;
        slotState.lastSuccessAt = Date.now();
        slotState.lastLatencyMs = Date.now() - started;
        slotState.lastPurpose = String(purpose || '');
        slotState.lastError = '';
        slotState.lastErrorType = '';
        slotState.lastErrorCode = 0;

        if (mode === 'ROUND_ROBIN') st.activeSlot = nextGeminiSlot_(keys, item.slot);
        else st.activeSlot = Number(item.slot);

        saveGeminiPoolState_(st);
        p.setProperty('GEMINI_LAST_SUCCESS_SLOT', String(item.slot));
        p.setProperty('GEMINI_LAST_SUCCESS_AT', String(Date.now()));
        return String(out).trim();
      }

      var cls = classifyGeminiFailure_(code, raw);
      if (!cls.retry) {
        slotState.lastErrorAt = Date.now();
        slotState.lastErrorCode = code;
        slotState.lastErrorType = cls.type;
        slotState.lastError = truncateCodePoints_(raw.replace(/\s+/g,' '), 240);
        saveGeminiPoolState_(st);
        throw new Error('Gemini request/model error HTTP ' + code + ': ' + truncateCodePoints_(raw.replace(/\s+/g,' '), 220));
      }

      throw {__geminiFailure:true, code:code, raw:raw, cls:cls};

    } catch (err) {
      if (err && err.__geminiFailure) {
        var c = err.cls || classifyGeminiFailure_(err.code, err.raw);
        slotState.failCount = Number(slotState.failCount || 0) + 1;
        slotState.lastErrorAt = Date.now();
        slotState.lastErrorCode = Number(err.code || 0);
        slotState.lastErrorType = String(c.type || 'ERROR');
        slotState.lastError = truncateCodePoints_(String(err.raw || '').replace(/\s+/g,' '), 240);
        slotState.cooldownUntil = Date.now() + Math.max(1, Number(c.cooldownMinutes || 60)) * 60000;

        errors.push('#' + item.slot + ' ' + slotState.lastErrorType + (slotState.lastErrorCode ? ' ' + slotState.lastErrorCode : ''));
        setGeminiActiveAfterFailure_(st, keys, item.slot);
        saveGeminiPoolState_(st);
        continue;
      }

      // Network/UrlFetch exceptions: cool this key and fail over.
      var msg = errorText_(err);
      var netCls = classifyGeminiFailure_(0, msg);
      slotState.failCount = Number(slotState.failCount || 0) + 1;
      slotState.lastErrorAt = Date.now();
      slotState.lastErrorCode = 0;
      slotState.lastErrorType = netCls.type;
      slotState.lastError = truncateCodePoints_(msg, 240);
      slotState.cooldownUntil = Date.now() + Math.max(1, Number(netCls.cooldownMinutes || 60)) * 60000;
      errors.push('#' + item.slot + ' ' + slotState.lastErrorType);
      setGeminiActiveAfterFailure_(st, keys, item.slot);
      saveGeminiPoolState_(st);
    }
  }

  var allTransient = errors.length > 0 && errors.every(function(x) {
    return String(x).indexOf('TRANSIENT') >= 0;
  });

  if (allTransient) {
    throw new Error(
      'Gemini service sedang unavailable/overloaded (HTTP 5xx/503). ' +
      'Pool sudah mencoba ' + errors.length + ' key tersedia: ' + errors.join(' → ') + '. ' +
      'Ini biasanya bukan quota API key. Cooldown transient hanya ' +
      geminiCooldownMinutes_('TRANSIENT') + ' menit; coba lagi setelah beberapa menit.'
    );
  }

  throw new Error('Gemini pool gagal pada semua key yang tersedia: ' + errors.join(' → '));
}





function getGeminiApiKeys_() {
  var p = PropertiesService.getScriptProperties();
  var out = [];
  var seen = {};
  var maxKeys = Number(CFG.GEMINI_POOL_MAX_KEYS || 4);

  // v11.2: one Script Property can hold the whole pool. This avoids the
  // Project Settings UI limit of 50 manually managed properties.
  // Accepted separators: | , ; or line break.
  var packed = String(p.getProperty('GEMINI_API_KEY') || '').trim();
  var candidates = [];


  if (packed) {
    packed.split(/[\r\n|,;]+/).forEach(function(x) {
      x = String(x || '').trim();
      if (x) candidates.push(x);
    });
  }

  // Backward compatibility: if GEMINI_API_KEY_1..4 already exist, use them too.
  for (var i = 1; i <= maxKeys; i++) {
    var legacySlot = String(p.getProperty('GEMINI_API_KEY_' + i) || '').trim();
    if (legacySlot) candidates.push(legacySlot);
  }

  candidates.forEach(function(key) {
    if (!key || seen[key] || out.length >= maxKeys) return;
    seen[key] = true;
    out.push({ slot:out.length + 1, key:key });
  });
  return out;
}





function extractGeminiText_(data) {
  try {
    return data.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('').trim();
  } catch (_) { return ''; }
}





function geminiRawRequestWithRetry_(url, apiKey, payloadObj) {
  var maxRetries = Math.max(0, Number(CFG.GEMINI_TRANSIENT_RETRIES || 2));
  var baseMs = Math.max(250, Number(CFG.GEMINI_TRANSIENT_RETRY_BASE_MS || 1200));
  var lastNetworkError = null;

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      var res = UrlFetchApp.fetch(url, {
        method:'post',
        contentType:'application/json',
        headers:{ 'x-goog-api-key': apiKey },
        payload:JSON.stringify(payloadObj),
        muteHttpExceptions:true
      });

      var code = Number(res.getResponseCode());
      var raw = String(res.getContentText() || '');

      // Retry short-lived provider outages on the same key before consuming
      // another slot in the pool.
      if (geminiIsTransientHttp_(code) && attempt < maxRetries) {
        Utilities.sleep(Math.min(6000, baseMs * Math.pow(2, attempt)));
        continue;
      }

      return {
        code:code,
        raw:raw,
        attempts:attempt + 1
      };
    } catch (err) {
      lastNetworkError = err;
      if (attempt < maxRetries) {
        Utilities.sleep(Math.min(6000, baseMs * Math.pow(2, attempt)));
        continue;
      }
    }
  }

  throw lastNetworkError || new Error('Gemini network request failed.');
}





function classifyGeminiFailure_(code, raw) {
  code = Number(code || 0);
  var s = String(raw || '').toLowerCase();

  if (code === 429 || /resource[_ -]?exhausted|quota|rate.?limit|too many requests|exceeded.*limit/.test(s)) {
    return { type:'RATE_LIMIT', retry:true, cooldownMinutes:geminiCooldownMinutes_('RATE_LIMIT') };
  }

  if (code === 401 || code === 403 || /api key not valid|permission denied|unauthenticated|forbidden/.test(s)) {
    return { type:'AUTH', retry:true, cooldownMinutes:geminiCooldownMinutes_('AUTH') };
  }

  if (code === 408 || code === 425 || code === 502 || code === 503 || code === 504 || code >= 500 || code === 0) {
    return { type:'TRANSIENT', retry:true, cooldownMinutes:geminiCooldownMinutes_('TRANSIENT') };
  }

  // Request/model errors will usually fail on every key, so do not burn all keys.
  if (code === 400 || code === 404 || /invalid argument|bad request|model.*not found/.test(s)) {
    return { type:'REQUEST', retry:false, cooldownMinutes:0 };
  }

  return { type:'ERROR', retry:true, cooldownMinutes:geminiCooldownMinutes_('ERROR') };
}





function geminiIsTransientHttp_(code) {
  code = Number(code || 0);
  return code === 408 || code === 425 || code === 500 || code === 502 ||
         code === 503 || code === 504;
}





function nextGeminiSlot_(keys, currentSlot) {
  if (!keys.length) return 1;
  for (var i=0; i<keys.length; i++) {
    if (Number(keys[i].slot) === Number(currentSlot)) return Number(keys[(i+1) % keys.length].slot);
  }
  return Number(keys[0].slot);
}





function geminiCooldownMinutes_(kind) {
  if (kind === 'RATE_LIMIT') return getIntProp_('GEMINI_RATE_LIMIT_COOLDOWN_MINUTES', CFG.GEMINI_RATE_LIMIT_COOLDOWN_MINUTES);
  if (kind === 'AUTH') return getIntProp_('GEMINI_AUTH_COOLDOWN_MINUTES', CFG.GEMINI_AUTH_COOLDOWN_MINUTES);
  // 502/503/504 are normally service-side/transient, not exhausted API-key quota.
  // Keep this short so a temporary Gemini outage does not disable every key for hours.
  if (kind === 'TRANSIENT') return getIntProp_('GEMINI_TRANSIENT_COOLDOWN_MINUTES', CFG.GEMINI_TRANSIENT_COOLDOWN_MINUTES);
  return getIntProp_('GEMINI_ERROR_COOLDOWN_MINUTES', CFG.GEMINI_ERROR_COOLDOWN_MINUTES);
}





function testSignalChart_() {
  const a=analyzeSymbol_('BTCUSDT','15m');
  if(!a.tradePlan) throw new Error('BTCUSDT sedang tidak punya trade plan. Coba symbol lain atau jalankan testSignalChartFor_("ETHUSDT","15m").');
  const chart=buildSignalChartAsset_(a,{status:'NEW_SIGNAL'});
  sendTelegramPhoto_(chart.blob,'🧪 SIGNAL CHART TEST\nBTCUSDT • 15m\nChart generator OK.',getProp_('TELEGRAM_CHAT_ID',true));
  return {ok:true,url:chart.url,fileName:chart.fileName};
}





function testTelegramChannel_() {
  var channelId = getTelegramChannelId_();
  if (!channelId) throw new Error('TELEGRAM_CHANNEL_ID belum diatur.');
  return sendTelegram_(
    '🧪 AZZATSSINS TRADING BOT\n\nTelegram channel connection OK.\nSignal AUTO dan TP HIT akan dipost ke channel ini.',
    channelId
  );
}

/** Public wrappers so these tests appear in the Run dropdown (GAS hides underscore-suffixed functions). */
function testSignalChart() { return testSignalChart_(); }
function testTelegramChannel() { return testTelegramChannel_(); }





function testXPublisherConnection(){assertManualOwnerRun_();var r=xCreatePost_('🧪 AZZATSSINS X Publisher connection test\n'+nowText_());recordXPost_(r,{type:'TEST',source:'EDITOR',text:r.text});console.log(JSON.stringify({ok:true,id:r.id,mode:r.mode}));return {ok:true,id:r.id,mode:r.mode};}





function testDerivativesProviders() {
  var symbol='BTCUSDT',period='4h';
  var out={
    gate:{
      stats:derivSafe_(function(){return derivGateStats_(symbol,period,4);}),
      ticker:derivSafe_(function(){return derivGateTicker_(symbol);})
    },
    bitget:{
      longShort:derivSafe_(function(){return derivBitgetLongShort_(symbol,period);}),
      funding:derivSafe_(function(){return derivBitgetFunding_(symbol);}),
      oi:derivSafe_(function(){return derivBitgetOi_(symbol);})
    },
    okx:{
      funding:derivSafe_(function(){return derivOkxFunding_(symbol);}),
      oi:derivSafe_(function(){return derivOkxOi_(symbol);}),
      book:derivSafe_(function(){return derivOkxOrderBook_(symbol);})
    }
  };
  console.log(JSON.stringify(out,null,2));
  return out;
}



function resetTelegramUpdateCursor_() {
  PropertiesService.getScriptProperties().deleteProperty('TELEGRAM_LAST_UPDATE_ID');
}

/* =========================================================
 * TELEGRAM ROUTER + MENUS
 * ========================================================= */




function testSignalChartFor_(symbol,interval) {
  const a=analyzeSymbol_(symbol||'BTCUSDT',interval||'15m');
  if(!a.tradePlan) throw new Error(String(symbol||'BTCUSDT')+' sedang tidak punya trade plan.');
  const chart=buildSignalChartAsset_(a,{status:'NEW_SIGNAL'});
  sendTelegramPhoto_(chart.blob,'🧪 SIGNAL CHART TEST\n'+a.symbol+' • '+a.interval+'\nChart generator OK.',getProp_('TELEGRAM_CHAT_ID',true));
  return {ok:true,url:chart.url,fileName:chart.fileName};
}

/* =========================================================
 * BINANCE SQUARE OPENAPI
 * ========================================================= */

/**
 * One-time helper if you do not want to add the key manually in Script Properties.
 * 1) Temporarily replace PASTE... below with the Creator Center posting key.
 * 2) Run installBinanceSquareKey_() once from the Apps Script editor.
 * 3) Immediately change this line back to PASTE... before sharing/pushing code.
 */
