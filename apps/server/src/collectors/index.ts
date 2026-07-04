import type { ResourceCollector } from './types.js';
import { runCollector } from './run.js';
import { sqlCollector } from './sql.js';
import { pubsubCollector } from './pubsub.js';
import { storageCollector } from './storage.js';
import { schedulerCollector } from './scheduler.js';
import { redisCollector } from './redis.js';
import { vmCollector } from './vm.js';

export const ALL_COLLECTORS: ResourceCollector[] = [
  runCollector,
  sqlCollector,
  pubsubCollector,
  storageCollector,
  schedulerCollector,
  redisCollector,
  vmCollector,
];
