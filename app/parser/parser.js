class Parser {
  constructor() {
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
        const echoMessage = args[0] || "";
        return `+${echoMessage}\r\n`;
      case "PING":
        return "+PONG\r\n";
      case "SET":
        const [key, value, setCommand, nextArg] = args;
        const setComm = setCommand?.toUpperCase() ?? "";
        if (key && value) {
          let expire = null;
          switch (setComm) {
            case "EX":
              const seconds = parseInt(nextArg, 10);
              if (isNaN(seconds) || seconds <= 0) {
                return "-ERR value is not an integer or out of range\r\n";
              }
              expire = Date.now() + seconds * 1000;
              break;
            case "PX":
              const milliseconds = parseInt(nextArg, 10);
              if (isNaN(milliseconds) || milliseconds <= 0) {
                return "-ERR value is not an integer or out of range\r\n";
              }
              expire = Date.now() + milliseconds;
              break;
            default:
              break;
          }
          this.database[key] = { value, expire };
          return "+OK\r\n";
        } else {
          return "-ERR wrong number of arguments for 'set' command\r\n";
        }
      case "GET":
        const [getKey] = args;
        const entry = this.database[getKey];
        console.log(entry);
        if (entry !== undefined) {
          if (entry.expire !== null && Date.now() > entry.expire) {
            delete this.database[getKey];
            return "$-1\r\n";
          }
          return `$${Buffer.byteLength(entry.value, "utf8")}\r\n${
            entry.value
          }\r\n`;
        } else {
          return "$-1\r\n";
        }
      case "RPUSH":
        const [listName, listValue] = args;
        if (listName in this.database) {
          this.database[listName].value.push(listValue);
          return `+${this.database[listName].value.length}\r\n`;
        } else {
          this.database[listName] = { value: [listValue] };
          return `+${1}\r\n`;
        }
      default:
        return `-ERR unknown command '${commandName}'\r\n`;
    }
  }
}

module.exports = Parser;
