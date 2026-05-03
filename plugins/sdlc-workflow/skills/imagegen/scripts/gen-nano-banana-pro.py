#!/usr/bin/env python3
"""
gen-nano-banana-pro.py — generate an image using nano-banana-pro (Gemini image model)

Usage:
    python3 gen-nano-banana-pro.py "<prompt>" [--output path] [--resolution 1K|2K|4K]

Exit codes:
    0 = success, image written to output path
    1 = GEMINI_API_KEY not set
    2 = API error or no image returned
    3 = failed to write output file

IMPORTANT: Gemini returns JPEG bytes regardless of the output extension requested.
The script automatically adjusts the extension to .jpg when .png is requested.
"""
import argparse
import os
import sys
from pathlib import Path


def install_package(package: str) -> None:
    import subprocess
    print(f"Installing {package}...", file=sys.stderr)
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", package, "-q"],
        stdout=subprocess.DEVNULL,
    )


def generate(prompt: str, output: str, resolution: str = "1K") -> None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY environment variable is not set", file=sys.stderr)
        sys.exit(1)

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        install_package("google-genai")
        from google import genai
        from google.genai import types

    # Resolution map
    res_map = {
        "1K": "1024x1024",
        "2K": "2048x2048",
        "4K": "4096x4096",
    }
    image_size = res_map.get(resolution.upper(), "1024x1024")

    client = genai.Client(api_key=api_key)

    try:
        response = client.models.generate_images(
            model="gemini-3-pro-image-preview",
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                output_mime_type="image/jpeg",
                # aspect_ratio is derived from image_size — square for now
                aspect_ratio="1:1",
            ),
        )
    except Exception as e:
        # Try fallback model if primary is unavailable
        try:
            response = client.models.generate_images(
                model="gemini-3.1-flash-image-preview",
                prompt=prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    output_mime_type="image/jpeg",
                    aspect_ratio="1:1",
                ),
            )
        except Exception as e2:
            print(f"ERROR: Both gemini-3-pro-image-preview and gemini-3.1-flash-image-preview failed:", file=sys.stderr)
            print(f"  Primary: {e}", file=sys.stderr)
            print(f"  Fallback: {e2}", file=sys.stderr)
            sys.exit(2)

    if not response.generated_images:
        print("ERROR: No images returned from Gemini API", file=sys.stderr)
        sys.exit(2)

    image_bytes = response.generated_images[0].image.image_bytes
    if not image_bytes:
        print("ERROR: Image bytes are empty", file=sys.stderr)
        sys.exit(2)

    # Gemini returns JPEG regardless — ensure extension matches
    out_path = Path(output)
    if out_path.suffix.lower() == ".png":
        out_path = out_path.with_suffix(".jpg")
        print(
            f"Note: Saving as {out_path} (Gemini returns JPEG format, not PNG)",
            file=sys.stderr,
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        out_path.write_bytes(image_bytes)
    except OSError as e:
        print(f"ERROR: Failed to write image to {out_path}: {e}", file=sys.stderr)
        sys.exit(3)

    print(f"Image saved to {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate an image using Gemini nano-banana-pro model"
    )
    parser.add_argument("prompt", help="Image generation prompt")
    parser.add_argument(
        "--output", "-o", default="output.jpg", help="Output file path (default: output.jpg)"
    )
    parser.add_argument(
        "--resolution",
        "-r",
        default="1K",
        choices=["1K", "2K", "4K"],
        help="Image resolution (default: 1K = 1024x1024)",
    )
    args = parser.parse_args()
    generate(args.prompt, args.output, args.resolution)
