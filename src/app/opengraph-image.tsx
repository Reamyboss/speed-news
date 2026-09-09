import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/env";

/**
 * Default social sharing card.
 *
 * Generated at build/request time rather than shipped as a static asset so it
 * always matches the site's identity. Story pages override this with the
 * publisher's own image when one exists (see `storyMetadata`).
 */
export const alt = `${SITE_NAME} — Nigerian News & Intelligence`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fbfaf7",
          padding: "72px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 9999,
              background: "#0a6b41",
            }}
          />
          <div
            style={{
              fontSize: 30,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#6c635c",
              fontFamily: "sans-serif",
            }}
          >
            Nigeria first
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 104,
              fontWeight: 700,
              color: "#14110f",
              letterSpacing: -3,
              lineHeight: 1.05,
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 38,
              color: "#3d3733",
              lineHeight: 1.3,
              maxWidth: 900,
            }}
          >
            Nigerian news and intelligence — every story attributed, summarised,
            and linked back to the newsroom that reported it.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            borderTop: "3px solid #0a6b41",
            paddingTop: 24,
            fontSize: 26,
            color: "#6c635c",
            fontFamily: "sans-serif",
          }}
        >
          Nigeria · Politics · Business · Technology · Sports · Entertainment · World
        </div>
      </div>
    ),
    size,
  );
}
