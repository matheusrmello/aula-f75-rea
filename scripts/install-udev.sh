#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "$(id -u)" -ne 0 ]; then
    if command -v pkexec >/dev/null 2>&1; then
        exec pkexec /bin/sh "$script_dir/install-udev.sh"
    fi
    exec sudo /bin/sh "$script_dir/install-udev.sh"
fi

install -m 0644 "$script_dir/../udev/70-aula-f75.rules" /etc/udev/rules.d/70-aula-f75.rules
udevadm control --reload-rules
for device in /sys/class/hidraw/hidraw*; do
    [ -f "$device/device/uevent" ] || continue
    case "$(cat "$device/device/uevent")" in
        *HID_ID=0003:00003554:0000FA09*|*HID_ID=0003:0000258A:0000010C*)
            udevadm trigger --action=change "$device"
            ;;
    esac
done
udevadm settle --timeout=10
printf '%s\n' 'Installed 70-aula-f75.rules and refreshed AULA HID devices.'
