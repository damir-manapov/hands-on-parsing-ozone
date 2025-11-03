type RunningOptions = {
  server: string;
  token: string;
};

type RunningProfile = {
  folderId?: string;
  profileId?: string;
  profileName?: string;
  wsEndpoint?: string;
};

function parseRunningArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): RunningOptions {
  const options: Partial<RunningOptions> = {
    server: env.ANTIDETECT_SERVER ?? 'http://127.0.0.1:3030',
    token: env.ANTIDETECT_TOKEN,
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
        options.server = ensureValue(index + 1, arg);
        index += 1;
        break;
      }
      case '--token':
      case '-t': {
        options.token = ensureValue(index + 1, arg);
        index += 1;
        break;
      }
      case '--help':
      case '-h':
        printRunningHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }

  if (!options.token) {
    throw new Error(
      'Missing API token. Provide --token or ANTIDETECT_TOKEN env var.',
    );
  }

  return {
    server: options.server ?? 'http://127.0.0.1:3030',
    token: options.token,
  } satisfies RunningOptions;
}

function printRunningHelp(): void {
  console.log(`List running antidetect profiles

Usage:
  yarn list:running --token <api-token> [--server <url>]

Options:
  -t, --token <token>   API token (required)
  -s, --server <url>    API base url (default: http://127.0.0.1:3030)
  -h, --help            Show this help message

Environment variables:
  ANTIDETECT_SERVER   Default server url
  ANTIDETECT_TOKEN    API token
`);
}

async function fetchRunning(
  options: RunningOptions,
): Promise<RunningProfile[]> {
  const url = new URL('/list', options.server);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Token': options.token,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Request to ${url.toString()} failed (${response.status} ${response.statusText}): ${text}`,
    );
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((entry) => normalizeRunning(entry as Record<string, unknown>))
    .filter(Boolean) as RunningProfile[];
}

function normalizeRunning(
  entry: Record<string, unknown>,
): RunningProfile | null {
  const folderId = entry.folder_id ?? entry.folderId;
  const profileId = entry.profile_id ?? entry.profileId ?? entry.id;
  if (typeof profileId !== 'string' || profileId.length === 0) {
    return null;
  }

  const result: RunningProfile = {
    profileId,
  };

  if (typeof folderId === 'string' && folderId.length > 0) {
    result.folderId = folderId;
  }

  const name = entry.name ?? entry.profile_name;
  if (typeof name === 'string' && name.length > 0) {
    result.profileName = name;
  }

  const ws = entry.wsEndpoint ?? entry.websocket ?? entry.webSocketDebuggerUrl;
  if (typeof ws === 'string' && ws.length > 0) {
    result.wsEndpoint = ws;
  }

  return result;
}

async function listRunning(options: RunningOptions): Promise<void> {
  const running = await fetchRunning(options);

  if (running.length === 0) {
    console.log('No profiles currently running.');
    return;
  }

  for (const profile of running) {
    const details = [
      `Profile ${profile.profileId}`,
      profile.profileName ? `name: ${profile.profileName}` : null,
      profile.folderId ? `folder: ${profile.folderId}` : null,
      profile.wsEndpoint ? `ws: ${profile.wsEndpoint}` : null,
    ].filter(Boolean);

    console.log(`• ${details.join(' | ')}`);
  }
}

async function main(): Promise<void> {
  try {
    const options = parseRunningArgs(process.argv.slice(2));
    await listRunning(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to list running profiles: ${message}`);
    if (process.argv.includes('--verbose')) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

void main();
