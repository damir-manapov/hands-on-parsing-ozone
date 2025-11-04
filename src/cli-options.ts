export const DEFAULT_PRODUCT_URL =
  'https://www.ozon.ru/product/kedy-adidas-sportswear-grand-court-base-2-0-1066650955/';

export type OutputFormat = 'text' | 'json';
export type CliScenario =
  | 'parseProduct'
  | 'openGoogle'
  | 'openProduct'
  | 'openRoot'
  | 'openFirstProductFromRoot'
  | 'parseFirstProductFromRoot';

export interface CliOptions {
  url: string;
  output: OutputFormat;
  headless: boolean;
  timeoutMs?: number;
  verbose: boolean;
  keepBrowserOpen: boolean;
  proxy?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  connectEndpoint?: string;
  connectPort?: number;
  scenario: CliScenario;
}

export interface CliParseResult {
  options: CliOptions;
  helpRequested: boolean;
}

const HELP_MESSAGE = `Usage: yarn start -- [options]

Options:
  -u, --url <url>        Product URL to parse (default: ${DEFAULT_PRODUCT_URL})
  --json                 Output JSON instead of formatted text
  --text                 Force formatted text output
  --timeout <ms>         Override navigation timeout (default: 60000)
  --no-headless          Disable headless mode (useful for debugging)
  --headless             Explicitly enable headless mode
  --auto-close           Close the browser automatically even in headful mode
  --keep-browser-open    Keep the browser open after finishing (for headless debugging)
  --proxy <url>          Forward traffic through an HTTP/HTTPS/SOCKS proxy
  --proxy-username <v>   Username for proxy authentication
  --proxy-password <v>   Password for proxy authentication
  --connect-endpoint <ws>  Connect to an existing browser via WebSocket endpoint
  --connect-port <port>    Resolve WebSocket endpoint from http://127.0.0.1:<port>/json/version
  --scenario <name>        Execution mode: 'parseProduct' (default), 'openGoogle', 'openProduct', 'openRoot', 'openFirstProductFromRoot', 'parseFirstProductFromRoot'
  -v, --verbose          Print stack traces on error
  -h, --help             Show this help message

Environment variables:
  PARSER_PRODUCT_URL     Default product URL
  PARSER_OUTPUT          Default output format ('json' | 'text')
  PARSER_HEADLESS        Set to 'false' to disable headless mode
  PARSER_TIMEOUT         Default timeout in milliseconds
  PARSER_PROXY           Proxy URL (fallback to HTTPS_PROXY / HTTP_PROXY)
  PARSER_PROXY_USERNAME  Proxy basic auth username
  PARSER_PROXY_PASSWORD  Proxy basic auth password
  PARSER_CONNECT_ENDPOINT  Browser WebSocket endpoint
  PARSER_CONNECT_PORT      Browser remote debugging port
  PARSER_SCENARIO          Default execution mode (same values as --scenario)
`;

export function formatHelpMessage(): string {
  return HELP_MESSAGE;
}

export function printHelp(): void {
  console.log(HELP_MESSAGE);
}

const parseNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
};

export function parseCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): CliParseResult {
  const headlessFromEnv = !['false', '0'].includes(
    (env.PARSER_HEADLESS ?? '').toLowerCase(),
  );

  const scenarioFromEnv = validateScenario(
    env.PARSER_SCENARIO ?? 'parseProduct',
  );

  const args = argv.filter((arg) => arg !== '--');

  const options: CliOptions = {
    url: env.PARSER_PRODUCT_URL ?? DEFAULT_PRODUCT_URL,
    output: env.PARSER_OUTPUT === 'json' ? 'json' : 'text',
    headless: headlessFromEnv,
    timeoutMs: parseNumber(env.PARSER_TIMEOUT),
    verbose: false,
    keepBrowserOpen: !headlessFromEnv,
    proxy: env.PARSER_PROXY ?? env.HTTPS_PROXY ?? env.HTTP_PROXY,
    proxyUsername: env.PARSER_PROXY_USERNAME,
    proxyPassword: env.PARSER_PROXY_PASSWORD,
    connectEndpoint: env.PARSER_CONNECT_ENDPOINT,
    connectPort: parseNumber(env.PARSER_CONNECT_PORT),
    scenario: scenarioFromEnv,
  };

  let helpRequested = false;

  const ensureValue = (index: number, flag: string): string => {
    const value = args[index];
    if (!value || value.startsWith('-')) {
      throw new Error(`Expected value after ${flag}`);
    }
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--help':
      case '-h':
        helpRequested = true;
        continue;
      case '--url':
      case '-u': {
        const value = ensureValue(index + 1, arg);
        options.url = value;
        index += 1;
        break;
      }
      case '--json':
        options.output = 'json';
        break;
      case '--text':
        options.output = 'text';
        break;
      case '--timeout': {
        const value = ensureValue(index + 1, arg);
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Invalid timeout value: ${value}`);
        }
        options.timeoutMs = parsed;
        index += 1;
        break;
      }
      case '--connect-endpoint': {
        const value = ensureValue(index + 1, arg);
        options.connectEndpoint = value;
        index += 1;
        break;
      }
      case '--connect-port': {
        const value = ensureValue(index + 1, arg);
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Invalid port value: ${value}`);
        }
        options.connectPort = parsed;
        index += 1;
        break;
      }
      case '--proxy': {
        const value = ensureValue(index + 1, arg);
        options.proxy = value;
        index += 1;
        break;
      }
      case '--proxy-username': {
        const value = ensureValue(index + 1, arg);
        options.proxyUsername = value;
        index += 1;
        break;
      }
      case '--proxy-password': {
        const value = ensureValue(index + 1, arg);
        options.proxyPassword = value;
        index += 1;
        break;
      }
      case '--no-headless':
        options.headless = false;
        options.keepBrowserOpen = true;
        break;
      case '--headless':
        options.headless = true;
        options.keepBrowserOpen = false;
        break;
      case '--auto-close':
        options.keepBrowserOpen = false;
        break;
      case '--keep-browser-open':
        options.keepBrowserOpen = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--scenario':
        options.scenario = validateScenario(ensureValue(index + 1, arg));
        index += 1;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown argument: ${arg}`);
        }

        if (!options.url || options.url === DEFAULT_PRODUCT_URL) {
          options.url = arg;
        } else if (
          options.timeoutMs === undefined &&
          Number.isFinite(Number(arg))
        ) {
          options.timeoutMs = Number(arg);
        } else {
          throw new Error(`Unexpected argument: ${arg}`);
        }
    }
  }

  if (!options.url) {
    throw new Error(
      'Missing product URL. Provide it via --url or PARSER_PRODUCT_URL',
    );
  }

  if (options.connectEndpoint && options.connectPort !== undefined) {
    throw new Error(
      'Provide either --connect-endpoint or --connect-port, not both.',
    );
  }

  const raw = env.npm_config_argv;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as {
        original?: unknown;
      };
      const original = Array.isArray(parsed.original)
        ? (parsed.original as unknown[]).map((value) =>
            typeof value === 'string' ? value : '',
          )
        : [];

      if (original.includes('--check-google')) {
        options.scenario = 'openGoogle';
      }

      if (original.includes('--open-product-page-only')) {
        options.scenario = 'openProduct';
      }

      if (original.includes('--open-root-page')) {
        options.scenario = 'openRoot';
      }

      if (
        !argv.includes('--no-headless') &&
        original.includes('--no-headless')
      ) {
        options.headless = false;
        options.keepBrowserOpen = true;
      }

      if (!argv.includes('--headless') && original.includes('--headless')) {
        options.headless = true;
        options.keepBrowserOpen = false;
      }

      if (!argv.includes('--auto-close') && original.includes('--auto-close')) {
        options.keepBrowserOpen = false;
      }

      if (
        !argv.includes('--keep-browser-open') &&
        original.includes('--keep-browser-open')
      ) {
        options.keepBrowserOpen = true;
      }

      if (!argv.includes('--verbose') && original.includes('--verbose')) {
        options.verbose = true;
      }

      const getValue = (flag: string, index: number): string | undefined => {
        const entry = original[index];
        if (!entry) return undefined;
        const [name, inline] = entry.split('=');
        if (name !== flag) return undefined;
        if (inline !== undefined && inline.length > 0) {
          return inline;
        }

        const next = original[index + 1];
        if (typeof next === 'string' && !next.startsWith('--')) {
          return next;
        }

        return undefined;
      };

      if (
        original.includes('--scenario') ||
        original.some((entry) => entry.startsWith('--scenario='))
      ) {
        for (let index = 0; index < original.length; index += 1) {
          const entry = original[index];
          if (!entry.startsWith('--scenario')) continue;
          const inline = entry.split('=')[1];
          const value = inline ?? getValue('--scenario', index);
          if (value) {
            options.scenario = validateScenario(value);
            break;
          }
        }
      }

      for (let index = 0; index < original.length; index += 1) {
        const entry = original[index];
        if (!entry.startsWith('--')) continue;

        switch (true) {
          case entry === '--connect-port':
          case entry.startsWith('--connect-port='):
            if (
              !args.includes('--connect-port') &&
              options.connectPort === undefined &&
              options.connectEndpoint === undefined
            ) {
              const value = getValue('--connect-port', index);
              if (value !== undefined) {
                const parsedPort = Number(value);
                if (Number.isFinite(parsedPort)) {
                  options.connectPort = parsedPort;
                }
              }
            }
            break;
          case entry === '--connect-endpoint':
          case entry.startsWith('--connect-endpoint='):
            if (
              !args.includes('--connect-endpoint') &&
              !options.connectEndpoint
            ) {
              const value = getValue('--connect-endpoint', index);
              if (value) {
                options.connectEndpoint = value;
                options.connectPort = undefined;
              }
            }
            break;
          case entry === '--proxy':
          case entry.startsWith('--proxy='):
            if (!args.includes('--proxy') && !options.proxy) {
              const value = getValue('--proxy', index);
              if (value) {
                options.proxy = value;
              }
            }
            break;
          case entry === '--proxy-username':
          case entry.startsWith('--proxy-username='):
            if (!args.includes('--proxy-username') && !options.proxyUsername) {
              const value = getValue('--proxy-username', index);
              if (value) {
                options.proxyUsername = value;
              }
            }
            break;
          case entry === '--proxy-password':
          case entry.startsWith('--proxy-password='):
            if (!args.includes('--proxy-password') && !options.proxyPassword) {
              const value = getValue('--proxy-password', index);
              if (value) {
                options.proxyPassword = value;
              }
            }
            break;
          case entry === '--timeout':
          case entry.startsWith('--timeout='):
            if (
              !args.includes('--timeout') &&
              options.timeoutMs === undefined
            ) {
              const value = getValue('--timeout', index);
              if (value !== undefined) {
                const parsedTimeout = Number(value);
                if (Number.isFinite(parsedTimeout)) {
                  options.timeoutMs = parsedTimeout;
                }
              }
            }
            break;
          case entry === '--url':
          case entry.startsWith('--url='):
            if (
              !args.includes('--url') &&
              options.url === DEFAULT_PRODUCT_URL
            ) {
              const value = getValue('--url', index);
              if (value) {
                options.url = value;
              }
            }
            break;
        }
      }
    } catch {
      // ignore malformed npm_config_argv
    }
  }

  if (
    options.scenario !== 'parseProduct' &&
    !args.includes('--keep-browser-open') &&
    !args.includes('--auto-close')
  ) {
    options.keepBrowserOpen = false;
  }

  return { options, helpRequested };
}

function validateScenario(value: string): CliScenario {
  switch (value) {
    case 'parseProduct':
    case 'openGoogle':
    case 'openProduct':
    case 'openRoot':
    case 'openFirstProductFromRoot':
    case 'parseFirstProductFromRoot':
      return value;
    default:
      throw new Error(
        `Unknown scenario: ${value}. Expected parseProduct | openGoogle | openProduct | openRoot | openFirstProductFromRoot | parseFirstProductFromRoot`,
      );
  }
}
