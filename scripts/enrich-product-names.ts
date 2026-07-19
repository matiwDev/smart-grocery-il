/**
 * Translates products.name_he to products.name_en for every product missing
 * an English name, batching 50 names per Claude API call (Haiku 4.5 — cheap,
 * fast, plenty for short product-name translation). Makes the English search
 * and English UI mode actually useful (previously name_en was null for every
 * feed-seeded product — see scripts/seed-products-from-feed.ts).
 *
 * Requires ANTHROPIC_API_KEY in .env.local (not currently configured in this
 * repo's env — see CLAUDE.md).
 *
 * Run with: npm run enrich:names
 */
import Anthropic from '@anthropic-ai/sdk';
import { requireEnv, restFetch, chunk } from './supabase-rest';

requireEnv();

const BATCH_SIZE = 50;
const MODEL = 'claude-haiku-4-5';

const anthropic = new Anthropic();

interface ProductRow {
  id: string;
  name_he: string;
}

async function fetchProductsMissingEnglishName(): Promise<ProductRow[]> {
  const res = await restFetch('products?select=id,name_he&name_en=is.null&name_he=not.is.null');
  if (!res.ok) {
    throw new Error(`Failed to fetch products missing name_en: HTTP ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ProductRow[];
}

function extractJsonArray(text: string): string[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON array found in response: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
    throw new Error('Parsed value is not a JSON array of strings');
  }
  return parsed;
}

async function translateBatch(names: string[]): Promise<string[]> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content:
          'Translate these Israeli grocery product names from Hebrew to English. ' +
          'Return ONLY a JSON array of strings in the same order. Names: ' +
          JSON.stringify(names),
      },
    ],
  });

  const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('No text block in Claude response');

  const translations = extractJsonArray(textBlock.text);
  if (translations.length !== names.length) {
    throw new Error(`Expected ${names.length} translations, got ${translations.length}`);
  }
  return translations;
}

async function updateProductNameEn(id: string, nameEn: string): Promise<void> {
  const res = await restFetch(`products?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ name_en: nameEn }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update product ${id}: HTTP ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const products = await fetchProductsMissingEnglishName();
  console.log(`[enrich] ${products.length} products missing name_en`);

  let enriched = 0;
  let failedBatches = 0;

  for (const batch of chunk(products, BATCH_SIZE)) {
    try {
      const translations = await translateBatch(batch.map((p) => p.name_he));
      for (let i = 0; i < batch.length; i++) {
        await updateProductNameEn(batch[i].id, translations[i]);
        enriched++;
      }
      console.log(`[enrich]   translated batch of ${batch.length}`);
    } catch (err) {
      failedBatches++;
      console.error(`[enrich]   batch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${enriched} products enriched with name_en` + (failedBatches ? ` (${failedBatches} batches failed)` : ''));
  process.exit(failedBatches > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[enrich] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
