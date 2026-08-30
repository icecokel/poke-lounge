import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type SortDirection = "ASC" | "DESC";

export const sortByKey = <T>(items: T[], key: keyof T, direction: SortDirection = "ASC"): T[] => {
  return [...items].sort((a, b) => {
    const order = direction === "ASC" ? 1 : -1;
    if (a[key] > b[key]) return 1 * order;
    if (a[key] < b[key]) return -1 * order;
    return 0;
  });
};
