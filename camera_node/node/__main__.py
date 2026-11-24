"""Start one camera node.

    python -m node --config config/LAB-A.json
"""
import argparse
import logging
import sys

from . import config, runner


def main() -> int:
    ap = argparse.ArgumentParser(description="AI-SUNOG camera node")
    ap.add_argument("--config", required=True, help="camera config JSON, e.g. config/LAB-A.json")
    ap.add_argument("--debug", action="store_true", help="more detailed logs")
    args = ap.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    try:
        cfg = config.load(args.config)
    except config.ConfigError as e:
        print(f"CONFIG ERROR: {e}", file=sys.stderr)
        return 2
    logging.getLogger("httpx").setLevel(logging.WARNING)  # do not log every request
    logging.getLogger("node").info("Camera %s (%s) -> %s", cfg["camera_id"], cfg.get("label"), cfg["server_url"])
    runner.run(cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
