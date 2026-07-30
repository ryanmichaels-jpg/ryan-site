import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { site } from '../site';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('posts')).filter((p) => !p.data.draft);
  return rss({
    title: site.name,
    description: site.tagline,
    site: context.site!,
    items: posts
      .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
      .map((p) => ({
        title: p.data.title,
        description: p.data.dek,
        pubDate: p.data.date,
        link: `/${p.id}/`,
      })),
  });
}
