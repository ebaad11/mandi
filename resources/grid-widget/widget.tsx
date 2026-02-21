import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

const propsSchema = z.object({
  x: z.number().describe("Current x position on the grid"),
  y: z.number().describe("Current y position on the grid"),
  gridSize: z.number().describe("Size of the grid (e.g. 10 for 10x10)"),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display a 2D tile grid with a position marker",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

export default function GridWidget() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: theme === "dark" ? "#808080" : "#999",
          }}
        >
          Loading grid...
        </div>
      </McpUseProvider>
    );
  }

  const { x, y, gridSize } = props;

  const isDark = theme === "dark";
  const tileColor = isDark ? "#2a3a4a" : "#c8daf0";
  const tileBorder = isDark ? "#1a2a3a" : "#a0b8d0";
  const markerColor = isDark ? "#ff6b6b" : "#e63946";
  const bgColor = isDark ? "#1e1e1e" : "#ffffff";
  const textColor = isDark ? "#e0e0e0" : "#1a1a1a";
  const labelColor = isDark ? "#808080" : "#999";

  const tileSize = 36;
  const gap = 2;

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 20, backgroundColor: bgColor, color: textColor }}>
        <div
          style={{
            display: "inline-grid",
            gridTemplateColumns: `repeat(${gridSize}, ${tileSize}px)`,
            gap: `${gap}px`,
          }}
        >
          {Array.from({ length: gridSize * gridSize }, (_, i) => {
            const col = i % gridSize;
            const row = Math.floor(i / gridSize);
            const isActive = col === x && row === y;

            return (
              <div
                key={i}
                style={{
                  width: tileSize,
                  height: tileSize,
                  backgroundColor: tileColor,
                  border: `1px solid ${tileBorder}`,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isActive && (
                  <div
                    style={{
                      width: tileSize * 0.55,
                      height: tileSize * 0.55,
                      borderRadius: "50%",
                      backgroundColor: markerColor,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 14,
            color: labelColor,
          }}
        >
          Position: ({x}, {y})
        </div>
      </div>
    </McpUseProvider>
  );
}
