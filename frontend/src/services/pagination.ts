type PageFetcher<T> = (
  page: number,
  pageSize: number,
) => Promise<API.PaginatedData<T>>;

export async function collectPages<T>(fetchPage: PageFetcher<T>): Promise<T[]> {
  const pageSize = 100;
  const firstPage = await fetchPage(1, pageSize);
  const items = [...firstPage.items];

  for (let page = 2; items.length < firstPage.total; page += 1) {
    const nextPage = await fetchPage(page, pageSize);
    if (nextPage.items.length === 0) {
      throw new Error('分页数据不完整');
    }
    items.push(...nextPage.items);
  }

  return items;
}

type ResponsePageFetcher<T> = (
  page: number,
  pageSize: number,
) => Promise<API.ResponseBase<API.PaginatedData<T>>>;

export function collectResponsePages<T>(
  fetchPage: ResponsePageFetcher<T>,
): Promise<T[]> {
  return collectPages(async (page, pageSize) => {
    const response = await fetchPage(page, pageSize);
    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || '分页数据加载失败');
    }
    return response.data;
  });
}
