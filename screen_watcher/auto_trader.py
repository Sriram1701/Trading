"""Automatic broker screen interaction is intentionally disabled."""

import sys


def main() -> int:
    print(
        "DISABLED: this project does not automate broker interactions. "
        "No server or mouse/keyboard actions were started."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
