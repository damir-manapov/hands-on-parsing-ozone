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
      checkByGoogle: false,
      openProductPageOnly: false,
      openRootPage: false,
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
      PARSER_CHECK_GOOGLE: 'true',
      PARSER_OPEN_PRODUCT_ONLY: 'true',
      PARSER_OPEN_ROOT_PAGE: 'true',
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
      checkByGoogle: true,
      openProductPageOnly: true,
      openRootPage: true,
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
      ],
      env,
    );

    expect(options.proxy).toBe('http://primary-proxy:8080');
    expect(options.proxyUsername).toBe('bob');
    expect(options.proxyPassword).toBe('hunter2');
    expect(options.connectPort).toBe(9333);
    expect(options.connectEndpoint).toBeUndefined();
  });

  it('enables google check via flag', () => {
    const { options } = parseCli(['--check-google'], {} as NodeJS.ProcessEnv);
    expect(options.checkByGoogle).toBe(true);
  });

  it('enables open product page via flag', () => {
    const { options } = parseCli(
      ['--open-product-page-only'],
      {} as NodeJS.ProcessEnv,
    );
    expect(options.openProductPageOnly).toBe(true);
  });

  it('enables open root page via flag', () => {
    const { options } = parseCli(['--open-root-page'], {} as NodeJS.ProcessEnv);
    expect(options.openRootPage).toBe(true);
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
          '--open-product-page-only',
          '--open-root-page',
        ],
      }),
    } satisfies NodeJS.ProcessEnv;

    const { options } = parseCli([], env);
    expect(options.headless).toBe(false);
    expect(options.keepBrowserOpen).toBe(true);
    expect(options.connectPort).toBe(9333);
    expect(options.connectEndpoint).toBeUndefined();
    expect(options.openProductPageOnly).toBe(true);
    expect(options.openRootPage).toBe(true);
  });

  it('recovers endpoint from npm_config_argv with equals syntax', () => {
    const env = {
      npm_config_argv: JSON.stringify({
        original: [
          'nest',
          'start',
          '--connect-endpoint=ws://127.0.0.1:9222/devtools/browser/xyz',
          '--open-root-page',
        ],
      }),
    } satisfies NodeJS.ProcessEnv;

    const { options } = parseCli([], env);
    expect(options.connectEndpoint).toBe(
      'ws://127.0.0.1:9222/devtools/browser/xyz',
    );
    expect(options.connectPort).toBeUndefined();
    expect(options.openRootPage).toBe(true);
  });

  it('respects --auto-close flag', () => {
    const { options } = parseCli(
      ['--no-headless', '--auto-close'],
      {} as NodeJS.ProcessEnv,
    );

    expect(options.headless).toBe(false);
    expect(options.keepBrowserOpen).toBe(false);
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
});

describe('formatHelpMessage', () => {
  it('includes the default URL', () => {
    const help = formatHelpMessage();
    expect(help).toContain(DEFAULT_PRODUCT_URL);
  });
});
