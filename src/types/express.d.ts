import { AuthenticatedUser } from "../models/authenticated";

declare global {
  namespace Express {
    export interface Request {
      user?: AuthenticatedUser;
    }
  }
}
