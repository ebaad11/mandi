import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

const propsSchema = z.object({
  name: z.string().describe("Name to display in the greeting"),
});

type HelloWidgetProps = z.infer<typeof propsSchema>;

export const widgetMetadata: WidgetMetadata = {
  description: "Display a simple hello message",
  props: propsSchema,
  exposeAsTool: false,
};

export default function HelloWidget() {
  const { props, isPending } = useWidget<HelloWidgetProps>();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div>Loading...</div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          fontSize: "48px",
        }}
      >
        Hello, {props.name}!
      </div>
    </McpUseProvider>
  );
}
