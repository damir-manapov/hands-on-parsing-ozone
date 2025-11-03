type ListOptions = {
  server: string;
  token?: string;
  verbose: boolean;
};

type FolderSummary = {
  id: string;
  name?: string;
};

type FolderResponse = {
  id: unknown;
  name?: unknown;
  folder_name?: unknown;
};

type ProfileResponse = {
  id: unknown;
  name?: unknown;
  profile_name?: unknown;
};

function parseListArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): ListOptions {
  const options: Partial<ListOptions> = {
    server: env.ANTIDETECT_SERVER ?? 'https://v1.empr.cloud',
    token: env.ANTIDETECT_TOKEN,
    verbose: env.VERBOSE === '1' || env.VERBOSE === 'true',
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
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
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

  return {
    server: options.server ?? 'https://v1.empr.cloud',
    token: options.token,
    verbose: options.verbose ?? false,
  } satisfies ListOptions;
}

function printListHelp(): void {
  console.log(`List antidetect folders and profiles

Usage:
  yarn list:profiles --token <api-token> [--server <url>]

Options:
  -t, --token <token>   API token (optional)
  -s, --server <url>    API base url (default: https://v1.empr.cloud)
  -h, --help            Show this help message

Environment variables:
  ANTIDETECT_SERVER   Default server url
  ANTIDETECT_TOKEN    API token
`);
}

async function fetchJson<T>(
  url: URL,
  token: string | undefined,
  verbose: boolean,
): Promise<T> {
  if (verbose) {
    console.log(`GET ${url.toString()}`);
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers['X-Token'] = token;
  }

  if (verbose && Object.keys(headers).length > 0) {
    console.log('Headers:', headers);
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Request to ${url.toString()} failed (${response.status} ${response.statusText}): ${text}`,
    );
  }

  const text = await response.text();
  try {
    const payload = JSON.parse(text) as T;
    if (verbose) {
      console.log('Response payload:', JSON.stringify(payload, null, 2));
    }
    return payload;
  } catch (error) {
    if (verbose) {
      console.error('Failed to parse response JSON. Raw body:', text);
    }
    throw error;
  }
}

function normalizeFolder(entry: FolderResponse): FolderSummary | null {
  if (!entry || typeof entry !== 'object') return null;
  const {
    id,
    name,
    folder_name: folderName,
  } = entry as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) return null;

  return {
    id,
    name:
      typeof name === 'string' && name.length > 0
        ? name
        : typeof folderName === 'string' && folderName.length > 0
          ? folderName
          : undefined,
  } satisfies FolderSummary;
}

function normalizeProfile(
  entry: ProfileResponse,
): { id: string; name?: string } | null {
  if (!entry || typeof entry !== 'object') return null;
  const {
    id,
    name,
    profile_name: profileName,
  } = entry as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) return null;

  return {
    id,
    name:
      typeof name === 'string' && name.length > 0
        ? name
        : typeof profileName === 'string' && profileName.length > 0
          ? profileName
          : undefined,
  };
}

async function listProfiles(options: ListOptions): Promise<void> {
  const foldersUrl = new URL('/api/v1/folders', options.server);
  const foldersRaw = await fetchJson<unknown>(
    foldersUrl,
    options.token,
    options.verbose,
  );

  const folderEntries = extractArray(foldersRaw, 'data');
  const folders = folderEntries
    .map((entry) => normalizeFolder(entry as FolderResponse))
    .filter(Boolean);

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
    const profilesRaw = await fetchJson<unknown>(
      profilesUrl,
      options.token,
      options.verbose,
    );
    const profileEntries = extractArray(profilesRaw, 'items');

    const profiles = profileEntries
      .map((entry) => normalizeProfile(entry as ProfileResponse))
      .filter(Boolean);

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

function extractArray(payload: unknown, field?: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;

    if (field && Array.isArray(record[field])) {
      return record[field] as unknown[];
    }

    if (Array.isArray(record.items)) {
      return record.items as unknown[];
    }

    const data = record.data;
    if (Array.isArray(data)) {
      return data as unknown[];
    }

    if (data && typeof data === 'object') {
      return extractArray(data, field);
    }
  }

  return [];
}
