const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../bin/autodl-market-watch.js");

test("CLI parses region and price filters without starting a browser", () => {
  const args = parseArgs([
    "--region",
    "西北B,south-a",
    "--max-price",
    "9.5",
  ]);
  assert.deepEqual(args.regions, ["西北B", "south-a"]);
  assert.equal(args.maxPrice, 9.5);
});

test("CLI rejects invalid numeric filters", () => {
  assert.throws(() => parseArgs(["--max-price", "nope"]), /非负数字/);
  assert.throws(() => parseArgs(["--min-cards", "13"]), /1 到 12/);
  assert.throws(() => parseArgs(["--min-cards", "1.5"]), /1 到 12/);
});

test("CLI rejects value options with missing arguments", () => {
  assert.throws(() => parseArgs(["--region"]), /缺少参数/);
  assert.throws(() => parseArgs(["--max-price", "--json"]), /缺少参数/);
});

test("CLI rejects a region list containing only separators and whitespace", () => {
  assert.throws(() => parseArgs(["--region", " , "]), /至少需要一个非空地区/);
});
