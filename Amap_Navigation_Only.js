/*
 * Amap navigation-only response cleanup.
 * For startup init only: remove promotional memo cards and taxi service config.
 * Preserve all other startup configuration and navigation-related services.
 */
(function () {
  const url = ($request && $request.url) || "";
  const body = $response && $response.body;
  if (!/^https?:\/\/m5\.amap\.com\/ws\/shield\/dsp\/app\/startup\/init(?:\?|$)/i.test(url)) {
    return $done({});
  }
  if (typeof body !== "string" || !body || body.length > 1500000) return $done({});

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function decodeB64(s) {
    s = s.replace(/\s+/g, "").replace(/=+$/, "");
    let out = [], buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      const n = alphabet.indexOf(s[i]);
      if (n < 0) return null;
      buf = (buf << 6) | n;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buf >> bits) & 255);
      }
    }
    let bin = "";
    for (let i = 0; i < out.length; i += 8192) {
      bin += String.fromCharCode.apply(null, out.slice(i, i + 8192));
    }
    try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; }
  }
  function encodeB64(s) {
    const bin = unescape(encodeURIComponent(s));
    let out = "";
    for (let i = 0; i < bin.length;) {
      const a = bin.charCodeAt(i++);
      const hasB = i < bin.length, b = hasB ? bin.charCodeAt(i++) : 0;
      const hasC = i < bin.length, c = hasC ? bin.charCodeAt(i++) : 0;
      out += alphabet[a >> 2];
      out += alphabet[((a & 3) << 4) | (b >> 4)];
      out += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
      out += hasC ? alphabet[c & 63] : "=";
    }
    return out;
  }

  let obj, encoded = false;
  try {
    obj = JSON.parse(body);
  } catch (e) {
    try {
      const decoded = decodeB64(body);
      if (!decoded) return $done({});
      obj = JSON.parse(decoded);
      encoded = true;
    } catch (e2) { return $done({}); }
  }
  if (!obj || typeof obj !== "object" || !obj.data || typeof obj.data !== "object") {
    return $done({});
  }

  let changed = false;
  const appConf = obj.data.app_conf_init;
  if (appConf && appConf.datas && Array.isArray(appConf.datas.memo) && appConf.datas.memo.length) {
    appConf.datas.memo = [];
    changed = true;
  }
  if (obj.data.taxi_service && Array.isArray(obj.data.taxi_service.data) &&
      obj.data.taxi_service.data.length) {
    obj.data.taxi_service.data = [];
    changed = true;
  }
  if (!changed) return $done({});
  const out = JSON.stringify(obj);
  return $done({ body: encoded ? encodeB64(out) : out });
})();
