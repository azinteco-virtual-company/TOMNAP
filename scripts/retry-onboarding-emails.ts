import 'dotenv/config';
import { supabase } from '../src/server/services/supabase';
import { deliverOnboardingEmail } from '../src/server/services/onboardingOutbox';

const limit = Number(process.argv[2] || 20);
if (!supabase) {
  console.error(
    'Email retry worker requires Supabase. Local identity storage supports one running process only.'
  );
  process.exitCode = 1;
} else if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
  console.error('Usage: npx tsx scripts/retry-onboarding-emails.ts [1..100]');
  process.exitCode = 1;
} else {
  let claimed = 0;
  let sent = 0;
  try {
    for (; claimed < limit; claimed++) {
      const result = await deliverOnboardingEmail();
      if (!result.claimed) break;
      if (result.sent) sent++;
    }
    console.log(JSON.stringify({ claimed, sent, pendingRetry: claimed - sent }));
    if (sent < claimed) process.exitCode = 1;
  } catch {
    console.error('Email queue unavailable; no delivery payload or recipient was logged.');
    process.exitCode = 1;
  }
}
