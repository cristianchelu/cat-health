import { format } from 'date-fns';

import { db } from '../../database/index.ts';
import { DEFAULT_SEED_DAYS } from './metrics.ts';
import { runSeedDemo } from './insert.ts';
import { hasDomainData, wipeDomainData } from './wipe.ts';

interface CliOptions {
  days: number;
  prefix: string;
  force: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    days: DEFAULT_SEED_DAYS,
    prefix: '',
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--days') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error('--days must be a positive integer');
      }
      options.days = Math.floor(value);
      continue;
    }
    if (arg === '--prefix') {
      const value = argv[++i];
      if (!value) {
        throw new Error('--prefix requires a value');
      }
      options.prefix = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const domainDataExists = await hasDomainData(db);

  if (domainDataExists && !options.force) {
    console.error(
      'Database is not empty. Pass --force to replace demo data, or run reset-db first.',
    );
    process.exit(1);
  }

  if (domainDataExists && options.force) {
    await wipeDomainData(db);
  }

  const result = await runSeedDemo(db, {
    days: options.days,
    prefix: options.prefix,
  });

  console.log('Demo seed complete.');
  console.log(
    `Date range: ${format(new Date(result.dateRange.start), 'yyyy-MM-dd')} → ${format(new Date(result.dateRange.end), 'yyyy-MM-dd')}`,
  );
  console.log('Pets:');
  for (const pet of result.pets) {
    console.log(`  - ${pet.name} (id=${pet.id})`);
  }
  console.log('Devices:');
  for (const device of result.devices) {
    console.log(`  - ${device.name} (id=${device.id})`);
  }
  console.log('Events:');
  for (const [type, count] of Object.entries(result.eventCounts)) {
    console.log(`  - ${type}: ${count}`);
  }
  console.log(`Avatars: ${result.avatarCount}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
