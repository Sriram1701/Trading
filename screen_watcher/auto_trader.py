import http.server
import socketserver
import json
import time
import os
import random
try:
    import pyautogui
except ImportError:
    print("Error: pyautogui not installed. Please run install_clicker.bat first!")
    exit()

PORT = 3001
COORDS_FILE = 'coords.json'
coords = {}

def load_coords():
    global coords
    if os.path.exists(COORDS_FILE):
        with open(COORDS_FILE, 'r') as f:
            coords = json.load(f)
            return True
    return False

def setup_coords():
    print("==================================================")
    print("          QUOTEX AUTO-CLICKER CALIBRATION         ")
    print("==================================================")
    print("Move your mouse to the TIME INPUT BOX on Quotex and press ENTER in this window.")
    input()
    coords['time_box'] = pyautogui.position()
    print(f"-> Time box saved at {coords['time_box']}")

    print("\nMove your mouse to the GREEN UP (Call) button and press ENTER.")
    input()
    coords['up_btn'] = pyautogui.position()
    print(f"-> UP button saved at {coords['up_btn']}")

    print("\nMove your mouse to the RED DOWN (Put) button and press ENTER.")
    input()
    coords['down_btn'] = pyautogui.position()
    print(f"-> DOWN button saved at {coords['down_btn']}")

    with open(COORDS_FILE, 'w') as f:
        json.dump(coords, f)
    print("\nAll Coordinates saved! You can now let the AI trade for you.")
    print("==================================================\n")

class TradeHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # Suppress default logging

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/trade':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            direction = data.get('direction')
            duration_minutes = data.get('duration')
            
            print(f"🔥 [AUTO-TRADE] Signal Received: {direction} for {duration_minutes} Minutes!")
            
            if 'time_box' in coords:
                # 1. Smoothly move to Time Box
                move_time = random.uniform(0.3, 0.7)
                pyautogui.moveTo(coords['time_box'][0], coords['time_box'][1], duration=move_time, tween=pyautogui.easeInOutQuad)
                time.sleep(random.uniform(0.1, 0.3))
                pyautogui.click()
                time.sleep(random.uniform(0.2, 0.5))
                
                # 2. Type Time (Human-like)
                time_str = f"00:0{duration_minutes}:00" if duration_minutes < 10 else f"00:{duration_minutes}:00"
                pyautogui.hotkey('ctrl', 'a')
                time.sleep(random.uniform(0.1, 0.3))
                pyautogui.press('backspace')
                time.sleep(random.uniform(0.1, 0.4))
                
                # Type characters slowly
                for char in time_str:
                    pyautogui.write(char)
                    time.sleep(random.uniform(0.05, 0.15))
                
                time.sleep(random.uniform(0.3, 0.6))
                
            # 3. Smoothly move to Trade Button
            btn_coord = coords['up_btn'] if direction == 'UP' else coords['down_btn']
            if btn_coord:
                move_time = random.uniform(0.3, 0.8)
                pyautogui.moveTo(btn_coord[0], btn_coord[1], duration=move_time, tween=pyautogui.easeInOutQuad)
                
                # 4. Wait well and confirm before clicking
                wait_time = random.uniform(0.5, 1.5)
                print(f"👁️‍🗨️ Humanizing delay: Waiting {wait_time:.2f} seconds to confirm before clicking...")
                time.sleep(wait_time)
                
                pyautogui.click()
                print(f"✅ Clicked {direction} Button Successfully (Stealth Mode)!")
                
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())

if __name__ == "__main__":
    print("==================================================")
    print("      QUOTEX 1000% AUTO-TRADE ROBOT STARTING      ")
    print("==================================================")
    
    if not load_coords():
        print("Initial Setup Required.")
        setup_coords()
    else:
        print("Settings loaded. (If you changed browser size, delete coords.json to reset)")
        
    print(f"\nListening for signals from Web Scanner on Port {PORT}...")
    print("Leave this window open while trading.")
    
    with socketserver.TCPServer(("", PORT), TradeHandler) as httpd:
        httpd.serve_forever()
