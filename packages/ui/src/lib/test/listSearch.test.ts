import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchesSearchQuery, normalizeSearchText } from '../listSearch.ts';

describe('normalizeSearchText', () => {
  it('folds case and diacritics so Romanian names are typeable on any keyboard', () => {
    assert.equal(normalizeSearchText('Pisică'), 'pisica');
    assert.equal(normalizeSearchText('LITIERĂ'), 'litiera');
  });

  it('collapses surrounding and repeated whitespace', () => {
    assert.equal(normalizeSearchText('  PURA   MAX  '), 'pura max');
  });
});

describe('matchesSearchQuery', () => {
  const fields = ['PURA MAX 2', 'Litterbox', 'PetKit'];

  it('matches everything when the query is empty or blank', () => {
    assert.equal(matchesSearchQuery('', fields), true);
    assert.equal(matchesSearchQuery('   ', fields), true);
  });

  it('matches a substring of any single field, ignoring case', () => {
    assert.equal(matchesSearchQuery('pura', fields), true);
    assert.equal(matchesSearchQuery('LITTER', fields), true);
  });

  it('ignores diacritics in both the query and the fields', () => {
    assert.equal(matchesSearchQuery('pisica', ['Pisică']), true);
    assert.equal(matchesSearchQuery('Pisică', ['pisica']), true);
  });

  it('requires every term to hit, but lets terms land in different fields', () => {
    // "pura petkit" is how people actually narrow a list: part of the device
    // name plus where it came from. Neither field contains both words.
    assert.equal(matchesSearchQuery('pura petkit', fields), true);
    assert.equal(matchesSearchQuery('pura surepet', fields), false);
  });

  it('finds a multi-word field typed without its spaces', () => {
    // "Sure Petcare" is written "SurePet" about as often as not, and nobody is
    // going to guess which one this app stored.
    assert.equal(matchesSearchQuery('surepet', ['Sure Petcare']), true);
    assert.equal(matchesSearchQuery('waterfountain', ['Water Fountain']), true);
    // Still a substring match, not a fuzzy one: order has to hold.
    assert.equal(matchesSearchQuery('petcaresure', ['Sure Petcare']), false);
  });

  it('skips absent fields instead of matching them', () => {
    assert.equal(matchesSearchQuery('a', [null, undefined, '']), false);
    assert.equal(matchesSearchQuery('cam', ['Hall Cam', null]), true);
  });
});
