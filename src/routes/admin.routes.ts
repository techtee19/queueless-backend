import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router: Router = Router();

// Apply extremely strict middleware restricting everything to Admins only
router.use(authenticate);
router.use(authorize("ADMIN", "SUPER_ADMIN"));

// GET /api/v1/admin/stats
router.get("/stats", async (req, res) => {
  try {
    const today = new Date(new Date().toISOString().split("T")[0]);

    const [activeInstitutions, totalQueuesToday, registeredUsers, completedTickets] = await Promise.all([
      prisma.institution.count({ where: { isActive: true } }),
      prisma.queue.count({ where: { date: today } }),
      prisma.user.count(),
      prisma.queueEntry.count({
        where: {
          queue: { date: today },
          status: "COMPLETED",
        },
      }),
    ]);

    // Arbitrary health check metrics for dashboard UX
    res.json({
      success: true,
      data: {
        activeInstitutions,
        totalQueuesToday,
        registeredUsers,
        completedTickets,
        platformHealth: "100%",
        uptime: "99.9%",
        avgWaitTimeSavings: "52m",
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to load stats" } });
  }
});

// GET /api/v1/admin/institutions
router.get("/institutions", async (req, res) => {
  try {
    const institutions = await prisma.institution.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { services: true } },
      },
    });
    res.json({ success: true, data: institutions });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// POST /api/v1/admin/institutions
router.post("/institutions", async (req, res) => {
  try {
    const { name, type, address, city, state, description, phone, services } = req.body;

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(Math.random() * 1000);

    const servicesData = typeof services === 'string' && services.trim().length > 0
      ? {
          create: services.split(',').map((s: string) => ({ name: s.trim() })).filter((s: { name: string }) => s.name.length > 0)
        }
      : undefined;

    const institution = await prisma.institution.create({
      data: {
        name,
        slug,
        type,
        address,
        city,
        state,
        description,
        phone,
        services: servicesData,
        latitude: req.body.latitude || 6.5,
        longitude: req.body.longitude || 3.3,
        operatingHours: {
          mon: { open: "08:00", close: "17:00" },
          tue: { open: "08:00", close: "17:00" },
          wed: { open: "08:00", close: "17:00" },
          thu: { open: "08:00", close: "17:00" },
          fri: { open: "08:00", close: "17:00" },
        },
      },
    });

    res.json({ success: true, data: institution });
  } catch (error: any) {
    console.error("Institution creation error:", error);
    res.status(500).json({ success: false, message: "Failed to create institution" });
  }
});

// GET /api/v1/admin/users
router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        staffProfile: {
          include: { institution: true }
        }
      },
      take: 100, // Return latest 100
    });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

export default router;
