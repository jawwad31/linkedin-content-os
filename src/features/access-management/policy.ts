export function canAccountAdminResetTarget(input: {
  managedClientId: string;
  acceptedClientIds: readonly string[];
  hasAcceptedAgencyMembership: boolean;
}): boolean {
  return (
    !input.hasAcceptedAgencyMembership &&
    input.acceptedClientIds.every(
      (clientId) => clientId === input.managedClientId,
    )
  );
}
