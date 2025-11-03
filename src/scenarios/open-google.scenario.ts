import type { Page } from 'puppeteer';
import type { ParserOptions, ProductInfo } from '../ozon-parser.service';
import { acquireBrowser } from './browser-utils';
import { navigateWithAnchor } from './scenario-utils';

export async function openGoogle(options: ParserOptions): Promise<ProductInfo> {
  const { browser, ownsBrowser } = await acquireBrowser(options);

  try {
    const page = await browser.newPage();
    const typedPage = page as unknown as Page;

    await typedPage.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    if (options.proxyUsername || options.proxyPassword) {
      await typedPage.authenticate({
        username: options.proxyUsername ?? '',
        password: options.proxyPassword ?? '',
      });
    }

    const timeout = options.timeoutMs ?? 30_000;
    typedPage.setDefaultNavigationTimeout(timeout);
    typedPage.setDefaultTimeout(timeout);

    const targetUrl = 'https://www.google.com/';
    await navigateWithAnchor(typedPage, targetUrl, timeout);

    try {
      await typedPage.waitForSelector('input[name="q"]', { timeout: 10_000 });
    } catch {
      // ignore if search box not found
    }

    const title = (await typedPage.title()) || 'Google';

    return {
      title,
      url: targetUrl,
      sku: null,
      brand: null,
      description: null,
      price: {
        value: null,
        currency: null,
        displayText: null,
        availability: null,
      },
      rating: null,
      seller: null,
      breadcrumbs: [],
      images: [],
      rawPriceText: null,
    } satisfies ProductInfo;
  } finally {
    if (ownsBrowser && browser.connected) {
      await browser.close();
    } else if (browser.connected) {
      void browser.disconnect();
    }
  }
}
