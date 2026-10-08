"""Printable SVG QR codes for canonical short URLs."""

from io import BytesIO
from xml.etree import ElementTree

import segno


def generate_qr_svg(short_url: str, size: int = 256) -> bytes:
    qr = segno.make_qr(short_url, error="h")
    buffer = BytesIO()
    # Preserve a four-module quiet zone and a white background for printing.
    qr.save(buffer, kind="svg", border=4, light="white", omitsize=True)
    root = ElementTree.fromstring(buffer.getvalue())
    root.set("width", str(size))
    root.set("height", str(size))
    ElementTree.register_namespace("", "http://www.w3.org/2000/svg")
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)
