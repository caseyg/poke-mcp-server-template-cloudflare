import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Define available tools for accessing Casey's public information
const TOOLS: Tool[] = [
  {
    name: "fetchwikipage",
    description: "Fetch content from a wiki page at cag.wiki. Retrieves the HTML content of the specified page path.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path of the wiki page to fetch (e.g., 'home', 'about', 'docs/guide')",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "getwikilisting",
    description: "Get a listing of all available wiki pages from the sitemap. Returns a structured list of pages with their URLs and metadata.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Cloudflare Workers environment interface
interface Env {
  ENVIRONMENT?: string;
}

// Type guard for MCP request body
interface MCPRequestBody {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

// Type guard function to validate MCP request
function isMCPRequest(body: unknown): body is MCPRequestBody {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.method === "string" &&
    (obj.id === undefined || typeof obj.id === "string" || typeof obj.id === "number")
  );
}

// Type guard for fetchwikipage arguments
interface FetchWikiPageArgs {
  path: string;
}

function isFetchWikiPageArgs(args: unknown): args is FetchWikiPageArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "path" in args &&
    typeof (args as Record<string, unknown>).path === "string"
  );
}

// Helper function to get comprehensive CORS headers
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Origin, X-Request-ID",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
}

// Helper function to create JSON response with CORS
function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(),
      "Content-Type": "application/json",
    },
  });
}

// Helper function to fetch wiki page content
async function fetchWikiPage(path: string): Promise<{
  success: boolean;
  status: number;
  content?: string;
  error?: string;
  url: string;
}> {
  // Sanitize the path - remove leading/trailing slashes
  const sanitizedPath = path.replace(/^\/+|\/+$/g, "");

  // Construct the full URL
  const url = `https://cag.wiki/${sanitizedPath}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "CaseyMCP/1.0",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
        url,
      };
    }

    const content = await response.text();

    return {
      success: true,
      status: response.status,
      content,
      url,
    };
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof Error) {
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        errorMessage = "Request timeout - the wiki page took too long to respond";
      } else if (error.message.includes("fetch")) {
        errorMessage = `Network error: ${error.message}`;
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      status: 0,
      error: errorMessage,
      url,
    };
  }
}

// Helper function to fetch and parse wiki listing from sitemap
async function getWikiListing(): Promise<{
  success: boolean;
  status: number;
  pages?: Array<{
    path: string;
    url: string;
    lastModified?: string;
  }>;
  count?: number;
  error?: string;
  url: string;
}> {
  const url = "https://cag.wiki/sitemap.xml";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "CaseyMCP/1.0",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
        url,
      };
    }

    const xmlContent = await response.text();

    // Parse the XML to extract URLs
    const urlPattern = /<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?/g;
    const pages: Array<{
      path: string;
      url: string;
      lastModified?: string;
    }> = [];

    let match;
    while ((match = urlPattern.exec(xmlContent)) !== null) {
      const fullUrl = match[1];
      const lastModified = match[2];

      // Extract just the path portion (remove https://cag.wiki prefix)
      const path = fullUrl.replace(/^https?:\/\/cag\.wiki\/?/, '') || '/';

      pages.push({
        path,
        url: fullUrl,
        ...(lastModified && { lastModified }),
      });
    }

    return {
      success: true,
      status: response.status,
      pages,
      count: pages.length,
      url,
    };
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof Error) {
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        errorMessage = "Request timeout - the sitemap took too long to respond";
      } else if (error.message.includes("fetch")) {
        errorMessage = `Network error: ${error.message}`;
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      status: 0,
      error: errorMessage,
      url,
    };
  }
}

// Cloudflare Workers fetch handler
export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: getCorsHeaders(),
      });
    }

    // Route validation - only accept /mcp endpoint for MCP protocol
    if (url.pathname !== "/mcp" && url.pathname !== "/") {
      return createJsonResponse(
        {
          error: {
            code: -32000,
            message: `Invalid endpoint. Use /mcp for MCP protocol requests.`,
          },
        },
        404
      );
    }

    // Only accept POST requests for MCP protocol
    if (request.method !== "POST") {
      return createJsonResponse(
        {
          error: {
            code: -32000,
            message: "Method not allowed. Use POST for MCP requests.",
          },
        },
        405
      );
    }

    // Validate Content-Type for JSON requests
    const contentType = request.headers.get("Content-Type");
    if (!contentType || !contentType.includes("application/json")) {
      return createJsonResponse(
        {
          error: {
            code: -32700,
            message: "Invalid Content-Type. Expected application/json.",
          },
        },
        400
      );
    }

    try {
      // Parse the incoming MCP request with proper type checking
      const body = await request.json();

      // Validate the request body
      if (!isMCPRequest(body)) {
        throw new Error("Invalid MCP request format");
      }

      const requestId = body.id;

      let responseData: unknown = null;

      // Handle different MCP methods
      if (body.method === "tools/list") {
        const validation = ListToolsRequestSchema.safeParse(body);
        if (!validation.success) {
          throw new Error(`Invalid tools/list request: ${validation.error.message}`);
        }

        responseData = {
          jsonrpc: "2.0",
          id: requestId,
          result: {
            tools: TOOLS,
          },
        };
      } else if (body.method === "tools/call") {
        const validation = CallToolRequestSchema.safeParse(body);
        if (!validation.success) {
          throw new Error(`Invalid tools/call request: ${validation.error.message}`);
        }

        const params = body.params;
        if (!params || !params.name) {
          throw new Error("Missing tool name in request");
        }

        const { name, arguments: args } = params;

        let result;
        switch (name) {
          case "fetchwikipage": {
            if (!isFetchWikiPageArgs(args)) {
              throw new Error("Invalid arguments for fetchwikipage tool. Required: path (string)");
            }

            const { path } = args;
            const wikiResult = await fetchWikiPage(path);

            if (!wikiResult.success) {
              const errorResponse = {
                success: false,
                url: wikiResult.url,
                status: wikiResult.status,
                error: wikiResult.error,
                message: wikiResult.status === 404
                  ? `Wiki page not found at path: ${path}`
                  : `Failed to fetch wiki page: ${wikiResult.error}`,
              };

              result = {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(errorResponse, null, 2),
                  },
                ],
                isError: true,
              };
            } else {
              const successResponse = {
                success: true,
                url: wikiResult.url,
                status: wikiResult.status,
                contentLength: wikiResult.content?.length || 0,
                content: wikiResult.content,
              };

              result = {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(successResponse, null, 2),
                  },
                ],
              };
            }
            break;
          }

          case "getwikilisting": {
            const listingResult = await getWikiListing();

            if (!listingResult.success) {
              const errorResponse = {
                success: false,
                url: listingResult.url,
                status: listingResult.status,
                error: listingResult.error,
                message: `Failed to fetch wiki listing: ${listingResult.error}`,
              };

              result = {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(errorResponse, null, 2),
                  },
                ],
                isError: true,
              };
            } else {
              const successResponse = {
                success: true,
                url: listingResult.url,
                status: listingResult.status,
                count: listingResult.count,
                pages: listingResult.pages,
              };

              result = {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(successResponse, null, 2),
                  },
                ],
              };
            }
            break;
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        responseData = {
          jsonrpc: "2.0",
          id: requestId,
          result,
        };
      } else if (body.method === "initialize") {
        responseData = {
          jsonrpc: "2.0",
          id: requestId,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {
                listChanged: false,
              },
              prompts: {
                listChanged: false,
              },
              resources: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: "Casey's Public Info MCP",
              version: "1.0.0",
            },
          },
        };
      } else if (body.method === "notifications/initialized") {
        return new Response(null, {
          status: 204,
          headers: getCorsHeaders(),
        });
      } else {
        throw new Error(`Unknown method: ${body.method}`);
      }

      return createJsonResponse(responseData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      let requestId: string | number | undefined;
      try {
        const body = await request.clone().json();
        if (isMCPRequest(body)) {
          requestId = body.id;
        }
      } catch {
        // If we can't parse the request, continue without request id
      }

      return createJsonResponse(
        {
          jsonrpc: "2.0",
          ...(requestId !== undefined && { id: requestId }),
          error: {
            code: -32603,
            message: errorMessage,
          },
        },
        500
      );
    }
  },
};
