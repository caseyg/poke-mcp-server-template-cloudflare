# MCP Server Template (Cloudflare Workers)

A minimal MCP server running on Cloudflare Workers.

## Local Development

### Prerequisites
- [Bun](https://bun.sh) installed
- Cloudflare account (free tier works)

### Setup

```bash
git clone <your-repo-url>
cd mcp-server-template
bun install
```

### Test Locally

```bash
bun run dev
```

Your local server will be available at `http://localhost:8787/mcp`

Test with the MCP Inspector:
```bash
npx @modelcontextprotocol/inspector
```

Open http://localhost:3000 and connect to `http://localhost:8787/mcp` using "Streamable HTTP" transport.

## Deployment

### Initial Setup

1. **Authenticate with Cloudflare**
   ```bash
   wrangler login
   ```

2. **Update Configuration**
   Edit `wrangler.toml` to customize your worker name:
   ```toml
   name = "your-mcp-server-name"
   ```

### Deploy

```bash
bun run deploy
```

Your server will be available at `https://your-mcp-server-name.<your-subdomain>.workers.dev/mcp`

## Poke Setup

Connect your MCP server to Poke at [poke.com/settings/connections](https://poke.com/settings/connections).

To test the connection, ask Poke something like `Use the "{connection name}" integration's "{tool name}" tool`.

If you run into issues, send `clearhistory` to Poke to reset.

## Customization

Add more tools in `src/index.ts`. See `CLAUDE.md` for detailed patterns and conventions.
