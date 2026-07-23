import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { DeliveryDetailScreen } from '../features/delivery/DeliveryDetailScreen';
import { DeliveryExceptionSheet } from '../features/delivery/DeliveryExceptionSheet';
import { ReturnOrderScreen } from '../features/delivery/ReturnOrderScreen';

describe('delivery screens', () => {
  it('renders detail, exception and return screens', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity, retry: false } } });
    function Providers({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<Providers><DeliveryDetailScreen /></Providers>);
      ReactTestRenderer.create(<Providers><DeliveryExceptionSheet /></Providers>);
      ReactTestRenderer.create(<Providers><ReturnOrderScreen /></Providers>);
    });
    queryClient.clear();
  });
});
