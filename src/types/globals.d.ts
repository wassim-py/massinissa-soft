export {};

export type UserRole = "admin" | "teacher" | "student" | "parent";

declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: UserRole;
    };
  }
}
