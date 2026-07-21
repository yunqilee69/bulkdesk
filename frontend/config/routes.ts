export default [
  {
    path: '/user',
    layout: false,
    routes: [
      { path: '/user/login', name: 'login', component: './user/login' },
      { path: '/user', redirect: '/user/login' },
    ],
  },
  { path: '/dashboard', name: 'dashboard', icon: 'dashboard', component: './Dashboard' },
  {
    path: '/product', name: 'product', icon: 'shopping', access: 'canWarehouse',
    routes: [
      { path: '/product', redirect: '/product/list' },
      { path: '/product/list', name: 'list', access: 'canWarehouse', component: './Product' },
      { path: '/product/categories', name: 'categories', access: 'canWarehouse', component: './System/categories' },
      { path: '/product/brands', name: 'brands', access: 'canWarehouse', component: './System/brands' },
      { path: '/product/price-logs', name: 'price-logs', access: 'canWarehouse', component: './Product/priceLogs' },
    ],
  },
  {
    path: '/inventory', name: 'inventory', icon: 'container', access: 'canWarehouse',
    routes: [
      { path: '/inventory', redirect: '/inventory/stock' },
      { path: '/inventory/stock', name: 'stock', access: 'canWarehouse', component: './Inventory/stock' },
      { path: '/inventory/operations', name: 'operations', access: 'canWarehouse', component: './Inventory/operations' },
      { path: '/inventory/movements', name: 'movements', access: 'canWarehouse', component: './Inventory/movements' },
      { path: '/inventory/warehouses', name: 'warehouses', access: 'canWarehouse', component: './Inventory/warehouses' },
      { path: '/inventory/suppliers', name: 'suppliers', access: 'canWarehouse', component: './Inventory/suppliers' },
    ],
  },
  {
    path: '/order', name: 'order', icon: 'fileDone', access: 'canWarehouse',
    routes: [
      { path: '/order', redirect: '/order/list' },
      { path: '/order/list', name: 'list', access: 'canWarehouse', component: './Order' },
      { path: '/order/detail/:id', access: 'canWarehouse', component: './Order/Detail', hideInMenu: true },
      { path: '/order/returns', name: 'returns', access: 'canWarehouse', component: './ReturnOrder' },
    ],
  },
  { path: '/delivery', name: 'delivery', icon: 'car', access: 'canDelivery', component: './Delivery' },
  { path: '/customer', name: 'customer', icon: 'user', access: 'canCustomerRead', component: './Customer' },
  { path: '/level', name: 'level', icon: 'crown', access: 'canAdmin', component: './Level' },
  { path: '/employee', name: 'employee', icon: 'team', access: 'canAdmin', component: './Employee' },
  { path: '/', redirect: '/dashboard' },
  { component: './exception/404', path: '/*' },
];
