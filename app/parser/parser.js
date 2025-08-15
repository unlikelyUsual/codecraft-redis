const { time } = require("node:console");
const { EventEmitter } = require("node:stream");

class KeyEmitter extends EventEmitter {}

// For more information :
// https://redis.io/docs/latest/develop/reference/protocol-spec/#sending-commands-to-a-redis-server
class Parser {
  constructor() {
    this.database = {};
    this.socktes = {};
    this.emitter = new KeyEmitter();
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
      if (Array.isArray(entry.value)) {
        return `-ERR WRONGTYPE Operation against a key holding the wrong kind of value\r\n`;
      }
      if (entry.expire !== null && Date.now() > entry.expire) {
        delete this.database[getKey];
        return "$-1\r\n";
      }
      return this.serialize(String(entry.value));
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

    if (listName in this.socktes && this.socktes[listName].length > 0) {
      setImmediate(() => this.emitter.emit(`data:${listName}`));
    }

    return this.serialize(this.database[listName].value.length);
  }

  /**
   * Handles the LPUSH command.
   * @param {string[]} args - The arguments for the LPUSH command. similar to RPUSH but insert from left
   * @returns {string} A RESP formatted string.
   */
  handleLpush(args) {
    const [listName, ...listValues] = args;
    if (listName in this.database) {
      this.database[listName].value = [
        ...listValues.reverse(),
        ...this.database[listName].value,
      ];
    } else {
      this.database[listName] = { value: listValues.reverse() };
    }

    if (listName in this.socktes && this.socktes[listName].length > 0) {
      setImmediate(() => this.emitter.emit(`data:${listName}`));
    }
    return this.serialize(this.database[listName].value.length);
  }

  /**
   * Handles the LRANGE command.
   * @param {string[]} args - The arguments for the LRANGE command.
   * @returns {string} A RESP formatted string.
   */
  handleLrange(args) {
    const [lName, startIndex, endIndex] = args;

    if (!lName) {
      return `-ERR wrong number of arguments for LRANGE`;
    }

    let start = parseInt(startIndex, 10);
    let end = parseInt(endIndex, 10);

    if (isNaN(start) || isNaN(end)) {
      return `-ERR value is not an integer or out of range`;
    }

    if (!(lName in this.database)) return this.serialize([]);
    else {
      const value = this.database[lName].value;

      if (start < 0) start = Math.max(value.length + start, 0);
      if (end < 0) end = value.length + end;
      if (start >= value.length || start > end) return this.serialize([]);

      return this.serialize(
        value.slice(start, Math.min(value.length, end + 1))
      );
    }
  }

  /**
   * Handles the LLEN command.
   * @param {string[]} args - The arguments for the LLEN command.
   * @returns {number} A RESP formatted integer.
   */
  handleLlen(args) {
    const [listName] = args;

    if (!listName) {
      return `-ERR wrong number of arguments for LLEN`;
    }

    if (!(listName in this.database)) return this.serialize(0);

    return this.serialize(this.database[listName].value.length);
  }

  /**
   * Handles the LPOP command.
   * @param {string[]} args - The arguments for the LPOP command.
   * @returns {number} A RESP formatted integer.
   */
  handleLpop(args) {
    const [listName, deleteCount] = args;

    if (!listName) {
      return `-ERR wrong number of arguments for LPOP`;
    }

    if (deleteCount)
      return this.serialize(
        this.database[listName].value.splice(0, deleteCount)
      );
    else return this.serialize(this.database[listName].value.shift());
  }

  handleBLpop(args, socket) {
    const [listName, timeout] = args;
    const data = this.database[listName];
    if (data && data.value.length > 0) {
      socket.write(this.serialize([listName, data.value.shift()]));
    } else {
      if (!this.socktes[listName]) {
        this.socktes[listName] = [];
      }

      this.socktes[listName].push(socket);

      if (timeout > 0) {
        //Delete the socket and
        setTimeout(() => {
          delete this.socktes[listName];
          this.emitter.removeListener(`data:${listName}`, () => {});
          if (!socket.destroyed) socket.write(this.serialize(null));
        }, timeout * 1000);
      }

      if (this.socktes[listName].length === 1) {
        this.emitter.once(`data:${listName}`, () => {
          const sockt = this.socktes[listName].shift();
          const item = this.database[listName].value.shift();

          if (sockt && !sockt.destroyed)
            sockt.write(this.serialize([listName, item]));

          if (
            this.socktes[listName].length > 0 &&
            this.database[listName].value.length > 0
          )
            this.emitter.emit(`data:${listName}`);
        });
      }
    }
  }

  handleIncr(args) {
    const [key] = args;
    const val = this.database[key];
    let num = Number(val?.value);

    if (val && isNaN(num)) {
      return this.serialize("-ERR value is not an integer or out of range");
    }

    if (val && num) {
      num++;
    } else {
      num = 1;
    }

    this.database[key] = { value: num, expire: null };
    return this.serialize(num);
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
    LPUSH: this.handleLpush,
    LLEN: this.handleLlen,
    LPOP: this.handleLpop,
    BLPOP: this.handleBLpop,
    INCR: this.handleIncr,
  };

  /**
   * Dispatches the command to the appropriate handler.
   * @param {string[]} command - The parsed command array (e.g., ["SET", "key", "value"]).
   * @returns {string} A RESP formatted response string.
   */
  handleCommand(command, socket) {
    const [commandName, ...args] = command;
    const handler = this.commandHandlers[commandName.toUpperCase()];

    if (handler) {
      return handler.call(this, args, socket);
    } else {
      return `-ERR unknown command '${commandName}'\r\n`;
    }
  }
}

module.exports = Parser;
