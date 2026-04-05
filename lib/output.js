const { MARKET_URL } = require("./api-script.js");

function printHelp() {
  console.log(`
用法:
  node bin/autodl-market-watch.js --gpu "RTX PRO 6000,H800"
  node bin/autodl-market-watch.js --gpu "H800" --min-cards 4 --watch 15
  node bin/autodl-market-watch.js --min-gb 80 --min-cards 4

参数:
  --gpu <names>       按型号名称过滤（逗号分隔，模糊匹配），如 "RTX PRO 6000,H800"
  --backend <name>    浏览器后端：browser-use 或 agent-browser（默认自动检测）
  --profile <name>    Chrome profile，默认 Default
  --min-gb <n>        最小单卡显存（未指定 --gpu 时生效），默认 80
  --min-cards <n>     最小空闲卡数，默认 4
  --watch <sec>       每隔 N 秒轮询一次
  --json              输出 JSON
  --debug             额外打印原始字段样本
`);
}

function printTable(rows) {
  console.table(
    rows.map((row) => ({
      region: row.region,
      gpu: row.gpu,
      cards: row.gpuCount,
      free: row.freeCards,
      mem: row.memory,
      yuan_per_hour: row.pricePerHour,
      cpu: row.cpu,
      tags: row.tags,
      id: row.id,
    })),
  );
}

function summarizeError(data, backendBinary, profile) {
  if (data.error === "LOGIN_REQUIRED") {
    const detail = data.detail ? `（${data.detail}）` : "";
    return [
      `当前 Chrome profile 未登录或登录已过期${detail}。`,
      "先执行一次:",
      `  ${backendBinary} --profile ${profile} open ${MARKET_URL}`,
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

module.exports = { printHelp, printTable, summarizeError };
