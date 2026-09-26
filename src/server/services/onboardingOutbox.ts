import { randomUUID } from 'node:crypto';
import { supabase } from './supabase';
import { getIdentitySnapshot, saveIdentitySnapshot } from './state';
import { sendEmail, type EmailGonderParams } from './emailService';

export type OnboardingEmailJob = Record<string, unknown> & {
  id: string;
  tenant_id: string;
  kind: 'ACTIVATION' | 'INVITE';
  payload: EmailGonderParams;
  status: 'PENDING' | 'RUNNING' | 'SENT';
  expires_at: string;
  created_at: string;
  next_attempt_at: string;
  claim_token?: string | null;
  leased_until?: string | null;
  attempts: number;
};

export function createEmailJob(
  tenantId: string,
  kind: OnboardingEmailJob['kind'],
  payload: EmailGonderParams,
  expiresAt: string
): OnboardingEmailJob {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenant_id: tenantId,
    kind,
    payload,
    status: 'PENDING',
    expires_at: expiresAt,
    created_at: now,
    next_attempt_at: now,
    attempts: 0,
  };
}

// Persist a lease before talking to the mail provider. Database claims are
// shared by HTTP and the CLI. Local snapshots support one server process only;
// the standalone retry worker must not run against local storage.
export async function deliverOnboardingEmail(
  id?: string
): Promise<{ claimed: boolean; sent: boolean }> {
  const claimToken = randomUUID();
  let job: OnboardingEmailJob | undefined;
  if (supabase) {
    const { data, error } = await supabase.rpc('tomnap_claim_onboarding_email', {
      p_id: id || null,
      p_claim_token: claimToken,
    });
    if (error) throw new Error('Onboarding email claim unavailable');
    job = data || undefined;
  } else {
    const next = getIdentitySnapshot();
    const now = Date.now();
    job = next.emailJobs.find(
      (item) =>
        (!id || item.id === id) &&
        Date.parse(String(item.expires_at)) > now &&
        ((item.status === 'PENDING' && Date.parse(String(item.next_attempt_at)) <= now) ||
          (item.status === 'RUNNING' && Date.parse(String(item.leased_until)) <= now))
    ) as OnboardingEmailJob | undefined;
    if (job) {
      Object.assign(job, {
        status: 'RUNNING',
        claim_token: claimToken,
        leased_until: new Date(now + 120_000).toISOString(),
        attempts: job.attempts + 1,
      });
      saveIdentitySnapshot(next);
    }
  }
  if (!job) return { claimed: false, sent: false };
  let sent = false;
  try {
    sent = (await sendEmail({ ...job.payload, idempotencyKey: `tomnap-onboarding/${job.id}` }))
      .basarili;
  } catch {
    /* retry after the lease/failure delay */
  }
  if (supabase) {
    const { data, error } = await supabase.rpc('tomnap_finish_onboarding_email', {
      p_id: job.id,
      p_claim_token: claimToken,
      p_sent: sent,
    });
    if (error || data !== true) throw new Error('Onboarding email acknowledgement unavailable');
  } else {
    const next = getIdentitySnapshot();
    const current = next.emailJobs.find((item) => item.id === job!.id);
    if (!current || current.status !== 'RUNNING' || current.claim_token !== claimToken)
      throw new Error('Onboarding email lease lost');
    Object.assign(current, {
      status: sent ? 'SENT' : 'PENDING',
      claim_token: null,
      leased_until: null,
      next_attempt_at: new Date(Date.now() + 300_000).toISOString(),
      sent_at: sent ? new Date().toISOString() : null,
    });
    saveIdentitySnapshot(next);
  }
  return { claimed: true, sent };
}

export async function tryDeliverOnboardingEmail(id: string): Promise<boolean> {
  try {
    return (await deliverOnboardingEmail(id)).sent;
  } catch {
    return false;
  } // The saved job is still pending or recoverable after its lease.
}
