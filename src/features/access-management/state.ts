export type UserManagementState = {
  error: string | null;
  success: string | null;
  createdNewUser?: boolean;
};

export const EMPTY_USER_MANAGEMENT_STATE: UserManagementState = {
  error: null,
  success: null,
};
