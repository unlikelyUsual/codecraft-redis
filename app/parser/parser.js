// For more information :
// https://redis.io/docs/latest/develop/reference/protocol-spec/#sending-commands-to-a-redis-server
class Parser {
  constructor() {
    this.database = {};
  }

  /**
   * Converts a JavaScript value into a RESP formatted response string.
   * This is the counterpart to parserSerializeString().
   *
   * @param {string | number | null} data The data to be serialized.
   * @returns {string} A RESP formatted string.
   */
  serialize(data) {
    const CRLF = "\r\n";
    if (data === null) {
      return `$-1${CRLF}`;
    } else if (typeof data === "string") {
      if (data.startsWith("+") || data.startsWith("-")) {
        return `${data}${CRLF}`;
      } else {
        const byteLength = Buffer.byteLength(data, "utf8");
        return `$${byteLength}${CRLF}${data}${CRLF}`;
      }
    } else if (typeof data === "number") {
      return `:${data}${CRLF}`;
    } else if (Array.isArray(data)) {
      // Array response
      let result = `*${data.length}${CRLF}`;
      for (const item of data) {
        // Recursively serialize each item in the array
        result += this.serialize(item);
      }
      return result;
    } else {
      return `-ERR Unsupported data type\r\n`;
    }
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
      // Check for the CRLF after the bulk string data
      if (string.substring(index + length, index + length + 2) !== "\r\n") {
        throw new Error(
          "Invalid RESP format: Missing CRLF after bulk string data."
        );
      }
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

  /**
   * Handles the ECHO command.
   * @param {string[]} args - The arguments for the ECHO command.
   * @returns {string} A RESP formatted string.
   */
  handleEcho(args) {
    const echoMessage = args[0] || "";
    return `+${echoMessage}\r\n`;
  }

  /**
   * Handles the PING command.
   * @returns {string} A RESP formatted string.
   */
  handlePing() {
    return "+PONG\r\n";
  }

  /**
   * Handles the SET command.
   * @param {string[]} args - The arguments for the SET command.
   * @returns {string} A RESP formatted string.
   */
  handleSet(args) {
    const [key, value, setCommand, nextArg] = args;
    const setComm = setCommand?.toUpperCase() ?? "";

    if (!key || !value) {
      return "-ERR wrong number of arguments for 'set' command\r\n";
    }

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
  }

  /**
   * Handles the GET command.
   * @param {string[]} args - The arguments for the GET command.
   * @returns {string} A RESP formatted string.
   */
  handleGet(args) {
    const [getKey] = args;
    const entry = this.database[getKey];

    if (entry !== undefined) {
      if (entry.expire !== null && Date.now() > entry.expire) {
        delete this.database[getKey];
        return "$-1\r\n";
      }
      return `$${Buffer.byteLength(entry.value, "utf8")}\r\n${entry.value}\r\n`;
    } else {
      return "$-1\r\n";
    }
  }

  /**
   * Handles the RPUSH command.
   * @param {string[]} args - The arguments for the RPUSH command.
   * @returns {string} A RESP formatted string.
   */
  handleRpush(args) {
    const [listName, ...listValues] = args;
    if (listName in this.database) {
      this.database[listName].value.push(...listValues);
    } else {
      this.database[listName] = { value: [...listValues] };
    }
    return this.serialize(this.database[listName].value.length);
  }

  /**
   * Handles the LRANGE command.
   * @param {string[]} args - The arguments for the LRANGE command.
   * @returns {string} A RESP formatted string.
   */
  handleLrange(args) {
    const [lName, start, end] = args;

    if (!lName) {
      return `-ERR wrong number of arguments for LRANGE`;
    }

    const startIndex = parseInt(start, 10);
    const endIndex = parseInt(end, 10) + 1; //for inclusion of last item

    if (isNaN(startIndex) || isNaN(endIndex)) {
      return `-ERR value is not an integer or out of range`;
    }

    if (!(lName in this.database)) return this.serialize([]);
    else {
      const len = this.database[lName].value.length;
      const startEle = startIndex < 0 ? len + startIndex : startIndex;
      const endEle = endIndex < 0 ? len + endIndex : endIndex;
      return this.serialize(
        this.database[lName].value.slice(startEle, endEle + 1)
      );
    }
  }

  /**
   * Maps command names to their respective handler methods.
   * @type {Object.<string, Function>}
   */
  commandHandlers = {
    ECHO: this.handleEcho,
    PING: this.handlePing,
    SET: this.handleSet,
    GET: this.handleGet,
    RPUSH: this.handleRpush,
    LRANGE: this.handleLrange,
  };

  /**
   * Dispatches the command to the appropriate handler.
   * @param {string[]} command - The parsed command array (e.g., ["SET", "key", "value"]).
   * @returns {string} A RESP formatted response string.
   */
  handleCommand(command) {
    const [commandName, ...args] = command;
    const handler = this.commandHandlers[commandName.toUpperCase()];

    if (handler) {
      return handler.call(this, args);
    } else {
      return `-ERR unknown command '${commandName}'\r\n`;
    }
  }
}

module.exports = Parser;
