#!/usr/bin/env node

const { execFileSync } = require("child_process");
const {
  MARKET_URL,
  cardCounts,
  buildFetchScript,
} = require("../lib/api-script.js");
const { normalizeRow, dedupeRows } = require("../lib/normalize.js");
const { printHelp, printTable, summarizeError } = require("../lib/output.js");

const DEFAULT_PROFILE = "Default";

function parseArgs(argv) {
  const args = {
    profile: DEFAULT_PROFILE,
    backend: "",
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

  const script = buildFetchScript(
    opts.minGb,
    cardCounts(opts.minCards),
    opts.gpuFilter,
  );
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

  return {
    fetchedAt: data.now,
    location: data.location,
    gpuNames: data.gpuNames,
    total: rows.length,
    rows: dedupeRows(rows),
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

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
