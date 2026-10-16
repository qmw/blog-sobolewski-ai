#!/usr/bin/env node
// example.com blog MCP server.
//
// Every post an agent writes becomes a GitHub pull request. The owner reviews and edits
// it there (Vercel builds a preview of every PR); merging publishes it. After merge,
// agents compare their original draft with the final version and distill the
// differences into STYLE.md, so each review makes the next draft closer to their voice.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import YAML from 'yaml';
import { GitHub } from './github.ts';

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN is required (fine-grained token with Contents + Pull requests read/write on the site repo).');
  process.exit(1);
}
const gh = new GitHub({
  token,
  repo: process.env.GITHUB_REPO ?? 'your-github-user/your-repo',
  base: process.env.GITHUB_BASE_BRANCH ?? 'main',
});

const BLOG_DIR = 'src/content/blog';
const STYLE_FILE = 'STYLE.md';
const POST_LABEL = 'blog-post';
const LEARNED_LABEL = 'style-learned';

const Lang = z.enum(['pl', 'en', 'de', 'es', 'fr', 'it', 'ar', 'ja', 'zh']);
const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase-kebab-case, ASCII only (no Polish diacritics)')
  .max(80);

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70)
    .replace(/-$/, '');
}

function parsePost(src: string) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {} as Record<string, unknown>, body: src };
  return { data: (YAML.parse(m[1]) ?? {}) as Record<string, unknown>, body: m[2] };
}

function serializePost(data: Record<string, unknown>, body: string) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  return `---\n${YAML.stringify(clean).trimEnd()}\n---\n\n${body.trim()}\n`;
}

const postPath = (lang: string, slug: string) => `${BLOG_DIR}/${lang}/${slug}.md`;
const today = () => new Date().toISOString().slice(0, 10);

const server = new McpServer(
  { name: 'blog', version: '0.1.0' },
  {
    instructions:
      'Blog for example.com (the site owner). ALWAYS call get_writing_guide before drafting or editing, and follow STYLE.md strictly. ' +
      'New posts go out as pull requests via create_post; never claim a post is published until its PR is merged. ' +
      'After a post PR is merged, call get_review_diff and record what the owner changed with add_style_rules.',
  },
);

server.registerTool(
  'get_writing_guide',
  {
    title: 'Get writing guide',
    description:
      "Returns STYLE.md: The owner's voice, rules learned from their past edits, SEO and formatting requirements. Call this before writing anything.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const style = await gh.getFile(STYLE_FILE);
    return text(style?.text ?? 'STYLE.md not found in the repository.');
  },
);

server.registerTool(
  'list_posts',
  {
    title: 'List posts',
    description: 'Lists published posts and drafts on the main branch, plus open post pull requests awaiting review.',
    inputSchema: { lang: Lang.optional().describe('Filter by language') },
    annotations: { readOnlyHint: true },
  },
  async ({ lang }) => {
    const langs = lang ? [lang] : Lang.options;
    const posts = [];
    for (const l of langs) {
      for (const f of await gh.listDir(`${BLOG_DIR}/${l}`)) {
        if (f.type !== 'file' || !/\.mdx?$/.test(f.name)) continue;
        const file = await gh.getFile(f.path);
        const { data } = parsePost(file?.text ?? '');
        posts.push({
          lang: l,
          slug: f.name.replace(/\.mdx?$/, ''),
          title: data.title,
          pubDate: data.pubDate,
          draft: data.draft ?? false,
          tags: data.tags,
          translationKey: data.translationKey,
        });
      }
    }
    const prs = await gh.request<any[]>('GET', `/repos/${gh.repo}/pulls?state=open&per_page=50`);
    const inReview = prs
      .filter((p) => p.labels?.some((x: { name: string }) => x.name === POST_LABEL))
      .map((p) => ({ number: p.number, title: p.title, branch: p.head.ref, url: p.html_url }));
    return json({ posts, inReview });
  },
);

server.registerTool(
  'get_post',
  {
    title: 'Get post',
    description: 'Returns the full Markdown source (frontmatter + body) of a post. Use `ref` to read it from a PR branch.',
    inputSchema: {
      lang: Lang,
      slug: Slug,
      ref: z.string().optional().describe('Branch or commit; defaults to main'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ lang, slug, ref }) => {
    const f = await gh.getFile(postPath(lang, slug), ref ?? gh.base);
    return text(f?.text ?? `No post at ${postPath(lang, slug)} on ${ref ?? gh.base}.`);
  },
);

const postFields = {
  title: z.string().min(10).max(80).describe('Headline, max ~60 chars ideally; include the main keyword'),
  description: z
    .string()
    .min(20)
    .max(170)
    .describe('Meta description shown in Google results, 120-160 chars, must make people want to click'),
  body: z.string().min(200).describe('Markdown body WITHOUT frontmatter and WITHOUT an H1 (the title is the H1). Use ## and ### headings.'),
  tags: z.array(z.string()).max(6).default([]),
  translationKey: z
    .string()
    .optional()
    .describe('Same value on every language version of one article, so they link to each other'),
};

server.registerTool(
  'create_post',
  {
    title: 'Create post (opens a PR for review)',
    description:
      'Drafts a new post as a pull request on the site repo. Vercel builds a preview of the PR; the owner reviews and edits it there, and merging publishes it. ' +
      'To add the other language version of the same article, call again with `branch` set to the branch returned by the first call.',
    inputSchema: {
      lang: Lang,
      slug: Slug.optional().describe('URL slug; derived from the title if omitted. Use the post language (Polish words for PL posts, without diacritics).'),
      ...postFields,
      sources: z.array(z.string().url()).default([]).describe('Links the post is based on — listed in the PR for the reviewer, not published'),
      agent: z.string().default('ai-agent').describe('Who drafted it, e.g. "claude-news-digest"'),
      branch: z.string().optional().describe('Existing post branch to add this file to (for translations)'),
    },
  },
  async ({ lang, slug, title, description, body, tags, translationKey, sources, agent, branch }) => {
    const s = slug ?? slugify(title);
    const path = postPath(lang, s);
    if (await gh.getFile(path)) return text(`A post already exists at ${path} on ${gh.base}. Pick another slug or use update_post.`);

    const content = serializePost(
      { title, description, pubDate: today(), tags, translationKey: translationKey ?? s, draft: false, draftedBy: agent },
      body,
    );

    if (branch) {
      if (!(await gh.branchExists(branch))) return text(`Branch ${branch} does not exist.`);
      await gh.putFile(path, content, `post(${lang}): ${title}`, branch);
      return json({ branch, path, note: 'Added to the existing pull request.' });
    }

    const newBranch = `post/${s}`;
    if (await gh.branchExists(newBranch)) return text(`Branch ${newBranch} already exists — a PR for this slug may already be open.`);
    await gh.createBranch(newBranch);
    await gh.putFile(path, content, `post(${lang}): ${title}`, newBranch);
    const pr = await gh.openPr(
      newBranch,
      `Post: ${title}`,
      [
        `New ${lang.toUpperCase()} post drafted by **${agent}**.`,
        '',
        `**Description:** ${description}`,
        '',
        sources.length ? `**Sources:**\n${sources.map((u) => `- ${u}`).join('\n')}` : '',
        '',
        '### Review',
        '- Edit the file directly in this PR (Files changed → ⋯ → Edit file), or leave review comments.',
        '- Check the Vercel preview link below before merging.',
        '- **Merge = publish.** After merge an agent compares the draft with your final version and updates STYLE.md.',
      ].join('\n'),
      [POST_LABEL],
    );
    return json({ pr: pr.html_url, number: pr.number, branch: newBranch, path });
  },
);

server.registerTool(
  'update_post',
  {
    title: 'Update post',
    description:
      'Rewrites fields of a post on a branch (a PR branch during review, or main for corrections to a published post — main publishes immediately, so only do that when asked).',
    inputSchema: {
      lang: Lang,
      slug: Slug,
      branch: z.string().describe('Branch to commit to, e.g. post/my-slug'),
      title: postFields.title.optional(),
      description: postFields.description.optional(),
      body: postFields.body.optional(),
      tags: z.array(z.string()).max(6).optional(),
      translationKey: z.string().optional(),
      draft: z.boolean().optional(),
      message: z.string().optional().describe('Commit message'),
    },
  },
  async ({ lang, slug, branch, body, message, ...fields }) => {
    const path = postPath(lang, slug);
    const current = await gh.getFile(path, branch);
    if (!current) return text(`No post at ${path} on ${branch}.`);
    const parsed = parsePost(current.text);
    const data = { ...parsed.data, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
    if (branch === gh.base) data.updatedDate = today();
    await gh.putFile(path, serializePost(data, body ?? parsed.body), message ?? `post(${lang}): update ${slug}`, branch);
    return json({ ok: true, branch, path });
  },
);

server.registerTool(
  'list_reviews_to_learn',
  {
    title: 'List reviews to learn from',
    description: 'Merged post pull requests whose edits have not yet been distilled into STYLE.md.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const prs = await gh.request<any[]>('GET', `/repos/${gh.repo}/pulls?state=closed&per_page=50&sort=updated&direction=desc`);
    const todo = prs
      .filter((p) => p.merged_at)
      .filter((p) => p.labels?.some((x: { name: string }) => x.name === POST_LABEL))
      .filter((p) => !p.labels?.some((x: { name: string }) => x.name === LEARNED_LABEL))
      .map((p) => ({ number: p.number, title: p.title, merged_at: p.merged_at, url: p.html_url }));
    return json(todo);
  },
);

server.registerTool(
  'get_review_diff',
  {
    title: 'Get review diff',
    description:
      "For a post PR, returns the agent's ORIGINAL draft of each post file next to the owner's FINAL version, plus their review comments. Use it to learn their style.",
    inputSchema: { pr_number: z.number().int() },
    annotations: { readOnlyHint: true },
  },
  async ({ pr_number }) => {
    const pr = await gh.request<any>('GET', `/repos/${gh.repo}/pulls/${pr_number}`);
    const commits = await gh.request<any[]>('GET', `/repos/${gh.repo}/pulls/${pr_number}/commits?per_page=100`);
    const files = await gh.request<any[]>('GET', `/repos/${gh.repo}/pulls/${pr_number}/files?per_page=100`);
    const finalRef = pr.merged ? pr.merge_commit_sha : pr.head.sha;

    const out = [];
    for (const f of files.filter((x) => x.filename.startsWith(BLOG_DIR))) {
      // The original draft is the version from the earliest commit that contains the file.
      let original: string | null = null;
      for (const c of commits) {
        const v = await gh.getFile(f.filename, c.sha);
        if (v) {
          original = v.text;
          break;
        }
      }
      const final = await gh.getFile(f.filename, finalRef);
      out.push({ path: f.filename, original, final: final?.text ?? null, changed: original !== final?.text });
    }
    const reviewComments = await gh.request<any[]>('GET', `/repos/${gh.repo}/pulls/${pr_number}/comments?per_page=100`);
    const issueComments = await gh.request<any[]>('GET', `/repos/${gh.repo}/issues/${pr_number}/comments?per_page=100`);
    const reviews = await gh.request<any[]>('GET', `/repos/${gh.repo}/pulls/${pr_number}/reviews?per_page=100`);
    const comments = [
      ...reviews.filter((r) => r.body).map((r) => ({ type: 'review', body: r.body })),
      ...reviewComments.map((c) => ({ type: 'line', path: c.path, quote: c.diff_hunk?.split('\n').slice(-3).join('\n'), body: c.body })),
      ...issueComments.filter((c) => !/vercel|cloudflare/i.test(c.user?.login ?? '')).map((c) => ({ type: 'comment', body: c.body })),
    ];
    return json({ pr: { number: pr.number, title: pr.title, merged: pr.merged }, files: out, comments });
  },
);

server.registerTool(
  'add_style_rules',
  {
    title: 'Add style rules',
    description:
      "Appends rules learned from the owner's edits to STYLE.md (committed to main) and marks the PR as learned. Rules must be concrete and actionable " +
      '(e.g. "Never open with a rhetorical question" — not "write better"). Skip rules STYLE.md already contains; if a new edit contradicts an old rule, say so in the rule.',
    inputSchema: {
      rules: z.array(z.string().min(10)).min(1).max(15),
      pr_number: z.number().int().optional().describe('The PR the rules were learned from'),
      lang: z.enum(['pl', 'en', 'both']).default('both'),
    },
  },
  async ({ rules, pr_number, lang }) => {
    const style = await gh.getFile(STYLE_FILE);
    if (!style) return text('STYLE.md not found.');
    const tag = lang === 'both' ? '' : ` [${lang.toUpperCase()}]`;
    const src = pr_number ? ` (PR #${pr_number})` : '';
    const entry = `\n### ${today()}${src}${tag}\n${rules.map((r) => `- ${r}`).join('\n')}\n`;
    await gh.putFile(STYLE_FILE, style.text.trimEnd() + '\n' + entry, `style: learn from ${pr_number ? `PR #${pr_number}` : 'review'}`, gh.base);
    if (pr_number) {
      await gh.request('POST', `/repos/${gh.repo}/issues/${pr_number}/labels`, { labels: [LEARNED_LABEL] }).catch(() => {});
    }
    return json({ ok: true, added: rules.length });
  },
);

await server.connect(new StdioServerTransport());
