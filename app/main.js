const net = require("net");
const Parser = require("./parser/parser");

console.log("Application Started!");

const parser = new Parser();
const PORT = 6379 || process.env.PORT;

// Uncomment this block to pass the first stage
const server = net.createServer((connection) => {
  connection.on("data", (data) => {
    const commands = parser.parserSerializeString(data.toString());
    connection.write(parser.handleCommand(commands));
  });
});

server.listen(PORT, "127.0.0.1");
