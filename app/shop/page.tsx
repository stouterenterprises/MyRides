'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function ShopOwnerDashboard() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [shops, setShops] = useState<any[]>([]);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (selectedShop) {
      loadOrders(selectedShop);
    }
  }, [selectedShop]);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login');
      return;
    }

    // Check if user is shop owner/staff
    const { data: staffRecords } = await supabase
      .from('shop_staff')
      .select('*, shops(*)')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (!staffRecords || staffRecords.length === 0) {
      router.push('/');
      return;
    }

    setUser(user);
    setShops(staffRecords.map((s: any) => s.shops));

    if (staffRecords.length > 0) {
      setSelectedShop(staffRecords[0].shops.id);
    }

    setLoading(false);
  }

  async function loadOrders(shopId: string) {
    const { data, error } = await supabase.functions.invoke('shop-orders-view', {
      body: { shop_id: shopId, status: 'active' },
    });

    if (data?.success) {
      setActiveOrders(data.data || []);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  const currentShop = shops.find((s) => s.id === selectedShop);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Shop Dashboard</h1>
            {currentShop && (
              <p className="text-sm text-gray-600 mt-1">{currentShop.name}</p>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {shops.length > 1 && (
          <div className="mb-6 bg-white shadow rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Shop
            </label>
            <select
              value={selectedShop || ''}
              onChange={(e) => setSelectedShop(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            >
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-6">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Active Orders ({activeOrders.length})</h2>
              <button
                onClick={() => selectedShop && loadOrders(selectedShop)}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Refresh
              </button>
            </div>

            {activeOrders.length === 0 ? (
              <p className="text-gray-600 text-center py-8">No active orders</p>
            ) : (
              <div className="space-y-4">
                {activeOrders.map((order) => (
                  <div key={order.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-semibold">Order #{order.id.slice(0, 8)}</div>
                        <div className="text-sm text-gray-600">
                          {order.customer_name} • {order.customer_phone}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`inline-block px-3 py-1 rounded text-sm font-medium ${
                          order.status === 'requested' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'matched' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'picked_up' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {order.status.replace(/_/g, ' ')}
                        </div>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="text-sm font-medium text-gray-700 mb-1">Items:</div>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {order.order_items_summary?.map((item: any, idx: number) => (
                          <li key={idx}>
                            {item.quantity}x {item.name} - ${(item.price / 100).toFixed(2)}
                            {item.instructions && (
                              <span className="text-gray-500 italic ml-2">({item.instructions})</span>
                            )}
                          </li>
                        )) || (
                          <li className="text-gray-500">{order.delivery_order_summary || 'No items listed'}</li>
                        )}
                      </ul>
                    </div>

                    <div className="text-sm text-gray-600">
                      <div><span className="font-medium">Pickup:</span> {order.pickup_address}</div>
                      <div><span className="font-medium">Dropoff:</span> {order.dropoff_address}</div>
                      {order.delivery_instructions && (
                        <div><span className="font-medium">Instructions:</span> {order.delivery_instructions}</div>
                      )}
                      {order.driver_info && (
                        <div className="mt-2 pt-2 border-t">
                          <span className="font-medium">Driver:</span> {order.driver_info.vehicle} ({order.driver_info.plate})
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t flex justify-between items-center">
                      <div className="font-semibold text-lg">
                        Total: ${((order.final_fare_cents || order.estimated_fare_cents) / 100).toFixed(2)}
                      </div>
                      <button
                        onClick={() => router.push(`/shop/orders/${order.id}`)}
                        className="text-sm text-primary-600 hover:text-primary-700"
                      >
                        View Details →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/shop/menu')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow text-left"
            >
              <div className="text-lg font-semibold">Menu Management</div>
              <div className="text-sm text-gray-600">Manage your menu items</div>
            </button>
            <button
              onClick={() => router.push('/shop/staff')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow text-left"
            >
              <div className="text-lg font-semibold">Staff Management</div>
              <div className="text-sm text-gray-600">Manage team members</div>
            </button>
            <button
              onClick={() => router.push('/shop/analytics')}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow text-left"
            >
              <div className="text-lg font-semibold">Analytics</div>
              <div className="text-sm text-gray-600">View sales & insights</div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
