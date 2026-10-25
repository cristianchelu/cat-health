import { Type } from '@fastify/type-provider-typebox';

/**
 * The body Fastify's default error handler sends for an error carrying a
 * `statusCode`, so a route can throw one and declare its shape here.
 */
function httpErrorSchema<Status extends number, Reason extends string>(
  statusCode: Status,
  error: Reason,
) {
  return Type.Object({
    statusCode: Type.Literal(statusCode),
    error: Type.Literal(error),
    message: Type.String(),
  });
}

export const Http400BadRequestSchema = httpErrorSchema(400, 'Bad Request');
export const Http404NotFoundSchema = httpErrorSchema(404, 'Not Found');
export const Http409ConflictSchema = httpErrorSchema(409, 'Conflict');
export const Http413PayloadTooLargeSchema = httpErrorSchema(
  413,
  'Payload Too Large',
);
export const Http415UnsupportedMediaTypeSchema = httpErrorSchema(
  415,
  'Unsupported Media Type',
);
export const Http503ServiceUnavailableSchema = httpErrorSchema(
  503,
  'Service Unavailable',
);
