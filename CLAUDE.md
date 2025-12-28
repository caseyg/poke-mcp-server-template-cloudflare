# CLAUDE.md - AI Assistant Guide

This file provides comprehensive guidance for AI assistants working with this codebase.

## Project Overview

This is a **Model Context Protocol (MCP) server** deployed on Cloudflare Workers. The MCP server exposes tools that AI assistants (like those in Poke.com) can call via a standardized protocol.

## Repository Structure

```
poke-mcp-server-template-cloudflare/
├── src/
│   └── index.ts              # Main Cloudflare Workers MCP server
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration (strict mode)
├── wrangler.toml             # Cloudflare Workers configuration
└── README.md                 # User documentation
```

## Development Commands

```bash
# Install dependencies
bun install

# Start local development server (http://localhost:8787/mcp)
bun run dev

# Build TypeScript to dist/
bun run build

# Type-check without emitting
bun run type-check

# Run tests
bun test

# Deploy to Cloudflare Workers
bun run deploy
```

### Testing with MCP Inspector

```bash
# Start local server first, then in another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:8787/mcp
# Use "Streamable HTTP" transport
```

## MCP Protocol Implementation

### Endpoint

The MCP endpoint is `/mcp` (NOT root `/`). All MCP requests must be:
- HTTP POST
- Content-Type: application/json
- JSON-RPC 2.0 format

### Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `greet` | Greet a user by name | `name` (string, required) |
| `get_server_info` | Server metadata | None |
| `ping` | Health check | None |
| `fetchwikipage` | Fetch wiki page from cag.wiki | `path` (string, required) |
| `getwikilisting` | List all wiki pages from sitemap | None |

### MCP Methods Supported

- `initialize` - Server initialization
- `tools/list` - Returns available tools with schemas
- `tools/call` - Executes a tool with arguments
- `notifications/initialized` - Initialized notification (returns 204)

## Code Patterns and Conventions

### Type Guards

Use type guard functions for runtime validation:

```typescript
function isGreetArgs(args: unknown): args is GreetArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "name" in args &&
    typeof (args as Record<string, unknown>).name === "string"
  );
}
```

### Tool Response Format

All tools must return content in this structure:

```typescript
{
  content: [
    {
      type: "text",
      text: "response content here"
    }
  ],
  isError?: true  // Optional, for error responses
}
```

### JSON Response Helper

Use `createJsonResponse()` for consistent responses with CORS headers:

```typescript
function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(),
      "Content-Type": "application/json",
    },
  });
}
```

### External Fetch Pattern

When fetching external resources:

```typescript
const response = await fetch(url, {
  method: "GET",
  headers: { "User-Agent": "MCP-Wiki-Fetcher/1.0" },
  signal: AbortSignal.timeout(10000), // 10 second timeout
});
```

### Error Handling

Classify errors appropriately:

```typescript
if (error instanceof Error) {
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    errorMessage = "Request timeout";
  } else if (error.message.includes("fetch")) {
    errorMessage = `Network error: ${error.message}`;
  } else {
    errorMessage = error.message;
  }
}
```

## Adding New Tools

1. Add tool definition to the `TOOLS` array in `src/index.ts`:

```typescript
{
  name: "my_tool",
  description: "Description of what this tool does",
  inputSchema: {
    type: "object",
    properties: {
      param1: {
        type: "string",
        description: "Parameter description"
      }
    },
    required: ["param1"]
  }
}
```

2. Add a type guard for arguments:

```typescript
interface MyToolArgs {
  param1: string;
}

function isMyToolArgs(args: unknown): args is MyToolArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "param1" in args &&
    typeof (args as Record<string, unknown>).param1 === "string"
  );
}
```

3. Add case in the switch statement:

```typescript
case "my_tool": {
  if (!isMyToolArgs(args)) {
    throw new Error("Invalid arguments for my_tool");
  }
  // Tool logic here
  result = {
    content: [{
      type: "text",
      text: "Result"
    }]
  };
  break;
}
```

## Configuration

### wrangler.toml

- `name`: Worker name (appears in URL)
- `workers_dev`: Enable workers.dev subdomain
- `[vars]`: Environment variables
- Custom domains require `zone_name` or `zone_id`

### tsconfig.json

- Strict mode enabled
- Target: ES2021
- Module: ES2022
- No unused locals/parameters allowed
- Isolated modules for edge compatibility

## Important Notes

1. **MCP Endpoint**: Always use `/mcp`, not root `/`
2. **CORS**: Permissive CORS headers are included for broad integration
3. **Timeout**: Cloudflare Workers have a 10-second timeout for external requests
4. **JSON-RPC 2.0**: All requests/responses follow JSON-RPC 2.0 format
5. **Request ID**: Always preserve and return the request ID in responses

## Testing Checklist

When modifying the server:

- [ ] `bun run type-check` passes
- [ ] `bun run build` succeeds
- [ ] `bun test` passes
- [ ] Local dev server starts (`bun run dev`)
- [ ] MCP Inspector can connect and list tools
- [ ] Each tool can be called successfully

## External Integrations

- **cag.wiki**: Wiki pages are fetched from this domain
- **Poke.com**: Connect the MCP server at poke.com/settings/connections

## Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Invalid JSON / Parse error |
| -32600 | Invalid Request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32000 | Server error (custom) |
