import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export type PetSex = 'female' | 'male' | 'unknown';
export type PetAltered = 'altered' | 'intact' | 'unknown';

export interface PetTable {
  id: Generated<number>;
  name: string;
  breed: string;
  birth_date: Date | null;
  /** Digits only; the API strips the spaces people type between groups. */
  microchip: string | null;
  sex: Generated<PetSex>;
  altered: Generated<PetAltered>;
}

export type Pet = Selectable<PetTable>;
export type NewPet = Insertable<PetTable>;
export type PetUpdate = Updateable<PetTable>;
