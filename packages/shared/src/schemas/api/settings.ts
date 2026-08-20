import { Type, type Static } from '@fastify/type-provider-typebox';

export const TRACKING_GAP_THRESHOLD_MINUTES_KEY =
  'tracking_gap_threshold_minutes' as const;

export const DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES = 360;

export const LANGUAGE_KEY = 'language' as const;
export const DEFAULT_LANGUAGE = 'en' as const;

export const TIMEZONE_KEY = 'timezone' as const;

export const TIME_FORMAT_KEY = 'time_format' as const;
export const DEFAULT_TIME_FORMAT = 'language' as const;

export const DATE_FORMAT_KEY = 'date_format' as const;
export const DEFAULT_DATE_FORMAT = 'language' as const;

export const FIRST_WEEKDAY_KEY = 'first_weekday' as const;
export const DEFAULT_FIRST_WEEKDAY = 'language' as const;

export const NUMBER_FORMAT_KEY = 'number_format' as const;
export const DEFAULT_NUMBER_FORMAT = 'language' as const;

export const SupportedLanguageSchema = Type.Union([
  Type.Literal('en'),
  Type.Literal('ro'),
]);
export type SupportedLanguageDTO = Static<typeof SupportedLanguageSchema>;

export const TimeFormatSchema = Type.Union([
  Type.Literal('language'),
  Type.Literal('system'),
  Type.Literal('h12'),
  Type.Literal('h24'),
]);
export type TimeFormatDTO = Static<typeof TimeFormatSchema>;

export const DateFormatSchema = Type.Union([
  Type.Literal('language'),
  Type.Literal('system'),
  Type.Literal('DMY'),
  Type.Literal('MDY'),
  Type.Literal('YMD'),
]);
export type DateFormatDTO = Static<typeof DateFormatSchema>;

export const FirstWeekdaySchema = Type.Union([
  Type.Literal('language'),
  Type.Literal('monday'),
  Type.Literal('sunday'),
]);
export type FirstWeekdayDTO = Static<typeof FirstWeekdaySchema>;

export const NumberFormatSchema = Type.Union([
  Type.Literal('language'),
  Type.Literal('system'),
  Type.Literal('comma_decimal'),
  Type.Literal('decimal_comma'),
]);
export type NumberFormatDTO = Static<typeof NumberFormatSchema>;

export const GetSettingsResponseSchema = Type.Object({
  tracking_gap_threshold_minutes: Type.Number({ minimum: 0 }),
  language: SupportedLanguageSchema,
  timezone: Type.Union([Type.String(), Type.Null()]),
  time_format: TimeFormatSchema,
  date_format: DateFormatSchema,
  first_weekday: FirstWeekdaySchema,
  number_format: NumberFormatSchema,
});
export type GetSettingsResponseDTO = Static<typeof GetSettingsResponseSchema>;

export const PatchSettingsRequestSchema = Type.Object({
  tracking_gap_threshold_minutes: Type.Optional(Type.Number({ minimum: 0 })),
  language: Type.Optional(SupportedLanguageSchema),
  timezone: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  time_format: Type.Optional(TimeFormatSchema),
  date_format: Type.Optional(DateFormatSchema),
  first_weekday: Type.Optional(FirstWeekdaySchema),
  number_format: Type.Optional(NumberFormatSchema),
});
export type PatchSettingsRequestDTO = Static<typeof PatchSettingsRequestSchema>;

export function createDefaultSettingsResponse(): GetSettingsResponseDTO {
  return {
    tracking_gap_threshold_minutes: DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES,
    language: DEFAULT_LANGUAGE,
    timezone: null,
    time_format: DEFAULT_TIME_FORMAT,
    date_format: DEFAULT_DATE_FORMAT,
    first_weekday: DEFAULT_FIRST_WEEKDAY,
    number_format: DEFAULT_NUMBER_FORMAT,
  };
}
