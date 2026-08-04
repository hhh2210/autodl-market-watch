const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const { buildFetchScript } = require("../lib/api-script.js");

function runScript(searchResponse) {
  const requestedPages = [];
  class FakeRequest {
    open(method, path) {
      this.method = method;
      this.path = path;
    }

    setRequestHeader() {}

    send(body) {
      if (this.path.endsWith("/gpu_type")) {
        this.responseText = JSON.stringify({
          code: "Success",
          data: [{ gpu_name: "H800", gpu_memory: 80 * 1024 ** 3 }],
        });
        return;
      }
      const payload = JSON.parse(body);
      requestedPages.push(payload.page_index);
      this.responseText = JSON.stringify(searchResponse(payload.page_index));
    }
  }

  const result = vm.runInNewContext(buildFetchScript(80, [4], ["H800"]), {
    XMLHttpRequest: FakeRequest,
    isFinite,
    location: { href: "https://www.autodl.com/market/list" },
    localStorage: {
      getItem(key) {
        if (key === "token") return "test-token";
        if (key === "app_version") return '{"version":"test"}';
        return null;
      },
    },
  });
  return { data: JSON.parse(result), requestedPages };
}

function machine(id) {
  return {
    machine_id: id,
    region_name: "西北B",
    region_sign: "northwest-b",
    gpu_name: "H800",
    gpu_number: 8,
    gpu_memory: 80 * 1024 ** 3,
    gpu_idle_num: 4,
    payg_price: 8000,
  };
}

test("browser script fetches all inventory pages", () => {
  const firstPage = Array.from({ length: 90 }, (_, index) => machine(`m-${index}`));
  const { data, requestedPages } = runScript((page) => ({
    code: "Success",
    data: {
      list: page === 1 ? firstPage : [machine("m-90")],
      count: 90,
      max_page: 2,
      result_total: 91,
    },
  }));

  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(data.responses[0].list.length, 91);
  assert.equal(data.responses[0].pages, 2);
  assert.equal(data.responses[0].maxPageHint, 2);
});

test("browser script fails closed when pages overlap", () => {
  const page = Array.from({ length: 90 }, (_, index) => machine(`m-${index}`));
  const { data, requestedPages } = runScript(() => ({
    code: "Success",
    data: { list: page, total: 180 },
  }));

  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(data.error, "PAGINATION_INCONSISTENT");
  assert.equal(data.reason, "duplicate-machine-id");
  assert.equal(data.page, 2);
});

test("browser script rejects contradictory completion hints", () => {
  const firstPage = Array.from({ length: 90 }, (_, index) => machine(`a-${index}`));
  const secondPage = Array.from({ length: 90 }, (_, index) => machine(`b-${index}`));
  const { data, requestedPages } = runScript((page) => ({
    code: "Success",
    data: {
      list: page === 1 ? firstPage : secondPage,
      max_page: 2,
      result_total: 200,
    },
  }));

  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(data.error, "PAGINATION_INCONSISTENT");
  assert.equal(data.reason, "completion-hints-disagree");
  assert.equal(data.uniqueItems, 180);
});
