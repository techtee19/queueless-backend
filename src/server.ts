import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import { createServer } from "http";
import { Server } from "socket.io";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

import authRoutes from "./routes/auth.routes";
import institutionRoutes from "./routes/institution.routes";
import queueRoutes from "./routes/queue.routes";
import staffRoutes from "./routes/staff.routes";
import adminRoutes from "./routes/admin.routes";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || "http://localhost:3000", credentials: true },
});

// Export io for use in route files
export { io };

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(compression());
app.use(morgan("dev"));
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── ROUTES ───
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/institutions", institutionRoutes);
app.use("/api/v1/queues", queueRoutes);
app.use("/api/v1/staff", staffRoutes);
app.use("/api/v1/admin", adminRoutes);

// ─── SOCKET.IO ───
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-queue-room", ({ queueId }) => {
    socket.join(`queue:${queueId}`);
    console.log(`Socket ${socket.id} joined queue:${queueId}`);
  });

  socket.on("leave-queue-room", ({ queueId }) => {
    socket.leave(`queue:${queueId}`);
  });

  socket.on("join-user-room", ({ userId }) => {
    socket.join(`user:${userId}`);
    console.log(`Socket ${socket.id} joined user:${userId}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ─── SMART SKIP CRON JOB ───
// Every 30 seconds, check for CALLED entries that haven't checked in within 5 minutes
cron.schedule("*/30 * * * * *", async () => {
  try {
    const cronPrisma = new PrismaClient();

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const expiredEntries = await cronPrisma.queueEntry.findMany({
      where: {
        status: "CALLED",
        calledAt: { lt: fiveMinutesAgo },
      },
    });

    for (const entry of expiredEntries) {
      const newSkipCount = entry.skipCount + 1;

      if (newSkipCount >= 2) {
        await cronPrisma.queueEntry.update({
          where: { id: entry.id },
          data: { status: "EXPIRED", skipCount: newSkipCount },
        });

        io.to(`user:${entry.userId}`).emit("status:changed", {
          entryId: entry.id,
          newStatus: "EXPIRED",
          message: "Your queue entry has expired after being skipped twice.",
        });
      } else {
        await cronPrisma.queueEntry.update({
          where: { id: entry.id },
          data: { status: "SKIPPED", skipCount: newSkipCount },
        });

        io.to(`user:${entry.userId}`).emit("status:changed", {
          entryId: entry.id,
          newStatus: "SKIPPED",
          message: "You were skipped for not checking in. You can rejoin the queue.",
        });
      }

      io.to(`queue:${entry.queueId}`).emit("queue:updated", { queueId: entry.queueId });
    }

    if (expiredEntries.length > 0) {
      console.log(`Smart skip: processed ${expiredEntries.length} expired entries`);
    }

    await cronPrisma.$disconnect();
  } catch (error) {
    console.error("Smart skip cron error:", error);
  }
});

console.log("⏰ Smart skip cron job started (every 30s)");

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`✅ QueueLess API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});
