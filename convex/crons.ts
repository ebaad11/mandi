import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("tick-15min", { minutes: 15 }, internal.ticks.resolveTick);
crons.interval("ap-hourly", { hours: 1 }, internal.ticks.resetAllAP);

export default crons;
