export function canAccountAdminResetTarget(input: {
  managedClientId: string;
  acceptedClientIds: readonly string[];
}): boolean {
  return input.acceptedClientIds.every(
    (clientId) => clientId === input.managedClientId,
  );
}
