import { request } from '@umijs/max';

export async function uploadFile(file: File, prefix: string = 'products') {
  const formData = new FormData();
  formData.append('file', file);
  return request<API.ResponseBase>('/api/v1/upload', {
    method: 'POST',
    data: formData,
    params: { prefix },
  });
}

export async function deleteFile(key: string) {
  return request<API.ResponseBase>('/api/v1/upload', {
    method: 'DELETE',
    data: { key },
  });
}

export async function getPresignedUrl(key: string, expires: number = 3600) {
  return request<API.ResponseBase>(`/api/v1/upload/presign/${key}`, {
    method: 'GET',
    params: { expires },
  });
}
