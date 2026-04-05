# autodl-market-watch

CLI tool to monitor GPU availability on the [AutoDL](https://www.autodl.com) marketplace.

Uses a browser automation backend ([agent-browser](https://github.com/anthropics/agent-browser) or [browser-use](https://github.com/nicepkg/browser-use)) to reuse your local Chrome login session, then queries AutoDL's internal APIs to check real-time GPU inventory.

## How it works

```
agent-browser / browser-use (Chrome) ──► autodl.com
    │
    ├── GET  /api/v1/machine/gpu_type   ← list all GPU types
    └── POST /api/v1/machine/search     ← search available machines
```

1. Launches (or reuses) a browser session with your Chrome profile
2. Navigates to the AutoDL market page to establish auth context
3. Runs in-page JavaScript to call AutoDL's APIs (auth via localStorage JWT token)
4. Filters results by GPU model or VRAM size, and minimum idle card count
5. Prints a formatted table to the terminal

## Prerequisites

- **Node.js** >= 18
- **One of the following browser CLIs:**
  - [agent-browser](https://github.com/anthropics/agent-browser) (recommended): `brew install agent-browser`
  - [browser-use](https://github.com/nicepkg/browser-use): `pip install browser-use`
- **Google Chrome** with a profile that's logged into AutoDL

The script auto-detects which backend is available (prefers `agent-browser`), or you can specify with `--backend`.

Verify your setup:

```bash
# agent-browser
agent-browser --profile Default open https://www.autodl.com/market/list

# or browser-use
browser-use doctor
browser-use --profile Default open https://www.autodl.com/market/list
```

If Chrome opens and you see the market page (not a login redirect), you're good to go.

## Usage

### Filter by GPU model name (recommended)

```bash
# Only show RTX PRO 6000 and H800, at least 4 idle cards
node bin/autodl-market-watch.js --gpu "RTX PRO 6000,H800"

# Only H800, at least 8 idle cards, poll every 30 seconds
node bin/autodl-market-watch.js --gpu "H800" --min-cards 8 --watch 30
```

`--gpu` uses case-insensitive substring matching against AutoDL's GPU type list. If no match is found, it prints all available GPU names for reference.

### Filter by VRAM size

```bash
# All GPUs with >= 80GB VRAM, at least 4 idle cards
node bin/autodl-market-watch.js --min-gb 80
```

### All options

```
--gpu <names>       Filter by GPU model (comma-separated, fuzzy match)
--backend <name>    Browser backend: agent-browser or browser-use (auto-detected)
--min-gb <n>        Minimum VRAM in GB (only when --gpu is not set). Default: 80
--min-cards <n>     Minimum idle card count. Default: 4
--watch <sec>       Poll every N seconds
--profile <name>    Chrome profile name. Default: "Default"
--json              Output raw JSON
--debug             Print raw API response sample
```

### npm scripts

```bash
npm start          # --gpu "RTX PRO 6000,H800"
npm run watch      # same, polling every 15s
npm run help       # show help
```

## First-time login

If your Chrome profile hasn't logged into AutoDL yet:

```bash
# Use whichever backend you have installed
agent-browser --profile Default open https://www.autodl.com/market/list
# or
browser-use --profile Default open https://www.autodl.com/market/list
```

Complete the login in the Chrome window that opens, then re-run the script.

## Example output

```
[2026/4/5 15:30:00] RTX PRO 6000, H800 / 4卡及以上，共 12 条
GPU候选: RTX PRO 6000, H800
┌─────────┬────────┬────────────────┬───────┬──────┬─────┬──────────────┬─────────────────┬──────┬───────────────┐
│ (index) │ region │ gpu            │ cards │ free │ mem │ yuan_per_hour│ cpu             │ tags │ id            │
├─────────┼────────┼────────────────┼───────┼──────┼─────┼──────────────┼─────────────────┼──────┼───────────────┤
│    0    │ 西北B  │ RTX PRO 6000   │   9   │  8   │ 96G │    7.97      │ Xeon 8470Q      │      │ abc123...     │
│    1    │ 西北B  │ H800           │   8   │  5   │ 80G │    9.35      │ Xeon 8458P      │      │ def456...     │
└─────────┴────────┴────────────────┴───────┴──────┴─────┴──────────────┴─────────────────┴──────┴───────────────┘
```

## Project structure

```
bin/autodl-market-watch.js      Entry point: arg parsing, backend detection, main loop
lib/api-script.js               Injected browser JS for API calls
lib/normalize.js                Data mapping and deduplication
lib/output.js                   Help text, table formatting, error messages
lib/backends/browser-use.js     browser-use CLI adapter
lib/backends/agent-browser.js   agent-browser CLI adapter
```

## GPU filtering details

When using `--min-gb`, the script queries AutoDL's `/api/v1/machine/gpu_type` endpoint, which returns `gpu_memory` in **bytes**. For example:

| GPU | gpu_memory (bytes) | Size |
|---|---|---|
| RTX PRO 6000 | 103,079,215,104 | 96 GiB |
| H20-NVLink | 103,079,215,104 | 96 GiB |
| H800 | 85,899,345,920 | 80 GiB |
| A800-80GB-NVLink | 85,899,345,920 | 80 GiB |
| A800-80GB | 85,899,345,920 | 80 GiB |

So `--min-gb 80` matches all 5 types above. Use `--gpu` for precise control.

## License

MIT
