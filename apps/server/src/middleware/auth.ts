import type { NextFunction, Request, Response } from "express";
import { verifyToken, type TokenPayload } from "../lib/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: TokenPayload;
    }
  }
}

/** Rejects anything without a valid `Authorization: Bearer <token>` header. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  req.admin = payload;
  next();
}

/** Creating and removing admins is reserved for the super admin. */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.admin?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  next();
}
