function formatGiB(bytes) {
  const gib = Number(bytes || 0) / 1024 ** 3;
  return gib > 0 ? `${Math.round(gib)}G` : "";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const yuan = n > 100 ? n / 1000 : n;
  return yuan.toFixed(2);
}

function formatList(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Maps the slim object returned by the injected browser script to the
 * display-friendly shape used by printTable / JSON output.
 *
 * Known fields from the injected script:
 *   machine_id, region_name, region_sign, gpu_name, gpu_number,
 *   gpu_memory, gpu_idle_num, payg_price, cpu_name,
 *   machine_tag_info, machine_alias
 */
function normalizeRow(row, requestedCards) {
  return {
    id: String(row.machine_id || ""),
    region: row.region_name || "",
    gpu: row.gpu_name || "",
    gpuCount: row.gpu_number != null ? Number(row.gpu_number) : requestedCards,
    freeCards: row.gpu_idle_num != null ? Number(row.gpu_idle_num) : requestedCards,
    memory:
      typeof row.gpu_memory === "number"
        ? formatGiB(row.gpu_memory)
        : String(row.gpu_memory || ""),
    pricePerHour: formatMoney(row.payg_price),
    cpu: row.cpu_name || "",
    tags: formatList(row.machine_tag_info),
    raw: row,
  };
}

function dedupeRows(rows) {
  const seen = new Map();
  for (const row of rows) {
    const key =
      row.id || `${row.region}|${row.gpu}|${row.gpuCount}|${row.pricePerHour}`;
    if (!seen.has(key)) {
      seen.set(key, row);
    } else {
      const existing = seen.get(key);
      if (Number(row.freeCards) > Number(existing.freeCards || 0)) {
        seen.set(key, row);
      }
    }
  }
  return [...seen.values()];
}

module.exports = { normalizeRow, dedupeRows };
