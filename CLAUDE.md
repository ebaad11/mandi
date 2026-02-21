# Project Configuration

## Runtime

This project uses **Bun** as the JavaScript runtime and package manager. Always use `bun` instead of `npm`/`npx`/`node`:
- `bun install` instead of `npm install`
- `bun add <pkg>` instead of `npm install <pkg>`
- `bunx <cmd>` instead of `npx <cmd>`
- `bun run <script>` instead of `npm run <script>`

## Skills

This project includes the following Claude Code skills:

- **[mcp-apps-builder](skills/mcp-apps-builder/SKILL.md)** - Best practices for building production-ready MCP servers with tools, resources, prompts, and widgets using mcp-use.

When working with MCP server code, consult the relevant skill reference files before implementing features.
