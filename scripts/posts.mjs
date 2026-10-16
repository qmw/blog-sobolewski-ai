#!/usr/bin/env node
// Blog status helper for routines and humans.
//
//   node scripts/posts.mjs status        → JSON: every Polish post, its state, and which
//                                          translations are missing or stale
//   node scripts/posts.mjs hash <slug>   → source hash of a Polish post (put it in each
//                                          translation's `sourceHash`)
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

const ROOT = new URL('../src/content/blog/', import.meta.url).pathname;
export const LANGS = ['pl', 'en', 'de', 'es', 'fr', 'it', 'ar', 'ja', 'zh'];
const TARGETS = LANGS.filter((l) => l !== 'pl');

function read(path) {
  const src = readFileSync(path, 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m ? { data: YAML.parse(m[1]) ?? {}, body: m[2] } : { data: {}, body: src };
}

function list(lang) {
  const dir = join(ROOT, lang);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => ({ slug: f.replace(/\.mdx?$/, ''), path: join(dir, f), ...read(join(dir, f)) }));
}

export function sourceHash({ data, body }) {
  const canon = [data.title ?? '', data.description ?? '', (data.tags ?? []).join(','), body.trim()].join('\n\u0000\n');
  return createHash('sha256').update(canon).digest('hex').slice(0, 16);
}

function status() {
  const byKey = new Map();
  for (const l of TARGETS) {
    for (const p of list(l)) {
      if (!p.data.translationKey) continue;
      if (!byKey.has(p.data.translationKey)) byKey.set(p.data.translationKey, {});
      byKey.get(p.data.translationKey)[l] = p;
    }
  }
  return list('pl').map((p) => {
    const hash = sourceHash(p);
    const tr = byKey.get(p.data.translationKey) ?? {};
    const missing = TARGETS.filter((l) => !tr[l]);
    const stale = TARGETS.filter((l) => tr[l] && tr[l].data.sourceHash !== hash);
    const state = p.data.draft === false ? 'published' : p.data.ready ? 'ready' : 'draft';
    return {
      slug: p.slug,
      title: p.data.title,
      state,
      keyword: p.data.keyword ?? null,
      translationKey: p.data.translationKey ?? null,
      draftedBy: p.data.draftedBy ?? null,
      sourceHash: hash,
      translations: Object.fromEntries(Object.entries(tr).map(([l, t]) => [l, { slug: t.slug, draft: t.data.draft !== false }])),
      missing,
      stale,
      // What the publisher routine should do with this post.
      action:
        state === 'draft'
          ? 'none (waiting for the owner)'
          : !p.data.translationKey
            ? 'add translationKey, then translate'
            : missing.length || stale.length
              ? 'translate'
              : state === 'ready'
                ? 'publish'
                : 'none',
    };
  });
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'status') console.log(JSON.stringify(status(), null, 2));
else if (cmd === 'hash' && arg) {
  const p = join(ROOT, 'pl', `${arg}.md`);
  if (!existsSync(p)) {
    console.error(`No Polish post ${p}`);
    process.exit(1);
  }
  console.log(sourceHash(read(p)));
} else {
  console.error('Usage: node scripts/posts.mjs status | hash <slug>');
  process.exit(1);
}
