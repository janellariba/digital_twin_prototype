"""
Build the dashboard copy of the digital twin.

Takes the pristine twin (original/), injects bridge/twin-bridge.js at the end
of its module script, and writes the result into the React app's public folder.
The original file is never modified.

Usage (from the dt-prototype folder):
    python digital-twin/build_twin.py
"""
import argparse
import hashlib
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ORIGINAL = HERE / "original" / "Muntinlupa_Digital_Twin_offline.html"
DEFAULT_BRIDGE = HERE / "bridge" / "twin-bridge.js"
DEFAULT_OUT = HERE.parent / "frontend" / "public" / "digital-twin" / "Muntinlupa_Digital_Twin_offline.html"

# The bridge relies on these minified names. If the twin is regenerated and
# the minifier renames them, the build stops instead of producing a broken map.
REQUIRED = [
    "var Be=new mr",                # scene
    "rn=(i,t,e)=>[i,e,-t]",         # (E, N, h) -> three.js xyz
    "function a_(i,t)",             # lat/lon -> UTM 51N
    "var[eh,nh]=Hr.origin_utm",     # local frame origin
    "Un=Io.meta.dem",               # DEM metadata
    "function Fi(i,t)",             # DEM height lookup
    "function ih(i,t,e)",           # fly-to
    "var ms;",                      # terrain mesh
    "var Fr=new pe",                # buildings mesh
    "Br=new Ar",                    # raycaster
    "zr=new lt",                    # pointer vector
    "an=new ss",                    # renderer
    "sn=new Ae",                    # camera
    "var Sr=class",                 # CylinderGeometry
    ",xn=class",                    # MeshBasicMaterial
    ",pe=class",                    # Mesh
    ",mn=class",                    # Group
    "var os=class",                 # Shape (rings)
    "var br=class",                 # ShapeGeometry
    ",P=class",                     # Vector3
    ",Ge=2",                        # DoubleSide
]
# The bridge is inserted right after this statement (end of the twin's startup).
ANCHOR = '_s("Ready",4);Kt("loading").remove();'
MARKER = "/* BEGIN AI-SUNOG BRIDGE"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--original", type=Path, default=DEFAULT_ORIGINAL)
    ap.add_argument("--bridge", type=Path, default=DEFAULT_BRIDGE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    original = args.original.read_text(encoding="utf-8")
    bridge = args.bridge.read_text(encoding="utf-8")

    if MARKER in original:
        print("ERROR: the 'original' file already contains the bridge. Use the pristine twin.")
        return 1

    problems = []
    for needle in REQUIRED + [ANCHOR]:
        count = original.count(needle)
        if count != 1:
            problems.append(f"  expected 1 match, found {count}: {needle}")
    if "</script" in bridge.lower():
        problems.append("  the bridge must not contain '</script'")
    if problems:
        print("ERROR: the twin does not match what the bridge expects:")
        print("\n".join(problems))
        print("If the twin was regenerated, its minified names changed. Update the bridge and REQUIRED list.")
        return 1

    built = original.replace(ANCHOR, ANCHOR + "\n" + bridge + "\n", 1)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(built, encoding="utf-8")

    print(f"original : {args.original}  sha256 {sha256(original.encode())}")
    print(f"bridge   : {args.bridge}  ({len(bridge.splitlines())} lines)")
    print(f"output   : {args.out}  sha256 {sha256(built.encode())}")
    print("OK: bridge injected, original left untouched.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
