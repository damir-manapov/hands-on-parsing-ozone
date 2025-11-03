import type { RunOptions, ProductInfo } from '../ozon-parser.service';
import { acquireBrowser } from './browser-utils';
import {
  navigateWithAnchor,
  buildSimpleInfo,
  finishSimpleScenario,
} from './scenario-utils';
import type { Page } from 'puppeteer';

export async function openProduct(options: RunOptions): Promise<ProductInfo> {
  const { browser, ownsBrowser } = await acquireBrowser(options);

  try {
    const page = await browser.newPage();
    const typedPage = page as unknown as Page;

    const timeout = options.timeoutMs ?? 60_000;
    typedPage.setDefaultNavigationTimeout(timeout);
    typedPage.setDefaultTimeout(timeout);

    await navigateWithAnchor(typedPage, options.url, timeout);

    const info = await buildSimpleInfo(typedPage, options.url);

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
