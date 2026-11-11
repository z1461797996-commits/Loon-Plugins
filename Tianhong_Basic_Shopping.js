/*
 * Tianhong Basic Shopping - optimized response cleanup
 * Only handles dj_module_api/fetch.
 * Keep the "逛一逛" page alive; remove only clearly promotional cards.
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
      const hasB = i < binary.length;
      const b = hasB ? binary.charCodeAt(i++) : 0;
      const hasC = i < binary.length;
      const c = hasC ? binary.charCodeAt(i++) : 0;
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
    } catch (e2) {
      return $done({});
    }
  }

  if (!obj || typeof obj !== "object" || !obj.pageInfo ||
      typeof obj.pageInfo !== "object" || !Array.isArray(obj.pageInfo.modules)) {
    return $done({});
  }

  const campaignTitle = /双11|双十一|限时好价|限时秒杀|优惠券|领券|新人礼包|红包|会员活动|积分商城|积分俱乐部|年度好物|新国货大赏|品牌专区|活动推广/i;
  let changed = false;
  const isBrowsePage = /逛一逛/.test(String(obj.pageInfo.title || ""));

  function cleanBrowseModule(module) {
    if (!module || typeof module !== "object") return true;
    const type = String(module.type || "");
    const data = module.data && typeof module.data === "object" ? module.data : {};

    // Remove only a banner whose link explicitly opens a merchant download/marketing page.
    if (type === "pic:106" && Array.isArray(data.pictures)) {
      const before = data.pictures.length;
      data.pictures = data.pictures.filter(function (pic) {
        if (!pic || typeof pic !== "object") return true;
        const href = String(pic.hrefValue || "");
        return !(Number(pic.hrefType) === 9 || /type=merchant/i.test(href));
      });
      if (data.pictures.length !== before) changed = true;
      if (data.pictures.length === 0) return false;
    }

    // Preserve ordinary discovery/category tiles; remove only explicit campaign tiles.
    if (type === "pic:105" && Array.isArray(data.pictures)) {
      const before = data.pictures.length;
      data.pictures = data.pictures.filter(function (pic) {
        if (!pic || typeof pic !== "object") return true;
        const label = String(pic.hrefTitle || pic.picName || "");
        const href = String(pic.hrefValue || "");
        if (campaignTitle.test(label)) return false;
        if (/type=(?:coupon|activity|campaign|member)/i.test(href)) return false;
        return true;
      });
      if (data.pictures.length !== before) changed = true;
      if (data.pictures.length === 0) return false;
    }

    // Keep loading:0 and all other dynamic feed loaders.
    return true;
  }

  function cleanMainModule(module) {
    if (!module || typeof module !== "object") return true;
    const data = module.data && typeof module.data === "object" ? module.data : {};
    const type = String(module.type || "");

    if (data.sceneType === "creativeMedia" || data.sceneType === "ecHome") return false;
    if (type === "pic:101" || type === "picTopic:48") return false;

    if (type === "pic:106" && Array.isArray(data.pictures)) {
      const before = data.pictures.length;
      data.pictures = data.pictures.filter(function (pic) {
        if (!pic || typeof pic !== "object") return true;
        const href = String(pic.hrefValue || "");
        return !(Number(pic.hrefType) === 9 || /type=merchant/i.test(href) ||
                 campaignTitle.test(String(pic.hrefTitle || pic.picName || "")));
      });
      if (data.pictures.length !== before) changed = true;
      if (data.pictures.length === 0) return false;
    }

    if (type === "tab:1" && Array.isArray(data.pages)) {
      const beforePages = data.pages.length;
      data.pages = data.pages.filter(function (page) {
        if (!page || typeof page !== "object") return true;
        if (campaignTitle.test(String(page.name || ""))) return false;
        if (Array.isArray(page.data)) {
          const beforeSub = page.data.length;
          page.data = page.data.filter(function (sub) {
            if (!sub || typeof sub !== "object") return true;
            const subType = String(sub.type || "");
            const subData = sub.data && typeof sub.data === "object" ? sub.data : {};
            if (subData.sceneType === "creativeMedia" || subData.sceneType === "ecHome") return false;
            if (subType === "pic:101" || subType === "picTopic:48") return false;
            if (subType === "pic:106" && Array.isArray(subData.pictures)) {
              subData.pictures = subData.pictures.filter(function (pic) {
                if (!pic || typeof pic !== "object") return true;
                return !(Number(pic.hrefType) === 9 ||
                         /type=merchant/i.test(String(pic.hrefValue || "")) ||
                         campaignTitle.test(String(pic.hrefTitle || pic.picName || "")));
              });
              return subData.pictures.length > 0;
            }
            return true;
          });
          if (page.data.length !== beforeSub) changed = true;
        }
        return true;
      });
      if (data.pages.length !== beforePages) changed = true;
    }

    return true;
  }

  const beforeModules = obj.pageInfo.modules.length;
  if (isBrowsePage) {
    // Do not empty "逛一逛"; keep its feed loader and ordinary discovery tiles.
    obj.pageInfo.modules = obj.pageInfo.modules.filter(cleanBrowseModule);
  } else {
    obj.pageInfo.modules = obj.pageInfo.modules.filter(cleanMainModule);
  }
  if (obj.pageInfo.modules.length !== beforeModules) changed = true;
  if (obj.pageInfo.moduleCount !== undefined &&
      obj.pageInfo.moduleCount !== obj.pageInfo.modules.length) {
    obj.pageInfo.moduleCount = obj.pageInfo.modules.length;
    changed = true;
  }

  if (!changed) return $done({});
  const output = JSON.stringify(obj);
  return $done({ body: wasBase64 ? encodeB64Utf8(output) : output });
})();
