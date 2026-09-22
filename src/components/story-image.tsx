"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * A story photo that removes itself if the publisher's CDN fails.
 *
 * Images are hotlinked, so a dead URL, a hotlink block or a slow upstream is
 * routine. Without this a failed image leaves an empty grey box — worse than
 * no image, because it looks like our page is broken.
 */
export function StoryImage({
  src,
  wrapperClassName,
  sizes,
  priority = false,
}: {
  src: string;
  wrapperClassName: string;
  sizes: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div className={`relative overflow-hidden rounded-sm bg-sunken ${wrapperClassName}`}>
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        onError={() => setFailed(true)}
        className="object-cover"
      />
    </div>
  );
}
