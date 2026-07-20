declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.svg';
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';

declare namespace API {
  interface CurrentUser {
    id?: string;
    username: string;
    role: string;
    avatar?: string;
    access?: string;
  }
  interface ResponseBase<T = any> {
    code: number;
    message: string;
    data: T;
  }
  interface PaginatedData<T = any> {
    items: T[];
    total: number;
    page: number;
    page_size: number;
  }
  type LoginParams = {
    username: string;
    password: string;
  };
  type LoginResult = {
    access_token: string;
    refresh_token: string;
    token_type: string;
  };
  interface OrderTrendItem {
    date: string;
    order_count: number;
    order_amount: number;
  }
  interface CustomerRankingItem {
    customer_id: string;
    customer_name: string;
    total_amount: number;
    order_count: number;
  }
  interface InventoryAlertItem {
    id: string;
    product_id: string;
    product_info: string;
    quantity: number;
    locked: number;
    warning_quantity: number;
    product_image_url?: string;
    warehouse_count: number;
  }
  interface ProductSaleItem {
    product_id: string;
    barcode: string;
    product_name: string;
    total_quantity: number;
    total_amount: number;
  }
  interface DashboardStats {
    customer_total: number;
    product_total: number;
    order_total: number;
    employee_total: number;
    order_trend: OrderTrendItem[];
    customer_ranking: CustomerRankingItem[];
    inventory_alerts: InventoryAlertItem[];
    product_sales: ProductSaleItem[];
  }
}
