const { Server } = require("socket.io");
const http = require("http");

const server = http.createServer();
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("Пользователь подключился:", socket.id);

  socket.on("join_room", (data) => {
    socket.join(data.room);
    let clientIp = socket.handshake.address;
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.replace('::ffff:', '');
    }
    socket.emit("your_ip", { ip: clientIp });
    socket.to(data.room).emit("user_joined", { user: data.user, id: socket.id });
    console.log(`${data.user} зашел в комнату ${data.room} с IP ${clientIp}`);
  });

  socket.on("send_message", (data) => {
    socket.to(data.room).emit("receive_message", data);
  });

  socket.on("call_signal", (data) => {
    socket.to(data.room).emit("call_signal", data);
  });

  socket.on("disconnect", () => {
    console.log("Пользователь отключился");
  });
});

server.listen(3000, () => {
  console.log("СЕРВЕР ЗАПУЩЕН на порту 3000");
});