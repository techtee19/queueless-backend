import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import prisma from "../utils/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { io } from "../server";

const router: Router = Router();

// ─── HELPERS ───

async function getOrCreateTodayQueue(serviceId: string, institutionId: string) {
  const today = new Date(new Date().toISOString().split("T")[0]);

  let queue = await prisma.queue.findUnique({
    where: { serviceId_date: { serviceId, date: today } },
  });

  if (!queue) {
    queue = await prisma.queue.create({
      data: { serviceId, institutionId, date: today },
    });
  }

  return queue;
}

async function calculatePosition(queueId: string, ticketNumber: number): Promise<number> {
  const count = await prisma.queueEntry.count({
    where: { queueId, status: "WAITING", ticketNumber: { lt: ticketNumber } },
  });
  return count + 1;
}

// ─── ROUTES ───

// POST /api/v1/queues/join
router.post("/join", authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.sub;
    const { serviceId } = req.body;

    if (!serviceId) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "serviceId is required" } });
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { institution: true },
    });

    if (!service) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Service not found" } });
    }

    const queue = await getOrCreateTodayQueue(serviceId, service.institutionId);

    if (!queue.isOpen) {
      return res.status(422).json({ success: false, error: { code: "QUEUE_CLOSED", message: "This queue is not accepting new entries" } });
    }

    // Check duplicate
    const existingEntry = await prisma.queueEntry.findFirst({
      where: { userId, queueId: queue.id, status: { in: ["WAITING", "CALLED", "CHECKED_IN", "SERVING"] } },
    });

    if (existingEntry) {
      return res.status(409).json({ success: false, error: { code: "QUEUE_ALREADY_JOINED", message: "You already have an active entry for this service" } });
    }

    // Check capacity
    const waitingCount = await prisma.queueEntry.count({
      where: { queueId: queue.id, status: "WAITING" },
    });

    if (waitingCount >= service.maxQueueSize) {
      return res.status(422).json({ success: false, error: { code: "QUEUE_FULL", message: "This queue has reached its maximum capacity" } });
    }

    // Create entry
    const qrToken = uuidv4();
    const ticketNumber = queue.currentNumber + 1;

    const entry = await prisma.queueEntry.create({
      data: { ticketNumber, qrToken, queueId: queue.id, userId },
    });

    await prisma.queue.update({
      where: { id: queue.id },
      data: { currentNumber: ticketNumber },
    });

    // Generate QR code
    const qrPayload = JSON.stringify({ t: qrToken, e: entry.id, v: 1 });
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 300,
      margin: 2,
      color: { dark: "#134e4a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });

    const position = await calculatePosition(queue.id, ticketNumber);

    // Emit real-time update
    io.to(`queue:${queue.id}`).emit("queue:updated", {
      queueId: queue.id,
      currentServing: queue.currentServing,
      totalWaiting: waitingCount + 1,
    });

    res.status(201).json({
      success: true,
      data: {
        id: entry.id,
        ticketNumber,
        status: "WAITING",
        position,
        estimatedWaitMinutes: position * service.estimatedTime,
        qrToken,
        qrCodeDataUrl,
        queue: {
          id: queue.id,
          serviceName: service.name,
          institutionName: service.institution.name,
          currentServing: queue.currentServing,
          totalWaiting: waitingCount + 1,
        },
        createdAt: entry.createdAt,
      },
    });
  } catch (error) {
    console.error("Join queue error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// GET /api/v1/queues/my-active
router.get("/my-active", authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.sub;

    const entries = await prisma.queueEntry.findMany({
      where: { userId, status: { in: ["WAITING", "CALLED", "CHECKED_IN", "SERVING"] } },
      include: {
        queue: {
          include: {
            service: true,
            institution: { select: { id: true, name: true, address: true, type: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const entriesWithPosition = await Promise.all(
      entries.map(async (entry: any) => {
        const position = await calculatePosition(entry.queueId, entry.ticketNumber);
        return {
          ...entry,
          position,
          estimatedWaitMinutes: position * entry.queue.service.estimatedTime,
        };
      })
    );

    res.json({ success: true, data: entriesWithPosition });
  } catch (error) {
    console.error("Get active entries error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// GET /api/v1/queues/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const entry = await prisma.queueEntry.findUnique({
      where: { id: String(req.params.id) },
      include: {
        queue: {
          include: {
            service: true,
            institution: { select: { id: true, name: true, address: true } },
          },
        },
      },
    });

    if (!entry) {
      res.status(404).json({ success: false, error: { code: "ENTRY_NOT_FOUND", message: "Queue entry not found" } });
      return;
    }

    const position = await calculatePosition(entry.queueId, entry.ticketNumber);

    const qrPayload = JSON.stringify({ t: entry.qrToken, e: entry.id, v: 1 });
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 300,
      margin: 2,
      color: { dark: "#134e4a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });

    res.json({
      success: true,
      data: {
        ...entry,
        position,
        estimatedWaitMinutes: position * entry.queue.service.estimatedTime,
        qrCodeDataUrl,
      },
    });
  } catch (error) {
    console.error("Get entry error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// POST /api/v1/queues/:id/cancel
router.post("/:id/cancel", authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.sub;

    const entry = await prisma.queueEntry.findUnique({ where: { id: String(req.params.id) } });
    if (!entry || entry.userId !== userId) {
      res.status(404).json({ success: false, error: { code: "ENTRY_NOT_FOUND", message: "Queue entry not found" } });
      return;
    }

    if (!["WAITING", "CALLED"].includes(entry.status)) {
      return res.status(422).json({ success: false, error: { code: "CANNOT_CANCEL", message: "Cannot cancel entry in current status" } });
    }

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "CANCELLED" },
    });

    io.to(`queue:${entry.queueId}`).emit("queue:updated", { queueId: entry.queueId });

    res.json({ success: true, data: { message: "Queue entry cancelled" } });
  } catch (error) {
    console.error("Cancel entry error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// POST /api/v1/queues/:id/checkin
router.post("/:id/checkin", authenticate, async (req, res) => {
  try {
    const { qrToken } = req.body;

    const entry = await prisma.queueEntry.findUnique({ where: { id: String(req.params.id) } });
    if (!entry) {
      res.status(404).json({ success: false, error: { code: "ENTRY_NOT_FOUND", message: "Queue entry not found" } });
      return;
    }

    if (entry.qrToken !== qrToken) {
      return res.status(400).json({ success: false, error: { code: "QR_INVALID_TOKEN", message: "Invalid QR code" } });
    }

    if (entry.status === "CHECKED_IN") {
      return res.status(409).json({ success: false, error: { code: "QR_ALREADY_CHECKED_IN", message: "Already checked in" } });
    }

    if (!["WAITING", "CALLED"].includes(entry.status)) {
      return res.status(410).json({ success: false, error: { code: "QR_ENTRY_EXPIRED", message: "This queue entry has expired" } });
    }

    const updated = await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    });

    io.to(`user:${entry.userId}`).emit("status:changed", {
      entryId: entry.id,
      newStatus: "CHECKED_IN",
      message: "You're checked in! Please wait to be called.",
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        status: "CHECKED_IN",
        checkedInAt: updated.checkedInAt,
        message: "Checked in successfully!",
      },
    });
  } catch (error) {
    console.error("Checkin error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// GET /api/v1/queues/service/:serviceId/status (PUBLIC — no auth required)
router.get("/service/:serviceId/status", async (req, res) => {
  try {
    const today = new Date(new Date().toISOString().split("T")[0]);

    const queue = await prisma.queue.findUnique({
      where: { serviceId_date: { serviceId: req.params.serviceId, date: today } },
      include: {
        service: true,
        _count: { select: { entries: { where: { status: "WAITING" } } } },
      },
    });

    if (!queue) {
      return res.json({ success: true, data: { waitingCount: 0, currentServing: 0, isOpen: true } });
    }

    res.json({
      success: true,
      data: {
        queueId: queue.id,
        waitingCount: queue._count.entries,
        currentServing: queue.currentServing,
        isOpen: queue.isOpen,
        estimatedWaitMinutes: queue._count.entries * queue.service.estimatedTime,
      },
    });
  } catch (error) {
    console.error("Queue status error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

export default router;
