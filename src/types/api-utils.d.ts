// API工具函数的TypeScript类型定义

export interface CacheEntry {
  data: unknown;
  timestamp: number;
}

export interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
}

export interface ApiResponse {
  code: number;
  msg: string;
  data?: unknown;
  platform?: string;
}

export interface RateLimitConfig {
  WINDOW_SIZE: number;
  MAX_REQUESTS: number;
}

export interface CacheConfig {
  CACHE_DURATION: number;
}

export declare const logger: Logger;

export declare const getCachedResponse: (url: string) => unknown | null;
export declare const setCacheResponse: (url: string, data: unknown) => void;
export declare const cleanupCache: () => void;

export declare const rateLimit: (ip: string) => boolean;

export declare const isValidUrl: (string: string) => boolean;
export declare const sanitizeUrl: (url: string) => string | null;
export declare const getClientIP: (request: Request) => string;

export declare const createResponse: (code: number, msg: string, data?: unknown) => ApiResponse;
export declare const successResponse: (data: unknown, msg?: string) => ApiResponse;
export declare const errorResponse: (msg: string, code?: number) => ApiResponse;
export declare const serverErrorResponse: (error: Error) => ApiResponse;
export declare const parseErrorResponse: (msg?: string) => ApiResponse;
