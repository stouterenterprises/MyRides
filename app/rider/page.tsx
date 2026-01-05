'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Ride, Market } from '@/lib/types';

export default function RiderDashboard() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAuth();
    loadData();
  }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login');
      return;
    }
    setUser(user);
  }

  async function loadData() {
    // Load active ride
    const { data: rides } = await supabase
      .from('rides')
      .select('*')
      .eq('rider_id', (await supabase.auth.getUser()).data.user?.id)
      .not('status', 'in', '(completed,cancelled_by_rider,cancelled_by_driver,cancelled_by_system)')
      .order('created_at', { ascending: false })
      .limit(1);

    if (rides && rides.length > 0) {
      setActiveRide(rides[0]);
    }

    // Load markets
    const { data, error } = await supabase.functions.invoke('markets-list');
    if (data?.data) {
      setMarkets(data.data);
    }

    setLoading(false);
  }

  async function handleSignOut() {
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
          <h1 className="text-3xl font-bold text-gray-900">MyRides - Rider</h1>
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
          {activeRide ? (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Active {activeRide.job_type}</h2>
              <div className="space-y-2">
                <p><span className="font-medium">Status:</span> {activeRide.status}</p>
                <p><span className="font-medium">Pickup:</span> {activeRide.pickup_address}</p>
                <p><span className="font-medium">Dropoff:</span> {activeRide.dropoff_address}</p>
                <p><span className="font-medium">Fare:</span> ${(activeRide.estimated_fare_cents / 100).toFixed(2)}</p>
              </div>
              <button
                onClick={() => router.push(`/rider/rides/${activeRide.id}`)}
                className="mt-4 w-full bg-primary-600 text-white py-2 px-4 rounded hover:bg-primary-700"
              >
                View Details
              </button>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Request a Ride or Delivery</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => router.push('/rider/request?type=ride')}
                  className="bg-primary-600 text-white py-4 px-6 rounded-lg hover:bg-primary-700"
                >
                  <div className="text-lg font-semibold">Request Ride</div>
                  <div className="text-sm opacity-90">Get a ride to your destination</div>
                </button>
                <button
                  onClick={() => router.push('/rider/request?type=delivery')}
                  className="bg-green-600 text-white py-4 px-6 rounded-lg hover:bg-green-700"
                >
                  <div className="text-lg font-semibold">Request Delivery</div>
                  <div className="text-sm opacity-90">Order delivery from local shops</div>
                </button>
              </div>
            </div>
          )}

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Available Markets</h2>
            {markets.length > 0 ? (
              <div className="grid gap-3">
                {markets.map((market) => (
                  <div key={market.id} className="border rounded p-3">
                    <div className="font-medium">{market.name}</div>
                    <div className="text-sm text-gray-600">
                      Status: <span className="text-green-600">{market.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-600">
                <p>No active markets in your area.</p>
                <button
                  onClick={() => router.push('/rider/request-market')}
                  className="mt-2 text-primary-600 hover:text-primary-700"
                >
                  Request a new market
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/rider/history')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="text-lg font-semibold">Ride History</div>
              <div className="text-sm text-gray-600">View past trips</div>
            </button>
            <button
              onClick={() => router.push('/rider/shops')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="text-lg font-semibold">Shop Directory</div>
              <div className="text-sm text-gray-600">Browse local shops</div>
            </button>
            <button
              onClick={() => router.push('/rider/profile')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="text-lg font-semibold">Profile</div>
              <div className="text-sm text-gray-600">Manage your account</div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
