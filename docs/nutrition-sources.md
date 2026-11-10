# Nutrition sources

Where each number in `packages/shared/src/nutrition/` comes from. A model cites
one entry by id and uses only the numbers listed under it. What the app changes
afterwards (the point tolerance, the food floor) sits beside the function
that applies it, and a band lists what touched it in `adjustments`.

## `fediaf-2025`

FEDIAF, _Nutritional Guidelines for Complete and Complementary Pet Food for Cats
and Dogs_, September 2025, section 7.2.4.2, p. 57.
<https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf>

- Table VII-9, adults, kcal ME per kg^0.67: neutered and/or indoor 52–75;
  active 100.
- Table VII-10, kittens, × MER: up to 4 months 2.0–2.5; 4–9 months 1.75–2.0;
  9–12 months 1.5.
- The table doesn't say which MER the kitten factors multiply. The model uses
  100 × kg^0.67, the adult figure the section's text assumes.
- No intact category (an intact cat fits the first row only if known to be
  indoor), no weight-loss factor, and no senior figures (7.2.3.3 covers dogs
  only).

## `aaha-2014`

Brooks D et al. _2014 AAHA Weight Management Guidelines for Dogs and Cats._
J Am Anim Hosp Assoc 2014;50:1–11. DOI 10.5326/JAAHA-MS-6331. `aaha-2021`
defers to it for the weight-loss protocol.

- Determine Daily Caloric Intake: RER at the estimated ideal weight, then a
  percentage of it; "feeding 80% of ideal-weight RER is effective and well
  tolerated". Any figure is a starting point, adjusted by monitoring.
- Monitoring and Maintenance: most patients tolerate "as low as 60% of RER of
  ideal BW". Below 60 % it warns of nutrient deficiencies, says "cats may also
  have increased risk of hepatic lipidosis", and refers to a nutritionist. This
  is the food floor, `FLOOR_RER_FACTOR` in `food.ts`.
- Monitoring and Maintenance: the desired rate of loss in cats is 0.5–2 % of
  body weight a week. Faster, raise calories 10 %; slower, cut 10–20 %. Follow
  up every 2 weeks until the rate settles, then monthly. The app does not check
  the rate yet.

### Target weight

Why a target weight has no lower bound and is never dropped once set:

- Every figure is measured against ideal weight, never current weight, so
  nothing in the guideline scales with how far she has to go.
- Assess the Patient: each body condition point above 5 of 9 is 10 %
  overweight, and the scale ends at 40 %. Past it there is "no proven method"
  for ideal weight; the advice is to reassess as she loses.
- Monitoring and Maintenance: when the desired loss is achieved, "identify the
  next target weight". A far target is reached in stages, not refused.
- German AJ et al., Front Vet Sci 2023;10:1211543 (abstract and methods only):
  cats more than 40 % above ideal weight got a target at least 10 % above
  ideal, and cats in the study lost up to 41 % of their starting weight.

## `aaha-2021`

Cline MG et al. _2021 AAHA Nutrition and Weight Management Guidelines for Dogs
and Cats._ J Am Anim Hosp Assoc 2021;57:153–174. DOI 10.5326/JAAHA-MS-7232.

- Box 1: RER = 70 × kg^0.75. Feline factors: neutered adult 1.2–1.4, intact
  adult 1.4–1.6, weight loss 0.8, growth 2.5.
- p. 9: weight loss is calculated on ideal weight. Seniors may need more energy,
  with no number given.

## `aaha-aafp-life-stage-2021`

Quimby J et al. _2021 AAHA/AAFP Feline Life Stage Guidelines._ J Am Anim Hosp
Assoc 2021;57:51–72. DOI 10.5326/JAAHA-MS-7189. Also J Feline Med Surg
2021;23(3):211–233.

- p. 53, Table 1: kitten from birth up to 1 year. That is the line between
  `KITTEN` and `ADULT` in `food.ts`, and the only thing taken from here.
- The later stages (young adult 1 through 6, mature adult 7 to 10, senior over 10) are not used: no source in a plan gives separate figures for them. A row
  for one would carry its own age range.
- Not a model: p. 63 gives RER = 30 × kg + 70, young healthy adults × 1,
  mature adults "may be equivalent to RER", and seniors RER "multiplied by a
  factor of 10–20%". The wording is advice to adjust case by case, the senior
  factor has to be guessed at (plus 10–20 %?), and no plan would use it, so
  these figures are not registered.

## `kosmal-2025`

Kosmal PAL, Shoveller AK, Gillies G, Armstrong LE. _Diet format, protein, amino
acids, salt, and osmolytes, as well as water viscosity, affect water
consumption in domestic cats: a scoping review._ J Anim Sci 2026;104:skaf434.
DOI 10.1093/jas/skaf434.

- Abstract: healthy cats drink 23–51 ml/kg of total water a day; cats at
  42–51 ml/kg often had a USG below 1.035. The results give slightly different
  bounds (22.8–51.2, 42.0–52.1); the model uses the abstract's.
- Total water includes food moisture, which is how the app sums intake.
- The 42–51 band is an association in healthy cats, not a validated minimum.
- The NRC's 50–60 ml/kg is based on dogs (introduction).
