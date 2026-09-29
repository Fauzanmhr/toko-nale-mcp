export interface StorePrices {
  price: string;
  regular_price: string;
  sale_price: string;
  price_range: { min_amount: string; max_amount: string } | null;
  currency_code: string;
  currency_symbol: string;
  currency_minor_unit: number;
  currency_decimal_separator: string;
  currency_thousand_separator: string;
  currency_prefix: string;
  currency_suffix: string;
}

export interface StoreImage {
  id: number;
  src: string;
  thumbnail: string;
  name: string;
  alt: string;
}

export interface StoreTerm {
  id: number;
  name: string;
  slug: string;
  link?: string;
  permalink?: string;
  count?: number;
  parent?: number;
}

export interface StoreProductAttribute {
  id: number;
  name: string;
  taxonomy: string | null;
  has_variations: boolean;
  terms: StoreTerm[];
}

export interface StoreProduct {
  id: number;
  name: string;
  slug: string;
  parent: number;
  type: string;
  permalink: string;
  sku: string;
  short_description: string;
  description: string;
  on_sale: boolean;
  prices: StorePrices;
  average_rating: string;
  review_count: number;
  images: StoreImage[];
  categories: StoreTerm[];
  tags: StoreTerm[];
  brands: StoreTerm[];
  attributes: StoreProductAttribute[] | undefined;
  variations: number[];
  grouped_products: number[];
  has_options: boolean;
  is_purchasable: boolean;
  is_in_stock: boolean;
  is_on_backorder: boolean;
  low_stock_remaining: number | null;
  stock_availability: { text: string; class: string };
  weight: string;
  dimensions: { length: string; width: string; height: string };
  formatted_weight: string;
  formatted_dimensions: string;
  add_to_cart: { minimum: number; maximum: number; multiple_of: number };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  times: "\u00d7",
  deg: "\u00b0",
  euro: "\u20ac",
  pound: "\u00a3",
  yen: "\u00a5",
  trade: "\u2122",
  copy: "\u00a9",
  reg: "\u00ae",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(hexadecimal ? entity.slice(2) : entity.slice(1), hexadecimal ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  const flattened = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|li|tr|h[1-6]|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(flattened)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}\u2026`;
}

export function formatAmount(amount: string, prices: StorePrices): string {
  const minorUnit = Number.isFinite(prices.currency_minor_unit) ? prices.currency_minor_unit : 0;
  const prefix = prices.currency_prefix ?? "";
  const suffix = prices.currency_suffix ?? "";

  if (amount.trim() === "") return "";

  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return `${prefix}${amount}${suffix}`;

  const fixed = (numeric / 10 ** minorUnit).toFixed(minorUnit);
  const [whole = "0", fraction] = fixed.split(".");
  const separator = prices.currency_thousand_separator ?? ",";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, () => separator);
  const decimals = fraction ? `${prices.currency_decimal_separator ?? "."}${fraction}` : "";

  return `${prefix}${grouped}${decimals}${suffix}`;
}

function termNames(terms: StoreTerm[] | undefined): string[] {
  return (terms ?? []).map((term) => decodeEntities(term.name));
}

export function productBrand(product: StoreProduct): string | null {
  const brandAttribute = (product.attributes ?? []).find(
    (attribute) => attribute.taxonomy === "pa_brand" || attribute.name.toLowerCase() === "brand",
  );
  const brand = brandAttribute?.terms?.[0];
  return brand ? decodeEntities(brand.name) : null;
}

export interface ProductSummary {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  type: string;
  url: string;
  price: string;
  price_minor: string;
  currency: string;
  on_sale: boolean;
  regular_price: string | null;
  sale_price: string | null;
  is_in_stock: boolean;
  stock_status: string | null;
  low_stock_remaining: number | null;
  average_rating: number;
  review_count: number;
  brand: string | null;
  categories: string[];
  tags: string[];
  image: string | null;
  short_description: string;
  has_options: boolean;
}

export function summarizeProduct(product: StoreProduct): ProductSummary {
  const prices = product.prices;
  const onSale = Boolean(product.on_sale);

  return {
    id: product.id,
    name: decodeEntities(product.name),
    slug: product.slug,
    sku: product.sku ? product.sku : null,
    type: product.type,
    url: product.permalink,
    price: formatAmount(prices.price, prices),
    price_minor: prices.price,
    currency: prices.currency_code,
    on_sale: onSale,
    regular_price: onSale ? formatAmount(prices.regular_price, prices) : null,
    sale_price: onSale ? formatAmount(prices.sale_price, prices) : null,
    is_in_stock: Boolean(product.is_in_stock),
    stock_status: product.stock_availability?.class || null,
    low_stock_remaining: product.low_stock_remaining ?? null,
    average_rating: Number(product.average_rating) || 0,
    review_count: product.review_count ?? 0,
    brand: productBrand(product),
    categories: termNames(product.categories),
    tags: termNames(product.tags),
    image: product.images?.[0]?.src ?? null,
    short_description: truncate(stripHtml(product.short_description), 300),
    has_options: Boolean(product.has_options),
  };
}

export interface ProductDetail extends ProductSummary {
  description: string;
  description_truncated: boolean;
  attributes: { name: string; terms: string[] }[];
  gallery: string[];
  dimensions: string | null;
  weight: string | null;
  variation_ids: number[];
  grouped_product_ids: number[];
  is_purchasable: boolean;
  is_on_backorder: boolean;
  min_order_quantity: number;
  max_order_quantity: number;
}

const MAX_DESCRIPTION_LENGTH = 4000;

export function describeProduct(product: StoreProduct): ProductDetail {
  const description = stripHtml(product.description);
  const prices = product.prices;

  return {
    ...summarizeProduct(product),
    description: truncate(description, MAX_DESCRIPTION_LENGTH),
    description_truncated: description.length > MAX_DESCRIPTION_LENGTH,
    attributes: (product.attributes ?? []).map((attribute) => ({
      name: decodeEntities(attribute.name),
      terms: termNames(attribute.terms),
    })),
    gallery: (product.images ?? []).map((image) => image.src),
    dimensions: product.formatted_dimensions || formatDimensions(product.dimensions),
    weight: product.formatted_weight || (product.weight ? `${product.weight}` : null),
    variation_ids: product.variations ?? [],
    grouped_product_ids: product.grouped_products ?? [],
    is_purchasable: Boolean(product.is_purchasable),
    is_on_backorder: Boolean(product.is_on_backorder),
    min_order_quantity: product.add_to_cart?.minimum ?? 1,
    max_order_quantity: product.add_to_cart?.maximum ?? 0,
    price_minor: prices.price,
  };
}

function formatDimensions(dimensions: { length: string; width: string; height: string } | undefined): string | null {
  if (!dimensions) return null;
  const parts = [dimensions.length, dimensions.width, dimensions.height].filter((part) => Boolean(part));
  return parts.length > 0 ? parts.join(" x ") : null;
}

export function summarizeTerm(term: StoreTerm): { id: number; name: string; slug: string; parent?: number; url?: string } {
  const summary: { id: number; name: string; slug: string; parent?: number; url?: string } = {
    id: term.id,
    name: decodeEntities(term.name),
    slug: term.slug,
  };
  if (typeof term.parent === "number") summary.parent = term.parent;
  const url = term.link ?? term.permalink;
  if (url) summary.url = url;
  return summary;
}
