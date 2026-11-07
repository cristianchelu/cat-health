/**
 * Where a source stands in the literature. It never changes what a model
 * computes; it only decides how the app presents that model's bands.
 */
export type NutritionSourceStatus =
  | { kind: 'current' }
  | { kind: 'superseded'; by: string }
  | { kind: 'retracted'; note: string }
  | { kind: 'errata'; note: string };

export interface NutritionSource {
  title: string;
  authors: string;
  published: string;
  year: number;
  doi: string | null;
  url: string;
  /** When the numbers below were last checked against the document. */
  checkedAt: string;
  status: NutritionSourceStatus;
}

/** The reading notes, page by page, are in `docs/nutrition-sources.md`. */
export const NUTRITION_SOURCES = {
  'fediaf-2025': {
    title:
      'Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs',
    authors: 'FEDIAF',
    published: 'FEDIAF, publication September 2025',
    year: 2025,
    doi: null,
    url: 'https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf',
    checkedAt: '2026-11-07',
    status: { kind: 'current' },
  },
  'aaha-2021': {
    title:
      '2021 AAHA Nutrition and Weight Management Guidelines for Dogs and Cats',
    authors:
      'Cline MG, Burns KM, Coe JB, Downing R, Durzi T, Murphy M, Parker V',
    published: 'J Am Anim Hosp Assoc 2021;57:153–174',
    year: 2021,
    doi: '10.5326/JAAHA-MS-7232',
    url: 'https://doi.org/10.5326/JAAHA-MS-7232',
    checkedAt: '2026-11-07',
    status: { kind: 'current' },
  },
  'kosmal-2025': {
    title:
      'Diet format, protein, amino acids, salt, and osmolytes, as well as water viscosity, affect water consumption in domestic cats: a scoping review of 32 publications (published from 1975 to 2025) on water intake, hydration status, and related health outcomes',
    authors: 'Kosmal PAL, Shoveller AK, Gillies G, Armstrong LE',
    published: 'J Anim Sci 2026;104:skaf434',
    year: 2025,
    doi: '10.1093/jas/skaf434',
    url: 'https://doi.org/10.1093/jas/skaf434',
    checkedAt: '2026-11-07',
    status: { kind: 'current' },
  },
} satisfies Record<string, NutritionSource>;

export type NutritionSourceId = keyof typeof NUTRITION_SOURCES;
