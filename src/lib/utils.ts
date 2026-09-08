import { cx } from "class-variance-authority";

export function cn(...inputs: Parameters<typeof cx>) {
  return cx(...inputs);
}
