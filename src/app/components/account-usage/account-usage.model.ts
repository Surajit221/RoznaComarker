import type { AssessmentCreditWallet } from '../../api/credits-api.service';
import type { BackendMySubscription } from '../../api/subscription-api.service';

export interface AccountUsageViewModel {
  planName: string | null;
  billingPeriod: string | null;
  renewalDate: string | null;
  monthlyAllowance: number | null;
  monthlyRemaining: number | null;
  monthlyUsed: number | null;
  monthlyUsagePercent: number | null;
  purchasedCredits: number | null;
  bonusCredits: number | null;
  totalAvailableCredits: number | null;
  resetDate: string | null;
  storageUsedMB: number | null;
  storageLimitMB: number | null;
  storageUsagePercent: number | null;
  warningLevel: 'neutral' | 'warning' | 'exhausted';
}

const finiteNonNegative = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

export function clampedUsagePercent(used: unknown, limit: unknown): number | null {
  const safeUsed = finiteNonNegative(used);
  const safeLimit = finiteNonNegative(limit);
  if (safeUsed === null || safeLimit === null || safeLimit === 0) return null;
  return Math.min(100, Math.max(0, Math.round((safeUsed / safeLimit) * 100)));
}
export function preciseStoragePercent(usedBytes:unknown,limitBytes:unknown,usedMb:unknown,limitMb:unknown):number|null{const used=finiteNonNegative(usedBytes),limit=finiteNonNegative(limitBytes);const raw=used!==null&&limit!==null&&limit>0?used/limit*100:(()=>{const u=finiteNonNegative(usedMb),l=finiteNonNegative(limitMb);return u!==null&&l!==null&&l>0?u/l*100:null})();return raw===null?null:Math.min(100,Math.max(0,raw<1?Number(raw.toFixed(2)):Number(raw.toFixed(1))))}

export function monthlyCreditUsage(wallet: Partial<AssessmentCreditWallet> | null): {
  allowance: number | null; remaining: number | null; used: number | null; percent: number | null;
} {
  if (!wallet) return { allowance: null, remaining: null, used: null, percent: null };
  const allowance = finiteNonNegative(wallet.monthlyCredits);
  const remaining = finiteNonNegative(wallet.monthlyCreditsRemaining);
  const reportedUsed = finiteNonNegative(wallet.monthlyCreditsUsed);
  const used = reportedUsed ?? (allowance !== null && remaining !== null
    ? Math.max(0, allowance - remaining) : null);
  return { allowance, remaining, used, percent: clampedUsagePercent(used, allowance) };
}

export function buildAccountUsageViewModel(
  wallet: AssessmentCreditWallet | null,
  subscription: BackendMySubscription | null
): AccountUsageViewModel {
  const monthly = monthlyCreditUsage(wallet);
  const storageUsedMB = finiteNonNegative(subscription?.usage?.storageMB);
  const storageLimitMB = finiteNonNegative(
    subscription?.plan?.features?.storageMB ?? subscription?.plan?.limits?.storageMB
  );
  const warningThreshold = finiteNonNegative(wallet?.nudgeThresholds?.warning);
  const available = finiteNonNegative(wallet?.availableCredits);
  const warningLevel = available === 0 ? 'exhausted'
    : monthly.percent !== null && warningThreshold !== null && monthly.percent >= warningThreshold
      ? 'warning' : 'neutral';

  return {
    planName: subscription?.plan?.display?.title || subscription?.plan?.name || wallet?.plan || null,
    billingPeriod: subscription?.plan?.billingInterval || null,
    renewalDate: subscription?.billing?.currentPeriodEnd || subscription?.planExpiresAt || null,
    monthlyAllowance: monthly.allowance,
    monthlyRemaining: monthly.remaining,
    monthlyUsed: monthly.used,
    monthlyUsagePercent: monthly.percent,
    purchasedCredits: finiteNonNegative(wallet?.purchasedCredits),
    bonusCredits: finiteNonNegative(wallet?.bonusCredits),
    totalAvailableCredits: available,
    resetDate: wallet?.resetDate || null,
    storageUsedMB,
    storageLimitMB,
    storageUsagePercent: preciseStoragePercent(subscription?.storage?.usedBytes,subscription?.storage?.limitBytes,storageUsedMB,storageLimitMB),
    warningLevel
  };
}

export function formatStorage(megabytes: number | null): string {
  if (megabytes === null) return 'Unavailable';
  if (megabytes >= 1024) return `${Number((megabytes / 1024).toFixed(2))} GB`;
  return `${Number(megabytes.toFixed(2))} MB`;
}

export function formatUsageDate(value: string | null): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
