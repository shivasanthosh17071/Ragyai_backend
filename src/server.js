import app from "./app.js";
import { env, assertRequiredEnv } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { releaseUnconfirmedCodOrders } from "./services/order.service.js";

const ONE_HOUR = 60 * 60 * 1000;

const start = async () => {
  assertRequiredEnv();
  await connectDB();

  const server = app.listen(env.port, () => {
    console.log(
      `${env.brandName} API running on :${env.port} (${env.nodeEnv})`,
    );
  });

  // Returns stock from COD orders the owner never confirmed.
  // Swap for a real scheduler (agenda/BullMQ/cron) once you run more than one instance.
  const sweep = setInterval(
    () =>
      releaseUnconfirmedCodOrders().catch((e) =>
        console.error("[cod-sweep]", e.message),
      ),
    ONE_HOUR,
  );

  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down`);
    clearInterval(sweep);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (err) => {
    console.error("Unhandled rejection:", err);
    shutdown("unhandledRejection");
  });
};

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
