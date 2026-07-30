import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    // Short line under the title. Keep it to one sentence.
    dek: z.string(),
    date: z.coerce.date(),
    // Set true to keep a post off the writing index while you draft it.
    draft: z.boolean().default(false),
    // Optional: what the reader walks away with. Shown on the index.
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { posts };
