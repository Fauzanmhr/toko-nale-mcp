import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

function payload(result) {
  const first = result.content?.[0];
  assert.equal(first?.type, "text", "expected a text content block");
  return JSON.parse(first.text);
}

const EXPECTED_TOOLS = [
  "get_product",
  "list_attribute_terms",
  "list_attributes",
  "list_categories",
  "list_product_reviews",
  "list_products",
  "list_tags",
];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  stderr: "pipe",
});
const client = new Client({ name: "smoke", version: "1.0.0" });

let failures = 0;
async function step(label, fn) {
  try {
    const detail = await fn();
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL ${label} — ${error.message}`);
  }
}

await client.connect(transport);
console.log("connected over stdio\n");

await step("tools/list exposes the browsing toolset", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, EXPECTED_TOOLS);
  assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true), "all tools should be read-only");
  assert.ok(tools.every((tool) => tool.description?.length > 40), "every tool needs a description");
  return `${names.length} tools`;
});

await step("list_products free-text search returns formatted IDR prices", async () => {
  const data = payload(await client.callTool({ name: "list_products", arguments: { search: "epson", per_page: 3 } }));
  assert.ok(data.products.length > 0, "expected matches for 'epson'");
  for (const product of data.products) {
    assert.ok(product.id > 0);
    assert.match(product.price, /^Rp[\d.]+$/, `unexpected price format: ${product.price}`);
    assert.ok(product.url.startsWith("https://toko.nale.co.id/"));
    assert.equal(typeof product.is_in_stock, "boolean");
  }
  assert.equal(data.pagination.total_results > 0, true);
  return `${data.pagination.total_results} matches, first: ${data.products[0].name} @ ${data.products[0].price}`;
});

await step("list_products filters by category id", async () => {
  const data = payload(await client.callTool({ name: "list_products", arguments: { category: 1337, per_page: 3 } }));
  assert.ok(data.products.length > 0, "expected products in category 1337");
  return `${data.products.length} shown of ${data.pagination.total_results}`;
});

await step("list_products sorts by price ascending and reports pagination", async () => {
  const data = payload(
    await client.callTool({ name: "list_products", arguments: { orderby: "price", order: "asc", per_page: 5 } }),
  );
  assert.equal(data.pagination.page, 1);
  assert.equal(data.pagination.has_more, true);
  assert.equal(data.pagination.next_page, 2);
  return `${data.pagination.total_pages} pages available`;
});

await step("list_products on an empty filter set returns a helpful note", async () => {
  const data = payload(await client.callTool({ name: "list_products", arguments: { search: "zzzz-no-such-product-zzzz" } }));
  assert.equal(data.products.length, 0);
  assert.ok(data.note, "expected an empty-results note");
  return "empty result handled";
});

await step("get_product by id returns a plain-text description", async () => {
  const product = payload(await client.callTool({ name: "get_product", arguments: { id: 88666 } }));
  assert.equal(product.id, 88666);
  assert.match(product.price, /^Rp/);
  assert.ok(product.description.length > 0, "expected a description");
  assert.ok(!product.description.includes("<"), "description should be stripped of HTML tags");
  assert.ok(Array.isArray(product.gallery));
  return `${product.name} — ${product.description.length} chars of description`;
});

await step("get_product by slug resolves the same product", async () => {
  const product = payload(
    await client.callTool({ name: "get_product", arguments: { slug: "epson-tm-t82x-pos-printer" } }),
  );
  assert.equal(product.id, 88666);
  return `slug resolved to id ${product.id}`;
});

await step("get_product rejects ambiguous or missing arguments", async () => {
  const missing = await client.callTool({ name: "get_product", arguments: {} });
  assert.equal(missing.isError, true);
  const both = await client.callTool({ name: "get_product", arguments: { id: 1, slug: "x" } });
  assert.equal(both.isError, true);
  return "validation enforced";
});

await step("get_product surfaces a clean error for an unknown slug", async () => {
  const result = await client.callTool({ name: "get_product", arguments: { slug: "definitely-not-a-product" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No product found/);
  return "unknown slug reported";
});

await step("list_products surfaces API validation errors clearly", async () => {
  const result = await client.callTool({ name: "list_products", arguments: { per_page: 100 } });
  assert.notEqual(result.isError, true);
  const bad = await client.callTool({ name: "list_products", arguments: { orderby: "nonsense" } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /orderby/);
  return "invalid enum rejected by both schema and API";
});

await step("list_categories walks the tree with counts", async () => {
  const data = payload(await client.callTool({ name: "list_categories", arguments: { search: "router", per_page: 5 } }));
  assert.ok(data.categories.length > 0);
  assert.ok(data.categories.every((category) => typeof category.product_count === "number"));
  return data.categories.map((category) => `${category.name}(${category.product_count})`).join(", ");
});

await step("list_tags returns slugs usable as a filter", async () => {
  const data = payload(await client.callTool({ name: "list_tags", arguments: { search: "cisco", per_page: 3 } }));
  assert.ok(data.tags.length > 0);
  assert.ok(data.tags.every((tag) => tag.slug.length > 0));
  return data.tags.map((tag) => tag.slug).join(", ");
});

await step("list_attributes + list_attribute_terms drill into brands", async () => {
  const attributes = payload(await client.callTool({ name: "list_attributes", arguments: {} }));
  const brand = attributes.attributes.find((attribute) => attribute.taxonomy === "pa_brand");
  assert.ok(brand, "expected a pa_brand attribute");
  const terms = payload(
    await client.callTool({ name: "list_attribute_terms", arguments: { attribute_id: brand.id, per_page: 3, orderby: "count", order: "desc" } }),
  );
  assert.ok(terms.terms.length > 0);
  return `${brand.name}: ${terms.terms.map((term) => `${term.name}(${term.product_count})`).join(", ")}`;
});

await step("list_product_reviews responds despite having no reviews", async () => {
  const data = payload(await client.callTool({ name: "list_product_reviews", arguments: { product_id: 88666 } }));
  assert.ok(Array.isArray(data.reviews));
  return `${data.reviews.length} reviews`;
});

await client.close();

const stderr = await new Promise((resolve) => {
  let buffer = "";
  if (!transport.stderr) return resolve("");
  transport.stderr.on("data", (chunk) => {
    buffer += chunk;
  });
  transport.stderr.on("end", () => resolve(buffer));
  setTimeout(() => resolve(buffer), 250);
});

if (!stderr.includes("ready (store:")) {
  console.log("\nwarning: did not see the server startup banner on stderr");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
