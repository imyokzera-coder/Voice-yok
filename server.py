import asyncio
import websockets
import json

clients = {}

async def handler(websocket):
    print(f"[+] Новое подключение: {websocket.remote_address}")
    try:
        async for message in websocket:
            print(f"[DEBUG] Получено: {message}")
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                print("[ERROR] Ошибка парсинга JSON")
                continue

            action = data.get("action")

            if action == "join":
                room = data.get("room")
                if room not in clients:
                    clients[room] = set()
                clients[room].add(websocket)
                print(f"[+] User joined room: {room}")

            elif action in ["message", "signal"]:
                room = data.get("room")
                if room in clients:
                    for client in clients[room]:
                        if client != websocket:
                            try:
                                await client.send(message)
                            except Exception as e:
                                print(f"[ERROR] Ошибка отправки: {e}")
                else:
                    print(f"[WARN] Комната {room} не найдена")
                    
    except websockets.exceptions.ConnectionClosed:
        print("[-] Клиент отключился")
    except Exception as e:
        print(f"[CRITICAL ERROR] {e}")
    finally:
        for room in list(clients.keys()):
            if websocket in clients[room]:
                clients[room].remove(websocket)
                if len(clients[room]) == 0:
                    del clients[room]

async def main():
    print("СЕРВЕР ЗАПУЩЕН на порту 3000 (Python)")
    async with websockets.serve(handler, "0.0.0.0", 3000):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
