/*
 * Tianhong Basic Shopping - lightweight response cleanup
 * Only process dj_module_api/fetch.
 * Preserve the entire "逛一逛" page and its loading/feed modules.
 * On the store home page, remove only modules explicitly marked creativeMedia/ecHome.
 */
(function () {
  const url = ($request && $request.url) || "";
  if (!/\/dj_module_api\/fetch(?:\?|$)/i.test(url)) return $done({});

  const body = $response && $response.body;
  if (typeof body !== "string" || !body || body.length > 1500000) return $done({});

  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function decodeB64Utf8(input) {
    const s = input.replace(/\s+/g, "").replace(/=+$/, "");
    const bytes = [];
    let buffer = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      const n = B64.indexOf(s[i]);
      if (n < 0) return null;
      buffer = (buffer << 6) | n;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 255);
      }
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.slice(i, i + 8192));
    }
    try { return decodeURIComponent(escape(binary)); }
    catch (e) { return binary; }
  }
  function encodeB64Utf8(input) {
    const binary = unescape(encodeURIComponent(input));
    let out = "";
    for (let i = 0; i < binary.length;) {
      const a = binary.charCodeAt(i++);
      const hasB = i < binary.length, b = hasB ? binary.charCodeAt(i++) : 0;
      const hasC = i < binary.length, c = hasC ? binary.charCodeAt(i++) : 0;
      out += B64[a >> 2];
      out += B64[((a & 3) << 4) | (b >> 4)];
      out += hasB ? B64[((b & 15) << 2) | (c >> 6)] : "=";
      out += hasC ? B64[c & 63] : "=";
    }
    return out;
  }

  let obj, wasBase64 = false;
  try {
    obj = JSON.parse(body);
  } catch (e) {
    try {
      const decoded = decodeB64Utf8(body);
      if (!decoded) return $done({});
      obj = JSON.parse(decoded);
      wasBase64 = true;
    } catch (e2) { return $done({}); }
  }

  if (!obj || typeof obj !== "object" || !obj.pageInfo ||
      !Array.isArray(obj.pageInfo.modules)) return $done({});

  // The 逛一逛 page uses pic:106, pic:105 and loading:0 as its feed loader.
  // Return it byte-for-byte unchanged to preserve all discovery content and avoid extra work.
  if (/逛一逛/.test(String(obj.pageInfo.title || ""))) return $done({});

  const modules = obj.pageInfo.modules;
  const before = modules.length;
  obj.pageInfo.modules = modules.filter(function (module) {
    if (!module || typeof module !== "object") return true;
    const data = module.data && typeof module.data === "object" ? module.data : {};
    return data.sceneType !== "creativeMedia" && data.sceneType !== "ecHome";
  });

  if (obj.pageInfo.modules.length === before) return $done({});
  if (obj.pageInfo.moduleCount !== undefined) {
    obj.pageInfo.moduleCount = obj.pageInfo.modules.length;
  }
  const output = JSON.stringify(obj);
  return $done({ body: wasBase64 ? encodeB64Utf8(output) : output });
})();
