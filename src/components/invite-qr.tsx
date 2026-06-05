"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders a QR code for `url` as a data-URL image (generated locally — the
 *  invite token never leaves the device to a third-party QR service). */
export function InviteQR({ url, size = 200 }: { url: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: { dark: "#0a0f0a", light: "#ffffff" },
    })
      .then((d) => {
        if (alive) setDataUrl(d);
      })
      .catch(() => {
        if (alive) setDataUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [url, size]);

  if (!dataUrl) {
    return (
      <div
        className="animate-pulse rounded-lg bg-black/10"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }
  return (
    // QR is a generated data-URL; next/image can't optimize it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="Event invite QR code"
      width={size}
      height={size}
      className="rounded-lg bg-white p-1"
    />
  );
}
