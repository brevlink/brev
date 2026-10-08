"""Printable SVG QR codes for canonical short URLs."""

from io import BytesIO

import segno


def generate_qr_svg(short_url: str, scale: int = 12) -> bytes:
    qr = segno.make_qr(short_url, error="h")
    buffer = BytesIO()
    # Preserve a four-module quiet zone and a white background for printing.
    qr.save(
        buffer, kind="svg", scale=scale, border=4, light="white",
        omitsize=False, unit="px",
    )
    return buffer.getvalue()
