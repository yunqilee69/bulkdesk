import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import { CustomerListScreen } from '../features/customers/CustomerListScreen';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { DeliveryListScreen } from '../features/delivery/DeliveryListScreen';
import { InventoryOperationScreen } from '../features/inventory/InventoryOperationScreen';
import { OrdersWorkspaceScreen } from '../features/orders/OrdersWorkspaceScreen';
import { PocDashboard } from '../features/poc/PocDashboard';
import { CartScreen } from '../features/cart/CartScreen';
import { ProductDetailScreen } from '../features/products/ProductDetailScreen';
import { ProductHomeScreen } from '../features/products/ProductHomeScreen';
import { buildNavigation, type MobileRouteKey } from './roleNavigation';

export type AppNavigatorProps = {
  onLogout?: () => void;
  roles?: readonly string[];
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const labels: Record<MobileRouteKey, string> = {
  products: '商品',
  dashboard: '工作台',
  customers: '客户',
  orders: '订单',
  inventory: '库存',
  delivery: '派送',
  payments: '收款',
  cart: '购物车',
  profile: '我的',
};

function PlaceholderScreen({ label }: { label: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>{label}</Text>
      <Text style={styles.placeholderBody}>BulkDesk 移动端业务页面建设中。</Text>
    </View>
  );
}

function renderScreen(route: MobileRouteKey, onLogout?: () => void) {
  switch (route) {
    case 'products':
      return ProductHomeScreen;
    case 'dashboard':
      return function Dashboard() {
        return <DashboardScreen />;
      };
    case 'customers':
      return CustomerListScreen;
    case 'orders':
      return OrdersWorkspaceScreen;
    case 'inventory':
      return InventoryOperationScreen;
    case 'delivery':
      return DeliveryListScreen;
    case 'cart':
      return function Cart() {
        const navigation = useNavigation<NavigationProp<ParamListBase>>();
        return <CartScreen onNavigateProductDetail={productId => navigation.navigate('ProductDetail', { productId })} />;
      };
    case 'profile':
      return function Profile() {
        return (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderTitle}>我的</Text>
            <Text style={styles.placeholderBody}>能力 POC 保留在本页，便于现场验证扫码、拍照和签名。</Text>
            <PocDashboard />
            <Button title="退出登录" onPress={onLogout} />
          </View>
        );
      };
    default:
      return function Screen() {
        return <PlaceholderScreen label={labels[route]} />;
      };
  }
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    padding: 24,
  },
  placeholderBody: {
    marginTop: 8,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
});

function MainTabs({ onLogout, roles = ['warehouse_manager'] }: AppNavigatorProps) {
  const routes = buildNavigation(roles);

  return (
    <Tab.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
      {routes.map(route => (
        <Tab.Screen
          key={route}
          name={route}
          component={renderScreen(route, onLogout)}
          options={{ title: labels[route], headerShown: route !== 'products' && route !== 'cart' }}
        />
      ))}
    </Tab.Navigator>
  );
}

export function AppNavigator({ onLogout, roles = ['warehouse_manager'] }: AppNavigatorProps) {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="MainTabs" options={{ headerShown: false }}>
          {() => <MainTabs roles={roles} onLogout={onLogout} />}
        </Stack.Screen>
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: '商品详情' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
