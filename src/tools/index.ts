import type { McpServer } from "@modelcontextprotocol/server";
import type { StoreApiClient } from "../client.js";
import { registerCatalogTools } from "./catalog.js";
import { registerProductTools } from "./products.js";

export function registerTools(server: McpServer, client: StoreApiClient): void {
  registerProductTools(server, client);
  registerCatalogTools(server, client);
}
