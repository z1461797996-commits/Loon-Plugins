/*
 * Tuhu Basic Service - marketing response cleanup
 * Based on supplied HAR:
 * - queryScheme contains launch splash (moduleType 8) and home/my popup campaigns (moduleType 35)
 * - getCmsModuleList contains known promotional module types
 * Only remove confirmed marketing modules; keep service, order, vehicle and asset data.
 */
(function () {
  const url = ($request && $request.url) || "";
  const body = $response && $response.body;
  if (typeof body !== "string" || !body || body.length > 2000000) return $done({});

  let obj;
  try { obj = JSON.parse(body); }
  catch (e) { return $done({}); }
  if (!obj || typeof obj !== "object" || !obj.data || typeof obj.data !== "object") return $done({});

  let changed = false;
  const path = url.split("?")[0];

  // Scene campaign response: remove only confirmed popup/splash module types.
  if (/\/mkt\/mkt-scene-marketing-service\/api\/scene\/queryScheme$/i.test(path)) {
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

  // Personal-center CMS: remove only identified promotion/recommendation modules.
  if (/\/cl\/cl-common-api\/api\/personalCenter\/getCmsModuleList$/i.test(path)) {
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
  return $done({ body: JSON.stringify(obj) });
})();
