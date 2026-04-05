const { execFileSync, spawn } = require("child_process");

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function createBackend({ profile, session }) {
  function run(args) {
    try {
      return execFileSync(
        "browser-use",
        ["--session", session, "--profile", profile, ...args],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ).trim();
    } catch (error) {
      const stderr = error.stderr ? String(error.stderr).trim() : "";
      const stdout = error.stdout ? String(error.stdout).trim() : "";
      throw new Error(stderr || stdout || error.message);
    }
  }

  function sessionExists() {
    try {
      return run(["sessions"]).includes(session);
    } catch {
      return false;
    }
  }

  function startDetached() {
    const child = spawn(
      "browser-use",
      ["--session", session, "--profile", profile, "open", "about:blank"],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  }

  return {
    name: "browser-use",

    ensureSession() {
      if (sessionExists()) return;
      startDetached();
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (sessionExists()) return;
        sleepSync(250);
      }
      throw new Error("browser-use session 启动超时");
    },

    openUrl(url) {
      this.ensureSession();
      this.evalPage(`location.href = ${JSON.stringify(url)}; "navigating"`);
    },

    evalPage(source) {
      const out = run(["eval", source]);
      return out.startsWith("result:") ? out.slice(7).trim() : out.trim();
    },

    close() {},
  };
}

module.exports = { createBackend };
