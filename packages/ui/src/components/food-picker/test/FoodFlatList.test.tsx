import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GetFoodDTO } from 'shared';

import { FoodFlatList } from '../FoodFlatList.tsx';
import { FoodPickerRow } from '../FoodPickerRow.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

function food(overrides: Partial<GetFoodDTO> & { id: number }): GetFoodDTO {
  return {
    name: 'Tuna in Gravy',
    brand: 'Royal Canin',
    food_type: 'complete_wet',
    barcode_ean13: null,
    moisture_percent: null,
    calories_per_100g: 90,
    nutrients: null,
    serving_size_g: 85,
    notes: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

const FOODS = [
  food({ id: 1 }),
  food({
    id: 2,
    name: 'Sterilised 37',
    food_type: 'complete_dry',
    calories_per_100g: 380,
  }),
  food({
    id: 3,
    name: 'Dreamies',
    brand: null,
    food_type: 'treat',
    calories_per_100g: null,
  }),
];

describe('FoodFlatList', () => {
  it('shows each food with its brand and calorie density', async () => {
    await renderWithProviders(
      <FoodFlatList foods={FOODS} onSelect={() => {}} />,
    );

    const rows = screen.getAllByRole('button');
    assert.equal(rows.length, 3);
    assert.match(rows[0].textContent ?? '', /Tuna in Gravy/);
    assert.match(rows[0].textContent ?? '', /Royal Canin/);
    // Per kilogram, as the bag states it — and whole numbers, not 0.9.
    assert.match(rows[0].textContent ?? '', /900 kcal\/kg/);
    assert.match(rows[1].textContent ?? '', /3800 kcal\/kg/);
  });

  it('says nothing about density for a food with no calories recorded', async () => {
    await renderWithProviders(
      <FoodFlatList foods={[FOODS[2]]} onSelect={() => {}} />,
    );

    assert.doesNotMatch(screen.getByRole('button').textContent ?? '', /kcal/);
  });

  it('tags types only when asked, since a filtered list already says the type', async () => {
    const { rerender } = await renderWithProviders(
      <FoodFlatList foods={FOODS} onSelect={() => {}} />,
    );
    assert.equal(document.querySelectorAll('.food-type-tag').length, 0);

    rerender(<FoodFlatList foods={FOODS} onSelect={() => {}} showTypeTags />);
    const tags = [...document.querySelectorAll('.food-type-tag')].map(
      (tag) => tag.textContent,
    );
    assert.deepEqual(tags, ['wet', 'dry', 'treat']);
  });

  it('reports the picked food and marks the current one', async () => {
    const picked: number[] = [];
    await renderWithProviders(
      <FoodFlatList
        foods={FOODS}
        selectedFoodId={2}
        onSelect={(f) => picked.push(f.id)}
      />,
    );

    const rows = screen.getAllByRole('button');
    assert.equal(rows[1].getAttribute('aria-current'), 'true');
    assert.equal(rows[0].getAttribute('aria-current'), null);

    await userEvent.click(rows[0]);
    assert.deepEqual(picked, [1]);
  });

  it('renders the leading row the caller supplies above the foods', async () => {
    await renderWithProviders(
      <FoodFlatList
        foods={FOODS}
        onSelect={() => {}}
        leadingRow={
          <FoodPickerRow title="Not linked" subtitle="Don't attribute" muted />
        }
      />,
    );

    const rows = screen.getAllByRole('button');
    assert.equal(rows.length, 4);
    assert.match(rows[0].textContent ?? '', /Not linked/);
  });

  it('shows the empty message only when there is nothing at all to pick', async () => {
    await renderWithProviders(
      <FoodFlatList foods={[]} onSelect={() => {}} emptyLabel="No foods yet" />,
    );

    assert.ok(screen.getByText('No foods yet'));
  });
});
