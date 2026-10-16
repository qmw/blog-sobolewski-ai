import type { APIContext } from 'astro';
import { prefixedLangs, type Lang } from '@/i18n';
import { blogFeed } from '@/lib/rss';

export function getStaticPaths() {
  return prefixedLangs.map((lang) => ({ params: { lang } }));
}

export const GET = (context: APIContext) => blogFeed(context, context.params.lang as Lang);
