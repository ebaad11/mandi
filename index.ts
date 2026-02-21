import { MCPServer, text, widget, error, oauthWorkOSProvider } from "mcp-use/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api";
import { z } from "zod";

const GRID_SIZE = 10;

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const server = new MCPServer({
  name: "tile-grid",
  title: "2D Tile Grid",
  version: "1.0.0",
  description: "Per-user 2D tile grid with persistent position tracking",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
  oauth: oauthWorkOSProvider(),
});

server.tool(
  {
    name: "get-position",
    description: "Show the current position on the 2D tile grid",
    schema: z.object({}),
    widget: {
      name: "grid-widget",
      invoking: "Loading grid...",
      invoked: "Grid loaded",
    },
  },
  async (_args, ctx) => {
    const userId = ctx.auth.user.userId;
    const pos = await convex.query(api.positions.getPosition, { userId });

    return widget({
      props: { x: pos.x, y: pos.y, gridSize: GRID_SIZE },
      output: text(`Your position: (${pos.x}, ${pos.y})`),
    });
  }
);

const moveSchema = z
  .object({
    direction: z
      .enum(["up", "down", "left", "right"])
      .optional()
      .describe("Direction to move one step"),
    x: z.number().optional().describe("Absolute x position (0-9)"),
    y: z.number().optional().describe("Absolute y position (0-9)"),
  })
  .describe("Move by direction OR jump to absolute (x, y) coordinates");

server.tool(
  {
    name: "move",
    description:
      "Move the marker on the 2D tile grid. Use direction for relative moves or x/y for absolute jumps.",
    schema: moveSchema,
    widget: {
      name: "grid-widget",
      invoking: "Moving...",
      invoked: "Moved",
    },
  },
  async (input, ctx) => {
    const userId = ctx.auth.user.userId;
    const current = await convex.query(api.positions.getPosition, { userId });

    let newX: number;
    let newY: number;

    if (input.direction) {
      newX = current.x;
      newY = current.y;
      switch (input.direction) {
        case "up":
          newY = Math.max(0, current.y - 1);
          break;
        case "down":
          newY = Math.min(GRID_SIZE - 1, current.y + 1);
          break;
        case "left":
          newX = Math.max(0, current.x - 1);
          break;
        case "right":
          newX = Math.min(GRID_SIZE - 1, current.x + 1);
          break;
      }
    } else if (input.x !== undefined && input.y !== undefined) {
      newX = Math.max(0, Math.min(GRID_SIZE - 1, input.x));
      newY = Math.max(0, Math.min(GRID_SIZE - 1, input.y));
    } else {
      return error(
        "Provide either a direction (up/down/left/right) or both x and y coordinates."
      );
    }

    await convex.mutation(api.positions.setPosition, {
      userId,
      x: newX,
      y: newY,
    });

    return widget({
      props: { x: newX, y: newY, gridSize: GRID_SIZE },
      output: text(`Moved to (${newX}, ${newY})`),
    });
  }
);

server.listen().then(() => {
  console.log("Server running");
});
