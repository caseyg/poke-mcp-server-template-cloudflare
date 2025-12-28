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
| `fetchwikipage` | Fetch content from cag.wiki | `path` (string, required) |
| `getwikilisting` | List all wiki pages from sitemap | None |

## Planned Tools (Future)

Based on Casey's online presence, these tools could be added:

### Blog/Website Tools
- `fetchblogpost` - Fetch posts from caseyagollan.com/posts
- `getblogindex` - List all blog posts
- `fetchhirepage` - Get content from hire.caseyagollan.com

### GitHub Tools
- `getgithubrepos` - List Casey's public repositories (github.com/caseyg)
- `getgithubprofile` - Fetch GitHub profile info
- `searchgithubrepos` - Search repos by topic/language

### Social Tools
- `getmastodonposts` - Fetch recent posts from social.coop/@CaseyG

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
| Hire | hire.caseyagollan.com | Services/portfolio |
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
