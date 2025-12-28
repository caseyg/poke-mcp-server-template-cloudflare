import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
];

// Cloudflare Workers environment interface
interface Env {
  ENVIRONMENT?: string;
}

// Create MCP server instance
const server = new Server(
  {
    name: "Sample MCP Server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "greet": {
      const userName = (args as { name: string }).name;
      return {
        content: [
          {
            type: "text",
            text: `Hello, ${userName}! Welcome to our sample MCP server running on Cloudflare Workers!`,
          },
        ],
      };
    }

    case "get_server_info": {
      const info = {
        server_name: "Sample MCP Server",
        version: "1.0.0",
        environment: process.env.ENVIRONMENT || "development",
        runtime: "Cloudflare Workers",
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Cloudflare Workers fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Only accept POST requests for MCP protocol
    if (request.method !== "POST") {
      return new Response("Method not allowed. Use POST for MCP requests.", {
        status: 405,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      // Parse the incoming MCP request
      const body = await request.json();

      // Create a mock transport for handling the request
      let responseData: any = null;

      // Handle different MCP methods
      if (body.method === "tools/list") {
        responseData = {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: TOOLS,
          },
        };
      } else if (body.method === "tools/call") {
        const { name, arguments: args } = body.params;

        let result;
        switch (name) {
          case "greet": {
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

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        responseData = {
          jsonrpc: "2.0",
          id: body.id,
          result,
        };
      } else if (body.method === "initialize") {
        responseData = {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "Sample MCP Server",
              version: "1.0.0",
            },
          },
        };
      } else {
        throw new Error(`Unknown method: ${body.method}`);
      }

      return new Response(JSON.stringify(responseData), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: errorMessage,
          },
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
