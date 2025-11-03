type LaunchOptions = {
  folderId: string;
  profileId: string;
  token: string;
  port: number;
  server: string;
};

function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): LaunchOptions {
  const options: Partial<LaunchOptions> = {
    server: env.ANTIDETECT_SERVER ?? 'http://127.0.0.1:3030',
    token: env.ANTIDETECT_TOKEN,
    port: env.ANTIDETECT_PORT ? Number(env.ANTIDETECT_PORT) : undefined,
    folderId: env.ANTIDETECT_FOLDER_ID,
    profileId: env.ANTIDETECT_PROFILE_ID,
  };

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
      case '--server':
      case '-s': {
        const value = ensureValue(index + 1, arg);
        options.server = value;
        index += 1;
        break;
      }
      case '--token':
      case '-t': {
        const value = ensureValue(index + 1, arg);
        options.token = value;
        index += 1;
        break;
      }
      case '--folder':
      case '-f': {
        const value = ensureValue(index + 1, arg);
        options.folderId = value;
        index += 1;
        break;
      }
      case '--profile':
      case '-p': {
        const value = ensureValue(index + 1, arg);
        options.profileId = value;
        index += 1;
        break;
      }
      case '--port':
      case '-P': {
        const value = ensureValue(index + 1, arg);
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
          throw new Error(`Invalid port value: ${value}. Choose 1024-65535.`);
        }
        options.port = parsed;
        index += 1;
        break;
      }
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }

  if (!options.folderId || !options.profileId) {
    throw new Error(
      'Missing folder or profile id. Provide --folder and --profile.',
    );
  }

  if (!options.token) {
    throw new Error(
      'Missing API token. Provide --token or ANTIDETECT_TOKEN env var.',
    );
  }

  if (!options.port) {
    throw new Error(
      'Missing remote debugging port. Provide --port or ANTIDETECT_PORT env var.',
    );
  }

  return {
    folderId: options.folderId,
    profileId: options.profileId,
    token: options.token,
    port: options.port,
    server: options.server ?? 'http://127.0.0.1:3030',
  } satisfies LaunchOptions;
}

function printHelp(): void {
  console.log(`Launch antidetect profile

Usage:
  yarn launch:profile --folder <id> --profile <id> --token <token> --port <port>

Options:
  -f, --folder <id>     Folder id that contains the profile
  -p, --profile <id>    Profile id to start
  -t, --token <token>   API token for the antidetect service
  -P, --port <port>     Remote debugging port (1024-65535)
  -s, --server <url>    API base url (default: http://127.0.0.1:3030)
  -h, --help            Show this help message

Environment variables:
  ANTIDETECT_SERVER       Default server url
  ANTIDETECT_TOKEN        API token
  ANTIDETECT_FOLDER_ID    Folder id
  ANTIDETECT_PROFILE_ID   Profile id
  ANTIDETECT_PORT         Remote debugging port
`);
}

async function launchProfile(options: LaunchOptions): Promise<void> {
  const url = new URL(
    `/start/${encodeURIComponent(options.folderId)}/${encodeURIComponent(options.profileId)}`,
    options.server,
  );

  const body = {
    args: [`--remote-debugging-port=${options.port}`],
  } satisfies Record<string, unknown>;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Token': options.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to launch profile (${response.status} ${response.statusText}): ${text}`,
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  console.log('Profile launch request accepted. Response:');
  console.log(JSON.stringify(payload, null, 2));
  console.log(
    `Remote debugging should be available on port ${options.port}. Run the parser with --connect-port ${options.port}.`,
  );
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    await launchProfile(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Launch failed: ${message}`);
    if (process.argv.includes('--verbose')) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

void main();
