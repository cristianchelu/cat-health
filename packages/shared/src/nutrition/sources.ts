/** A published document the numbers come from, with enough to cite it and find it again. */
export interface NutritionSource {
  /** How the app names the source in a line of text. */
  label: string;
  title: string;
  authors: string;
  /** The journal or publisher line of the citation. */
  published: string;
  year: number;
  /** Null when the document has none. */
  doi: string | null;
  url: string;
  /** When the numbers below were last checked against the document. */
  checkedAt: string;
}

/** The reading notes, page by page, are in `docs/nutrition-sources.md`. */
export const NUTRITION_SOURCES = {
  'fediaf-2025': {
    label: 'FEDIAF 2025',
    title:
      'Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs',
    authors: 'FEDIAF',
    published: 'FEDIAF, publication September 2025',
    year: 2025,
    doi: null,
    url: 'https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf',
    checkedAt: '2026-11-07',
  },
  'aaha-2014': {
    label: 'AAHA 2014',
    title: '2014 AAHA Weight Management Guidelines for Dogs and Cats',
    authors: 'Brooks D, Churchill J, Fein K, et al.',
    published: 'J Am Anim Hosp Assoc 2014;50:1–11',
    year: 2014,
    doi: '10.5326/JAAHA-MS-6331',
    url: 'https://doi.org/10.5326/JAAHA-MS-6331',
    checkedAt: '2026-11-10',
  },
  'aaha-2021': {
    label: 'AAHA 2021',
    title:
      '2021 AAHA Nutrition and Weight Management Guidelines for Dogs and Cats',
    authors:
      'Cline MG, Burns KM, Coe JB, Downing R, Durzi T, Murphy M, Parker V',
    published: 'J Am Anim Hosp Assoc 2021;57:153–174',
    year: 2021,
    doi: '10.5326/JAAHA-MS-7232',
    url: 'https://doi.org/10.5326/JAAHA-MS-7232',
    checkedAt: '2026-11-07',
  },
  'aaha-aafp-life-stage-2021': {
    label: 'AAHA/AAFP 2021',
    title: '2021 AAHA/AAFP Feline Life Stage Guidelines',
    authors:
      'Quimby J, Gowland S, Carney HC, DePorter T, Plummer P, Westropp J',
    published: 'J Am Anim Hosp Assoc 2021;57:51–72',
    year: 2021,
    doi: '10.5326/JAAHA-MS-7189',
    url: 'https://doi.org/10.5326/JAAHA-MS-7189',
    checkedAt: '2026-11-09',
  },
  'kosmal-2025': {
    label: 'Kosmal et al. 2025',
    title:
      'Diet format, protein, amino acids, salt, and osmolytes, as well as water viscosity, affect water consumption in domestic cats: a scoping review of 32 publications (published from 1975 to 2025) on water intake, hydration status, and related health outcomes',
    authors: 'Kosmal PAL, Shoveller AK, Gillies G, Armstrong LE',
    published: 'J Anim Sci 2026;104:skaf434',
    year: 2025,
    doi: '10.1093/jas/skaf434',
    url: 'https://doi.org/10.1093/jas/skaf434',
    checkedAt: '2026-11-07',
  },
} satisfies Record<string, NutritionSource>;

/** A source's id, as models, comments and the reading notes name it. */
export type NutritionSourceId = keyof typeof NUTRITION_SOURCES;

/** One row of a source's table; only its formula is code. */
export interface NutritionModelRow {
  /** Where the numbers are in the source, for the band's citation. */
  ref: string;
}

/**
 * One source's table as the app reads it. Every row comes from `sourceId`,
 * and a case with no row is not answered. Stored plans name model ids, so a
 * shipped id is never removed, reused or changed: a correction is a new id.
 */
export interface NutritionModel<Row extends NutritionModelRow> {
  sourceId: NutritionSourceId;
  rows: readonly Row[];
}
