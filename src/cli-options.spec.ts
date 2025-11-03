import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_URL,
  parseCli,
  formatHelpMessage,
} from './cli-options';

describe('parseCli', () => {
  it('returns defaults when no arguments are provided', () => {
    const { options, helpRequested } = parseCli([], {} as NodeJS.ProcessEnv);

    expect(helpRequested).toBe(false);
    expect(options).toMatchObject({
      url: DEFAULT_PRODUCT_URL,
      output: 'text',
      headless: true,
      verbose: false,
    });
  });

  it('sets helpRequested when --help is used', () => {
    const result = parseCli(['--help'], {} as NodeJS.ProcessEnv);

    expect(result.helpRequested).toBe(true);
  });

  it('overrides defaults from CLI flags and environment variables', () => {
    const env = {
      OZON_PRODUCT_URL: 'https://example.com/product/1',
      OUTPUT: 'json',
      HEADLESS: 'false',
      OZON_TIMEOUT: '15000',
    } satisfies NodeJS.ProcessEnv;

    const { options } = parseCli(
      ['--url', 'https://override', '--timeout', '20000'],
      env,
    );

    expect(options).toMatchObject({
      url: 'https://override',
      output: 'json',
      headless: false,
      timeoutMs: 20000,
    });
  });

  it('throws on unknown flags', () => {
    expect(() => parseCli(['--unknown'], {} as NodeJS.ProcessEnv)).toThrow(
      /Unknown argument/i,
    );
  });
});

describe('formatHelpMessage', () => {
  it('includes the default URL', () => {
    const help = formatHelpMessage();
    expect(help).toContain(DEFAULT_PRODUCT_URL);
  });
});
