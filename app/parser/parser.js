class Parser {
  constructor() {
    // This object simulates the Redis in-memory key-value store.
    this.database = {};
  }

  /**
   * A reverser function to parse a string in RESP format back into a JavaScript array.
   * This is the deserializer for the client, used to parse server responses.
   *
   * @param {string} string The RESP formatted string received from the Redis server.
   * Example: "*3\r\n$3\r\nSET\r\n$5\r\nmykey\r\n$7\r\nmyvalue\r\n"
   * @returns {string[]} An array representing the parsed command.
   */
  parserSerializeString(string) {
    // console.log(`Starting parsing`, string.replace("\n", "\\n"));
    let index = 0;

    function readUntilCRLF() {
      const end = string.indexOf("\r\n", index);
      if (end === -1) {
        throw new Error("Invalid RESP format: Missing CRLF terminator.");
      }
      const result = string.substring(index, end);
      index = end + 2; // Move the pointer past the CRLF
      return result;
    }

    function parseBulkString() {
      // Read the bulk string header (e.g., "$5")
      const header = readUntilCRLF();
      if (header[0] !== "$") {
        throw new Error(`Expected bulk string header, but got: ${header}`);
      }

      const length = parseInt(header.substring(1), 10);
      if (isNaN(length)) {
        throw new Error("Invalid RESP bulk string length.");
      }

      // Read the actual string data
      const bulkString = string.substring(index, index + length);
      index += length + 2; // Move pointer past the string and the final CRLF
      return bulkString;
    }

    // Read the array header (e.g., "*3")
    const arrayHeader = readUntilCRLF();
    if (arrayHeader[0] !== "*") {
      throw new Error("Expected array header, but got a different type.");
    }

    const arrayLength = parseInt(arrayHeader.substring(1), 10);
    if (isNaN(arrayLength)) {
      throw new Error("Invalid RESP array length.");
    }

    const result = [];
    for (let i = 0; i < arrayLength; i++) {
      result.push(parseBulkString());
    }

    return result;
  }

  handleCommand(command) {
    const [commandName, ...args] = command;

    switch (commandName.toUpperCase()) {
      case "ECHO":
        // The ECHO command returns a bulk string of its single argument.
        const echoMessage = args[0] || "";
        return `+${echoMessage}\r\n`;
      case "PING":
        // The PING command returns a simple string "PONG".
        return "+PONG\r\n";
      case "SET":
        // The SET command stores a key-value pair.
        const [key, value] = args;
        if (key && value) {
          this.database[key] = value;
          return "+OK\r\n"; // Simple string response for success.
        } else {
          return "-ERR wrong number of arguments for 'set' command\r\n";
        }
      case "GET":
        // The GET command retrieves a value by key.
        const [getKey] = args;
        const storedValue = this.database[getKey];
        if (storedValue !== undefined) {
          return `$${Buffer.byteLength(
            storedValue,
            "utf8"
          )}\r\n${storedValue}\r\n`;
        } else {
          return "$-1\r\n"; // Null bulk string for a missing key.
        }
      default:
        // Return a standard error for an unknown command.
        return `-ERR unknown command '${commandName}'\r\n`;
    }
  }
}

module.exports = Parser;
