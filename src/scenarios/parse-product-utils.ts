import type { ProductInfo } from '../ozon-parser.service';

export interface EvaluationResult {
  isChallenge: boolean;
  challengeToken: string | null;
  heading: string | null;
  priceText: string | null;
  product: Record<string, unknown> | null;
  breadcrumbs: string[];
  rawJsonLd?: unknown[];
}

export function waitForUserSignal(): Promise<void> {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => setTimeout(resolve, 30_000));
  }

  return new Promise<void>((resolve) => {
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

function toString(input: unknown): string | null {
  if (typeof input === 'string' && input.length > 0) {
    return input;
  }
  return null;
}

function toNumber(input: unknown): number | null {
  if (typeof input === 'number') {
    return input;
  }
  if (typeof input === 'string') {
    const cleaned = input.replace(/[^\d.,]/g, '').replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractFirst<T>(input: unknown): T | null {
  if (Array.isArray(input)) {
    return input.length > 0 ? (input[0] as T) : null;
  }
  return input as T;
}

function extractStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => toString(item))
      .filter((item): item is string => Boolean(item));
  }
  const single = toString(input);
  return single ? [single] : [];
}

function extractBrand(brand: unknown): string | null {
  if (!brand) return null;

  if (typeof brand === 'string') {
    return brand.trim() || null;
  }

  if (Array.isArray(brand)) {
    for (const item of brand) {
      const name = extractBrand(item);
      if (name) return name;
    }
    return null;
  }

  if (typeof brand === 'object') {
    const record = brand as Record<string, unknown>;
    return toString(record['name']);
  }

  return null;
}

function extractSeller(seller: unknown): string | null {
  if (!seller) return null;

  if (typeof seller === 'string') {
    return seller.trim() || null;
  }

  if (Array.isArray(seller)) {
    for (const item of seller) {
      const name = extractSeller(item);
      if (name) return name;
    }
    return null;
  }

  if (typeof seller === 'object') {
    const record = seller as Record<string, unknown>;
    return toString(record['name']);
  }

  return null;
}

function detectCurrencySymbol(priceText: string | null): string | null {
  if (!priceText) return null;
  if (priceText.includes('₽')) return 'RUB';
  if (priceText.includes('$')) return 'USD';
  if (priceText.includes('€')) return 'EUR';
  return null;
}

export function normalizeProductInfo({
  evaluation,
  url,
}: {
  evaluation: EvaluationResult;
  url: string;
}): ProductInfo {
  const product = evaluation.product ?? {};

  const offers = extractFirst<Record<string, unknown>>(product['offers']);
  const aggregateRating = extractFirst<Record<string, unknown>>(
    product['aggregateRating'],
  );
  const images = extractStringArray(product['image']);

  const priceValue = toNumber(offers?.price ?? evaluation.priceText);

  const info: ProductInfo = {
    title: toString(product['name']) ?? evaluation.heading ?? 'Unknown product',
    url,
    sku: toString(product['sku']) ?? toString(product['mpn']) ?? null,
    brand: extractBrand(product['brand']),
    description: toString(product['description']),
    price: {
      value: priceValue,
      currency:
        toString(offers?.priceCurrency) ??
        detectCurrencySymbol(evaluation.priceText),
      displayText: evaluation.priceText,
      availability: toString(offers?.availability),
    },
    rating: aggregateRating
      ? {
          value: toNumber(aggregateRating['ratingValue']),
          reviewCount: toNumber(
            aggregateRating['reviewCount'] ?? aggregateRating['ratingCount'],
          ),
        }
      : null,
    seller: extractSeller(offers?.seller),
    breadcrumbs: evaluation.breadcrumbs,
    images,
    rawPriceText: evaluation.priceText,
  };

  return info;
}
