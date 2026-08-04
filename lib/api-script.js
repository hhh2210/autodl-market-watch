const MARKET_URL = "https://www.autodl.com/market/list";

const ALL_CARD_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];
const MAX_PAGES = 50;

const DEFAULT_PAYLOAD = {
  charge_type: "payg",
  region_sign: "",
  gpu_type_name: [],
  machine_tag_name: [],
  gpu_idle_num: 0,
  mount_net_disk: false,
  instance_disk_size_order: "",
  date_range: "",
  date_from: "",
  date_to: "",
  page_index: 1,
  page_size: 90,
  pay_price_order: "",
  gpu_idle_type: "",
  default_order: true,
  region_sign_list: [],
};

function cardCounts(minCards) {
  return ALL_CARD_OPTIONS.filter((n) => n >= minCards);
}

/**
 * Returns a JS string to be eval'd in the browser page context.
 * Must stay ES5-compatible (runs inside Chrome via browser-use / agent-browser eval).
 */
function buildFetchScript(minGb, counts, gpuFilter) {
  const minBytes = minGb * 1024 ** 3;
  return `
(function() {
  var defaults = ${JSON.stringify(DEFAULT_PAYLOAD)};
  var counts = ${JSON.stringify(counts)};
  var minBytes = ${minBytes};
  var gpuFilter = ${JSON.stringify(gpuFilter)};
  var maxPages = ${MAX_PAGES};
  var token = localStorage.getItem('token') || '';
  var appVer = (function() {
    try { return JSON.parse(localStorage.getItem('app_version') || '{}').version || ''; }
    catch(e) { return ''; }
  })();

  if (!token) {
    if (location.href.includes('/login')) {
      return JSON.stringify({ error: 'LOGIN_REQUIRED', location: location.href });
    }
    return JSON.stringify({ error: 'LOGIN_REQUIRED', location: location.href, detail: 'localStorage 中无 token' });
  }

  var request = function(method, path, body) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, path, false);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/json;charset=utf-8');
    xhr.setRequestHeader('Authorization', token);
    if (appVer) xhr.setRequestHeader('AppVersion', appVer);
    xhr.send(body ? JSON.stringify(body) : null);
    return JSON.parse(xhr.responseText || '{}');
  };

  var gpuResp = request('GET', '/api/v1/machine/gpu_type');

  if (gpuResp.code !== 'Success') {
    return JSON.stringify({ error: 'GPU_TYPE_FAILED', response: gpuResp });
  }

  var gpuNames;
  if (gpuFilter.length > 0) {
    var lowerFilters = gpuFilter.map(function(f) { return f.toLowerCase(); });
    gpuNames = gpuResp.data
      .filter(function(item) {
        var name = (item.gpu_name || '').toLowerCase();
        return lowerFilters.some(function(f) { return name.includes(f); });
      })
      .map(function(item) { return item.gpu_name; });
  } else {
    gpuNames = gpuResp.data
      .filter(function(item) { return Number(item.gpu_memory || 0) >= minBytes; })
      .map(function(item) { return item.gpu_name; });
  }

  if (gpuNames.length === 0) {
    return JSON.stringify({
      error: 'NO_GPU_MATCH',
      filters: gpuFilter,
      available: gpuResp.data.map(function(item) { return item.gpu_name; }),
    });
  }

  var responses = [];
  for (var i = 0; i < counts.length; i++) {
    var count = counts[i];
    var payload = {};
    for (var k in defaults) { payload[k] = defaults[k]; }
    payload.gpu_type_name = gpuNames;
    payload.gpu_idle_num = count;
    var slim = [];
    var seenMachineIds = {};
    var responseCode = 'Success';
    var totalHint = null;
    var maxPageHint = null;
    var completed = false;
    for (var pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
      payload.page_index = pageIndex;
      var resp = request('POST', '/api/v1/machine/search', payload);
      responseCode = resp.code;
      if (resp.code === 'AuthorizeFailed' || resp.code === 'AuthFailed') {
        return JSON.stringify({
          error: 'LOGIN_REQUIRED',
          location: location.href,
          detail: resp.msg || resp.message || 'API 认证失败',
        });
      }
      if (resp.code !== 'Success') {
        return JSON.stringify({
          error: 'SEARCH_FAILED',
          count: count,
          page: pageIndex,
          response: { code: resp.code, message: resp.msg || resp.message || '' },
        });
      }
      var data = resp.data || {};
      var items = data.list || [];
      if (!Array.isArray(items)) {
        return JSON.stringify({
          error: 'PAGINATION_INCONSISTENT', count: count, page: pageIndex,
          reason: 'list-is-not-an-array',
        });
      }
      var rawTotal = data.result_total != null ? data.result_total : data.total;
      if (rawTotal != null) {
        var parsedTotal = Number(rawTotal);
        if (!isFinite(parsedTotal) || parsedTotal < 0 ||
            Math.floor(parsedTotal) !== parsedTotal ||
            (totalHint !== null && totalHint !== parsedTotal)) {
          return JSON.stringify({
            error: 'PAGINATION_INCONSISTENT', count: count, page: pageIndex,
            reason: 'invalid-or-changing-result-total',
          });
        }
        totalHint = parsedTotal;
      }
      if (data.max_page != null) {
        var parsedMaxPage = Number(data.max_page);
        if (!isFinite(parsedMaxPage) || parsedMaxPage < 0 ||
            Math.floor(parsedMaxPage) !== parsedMaxPage ||
            (maxPageHint !== null && maxPageHint !== parsedMaxPage)) {
          return JSON.stringify({
            error: 'PAGINATION_INCONSISTENT', count: count, page: pageIndex,
            reason: 'invalid-or-changing-max-page',
          });
        }
        maxPageHint = parsedMaxPage;
      }
      for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
        var m = items[itemIndex];
        var machineId = String(m.machine_id || '');
        if (!machineId || seenMachineIds[machineId]) {
          return JSON.stringify({
            error: 'PAGINATION_INCONSISTENT', count: count, page: pageIndex,
            reason: !machineId ? 'missing-machine-id' : 'duplicate-machine-id',
            machineId: machineId,
          });
        }
        seenMachineIds[machineId] = true;
        slim.push({
          machine_id: m.machine_id,
          region_name: m.region_name,
          region_sign: m.region_sign,
          gpu_name: m.gpu_name,
          gpu_number: m.gpu_number,
          gpu_memory: m.gpu_memory,
          gpu_idle_num: m.gpu_idle_num,
          payg_price: m.payg_price,
          cpu_name: m.machine_base_info ? m.machine_base_info.cpu_name : '',
          machine_tag_info: m.machine_tag_info,
          machine_alias: m.machine_alias,
        });
      }
      if (totalHint !== null && slim.length > totalHint) {
        return JSON.stringify({
          error: 'PAGINATION_INCONSISTENT', count: count, page: pageIndex,
          reason: 'unique-items-exceed-result-total',
        });
      }
      var emptyPage = items.length === 0;
      var reachedMaxPage = maxPageHint !== null && pageIndex >= maxPageHint;
      var reachedTotal = totalHint !== null && slim.length === totalHint;
      if ((emptyPage && ((maxPageHint !== null && pageIndex < maxPageHint) ||
          (totalHint !== null && slim.length < totalHint))) ||
          (reachedMaxPage && totalHint !== null && slim.length !== totalHint) ||
          (reachedTotal && maxPageHint !== null && pageIndex < maxPageHint) ||
          (items.length > 0 && maxPageHint !== null && pageIndex > maxPageHint)) {
        return JSON.stringify({
          error: 'PAGINATION_INCONSISTENT', count: count, page: pageIndex,
          reason: 'completion-hints-disagree',
          uniqueItems: slim.length,
          totalHint: totalHint,
          maxPageHint: maxPageHint,
        });
      }
      if (emptyPage || reachedMaxPage || reachedTotal) {
        responses.push({
          count: count,
          code: resp.code,
          list: slim,
          pages: pageIndex,
          totalHint: totalHint,
          maxPageHint: maxPageHint,
        });
        completed = true;
        break;
      }
      if (items.length < payload.page_size && maxPageHint === null && totalHint === null) {
        responses.push({
          count: count,
          code: resp.code,
          list: slim,
          pages: pageIndex,
          totalHint: null,
          maxPageHint: null,
        });
        completed = true;
        break;
      }
    }
    if (!completed) {
      return JSON.stringify({
        error: 'PAGINATION_LIMIT',
        count: count,
        maxPages: maxPages,
      });
    }
  }

  return JSON.stringify({
    now: new Date().toISOString(),
    location: location.href,
    gpuNames: gpuNames,
    responses: responses,
  });
})()`.trim();
}

module.exports = { MARKET_URL, MAX_PAGES, cardCounts, buildFetchScript };
