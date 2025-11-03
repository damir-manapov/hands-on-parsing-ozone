type ListOptions = {
  server: string;
  token: string;
};

type FolderSummary = {
  id: string;
  name?: string;
};

type FolderResponse = {
  id: unknown;
  name?: unknown;
};

type ProfileResponse = {
  id: unknown;
  name?: unknown;
};

function parseListArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): ListOptions {
  const options: Partial<ListOptions> = {
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
        printListHelp();
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
  } satisfies ListOptions;
}

function printListHelp(): void {
  console.log(`List antidetect folders and profiles

Usage:
  yarn list:profiles --token <api-token> [--server <url>]

Options:
  -t, --token <token>   API token (required)
  -s, --server <url>    API base url (default: http://127.0.0.1:3030)
  -h, --help            Show this help message

Environment variables:
  ANTIDETECT_SERVER   Default server url
  ANTIDETECT_TOKEN    API token
`);
}

async function fetchJson<T>(input: string | URL, token: string): Promise<T> {
  const response = await fetch(input, {
    method: 'GET',
    headers: {
      'X-Token': token,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Request to ${input.toString()} failed (${response.status} ${response.statusText}): ${text}`,
    );
  }

  return (await response.json()) as T;
}

function normalizeFolder(entry: FolderResponse): FolderSummary | null {
  if (!entry || typeof entry !== 'object') return null;
  const { id, name } = entry as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) return null;

  return {
    id,
    name: typeof name === 'string' && name.length > 0 ? name : undefined,
  } satisfies FolderSummary;
}

function normalizeProfile(
  entry: ProfileResponse,
): { id: string; name?: string } | null {
  if (!entry || typeof entry !== 'object') return null;
  const { id, name } = entry as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) return null;

  return {
    id,
    name: typeof name === 'string' && name.length > 0 ? name : undefined,
  };
}

async function listProfiles(options: ListOptions): Promise<void> {
  const foldersUrl = new URL('/api/v1/folders', options.server);
  const foldersRaw = await fetchJson<unknown>(foldersUrl, options.token);

  const folders = Array.isArray(foldersRaw)
    ? foldersRaw
        .map((entry) => normalizeFolder(entry as FolderResponse))
        .filter(Boolean)
    : [];

  if (folders.length === 0) {
    console.log('No folders found.');
    return;
  }

  for (const folder of folders) {
    console.log(
      `📁 Folder ${folder!.id}${folder!.name ? ` (${folder!.name})` : ''}`,
    );

    const profilesUrl = new URL(
      `/api/v1/folders/${encodeURIComponent(folder!.id)}/profiles`,
      options.server,
    );
    const profilesRaw = await fetchJson<unknown>(profilesUrl, options.token);

    const profiles = Array.isArray(profilesRaw)
      ? profilesRaw
          .map((entry) => normalizeProfile(entry as ProfileResponse))
          .filter(Boolean)
      : [];

    if (profiles.length === 0) {
      console.log('  (no profiles)');
      continue;
    }

    for (const profile of profiles) {
      console.log(
        `  • ${profile!.id}${profile!.name ? ` (${profile!.name})` : ''}`,
      );
    }
  }
}

async function main(): Promise<void> {
  try {
    const options = parseListArgs(process.argv.slice(2));
    await listProfiles(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to list profiles: ${message}`);
    if (process.argv.includes('--verbose')) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

void main();
