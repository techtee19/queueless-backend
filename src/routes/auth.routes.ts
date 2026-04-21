import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { hashPassword, comparePassword } from "../utils/hash";
import { generateAccessToken, generateRefreshToken, verifyToken } from "../utils/jwt";
import { authenticate } from "../middleware/auth.middleware";

const router: Router = Router();

// Validation schemas
const registerSchema = z.object({
  phone: z.string().regex(/^\+234\d{10}$/, "Phone must be Nigerian format: +234XXXXXXXXXX"),
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
});

// POST /api/v1/auth/register
router.post("/register", async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: "PHONE_EXISTS", message: "Phone number already registered" },
      });
    }

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        phone: data.phone,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash,
        isVerified: true, // MVP: skip OTP verification
      },
    });

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: error.errors } });
    }
    console.error("Register error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// POST /api/v1/auth/login
router.post("/login", async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid phone or password" },
      });
    }

    const valid = await comparePassword(data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid phone or password" },
      });
    }

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: error.errors } });
    }
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// GET /api/v1/auth/me
router.get("/me", authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        isVerified: true,
        staffProfile: {
          select: {
            counterNumber: true,
            isOnDuty: true,
            institution: { select: { id: true, name: true, type: true, city: true } },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { code: "USER_NOT_FOUND", message: "User not found" } });
    }

    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// POST /api/v1/auth/refresh
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: { code: "TOKEN_MISSING", message: "Refresh token required" } });
    }

    const decoded = verifyToken(refreshToken);
    if (decoded.type !== "refresh") {
      return res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid refresh token" } });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) {
      return res.status(401).json({ success: false, error: { code: "USER_NOT_FOUND", message: "User not found" } });
    }

    const newAccessToken = generateAccessToken(user.id, user.role);
    const newRefreshToken = generateRefreshToken(user.id);

    res.json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch {
    res.status(401).json({ success: false, error: { code: "AUTH_TOKEN_EXPIRED", message: "Refresh token expired" } });
  }
});

export default router;
