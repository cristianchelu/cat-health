import axios from 'axios';
import type { TFunction } from 'i18next';
import type { WriteFailureReason } from 'shared';
import { apiErrorMessage } from '@/api/apiClient';

const REASONS: readonly WriteFailureReason[] = [
  'invalid',
  'offline',
  'timeout',
  'rejected',
  'busy',
  'unknown',
];

/**
 * Why a device write failed, in the user's words: the reason the API names
 * when the device refused or never confirmed it, otherwise the API's message
 * or `fallback`.
 */
export function deviceWriteErrorMessage(
  error: unknown,
  t: TFunction,
  fallback: string,
): string {
  const data: unknown = axios.isAxiosError(error)
    ? error.response?.data
    : undefined;
  const reason =
    typeof data === 'object' && data !== null && 'reason' in data
      ? REASONS.find((known) => known === data.reason)
      : undefined;
  return reason
    ? t(`devices.controls.failed.${reason}`)
    : apiErrorMessage(error, fallback);
}
