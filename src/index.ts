#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEFAULT_STORE_URL, StoreApiClient, normalizeStoreUrl } from "./client.js";
import { registerTools } from "./tools/index.js";

const SERVER_NAME = "toko-nale";
const SERVER_VERSION = "1.0.0";

const INSTRUCTIONS = [
  "Read-only browser for the Toko Nale store (toko.nale.co.id), a WooCommerce catalog of networking equipment,",
  "POS hardware, servers and cabling. It uses the public WooCommerce Store API and never needs credentials.",
  "",
  "Typical flow: use list_products with `search` for a plain product lookup, or narrow with `category` (from",
  "list_categories), `tag` (from list_tags) and `sku`. Prices are returned pre-formatted (IDR) alongside the raw",
  "minor-unit value, which is also what min_price/max_price expect. list_products is paginated — check",
  "`pagination.has_more` and pass `page` to continue. Use get_product for full descriptions and attributes.",
  "This server cannot modify the store.",
].join(" ");

async function main(): Promise<void> {
  const storeUrl = process.env.STORE_URL?.trim() ? process.env.STORE_URL.trim() : DEFAULT_STORE_URL;
  const timeoutMs = Number.parseInt(process.env.STORE_TIMEOUT_MS ?? "", 10);

  const client = new StoreApiClient({
    baseUrl: storeUrl,
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
  });

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerTools(server, client);

  await server.connect(new StdioServerTransport());
  console.error(`${SERVER_NAME}-mcp v${SERVER_VERSION} ready (store: ${normalizeStoreUrl(storeUrl)})`);
}

main().catch((error: unknown) => {
  console.error(`${SERVER_NAME}-mcp failed to start:`, error);
  process.exit(1);
});
