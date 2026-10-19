import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/**
 * A resolved AxiosResponse with only the data filled in, for tests that mock
 * the API service. The components only ever read `.data` (services/api
 * returns the response body wrapped in the axios envelope), but the mocks
 * still have to satisfy the full type.
 */
export function ok<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  };
}
