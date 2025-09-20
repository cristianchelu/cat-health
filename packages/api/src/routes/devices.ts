import {
  GetDeviceParamsSchema,
  GetDeviceResponseSchema,
  GetDevicesResponseSchema,
  PostDeviceRequestSchema,
} from '@cat-health/shared';
import { db } from '../database/index.ts';
import { type FastifyTypeBox } from '../types.ts';

export default function deviceRoutes(fastify: FastifyTypeBox): void {
  fastify.get(
    '/',
    {
      schema: {
        response: {
          '200': GetDevicesResponseSchema,
        },
      },
    },
    async () => {
      return await db.selectFrom('device').selectAll().execute();
    },
  );

  fastify.post(
    '/',
    {
      schema: {
        body: PostDeviceRequestSchema,
        response: {
          '200': GetDeviceResponseSchema,
        },
      },
    },
    async (request) => {
      const { name, type } = request.body;

      const result = await db
        .insertInto('device')
        .values({ name, type })
        .returningAll()
        .executeTakeFirstOrThrow();

      return result;
    },
  );
  fastify.get(
    '/:id',
    {
      schema: {
        params: GetDeviceParamsSchema,
        response: {
          '200': GetDeviceResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const device = await db
        .selectFrom('device')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!device) throw new Error('Device not found');
      return device;
    },
  );
}
