import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { io } from "../server";

const router: Router = Router();

// GET /api/v1/staff/queue — Get current queue for staff's institution
router.get("/queue", authenticate, authorize("STAFF"), async (req, res) => {
  try {
    const userId = (req as any).user.sub;

    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId },
      include: { institution: true },
    });

    if (!staffProfile) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Staff profile not found" } });
    }

    const today = new Date(new Date().toISOString().split("T")[0]);

    const queues = await prisma.queue.findMany({
      where: { institutionId: staffProfile.institutionId, date: today },
      include: {
        service: true,
        entries: {
          where: { status: { in: ["WAITING", "CALLED", "CHECKED_IN", "SERVING"] } },
          orderBy: { ticketNumber: "asc" },
          include: {
            user: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
      },
    });

    // Calculate today's stats
    const todayEntries = await prisma.queueEntry.findMany({
      where: {
        queue: { institutionId: staffProfile.institutionId, date: today },
        status: "COMPLETED",
      },
    });

    const served = todayEntries.length;
    const avgTime = todayEntries.length > 0
      ? Math.round(
          todayEntries.reduce((sum, e) => {
            if (e.completedAt && e.createdAt) {
              return sum + (e.completedAt.getTime() - e.createdAt.getTime()) / 60000;
            }
            return sum;
          }, 0) / todayEntries.length
        )
      : 0;

    const skipped = await prisma.queueEntry.count({
      where: {
        queue: { institutionId: staffProfile.institutionId, date: today },
        status: { in: ["SKIPPED", "EXPIRED"] },
      },
    });

    res.json({
      success: true,
      data: {
        isOnDuty: staffProfile.isOnDuty,
        staffProfile,
        queues,
        stats: { served, avgTime, skipped },
      },
    });
  } catch (error) {
    console.error("Staff queue error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// POST /api/v1/staff/call-next — Call next customer
router.post("/call-next", authenticate, authorize("STAFF"), async (req, res) => {
  try {
    const userId = (req as any).user.sub;
    const { queueId } = req.body;

    const staffProfile = await prisma.staffProfile.findUnique({ where: { userId } });
    if (!staffProfile) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Staff profile not found" } });
    }

    // Prefer CHECKED_IN over WAITING
    let nextEntry = await prisma.queueEntry.findFirst({
      where: { queueId, status: "CHECKED_IN" },
      orderBy: { ticketNumber: "asc" },
      include: { user: { select: { firstName: true, lastName: true, phone: true } } },
    });

    if (!nextEntry) {
      nextEntry = await prisma.queueEntry.findFirst({
        where: { queueId, status: "WAITING" },
        orderBy: { ticketNumber: "asc" },
        include: { user: { select: { firstName: true, lastName: true, phone: true } } },
      });
    }

    if (!nextEntry) {
      return res.json({ success: true, data: { message: "No customers waiting", entry: null } });
    }

    const updated = await prisma.queueEntry.update({
      where: { id: nextEntry.id },
      data: { status: "CALLED", calledAt: new Date(), servedById: staffProfile.id },
    });

    await prisma.queue.update({
      where: { id: queueId },
      data: { currentServing: nextEntry.ticketNumber },
    });

    // Real-time notifications
    io.to(`user:${nextEntry.userId}`).emit("status:changed", {
      entryId: nextEntry.id,
      newStatus: "CALLED",
      message: `It's your turn! Please go to Counter ${staffProfile.counterNumber || "—"}`,
    });

    io.to(`queue:${queueId}`).emit("queue:updated", {
      queueId,
      currentServing: nextEntry.ticketNumber,
    });

    res.json({
      success: true,
      data: {
        entry: { ...updated, user: nextEntry.user },
        counterNumber: staffProfile.counterNumber,
      },
    });
  } catch (error) {
    console.error("Call next error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// POST /api/v1/staff/complete/:entryId — Mark service as complete
router.post("/complete/:entryId", authenticate, authorize("STAFF"), async (req, res) => {
  try {
    const entry = await prisma.queueEntry.findUnique({ where: { id: String(req.params.entryId) } });
    if (!entry) {
      res.status(404).json({ success: false, error: { code: "ENTRY_NOT_FOUND", message: "Entry not found" } });
      return;
    }

    const updated = await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    io.to(`user:${entry.userId}`).emit("status:changed", {
      entryId: entry.id,
      newStatus: "COMPLETED",
      message: "Your service is complete. Thank you!",
    });

    io.to(`queue:${entry.queueId}`).emit("queue:updated", { queueId: entry.queueId });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Complete entry error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// POST /api/v1/staff/skip/:entryId — Skip a customer (no-show)
router.post("/skip/:entryId", authenticate, authorize("STAFF"), async (req, res) => {
  try {
    const entry = await prisma.queueEntry.findUnique({ where: { id: String(req.params.entryId) } });
    if (!entry) {
      res.status(404).json({ success: false, error: { code: "ENTRY_NOT_FOUND", message: "Entry not found" } });
      return;
    }

    const newSkipCount = entry.skipCount + 1;

    if (newSkipCount >= 2) {
      await prisma.queueEntry.update({
        where: { id: entry.id },
        data: { status: "EXPIRED", skipCount: newSkipCount },
      });

      io.to(`user:${entry.userId}`).emit("status:changed", {
        entryId: entry.id,
        newStatus: "EXPIRED",
        message: "Your queue entry has expired after 2 skips. Please rejoin.",
      });
    } else {
      await prisma.queueEntry.update({
        where: { id: entry.id },
        data: { status: "SKIPPED", skipCount: newSkipCount },
      });

      io.to(`user:${entry.userId}`).emit("status:changed", {
        entryId: entry.id,
        newStatus: "SKIPPED",
        message: "You were skipped. You can rejoin the queue.",
      });
    }

    io.to(`queue:${entry.queueId}`).emit("queue:updated", { queueId: entry.queueId });

    res.json({ success: true, data: { message: "Customer skipped", skipCount: newSkipCount } });
  } catch (error) {
    console.error("Skip entry error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

// PATCH /api/v1/staff/duty — Toggle on-duty/off-duty
router.patch("/duty", authenticate, authorize("STAFF"), async (req, res) => {
  try {
    const userId = (req as any).user.sub;

    const staffProfile = await prisma.staffProfile.findUnique({ where: { userId } });
    if (!staffProfile) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Staff profile not found" } });
    }

    const updated = await prisma.staffProfile.update({
      where: { id: staffProfile.id },
      data: { isOnDuty: !staffProfile.isOnDuty },
    });

    res.json({ success: true, data: { isOnDuty: updated.isOnDuty } });
  } catch (error) {
    console.error("Toggle duty error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
  }
});

export default router;
