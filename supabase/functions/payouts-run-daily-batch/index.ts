import { createServiceClient } from '../_shared/supabase.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';
import Stripe from 'https://esm.sh/stripe@14.12.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const supabase = createServiceClient();

    // Get all drivers with available balance
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, user_id, stripe_account_id, paypal_email, preferred_payout_method')
      .eq('approval_status', 'approved');

    if (!drivers || drivers.length === 0) {
      return successResponse({ processed: 0, message: 'No approved drivers' });
    }

    const results = [];

    for (const driver of drivers) {
      try {
        // Calculate available balance
        const { data: ledgerEntries } = await supabase
          .from('ledger_entries')
          .select('amount_cents')
          .eq('driver_id', driver.id)
          .eq('status', 'available');

        if (!ledgerEntries || ledgerEntries.length === 0) {
          continue; // No available balance
        }

        const availableBalance = ledgerEntries.reduce(
          (sum: number, entry: any) => sum + entry.amount_cents,
          0
        );

        if (availableBalance <= 0) {
          continue; // Skip negative or zero balances
        }

        // Process payout based on preferred method
        const method = driver.preferred_payout_method || 'stripe_connect';
        let payoutResult;

        if (method === 'stripe_connect' && driver.stripe_account_id) {
          payoutResult = await processStripePayout(
            supabase,
            driver,
            availableBalance,
            false
          );
        } else if (method === 'paypal' && driver.paypal_email) {
          payoutResult = await processPayPalPayout(
            supabase,
            driver,
            availableBalance,
            false
          );
        } else {
          console.log(`Skipping driver ${driver.id}: No payout method configured`);
          continue;
        }

        results.push({
          driver_id: driver.id,
          amount_cents: availableBalance,
          method,
          status: payoutResult.status,
        });
      } catch (error) {
        console.error(`Error processing payout for driver ${driver.id}:`, error);
        results.push({
          driver_id: driver.id,
          error: error.message,
        });
      }
    }

    return successResponse({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Error running daily batch payouts:', error);
    return errorResponse(error.message, 500);
  }
});

async function processStripePayout(
  supabase: any,
  driver: any,
  amountCents: number,
  isExpedited: boolean
) {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2023-10-16',
  });

  // Fee is 0 for daily batch, configurable for expedited
  const feeCents = isExpedited ? 0 : 0; // Fees handled in expedited function
  const netAmount = amountCents - feeCents;

  // Create payout record
  const { data: payout, error: payoutError } = await supabase
    .from('payouts')
    .insert({
      driver_id: driver.id,
      amount_cents: amountCents,
      fee_cents: feeCents,
      net_amount_cents: netAmount,
      method: 'stripe_connect',
      status: 'processing',
      is_expedited: isExpedited,
    })
    .select()
    .single();

  if (payoutError) throw payoutError;

  try {
    // Create Stripe transfer
    const transfer = await stripe.transfers.create({
      amount: netAmount,
      currency: 'usd',
      destination: driver.stripe_account_id,
      metadata: {
        payout_id: payout.id,
        driver_id: driver.id,
        is_expedited: isExpedited.toString(),
      },
    });

    // Update payout with transfer ID
    await supabase
      .from('payouts')
      .update({
        status: 'completed',
        stripe_transfer_id: transfer.id,
        completed_at: new Date().toISOString(),
      })
      .eq('id', payout.id);

    // Mark ledger entries as paid_out
    await supabase
      .from('ledger_entries')
      .update({
        status: 'paid_out',
        payout_id: payout.id,
      })
      .eq('driver_id', driver.id)
      .eq('status', 'available');

    // Notify driver
    await supabase.from('notifications').insert({
      user_id: driver.user_id,
      type: 'payout',
      title: 'Payout processed',
      body: `$${(netAmount / 100).toFixed(2)} has been sent to your account`,
      data: { payout_id: payout.id, amount_cents: netAmount },
    });

    return { status: 'completed', payout_id: payout.id };
  } catch (error) {
    // Update payout status to failed
    await supabase
      .from('payouts')
      .update({
        status: 'failed',
        failure_reason: error.message,
      })
      .eq('id', payout.id);

    throw error;
  }
}

async function processPayPalPayout(
  supabase: any,
  driver: any,
  amountCents: number,
  isExpedited: boolean
) {
  // PayPal implementation placeholder
  // In production, integrate with PayPal Payouts API
  const feeCents = isExpedited ? 0 : 0;
  const netAmount = amountCents - feeCents;

  const { data: payout } = await supabase
    .from('payouts')
    .insert({
      driver_id: driver.id,
      amount_cents: amountCents,
      fee_cents: feeCents,
      net_amount_cents: netAmount,
      method: 'paypal',
      status: 'pending',
      is_expedited: isExpedited,
      metadata: { note: 'PayPal integration pending' },
    })
    .select()
    .single();

  return { status: 'pending', payout_id: payout.id };
}
