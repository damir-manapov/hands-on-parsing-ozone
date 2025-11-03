import { Injectable, Logger } from '@nestjs/common';
import { request as httpRequest } from 'node:http';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser } from 'puppeteer';

puppeteer.use(StealthPlugin());

export interface ProductPrice {
  value: number | null;
  currency: string | null;
  displayText: string | null;
  availability: string | null;
}

export interface ProductRating {
  value: number | null;
  reviewCount: number | null;
}

export interface ProductInfo {
  title: string;
  url: string;
  sku: string | null;
  brand: string | null;
  description: string | null;
  price: ProductPrice;
  rating: ProductRating | null;
  seller: string | null;
  breadcrumbs: string[];
  images: string[];
  rawPriceText: string | null;
}

export interface ParserOptions {
  url: string;
  headless?: boolean;
  timeoutMs?: number;
  keepBrowserOpen?: boolean;
  proxy?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  connectEndpoint?: string;
  connectPort?: number;
  checkByGoogle?: boolean;
  openProductPageOnly?: boolean;
  openRootPage?: boolean;
}

export interface RunOptions extends ParserOptions {
  output: 'text' | 'json';
}

interface EvaluationResult {
  isChallenge: boolean;
  challengeToken: string | null;
  heading: string | null;
  priceText: string | null;
  product: Record<string, unknown> | null;
  breadcrumbs: string[];
}

@Injectable()
export class OzonParserService {
  private readonly logger = new Logger(OzonParserService.name);

  async run(options: RunOptions): Promise<ProductInfo> {
    if (options.checkByGoogle) {
      const info = await this.performGoogleCheck(options);
      if (options.output === 'json') {
        console.log(
          JSON.stringify(
            {
              success: true,
              title: info.title,
              url: info.url,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`✅ Google reachable (${info.title})`);
      }

      return info;
    }

    if (options.openRootPage) {
      const info = await this.openRootPage(options);

      if (options.output === 'json') {
        console.log(
          JSON.stringify(
            {
              success: true,
              title: info.title,
              url: info.url,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`✅ Opened site root (${info.title})`);
      }

      return info;
    }

    if (options.openProductPageOnly) {
      const info = await this.openSimplePage(options.url, options);
      if (options.output === 'json') {
        console.log(
          JSON.stringify(
            {
              success: true,
              title: info.title,
              url: info.url,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`✅ Opened product page (${info.title})`);
      }

      return info;
    }

    const info = await this.parseProduct(options);

    if (options.output === 'json') {
      console.log(JSON.stringify(info, null, 2));
    } else {
      this.printHumanReadable(info);
    }

    return info;
  }

  async parseProduct(options: ParserOptions): Promise<ProductInfo> {
    const { browser, ownsBrowser } = await this.acquireBrowser(options);

    try {
      const page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      });

      if (options.proxyUsername || options.proxyPassword) {
        await page.authenticate({
          username: options.proxyUsername ?? '',
          password: options.proxyPassword ?? '',
        });
      }

      const timeout = options.timeoutMs ?? 60_000;
      page.setDefaultNavigationTimeout(timeout);
      page.setDefaultTimeout(timeout);

      await page.goto(options.url, {
        waitUntil: 'networkidle2',
        timeout,
      });

      const evaluatePage = async (): Promise<EvaluationResult> =>
        page.evaluate((): EvaluationResult => {
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

        this.logger.warn(
          `${details} Solve it manually in the opened browser, then press Enter here to retry.`,
        );
        await this.waitForUserSignal();

        try {
          await page.waitForNavigation({
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

      return this.normalizeProductInfo({
        evaluation,
        url: options.url,
      });
    } finally {
      if (
        ownsBrowser &&
        options.keepBrowserOpen &&
        options.headless === false
      ) {
        await this.waitForHeadfulBrowser(browser);
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

  private async openSimplePage(
    targetUrl: string,
    options: ParserOptions,
  ): Promise<ProductInfo> {
    const { browser, ownsBrowser } = await this.acquireBrowser(options);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const page = await browser.newPage();

      if (options.proxyUsername || options.proxyPassword) {
        await page.authenticate({
          username: options.proxyUsername ?? '',
          password: options.proxyPassword ?? '',
        });
      }

      const timeout = options.timeoutMs ?? 60_000;
      page.setDefaultNavigationTimeout(timeout);
      page.setDefaultTimeout(timeout);

      await page.goto('about:blank');
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
        await page.waitForNavigation({
          waitUntil: 'domcontentloaded',
          timeout,
        });
      } catch (error) {
        this.logger.warn(
          `Timed out waiting for page to load via anchor (${targetUrl}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const title = await page.title();

      return {
        title: title || targetUrl,
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
      if (
        ownsBrowser &&
        options.keepBrowserOpen &&
        options.headless === false
      ) {
        await this.waitForHeadfulBrowser(browser);
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

  private async openProductPage(options: ParserOptions): Promise<ProductInfo> {
    return this.openSimplePage(options.url, options);
  }

  private async openRootPage(options: ParserOptions): Promise<ProductInfo> {
    const origin = new URL(options.url).origin;
    return this.openSimplePage(origin, options);
  }

  private async performGoogleCheck(
    options: ParserOptions,
  ): Promise<ProductInfo> {
    const { browser, ownsBrowser } = await this.acquireBrowser(options);

    try {
      const page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      });

      if (options.proxyUsername || options.proxyPassword) {
        await page.authenticate({
          username: options.proxyUsername ?? '',
          password: options.proxyPassword ?? '',
        });
      }

      const timeout = options.timeoutMs ?? 30_000;
      page.setDefaultNavigationTimeout(timeout);
      page.setDefaultTimeout(timeout);

      const targetUrl = 'https://www.google.com/';
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      try {
        await page.waitForSelector('input[name="q"]', { timeout: 10_000 });
      } catch (error) {
        this.logger.warn(
          `Google check loaded but search box not found: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const title = (await page.title()) || 'Google';

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
      if (
        ownsBrowser &&
        options.keepBrowserOpen &&
        options.headless === false
      ) {
        await this.waitForHeadfulBrowser(browser);
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

  private async waitForHeadfulBrowser(browser: Browser): Promise<void> {
    this.logger.log(
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
            this.logger.warn(
              'Non-interactive terminal detected. Auto-closing browser after 2 minutes.',
            );
          }
          finish();
        }, 120_000);
        fallbackTimer.unref?.();
      }
    });
  }

  private async waitForUserSignal(): Promise<void> {
    if (!process.stdin.isTTY) {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      return;
    }

    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      const onData = () => {
        process.stdin.off('data', onData);
        process.stdin.pause();
        resolve();
      };
      process.stdin.on('data', onData);
    });
  }

  private async acquireBrowser({
    headless,
    proxy,
    connectEndpoint,
    connectPort,
  }: ParserOptions): Promise<{ browser: Browser; ownsBrowser: boolean }> {
    if (connectEndpoint || connectPort !== undefined) {
      const endpoint =
        connectEndpoint ?? (await this.resolveEndpointFromPort(connectPort!));

      if (!endpoint) {
        throw new Error(
          `Unable to resolve WebSocket endpoint from port ${connectPort}. Ensure the browser exposes /json/version.`,
        );
      }

      this.logger.log(`Connecting to existing browser at ${endpoint}`);
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

  private async resolveEndpointFromPort(port: number): Promise<string | null> {
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
      this.logger.error(error instanceof Error ? error.message : String(error));
      return null;
    });
  }

  private normalizeProductInfo({
    evaluation,
    url,
  }: {
    evaluation: EvaluationResult;
    url: string;
  }): ProductInfo {
    const product = evaluation.product ?? {};

    const offers = this.extractFirst<Record<string, unknown>>(
      product['offers'],
    );
    const aggregateRating = this.extractFirst<Record<string, unknown>>(
      product['aggregateRating'],
    );
    const images = this.extractStringArray(product['image']);

    const priceValue = this.toNumber(offers?.price ?? evaluation.priceText);

    const info: ProductInfo = {
      title:
        this.toString(product['name']) ??
        evaluation.heading ??
        'Unknown product',
      url,
      sku:
        this.toString(product['sku']) ?? this.toString(product['mpn']) ?? null,
      brand: this.extractBrand(product['brand']),
      description: this.toString(product['description']),
      price: {
        value: priceValue,
        currency:
          this.toString(offers?.priceCurrency) ??
          this.detectCurrencySymbol(evaluation.priceText),
        displayText: evaluation.priceText,
        availability: this.toString(offers?.availability),
      },
      rating: aggregateRating
        ? {
            value: this.toNumber(aggregateRating['ratingValue']),
            reviewCount: this.toNumber(
              aggregateRating['reviewCount'] ?? aggregateRating['ratingCount'],
            ),
          }
        : null,
      seller: this.extractSeller(offers?.seller),
      breadcrumbs: evaluation.breadcrumbs,
      images,
      rawPriceText: evaluation.priceText,
    };

    return info;
  }

  private printHumanReadable(info: ProductInfo): void {
    console.log('🛍️  Ozon Product Card');

    console.log('----------------------------------------');

    console.log(`Title:       ${info.title}`);

    console.log(`URL:         ${info.url}`);

    if (info.price.displayText || info.price.value) {
      const priceLine =
        info.price.displayText ??
        (info.price.value !== null
          ? `${info.price.value} ${info.price.currency ?? ''}`.trim()
          : 'n/a');

      console.log(`Price:       ${priceLine}`);
    }

    if (info.price.availability) {
      console.log(`Availability:${this.padValue(info.price.availability)}`);
    }

    if (info.rating) {
      const ratingLine = `${info.rating.value ?? 'n/a'} (${info.rating.reviewCount ?? '0'} reviews)`;

      console.log(`Rating:      ${ratingLine}`);
    }

    if (info.brand) {
      console.log(`Brand:       ${info.brand}`);
    }

    if (info.seller) {
      console.log(`Seller:      ${info.seller}`);
    }

    if (info.sku) {
      console.log(`SKU:         ${info.sku}`);
    }

    if (info.breadcrumbs.length > 0) {
      console.log(`Breadcrumbs: ${info.breadcrumbs.join(' › ')}`);
    }

    if (info.images.length > 0) {
      console.log('Images:');
      for (const image of info.images.slice(0, 5)) {
        console.log(`  - ${image}`);
      }

      if (info.images.length > 5) {
        console.log(`  … ${info.images.length - 5} more`);
      }
    }

    if (info.description) {
      console.log('\nDescription:');

      console.log(this.truncate(info.description, 400));
    }
  }

  private truncate(value: string, limit: number): string {
    if (value.length <= limit) return value;
    return `${value.slice(0, limit - 3)}...`;
  }

  private padValue(value: string): string {
    const trimmed = value.trim();
    return trimmed ? ` ${trimmed}` : trimmed;
  }

  private extractBrand(brand: unknown): string | null {
    if (!brand) return null;

    if (typeof brand === 'string') {
      return brand.trim() || null;
    }

    if (Array.isArray(brand)) {
      for (const item of brand) {
        const name = this.extractBrand(item);
        if (name) return name;
      }
      return null;
    }

    if (typeof brand === 'object') {
      const record = brand as Record<string, unknown>;
      return this.toString(record['name']);
    }

    return null;
  }

  private extractSeller(seller: unknown): string | null {
    if (!seller) return null;

    if (typeof seller === 'string') {
      return seller.trim() || null;
    }

    if (Array.isArray(seller)) {
      for (const item of seller) {
        const name = this.extractSeller(item);
        if (name) return name;
      }
      return null;
    }

    if (typeof seller === 'object') {
      const record = seller as Record<string, unknown>;
      return (
        this.toString(record['name']) ?? this.toString(record['sellerName'])
      );
    }

    return null;
  }

  private extractFirst<T>(value: unknown): T | null {
    if (Array.isArray(value)) {
      return (
        (value.find((item) => item !== undefined && item !== null) as
          | T
          | undefined) ?? null
      );
    }

    if (value === undefined || value === null) {
      return null;
    }

    return value as T;
  }

  private extractStringArray(value: unknown): string[] {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value
        .map((item) => this.toString(item))
        .filter((item): item is string => Boolean(item));
    }

    const candidate = this.toString(value);
    return candidate ? [candidate] : [];
  }

  private detectCurrencySymbol(value: string | null): string | null {
    if (!value) return null;

    const match = value.match(/[₽₸₴₾₼₮₽£€$¥]/u);
    return match ? match[0] : null;
  }

  private toString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : null;
    }

    return null;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.');
      if (!normalized) return null;

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }
}
