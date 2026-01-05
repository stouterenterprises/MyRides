import { createServiceClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse, corsHeaders } from '../_shared/response.ts';
import { getAllConfig, getConfigValue } from '../_shared/config.ts';
import Stripe from 'https://esm.sh/stripe@14.12.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { amount_cents } = body;

    const supabase = createServiceClient();
    const config = await getAllConfig();

    // Get driver profile
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (driverError || !driver) {
      return errorResponse('Driver profile not found', 404);
    }

    // Calculate available balance
    const { data: ledgerEntries } = await supabase
      .from('ledger_entries')
      .select('amount_cents')
      .eq('driver_id', driver.id)
      .eq('status', 'available');

    const availableBalance = ledgerEntries?.reduce(
      (sum: number, entry: any) => sum + entry.amount_cents,
      0
    ) || 0;

    if (availableBalance <= 0) {
      return errorResponse('No available balance for payout');
    }

    // Determine payout amount
    const payoutAmount = amount_cents || availableBalance;

    if (payoutAmount > availableBalance) {
      return errorResponse(
        `Requested amount exceeds available balance of $${(availableBalance / 100).toFixed(2)}`
      );
    }

    // Calculate expedited fee
    const feePercent = getConfigValue(config, 'payout_expedited_fee_percent', 2);
    const feeFlat = getConfigValue(config, 'payout_expedited_flat_fee', 100);

    const percentFee = Math.round((payoutAmount * feePercent) / 100);
    const totalFee = percentFee + feeFlat;
    const netAmount = payoutAmount - totalFee;

    if (netAmount <= 0) {
      return errorResponse('Payout amount too small after fees');
    }

    // Check payout method
    const method = driver.preferred_payout_method || 'stripe_connect';

    if (method === 'stripe_connect' && !driver.stripe_account_id) {
      return errorResponse('Stripe Connect account not configured');
    }

    if (method === 'paypal' && !driver.paypal_email) {
      return errorResponse('PayPal email not configured');
    }

    // Create payout record
    const { data: payout, error: payoutError } = await supabase
      .from('payouts')
      .insert({
        driver_id: driver.id,
        amount_cents: payoutAmount,
        fee_cents: totalFee,
        net_amount_cents: netAmount,
        method,
        status: 'processing',
        is_expedited: true,
      })
      .select()
      .single();

    if (payoutError) throw payoutError;

    // Record fee as ledger entry
    await supabase.from('ledger_entries').insert({
      driver_id: driver.id,
      payout_id: payout.id,
      entry_type: 'payout_fee',
      amount_cents: -totalFee,
      status: 'paid_out',
      description: 'Expedited payout fee',
    });

    try {
      if (method === 'stripe_connect') {
        // Process Stripe payout
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
          apiVersion: '2023-10-16',
        });

        const transfer = await stripe.transfers.create({
          amount: netAmount,
          currency: 'usd',
          destination: driver.stripe_account_id,
          metadata: {
            payout_id: payout.id,
            driver_id: driver.id,
            is_expedited: 'true',
          },
        });

        // Update payout
        await supabase
          .from('payouts')
          .update({
            status: 'completed',
            stripe_transfer_id: transfer.id,
            completed_at: new Date().toISOString(),
          })
          .eq('id', payout.id);

        // Mark ledger entries as paid_out (up to the payout amount)
        let remaining = payoutAmount;
        const { data: availableEntries } = await supabase
          .from('ledger_entries')
          .select('*')
          .eq('driver_id', driver.id)
          .eq('status', 'available')
          .order('created_at', { ascending: true });

        for (const entry of availableEntries || []) {
          if (remaining <= 0) break;

          if (entry.amount_cents <= remaining) {
            await supabase
              .from('ledger_entries')
              .update({ status: 'paid_out', payout_id: payout.id })
              .eq('id', entry.id);

            remaining -= entry.amount_cents;
          }
        }

        // Notify driver
        await supabase.from('notifications').insert({
          user_id: user.id,
          type: 'payout',
          title: 'Expedited payout processed',
          body: `$${(netAmount / 100).toFixed(2)} sent (fee: $${(totalFee / 100).toFixed(2)})`,
          data: { payout_id: payout.id, amount_cents: netAmount, fee_cents: totalFee },
        });

        return successResponse({
          payout,
          net_amount_cents: netAmount,
          fee_cents: totalFee,
          transfer_id: transfer.id,
        });
      } else {
        // PayPal placeholder
        return successResponse({
          payout,
          message: 'PayPal payout initiated (pending implementation)',
        });
      }
    } catch (error) {
      // Update payout to failed
      await supabase
        .from('payouts')
        .update({
          status: 'failed',
          failure_reason: error.message,
        })
        .eq('id', payout.id);

      throw error;
    }
  } catch (error) {
    console.error('Error processing expedited payout:', error);
    return errorResponse(error.message, 500);
  }
});
