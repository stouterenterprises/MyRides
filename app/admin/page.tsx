'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pendingDrivers: 0,
    pendingMarketRequests: 0,
    pendingShopRequests: 0,
    activeRides: 0,
  });
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      router.push('/');
      return;
    }

    await loadStats();
    setLoading(false);
  }

  async function loadStats() {
    const [drivers, marketReqs, shopReqs, rides] = await Promise.all([
      supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
      supabase.from('market_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('shop_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('rides').select('id', { count: 'exact', head: true }).not('status', 'in', '(completed,cancelled_by_rider,cancelled_by_driver,cancelled_by_system)'),
    ]);

    setStats({
      pendingDrivers: drivers.count || 0,
      pendingMarketRequests: marketReqs.count || 0,
      pendingShopRequests: shopReqs.count || 0,
      activeRides: rides.count || 0,
    });
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
          <h1 className="text-3xl font-bold text-gray-900">MyRides - Admin Dashboard</h1>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-2xl font-bold text-primary-600">{stats.pendingDrivers}</div>
              <div className="text-sm text-gray-600">Pending Driver Applications</div>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-2xl font-bold text-blue-600">{stats.pendingMarketRequests}</div>
              <div className="text-sm text-gray-600">Market Requests</div>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-2xl font-bold text-green-600">{stats.pendingShopRequests}</div>
              <div className="text-sm text-gray-600">Shop Requests</div>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-2xl font-bold text-orange-600">{stats.activeRides}</div>
              <div className="text-sm text-gray-600">Active Rides</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/admin/drivers')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow text-left"
            >
              <div className="text-lg font-semibold">Driver Management</div>
              <div className="text-sm text-gray-600">Approve & manage drivers</div>
              {stats.pendingDrivers > 0 && (
                <div className="mt-2 inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                  {stats.pendingDrivers} pending
                </div>
              )}
            </button>

            <button
              onClick={() => router.push('/admin/markets')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow text-left"
            >
              <div className="text-lg font-semibold">Market Management</div>
              <div className="text-sm text-gray-600">Manage markets & requests</div>
              {stats.pendingMarketRequests > 0 && (
                <div className="mt-2 inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                  {stats.pendingMarketRequests} requests
                </div>
              )}
            </button>

            <button
              onClick={() => router.push('/admin/shops')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow text-left"
            >
              <div className="text-lg font-semibold">Shop Management</div>
              <div className="text-sm text-gray-600">Approve & manage shops</div>
              {stats.pendingShopRequests > 0 && (
                <div className="mt-2 inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                  {stats.pendingShopRequests} pending
                </div>
              )}
            </button>

            <button
              onClick={() => router.push('/admin/rides')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow text-left"
            >
              <div className="text-lg font-semibold">Ride Monitoring</div>
              <div className="text-sm text-gray-600">View all rides & deliveries</div>
            </button>

            <button
              onClick={() => router.push('/admin/ledger')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow text-left"
            >
              <div className="text-lg font-semibold">Ledger & Payouts</div>
              <div className="text-sm text-gray-600">Financial overview</div>
            </button>

            <button
              onClick={() => router.push('/admin/config')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow text-left"
            >
              <div className="text-lg font-semibold">Platform Config</div>
              <div className="text-sm text-gray-600">Update platform settings</div>
            </button>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <button
                onClick={() => router.push('/admin/markets/create')}
                className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded"
              >
                Create New Market
              </button>
              <button
                onClick={() => router.push('/admin/payouts/run-batch')}
                className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded"
              >
                Run Daily Payout Batch
              </button>
              <button
                onClick={() => router.push('/admin/reports')}
                className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded"
              >
                View Reports & Analytics
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
