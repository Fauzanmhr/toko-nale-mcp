import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { StoreApiClient } from "../client.js";
import { summarizeTerm, type StoreTerm } from "../format.js";
import {
  ATTRIBUTE_TERM_ORDER_BY,
  EMPTY_RESULTS_NOTE,
  ORDER,
  TERM_ORDER_BY,
  appliedFilters,
  paginationInfo,
  runTool,
} from "./shared.js";

interface StoreAttribute {
  id: number;
  name: string;
  taxonomy: string;
  type: string;
  order: string;
  has_archives: boolean;
  count: number;
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

export function registerCatalogTools(server: McpServer, client: StoreApiClient): void {
  server.registerTool(
    "list_categories",
    {
      title: "List product categories",
      description:
        "List the product category tree. Each category includes its ID (use it as the `category` filter of list_products), " +
        "parent ID for walking the hierarchy, and product count. This store's tree is broad (Routers, Switches, Firewalls, Cables, Servers...).",
      annotations: READ_ONLY,
      inputSchema: z.object({
        search: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Free-text search over category names, e.g. "router".'),
        parent: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Only return direct children of this category ID. Use 0 for top-level categories."),
        hide_empty: z.boolean().optional().describe("Set true to exclude categories with no products."),
        orderby: z.enum(TERM_ORDER_BY).optional().describe('Sort field. Defaults to name; "count" ranks by product count.'),
        order: z.enum(ORDER).optional().describe("Sort direction. Defaults to asc."),
        page: z.number().int().min(1).optional().describe("1-based page number. Defaults to 1."),
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page, 1-100. Defaults to 50."),
      }),
    },
    (args) => runTool(async () => {
      const page = args.page ?? 1;
      const perPage = args.per_page ?? 50;

      const { data, ...meta } = await client.get<StoreTerm[]>("/products/categories", {
        search: args.search,
        parent: args.parent,
        hide_empty: args.hide_empty,
        orderby: args.orderby,
        order: args.order,
        page,
        per_page: perPage,
      });

      const categories = (Array.isArray(data) ? data : []).map((category) => ({
        ...summarizeTerm(category),
        product_count: category.count ?? 0,
      }));

      return {
        applied_filters: appliedFilters({
          search: args.search,
          parent: args.parent,
          hide_empty: args.hide_empty,
          orderby: args.orderby,
          order: args.order,
        }),
        pagination: paginationInfo(meta, page, perPage, categories.length),
        categories,
        ...(categories.length === 0 ? { note: EMPTY_RESULTS_NOTE } : {}),
      };
    }),
  );

  server.registerTool(
    "list_tags",
    {
      title: "List product tags",
      description:
        "List product tags with their slugs (usable as the `tag` filter of list_products) and product counts.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        search: z.string().trim().min(1).optional().describe('Free-text search over tag names, e.g. "cisco".'),
        hide_empty: z.boolean().optional().describe("Set true to exclude tags with no products."),
        orderby: z.enum(TERM_ORDER_BY).optional().describe("Sort field. Defaults to name."),
        order: z.enum(ORDER).optional().describe("Sort direction. Defaults to asc."),
        page: z.number().int().min(1).optional().describe("1-based page number. Defaults to 1."),
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page, 1-100. Defaults to 50."),
      }),
    },
    (args) => runTool(async () => {
      const page = args.page ?? 1;
      const perPage = args.per_page ?? 50;

      const { data, ...meta } = await client.get<StoreTerm[]>("/products/tags", {
        search: args.search,
        hide_empty: args.hide_empty,
        orderby: args.orderby,
        order: args.order,
        page,
        per_page: perPage,
      });

      const tags = (Array.isArray(data) ? data : []).map((tag) => ({
        ...summarizeTerm(tag),
        product_count: tag.count ?? 0,
      }));

      return {
        applied_filters: appliedFilters({
          search: args.search,
          hide_empty: args.hide_empty,
          orderby: args.orderby,
          order: args.order,
        }),
        pagination: paginationInfo(meta, page, perPage, tags.length),
        tags,
        ...(tags.length === 0 ? { note: EMPTY_RESULTS_NOTE } : {}),
      };
    }),
  );

  server.registerTool(
    "list_attributes",
    {
      title: "List product attributes",
      description:
        "List the store's global product attributes (Brand, Color, Distance, HDD Storage, SSD Storage, Unit Quantity) with term counts. " +
        "Call list_attribute_terms with an attribute id to get its values — useful for finding the right brand name to search for.",
      annotations: READ_ONLY,
    },
    () => runTool(async () => {
      const { data } = await client.get<StoreAttribute[]>("/products/attributes", { per_page: 100 });
      const attributes = (Array.isArray(data) ? data : []).map((attribute) => ({
        id: attribute.id,
        name: attribute.name,
        taxonomy: attribute.taxonomy,
        term_count: attribute.count ?? 0,
      }));
      return { attributes };
    }),
  );

  server.registerTool(
    "list_attribute_terms",
    {
      title: "List terms of a product attribute",
      description:
        "List the values (terms) of one global product attribute, e.g. every brand under the Brand attribute. " +
        "Get attribute ids from list_attributes. Note: filtering list_products by attribute is not supported by this store's API, " +
        "so use a term name as a `search` value instead.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        attribute_id: z
          .number()
          .int()
          .positive()
          .describe("Attribute ID from list_attributes (1 = Brand, 2 = Color, 3 = Distance, ...)."),
        search: z.string().trim().min(1).optional().describe("Free-text search over term names, e.g. \"cisc\"."),
        hide_empty: z.boolean().optional().describe("Set true to exclude terms with no products."),
        orderby: z.enum(ATTRIBUTE_TERM_ORDER_BY).optional().describe('Sort field. Defaults to name; "count" ranks by product count.'),
        order: z.enum(ORDER).optional().describe("Sort direction. Defaults to asc."),
        page: z.number().int().min(1).optional().describe("1-based page number. Defaults to 1."),
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page, 1-100. Defaults to 50."),
      }),
    },
    (args) => runTool(async () => {
      const page = args.page ?? 1;
      const perPage = args.per_page ?? 50;

      const { data, ...meta } = await client.get<StoreTerm[]>(
        `/products/attributes/${args.attribute_id}/terms`,
        {
          search: args.search,
          hide_empty: args.hide_empty,
          orderby: args.orderby,
          order: args.order,
          page,
          per_page: perPage,
        },
      );

      const terms = (Array.isArray(data) ? data : []).map((term) => ({
        ...summarizeTerm(term),
        product_count: term.count ?? 0,
      }));

      return {
        attribute_id: args.attribute_id,
        applied_filters: appliedFilters({
          search: args.search,
          hide_empty: args.hide_empty,
          orderby: args.orderby,
          order: args.order,
        }),
        pagination: paginationInfo(meta, page, perPage, terms.length),
        terms,
        ...(terms.length === 0 ? { note: EMPTY_RESULTS_NOTE } : {}),
      };
    }),
  );
}
