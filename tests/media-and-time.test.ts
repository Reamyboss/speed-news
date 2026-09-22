import { describe, it, expect } from "vitest";
import { sanitizeImageUrl, isNonPhotoImage } from "../src/lib/feed";
import { relativeTime } from "../src/lib/format";

describe("non-photo images", () => {
  it("rejects publisher logos and placeholders", () => {
    expect(
      sanitizeImageUrl(
        "https://cdn.punchng.com/wp-content/uploads/2020/08/punch-logo-500x179-1.png",
      ),
    ).toBeNull();
    expect(isNonPhotoImage("https://x.ng/img/placeholder.jpg")).toBe(true);
    expect(isNonPhotoImage("https://x.ng/assets/favicon.png")).toBe(true);
  });

  it("keeps real photography", () => {
    expect(sanitizeImageUrl("https://x.ng/2026/09/Tinubu-depart.jpg")).toBe(
      "https://x.ng/2026/09/Tinubu-depart.jpg",
    );
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-21T12:00:00Z");

  it("never reports a story as being in the future", () => {
    expect(relativeTime(new Date("2026-09-21T12:37:00Z"), now)).toBe("just now");
  });

  it("still reports the past", () => {
    expect(relativeTime(new Date("2026-09-21T10:00:00Z"), now)).toBe("2 hours ago");
  });
});
