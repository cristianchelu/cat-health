import type { ExpressionBuilder } from 'kysely';
import { DECLARATION_EVENT_TYPES } from 'shared';

import type { Database } from '../../database/index.ts';

/**
 * Keeps declarations out of a list of what happened. Every declaration type
 * has a partial index on `type`, so the ids to leave out come from index seeks
 * and the listed rows' payloads are never parsed.
 */
export function withoutDeclarations(eb: ExpressionBuilder<Database, 'event'>) {
  return eb.and(
    DECLARATION_EVENT_TYPES.map((type) =>
      eb(
        'id',
        'not in',
        eb.selectFrom('event').select('id').where('type', '=', type),
      ),
    ),
  );
}
