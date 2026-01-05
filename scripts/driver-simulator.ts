#!/usr/bin/env tsx

/**
 * Driver Simulator for MyRides Platform
 *
 * This script simulates a driver accepting rides and updating status
 * Usage: npm run simulator
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser: any = null;
let currentDriver: any = null;

async function main() {
  console.log('='.repeat(50));
  console.log('MyRides Driver Simulator');
  console.log('='.repeat(50));
  console.log('');

  await login();
  await mainMenu();
}

async function login() {
  console.log('Login to your driver account:');
  const email = await question('Email: ');
  const password = await question('Password: ');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Login failed:', error.message);
    process.exit(1);
  }

  currentUser = data.user;

  // Get driver profile
  const { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('user_id', currentUser.id)
    .single();

  if (!driver) {
    console.error('Driver profile not found. Please sign up as a driver first.');
    process.exit(1);
  }

  currentDriver = driver;
  console.log(`\nWelcome, ${currentUser.email}!`);
  console.log(`Driver ID: ${driver.id}`);
  console.log(`Status: ${driver.approval_status}`);
  console.log(`Online: ${driver.is_online}`);
  console.log('');
}

async function mainMenu() {
  while (true) {
    console.log('\nMain Menu:');
    console.log('1. Go Online/Offline');
    console.log('2. View Pending Offers');
    console.log('3. View Active Ride');
    console.log('4. View Wallet Balance');
    console.log('5. Send Location Ping');
    console.log('6. Exit');
    console.log('');

    const choice = await question('Select option: ');

    switch (choice) {
      case '1':
        await toggleOnline();
        break;
      case '2':
        await viewPendingOffers();
        break;
      case '3':
        await viewActiveRide();
        break;
      case '4':
        await viewWallet();
        break;
      case '5':
        await sendLocationPing();
        break;
      case '6':
        console.log('Goodbye!');
        process.exit(0);
      default:
        console.log('Invalid option');
    }
  }
}

async function toggleOnline() {
  const newStatus = !currentDriver.is_online;

  const { error } = await supabase
    .from('drivers')
    .update({ is_online: newStatus })
    .eq('id', currentDriver.id);

  if (error) {
    console.error('Error updating status:', error.message);
    return;
  }

  currentDriver.is_online = newStatus;
  console.log(`\nYou are now ${newStatus ? 'ONLINE' : 'OFFLINE'}`);

  if (newStatus) {
    await sendLocationPing();
  }
}

async function viewPendingOffers() {
  const { data: offers, error } = await supabase
    .from('ride_offers')
    .select('*, rides(*)')
    .eq('driver_id', currentDriver.id)
    .eq('offer_status', 'pending')
    .gt('expires_at', new Date().toISOString());

  if (error) {
    console.error('Error fetching offers:', error.message);
    return;
  }

  if (!offers || offers.length === 0) {
    console.log('\nNo pending offers');
    return;
  }

  console.log(`\nYou have ${offers.length} pending offer(s):`);
  offers.forEach((offer, index) => {
    console.log(`\n${index + 1}. ${offer.rides.job_type.toUpperCase()}`);
    console.log(`   From: ${offer.rides.pickup_address}`);
    console.log(`   To: ${offer.rides.dropoff_address}`);
    console.log(`   Fare: $${(offer.baseline_fare_cents / 100).toFixed(2)}`);
    console.log(`   Offer ID: ${offer.id}`);
  });

  const respond = await question('\nRespond to an offer? (y/n): ');
  if (respond.toLowerCase() === 'y') {
    await respondToOffer(offers);
  }
}

async function respondToOffer(offers: any[]) {
  const index = parseInt(await question('Select offer number: ')) - 1;
  if (index < 0 || index >= offers.length) {
    console.log('Invalid selection');
    return;
  }

  const offer = offers[index];

  console.log('\nActions:');
  console.log('1. Accept baseline fare');
  console.log('2. Submit custom quote');
  console.log('3. Reject');

  const action = await question('Select action: ');

  let body: any = { offer_id: offer.id };

  switch (action) {
    case '1':
      body.action = 'accept';
      break;
    case '2':
      const quote = await question('Enter quote amount in dollars (e.g., 15.50): ');
      body.action = 'quote';
      body.quote_fare_cents = Math.round(parseFloat(quote) * 100);
      break;
    case '3':
      body.action = 'reject';
      break;
    default:
      console.log('Invalid action');
      return;
  }

  const { data, error } = await supabase.functions.invoke('offers-respond', {
    body,
  });

  if (error || !data?.success) {
    console.error('Error:', error || data?.error);
    return;
  }

  console.log(`\n✓ ${action === '1' ? 'Offer accepted!' : action === '2' ? 'Quote submitted!' : 'Offer rejected'}`);
}

async function viewActiveRide() {
  const { data: rides } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', currentDriver.id)
    .not('status', 'in', '(completed,cancelled_by_rider,cancelled_by_driver,cancelled_by_system)')
    .limit(1);

  if (!rides || rides.length === 0) {
    console.log('\nNo active ride');
    return;
  }

  const ride = rides[0];
  console.log(`\nActive ${ride.job_type}:`);
  console.log(`Status: ${ride.status}`);
  console.log(`Pickup: ${ride.pickup_address}`);
  console.log(`Dropoff: ${ride.dropoff_address}`);
  console.log(`Earnings: $${((ride.driver_earnings_cents || 0) / 100).toFixed(2)}`);

  const update = await question('\nUpdate status? (y/n): ');
  if (update.toLowerCase() === 'y') {
    await updateRideStatus(ride);
  }
}

async function updateRideStatus(ride: any) {
  console.log('\nAvailable status updates:');
  const validStatuses = getValidStatusTransitions(ride.status);

  validStatuses.forEach((status, index) => {
    console.log(`${index + 1}. ${status}`);
  });

  const choice = parseInt(await question('Select status: ')) - 1;
  if (choice < 0 || choice >= validStatuses.length) {
    console.log('Invalid selection');
    return;
  }

  const newStatus = validStatuses[choice];

  const { data, error } = await supabase.functions.invoke('ride-status-update', {
    body: {
      ride_id: ride.id,
      status: newStatus,
    },
  });

  if (error || !data?.success) {
    console.error('Error:', error || data?.error);
    return;
  }

  console.log(`\n✓ Status updated to: ${newStatus}`);
}

function getValidStatusTransitions(currentStatus: string): string[] {
  const transitions: Record<string, string[]> = {
    matched: ['driver_arriving'],
    driver_arriving: ['driver_arrived'],
    driver_arrived: ['in_progress', 'arriving_at_pickup'],
    arriving_at_pickup: ['picked_up'],
    picked_up: ['arriving_at_dropoff'],
    in_progress: ['completed', 'arriving_at_dropoff'],
    arriving_at_dropoff: ['delivered'],
    delivered: ['completed'],
  };

  return transitions[currentStatus] || [];
}

async function viewWallet() {
  const { data: ledgerEntries } = await supabase
    .from('ledger_entries')
    .select('amount_cents, status')
    .eq('driver_id', currentDriver.id);

  const available = ledgerEntries
    ?.filter((e) => e.status === 'available')
    .reduce((sum, e) => sum + e.amount_cents, 0) || 0;

  const pending = ledgerEntries
    ?.filter((e) => e.status === 'pending')
    .reduce((sum, e) => sum + e.amount_cents, 0) || 0;

  const paidOut = ledgerEntries
    ?.filter((e) => e.status === 'paid_out')
    .reduce((sum, e) => sum + e.amount_cents, 0) || 0;

  console.log('\nWallet Balance:');
  console.log(`Available: $${(available / 100).toFixed(2)}`);
  console.log(`Pending: $${(pending / 100).toFixed(2)}`);
  console.log(`Paid Out: $${(paidOut / 100).toFixed(2)}`);
}

async function sendLocationPing() {
  // Simulate location (San Francisco coordinates)
  const lat = 37.7749 + (Math.random() - 0.5) * 0.1;
  const lng = -122.4194 + (Math.random() - 0.5) * 0.1;

  const { error } = await supabase.functions.invoke('locations-ping', {
    body: {
      lat,
      lng,
      heading: Math.random() * 360,
      speed_kmh: Math.random() * 60,
    },
  });

  if (error) {
    console.error('Error sending location:', error);
    return;
  }

  console.log(`\n✓ Location updated: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
}

main().catch(console.error);
