import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Define available tools
const TOOLS: Tool[] = [
  {
    name: "greet",
    description: "Greet a user by name with a welcome message from the MCP server",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the person to greet",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_server_info",
    description: "Get information about the MCP server including name, version, and environment",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "ping",
    description: "Health check endpoint that returns a simple pong response",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
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

// Type guard for tool arguments
interface GreetArgs {
  name: string;
}

function isGreetArgs(args: unknown): args is GreetArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "name" in args &&
    typeof (args as Record<string, unknown>).name === "string"
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
        "User-Agent": "MCP-Wiki-Fetcher/1.0",
      },
      // Set a reasonable timeout
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

// Cloudflare Workers fetch handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
        // Use imported schema for validation
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
        // Use imported schema for validation
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
          case "greet": {
            if (!isGreetArgs(args)) {
              throw new Error("Invalid arguments for greet tool");
            }
            const userName = args.name;
            result = {
              content: [
                {
                  type: "text",
                  text: `Hello, ${userName}! Welcome to our sample MCP server running on Cloudflare Workers!`,
                },
              ],
            };
            break;
          }

          case "get_server_info": {
            const info = {
              server_name: "Sample MCP Server",
              version: "1.0.0",
              environment: env.ENVIRONMENT || "development",
              runtime: "Cloudflare Workers",
            };
            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(info, null, 2),
                },
              ],
            };
            break;
          }

          case "ping": {
            result = {
              content: [
                {
                  type: "text",
                  text: "pong",
                },
              ],
            };
            break;
          }

          case "fetchwikipage": {
            if (!isFetchWikiPageArgs(args)) {
              throw new Error("Invalid arguments for fetchwikipage tool. Required: path (string)");
            }
            
            const { path } = args;
            
            // Fetch the wiki page
            const wikiResult = await fetchWikiPage(path);
            
            if (!wikiResult.success) {
              // Return structured error information
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
              // Return successful response with content
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
              name: "Sample MCP Server",
              version: "1.0.0",
            },
          },
        };
      } else if (body.method === "notifications/initialized") {
        // Handle initialized notification (no response needed for notifications)
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
      
      // Try to extract request id from the original request if possible
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
