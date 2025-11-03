import type { Page } from 'puppeteer';
import type { ParserOptions, ProductInfo } from '../ozon-parser.service';
import { acquireBrowser, waitForHeadfulBrowser } from './browser-utils';
import { navigateWithAnchor } from './scenario-utils';
import {
  normalizeProductInfo,
  waitForUserSignal,
  type EvaluationResult,
} from './parse-product-utils';
import { Logger } from '@nestjs/common';

const logger = new Logger('ParseProductScenario');

export async function parseProduct(
  options: ParserOptions,
): Promise<ProductInfo> {
  const { browser, ownsBrowser } = await acquireBrowser(options);

  try {
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

    await navigateWithAnchor(typedPage, options.url, timeout);

    const evaluatePage = async (): Promise<EvaluationResult> =>
      typedPage.evaluate((): EvaluationResult => {
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

        const jsonLdNodes = parseJsonLd().flatMap((node) =>
          flattenJsonLd(node),
        );

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
        };

        return result;
      });

    let evaluation = await evaluatePage();

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
        await typedPage.waitForNavigation({
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
      url: options.url,
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
