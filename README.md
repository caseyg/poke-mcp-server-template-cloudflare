# Casey's Public Info MCP Server

An MCP server for accessing Casey Gollan's public information, running on Cloudflare Workers.

## Available Tools

- **fetchwikipage** - Fetch content from cag.wiki
- **getwikilisting** - List all wiki pages

## Local Development

```bash
bun install
bun run dev
```

Server runs at `http://localhost:8787/mcp`

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Connect to `http://localhost:8787/mcp` using "Streamable HTTP" transport.

## Deploy

```bash
wrangler login
bun run deploy
```

## Poke Setup

Connect at [poke.com/settings/connections](https://poke.com/settings/connections).

## Customization

See `CLAUDE.md` for patterns and planned tools.
