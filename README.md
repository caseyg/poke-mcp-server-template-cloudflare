# Casey's Public Info MCP Server

An MCP server for accessing Casey Gollan's public information, running on Cloudflare Workers.

## Available Tools

- **getwiki** - Access Casey's wiki (cag.wiki). Omit `path` to list pages, or provide to get content.
- **getblog** - Access Casey's blog (caseyagollan.com). Omit `slug` to list posts, or provide to get content.
- **getgithub** - Access GitHub (github.com/caseyg). Omit `repo` for profile + repos, or provide for repo details.
- **getmastodon** - Access Mastodon (social.coop/@CaseyG). Optional `limit` (default 10, max 40).

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
