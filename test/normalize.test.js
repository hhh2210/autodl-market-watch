const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeRow, filterRows } = require("../lib/normalize.js");

function row(id, region, sign, price) {
  return normalizeRow(
    {
      machine_id: id,
      region_name: region,
      region_sign: sign,
      gpu_name: "H800",
      gpu_number: 8,
      gpu_idle_num: 4,
      payg_price: price,
    },
    4,
  );
}

test("region and maximum price filters compose after normalization", () => {
  const rows = [
    row("a", "西北B", "northwest-b", 8000),
    row("b", "华南A", "south-a", 12000),
    row("c", "华东A", "east-a", 7000),
  ];

  assert.deepEqual(
    filterRows(rows, { regions: ["西北", "south"], maxPrice: 10 }).map(
      (item) => item.id,
    ),
    ["a"],
  );
});
