# MCP Server Template

A minimal MCP server template with two deployment options:
- **Python/Render**: FastMCP server with Render deployment
- **TypeScript/Cloudflare Workers**: MCP server using Cloudflare Workers

## Python Version (FastMCP + Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/InteractionCo/mcp-server-template)

### Local Development

#### Setup

Fork the repo, then run:

```bash
git clone <your-repo-url>
cd mcp-server-template
conda create -n mcp-server python=3.13
conda activate mcp-server
pip install -r requirements.txt
```

#### Test

```bash
python src/server.py
# then in another terminal run:
npx @modelcontextprotocol/inspector
```

Open http://localhost:3000 and connect to `http://localhost:8000/mcp` using "Streamable HTTP" transport (NOTE THE `/mcp`!).

### Deployment to Render

#### Option 1: One-Click Deploy
Click the "Deploy to Render" button above.

#### Option 2: Manual Deployment
1. Fork this repository
2. Connect your GitHub account to Render
3. Create a new Web Service on Render
4. Connect your forked repository
5. Render will automatically detect the `render.yaml` configuration

Your server will be available at `https://your-service-name.onrender.com/mcp` (NOTE THE `/mcp`!)

## TypeScript Version (Cloudflare Workers)

### Local Development

#### Prerequisites
- Node.js 18+ installed
- Cloudflare account (free tier works)
- Wrangler CLI installed: `npm install -g wrangler`

#### Setup

```bash
git clone <your-repo-url>
cd mcp-server-template
git checkout cloudflare
npm install
```

#### Test Locally

```bash
npm run dev
# or
wrangler dev
```

Your local server will be available at `http://localhost:8787/mcp`

Test with the MCP Inspector:
```bash
npx @modelcontextprotocol/inspector
```

Open http://localhost:3000 and connect to `http://localhost:8787/mcp` using "Streamable HTTP" transport.

### Deployment to Cloudflare Workers

#### Initial Setup

1. **Authenticate with Cloudflare**
   ```bash
   wrangler login
   ```

2. **Update Configuration**
   Edit `wrangler.toml` to customize your worker name:
   ```toml
   name = "your-mcp-server-name"
   ```

#### Deploy

```bash
npm run deploy
# or
wrangler deploy
```

Your server will be available at `https://your-mcp-server-name.<your-subdomain>.workers.dev/mcp`

#### Benefits of Cloudflare Workers
- **Global Edge Network**: Your MCP server runs on Cloudflare's edge network for low latency worldwide
- **Generous Free Tier**: 100,000 requests/day on the free plan
- **Instant Deployment**: Deploy in seconds with zero cold starts
- **Built-in Scaling**: Automatically scales to handle traffic spikes

## Poke Setup

You can connect your MCP server to Poke at [poke.com/settings/connections](https://poke.com/settings/connections).

To test the connection explicitly, ask poke something like `Tell the subagent to use the "{connection name}" integration's "{tool name}" tool`.

If you run into persistent issues of poke not calling the right MCP (e.g. after you've renamed the connection) you may send `clearhistory` to poke to delete all message history and start fresh.

We're working hard on improving the integration use of Poke :)

## Customization

### Python Version

Add more tools by decorating functions with `@mcp.tool`:

```python
@mcp.tool
def calculate(x: float, y: float, operation: str) -> float:
    """Perform basic arithmetic operations."""
    if operation == "add":
        return x + y
    elif operation == "multiply":
        return x * y
    # ...
```

### TypeScript Version

Add more tools in `src/index.ts`:

```typescript
server.tool("calculate", "Perform basic arithmetic operations", {
  x: z.number().describe("First number"),
  y: z.number().describe("Second number"),
  operation: z.enum(["add", "multiply"]).describe("Operation to perform")
}, async ({ x, y, operation }) => {
  if (operation === "add") {
    return { content: [{ type: "text", text: String(x + y) }] };
  } else if (operation === "multiply") {
    return { content: [{ type: "text", text: String(x * y) }] };
  }
});
```
