import { URL } from 'node:url';
import type { RunOptions, ProductInfo } from '../ozon-parser.service';
import { acquireBrowser, wireBrowserConsole } from './browser-utils';
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
    // Wire console for all existing and future pages
    await wireBrowserConsole(browser);

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
    console.log(`rootUrl: ${rootUrl}`);

    // Use anchor navigation (antibot-friendly) - returns the new page
    const rootPage = await navigateWithAnchor(typedPage, rootUrl, timeout);

    if (!rootPage) {
      throw new Error(`Failed to navigate to root page: ${rootUrl}`);
    }

    // Additional wait for page to be fully interactive
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const currentUrl = rootPage.url();
    console.log(`Current page URL after navigation: ${currentUrl}`);

    console.log(`productUrl: start`);
    const productUrl = await rootPage.evaluate(() => {
      console.log('🔍 Starting product link search...');
      console.log(`Current URL: ${window.location.href}`);
      console.log(`Document ready state: ${document.readyState}`);

      const selector = 'a[href*="/product/"]';
      console.log(`Searching for selector: ${selector}`);

      const link = document.querySelector<HTMLAnchorElement>('a[href*="/product/"]');
      const result = link?.href ?? null;
      console.log(`Selected link: ${result ?? 'null'}`);
      return result;
    });
    console.log(`productUrl: ${productUrl}`);

    if (!productUrl) {
      const currentUrl = rootPage.url();
      throw new Error(
        `Could not find a product link on the root page (${currentUrl}). Tried xpath and CSS selector 'a[href*="/product/"]'.`,
      );
    }

    // Navigate to product page - returns the new page
    const productPage = await navigateWithAnchor(rootPage, productUrl, timeout);

    if (!productPage) {
      throw new Error(`Failed to navigate to product page: ${productUrl}`);
    }

    const info = await buildSimpleInfo(productPage, productUrl);

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
