import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Single consolidated tool for wiki access
const TOOLS: Tool[] = [
  {
    name: "getwiki",
    description: "Access Casey's personal wiki at cag.wiki. Without a path, returns a list of all available pages. With a path, returns the text content of that page.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional page path (e.g., 'about', 'projects/foo'). Omit to list all pages.",
        },
      },
    },
  },
];

// Type guards
interface MCPRequestBody {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

function isMCPRequest(body: unknown): body is MCPRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.method === "string" &&
    (obj.id === undefined || typeof obj.id === "string" || typeof obj.id === "number");
}

interface GetWikiArgs {
  path?: string;
}

function isGetWikiArgs(args: unknown): args is GetWikiArgs {
  if (typeof args !== "object" || args === null) return true; // Empty object is valid
  const obj = args as Record<string, unknown>;
  return !("path" in obj) || typeof obj.path === "string";
}

// Extract text content from HTML
function extractText(html: string): string {
  // Remove script and style elements
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove HTML tags but preserve some structure
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<li>/gi, '• ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.trim();

  return text;
}

// CORS headers
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Origin, X-Request-ID",
    "Access-Control-Max-Age": "86400",
  };
}

function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });
}

// Fetch a wiki page and extract text
async function fetchWikiPage(path: string): Promise<{ text?: string; error?: string; url: string }> {
  const sanitizedPath = path.replace(/^\/+|\/+$/g, "");
  const url = `https://cag.wiki/${sanitizedPath}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "CaseyMCP/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { error: `Page not found: ${path}`, url };
    }

    const html = await response.text();
    return { text: extractText(html), url };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { error: msg, url };
  }
}

// Get list of all wiki pages from sitemap
async function getWikiPages(): Promise<{ pages?: string[]; error?: string }> {
  try {
    const response = await fetch("https://cag.wiki/sitemap.xml", {
      headers: { "User-Agent": "CaseyMCP/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { error: "Could not fetch wiki sitemap" };
    }

    const xml = await response.text();
    const pages: string[] = [];
    const pattern = /<loc>https?:\/\/cag\.wiki\/?([^<]*)<\/loc>/g;

    let match;
    while ((match = pattern.exec(xml)) !== null) {
      pages.push(match[1] || "/");
    }

    return { pages };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { error: msg };
  }
}

// Main handler
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: getCorsHeaders() });
    }

    if (url.pathname !== "/mcp" && url.pathname !== "/") {
      return createJsonResponse({ error: { code: -32000, message: "Use /mcp endpoint" } }, 404);
    }

    if (request.method !== "POST") {
      return createJsonResponse({ error: { code: -32000, message: "POST required" } }, 405);
    }

    const contentType = request.headers.get("Content-Type");
    if (!contentType?.includes("application/json")) {
      return createJsonResponse({ error: { code: -32700, message: "JSON required" } }, 400);
    }

    try {
      const body = await request.json();
      if (!isMCPRequest(body)) throw new Error("Invalid MCP request");

      const requestId = body.id;

      if (body.method === "tools/list") {
        ListToolsRequestSchema.safeParse(body);
        return createJsonResponse({
          jsonrpc: "2.0",
          id: requestId,
          result: { tools: TOOLS },
        });
      }

      if (body.method === "tools/call") {
        CallToolRequestSchema.safeParse(body);
        const params = body.params;
        if (!params?.name) throw new Error("Missing tool name");

        const { name, arguments: args } = params;

        if (name === "getwiki") {
          if (!isGetWikiArgs(args)) {
            throw new Error("Invalid arguments");
          }

          let result;
          if (args?.path) {
            // Fetch specific page
            const pageResult = await fetchWikiPage(args.path);
            if (pageResult.error) {
              result = {
                content: [{ type: "text", text: pageResult.error }],
                isError: true,
              };
            } else {
              result = {
                content: [{ type: "text", text: pageResult.text || "" }],
              };
            }
          } else {
            // List all pages
            const listResult = await getWikiPages();
            if (listResult.error) {
              result = {
                content: [{ type: "text", text: listResult.error }],
                isError: true,
              };
            } else {
              const text = `Wiki pages (${listResult.pages?.length || 0}):\n${listResult.pages?.join("\n") || ""}`;
              result = {
                content: [{ type: "text", text }],
              };
            }
          }

          return createJsonResponse({
            jsonrpc: "2.0",
            id: requestId,
            result,
          });
        }

        throw new Error(`Unknown tool: ${name}`);
      }

      if (body.method === "initialize") {
        return createJsonResponse({
          jsonrpc: "2.0",
          id: requestId,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, prompts: {}, resources: {} },
            serverInfo: { name: "Casey's Public Info MCP", version: "1.0.0" },
          },
        });
      }

      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 204, headers: getCorsHeaders() });
      }

      throw new Error(`Unknown method: ${body.method}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return createJsonResponse({
        jsonrpc: "2.0",
        error: { code: -32603, message: msg },
      }, 500);
    }
  },
};
