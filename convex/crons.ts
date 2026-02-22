import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("tick-2min", { minutes: 2 }, internal.ticks.resolveTick);
crons.interval("ap-10min", { minutes: 10 }, internal.ticks.resetAllAP);

export default crons;
