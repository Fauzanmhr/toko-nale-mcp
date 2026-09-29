import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeEntities,
  describeProduct,
  formatAmount,
  productBrand,
  stripHtml,
  summarizeProduct,
  summarizeTerm,
  truncate,
} from "../dist/format.js";

const IDR_PRICES = {
  price: "10018",
  regular_price: "10545",
  sale_price: "10018",
  price_range: null,
  currency_code: "IDR",
  currency_symbol: "Rp",
  currency_minor_unit: 0,
  currency_decimal_separator: ",",
  currency_thousand_separator: ".",
  currency_prefix: "Rp",
  currency_suffix: "",
};

const USD_PRICES = {
  ...IDR_PRICES,
  currency_code: "USD",
  currency_symbol: "$",
  currency_minor_unit: 2,
  currency_decimal_separator: ".",
  currency_thousand_separator: ",",
  currency_prefix: "$",
};

function makeProduct(overrides = {}) {
  return {
    id: 55035,
    name: "Fiber Optic Cable ADSS 12 Core",
    slug: "fiber-optic-cable-adss-12-core",
    parent: 0,
    type: "simple",
    permalink: "https://toko.nale.co.id/produk/fiber-optic-cable-adss-12-core/",
    sku: "",
    short_description: "<p>Kabel <strong>fiber</strong> optik</p>",
    description: "<p>Deskripsi panjang</p><ul><li>Core 12</li></ul>",
    on_sale: false,
    prices: IDR_PRICES,
    average_rating: "0",
    review_count: 0,
    images: [{ id: 1, src: "https://img/1.jpg", thumbnail: "https://img/1-t.jpg", name: "1", alt: "" }],
    categories: [{ id: 94, name: "Cables &amp; Material Support", slug: "cables", link: "https://x/cables/" }],
    tags: [{ id: 80, name: "Home office", slug: "home-office" }],
    brands: [],
    attributes: [
      {
        id: 1,
        name: "Brand",
        taxonomy: "pa_brand",
        has_variations: false,
        terms: [{ id: 20, name: "Mikrotik", slug: "mikrotik" }],
      },
    ],
    variations: [],
    grouped_products: [],
    has_options: false,
    is_purchasable: true,
    is_in_stock: true,
    is_on_backorder: false,
    low_stock_remaining: null,
    stock_availability: { text: "Tersedia", class: "in-stock" },
    weight: "1.5",
    dimensions: { length: "10", width: "5", height: "2" },
    formatted_weight: "1,5 kg",
    formatted_dimensions: "10 x 5 x 2 cm",
    add_to_cart: { minimum: 1, maximum: 9999, multiple_of: 1 },
    ...overrides,
  };
}

test("formatAmount renders IDR minor-unit integers with thousand separators", () => {
  assert.equal(formatAmount("10018", IDR_PRICES), "Rp10.018");
  assert.equal(formatAmount("0", IDR_PRICES), "Rp0");
  assert.equal(formatAmount("3532028387", IDR_PRICES), "Rp3.532.028.387");
});

test("formatAmount honours decimal currencies", () => {
  assert.equal(formatAmount("123456", USD_PRICES), "$1,234.56");
});

test("formatAmount leaves unpriced products blank and passes through garbage", () => {
  assert.equal(formatAmount("", IDR_PRICES), "");
  assert.equal(formatAmount("   ", IDR_PRICES), "");
  assert.equal(formatAmount("abc", IDR_PRICES), "Rpabc");
});

test("decodeEntities resolves named and numeric entities", () => {
  assert.equal(decodeEntities("Mikrotik L41G &#8211; 2axD"), "Mikrotik L41G \u2013 2axD");
  assert.equal(decodeEntities("Cables &amp; Material"), "Cables & Material");
  assert.equal(decodeEntities("a&#038;b"), "a&b");
  assert.equal(decodeEntities("&unknown;"), "&unknown;");
});

test("stripHtml removes tags, keeps list structure and collapses whitespace", () => {
  assert.equal(stripHtml("<p>Kabel <strong>fiber</strong> optik</p>"), "Kabel fiber optik");
  assert.equal(stripHtml("<ul><li>One</li><li>Two</li></ul>"), "- One\n- Two");
  assert.equal(stripHtml("<script>alert(1)</script><p>Body</p>"), "Body");
  assert.equal(stripHtml(null), "");
});

test("truncate appends an ellipsis only when needed", () => {
  assert.equal(truncate("abc", 5), "abc");
  assert.equal(truncate("abcdef", 3), "abc\u2026");
});

test("summarizeProduct formats prices and decodes taxonomy names", () => {
  const summary = summarizeProduct(makeProduct());

  assert.equal(summary.price, "Rp10.018");
  assert.equal(summary.price_minor, "10018");
  assert.equal(summary.regular_price, null);
  assert.equal(summary.sale_price, null);
  assert.equal(summary.sku, null);
  assert.equal(summary.brand, "Mikrotik");
  assert.deepEqual(summary.categories, ["Cables & Material Support"]);
  assert.deepEqual(summary.tags, ["Home office"]);
  assert.equal(summary.short_description, "Kabel fiber optik");
  assert.equal(summary.stock_status, "in-stock");
  assert.equal(summary.image, "https://img/1.jpg");
});

test("summarizeProduct exposes sale prices only for discounted products", () => {
  const summary = summarizeProduct(makeProduct({ on_sale: true }));

  assert.equal(summary.on_sale, true);
  assert.equal(summary.regular_price, "Rp10.545");
  assert.equal(summary.sale_price, "Rp10.018");
});

test("summarizeProduct tolerates a missing attributes array", () => {
  const summary = summarizeProduct(makeProduct({ attributes: undefined }));
  assert.equal(summary.brand, null);
});

test("describeProduct adds description, attributes, gallery and logistics", () => {
  const detail = describeProduct(makeProduct());

  assert.equal(detail.description, "Deskripsi panjang\n- Core 12");
  assert.equal(detail.description_truncated, false);
  assert.deepEqual(detail.attributes, [{ name: "Brand", terms: ["Mikrotik"] }]);
  assert.deepEqual(detail.gallery, ["https://img/1.jpg"]);
  assert.equal(detail.dimensions, "10 x 5 x 2 cm");
  assert.equal(detail.weight, "1,5 kg");
  assert.deepEqual(detail.variation_ids, []);
  assert.equal(detail.min_order_quantity, 1);
});

test("describeProduct marks long descriptions as truncated", () => {
  const detail = describeProduct(makeProduct({ description: `<p>${"x".repeat(5000)}</p>` }));
  assert.equal(detail.description_truncated, true);
  assert.equal(detail.description.length, 4001);
});

test("productBrand reads the Brand attribute taxonomy", () => {
  assert.equal(productBrand(makeProduct()), "Mikrotik");
  assert.equal(productBrand(makeProduct({ attributes: [] })), null);
});

test("summarizeTerm keeps parent and prefers the permalink when there is no link", () => {
  assert.deepEqual(summarizeTerm({ id: 1353, name: "10 &amp; Series", slug: "s", count: 99, parent: 1337, permalink: "https://x/p/" }), {
    id: 1353,
    name: "10 & Series",
    slug: "s",
    parent: 1337,
    url: "https://x/p/",
  });
});
