import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Posts live in src/content/blog/<lang>/<slug>.md — the folder sets the language,
// the file name sets the URL slug. `translationKey` links all language versions of one
// article (hreflang + language switcher).
//
// Lifecycle: a routine writes the Polish draft (draft: true);
// The owner edits it in /admin and ticks `ready`; the publisher routine translates it into
// every other language and flips `draft` to false on all versions at once.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().max(80),
    description: z.string().min(20).max(170),
    pubDate: z.coerce.date(),
    // The CMS writes '' (or null) when the field is left empty.
    updatedDate: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.date().optional()),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    /** Set by the owner in the CMS: "done editing — translate and publish". */
    ready: z.boolean().default(false),
    translationKey: z.string().optional(),
    // Who/what drafted it. Kept for the style-learning loop, never rendered.
    draftedBy: z.string().optional(),
    // Translations only: hash of the Polish source they were made from, so the publisher
    // knows to re-translate when the Polish version changes.
    sourceHash: z.string().optional(),
    // Target keyword from seo/keywords.md the article is written for.
    keyword: z.string().optional(),
  }),
});

export const collections = { blog };
