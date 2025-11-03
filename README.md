# Hands-on Parsing Ozon

A NestJS-driven CLI that investigates how to extract structured data from an Ozon product page. The tool spins up a headless browser (via `puppeteer-extra` + stealth plugin), pulls the public product cart data, and prints the parsed result either as formatted text or JSON. The default target is the Adidas Grand Court Base 2.0 sneakers product page, but any public Ozon product URL can be supplied.

> ⚠️ Ozon protects its catalog with antibot challenges. The CLI tries to behave like a real browser but you may still hit a challenge. See [Handling antibot protection](#handling-antibot-protection).

## Prerequisites

- Node.js ≥ 20
- Yarn 1.x (`corepack enable` or install globally)

During the first run Puppeteer downloads a bundled Chromium build (~120 MB). Make sure outbound network access is allowed.

## Installation

```bash
yarn install
```

## Running the CLI

```bash
# Defaults to the Grand Court Base 2.0 card and pretty console output
yarn start

# Parse another product and print JSON
yarn start -- --url "https://www.ozon.ru/product/<slug>/<id>/" --json

# Increase timeout and open a visible browser for debugging
yarn start -- --timeout 90000 --no-headless
```

### CLI options

- `-u, --url <url>` – Ozon product page to parse (falls back to `PARSER_PRODUCT_URL` or the default Adidas link)
- `--json` / `--text` – select output format (text is default)
- `--timeout <ms>` – navigation timeout (default 60000)
- `--no-headless` / `--headless` – toggle headless Chromium
- `--auto-close` – close the browser automatically even when headful
- `--keep-browser-open` – force the browser to stay open until you press Enter
- `--proxy <url>` – route traffic through `http`, `https`, or `socks5` proxy
- `--proxy-username` / `--proxy-password` – provide proxy basic auth credentials
- `--connect-endpoint <ws>` – attach to an already running Chromium instance via WebSocket endpoint
- `--connect-port <port>` – resolve the WebSocket endpoint from `http://127.0.0.1:<port>/json/version`
- `-v, --verbose` – include stack traces on errors
- `-h, --help` – show usage help

When the browser is kept open, the CLI waits until you press Enter (or close the window) before shutting Chromium down. This makes it easier to solve antibot challenges manually.

### Environment variables

- `PARSER_PRODUCT_URL` – default product URL
- `PARSER_OUTPUT` – default output format (`json` or `text`)
- `PARSER_HEADLESS` – set to `false` to open a visible browser by default
- `PARSER_TIMEOUT` – default timeout in milliseconds
- `PARSER_PROXY` (or `HTTPS_PROXY`/`HTTP_PROXY`) – proxy URL used by default
- `PARSER_PROXY_USERNAME` / `PARSER_PROXY_PASSWORD` – proxy credentials
- `PARSER_CONNECT_ENDPOINT` – remote browser WebSocket endpoint
- `PARSER_CONNECT_PORT` – remote debugging port (used to fetch the endpoint)

### Proxy usage example

```bash
yarn start -- --proxy "socks5://proxy-host:9050" --proxy-username mylogin --proxy-password mypass
```

You can also set the corresponding `PARSER_PROXY*` environment variables to avoid passing secrets via CLI flags.

### Connecting to an existing Chromium instance

Many antidetect browsers expose the Chrome DevTools protocol. Start your profile with a debugging port, then either supply the raw WebSocket endpoint or the port itself:

```bash
# Launch profile via the bundled helper (requires API token)
yarn launch:profile --folder <folderId> --profile <profileId> --token <apiToken> --port 9222

# If you know the full ws:// URL
yarn start -- --connect-endpoint "ws://127.0.0.1:9222/devtools/browser/XXXX"

# If you only have the port (CLI will fetch /json/version automatically)
yarn start -- --connect-port 9222
```

Set `PARSER_CONNECT_ENDPOINT` or `PARSER_CONNECT_PORT` when you want these defaults applied automatically. The helper script also honours `ANTIDETECT_*` environment variables for server, token, folder, profile, and port.

### Listing available profiles

To audit what profiles exist on the antidetect service:

```bash
yarn list:profiles --token <apiToken>
```

Each folder (id and name) and its profiles (id and name) will be printed. Defaults can be supplied via `ANTIDETECT_SERVER` and `ANTIDETECT_TOKEN`.
If you omit `--server`, the script targets `http://127.0.0.1:3030` (same as the launch helper).

To inspect profiles that are already running:

```bash
yarn list:running --token <apiToken>
```

This prints the profile id, optional name, folder id, and websocket endpoint when available.

## Handling antibot protection

If the CLI reports an antibot challenge:

- Retry later or reduce request frequency
- Launch with `--no-headless` and solve the challenge manually to reuse cookies
- Run behind a residential proxy or reuse session cookies exported from a logged-in browser

Challenges are surfaced with their token so you can match them against Ozon’s support pages if needed.

## Development scripts

```bash
yarn typecheck  # TypeScript compile without emitting files
yarn build   # TypeScript build
yarn lint    # ESLint + Prettier integration
yarn test    # Vitest unit tests

./check.sh   # Format, lint, test, typecheck, audit, and check outdated deps
```

## Project structure

- `src/main.ts` – CLI entry point and argument parsing
- `src/ozon-parser.service.ts` – Puppeteer workflow and JSON-LD parsing logic
- `nest-cli.json`, `tsconfig*.json` – NestJS/TypeScript build config

## Output sample (text mode)

```text
🛍️  Ozon Product Card
----------------------------------------
Title:       Кеды Adidas Sportswear Grand Court Base 2.0
URL:         https://www.ozon.ru/product/kedy-adidas-sportswear-grand-court-base-2-0-1066650955/
Price:       7 999 ₽
Rating:      4.8 (1200 reviews)
Brand:       Adidas
Seller:      Ozon
Breadcrumbs: Спорт › Обувь › Кеды
Images:
  - https://cdn.ozone.ru/.../image1.jpg
  - https://cdn.ozone.ru/.../image2.jpg

Description:
Кеды Adidas Grand Court Base 2.0 — универсальная модель...
```

Actual output depends on what Ozon exposes in its JSON-LD payload and may differ from the example above.
