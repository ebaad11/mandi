import { MCPServer, text, widget } from "mcp-use/server";
import { z } from "zod";

const server = new MCPServer({
  name: "hello-app",
  title: "Hello App",
  version: "1.0.0",
  description: "Minimal MCP App that greets a user",
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
});

const sayHelloSchema = z.object({
  name: z.string().describe("Name to greet"),
});

server.tool(
  {
    name: "say-hello",
    description: "Display a hello widget for the provided name",
    schema: sayHelloSchema,
    widget: {
      name: "hello-widget",
    },
  },
  async ({ name }) => {
    return widget({
      props: { name },
      output: text(`Hello, ${name}!`),
    });
  }
);

server.listen().then(() => {
  console.log("Server running");
});
