const net = require("net");
const Parser = require("./parser/parser");

console.log("Application Started!");

const parser = new Parser();
const PORT = 6379 || process.env.PORT;

const server = net.createServer((connection) => {
  connection.on("data", (data) => {
    const commands = parser.parserSerializeString(data.toString());
    const response = parser.handleCommand(commands, connection);
    if (response) {
      connection.write(response);
    }
  });
});

server.listen(PORT, "127.0.0.1");
