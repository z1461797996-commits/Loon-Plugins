/*
 * Tuhu Basic Service v2
 * Only cleans the two confirmed marketing responses.
 * Never intercepts or modifies gylApi homepage feed/pagination.
 * Supports plain JSON and Base64(JSON) response bodies.
 */
(function () {
  const url = ($request && $request.url) || "";
  const path = url.split("?")[0];
  const isScene = /\/mkt\/mkt-scene-marketing-service\/api\/scene\/queryScheme$/i.test(path);
  const isCms = /\/cl\/cl-common-api\/api\/personalCenter\/getCmsModuleList$/i.test(path);
  if (!isScene && !isCms) return $done({});

  const body = $response && $response.body;
  if (typeof body !== "string" || !body || body.length > 2000000) return $done({});

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function decodeB64Utf8(input) {
    const s = input.replace(/\s+/g, "").replace(/=+$/, "");
    const bytes = [];
    let buffer = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      const n = alphabet.indexOf(s[i]);
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
      const decoded = decodeB64Utf8(body);
      if (!decoded) return $done({});
      obj = JSON.parse(decoded);
      encoded = true;
    } catch (e2) {
      return $done({});
    }
  }
  if (!obj || typeof obj !== "object" || !obj.data || typeof obj.data !== "object") {
    return $done({});
  }

  let changed = false;

  if (isScene) {
    const data = obj.data;
    if (Array.isArray(data.moduleActionList)) {
      const before = data.moduleActionList.length;
      data.moduleActionList = data.moduleActionList.filter(function (action) {
        if (!action || typeof action !== "object") return true;
        const type = Number(action.moduleType);
        const pageId = String(data.pageId || "");
        if (type === 8 && pageId === "/launch") return false;
        if (type === 35 && (pageId === "/home" || pageId === "/my")) return false;
        return true;
      });
      if (data.moduleActionList.length !== before) changed = true;
    }
  }

  if (isCms) {
    const data = obj.data;
    if (Array.isArray(data.cmsList)) {
      const blocked = { 148: true, 173: true, 154: true, 7: true, 35: true, 13: true, 17: true };
      const before = data.cmsList.length;
      data.cmsList = data.cmsList.filter(function (module) {
        if (!module || typeof module !== "object") return true;
        const type = Number(module.moduleTypeId || module.moduleId);
        return !blocked[type];
      });
      if (data.cmsList.length !== before) changed = true;
    }
  }

  if (!changed) return $done({});
  const output = JSON.stringify(obj);
  return $done({ body: encoded ? encodeB64Utf8(output) : output });
})();
