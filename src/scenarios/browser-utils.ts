import { request as httpRequest } from 'node:http';
import puppeteer from 'puppeteer-extra';
import type { Browser } from 'puppeteer';
import type { ParserOptions } from '../ozon-parser.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('BrowserUtils');

export async function acquireBrowser(
  options: ParserOptions,
): Promise<{ browser: Browser; ownsBrowser: boolean }> {
  const { headless, proxy, connectEndpoint, connectPort } = options;

  if (connectEndpoint || connectPort !== undefined) {
    const endpoint =
      connectEndpoint ?? (await resolveEndpointFromPort(connectPort!));

    if (!endpoint) {
      throw new Error(
        `Unable to resolve WebSocket endpoint from port ${connectPort}. Ensure the browser exposes /json/version.`,
      );
    }

    logger.log(`Connecting to existing browser at ${endpoint}`);
    const browser = await puppeteer.connect({
      browserWSEndpoint: endpoint,
      defaultViewport: null,
    });
    return { browser, ownsBrowser: false };
  }

  const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
  if (proxy) {
    launchArgs.push(`--proxy-server=${proxy}`);
  }

  const browser = await puppeteer.launch({
    headless: headless === false ? false : true,
    args: launchArgs,
  });

  return { browser, ownsBrowser: true };
}

async function resolveEndpointFromPort(port: number): Promise<string | null> {
  return new Promise<string>((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: '/json/version',
        method: 'GET',
        timeout: 5_000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(
            new Error(
              `Received status ${res.statusCode} when fetching /json/version from port ${port}.`,
            ),
          );
          return;
        }

        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw) as {
              webSocketDebuggerUrl?: unknown;
            };
            const endpoint = parsed.webSocketDebuggerUrl;
            if (typeof endpoint !== 'string' || endpoint.length === 0) {
              reject(
                new Error(
                  `Missing webSocketDebuggerUrl in response from port ${port}.`,
                ),
              );
              return;
            }

            resolve(endpoint);
          } catch (error) {
            reject(
              new Error(
                `Failed to parse /json/version response from port ${port}: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        });
      },
    );

    req.on('error', (error) => {
      reject(
        new Error(
          `Unable to reach browser on port ${port}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });

    req.on('timeout', () => {
      req.destroy(
        new Error(`Timed out fetching /json/version from port ${port}`),
      );
    });

    req.end();
  }).catch((error) => {
    logger.error(error instanceof Error ? error.message : String(error));
    return null;
  });
}

export async function waitForHeadfulBrowser(browser: Browser): Promise<void> {
  logger.log(
    'Headful mode enabled. Interact with the browser window. Press Enter here (or close the browser) to continue.',
  );

  await new Promise<void>((resolve) => {
    let settled = false;
    let fallbackTimer: NodeJS.Timeout | undefined;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;

      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }

      if (process.stdin.isTTY) {
        process.stdin.pause();
      }

      resolve();
    };

    browser.once('disconnected', () => finish());

    if (process.stdin.isTTY) {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => finish());
    } else {
      fallbackTimer = setTimeout(() => {
        if (browser.connected) {
          logger.warn(
            'Non-interactive terminal detected. Auto-closing browser after 2 minutes.',
          );
        }
        finish();
      }, 120_000);
      fallbackTimer.unref?.();
    }
  });
}
