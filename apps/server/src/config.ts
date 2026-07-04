import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

const RESOURCE_KEY = /^(run|sql|pubsub|storage|scheduler|redis|vm)\/.+$/;

const resourceKey = z.string().regex(RESOURCE_KEY, {
  message: 'must be "<type>/<name>" where type is run|sql|pubsub|storage|scheduler|redis|vm',
});

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  edges: z.array(z.tuple([resourceKey, resourceKey])).default([]),
  layout: z
    .record(resourceKey, z.tuple([z.number().int().min(0), z.number().int().min(0)]))
    .default({}),
});

const configSchema = z.object({
  projects: z.array(projectSchema).min(1),
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

export const DEFAULT_CONFIG_PATH = './amon-sul.config.yaml';

/**
 * Load and validate the config file. Returns null when the file does not
 * exist — the caller treats that as "run in mock mode". Invalid config is
 * fatal and throws with a readable message.
 */
export function loadConfig(path: string = DEFAULT_CONFIG_PATH): AmonSulConfig | null {
  if (!existsSync(path)) return null;
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
