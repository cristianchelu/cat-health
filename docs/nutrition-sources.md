# Nutrition sources

Reading notes behind every number in `packages/shared/src/nutrition/`. Each model
there cites one entry here by id. Every number a model uses is listed under its
entry, with where it appears in the document. A number that is not listed here
does not belong in that model.

The app is informed common sense, not veterinary advice. A vet's numbers for a
cat go in as a custom band.

## `fediaf-2025`

FEDIAF, _Nutritional Guidelines for Complete and Complementary Pet Food for Cats
and Dogs_, publication September 2025.
<https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf>
Checked 2026-11-07.

FEDIAF is the European pet food industry federation. The guidelines are
reviewed each year by its Nutrition Working Group and an independent Scientific
Advisory Board.

Section 7.2.4.2 (Cats), page 57:

- **Table VII-9, average daily energy requirements of adult cats**, in kcal ME
  per kg BW^0.67:
  - Neutered and/or indoor cats: 52–75 (35–45 kcal/kg BW for a 4 kg cat).
  - Active cats: 100 (60–65 kcal/kg BW for a 4 kg cat).
- **Table VII-10, kittens**, as times MER:
  - up to 4 months: 2.0–2.5;
  - 4 to 9 months: 1.75–2.0;
  - 9 to 12 months: 1.5.
- **The text** sets recommendations for normal active adult cats at
  "a maintenance energy requirement of 100 kcal/kg BW0.67". It also says the
  metabolic weight for cats is kg BW^0.67.

What it does not give:

- **The weight Table VII-10's "MER" applies to.** The model applies the
  kitten factors to 100 kcal × her current kg^0.67, the MER the section
  assumes for normal active adults. That reading is ours.
- **Intact cats as a category.** The table splits neutered or indoor cats from
  active ones. An intact cat is covered only by the first row, and only when
  she is known to live indoors. The pet record doesn't hold that, so
  `fediaf-2025` doesn't answer intact adults.
- **Weight loss for cats:** no factor.
- **Senior cats:** the age section (7.2.3.3) covers dogs only.

## `aaha-2021`

Cline MG, Burns KM, Coe JB, Downing R, Durzi T, Murphy M, Parker V.
_2021 AAHA Nutrition and Weight Management Guidelines for Dogs and Cats._
J Am Anim Hosp Assoc 2021;57:153–174. DOI 10.5326/JAAHA-MS-7232.
Box 1, "Energy Requirement Calculations". Checked 2026-11-07.

- **RER** = 70 × BW(kg)^0.75. MER = RER × life stage factor.
- **Feline life stage factors (Box 1):**
  - neutered adults: 1.2–1.4;
  - intact adult: 1.4–1.6;
  - inactive/obese prone: 1.0;
  - weight loss: 0.8;
  - growth: 2.5.
- **Weight loss (page 9):** base the calculations on ideal weight. Mean intake
  for loss over 12 weeks was 52 ± 4.9 kcal/kg^0.711 in cats (Flanagan et al.).
- **Seniors (page 9):** energy intake "can be higher for senior cats", with no
  number given.
- **Box 1 footnote:** the factors are general guidelines, and sedentary or indoor
  pets may need less.

A secondary summary had given AAHA's RER as 30·kg + 70. Box 1 itself gives
70·kg^0.75, which is what the model uses.

## `kosmal-2025`

Kosmal PAL, Shoveller AK, Gillies G, Armstrong LE. _Diet format, protein, amino
acids, salt, and osmolytes, as well as water viscosity, affect water
consumption in domestic cats: a scoping review of 32 publications (published
from 1975 to 2025) on water intake, hydration status, and related health
outcomes._ J Anim Sci 2026;104:skaf434. DOI 10.1093/jas/skaf434. Published
13 Dec 2025. Checked 2026-11-07.

- **Healthy cats (abstract):** "23 to 51 mL/kg BW of total water was consumed
  daily". The results give 22.8–51.2. The model uses the abstract's figures.
- **Lower urinary tract risk (abstract):** cats that "consumed 42 to 51 mL/kg BW
  of total water daily often had a USG <1.035". The results and discussion
  give 42.0–52.1, and the paper doesn't reconcile the two. The model uses the
  abstract's figures.
- **These are total water intake, food moisture included.** That matches how
  the app sums water, with the moisture events added in.
- **The NRC figure (introduction):** the NRC 2006 figure of 50–60 mL/kg is
  "based on the water intake requirement of dogs" (Schaer 1989).
- **What it does not give:** a validated minimum. The 42–51 band is an
  association with urine specific gravity below 1.035 in healthy cats.

## App policy (not citations)

These are the app's own guards, applied after any model has answered. They are
labelled as policy wherever they show.

- **Floor:** no band below 0.6 × reference RER, at her target weight when one is
  set, else her weight. The reference RER is 70·kg^0.75.
- **Target weight:** at least 70 % of her current weight.
- **Point tolerance:** when a source gives one number rather than a range, the
  band is ± 5 % of that target.
- **Rounding:** kcal and ml round to 5.
