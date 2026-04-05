# autodl-market-watch

CLI tool to monitor GPU availability on the [AutoDL](https://www.autodl.com) marketplace.

Uses [browser-use](https://github.com/nicepkg/browser-use) to reuse your local Chrome login session, then queries AutoDL's internal APIs to check real-time GPU inventory.

## How it works

```
browser-use (headless Chrome) ──► autodl.com
    │
    ├── GET  /api/v1/machine/gpu_type   ← list all GPU types
    └── POST /api/v1/machine/search     ← search available machines
```

1. Launches (or reuses) a `browser-use` session with your Chrome profile
2. Navigates to the AutoDL market page to establish auth context
3. Runs in-page JavaScript to call AutoDL's APIs with your login cookies
4. Filters results by GPU model or VRAM size, and minimum idle card count
5. Prints a formatted table to the terminal

## Prerequisites

- **Node.js** >= 18
- **[browser-use](https://github.com/nicepkg/browser-use)** CLI installed and working
- **Google Chrome** with a profile that's logged into AutoDL

Verify your setup:

```bash
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
│    0    │ 西北A  │ RTX PRO 6000   │   8   │  8   │ 96G │    12.50     │ Intel Xeon 8480+│      │ abc123...     │
│    1    │ 华东B  │ H800           │   4   │  4   │ 80G │    15.00     │ Intel Xeon 8480+│      │ def456...     │
└─────────┴────────┴────────────────┴───────┴──────┴─────┴──────────────┴─────────────────┴──────┴───────────────┘
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
