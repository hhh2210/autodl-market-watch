#!/usr/bin/env node

const { execFileSync, spawn } = require("child_process");

const MARKET_URL = "https://www.autodl.com/market/list";
const DEFAULT_PROFILE = "Default";
const ALL_CARD_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];
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

function parseArgs(argv) {
  const args = {
    profile: DEFAULT_PROFILE,
    minGb: 80,
    minCards: 4,
    gpuFilter: [],
    watchSec: 0,
    json: false,
    debug: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--profile" && next) {
      args.profile = next;
      i += 1;
    } else if (arg === "--gpu" && next) {
      args.gpuFilter = next.split(",").map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (arg === "--min-gb" && next) {
      args.minGb = Number(next);
      i += 1;
    } else if (arg === "--min-cards" && next) {
      args.minCards = Number(next);
      i += 1;
    } else if (arg === "--watch" && next) {
      args.watchSec = Number(next);
      i += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--debug") {
      args.debug = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
用法:
  node ~/autodl-market-watch.js --gpu "RTX PRO 6000,H800"
  node ~/autodl-market-watch.js --gpu "H800" --min-cards 4 --watch 15
  node ~/autodl-market-watch.js --min-gb 80 --min-cards 4

参数:
  --gpu <names>       按型号名称过滤（逗号分隔，模糊匹配），如 "RTX PRO 6000,H800"
  --profile <name>    Chrome profile，默认 Default
  --min-gb <n>        最小单卡显存（未指定 --gpu 时生效），默认 80
  --min-cards <n>     最小空闲卡数，默认 4
  --watch <sec>       每隔 N 秒轮询一次
  --json              输出 JSON
  --debug             额外打印原始字段样本
`);
}

function runBrowserUse(args) {
  try {
    return execFileSync(
      "browser-use",
      ["--session", cli.session, "--profile", cli.profile, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : "";
    const stdout = error.stdout ? String(error.stdout).trim() : "";
    const message = stderr || stdout || error.message;
    throw new Error(message);
  }
}

function openMarket() {
  ensureSession();
  evalPage(`location.href = ${JSON.stringify(MARKET_URL)}; "navigating"`);
}

function evalPage(source) {
  const out = runBrowserUse(["eval", source]);
  return out.startsWith("result:") ? out.slice(7).trim() : out.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sessionExists() {
  try {
    const out = runBrowserUse(["sessions"]);
    return out.includes(cli.session);
  } catch {
    return false;
  }
}

function startSessionDetached() {
  const child = spawn(
    "browser-use",
    ["--session", cli.session, "--profile", cli.profile, "open", "about:blank"],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
}

function ensureSession() {
  if (sessionExists()) return;

  startSessionDetached();
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (sessionExists()) return;
    sleepSync(250);
  }

  throw new Error("browser-use session 启动超时");
}

function cardCounts(minCards) {
  return ALL_CARD_OPTIONS.filter((n) => n >= minCards);
}

function formatGiB(bytes) {
  const gib = Number(bytes || 0) / (1024 ** 3);
  return gib > 0 ? `${Math.round(gib)}G` : "";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const yuan = n > 100 ? n / 1000 : n;
  return yuan.toFixed(2);
}

function pick(...values) {
  return values.find((v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

function formatList(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value === null || value === undefined) return "";
  return String(value);
}

function extractItems(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.paged && Array.isArray(payload.paged.list)) return payload.paged.list;
  if (payload.data && Array.isArray(payload.data.list)) return payload.data.list;
  return [];
}

function normalizeRow(row, requestedCards) {
  const id = pick(
    row.uuid,
    row.machine_uuid,
    row.machine_id,
    row.id,
    row.order_uuid,
  );
  const gpu = pick(
    row.gpu_type_name,
    row.gpu_name,
    row.gpu_model,
    row.machine_gpu_type,
  );
  const gpuCount = pick(
    row.gpu_num,
    row.gpu_count,
    row.machine_gpu_num,
    row.gpu_idle_num,
    requestedCards,
  );
  const freeCards = pick(
    row.gpu_idle_num,
    row.idle_gpu_num,
    row.free_gpu_num,
    row.available_gpu_num,
    requestedCards,
  );
  const region = pick(
    row.region_name,
    row.region_sign_name,
    row.region_sign,
    row.area_name,
    row.region,
  );
  const memory = pick(
    row.gpu_memory_display,
    row.gpu_mem_display,
    row.gpu_memory,
    row.gpu_mem,
    row.memory,
  );
  const price = pick(
    row.payg_price,
    row.current_price,
    row.price,
    row.hour_price,
    row.pay_price,
  );
  const cpu = pick(
    row.cpu_name,
    row.cpu_model,
    row.cpu_info,
    row.cpu,
  );
  const tags = pick(
    row.machine_tag_name,
    row.machine_tags,
    row.tag_name,
    row.tags,
  );

  return {
    id: id === undefined ? "" : String(id),
    region: region || "",
    gpu: gpu || "",
    gpuCount: gpuCount === undefined ? "" : Number(gpuCount),
    freeCards: freeCards === undefined ? "" : Number(freeCards),
    memory: typeof memory === "number" ? formatGiB(memory) : formatList(memory),
    pricePerHour: formatMoney(price),
    cpu: cpu || "",
    tags: formatList(tags),
    raw: row,
  };
}

function dedupeRows(rows) {
  const seen = new Map();
  for (const row of rows) {
    const key = row.id || `${row.region}|${row.gpu}|${row.gpuCount}|${row.pricePerHour}`;
    if (!seen.has(key)) {
      seen.set(key, row);
    } else {
      const oldRow = seen.get(key);
      if (Number(row.freeCards) > Number(oldRow.freeCards || 0)) {
        seen.set(key, row);
      }
    }
  }
  return [...seen.values()];
}

function buildFetchScript(minGb, counts, gpuFilter) {
  const minBytes = minGb * 1024 ** 3;
  return `
(() => {
  const defaults = ${JSON.stringify(DEFAULT_PAYLOAD)};
  const counts = ${JSON.stringify(counts)};
  const minBytes = ${minBytes};
  const gpuFilter = ${JSON.stringify(gpuFilter)};
  const request = (method, path, body) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, path, false);
    xhr.withCredentials = true;
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.send(body ? JSON.stringify(body) : null);
    return JSON.parse(xhr.responseText || '{}');
  };

  if (location.href.includes('/login')) {
    return JSON.stringify({
      error: 'LOGIN_REQUIRED',
      location: location.href,
    });
  }

  const gpuResp = request('GET', '/api/v1/machine/gpu_type');

  if (gpuResp.code !== 'Success') {
    return JSON.stringify({
      error: 'GPU_TYPE_FAILED',
      response: gpuResp,
    });
  }

  let gpuNames;
  if (gpuFilter.length > 0) {
    const lowerFilters = gpuFilter.map((f) => f.toLowerCase());
    gpuNames = gpuResp.data
      .filter((item) => {
        const name = (item.gpu_name || '').toLowerCase();
        return lowerFilters.some((f) => name.includes(f));
      })
      .map((item) => item.gpu_name);
  } else {
    gpuNames = gpuResp.data
      .filter((item) => Number(item.gpu_memory || 0) >= minBytes)
      .map((item) => item.gpu_name);
  }

  if (gpuNames.length === 0) {
    return JSON.stringify({
      error: 'NO_GPU_MATCH',
      filters: gpuFilter,
      available: gpuResp.data.map((item) => item.gpu_name),
    });
  }

  const responses = [];
  for (const count of counts) {
    const resp = request('POST', '/api/v1/machine/search', {
        ...defaults,
        gpu_type_name: gpuNames,
        gpu_idle_num: count,
      });
    responses.push({ count, resp });
  }

  return JSON.stringify({
    now: new Date().toISOString(),
    location: location.href,
    gpuNames,
    responses,
  });
})()
  `.trim();
}

function printTable(rows) {
  const table = rows.map((row) => ({
    region: row.region,
    gpu: row.gpu,
    cards: row.gpuCount,
    free: row.freeCards,
    mem: row.memory,
    yuan_per_hour: row.pricePerHour,
    cpu: row.cpu,
    tags: row.tags,
    id: row.id,
  }));
  console.table(table);
}

function summarizeError(data) {
  if (data.error === "LOGIN_REQUIRED") {
    return [
      "当前 Chrome profile 还没登录 AutoDL。",
      "先执行一次:",
      `  browser-use --profile ${cli.profile} open ${MARKET_URL}`,
      "然后在弹出的真实 Chrome 页面里登录，再重新运行脚本。",
    ].join("\n");
  }
  if (data.error === "NO_GPU_MATCH") {
    return [
      `未找到匹配 [${data.filters.join(", ")}] 的 GPU 型号。`,
      `平台可用型号: ${data.available.join(", ")}`,
    ].join("\n");
  }
  return JSON.stringify(data, null, 2);
}

async function fetchSnapshot() {
  openMarket();
  await sleep(2500);
  const raw = evalPage(buildFetchScript(cli.minGb, cardCounts(cli.minCards), cli.gpuFilter));
  const data = JSON.parse(raw);

  if (data.error) {
    throw new Error(summarizeError(data));
  }

  const rows = [];
  for (const entry of data.responses || []) {
    if (!entry.resp || entry.resp.code !== "Success") continue;
    const items = extractItems(entry.resp.data);
    for (const item of items) {
      rows.push(normalizeRow(item, entry.count));
    }
  }

  rows.sort((a, b) => {
    const aCards = Number(a.gpuCount || 0);
    const bCards = Number(b.gpuCount || 0);
    if (aCards !== bCards) return bCards - aCards;

    const aPrice = Number(a.pricePerHour || 999999);
    const bPrice = Number(b.pricePerHour || 999999);
    return aPrice - bPrice;
  });

  return {
    fetchedAt: data.now,
    location: data.location,
    gpuNames: data.gpuNames,
    total: rows.length,
    rows: dedupeRows(rows),
  };
}

async function runOnce() {
  const snapshot = await fetchSnapshot();

  if (cli.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  const filterLabel = cli.gpuFilter.length > 0
    ? cli.gpuFilter.join(", ")
    : `${cli.minGb}G+`;
  console.log(
    `[${new Date(snapshot.fetchedAt).toLocaleString("zh-CN", { hour12: false })}] ` +
      `${filterLabel} / ${cli.minCards}卡及以上，共 ${snapshot.rows.length} 条`,
  );
  console.log(`GPU候选: ${snapshot.gpuNames.join(", ")}`);
  printTable(snapshot.rows);

  if (cli.debug && snapshot.rows[0]) {
    console.log("\n首条原始字段样本:");
    console.log(JSON.stringify(snapshot.rows[0].raw, null, 2));
  }
}

async function main() {
  if (cli.watchSec > 0) {
    while (true) {
      try {
        await runOnce();
      } catch (error) {
        console.error(error.message);
      }
      await sleep(cli.watchSec * 1000);
      console.log("");
    }
  } else {
    await runOnce();
  }
}

const cli = parseArgs(process.argv.slice(2));
cli.session = `autodl-${cli.profile}`
  .normalize("NFKD")
  .replace(/[^\w.-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase() || "autodl";

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
