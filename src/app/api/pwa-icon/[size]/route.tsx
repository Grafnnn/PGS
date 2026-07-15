import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET(_request: Request, { params }: { params: { size: string } }) {
  const size = params.size === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div style={{ alignItems: "center", background: "#15181d", color: "#fffdf8", display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", width: "100%" }}>
        <div style={{ borderBottom: `${Math.max(6, size / 40)}px solid #c1512f`, display: "flex", fontSize: size * 0.31, fontWeight: 800, lineHeight: 1, paddingBottom: size * 0.045 }}>PGS</div>
        <div style={{ color: "#ddd6c4", display: "flex", fontSize: size * 0.065, fontWeight: 700, letterSpacing: size * 0.01, marginTop: size * 0.06 }}>FIELD</div>
      </div>
    ),
    { height: size, width: size }
  );
}
