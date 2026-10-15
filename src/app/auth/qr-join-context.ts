import { HttpContextToken } from '@angular/common/http';

// Only QR-owned requests bypass global logout so they can recover once locally.
export const QR_JOIN_AUTH_RECOVERY = new HttpContextToken<boolean>(() => false);
export function qrDiagnostic(event: 'qr_intent_created' | 'qr_auth_wait_started' | 'qr_auth_restored'
  | 'qr_backend_auth_ready' | 'qr_join_started' | 'qr_join_succeeded' | 'qr_already_joined'
  | 'qr_join_auth_retry' | 'qr_join_failed' | 'qr_intent_consumed'): void {
  console.info('[qr-join]', { event });
}
