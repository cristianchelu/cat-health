import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GetFoodDTO } from 'shared';

import { FoodPickerSheet } from '../FoodPickerSheet.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

let nextId = 1;

function food(
  name: string,
  brand: string,
  foodType: GetFoodDTO['food_type'],
): GetFoodDTO {
  return {
    id: nextId++,
    name,
    brand,
    food_type: foodType,
    barcode_ean13: null,
    moisture_percent: null,
    calories_per_100g: 380,
    nutrients: null,
    serving_size_g: null,
    notes: null,
    created_at: 0,
    updated_at: 0,
  };
}

/* Past the flat-list threshold, so the ladder organizes. */
const FOODS = [
  food('Sterilised 37', 'Royal Canin', 'complete_dry'),
  food('Fit 32', 'Royal Canin', 'complete_dry'),
  food('Orijen Cat', 'Orijen', 'complete_dry'),
  food('Tuna in Gravy', 'Royal Canin', 'complete_wet'),
  food('Ageing 12+', 'Royal Canin', 'complete_wet'),
  food('Felix Salmon', 'Purina', 'complete_wet'),
  food('Gourmet Gold', 'Purina', 'complete_wet'),
  food('Sheba Poultry', 'Sheba', 'complete_wet'),
  food('Dreamies', 'Mars', 'treat'),
];

const DRY_RC = FOODS[0];

function rowNamed(pattern: RegExp) {
  return screen
    .getAllByRole('button')
    .find((button) => pattern.test(button.textContent ?? ''));
}

interface Options {
  selectedFoodId?: number | null;
  onPick?: (foodId: number | null) => void;
  onOpenChange?: (open: boolean) => void;
}

function renderSheet({
  selectedFoodId = null,
  onPick = () => {},
  onOpenChange = () => {},
}: Options = {}) {
  return renderWithProviders(
    <FoodPickerSheet
      open
      onOpenChange={onOpenChange}
      title="Left bowl"
      foods={FOODS}
      selectedFoodId={selectedFoodId}
      onPick={onPick}
      noneLabel="Not linked"
      noneHint="Don't attribute calories"
    />,
  );
}

describe('FoodPickerSheet', () => {
  it('opens on the same browse ladder the log flow walks', async () => {
    await renderSheet();

    assert.ok(rowNamed(/Wet food/));
    assert.ok(rowNamed(/Dry food/));
    assert.ok(rowNamed(/Treats/));
    // The ladder lost search in turn 8; this surface does not bring it back.
    assert.equal(screen.queryByRole('searchbox'), null);
  });

  it('starts at the top even when a bowl already holds something', async () => {
    /* What a feeder is set to says what is in the bowl, not what the bowl
       can take — opening inside that type would rule out the other one. */
    await renderSheet({ selectedFoodId: DRY_RC.id });

    assert.ok(rowNamed(/Wet food/));
    assert.ok(rowNamed(/Dry food/));
    assert.ok(rowNamed(/Treats/));
  });

  it('reports the food as soon as it is picked', async () => {
    const picked: (number | null)[] = [];
    await renderSheet({ onPick: (id) => picked.push(id) });

    await userEvent.click(rowNamed(/Dry food/)!);
    await userEvent.click(rowNamed(/Royal Canin/)!);
    await userEvent.click(rowNamed(/Sterilised 37/)!);

    assert.deepEqual(picked, [DRY_RC.id]);
  });

  it('never fills the field without the food being chosen', async () => {
    const picked: (number | null)[] = [];
    await renderSheet({ onPick: (id) => picked.push(id) });

    // Treats: one brand, one food — the brand rung goes, the food stays.
    await userEvent.click(rowNamed(/Treats/)!);
    assert.deepEqual(picked, [], 'the sheet does not pick for you');

    await userEvent.click(rowNamed(/Dreamies/)!);
    assert.deepEqual(picked, [FOODS[8].id]);
  });

  it('offers unlinking among the choices, not behind a clear button', async () => {
    const picked: (number | null)[] = [];
    await renderSheet({
      selectedFoodId: DRY_RC.id,
      onPick: (id) => picked.push(id),
    });

    const none = rowNamed(/Not linked/);
    assert.ok(none);
    await userEvent.click(none);
    assert.deepEqual(picked, [null]);
  });

  it('closes when Back is pressed at the top', async () => {
    let open = true;
    await renderSheet({ onOpenChange: (next) => (open = next) });

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    assert.equal(open, false);
  });
});
