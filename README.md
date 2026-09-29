# toko-nale-mcp

A read-only [MCP](https://modelcontextprotocol.io) server for browsing the product catalog of the
Toko Nale store (**https://toko.nale.co.id**) — a WooCommerce shop with ~29,700 products covering
networking gear (Cisco, Mikrotik, Ubiquiti, HPE), POS hardware, servers, fiber and cabling.

It talks to the **public WooCommerce Store API** (`/wp-json/wc/store/v1`), so it needs **no
credentials** and can never modify the store.

Built on the v2 MCP TypeScript SDK — `@modelcontextprotocol/server` 2.2.0 (with
`@modelcontextprotocol/client` 2.2.0 driving the tests) and Zod 4. Tool inputs are declared as
Standard Schema objects (`z.object({ ... })`), the non-deprecated form; the v1 packages
(`@modelcontextprotocol/sdk`) and raw-shape `inputSchema` records are not used.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_products` | Browse/search products. Filters: `search`, `category`, `tag`, `sku`, `slug`, price range, `on_sale`, `stock_status`, `rating`, `include`/`exclude`. Sortable, paginated. |
| `get_product` | Full detail for one product by `id` or `slug`: plain-text description, brand, attributes, gallery, dimensions/weight, order limits. |
| `list_categories` | Category tree with `parent` links and product counts. |
| `list_tags` | Tag names + slugs. |
| `list_attributes` | Global attributes (Brand, Color, Distance, HDD/SSD Storage, Unit Quantity). |
| `list_attribute_terms` | Values of one attribute — e.g. every Brand. |
| `list_product_reviews` | Customer reviews (this store currently has none published). |

All tools are annotated `readOnlyHint: true`.

### Response shape

Every tool returns JSON as text. Prices arrive **pre-formatted in IDR** next to the raw value the API
uses:

```json
{
  "applied_filters": { "search": "epson" },
  "pagination": { "page": 1, "per_page": 20, "returned": 20, "total_results": 30,
                  "total_pages": 2, "has_more": true, "next_page": 2 },
  "products": [
    {
      "id": 88666,
      "name": "Epson TM-T82X POS Printer",
      "sku": "TM-T82X",
      "price": "Rp3.183.480",
      "price_minor": "3183480",
      "currency": "IDR",
      "on_sale": false,
      "regular_price": null,
      "sale_price": null,
      "is_in_stock": true,
      "stock_status": "in-stock",
      "brand": null,
      "categories": ["Printer"],
      "tags": ["Printer"],
      "image": "https://toko.nale.co.id/wp-content/uploads/2026/09/FY18_SIL_Left_EBCK.jpg",
      "short_description": "",
      "has_options": false
    }
  ]
}
```

Notes on the data:

- `price_minor` is the raw API value in **minor currency units**. This store is IDR with 0 decimals, so
  it is plain rupiah — and it is also the unit expected by `min_price` / `max_price`.
- Unpriced products return an empty `price` string rather than `Rp0`.
- Results are **paginated**; check `pagination.has_more` and pass `page` to continue.
- `brand` comes from the `pa_brand` attribute, which is only populated on some products — fall back to
  `search` when it is `null`.
- `attribute` filtering is **not supported** by this store's API (the parameter is silently ignored),
  so brand lookups are done with `search` instead.

## Setup

```bash
npm install
npm run build
```

Requires Node 20+ (developed on Node 22) — the v2 MCP SDK packages used here declare
`engines: node >=20`.

> If your shell exports `NODE_ENV=production`, npm skips dev dependencies and the build will fail.
> Install with `npm install --include=dev`.

### Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `STORE_URL` | `https://toko.nale.co.id` | Base URL of any WooCommerce store exposing the Store API. |
| `STORE_TIMEOUT_MS` | `20000` | Per-request timeout. |

## Registering with an MCP client

```json
{
  "mcpServers": {
    "toko-nale": {
      "command": "node",
      "args": ["/home/fauzanmhr/Projects/toko-nale-mcp/dist/index.js"]
    }
  }
}
```

Run it straight from the sources during development with `npm run dev` (tsx), or as a server binary
via `npx toko-nale-mcp` once linked.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # build + unit tests for the formatters
npm run smoke       # build + end-to-end run against the live store over stdio
```

Layout:

```
src/
  index.ts        server bootstrap, stdio transport, env config
  client.ts       Store API client: query building, pagination headers, error mapping
  format.ts       price formatting, entity/HTML stripping, product summarizers
  tools/
    shared.ts     result helpers, enums, pagination helpers
    products.ts   list_products, get_product, list_product_reviews
    catalog.ts    list_categories, list_tags, list_attributes, list_attribute_terms
```
