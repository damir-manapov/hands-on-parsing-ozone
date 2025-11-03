import { URL } from 'node:url';
import type { RunOptions, ProductInfo } from '../ozon-parser.service';
import { acquireBrowser } from './browser-utils';
import {
  navigateWithAnchor,
  buildSimpleInfo,
  finishSimpleScenario,
} from './scenario-utils';
import type { Page } from 'puppeteer';

export async function openFirstProductFromRoot(
  options: RunOptions,
): Promise<ProductInfo> {
  const { browser, ownsBrowser } = await acquireBrowser(options);

  try {
    const page = await browser.newPage();
    const typedPage = page as unknown as Page;

    const timeout = options.timeoutMs ?? 60_000;
    typedPage.setDefaultNavigationTimeout(timeout);
    typedPage.setDefaultTimeout(timeout);

    if (options.proxyUsername || options.proxyPassword) {
      await typedPage.authenticate({
        username: options.proxyUsername ?? '',
        password: options.proxyPassword ?? '',
      });
    }

    const rootUrl = new URL(options.url).origin;
    await navigateWithAnchor(typedPage, rootUrl, timeout);

    const productUrl = await typedPage.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>(
        'a[href*="/product/"]',
      );
      return link?.href ?? null;
    });

    if (!productUrl) {
      throw new Error('Could not find a product link on the root page.');
    }

    await navigateWithAnchor(typedPage, productUrl, timeout);

    const info = await buildSimpleInfo(typedPage, productUrl);

    await finishSimpleScenario({ browser, ownsBrowser, options });
    return info;
  } catch (error) {
    if (ownsBrowser && browser.connected) {
      await browser.close().catch(() => undefined);
    } else if (browser.connected) {
      void browser.disconnect();
    }
    throw error;
  }
}
