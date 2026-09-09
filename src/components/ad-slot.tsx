import Link from "next/link";
import { getAdSlot, type AdSlotView } from "@/lib/queries";
import { ADS_ENABLED } from "@/lib/env";

/**
 * The single advertising primitive.
 *
 * Placement, provider and creative all come from the AdSlot table, so the ad
 * stack is swappable without a code change. Renders nothing at all when the
 * slot is missing, disabled, out of flight, or set to provider NONE — an empty
 * gap is better UX than a broken box.
 */

interface AdSlotProps {
  slotKey: string;
  className?: string;
}

export async function AdSlot({ slotKey, className = "" }: AdSlotProps) {
  if (!ADS_ENABLED) return null;

  const slot = await getAdSlot(slotKey);
  if (!slot) return null;

  return (
    <aside
      data-ad-slot={slot.key}
      data-ad-placement={slot.placement}
      aria-label={slot.label}
      className={className}
    >
      <AdCreative slot={slot} />
    </aside>
  );
}

function AdCreative({ slot }: { slot: AdSlotView }) {
  switch (slot.provider) {
    case "HOUSE":
      return <HouseAd slot={slot} />;
    case "CUSTOM_HTML":
      return <CustomHtmlAd slot={slot} />;
    case "GAM":
    case "ADSENSE":
      return <NetworkAdPlaceholder slot={slot} />;
    default:
      return null;
  }
}

/** Shared chrome so every unit is unmistakably labelled as advertising. */
function AdFrame({
  label,
  children,
  minHeight,
}: {
  label: string;
  children: React.ReactNode;
  minHeight?: number;
}) {
  return (
    <div className="w-full">
      <p className="kicker mb-1.5 text-faint">{label}</p>
      <div
        className="rounded-sm border border-rule bg-sunken"
        style={minHeight ? { minHeight } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function HouseAd({ slot }: { slot: AdSlotView }) {
  const href = slot.clickUrl ?? "/advertise";
  const isInternal = href.startsWith("/");

  const body = (
    <div className="flex items-center gap-4 p-4 sm:p-5">
      {slot.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- creative assets are arbitrary third-party URLs
        <img
          src={slot.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-16 w-16 flex-none rounded-sm object-cover sm:h-20 sm:w-20"
        />
      ) : null}
      <div className="min-w-0">
        {slot.headline ? (
          <p className="font-serif text-base font-bold leading-snug text-ink sm:text-lg">
            {slot.headline}
          </p>
        ) : null}
        {slot.body ? (
          <p className="mt-1 text-sm leading-snug text-muted clamp-2">{slot.body}</p>
        ) : null}
        <span className="mt-2 inline-block text-xs font-semibold text-accent">
          Learn more &rarr;
        </span>
      </div>
    </div>
  );

  return (
    <AdFrame label={slot.label} minHeight={slot.heightPx ?? undefined}>
      {isInternal ? (
        <Link href={href} className="block hover:bg-accent-wash">
          {body}
        </Link>
      ) : (
        <a
          href={href}
          rel="sponsored noopener noreferrer"
          target="_blank"
          className="block hover:bg-accent-wash"
        >
          {body}
        </a>
      )}
    </AdFrame>
  );
}

/**
 * Operator-supplied ad markup.
 *
 * TRUST BOUNDARY: this is the one place we inject raw HTML. The value comes
 * only from the AdSlot table, which has no public write path — there is no
 * admin UI and no API that writes it, so it is operator-controlled config in
 * the same class as an environment variable. Ad tags legitimately need
 * <script>, so stripping it would defeat the feature. If an admin UI is ever
 * added, that write path must be authenticated and this field restricted.
 */
function CustomHtmlAd({ slot }: { slot: AdSlotView }) {
  if (!slot.config) return null;

  let html = "";
  try {
    const parsed = JSON.parse(slot.config) as { html?: unknown };
    if (typeof parsed.html === "string") html = parsed.html;
  } catch {
    return null;
  }
  if (!html) return null;

  return (
    <AdFrame label={slot.label} minHeight={slot.heightPx ?? undefined}>
      <div className="p-2" dangerouslySetInnerHTML={{ __html: html }} />
    </AdFrame>
  );
}

/**
 * Reserved space for a network unit.
 *
 * The container renders server-side at the configured size so the slot never
 * causes layout shift; the network's own loader script (added via the site
 * layout when an account is configured) fills it client-side.
 */
function NetworkAdPlaceholder({ slot }: { slot: AdSlotView }) {
  let unitPath = "";
  try {
    const parsed = slot.config ? (JSON.parse(slot.config) as { unitPath?: unknown }) : {};
    if (typeof parsed.unitPath === "string") unitPath = parsed.unitPath;
  } catch {
    unitPath = "";
  }

  return (
    <AdFrame label={slot.label} minHeight={slot.heightPx ?? 90}>
      <div
        id={`ad-${slot.key}`}
        data-ad-provider={slot.provider}
        data-ad-unit-path={unitPath}
        style={{
          minHeight: slot.heightPx ?? 90,
          maxWidth: slot.widthPx ?? undefined,
        }}
        className="mx-auto w-full"
      />
    </AdFrame>
  );
}
