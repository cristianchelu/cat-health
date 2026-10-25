import { GetSettingsResponseSchema, PatchSettingsRequestSchema } from 'shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  applySettingsPatch,
  getAllSettings,
} from '../services/settings/appSettings.ts';
import { Http400BadRequestSchema } from './httpErrorSchemas.ts';

const settingsRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const { db } = fastify;

  fastify.get(
    '/',
    {
      schema: {
        response: {
          '200': GetSettingsResponseSchema,
        },
      },
    },
    async () => {
      return await getAllSettings(db);
    },
  );

  fastify.patch(
    '/',
    {
      schema: {
        body: PatchSettingsRequestSchema,
        response: {
          '200': GetSettingsResponseSchema,
          '400': Http400BadRequestSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await applySettingsPatch(db, request.body);
      } catch (error) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: error instanceof Error ? error.message : 'Invalid settings',
        });
      }
    },
  );
};

export default settingsRoutes;
