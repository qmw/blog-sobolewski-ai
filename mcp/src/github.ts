// Minimal GitHub REST client — just the calls the blog workflow needs.

const API = 'https://api.github.com';

export class GitHub {
  readonly repo: string;
  readonly base: string;
  private token: string;

  constructor(opts: { token: string; repo: string; base: string }) {
    this.token = opts.token;
    this.repo = opts.repo;
    this.base = opts.base;
  }

  async request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'blog-mcp',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) throw new NotFound(`${method} ${path}`);
    if (!res.ok) throw new Error(`GitHub ${method} ${path} → ${res.status}: ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  /** Returns file text and blob sha, or null when the file does not exist at `ref`. */
  async getFile(path: string, ref = this.base): Promise<{ text: string; sha: string } | null> {
    try {
      const f = await this.request<{ content: string; sha: string }>(
        'GET',
        `/repos/${this.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      );
      return { text: Buffer.from(f.content, 'base64').toString('utf8'), sha: f.sha };
    } catch (e) {
      if (e instanceof NotFound) return null;
      throw e;
    }
  }

  async listDir(path: string, ref = this.base): Promise<{ name: string; path: string; type: string }[]> {
    try {
      return await this.request('GET', `/repos/${this.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
    } catch (e) {
      if (e instanceof NotFound) return [];
      throw e;
    }
  }

  async putFile(path: string, text: string, message: string, branch: string) {
    const existing = await this.getFile(path, branch);
    return this.request('PUT', `/repos/${this.repo}/contents/${encodePath(path)}`, {
      message,
      content: Buffer.from(text, 'utf8').toString('base64'),
      branch,
      ...(existing ? { sha: existing.sha } : {}),
    });
  }

  async createBranch(name: string) {
    const ref = await this.request<{ object: { sha: string } }>('GET', `/repos/${this.repo}/git/ref/heads/${this.base}`);
    await this.request('POST', `/repos/${this.repo}/git/refs`, { ref: `refs/heads/${name}`, sha: ref.object.sha });
  }

  async branchExists(name: string) {
    try {
      await this.request('GET', `/repos/${this.repo}/git/ref/heads/${encodePath(name)}`);
      return true;
    } catch (e) {
      if (e instanceof NotFound) return false;
      throw e;
    }
  }

  async openPr(head: string, title: string, body: string, labels: string[]) {
    const pr = await this.request<{ number: number; html_url: string }>('POST', `/repos/${this.repo}/pulls`, {
      head,
      base: this.base,
      title,
      body,
    });
    if (labels.length) {
      await this.request('POST', `/repos/${this.repo}/issues/${pr.number}/labels`, { labels }).catch(() => {});
    }
    return pr;
  }
}

export class NotFound extends Error {}

function encodePath(p: string) {
  return p.split('/').map(encodeURIComponent).join('/');
}
