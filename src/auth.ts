import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./db.js";

export type AuthContext = { id: string; email: string; roles: string[] };

declare global {
  namespace Express {
    interface Request { auth?: AuthContext }
  }
}

const jwtSecret = () => process.env.JWT_SECRET ?? "local-development-secret";

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const comparePassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export function issueToken(user: AuthContext) {
  return jwt.sign(user, jwtSecret(), { expiresIn: "7d" });
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return next();
  try {
    const payload = jwt.verify(header.slice(7), jwtSecret()) as AuthContext;
    const user = await prisma.user.findUnique({ where: { id: payload.id }, include: { roles: true } });
    if (user?.isActive) req.auth = { id: user.id, email: user.email, roles: user.roles.map((role) => role.role) };
  } catch {
    // Invalid tokens are treated as anonymous; protected routes return 401 below.
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } });
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.some((role) => req.auth?.roles.includes(role))) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission for this action" } });
    }
    next();
  };
}
