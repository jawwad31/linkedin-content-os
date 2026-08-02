import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const strongPasswordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`,
  )
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a symbol.");

const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMBERS = "23456789";
const SYMBOLS = "!@#$%^&*_-+=";
const ALL_CHARACTERS = LOWERCASE + UPPERCASE + NUMBERS + SYMBOLS;

function randomIndex(length: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % length;
}

function pick(source: string): string {
  return source[randomIndex(source.length)];
}

export function generateTemporaryPassword(length = 18): string {
  const normalizedLength = Math.max(PASSWORD_MIN_LENGTH, length);
  const characters = [
    pick(LOWERCASE),
    pick(UPPERCASE),
    pick(NUMBERS),
    pick(SYMBOLS),
  ];

  while (characters.length < normalizedLength) {
    characters.push(pick(ALL_CHARACTERS));
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }

  return characters.join("");
}
