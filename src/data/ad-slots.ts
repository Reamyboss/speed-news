/**
 * Default advertising inventory.
 *
 * Every slot the UI can render is a database row, so placements, creatives and
 * even the ad *provider* are configurable without a code change or redeploy.
 * The seeded rows are HOUSE creatives (our own promos) so the layout is
 * complete and reviewable from the first run — swap `provider` to GAM /
 * ADSENSE / CUSTOM_HTML and fill `config` when a real ad stack is connected.
 */
export interface AdSlotSeed {
  key: string;
  name: string;
  placement: string;
  provider: string;
  enabled: boolean;
  priority: number;
  headline?: string;
  body?: string;
  imageUrl?: string;
  clickUrl?: string;
  label?: string;
  config?: string;
  widthPx?: number;
  heightPx?: number;
}

export const AD_SLOT_SEED: AdSlotSeed[] = [
  {
    key: "home-top-banner",
    name: "Homepage top banner",
    placement: "TOP_BANNER",
    provider: "HOUSE",
    enabled: true,
    priority: 100,
    headline: "Advertise with NaijaPulse",
    body: "Reach readers following Nigerian business, politics and technology every day.",
    clickUrl: "/advertise",
    label: "Advertisement",
    widthPx: 970,
    heightPx: 90,
  },
  {
    key: "home-in-feed-1",
    name: "Homepage in-feed (first)",
    placement: "IN_FEED",
    provider: "HOUSE",
    enabled: true,
    priority: 90,
    headline: "Your brand belongs here",
    body: "In-feed placements sit between stories, where attention already is.",
    clickUrl: "/advertise",
    label: "Sponsored",
  },
  {
    key: "home-in-feed-2",
    name: "Homepage in-feed (second)",
    placement: "IN_FEED",
    provider: "HOUSE",
    enabled: true,
    priority: 80,
    headline: "Nigeria's news, in one place",
    body: "Tell advertisers' stories alongside the day's most important reporting.",
    clickUrl: "/advertise",
    label: "Sponsored",
  },
  {
    key: "article-inline",
    name: "Article inline unit",
    placement: "ARTICLE",
    provider: "HOUSE",
    enabled: true,
    priority: 90,
    headline: "Advertise on NaijaPulse",
    body: "Contextual placements on story pages, next to the reporting that matters.",
    clickUrl: "/advertise",
    label: "Advertisement",
    widthPx: 728,
    heightPx: 90,
  },
  {
    key: "sidebar-primary",
    name: "Sidebar unit",
    placement: "SIDEBAR",
    provider: "HOUSE",
    enabled: true,
    priority: 90,
    headline: "Partner with us",
    body: "Sidebar inventory available across every section.",
    clickUrl: "/advertise",
    label: "Advertisement",
    widthPx: 300,
    heightPx: 250,
  },
  {
    key: "mobile-anchor",
    name: "Mobile anchor unit",
    placement: "MOBILE_STICKY",
    provider: "NONE",
    // Off by default: a sticky mobile unit is the single easiest way to ruin
    // reading UX. Enable deliberately, with a real creative.
    enabled: false,
    priority: 50,
    label: "Advertisement",
    widthPx: 320,
    heightPx: 50,
  },
];
