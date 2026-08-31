import { getApiBaseUrl } from "@/lib/constants";

/**
 * API 에러 클래스
 * HTTP 상태 코드와 에러 데이터를 포함합니다.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
    public headers?: Headers,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * 공통 요청 옵션 타입
 */
interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  token?: string;
}

/**
 * API 응답 래퍼 타입
 * 백엔드에서 { success, data } 형태로 래핑된 응답을 처리합니다.
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type ApiClientResponse<T> = {
  data: T;
  headers: Headers;
};

/**
 * 공통 API 클라이언트
 *
 * @example
 * // GET 요청
 * const user = await apiClient.get<User>("/users/1");
 *
 * // POST 요청 (인증 포함)
 * const result = await apiClient.post<Result>("/scores", { score: 100 }, { token });
 */
export const apiClient = {
  /**
   * HTTP 요청을 수행합니다.
   * @param endpoint - API 엔드포인트 (예: "/users/1")
   * @param options - 요청 옵션
   * @returns 응답 데이터
   * @throws {ApiError} HTTP 에러 발생 시
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.requestWithResponse<T>(endpoint, options);

    return response.data;
  },

  async requestWithResponse<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<ApiClientResponse<T>> {
    const { token, body, ...fetchOptions } = options;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      ...fetchOptions,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(function handleRejected() {
        return null;
      });
      throw new ApiError(
        response.status,
        errorData?.message || `API 요청 실패 (${response.status})`,
        errorData,
        response.headers,
      );
    }

    const json: ApiResponse<T> = await response.json();

    // API가 { success, data } 형태로 래핑된 경우 data 반환
    return {
      data: json.data !== undefined ? json.data : (json as unknown as T),
      headers: response.headers,
    };
  },

  /**
   * GET 요청
   */
  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  },

  /**
   * POST 요청
   */
  post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "POST", body });
  },

  postWithResponse<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiClientResponse<T>> {
    return this.requestWithResponse<T>(endpoint, { ...options, method: "POST", body });
  },

  /**
   * PUT 요청
   */
  put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PUT", body });
  },

  /**
   * DELETE 요청
   */
  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  },
};
