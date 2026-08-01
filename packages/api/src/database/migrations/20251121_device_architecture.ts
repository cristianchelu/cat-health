import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  // Disable foreign keys to allow table recreation
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    // 1. Create provider_account table
    await db.schema
      .createTable('provider_account')
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('provider', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('config', 'jsonb', (col) => col.notNull())
      .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(1))
      .addColumn('internal', 'boolean', (col) => col.notNull().defaultTo(0))
      .addColumn('created_at', 'integer', (col) =>
        col.notNull().defaultTo(sql`(strftime('%s','now'))`),
      )
      .addColumn('updated_at', 'integer', (col) =>
        col.notNull().defaultTo(sql`(strftime('%s','now'))`),
      )
      .execute();

    // Internal providers get a seeded account so local hardware can be added
    // without a cloud login. Pre-architecture device rows attach to ESPHome.
    const internalAccounts = await db
      .insertInto('provider_account')
      .values([
        {
          provider: 'camera',
          name: 'Camera Provider',
          config: JSON.stringify({}),
          internal: 1,
        },
        {
          provider: 'esphome',
          name: 'ESPHome Provider',
          config: JSON.stringify({}),
          internal: 1,
        },
      ])
      .returning(['id', 'provider'])
      .execute();

    const defaultAccountId =
      internalAccounts.find((a) => a.provider === 'esphome')?.id ??
      internalAccounts[0]?.id ??
      1;

    // 2. Recreate device table with new schema
    // We create device_new, copy data, drop device, rename device_new -> device

    await db.schema
      .createTable('device_new')
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('type', 'text', (col) => col.notNull()) // Preserving existing column
      .addColumn('provider_account_id', 'integer', (col) =>
        col
          .notNull()
          .defaultTo(defaultAccountId)
          .references('provider_account.id')
          .onDelete('cascade'),
      )
      .addColumn('external_id', 'text', (col) => col.notNull())
      .addColumn('config', 'jsonb')
      .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(1))
      .addColumn('last_seen', 'integer')
      .addColumn('status', 'text', (col) => col.defaultTo('unknown'))
      .addColumn('created_at', 'integer', (col) =>
        col.notNull().defaultTo(sql`(strftime('%s','now'))`),
      )
      .addColumn('updated_at', 'integer', (col) =>
        col.notNull().defaultTo(sql`(strftime('%s','now'))`),
      )
      .execute();

    // Copy data from old table to new table
    // We construct external_id as 'legacy_' || id
    await sql`
      INSERT INTO device_new (
        id, name, type, 
        provider_account_id, external_id, 
        config, enabled, last_seen, status, 
        created_at, updated_at
      )
      SELECT 
        id, name, type,
        ${defaultAccountId}, 'legacy_' || id,
        NULL, 1, NULL, 'unknown',
        strftime('%s','now'), strftime('%s','now')
      FROM device
    `.execute(db);

    // Drop old table
    await db.schema.dropTable('device').execute();

    // Rename new table to device
    await db.schema.alterTable('device_new').renameTo('device').execute();

    // Create indices
    await db.schema
      .createIndex('idx_device_provider_account_external_id')
      .on('device')
      .columns(['provider_account_id', 'external_id'])
      .unique()
      .execute();

    await db.schema
      .createIndex('idx_device_provider_account')
      .on('device')
      .column('provider_account_id')
      .execute();

    // 3. Create device_camera table
    await db.schema
      .createTable('device_camera')
      .addColumn('device_id', 'integer', (col) =>
        col.notNull().references('device.id').onDelete('cascade'),
      )
      .addColumn('camera_id', 'integer', (col) =>
        col.notNull().references('device.id').onDelete('cascade'),
      )
      .addColumn('config', 'jsonb')
      .addPrimaryKeyConstraint('pk_device_camera', ['device_id', 'camera_id'])
      .execute();
  } finally {
    // Re-enable foreign keys
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await db.schema.dropTable('device_camera').execute();

    // Revert device table changes
    // Create old device table
    await db.schema
      .createTable('device_old')
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('type', 'text', (col) => col.notNull())
      .execute();

    // Copy data back (losing new columns)
    await sql`
      INSERT INTO device_old (id, name, type)
      SELECT id, name, type FROM device
    `.execute(db);

    await db.schema.dropTable('device').execute();
    await db.schema.alterTable('device_old').renameTo('device').execute();

    await db.schema.dropTable('provider_account').execute();
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}
