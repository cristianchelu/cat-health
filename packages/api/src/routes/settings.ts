import {
  GetSettingsResponseSchema,
  PatchSettingsRequestSchema,
} from 'shared';
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { db } from '../database/index.ts';
import {
  getTrackingGapThresholdMinutes,
  setTrackingGapThresholdMinutes,
} from '../services/settings/appSettings.ts';

const settingsRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
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
      const tracking_gap_threshold_minutes =
        await getTrackingGapThresholdMinutes(db);

      return { tracking_gap_threshold_minutes };
    },
  );

  fastify.patch(
    '/',
    {
      schema: {
        body: PatchSettingsRequestSchema,
        response: {
          '200': GetSettingsResponseSchema,
        },
      },
    },
    async (request) => {
      const { tracking_gap_threshold_minutes } = request.body;

      if (tracking_gap_threshold_minutes !== undefined) {
        await setTrackingGapThresholdMinutes(
          db,
          tracking_gap_threshold_minutes,
        );
      }

      return {
        tracking_gap_threshold_minutes:
          await getTrackingGapThresholdMinutes(db),
      };
    },
  );
};

export default settingsRoutes;
