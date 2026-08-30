export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const getApiBaseUrl = (): string => {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL environment variable is not defined");
  }

  return API_BASE_URL;
};
