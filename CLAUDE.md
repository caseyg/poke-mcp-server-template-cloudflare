# CLAUDE.md - AI Assistant Guide

This file provides guidance for AI assistants working with this codebase.

## Project Overview

This is an **MCP server for accessing Casey Gollan's public information**, deployed on Cloudflare Workers. It exposes tools that AI assistants can call via the Model Context Protocol.

## Repository Structure

```
poke-mcp-server-template-cloudflare/
├── src/
│   └── index.ts              # Main MCP server implementation
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── wrangler.toml             # Cloudflare Workers configuration
└── README.md                 # User documentation
```

## Development Commands

```bash
bun install          # Install dependencies
bun run dev          # Start local server (http://localhost:8787/mcp)
bun run build        # Build TypeScript
bun run type-check   # Type-check without emitting
bun test             # Run tests
bun run deploy       # Deploy to Cloudflare Workers
```

## Current Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `getwiki` | Access Casey's wiki at cag.wiki | `path` (optional) - omit to list pages |
| `getblog` | Access Casey's blog at caseyagollan.com | `slug` (optional) - omit to list posts |
| `getgithub` | Access GitHub profile/repos at github.com/caseyg | `repo` (optional) - omit for profile + repo list |
| `getmastodon` | Access Mastodon posts at social.coop/@CaseyG | `limit` (optional, default 10, max 40) |

## Code Patterns

### Adding a New Tool

1. Add to `TOOLS` array:
```typescript
{
  name: "mytool",
  description: "What it does",
  inputSchema: {
    type: "object",
    properties: {
      param: { type: "string", description: "Param description" }
    },
    required: ["param"]
  }
}
```

2. Add type guard (if params needed):
```typescript
interface MyToolArgs { param: string; }
function isMyToolArgs(args: unknown): args is MyToolArgs {
  return typeof args === "object" && args !== null &&
    "param" in args && typeof (args as Record<string, unknown>).param === "string";
}
```

3. Add case in switch statement:
```typescript
case "mytool": {
  if (!isMyToolArgs(args)) throw new Error("Invalid arguments");
  // Implementation
  result = { content: [{ type: "text", text: "result" }] };
  break;
}
```

### Tool Response Format

```typescript
{
  content: [{ type: "text", text: "response" }],
  isError?: true  // For errors
}
```

### External Fetch Pattern

```typescript
const response = await fetch(url, {
  headers: { "User-Agent": "CaseyMCP/1.0" },
  signal: AbortSignal.timeout(10000),
});
```

## Important Notes

1. MCP endpoint is `/mcp` (not root `/`)
2. All requests must be POST with `Content-Type: application/json`
3. 10-second timeout for external fetches (Cloudflare limit)
4. CORS headers included for broad integration

## Data Sources

| Source | URL | Notes |
|--------|-----|-------|
| Wiki | cag.wiki | Personal wiki (integrated) |
| Blog | caseyagollan.com/posts | Personal blog |
| Notes | notes.caseyagollan.com | Tumblr-style notes |
| GitHub | github.com/caseyg | 124 repositories |
| Mastodon | social.coop/@CaseyG | Social |

## Testing

```bash
# Start server
bun run dev

# Test with MCP Inspector
npx @modelcontextprotocol/inspector
# Connect to http://localhost:8787/mcp using "Streamable HTTP"
```

## Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Parse error |
| -32603 | Internal error |
| -32000 | Server error |
