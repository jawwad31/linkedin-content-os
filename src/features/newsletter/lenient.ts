import { z } from "zod";

/**
 * Model output is checked leniently on size: text that runs long is cut to the stored limit
 * and long lists are trimmed, instead of throwing away an otherwise good run. Shape and enums
 * stay strict.
 */
export const text = (max: number) =>
  z.string().transform((value) => value.slice(0, max));

export const list = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.array(item).transform((items) => items.slice(0, max));

export const whole = (min: number, max: number) =>
  z
    .number()
    .transform((value) => Math.min(max, Math.max(min, Math.round(value))));
