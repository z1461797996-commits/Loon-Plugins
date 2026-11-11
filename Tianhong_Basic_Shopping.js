/*
 * Tianhong Basic Shopping - response cleanup
 * Based on captured HAR:
 * - dj_module_api/fetch returns Base64(JSON) with dynamic page modules.
 * - Remove creativeMedia/ecHome recommendation feeds and campaign modules.
 * - Keep shopping entry points, product search/detail, cart, orders and payment.
 * - Filter only the "活动优惠" conversation; preserve service and logistics notices.
 */
(function () {
  const url = ($request && $request.url) || "";
  const body = $response && $response.body;
  if (typeof body !== "string" || !body || body.length > 2500000) return $done({});

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

  function parseResponse(text) {
    try { return { value: JSON.parse(text), encoded: false }; }
    catch (e) {}
    try {
      const decoded = decodeB64Utf8(text);
      if (decoded) return { value: JSON.parse(decoded), encoded: true };
    } catch (e2) {}
    return null;
  }

  function isCampaignName(value) {
    return /双11|双十一|活动|优惠|领券|优惠券|积分商城|积分俱乐部|秒杀|直播|礼品卡|红包|会员权益|新人礼包|品牌专区|年度好物|大赏/.test(String(value || ""));
  }

  const keepShortcut = /天虹到家|超市到家|免排队收银|手机买单|全部分类|商品分类/;

  function cleanSubModule(sub) {
    if (!sub || typeof sub !== "object") return true;
    const type = String(sub.type || "");
    const data = sub.data && typeof sub.data === "object" ? sub.data : {};

    // Promotional banners, carousel campaigns and topic cards.
    if (type === "pic:101" || type === "pic:106" || type === "picTopic:48") return false;

    // Keep only the grocery-shopping group in custom home modules.
    if (type === "custom:56" && Array.isArray(data.list)) {
      data.list = data.list.filter(function (group) {
        return group && typeof group === "object" &&
          /超市到家/.test(String(group.title || ""));
      });
      if (data.list.length === 0) return false;
    }

    // The diamond shortcut zone mixes shopping tools with coupon/points/campaign links.
    if (type === "diamondZone:45" && Array.isArray(data.pictures)) {
      data.pictures = data.pictures.filter(function (pic) {
        if (!pic || typeof pic !== "object") return false;
        const label = String(pic.hrefTitle || pic.title || "");
        const href = String(pic.hrefValue || "");
        if (keepShortcut.test(label)) return true;
        if (/type=(?:store|quick_shop|all_category)/i.test(href)) return true;
        return false;
      });
      if (data.pictures.length === 0) return false;
    }

    // Remove dynamic recommendation/media feeds, not product search results.
    if (data.sceneType === "creativeMedia" || data.sceneType === "ecHome") return false;

    return true;
  }

  function cleanPageModule(module) {
    if (!module || typeof module !== "object") return true;
    const data = module.data && typeof module.data === "object" ? module.data : {};
    const type = String(module.type || "");

    if (data.sceneType === "creativeMedia" || data.sceneType === "ecHome") return false;
    if (type === "pic:101" || type === "pic:106" || type === "picTopic:48") return false;

    if (type === "tab:1" && Array.isArray(data.pages)) {
      data.pages = data.pages.filter(function (page) {
        if (!page || typeof page !== "object") return false;
        if (isCampaignName(page.name)) return false;
        if (Array.isArray(page.data)) {
          page.data = page.data.filter(cleanSubModule);
        }
        return true;
      });
      if (data.pages.length === 0) return false;
    }

    if (type === "custom:56" && Array.isArray(data.list)) {
      data.list = data.list.filter(function (group) {
        return group && typeof group === "object" &&
          /超市到家/.test(String(group.title || ""));
      });
      if (data.list.length === 0) return false;
    }

    if (type === "diamondZone:45" && Array.isArray(data.pictures)) {
      data.pictures = data.pictures.filter(function (pic) {
        if (!pic || typeof pic !== "object") return false;
        const label = String(pic.hrefTitle || pic.title || "");
        const href = String(pic.hrefValue || "");
        if (keepShortcut.test(label)) return true;
        return /type=(?:store|quick_shop|all_category)/i.test(href);
      });
      if (data.pictures.length === 0) return false;
    }

    return true;
  }

  let parsed = parseResponse(body);
  if (!parsed || !parsed.value || typeof parsed.value !== "object") return $done({});
  const obj = parsed.value;
  let changed = false;

  // Dynamic page/module API: clean the page payload while preserving shopping entry points.
  if (/\/dj_module_api\/fetch(?:\?|$)/i.test(url)) {
    const pageInfo = obj.pageInfo;
    if (!pageInfo || typeof pageInfo !== "object") return $done({});

    // The "逛一逛" page is a content/discovery feed, not a basic shopping function.
    if (/逛一逛/.test(String(pageInfo.title || ""))) {
      if (Array.isArray(pageInfo.modules) && pageInfo.modules.length) {
        pageInfo.modules = [];
        pageInfo.moduleCount = 0;
        changed = true;
      }
    } else if (Array.isArray(pageInfo.modules)) {
      const before = pageInfo.modules.length;
      pageInfo.modules = pageInfo.modules.filter(cleanPageModule);
      if (pageInfo.modules.length !== before) changed = true;
      if (pageInfo.moduleCount !== undefined) pageInfo.moduleCount = pageInfo.modules.length;
    }
  }

  // My/member page: keep member identity and status; remove marketing cards/copy.
  if (/\/scrm\/v1\/api\/member\/home(?:\?|$)/i.test(url)) {
    if (obj.data && typeof obj.data === "object") {
      const d = obj.data;
      ["memberActiveList", "topShowDescList", "rollingInfo"].forEach(function (key) {
        if (Array.isArray(d[key]) && d[key].length) {
          d[key] = [];
          changed = true;
        }
      });
      if (d.memberBenefit !== undefined) {
        delete d.memberBenefit;
        changed = true;
      }
    }
  }

  // Remove only the promotional inbox thread; keep service and delivery notices.
  if (/\/scrm\/v1\/api\/message\/recent-contact\/page(?:\?|$)/i.test(url)) {
    if (obj.data && Array.isArray(obj.data.list)) {
      const before = obj.data.list.length;
      obj.data.list = obj.data.list.filter(function (item) {
        if (!item || typeof item !== "object") return true;
        return !(/活动优惠/.test(String(item.peerAccountNick || "")) ||
                 /活动优惠/.test(String(item.trackDataTypeName || "")));
      });
      if (obj.data.list.length !== before) {
        changed = true;
        obj.data.unreadCount = obj.data.list.reduce(function (sum, item) {
          return sum + (Number(item && item.unreadCount) || 0);
        }, 0);
      }
    }
  }

  if (!changed) return $done({});
  const output = JSON.stringify(obj);
  return $done({ body: parsed.encoded ? encodeB64Utf8(output) : output });
})();
