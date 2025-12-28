import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

const TOOLS: Tool[] = [
  {
    name: "getwiki",
    description: "Access Casey's personal wiki at cag.wiki. Without a path, returns a list of all available pages. With a path, returns the text content of that page.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional page path (e.g., 'about', 'projects/foo'). Omit to list all pages.",
        },
      },
    },
  },
  {
    name: "getblog",
    description: "Access Casey's blog at caseyagollan.com. Without a slug, returns a list of recent posts. With a slug, returns the post content.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Optional post slug (e.g., 'my-post-title'). Omit to list recent posts.",
        },
      },
    },
  },
  {
    name: "getgithub",
    description: "Access Casey's GitHub profile and repositories at github.com/caseyg. Without a repo name, returns profile info and repo list. With a repo name, returns that repo's details.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Optional repository name. Omit to get profile and repo list.",
        },
      },
    },
  },
  {
    name: "getmastodon",
    description: "Access Casey's Mastodon posts at social.coop/@CaseyG. Returns recent posts.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of posts to return (default 10, max 40).",
        },
      },
    },
  },
];

// Type guards
interface MCPRequestBody {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

function isMCPRequest(body: unknown): body is MCPRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.method === "string" &&
    (obj.id === undefined || typeof obj.id === "string" || typeof obj.id === "number");
}

interface OptionalStringArg { path?: string; slug?: string; repo?: string; }
interface OptionalNumberArg { limit?: number; }

function isOptionalStringArg(args: unknown): args is OptionalStringArg {
  if (args === undefined || args === null) return true;
  if (typeof args !== "object") return false;
  const obj = args as Record<string, unknown>;
  for (const key of ["path", "slug", "repo"]) {
    if (key in obj && typeof obj[key] !== "string") return false;
  }
  return true;
}

function isOptionalNumberArg(args: unknown): args is OptionalNumberArg {
  if (args === undefined || args === null) return true;
  if (typeof args !== "object") return false;
  const obj = args as Record<string, unknown>;
  if ("limit" in obj && typeof obj.limit !== "number") return false;
  return true;
}

// Extract text content from HTML
function extractText(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<li>/gi, '• ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  return text.trim();
}

// CORS headers
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Origin, X-Request-ID",
    "Access-Control-Max-Age": "86400",
  };
}

function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });
}

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], ...(isError && { isError: true }) };
}

// ============ WIKI ============

async function fetchWikiPage(path: string): Promise<{ text?: string; error?: string }> {
  const sanitizedPath = path.replace(/^\/+|\/+$/g, "");
  const url = `https://cag.wiki/${sanitizedPath}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "CaseyMCP/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { error: `Page not found: ${path}` };
    return { text: extractText(await response.text()) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function getWikiPages(): Promise<{ pages?: string[]; error?: string }> {
  try {
    const response = await fetch("https://cag.wiki/sitemap.xml", {
      headers: { "User-Agent": "CaseyMCP/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { error: "Could not fetch wiki sitemap" };
    const xml = await response.text();
    const pages: string[] = [];
    const pattern = /<loc>https?:\/\/cag\.wiki\/?([^<]*)<\/loc>/g;
    let match;
    while ((match = pattern.exec(xml)) !== null) {
      pages.push(match[1] || "/");
    }
    return { pages };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function handleGetWiki(args: OptionalStringArg) {
  if (args?.path) {
    const result = await fetchWikiPage(args.path);
    return result.error ? toolResult(result.error, true) : toolResult(result.text || "");
  }
  const result = await getWikiPages();
  if (result.error) return toolResult(result.error, true);
  return toolResult(`Wiki pages (${result.pages?.length || 0}):\n${result.pages?.join("\n") || ""}`);
}

// ============ BLOG ============

async function getBlogPosts(): Promise<{ posts?: Array<{ title: string; slug: string; date?: string }>; error?: string }> {
  try {
    // Try fetching the RSS/Atom feed first
    const feedResponse = await fetch("https://caseyagollan.com/feed.xml", {
      headers: { "User-Agent": "CaseyMCP/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (feedResponse.ok) {
      const xml = await feedResponse.text();
      const posts: Array<{ title: string; slug: string; date?: string }> = [];

      // Parse Atom/RSS feed
      const entryPattern = /<entry>[\s\S]*?<\/entry>|<item>[\s\S]*?<\/item>/g;
      let entry;
      while ((entry = entryPattern.exec(xml)) !== null) {
        const entryText = entry[0];
        const titleMatch = /<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i.exec(entryText);
        const linkMatch = /<link[^>]*href=["']([^"']+)["'][^>]*>|<link>([^<]+)<\/link>/i.exec(entryText);
        const dateMatch = /<published>([^<]+)<\/published>|<pubDate>([^<]+)<\/pubDate>|<updated>([^<]+)<\/updated>/i.exec(entryText);

        if (titleMatch) {
          const link = linkMatch?.[1] || linkMatch?.[2] || "";
          const slug = link.replace(/^https?:\/\/[^/]+\/posts\//, "").replace(/\/$/, "") || titleMatch[1].toLowerCase().replace(/\s+/g, "-");
          posts.push({
            title: titleMatch[1],
            slug,
            date: dateMatch?.[1] || dateMatch?.[2] || dateMatch?.[3],
          });
        }
      }
      if (posts.length > 0) return { posts };
    }

    // Fallback: fetch the posts page and extract links
    const response = await fetch("https://caseyagollan.com/posts/", {
      headers: { "User-Agent": "CaseyMCP/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { error: "Could not fetch blog" };

    const html = await response.text();
    const posts: Array<{ title: string; slug: string; date?: string }> = [];
    const linkPattern = /<a[^>]*href=["']\/posts\/([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const slug = match[1].replace(/\/$/, "");
      if (slug && !posts.some(p => p.slug === slug)) {
        posts.push({ title: match[2].trim(), slug });
      }
    }
    return { posts };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function fetchBlogPost(slug: string): Promise<{ text?: string; error?: string }> {
  const sanitizedSlug = slug.replace(/^\/+|\/+$/g, "");
  const url = `https://caseyagollan.com/posts/${sanitizedSlug}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "CaseyMCP/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { error: `Post not found: ${slug}` };
    return { text: extractText(await response.text()) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function handleGetBlog(args: OptionalStringArg) {
  if (args?.slug) {
    const result = await fetchBlogPost(args.slug);
    return result.error ? toolResult(result.error, true) : toolResult(result.text || "");
  }
  const result = await getBlogPosts();
  if (result.error) return toolResult(result.error, true);
  const lines = result.posts?.map(p => `${p.date ? `[${p.date.split("T")[0]}] ` : ""}${p.title} (${p.slug})`);
  return toolResult(`Blog posts (${result.posts?.length || 0}):\n${lines?.join("\n") || ""}`);
}

// ============ GITHUB ============

interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  topics?: string[];
}

interface GitHubProfile {
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  public_repos: number;
  followers: number;
  following: number;
}

async function getGitHubProfile(): Promise<{ profile?: GitHubProfile; repos?: GitHubRepo[]; error?: string }> {
  try {
    const [profileRes, reposRes] = await Promise.all([
      fetch("https://api.github.com/users/caseyg", {
        headers: { "User-Agent": "CaseyMCP/1.0", "Accept": "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(10000),
      }),
      fetch("https://api.github.com/users/caseyg/repos?sort=updated&per_page=30", {
        headers: { "User-Agent": "CaseyMCP/1.0", "Accept": "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    if (!profileRes.ok) return { error: "Could not fetch GitHub profile" };

    const profile = await profileRes.json() as GitHubProfile;
    const repos = reposRes.ok ? await reposRes.json() as GitHubRepo[] : [];

    return { profile, repos };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function getGitHubRepo(name: string): Promise<{ repo?: GitHubRepo; readme?: string; error?: string }> {
  try {
    const [repoRes, readmeRes] = await Promise.all([
      fetch(`https://api.github.com/repos/caseyg/${name}`, {
        headers: { "User-Agent": "CaseyMCP/1.0", "Accept": "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`https://api.github.com/repos/caseyg/${name}/readme`, {
        headers: { "User-Agent": "CaseyMCP/1.0", "Accept": "application/vnd.github.v3.raw" },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    if (!repoRes.ok) return { error: `Repository not found: ${name}` };

    const repo = await repoRes.json() as GitHubRepo;
    const readme = readmeRes.ok ? await readmeRes.text() : undefined;

    return { repo, readme };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function handleGetGithub(args: OptionalStringArg) {
  if (args?.repo) {
    const result = await getGitHubRepo(args.repo);
    if (result.error) return toolResult(result.error, true);
    const r = result.repo!;
    let text = `# ${r.name}\n`;
    text += r.description ? `${r.description}\n\n` : "\n";
    text += `Language: ${r.language || "N/A"} | Stars: ${r.stargazers_count} | Forks: ${r.forks_count}\n`;
    text += `URL: ${r.html_url}\n`;
    if (r.topics?.length) text += `Topics: ${r.topics.join(", ")}\n`;
    if (result.readme) text += `\n---\n\n${result.readme}`;
    return toolResult(text);
  }

  const result = await getGitHubProfile();
  if (result.error) return toolResult(result.error, true);

  const p = result.profile!;
  let text = `# ${p.name || "caseyg"}\n`;
  if (p.bio) text += `${p.bio}\n`;
  text += `\n`;
  if (p.company) text += `Company: ${p.company}\n`;
  if (p.location) text += `Location: ${p.location}\n`;
  if (p.blog) text += `Website: ${p.blog}\n`;
  text += `Repos: ${p.public_repos} | Followers: ${p.followers} | Following: ${p.following}\n`;
  text += `\n## Recent Repositories\n\n`;

  for (const r of result.repos || []) {
    text += `• ${r.name}`;
    if (r.language) text += ` (${r.language})`;
    if (r.stargazers_count) text += ` ★${r.stargazers_count}`;
    if (r.description) text += ` - ${r.description}`;
    text += `\n`;
  }

  return toolResult(text);
}

// ============ MASTODON ============

interface MastodonPost {
  id: string;
  created_at: string;
  content: string;
  url: string;
  reblogs_count: number;
  favourites_count: number;
  reblog?: { content: string; account: { acct: string } };
}

interface MastodonAccount {
  id: string;
  username: string;
  display_name: string;
  note: string;
  followers_count: number;
  following_count: number;
  statuses_count: number;
}

async function getMastodonPosts(limit: number): Promise<{ posts?: MastodonPost[]; account?: MastodonAccount; error?: string }> {
  try {
    // First, look up the account ID
    const lookupRes = await fetch("https://social.coop/api/v1/accounts/lookup?acct=CaseyG", {
      headers: { "User-Agent": "CaseyMCP/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!lookupRes.ok) return { error: "Could not find Mastodon account" };
    const account = await lookupRes.json() as MastodonAccount;

    // Fetch recent statuses
    const statusesRes = await fetch(`https://social.coop/api/v1/accounts/${account.id}/statuses?limit=${limit}&exclude_replies=true`, {
      headers: { "User-Agent": "CaseyMCP/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!statusesRes.ok) return { error: "Could not fetch Mastodon posts" };
    const posts = await statusesRes.json() as MastodonPost[];

    return { posts, account };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function handleGetMastodon(args: OptionalNumberArg) {
  const limit = Math.min(Math.max(args?.limit || 10, 1), 40);
  const result = await getMastodonPosts(limit);

  if (result.error) return toolResult(result.error, true);

  const a = result.account!;
  let text = `# @${a.username} on social.coop\n`;
  text += `${extractText(a.note)}\n`;
  text += `Posts: ${a.statuses_count} | Followers: ${a.followers_count} | Following: ${a.following_count}\n`;
  text += `\n## Recent Posts\n\n`;

  for (const p of result.posts || []) {
    const date = p.created_at.split("T")[0];
    const content = p.reblog
      ? `🔁 @${p.reblog.account.acct}: ${extractText(p.reblog.content)}`
      : extractText(p.content);
    text += `[${date}] ${content}\n`;
    text += `  ↳ ${p.url} (★${p.favourites_count} 🔁${p.reblogs_count})\n\n`;
  }

  return toolResult(text);
}

// ============ MAIN HANDLER ============

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: getCorsHeaders() });
    }

    if (url.pathname !== "/mcp" && url.pathname !== "/") {
      return createJsonResponse({ error: { code: -32000, message: "Use /mcp endpoint" } }, 404);
    }

    if (request.method !== "POST") {
      return createJsonResponse({ error: { code: -32000, message: "POST required" } }, 405);
    }

    const contentType = request.headers.get("Content-Type");
    if (!contentType?.includes("application/json")) {
      return createJsonResponse({ error: { code: -32700, message: "JSON required" } }, 400);
    }

    try {
      const body = await request.json();
      if (!isMCPRequest(body)) throw new Error("Invalid MCP request");

      const requestId = body.id;

      if (body.method === "tools/list") {
        ListToolsRequestSchema.safeParse(body);
        return createJsonResponse({
          jsonrpc: "2.0",
          id: requestId,
          result: { tools: TOOLS },
        });
      }

      if (body.method === "tools/call") {
        CallToolRequestSchema.safeParse(body);
        const params = body.params;
        if (!params?.name) throw new Error("Missing tool name");

        const { name, arguments: args } = params;
        let result;

        switch (name) {
          case "getwiki":
            if (!isOptionalStringArg(args)) throw new Error("Invalid arguments");
            result = await handleGetWiki(args || {});
            break;
          case "getblog":
            if (!isOptionalStringArg(args)) throw new Error("Invalid arguments");
            result = await handleGetBlog(args || {});
            break;
          case "getgithub":
            if (!isOptionalStringArg(args)) throw new Error("Invalid arguments");
            result = await handleGetGithub(args || {});
            break;
          case "getmastodon":
            if (!isOptionalNumberArg(args)) throw new Error("Invalid arguments");
            result = await handleGetMastodon(args || {});
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return createJsonResponse({
          jsonrpc: "2.0",
          id: requestId,
          result,
        });
      }

      if (body.method === "initialize") {
        return createJsonResponse({
          jsonrpc: "2.0",
          id: requestId,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, prompts: {}, resources: {} },
            serverInfo: { name: "Casey's Public Info MCP", version: "1.0.0" },
          },
        });
      }

      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 204, headers: getCorsHeaders() });
      }

      throw new Error(`Unknown method: ${body.method}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return createJsonResponse({
        jsonrpc: "2.0",
        error: { code: -32603, message: msg },
      }, 500);
    }
  },
};
