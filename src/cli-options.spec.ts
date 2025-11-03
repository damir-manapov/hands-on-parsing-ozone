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
      keepBrowserOpen: false,
      proxy: undefined,
      proxyUsername: undefined,
      proxyPassword: undefined,
      connectEndpoint: undefined,
      connectPort: undefined,
      scenario: 'parseProduct',
    });
  });

  it('sets helpRequested when --help is used', () => {
    const result = parseCli(['--help'], {} as NodeJS.ProcessEnv);

    expect(result.helpRequested).toBe(true);
  });

  it('overrides defaults from CLI flags and environment variables', () => {
    const env = {
      PARSER_PRODUCT_URL: 'https://example.com/product/1',
      PARSER_OUTPUT: 'json',
      PARSER_HEADLESS: 'false',
      PARSER_TIMEOUT: '15000',
      PARSER_PROXY: 'socks5://127.0.0.1:9050',
      PARSER_PROXY_USERNAME: 'alice',
      PARSER_PROXY_PASSWORD: 'secret',
      PARSER_CONNECT_ENDPOINT: 'ws://127.0.0.1:9222/devtools/browser/abc',
      PARSER_SCENARIO: 'openRoot',
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
      keepBrowserOpen: true,
      proxy: 'socks5://127.0.0.1:9050',
      proxyUsername: 'alice',
      proxyPassword: 'secret',
      connectEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
      connectPort: undefined,
      scenario: 'openRoot',
    });
  });

  it('prefers CLI proxy options over env defaults', () => {
    const env = {
      HTTPS_PROXY: 'http://fallback-proxy:8888',
    } satisfies NodeJS.ProcessEnv;

    const { options } = parseCli(
      [
        '--proxy',
        'http://primary-proxy:8080',
        '--proxy-username',
        'bob',
        '--proxy-password',
        'hunter2',
        '--connect-port',
        '9333',
        '--scenario',
        'openProduct',
      ],
      env,
    );

    expect(options.proxy).toBe('http://primary-proxy:8080');
    expect(options.proxyUsername).toBe('bob');
    expect(options.proxyPassword).toBe('hunter2');
    expect(options.connectPort).toBe(9333);
    expect(options.connectEndpoint).toBeUndefined();
    expect(options.scenario).toBe('openProduct');
  });

  it('sets scenario via flag', () => {
    const { options } = parseCli(
      ['--scenario', 'openGoogle'],
      {} as NodeJS.ProcessEnv,
    );
    expect(options.scenario).toBe('openGoogle');
  });

  it('throws when both connect endpoint and port provided', () => {
    expect(() =>
      parseCli(
        ['--connect-endpoint', 'ws://foo', '--connect-port', '9333'],
        {} as NodeJS.ProcessEnv,
      ),
    ).toThrow(/either --connect-endpoint or --connect-port/i);
  });

  it('throws on unknown flags', () => {
    expect(() => parseCli(['--unknown'], {} as NodeJS.ProcessEnv)).toThrow(
      /Unknown argument/i,
    );
  });

  it('recovers stripped flags from npm_config_argv', () => {
    const env = {
      npm_config_argv: JSON.stringify({
        original: [
          'nest',
          'start',
          '--no-headless',
          '--connect-port',
          '9333',
          '--scenario',
          'openRoot',
        ],
      }),
    } satisfies NodeJS.ProcessEnv;

    const { options } = parseCli([], env);
    expect(options.headless).toBe(false);
    expect(options.keepBrowserOpen).toBe(true);
    expect(options.connectPort).toBe(9333);
    expect(options.connectEndpoint).toBeUndefined();
    expect(options.scenario).toBe('openRoot');
  });

  it('recovers endpoint from npm_config_argv with equals syntax', () => {
    const env = {
      npm_config_argv: JSON.stringify({
        original: [
          'nest',
          'start',
          '--connect-endpoint=ws://127.0.0.1:9222/devtools/browser/xyz',
          '--scenario=openGoogle',
        ],
      }),
    } satisfies NodeJS.ProcessEnv;

    const { options } = parseCli([], env);
    expect(options.connectEndpoint).toBe(
      'ws://127.0.0.1:9222/devtools/browser/xyz',
    );
    expect(options.connectPort).toBeUndefined();
    expect(options.scenario).toBe('openGoogle');
  });

  it('rejects unknown scenarios', () => {
    expect(() =>
      parseCli(['--scenario', 'unsupported'], {} as NodeJS.ProcessEnv),
    ).toThrow(/Unknown scenario/);
  });
});

describe('formatHelpMessage', () => {
  it('includes the default URL', () => {
    const help = formatHelpMessage();
    expect(help).toContain(DEFAULT_PRODUCT_URL);
  });
});
