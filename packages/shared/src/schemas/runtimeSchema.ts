import type { Static, TSchema } from "@fastify/type-provider-typebox";
import Compile from "typebox/compile";

const validators = new WeakMap<TSchema, ReturnType<typeof Compile>>();

function getValidator<S extends TSchema>(schema: S): ReturnType<typeof Compile> {
  const cached = validators.get(schema);
  if (cached) return cached;

  const validator = Compile(schema);
  validators.set(schema, validator);
  return validator;
}

export function parseWithSchema<S extends TSchema>(
  schema: S,
  value: unknown,
): Static<S> | undefined {
  return getValidator(schema).Check(value)
    ? (value as Static<S>)
    : undefined;
}

export function requireWithSchema<S extends TSchema>(
  schema: S,
  value: unknown,
  label: string,
): Static<S> {
  const validator = getValidator(schema);
  if (!validator.Check(value)) {
    throw new Error(
      `Invalid ${label}: ${JSON.stringify([...validator.Errors(value)])}`,
    );
  }
  return value as Static<S>;
}
