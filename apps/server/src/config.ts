import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const RESOURCE_KEY = /^(run|sql|pubsub|storage|scheduler|redis|vm)\/.+$/;

const resourceKey = z.string().regex(RESOURCE_KEY, {
  message: 'must be "<type>/<name>" where type is run|sql|pubsub|storage|scheduler|redis|vm',
});

const edgeSchema = z.union([
  z.tuple([resourceKey, resourceKey]),
  z.tuple([resourceKey, resourceKey, z.string().min(1)]),
]);

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  edges: z.array(edgeSchema).default([]),
  layout: z
    .record(resourceKey, z.tuple([z.number().int().min(0), z.number().int().min(0)]))
    .default({}),
});

const configSchema = z.object({
  projects: z.array(projectSchema).min(1),
  billing: z
    .object({
      /** `project.dataset.gcp_billing_export_v1_XXXX` — enables actual costs. */
      bigqueryTable: z
        .string()
        .regex(/^[\w-]+\.[\w$]+\.[\w$]+$/, {
          message: 'must be "project.dataset.table"',
        })
        .optional(),
    })
    .default({}),
  poll: z
    .object({
      resourcesSeconds: z.number().int().min(5).default(60),
      eventsSeconds: z.number().int().min(5).default(30),
    })
    .default({}),
  events: z
    .object({
      lookbackHours: z.number().int().min(1).default(24),
      maxEntries: z.number().int().min(1).default(100),
    })
    .default({}),
});

export type ProjectConfig = z.infer<typeof projectSchema>;
export type AmonSulConfig = z.infer<typeof configSchema>;

export const CONFIG_FILENAME = 'amon-sul.config.yaml';

/**
 * Find the config file by walking up from cwd — the dev server runs with
 * apps/server as its working directory while the config conventionally
 * lives at the repo root. Returns null when no file is found.
 */
export function findConfig(from: string = process.cwd()): string | null {
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Load and validate the config file. Returns null when no file exists —
 * the caller treats that as "run in mock mode". Invalid config is fatal
 * and throws with a readable message. Without an explicit path, the file
 * is searched upward from the working directory.
 */
export function loadConfig(path?: string): AmonSulConfig | null {
  const resolved = path ?? findConfig();
  if (!resolved || !existsSync(resolved)) return null;
  return loadConfigFile(resolved);
}

function loadConfigFile(path: string): AmonSulConfig {
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Could not parse ${path} as YAML: ${(e as Error).message}`);
  }
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config at ${path}:\n${issues}`);
  }
  return result.data;
}
