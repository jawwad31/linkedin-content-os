export function shouldBlockForTemporaryPassword(input: {
  mustChangePassword: boolean;
  allowPasswordChangeRequired: boolean;
}): boolean {
  return input.mustChangePassword && !input.allowPasswordChangeRequired;
}
