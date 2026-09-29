import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { StoreApiClient } from "../client.js";
import { describeProduct, summarizeProduct, truncate, type StoreProduct } from "../format.js";
import {
  EMPTY_RESULTS_NOTE,
  ORDER,
  PRODUCT_ORDER_BY,
  REVIEW_ORDER_BY,
  STOCK_STATUS,
  appliedFilters,
  paginationInfo,
  runTool,
} from "./shared.js";

interface StoreReview {
  id: number;
  product_id?: number;
  product_name?: string;
  reviewer?: string;
  review?: string;
  rating?: number;
  verified?: boolean;
  date_created?: string;
  formatted_date_created?: string;
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

const MINOR_UNIT_NOTE =
  "Amount in the store's minor currency units. This store uses IDR with 0 decimals, so the value is plain rupiah (e.g. 1000000 = Rp1.000.000).";

export function registerProductTools(server: McpServer, client: StoreApiClient): void {
  server.registerTool(
    "list_products",
    {
      title: "List products",
      description:
        "Browse or search the Toko Nale catalog (29k+ products: networking gear, POS hardware, servers, cabling). " +
        "Supports free-text search plus filters for category, tag, SKU, price range, sale status, stock status and rating. " +
        "Results are paginated (per_page max 100) and returned newest-first by default with formatted IDR prices.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        search: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Free-text search over name and description, e.g. "epson", "cisco router", "fiber optic".'),
        category: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Category ID to filter by. Discover IDs with list_categories."),
        tag: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Tag slug to filter by, e.g. "cisco-catalyst-2960". Discover slugs with list_tags.'),
        sku: z.string().trim().min(1).optional().describe('Exact SKU match, e.g. "TM-T82X".'),
        slug: z.string().trim().min(1).optional().describe("Exact product slug match."),
        min_price: z.number().nonnegative().optional().describe(`Minimum price. ${MINOR_UNIT_NOTE}`),
        max_price: z.number().nonnegative().optional().describe(`Maximum price. ${MINOR_UNIT_NOTE}`),
        on_sale: z.boolean().optional().describe("Set true to return only products currently on sale."),
        stock_status: z.enum(STOCK_STATUS).optional().describe("Filter by stock availability."),
        rating: z.number().int().min(1).max(5).optional().describe("Filter by average rating (1-5)."),
        orderby: z
          .enum(PRODUCT_ORDER_BY)
          .optional()
          .describe('Sort field. Use "price" to rank by price; defaults to the store order (date).'),
        order: z.enum(ORDER).optional().describe("Sort direction. Defaults to desc."),
        include: z.array(z.number().int().positive()).optional().describe("Restrict results to these product IDs."),
        exclude: z.array(z.number().int().positive()).optional().describe("Exclude these product IDs from results."),
        page: z.number().int().min(1).optional().describe("1-based page number. Defaults to 1."),
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page, 1-100. Defaults to 20."),
      }),
    },
    (args) => runTool(async () => {
      const page = args.page ?? 1;
      const perPage = args.per_page ?? 20;

      const { data, ...meta } = await client.get<StoreProduct[]>("/products", {
        search: args.search,
        category: args.category,
        tag: args.tag,
        sku: args.sku,
        slug: args.slug,
        min_price: args.min_price,
        max_price: args.max_price,
        on_sale: args.on_sale,
        stock_status: args.stock_status,
        rating: args.rating,
        orderby: args.orderby,
        order: args.order,
        include: args.include,
        exclude: args.exclude,
        page,
        per_page: perPage,
      });

      const products = (Array.isArray(data) ? data : []).map(summarizeProduct);

      return {
        applied_filters: appliedFilters({
          search: args.search,
          category: args.category,
          tag: args.tag,
          sku: args.sku,
          slug: args.slug,
          min_price: args.min_price,
          max_price: args.max_price,
          on_sale: args.on_sale,
          stock_status: args.stock_status,
          rating: args.rating,
          orderby: args.orderby,
          order: args.order,
          include: args.include,
          exclude: args.exclude,
        }),
        pagination: paginationInfo(meta, page, perPage, products.length),
        products,
        ...(products.length === 0 ? { note: EMPTY_RESULTS_NOTE } : {}),
      };
    }),
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product details",
      description:
        "Fetch one product by ID or slug and return its full detail: formatted IDR price, plain-text description, " +
        "brand, categories, tags, attributes, gallery image URLs, dimensions/weight and order quantity limits.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        id: z.number().int().positive().optional().describe("Product ID. Provide exactly one of id or slug."),
        slug: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Product slug, e.g. "epson-tm-t82x-pos-printer". Provide exactly one of id or slug.'),
      }),
    },
    (args) => runTool(async () => {
      if ((args.id === undefined) === (args.slug === undefined)) {
        throw new Error('Provide exactly one of "id" or "slug".');
      }

      if (args.id !== undefined) {
        const { data } = await client.get<StoreProduct>(`/products/${args.id}`);
        return describeProduct(data);
      }

      const { data } = await client.get<StoreProduct[]>("/products", { slug: args.slug, per_page: 1 });
      const product = Array.isArray(data) ? data[0] : undefined;
      if (!product) {
        throw new Error(`No product found with slug "${args.slug}".`);
      }
      return describeProduct(product);
    }),
  );

  server.registerTool(
    "list_product_reviews",
    {
      title: "List product reviews",
      description:
        "List customer reviews, optionally scoped to a product or category. Note: this store currently has no published reviews, " +
        "so the result is normally an empty array.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        product_id: z.number().int().positive().optional().describe("Only reviews for this product ID."),
        category_id: z.number().int().positive().optional().describe("Only reviews for products in this category."),
        orderby: z.enum(REVIEW_ORDER_BY).optional().describe("Sort field. Defaults to date."),
        order: z.enum(ORDER).optional().describe("Sort direction. Defaults to desc."),
        page: z.number().int().min(1).optional().describe("1-based page number. Defaults to 1."),
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page, 1-100. Defaults to 20."),
      }),
    },
    (args) => runTool(async () => {
      const page = args.page ?? 1;
      const perPage = args.per_page ?? 20;

      const { data, ...meta } = await client.get<StoreReview[]>("/products/reviews", {
        product_id: args.product_id,
        category_id: args.category_id,
        orderby: args.orderby,
        order: args.order,
        page,
        per_page: perPage,
      });

      const reviews = (Array.isArray(data) ? data : []).map((review) => ({
        id: review.id,
        product_id: review.product_id ?? null,
        product_name: review.product_name ?? null,
        reviewer: review.reviewer ?? null,
        rating: review.rating ?? null,
        verified: review.verified ?? null,
        date_created: review.formatted_date_created ?? review.date_created ?? null,
        review: truncate(review.review ?? "", 1000),
      }));

      return {
        applied_filters: appliedFilters({
          product_id: args.product_id,
          category_id: args.category_id,
          orderby: args.orderby,
          order: args.order,
        }),
        pagination: paginationInfo(meta, page, perPage, reviews.length),
        reviews,
        ...(reviews.length === 0
          ? { note: "No reviews matched. This store has no published product reviews." }
          : {}),
      };
    }),
  );
}
