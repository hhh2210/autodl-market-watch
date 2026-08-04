#!/usr/bin/env node

const { execFileSync } = require("child_process");
const {
  MARKET_URL,
  cardCounts,
  buildFetchScript,
} = require("../lib/api-script.js");
const {
  normalizeRow,
  dedupeRows,
  filterRows,
} = require("../lib/normalize.js");
const { printHelp, printTable, summarizeError } = require("../lib/output.js");

const DEFAULT_PROFILE = "Default";
const VALUE_OPTIONS = new Set([
  "--profile",
  "--backend",
  "--gpu",
  "--min-gb",
  "--min-cards",
  "--region",
  "--max-price",
  "--watch",
]);

function parseArgs(argv) {
  const args = {
    profile: DEFAULT_PROFILE,
    backend: "",
    minGb: 80,
    minCards: 4,
    regions: [],
    maxPrice: null,
    gpuFilter: [],
    watchSec: 0,
    json: false,
    debug: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (VALUE_OPTIONS.has(arg) && (!next || next.startsWith("--"))) {
      throw new Error(`${arg} 缺少参数`);
    }

    if (arg === "--profile" && next) {
      args.profile = next;
      i += 1;
    } else if (arg === "--backend" && next) {
      args.backend = next;
      i += 1;
    } else if (arg === "--gpu" && next) {
      args.gpuFilter = next
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === "--min-gb" && next) {
      args.minGb = Number(next);
      i += 1;
    } else if (arg === "--min-cards" && next) {
      args.minCards = Number(next);
      i += 1;
    } else if (arg === "--region" && next) {
      args.regions = next
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (args.regions.length === 0) {
        throw new Error("--region 至少需要一个非空地区");
      }
      i += 1;
    } else if (arg === "--max-price" && next) {
      args.maxPrice = Number(next);
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

  for (const [name, value] of [
    ["--min-gb", args.minGb],
    ["--min-cards", args.minCards],
    ["--watch", args.watchSec],
  ]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} 必须是非负数字`);
    }
  }
  if (
    args.maxPrice !== null &&
    (!Number.isFinite(args.maxPrice) || args.maxPrice < 0)
  ) {
    throw new Error("--max-price 必须是非负数字");
  }
  if (
    !Number.isInteger(args.minCards) ||
    args.minCards < 1 ||
    args.minCards > 12 ||
    cardCounts(args.minCards).length === 0
  ) {
    throw new Error("--min-cards 必须是 1 到 12 之间受支持的整数");
  }

  return args;
}

function detectBackend(preferred) {
  const candidates = preferred ? [preferred] : ["agent-browser", "browser-use"];

  for (const name of candidates) {
    try {
      execFileSync("which", [name], { stdio: "pipe" });
      return name;
    } catch {
      // not found, try next
    }
  }

  throw new Error(
    preferred
      ? `未找到指定的 backend: ${preferred}`
      : "未找到 browser-use 或 agent-browser CLI，请先安装其中一个。",
  );
}

function loadBackend(name, options) {
  if (name === "browser-use") {
    return require("../lib/backends/browser-use.js").createBackend(options);
  }
  if (name === "agent-browser") {
    return require("../lib/backends/agent-browser.js").createBackend(options);
  }
  throw new Error(`不支持的 backend: ${name}`);
}

function makeSessionName(profile) {
  return (
    `autodl-${profile}`
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "autodl"
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSnapshot(backend, opts) {
  backend.openUrl(MARKET_URL);
  await sleep(2500);

  const counts = cardCounts(opts.minCards);
  if (counts.length === 0) {
    throw new Error("没有与 --min-cards 对应的受支持卡数");
  }
  const script = buildFetchScript(opts.minGb, counts, opts.gpuFilter);
  const raw = backend.evalPage(script);
  const data = JSON.parse(raw);

  if (data.error) {
    throw new Error(summarizeError(data, backend.name, opts.profile));
  }

  const rows = [];
  for (const entry of data.responses || []) {
    if (entry.code !== "Success") continue;
    for (const item of entry.list || []) {
      rows.push(normalizeRow(item, entry.count));
    }
  }

  rows.sort((a, b) => {
    const cardDiff = Number(b.gpuCount || 0) - Number(a.gpuCount || 0);
    if (cardDiff !== 0) return cardDiff;
    return Number(a.pricePerHour || 999999) - Number(b.pricePerHour || 999999);
  });

  const uniqueRows = dedupeRows(rows);
  const filteredRows = filterRows(uniqueRows, {
    regions: opts.regions,
    maxPrice: opts.maxPrice,
  });
  return {
    fetchedAt: data.now,
    location: data.location,
    gpuNames: data.gpuNames,
    scannedTotal: uniqueRows.length,
    total: filteredRows.length,
    rows: filteredRows,
  };
}

async function runOnce(backend, opts) {
  const snapshot = await fetchSnapshot(backend, opts);

  if (opts.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  const filterLabel =
    opts.gpuFilter.length > 0 ? opts.gpuFilter.join(", ") : `${opts.minGb}G+`;

  console.log(
    `[${new Date(snapshot.fetchedAt).toLocaleString("zh-CN", { hour12: false })}] ` +
      `${filterLabel} / ${opts.minCards}卡及以上，共 ${snapshot.rows.length} 条`,
  );
  console.log(`GPU候选: ${snapshot.gpuNames.join(", ")}`);
  printTable(snapshot.rows);

  if (opts.debug && snapshot.rows[0]) {
    console.log("\n首条原始字段样本:");
    console.log(JSON.stringify(snapshot.rows[0].raw, null, 2));
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const backendName = detectBackend(opts.backend);
  const session = makeSessionName(opts.profile);
  const backend = loadBackend(backendName, {
    profile: opts.profile,
    session,
  });

  if (opts.watchSec > 0) {
    while (true) {
      try {
        await runOnce(backend, opts);
      } catch (error) {
        console.error(error.message);
      }
      await sleep(opts.watchSec * 1000);
      console.log("");
    }
  } else {
    await runOnce(backend, opts);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, fetchSnapshot, runOnce, makeSessionName };
