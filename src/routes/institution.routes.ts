import { Router } from "express";
import prisma from "../utils/prisma";

const router: Router = Router();

// GET /api/v1/institutions — List all (with optional filters: city, type, search)
router.get("/", async (req, res) => {
  try {
    const { city, type, search } = req.query;

    const where: any = { isActive: true };
    if (city) where.city = { equals: city as string, mode: "insensitive" };
    if (type) where.type = type as string;
    if (search) where.name = { contains: search as string, mode: "insensitive" };

    const institutions = await prisma.institution.findMany({
      where,
      include: {
        services: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
        _count: { select: { queues: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json({ success: true, data: institutions });
  } catch (error) {
    console.error("List institutions error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// GET /api/v1/institutions/:id — Get single institution with services + live queue counts
router.get("/:id", async (req, res) => {
  try {
    const institution = await prisma.institution.findUnique({
      where: { id: req.params.id },
      include: {
        services: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          include: {
            queues: {
              where: { date: new Date(new Date().toISOString().split("T")[0]) },
              include: {
                _count: { select: { entries: { where: { status: "WAITING" } } } },
              },
            },
          },
        },
      },
    });

    if (!institution) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Institution not found" } });
    }

    // Format: add live queue info to each service
    const servicesWithQueueInfo = institution.services.map((service) => {
      const todayQueue = service.queues[0];
      return {
        id: service.id,
        name: service.name,
        description: service.description,
        estimatedTime: service.estimatedTime,
        maxQueueSize: service.maxQueueSize,
        waitingCount: todayQueue?._count?.entries || 0,
        currentServing: todayQueue?.currentServing || 0,
        isOpen: todayQueue?.isOpen ?? true,
        estimatedWaitMinutes: (todayQueue?._count?.entries || 0) * service.estimatedTime,
      };
    });

    res.json({
      success: true,
      data: { ...institution, services: servicesWithQueueInfo },
    });
  } catch (error) {
    console.error("Get institution error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

export default router;
