# AGENTS.md

## Project overview

autodl-market-watch is a zero-dependency Node.js CLI that monitors GPU availability on the AutoDL marketplace. It uses a browser automation backend (agent-browser or browser-use) to reuse local Chrome login state, then runs in-page JavaScript to call AutoDL's private APIs.

## Architecture

```
bin/autodl-market-watch.js      Thin CLI entry: parse args → detect backend → fetch → print
lib/api-script.js               Builds the JS string injected into the browser page context
lib/normalize.js                Maps API response fields to display rows, deduplicates
lib/output.js                   printHelp, printTable, summarizeError
lib/backends/browser-use.js     Adapter for browser-use CLI (--session, sessions command)
lib/backends/agent-browser.js   Adapter for agent-browser CLI (--session-name, daemon-based)
```

## Key design decisions

- **No npm dependencies** — everything uses Node.js builtins (`child_process`, `Atomics`).
- **Browser-injected API calls** — the script builds a JS string (`buildFetchScript`) that runs inside the AutoDL page via `eval`. This avoids CORS and reuses the page's auth context (JWT token in `localStorage`).
- **ES5 in injected script** — `lib/api-script.js` generates ES5-compatible code (no arrow functions, no `const`/`let`, no spread) since it runs in the browser page context.
- **Backend abstraction** — each backend adapter exports `{ ensureSession(), openUrl(url), evalPage(js), close() }`. Adding a new backend means creating a new file in `lib/backends/`.
- **Slim API responses** — the injected script extracts only the 11 fields needed for display, avoiding browser-use eval output truncation on large payloads.

## Auth mechanism

AutoDL authenticates API requests via a JWT token stored in `localStorage.token` (not cookies). The injected script reads this token and sends it as the `Authorization` header (without `Bearer` prefix). If the token is missing or expired, the script returns a `LOGIN_REQUIRED` error.

## Common tasks

- **Add a new backend**: Create `lib/backends/<name>.js` exporting `createBackend({ profile, session })`, add a branch in `loadBackend()` in the entry point.
- **Change API fields**: Edit the `slim` mapping in `lib/api-script.js` and the corresponding `normalizeRow` in `lib/normalize.js`.
- **Add CLI flags**: Update `parseArgs()` in `bin/autodl-market-watch.js` and `printHelp()` in `lib/output.js`.
