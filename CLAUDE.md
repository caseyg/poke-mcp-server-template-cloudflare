# CLAUDE.md - AI Assistant Guide

This file provides comprehensive guidance for AI assistants working with this codebase.

## Project Overview

This is a **Model Context Protocol (MCP) server template** with dual deployment options:
- **TypeScript/Cloudflare Workers** (primary, production-ready)
- **Python/FastMCP + Render** (alternative deployment)

The MCP server exposes tools that AI assistants (like those in Poke.com) can call via a standardized protocol.

## Repository Structure

```
poke-mcp-server-template-cloudflare/
├── src/
│   ├── index.ts              # Main Cloudflare Workers MCP server (TypeScript)
│   └── server.py             # Alternative Python/FastMCP server
├── .github/
│   └── workflows/
│       └── deploy.yml        # GitHub Actions CI/CD for Cloudflare
├── package.json              # Node.js dependencies and scripts
├── tsconfig.json             # TypeScript configuration (strict mode)
├── wrangler.toml             # Cloudflare Workers configuration
├── render.yaml               # Render.com deployment config (Python)
├── requirements.txt          # Python dependencies
└── README.md                 # User documentation
```

## Development Commands

### TypeScript/Cloudflare Version (Primary)

```bash
# Install dependencies
npm install

# Start local development server (http://localhost:8787/mcp)
npm run dev

# Build TypeScript to dist/
npm run build

# Type-check without emitting
npm run type-check

# Run tests
npm test

# Deploy to Cloudflare Workers
npm run deploy
```

### Python Version (Alternative)

```bash
# Setup environment
pip install -r requirements.txt

# Run server (http://localhost:8000/mcp)
python src/server.py
```

### Testing with MCP Inspector

```bash
# Start local server first, then in another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:8787/mcp (TypeScript) or http://localhost:8000/mcp (Python)
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

Use type guard functions for runtime validation in TypeScript:

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

### TypeScript (src/index.ts)

1. Add tool definition to the `TOOLS` array:

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

### Python (src/server.py)

```python
@mcp.tool(description="Description of what this tool does")
def my_tool(param1: str) -> str:
    return f"Result: {param1}"
```

## Configuration

### wrangler.toml (Cloudflare Workers)

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

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys to Cloudflare on push to `main`:

1. Checkout code
2. Setup Node.js 20
3. Install dependencies (`npm ci`)
4. Build TypeScript (`npm run build`)
5. Deploy via Wrangler action

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Important Notes

1. **MCP Endpoint**: Always use `/mcp`, not root `/`
2. **CORS**: Permissive CORS headers are included for broad integration
3. **Timeout**: Cloudflare Workers have a 10-second timeout for external requests
4. **JSON-RPC 2.0**: All requests/responses follow JSON-RPC 2.0 format
5. **Request ID**: Always preserve and return the request ID in responses

## Testing Checklist

When modifying the server:

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] Local dev server starts (`npm run dev`)
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
