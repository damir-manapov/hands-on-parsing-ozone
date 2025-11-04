import { URL } from 'node:url';
import type { ParserOptions, ProductInfo } from '../ozon-parser.service';
import {
  acquireBrowser,
  wireBrowserConsole,
  waitForHeadfulBrowser,
} from './browser-utils';
import { navigateWithAnchor } from './scenario-utils';
import {
  normalizeProductInfo,
  waitForUserSignal,
  type EvaluationResult,
} from './parse-product-utils';
import type { Page } from 'puppeteer';
import { Logger } from '@nestjs/common';

const logger = new Logger('ParseFirstProductFromRootScenario');

export async function parseFirstProductFromRoot(
  options: ParserOptions,
): Promise<ProductInfo> {
  const { browser, ownsBrowser } = await acquireBrowser(options);

  try {
    // Wire console for all existing and future pages
    await wireBrowserConsole(browser);

    const page = await browser.newPage();
    const typedPage = page as unknown as Page;

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    if (options.proxyUsername || options.proxyPassword) {
      await typedPage.authenticate({
        username: options.proxyUsername ?? '',
        password: options.proxyPassword ?? '',
      });
    }

    const timeout = options.timeoutMs ?? 60_000;
    typedPage.setDefaultNavigationTimeout(timeout);
    typedPage.setDefaultTimeout(timeout);

    const rootUrl = new URL(options.url).origin;
    console.log(`rootUrl: ${rootUrl}`);

    // Navigate to root page - returns the new page
    const rootPage = await navigateWithAnchor(typedPage, rootUrl, timeout);

    if (!rootPage) {
      throw new Error(`Failed to navigate to root page: ${rootUrl}`);
    }

    // Additional wait for page to be fully interactive
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    // Find first product link
    const productUrl = await rootPage.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>(
        'a[href*="/product/"]',
      );
      return link?.href ?? null;
    });

    if (!productUrl) {
      const currentUrl = rootPage.url();
      throw new Error(
        `Could not find a product link on the root page (${currentUrl}).`,
      );
    }

    console.log(`Found product URL: ${productUrl}`);

    // Navigate to product page - returns the new page
    const productPage = await navigateWithAnchor(rootPage, productUrl, timeout);

    if (!productPage) {
      throw new Error(`Failed to navigate to product page: ${productUrl}`);
    }

    // Parse the product page (same logic as parseProduct)
    const evaluatePage = async (): Promise<EvaluationResult> =>
      productPage.evaluate((): EvaluationResult => {
        const toArray = <T>(value: unknown): T[] => {
          if (Array.isArray(value)) {
            return value.filter(
              (item): item is T => item !== undefined && item !== null,
            );
          }

          if (value === undefined || value === null) {
            return [];
          }

          return [value as T];
        };

        const parseJsonLd = (): unknown[] => {
          const scripts = Array.from(
            document.querySelectorAll('script[type="application/ld+json"]'),
          );

          const nodes: unknown[] = [];

          for (const script of scripts) {
            const raw = script.textContent?.trim();

            if (!raw) continue;

            try {
              nodes.push(JSON.parse(raw));
              continue;
            } catch {
              // ignore and try to fix invalid JSON-LD formatting below
            }

            try {
              const normalized = raw
                .replace(/\s{2,}/g, ' ')
                .replace(/\n/g, ' ')
                .replace(/\r/g, ' ')
                .trim();
              nodes.push(JSON.parse(normalized));
            } catch {
              // still invalid; skip silently
            }
          }

          return nodes;
        };

        const flattenJsonLd = (input: unknown): Record<string, unknown>[] => {
          if (!input) return [];

          if (Array.isArray(input)) {
            return input.flatMap((item) => flattenJsonLd(item));
          }

          if (typeof input === 'object') {
            const record = input as Record<string, unknown>;
            if (record['@graph']) {
              return flattenJsonLd(record['@graph']);
            }

            return [record];
          }

          return [];
        };

        const rawJsonLd = parseJsonLd();
        const jsonLdNodes = rawJsonLd.flatMap((node) => flattenJsonLd(node));

        const productNode =
          jsonLdNodes.find(
            (node) =>
              typeof node === 'object' &&
              node !== null &&
              node['@type'] === 'Product',
          ) ?? null;

        const breadcrumbs = jsonLdNodes
          .filter(
            (node) =>
              typeof node === 'object' &&
              node !== null &&
              node['@type'] === 'BreadcrumbList',
          )
          .flatMap((node) => {
            const record = node;
            const elements = toArray<Record<string, unknown>>(
              record.itemListElement,
            );

            return elements
              .map((element) => {
                const nested = element.item as
                  | Record<string, unknown>
                  | undefined;
                const candidate = element.name ?? nested?.name;

                return typeof candidate === 'string' ? candidate : null;
              })
              .filter((item): item is string => Boolean(item));
          });

        const heading =
          document
            .querySelector('[data-widget="webProductHeading"] h1')
            ?.textContent?.trim() ??
          document.querySelector('h1')?.textContent?.trim() ??
          null;

        const priceRoot =
          document.querySelector('[data-widget="webPrice"]') ??
          document.querySelector('[data-widget="webSale"]');

        const priceText = priceRoot
          ? (priceRoot.textContent?.replace(/\s+/g, ' ').trim() ?? null)
          : null;

        const result: EvaluationResult = {
          isChallenge:
            document.title?.toLowerCase().includes('antibot') ?? false,
          challengeToken:
            (document.getElementById('challenge') as HTMLInputElement | null)
              ?.value ?? null,
          heading,
          priceText,
          product: productNode,
          breadcrumbs,
          rawJsonLd,
        };

        return result;
      });

    let evaluation = await evaluatePage();

    // Log raw JSON-LD data for debugging
    if (evaluation.rawJsonLd && evaluation.rawJsonLd.length > 0) {
      console.log('\n📋 Raw JSON-LD Data:');
      console.log('='.repeat(80));
      console.log(JSON.stringify(evaluation.rawJsonLd, null, 2));
      console.log('='.repeat(80) + '\n');
    } else {
      console.log('\n⚠️  No JSON-LD data found on this page\n');
    }

    if (evaluation.isChallenge) {
      const details = evaluation.challengeToken
        ? `Encountered Ozon antibot challenge (token ${evaluation.challengeToken}).`
        : 'Encountered Ozon antibot challenge.';

      if (options.headless !== false) {
        throw new Error(
          `${details} Try running with residential proxies, solving the challenge in a browser and reusing cookies, or slowing down navigation.`,
        );
      }

      logger.warn(
        `${details} Solve it manually in the opened browser, then press Enter here to retry.`,
      );
      await waitForUserSignal();

      try {
        await productPage.waitForNavigation({
          waitUntil: 'domcontentloaded',
          timeout,
        });
      } catch {
        // ignore navigation timeout; we'll re-evaluate regardless
      }

      evaluation = await evaluatePage();

      if (evaluation.isChallenge) {
        throw new Error(
          `${details} Still active after manual retry. Try re-running once the challenge is fully cleared.`,
        );
      }
    }

    return normalizeProductInfo({
      evaluation,
      url: productUrl,
    });
  } finally {
    if (ownsBrowser && options.keepBrowserOpen && options.headless === false) {
      await waitForHeadfulBrowser(browser);
    }

    if (ownsBrowser) {
      if (browser.connected) {
        await browser.close();
      }
    } else if (browser.connected) {
      void browser.disconnect();
    }
  }
}
