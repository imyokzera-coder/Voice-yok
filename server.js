const { Server } = require("socket.io");
const http = require("http");
const { AccessToken } = require("livekit-server-sdk");

const server = http.createServer();

// ⚠️ ЗАМЕНИТЕ НА СВОИ ДАННЫЕ ИЗ LIVEKIT CLOUD (cloud.livekit.io)
const LIVEKIT_API_KEY = "ваш_api_key_из_облака";
const LIVEKIT_API_SECRET = "ваш_api_secret_из_облака";
const LIVEKIT_URL = "wss://ваш-проект.livekit.cloud"; // Скопируйте ваш URL

const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7, // 10 МБ для голосовых
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

io.on("connection", (socket) => {
  console.log("Подключен:", socket.id);

  socket.on("join_room", (data) => {
    socket.join(data.room);
    
    // В облаке IP клиента скрыт за прокси Render, 
    // поэтому мы отправляем заглушку, чтобы приложение не падало
    socket.emit("your_ip", { ip: "Cloud Server" });
    
    socket.to(data.room).emit("user_joined", { user: data.user, id: socket.id });
    console.log(`${data.user} в комнате ${data.room}`);
  });

  socket.on("send_message", (data) => {
    socket.to(data.room).emit("receive_message", data);
  });

  socket.on("call_signal", (data) => {
    socket.to(data.room).emit("call_signal", data);
  });

  socket.on("get_livekit_token", async (data, callback) => {
    try {
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: data.user || socket.id,
        ttl: "2h",
      });
      at.addGrant({ roomJoin: true, room: data.room });
      const token = await at.toJwt();
      callback({ token, url: LIVEKIT_URL });
    } catch (e) {
      console.error("Ошибка токена:", e);
      callback({ error: e.message });
    }
  });

  socket.on("disconnect", () => {
    console.log("Отключен:", socket.id);
  });
});

// Render автоматически задает порт через переменную окружения PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`СЕРВЕР НА ПОРТУ ${PORT}`));
