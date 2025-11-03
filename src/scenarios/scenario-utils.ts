import type { Page, Target } from 'puppeteer';
import type { ProductInfo, RunOptions } from '../ozon-parser.service';
import type { Browser } from 'puppeteer';
import { Logger } from '@nestjs/common';
import { waitForHeadfulBrowser } from './browser-utils';

const logger = new Logger('ScenarioUtils');

export async function navigateWithAnchor(
  page: Page,
  targetUrl: string,
  timeout: number,
): Promise<Page | null> {
  const browser = page.browser();

  // optional fresh context like typed URL
  try {
    await page.goto('about:blank', {
      waitUntil: 'domcontentloaded',
      timeout,
    });
  } catch (e) {
    logger.warn(`about:blank pre-nav failed (continuing): ${String(e)}`);
  }

  let resolveTarget: (t: Target) => void;
  let rejectTarget: (e: Error) => void;

  const newTargetPromise = new Promise<Target>((resolve, reject) => {
    resolveTarget = resolve;
    rejectTarget = reject;
  });

  const onTarget = (t: Target) => {
    if (String(t.type()) === 'page') {
      browser.off('targetcreated', onTarget);
      resolveTarget(t);
    }
  };

  browser.on('targetcreated', onTarget);

  // timeout handler
  const timer = setTimeout(() => {
    browser.off('targetcreated', onTarget);
    rejectTarget(new Error('Timed out waiting for new tab'));
  }, timeout);

  // open link via real DOM click
  await page.evaluate((u: string) => {
    const a = document.createElement('a');
    a.href = u;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
  }, targetUrl);

  let newPage: Page | null = null;

  try {
    const target = await newTargetPromise;
    clearTimeout(timer);

    newPage = await target.page();
    if (!newPage) throw new Error('New target has no page');
  } catch (e) {
    logger.warn(`Failed to capture tab for ${targetUrl}: ${String(e)}`);
    return null;
  }

  try {
    await newPage.bringToFront();
  } catch {
    // Ignore if bringToFront fails
  }

  // robust DOM load wait
  try {
    await newPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout });
  } catch {
    try {
      await newPage.waitForFunction(
        () =>
          document.readyState === 'interactive' ||
          document.readyState === 'complete',
        { timeout },
      );
    } catch (e) {
      logger.warn(`Timeout waiting DOM on ${targetUrl}: ${String(e)}`);
    }
  }

  return newPage;
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
