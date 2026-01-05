'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Driver, Ride } from '@/lib/types';

export default function DriverDashboard() {
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [balance, setBalance] = useState(0);
  const [pendingOffers, setPendingOffers] = useState<any[]>([]);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (driver && isOnline) {
      // Start location tracking
      const interval = setInterval(sendLocationPing, 10000); // Every 10 seconds
      return () => clearInterval(interval);
    }
  }, [driver, isOnline]);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login');
      return;
    }

    // Get driver profile
    const { data: driverData } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!driverData) {
      router.push('/driver/onboard');
      return;
    }

    if (driverData.approval_status === 'pending') {
      router.push('/driver/pending');
      return;
    }

    if (driverData.approval_status !== 'approved') {
      router.push('/driver/suspended');
      return;
    }

    setDriver(driverData);
    setIsOnline(driverData.is_online);
    await loadData(driverData);
    setLoading(false);
  }

  async function loadData(driverData: Driver) {
    // Load balance
    const { data: ledgerData } = await supabase
      .from('ledger_entries')
      .select('amount_cents')
      .eq('driver_id', driverData.id)
      .eq('status', 'available');

    const totalBalance = ledgerData?.reduce((sum, entry) => sum + entry.amount_cents, 0) || 0;
    setBalance(totalBalance);

    // Load active ride
    const { data: rides } = await supabase
      .from('rides')
      .select('*')
      .eq('driver_id', driverData.id)
      .not('status', 'in', '(completed,cancelled_by_rider,cancelled_by_driver,cancelled_by_system)')
      .limit(1);

    if (rides && rides.length > 0) {
      setActiveRide(rides[0]);
    }

    // Load pending offers
    const { data: offers } = await supabase
      .from('ride_offers')
      .select('*, rides(*)')
      .eq('driver_id', driverData.id)
      .eq('offer_status', 'pending')
      .gt('expires_at', new Date().toISOString());

    setPendingOffers(offers || []);
  }

  async function toggleOnline() {
    if (!driver) return;

    const newStatus = !isOnline;
    const { error } = await supabase
      .from('drivers')
      .update({ is_online: newStatus })
      .eq('id', driver.id);

    if (!error) {
      setIsOnline(newStatus);
      if (newStatus) {
        sendLocationPing();
      }
    }
  }

  async function sendLocationPing() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(async (position) => {
      await supabase.functions.invoke('locations-ping', {
        body: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading,
          speed_kmh: position.coords.speed ? position.coords.speed * 3.6 : null,
        },
      });
    });
  }

  async function handleSignOut() {
    if (driver && isOnline) {
      await supabase.from('drivers').update({ is_online: false }).eq('id', driver.id);
    }
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">MyRides - Driver</h1>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">
                  Status: {isOnline ? 'Online' : 'Offline'}
                </h2>
                <p className="text-sm text-gray-600">
                  {isOnline ? 'Accepting ride requests' : 'Not accepting requests'}
                </p>
              </div>
              <button
                onClick={toggleOnline}
                className={`px-6 py-3 rounded-lg font-semibold ${
                  isOnline
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isOnline ? 'Go Offline' : 'Go Online'}
              </button>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Wallet</h2>
            <div className="text-3xl font-bold text-green-600">
              ${(balance / 100).toFixed(2)}
            </div>
            <p className="text-sm text-gray-600">Available balance</p>
            <div className="mt-4 space-x-4">
              <button
                onClick={() => router.push('/driver/wallet')}
                className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700"
              >
                View Wallet
              </button>
              <button
                onClick={() => router.push('/driver/payout')}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
              >
                Request Payout
              </button>
            </div>
          </div>

          {activeRide && (
            <div className="bg-white shadow rounded-lg p-6 border-l-4 border-green-500">
              <h2 className="text-xl font-semibold mb-4">Active {activeRide.job_type}</h2>
              <div className="space-y-2">
                <p><span className="font-medium">Status:</span> {activeRide.status}</p>
                <p><span className="font-medium">Pickup:</span> {activeRide.pickup_address}</p>
                <p><span className="font-medium">Dropoff:</span> {activeRide.dropoff_address}</p>
                <p><span className="font-medium">Earnings:</span> ${((activeRide.driver_earnings_cents || 0) / 100).toFixed(2)}</p>
              </div>
              <button
                onClick={() => router.push(`/driver/rides/${activeRide.id}`)}
                className="mt-4 w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
              >
                Manage Ride
              </button>
            </div>
          )}

          {pendingOffers.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Pending Offers ({pendingOffers.length})</h2>
              <div className="space-y-4">
                {pendingOffers.map((offer) => (
                  <div key={offer.id} className="border rounded p-4">
                    <p className="font-medium">{offer.rides.pickup_address} → {offer.rides.dropoff_address}</p>
                    <p className="text-sm text-gray-600">Fare: ${(offer.baseline_fare_cents / 100).toFixed(2)}</p>
                    <button
                      onClick={() => router.push(`/driver/offers/${offer.id}`)}
                      className="mt-2 w-full bg-primary-600 text-white py-2 px-4 rounded hover:bg-primary-700"
                    >
                      View Offer
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => router.push('/driver/history')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="text-lg font-semibold">Ride History</div>
              <div className="text-sm text-gray-600">View completed rides</div>
            </button>
            <button
              onClick={() => router.push('/driver/profile')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="text-lg font-semibold">Profile</div>
              <div className="text-sm text-gray-600">Manage your settings</div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
