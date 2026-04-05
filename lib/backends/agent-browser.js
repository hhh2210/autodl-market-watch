const { execFileSync } = require("child_process");

function createBackend({ profile, session }) {
  function run(args) {
    try {
      return execFileSync(
        "agent-browser",
        ["--session-name", session, "--profile", profile, ...args],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ).trim();
    } catch (error) {
      const stderr = error.stderr ? String(error.stderr).trim() : "";
      const stdout = error.stdout ? String(error.stdout).trim() : "";
      throw new Error(stderr || stdout || error.message);
    }
  }

  return {
    name: "agent-browser",

    ensureSession() {
      // agent-browser uses a persistent daemon; starts automatically on first command.
    },

    openUrl(url) {
      run(["open", url]);
    },

    evalPage(source) {
      let result = run(["eval", source]);
      if (result.startsWith("result:")) result = result.slice(7).trim();
      // agent-browser wraps string values in quotes with escape sequences;
      // unwrap one layer so callers receive the raw string content.
      if (result.startsWith('"') && result.endsWith('"')) {
        try {
          result = JSON.parse(result);
        } catch {
          // not valid JSON-quoted string — return as-is
        }
      }
      return result;
    },

    close() {},
  };
}

module.exports = { createBackend };
