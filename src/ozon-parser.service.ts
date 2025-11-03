import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { parseProduct as parseProductScenario } from './scenarios/parse-product.scenario';
import { openGoogle } from './scenarios/open-google.scenario';
import { openProduct } from './scenarios/open-product.scenario';
import { openRoot } from './scenarios/open-root.scenario';
import { openFirstProductFromRoot } from './scenarios/open-first-product-from-root.scenario';

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
}

export interface RunOptions extends ParserOptions {
  output: 'text' | 'json';
  scenario: import('./cli-options').CliScenario;
}

@Injectable()
export class OzonParserService {
  private readonly logger = new Logger(OzonParserService.name);

  async run(options: RunOptions): Promise<ProductInfo> {
    switch (options.scenario) {
      case 'openGoogle': {
        const info = await openGoogle(options);
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
      case 'openRoot': {
        const info = await openRoot(options);
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
      case 'openProduct': {
        const info = await openProduct(options);
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
      case 'openFirstProductFromRoot': {
        const info = await openFirstProductFromRoot(options);
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
          console.log(`✅ Opened first product (${info.title})`);
        }
        return info;
      }
      case 'parseProduct':
      default: {
        const info = await parseProductScenario(options);

        if (options.output === 'json') {
          console.log(JSON.stringify(info, null, 2));
        } else {
          this.printHumanReadable(info);
        }

        return info;
      }
    }
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
}
