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
    path: '/product', name: 'product', icon: 'shopping',
    routes: [
      { path: '/product', redirect: '/product/list' },
      { path: '/product/list', name: 'list', component: './Product' },
      { path: '/product/categories', name: 'categories', component: './System/categories' },
      { path: '/product/brands', name: 'brands', component: './System/brands' },
      { path: '/product/price-logs', name: 'price-logs', component: './Product/priceLogs' },
    ],
  },
  {
    path: '/inventory', name: 'inventory', icon: 'container',
    routes: [
      { path: '/inventory', redirect: '/inventory/stock' },
      { path: '/inventory/suppliers', name: 'suppliers', access: 'canAdmin', component: './Inventory/suppliers' },
      { path: '/inventory/warehouses', name: 'warehouses', access: 'canAdmin', component: './Inventory/warehouses' },
      { path: '/inventory/stock', name: 'stock', component: './Inventory/stock' },
      { path: '/inventory/operations', name: 'operations', component: './Inventory/operations' },
      { path: '/inventory/movements', name: 'movements', component: './Inventory/movements' },
    ],
  },
  {
    path: '/order', name: 'order', icon: 'fileDone',
    routes: [
      { path: '/order', redirect: '/order/list' },
      { path: '/order/list', name: 'list', component: './Order' },
    ],
  },
  { path: '/customer', name: 'customer', icon: 'user', component: './Customer' },
  { path: '/level', name: 'level', icon: 'crown', access: 'canAdmin', component: './Level' },
  { path: '/employee', name: 'employee', icon: 'team', access: 'canAdmin', component: './Employee' },
  { path: '/', redirect: '/dashboard' },
  { component: './exception/404', path: '/*' },
];
