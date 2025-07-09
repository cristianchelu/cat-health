import { Kysely, sql } from "kysely";
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("pet")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("breed", "text", (col) => col.notNull())
    .addColumn("birth_date", "text", (col) => col.notNull())
    .execute();

  // DEBUG ONLY
  await db
    .insertInto("pet")
    .values({
      name: "Jazz",
      breed: "Turkish Angora",
      birth_date: "2021-03-25",
    })
    .execute();
  await db
    .insertInto("pet")
    .values({
      name: "Luna",
      breed: "European Shorthair",
      birth_date: "2023-03-30",
    })
    .execute();

  await db.schema
    .createTable("device")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("event")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("pet_id", "integer", (col) =>
      col.references("pet.id").onDelete("cascade").notNull()
    )
    .addColumn("device_id", "integer", (col) => col.references("device.id"))
    .addColumn("timestamp", "integer", (col) => col.notNull())
    .addColumn("data", "jsonb", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("event").execute();
  await db.schema.dropTable("device").execute();
  await db.schema.dropTable("pet").execute();
}
