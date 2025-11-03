import type { Page } from 'puppeteer';
import type { ProductInfo, RunOptions } from '../ozon-parser.service';
import type { Browser } from 'puppeteer';
import { Logger } from '@nestjs/common';
import { waitForHeadfulBrowser } from './browser-utils';

const logger = new Logger('ScenarioUtils');

export async function navigateWithAnchor(
  page: Page,
  targetUrl: string,
  timeout: number,
): Promise<void> {
  await page.goto('about:blank', {
    waitUntil: 'domcontentloaded',
    timeout,
  });
  await new Promise((resolve) => setTimeout(resolve, 1_000));

  await page.evaluate((url) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
  }, targetUrl);

  try {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout });
  } catch (error) {
    logger.warn(
      `Timed out waiting for anchor navigation (${targetUrl}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function buildSimpleInfo(
  page: Page,
  url: string,
): Promise<ProductInfo> {
  const title = await page.title();

  return {
    title: title || url,
    url,
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
}

export interface BrowserContext {
  browser: import('puppeteer').Browser;
  ownsBrowser: boolean;
}

export interface ScenarioResult {
  info: ProductInfo;
  browser: import('puppeteer').Browser;
  ownsBrowser: boolean;
}

export async function cleanupBrowser({
  browser,
  ownsBrowser,
}: {
  browser: import('puppeteer').Browser;
  ownsBrowser: boolean;
}): Promise<void> {
  if (!browser.connected) {
    return;
  }

  if (ownsBrowser) {
    await browser.close();
  } else {
    void browser.disconnect();
  }
}

export async function finishSimpleScenario({
  browser,
  ownsBrowser,
  options,
}: {
  browser: Browser;
  ownsBrowser: boolean;
  options: RunOptions;
}): Promise<void> {
  if (
    ownsBrowser &&
    options.headless === false &&
    options.keepBrowserOpen &&
    options.scenario === 'parseProduct'
  ) {
    await waitForHeadfulBrowser(browser);
  }

  if (!browser.connected) {
    return;
  }

  if (options.scenario !== 'parseProduct') {
    return;
  }

  if (ownsBrowser) {
    await browser.close();
  } else {
    void browser.disconnect();
  }
}
