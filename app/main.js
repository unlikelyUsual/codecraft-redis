const net = require("net");
const Parser = require("./parser/parser");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const parser = new Parser();

// Uncomment this block to pass the first stage
const server = net.createServer((connection) => {
  connection.on("data", (data) => {
    const commands = parser.parserSerializeString(data.toString());
    connection.write(parser.handleCommand(commands));
  });
});

server.listen(6379, "127.0.0.1");
