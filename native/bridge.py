"""Local stdio-only Windows screen/input host. No network listener or shell execution."""
import base64
import ctypes
from ctypes import wintypes
import io
import json
import sys
from PIL import Image
from mss import mss

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
user32 = ctypes.WinDLL("user32", use_last_error=True)
try:
    user32.SetProcessDPIAware()
except AttributeError:
    pass
ULONG_PTR = wintypes.WPARAM


class MouseInput(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]


class KeyboardInput(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]


class InputUnion(ctypes.Union):
    _fields_ = [("mi", MouseInput), ("ki", KeyboardInput)]


class Input(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", InputUnion)]


user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(Input), ctypes.c_int]
user32.SendInput.restype = wintypes.UINT
user32.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
user32.mouse_event.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ULONG_PTR]
user32.keybd_event.argtypes = [wintypes.BYTE, wintypes.BYTE, wintypes.DWORD, ULONG_PTR]
KEYS = {"Enter": 13, "Backspace": 8, "Tab": 9, "Escape": 27, "ArrowLeft": 37,
        "ArrowUp": 38, "ArrowRight": 39, "ArrowDown": 40, "Delete": 46, "Home": 36,
        "End": 35, "PageUp": 33, "PageDown": 34, "Control": 17, "Alt": 18,
        "Shift": 16, "Meta": 91, "L": 76, "C": 67, "V": 86, "A": 65, "F4": 115, "Space": 32}
KEYS.update({chr(65 + index): 65 + index for index in range(26)})
KEYS.update({str(index): 48 + index for index in range(10)})
KEYS.update({"F" + str(index): 111 + index for index in range(1, 13)})
KEYS["Insert"] = 45
capture = mss()


def execute(command):
    kind = command["type"]
    if kind == "capture":
        grab = capture.grab(capture.monitors[1])
        with Image.frombytes("RGB", grab.size, grab.bgra, "raw", "BGRX") as screen:
            width, height = screen.size
            if width > 1440:
                screen.thumbnail((1440, 1440 * height // width), Image.Resampling.BILINEAR)
            with io.BytesIO() as output:
                screen.save(output, format="JPEG", quality=55)
                return {"jpeg": base64.b64encode(output.getvalue()).decode("ascii"), "width": width, "height": height}
    elif kind == "pointer":
        width, height = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
        x = round(max(0, min(1, float(command["x"]))) * (width - 1))
        y = round(max(0, min(1, float(command["y"]))) * (height - 1))
        if not user32.SetCursorPos(x, y):
            raise OSError("Windows blocked pointer input. Unlock the laptop.")
        for flag in {"move": [], "click": [2, 4], "right": [8, 16], "down": [2], "up": [4]}[command["action"]]:
            user32.mouse_event(flag, 0, 0, 0, 0)
    elif kind == "release":
        user32.mouse_event(4, 0, 0, 0, 0)
    elif kind == "scroll":
        user32.mouse_event(0x800, 0, 0, int(command["delta"]) & 0xFFFFFFFF, 0)
    elif kind == "text":
        encoded = str(command["text"]).encode("utf-16-le")
        for offset in range(0, len(encoded), 2):
            code = int.from_bytes(encoded[offset:offset + 2], "little")
            down, up = Input(), Input()
            down.type = up.type = 1
            down.u.ki.wScan = up.u.ki.wScan = code
            down.u.ki.dwFlags, up.u.ki.dwFlags = 4, 6
            inputs = (Input * 2)(down, up)
            if user32.SendInput(2, inputs, ctypes.sizeof(Input)) != 2:
                raise OSError("Windows blocked typing. Elevated and secure screens cannot be controlled.")
    elif kind == "keys":
        pressed = []
        try:
            for name in command["keys"]:
                key = KEYS[name]
                user32.keybd_event(key, 0, 0, 0)
                pressed.append(key)
        finally:
            for key in reversed(pressed):
                user32.keybd_event(key, 0, 2, 0)
    else:
        raise ValueError("Unsupported command")
    return {}


for line in sys.stdin:
    command = {}
    try:
        command = json.loads(line)
        result = {"id": command["id"], "ok": True, **execute(command)}
    except Exception as error:
        result = {"id": command.get("id"), "ok": False, "error": str(error)}
    print(json.dumps(result, ensure_ascii=True), flush=True)
