import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  DietaryNeedsParamsSchema,
  DietaryNeedsQuerySchema,
  GetDietaryNeedsResponseSchema,
  PutDietaryNeedsRequestSchema,
} from 'shared';

import {
  loadDietaryNeeds,
  saveDietaryNeeds,
} from '../services/nutrition/dietaryNeeds.ts';
import { Http404NotFoundSchema } from './httpErrorSchemas.ts';
import { dietaryNeedsToDto } from './mappers/dietaryNeeds.ts';
import { PET_NOT_FOUND } from './pets.ts';

/** A pet's food and water bands and target weight, under `/api/pets/:id/dietary-needs`. */
export const dietaryNeedsRoutes: FastifyPluginAsyncTypebox = async (
  fastify,
) => {
  const { db } = fastify;

  fastify.get(
    '/:id/dietary-needs',
    {
      schema: {
        params: DietaryNeedsParamsSchema,
        querystring: DietaryNeedsQuerySchema,
        response: {
          '200': GetDietaryNeedsResponseSchema,
          '404': Http404NotFoundSchema,
        },
      },
    },
    async (request, reply) => {
      const { timezone = 'UTC' } = request.query;
      const needs = await loadDietaryNeeds(db, request.params.id, {
        now: new Date(),
        timezone,
      });
      if (!needs) return reply.code(404).send(PET_NOT_FOUND);
      return dietaryNeedsToDto(needs);
    },
  );

  fastify.put(
    '/:id/dietary-needs',
    {
      schema: {
        params: DietaryNeedsParamsSchema,
        querystring: DietaryNeedsQuerySchema,
        body: PutDietaryNeedsRequestSchema,
        response: {
          '200': GetDietaryNeedsResponseSchema,
          '404': Http404NotFoundSchema,
        },
      },
    },
    async (request, reply) => {
      const { timezone = 'UTC' } = request.query;
      const { food, water, target_weight_kg } = request.body;
      const needs = await saveDietaryNeeds(
        db,
        request.params.id,
        {
          food,
          water,
          targetWeightG:
            target_weight_kg == null
              ? target_weight_kg
              : Math.round(target_weight_kg * 1000),
        },
        { now: new Date(), timezone },
      );
      if (!needs) return reply.code(404).send(PET_NOT_FOUND);
      return dietaryNeedsToDto(needs);
    },
  );
};

export default dietaryNeedsRoutes;
