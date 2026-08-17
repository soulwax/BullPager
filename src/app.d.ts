declare global {
  namespace App {
    interface Locals {
      authenticated: boolean;
      username?: string;
      role?: import('$lib/types').UserRole;
    }
  }
}

export {};
