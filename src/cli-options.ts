export const DEFAULT_PRODUCT_URL =
  'https://www.ozon.ru/product/kedy-adidas-sportswear-grand-court-base-2-0-1066650955/';

export type OutputFormat = 'text' | 'json';

export interface CliOptions {
  url: string;
  output: OutputFormat;
  headless: boolean;
  timeoutMs?: number;
  verbose: boolean;
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
  -v, --verbose          Print stack traces on error
  -h, --help             Show this help message

Environment variables:
  OZON_PRODUCT_URL       Default product URL
  OUTPUT                 Default output format ('json' | 'text')
  HEADLESS               Set to 'false' to disable headless mode
  OZON_TIMEOUT           Default timeout in milliseconds
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
  const options: CliOptions = {
    url: env.OZON_PRODUCT_URL ?? DEFAULT_PRODUCT_URL,
    output: env.OUTPUT === 'json' ? 'json' : 'text',
    headless: !['false', '0'].includes((env.HEADLESS ?? '').toLowerCase()),
    timeoutMs: parseNumber(env.OZON_TIMEOUT),
    verbose: false,
  };

  let helpRequested = false;

  const ensureValue = (index: number, flag: string): string => {
    const value = argv[index];
    if (!value || value.startsWith('-')) {
      throw new Error(`Expected value after ${flag}`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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
      case '--no-headless':
        options.headless = false;
        break;
      case '--headless':
        options.headless = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
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
      'Missing product URL. Provide it via --url or OZON_PRODUCT_URL',
    );
  }

  return { options, helpRequested };
}
