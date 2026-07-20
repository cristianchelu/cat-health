import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface PetTable {
  id: Generated<number>;
  name: string;
  breed: string;
  birth_date: Date | null;
}

export type Pet = Selectable<PetTable>;
export type NewPet = Insertable<PetTable>;
export type PetUpdate = Updateable<PetTable>;
