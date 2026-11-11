/*
 * 京东首页信息流广告补充清理
 * 仅处理 api.m.jd.com/client.action?functionId=uniformRecommend9c
 * 仅删除 HAR 中确认的 extension_id.ad === "9960" 商品卡片。
 * 不拦截请求；不处理其他接口；解析失败或结构不符时原样放行。
 */

(function () {
  const url = ($request && $request.url) || "";
  const body = $response && $response.body;

  // 严格限定接口，避免影响京东其他 client.action 请求。
  if (!/^https?:\\/\\/api\\.m\\.jd\\.com\\/client\\.action(?:\\?|$)/i.test(url) ||
      !/[?&]functionId=uniformRecommend9c(?:&|$)/i.test(url)) {
    return $done({});
  }

  if (typeof body !== "string" || body.length === 0 || body.length > 2000000) {
    return $done({});
  }

  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function decodeBase64Utf8(input) {
    const s = input.replace(/\\s+/g, "").replace(/=+$/, "");
    const bytes = [];
    let buffer = 0;
    let bits = 0;
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
    try {
      return decodeURIComponent(escape(binary));
    } catch (e) {
      return binary;
    }
  }

  function encodeBase64Utf8(input) {
    const binary = unescape(encodeURIComponent(input));
    let output = "";
    for (let i = 0; i < binary.length;) {
      const c1 = binary.charCodeAt(i++);
      const has2 = i < binary.length;
      const c2 = has2 ? binary.charCodeAt(i++) : 0;
      const has3 = i < binary.length;
      const c3 = has3 ? binary.charCodeAt(i++) : 0;
      output += B64[c1 >> 2];
      output += B64[((c1 & 3) << 4) | (c2 >> 4)];
      output += has2 ? B64[((c2 & 15) << 2) | (c3 >> 6)] : "=";
      output += has3 ? B64[c3 & 63] : "=";
    }
    return output;
  }

  let parsed;
  let wasBase64 = false;

  // 先尝试明文 JSON。
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    // 京东新协议：响应体整体为 Base64 编码的 JSON。
    if (body.length % 4 !== 0 || !/^[A-Za-z0-9+/=\\r\\n]+$/.test(body)) {
      return $done({});
    }
    try {
      const decoded = decodeBase64Utf8(body);
      if (!decoded) return $done({});
      parsed = JSON.parse(decoded);
      wasBase64 = true;
    } catch (e2) {
      return $done({});
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return $done({});
  }

  // 本次 HAR 的 uniformRecommend9c 响应中，wareInfoList 位于顶层。
  // 兼容未来可能出现的 data 包装，但只在找到明确数组时处理。
  let target = parsed;
  if (!Array.isArray(target.wareInfoList) &&
      target.data && typeof target.data === "object" &&
      Array.isArray(target.data.wareInfoList)) {
    target = target.data;
  }

  if (!Array.isArray(target.wareInfoList) || target.wareInfoList.length === 0) {
    return $done({});
  }

  const before = target.wareInfoList.length;
  target.wareInfoList = target.wareInfoList.filter(function (item) {
    if (!item || typeof item !== "object") return true;

    let ext = item.extension_id;
    if (typeof ext === "string") {
      try {
        ext = JSON.parse(ext);
      } catch (e) {
        // 无法确认广告标记时保留商品，避免误删。
        return true;
      }
    }

    if (!ext || typeof ext !== "object") return true;

    // 仅删除 HAR 中实际确认的广告位标记；不凭曝光链接或其他字段猜测。
    return String(ext.ad) !== "9960";
  });

  const removed = before - target.wareInfoList.length;
  if (removed <= 0) return $done({});

  const newBody = JSON.stringify(parsed);
  return $done({ body: wasBase64 ? encodeBase64Utf8(newBody) : newBody });
})();
