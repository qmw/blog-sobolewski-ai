# blog MCP server

Lets any MCP-capable agent (Claude Code, Claude Desktop, Cursor, custom agents…) write posts for example.com. It works over the GitHub API, so the agent does not need a local checkout.

## Flow

```
agent ── create_post ──▶ PR "Post: …" (label blog-post) ──▶ Vercel preview
                                   │
                   the owner edits / comments in the PR
                                   │
                              merge = publish
                                   │
agent ── list_reviews_to_learn → get_review_diff → add_style_rules ──▶ STYLE.md
```

## Tools

| Tool | What it does |
| --- | --- |
| `get_writing_guide` | Returns `STYLE.md`. Agents call it before writing. |
| `list_posts` | Posts on `main` + open post PRs. |
| `get_post` | Raw Markdown of a post (from `main` or a branch). |
| `create_post` | Creates `post/<slug>` branch + PR. Pass `branch` to add the other-language version to the same PR. |
| `update_post` | Edits a post on a branch. |
| `list_reviews_to_learn` | Merged post PRs not yet distilled into `STYLE.md`. |
| `get_review_diff` | Agent's original draft vs. the owner's final version + review comments. |
| `add_style_rules` | Appends learned rules to `STYLE.md`, labels the PR `style-learned`. |

## Setup

1. Create a **fine-grained GitHub token** for the `your-github-user` account → repository access: only `your-repo` → permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Issues: Read and write** (labels).
2. `cd mcp && npm install` (Node ≥ 22.18; runs the TypeScript directly).
3. Register it with your agent:

**Claude Code (this repo):** already configured in `.mcp.json`. Export the token in your shell profile:
```bash
export BLOG_GITHUB_TOKEN=github_pat_...
```

**Claude Code (any directory):**
```bash
claude mcp add blog --scope user \
  -e GITHUB_TOKEN=github_pat_... -e GITHUB_REPO=your-github-user/your-repo \
  -- node /path/to/repo/mcp/src/index.ts
```

**Claude Desktop / other clients** (`mcpServers` JSON):
```json
{
  "blog": {
    "command": "node",
    "args": ["/path/to/repo/mcp/src/index.ts"],
    "env": { "GITHUB_TOKEN": "github_pat_...", "GITHUB_REPO": "your-github-user/your-repo" }
  }
}
```

Env vars: `GITHUB_TOKEN` (required), `GITHUB_REPO` (default `your-github-user/your-repo`), `GITHUB_BASE_BRANCH` (default `main`).
