const assert = require("assert");
const Parser = require("../parser/parser");

describe("Parser", () => {
  let parser;

  beforeEach(() => {
    parser = new Parser();
  });

  describe("serialize", () => {
    it("should serialize a simple string", () => {
      assert.strictEqual(parser.serialize("OK"), "$2\r\nOK\r\n");
    });

    it("should serialize a simple string starting with +", () => {
      assert.strictEqual(parser.serialize("+OK"), "+OK\r\n");
    });

    it("should serialize a simple string starting with -", () => {
      assert.strictEqual(parser.serialize("-ERR"), "-ERR\r\n");
    });

    it("should serialize a null bulk string", () => {
      assert.strictEqual(parser.serialize(null), "$-1\r\n");
    });

    it("should serialize an integer", () => {
      assert.strictEqual(parser.serialize(123), ":123\r\n");
    });

    it("should serialize an empty array", () => {
      assert.strictEqual(parser.serialize([]), "*0\r\n");
    });

    it("should serialize an array of strings", () => {
      assert.strictEqual(
        parser.serialize(["foo", "bar"]),
        "*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n"
      );
    });

    it("should serialize an array with mixed types", () => {
      assert.strictEqual(
        parser.serialize(["foo", 123, null]),
        "*3\r\n$3\r\nfoo\r\n:123\r\n$-1\r\n"
      );
    });
  });

  describe("parserSerializeString", () => {
    it("should parse a simple array command", () => {
      const input = "*2\r\n$4\r\nECHO\r\n$3\r\nhey\r\n";
      assert.deepStrictEqual(parser.parserSerializeString(input), [
        "ECHO",
        "hey",
      ]);
    });

    it("should parse a SET command", () => {
      const input = "*3\r\n$3\r\nSET\r\n$5\r\nmykey\r\n$7\r\nmyvalue\r\n";
      assert.deepStrictEqual(parser.parserSerializeString(input), [
        "SET",
        "mykey",
        "myvalue",
      ]);
    });

    it("should parse a command with EX option", () => {
      const input =
        "*5\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n$2\r\nEX\r\n$2\r\n60\r\n";
      assert.deepStrictEqual(parser.parserSerializeString(input), [
        "SET",
        "key",
        "value",
        "EX",
        "60",
      ]);
    });

    it("should parse a command with PX option", () => {
      const input =
        "*5\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n$2\r\nPX\r\n$4\r\n1000\r\n";
      assert.deepStrictEqual(parser.parserSerializeString(input), [
        "SET",
        "key",
        "value",
        "PX",
        "1000",
      ]);
    });

    it("should parse an empty bulk string", () => {
      const input = "*1\r\n$0\r\n\r\n";
      assert.deepStrictEqual(parser.parserSerializeString(input), [""]);
    });

    it("should throw error for invalid RESP format (missing CRLF)", () => {
      const input = "*1\r\n$3\r\nfoo"; // Missing final CRLF
      assert.throws(
        () => parser.parserSerializeString(input),
        /Invalid RESP format: Missing CRLF after bulk string data./
      );
    });

    it("should throw error for invalid array header", () => {
      const input = "$3\r\nfoo\r\n"; // Not an array
      assert.throws(
        () => parser.parserSerializeString(input),
        /Expected array header, but got a different type/
      );
    });

    it("should throw error for invalid bulk string header", () => {
      const input = "*1\r\n:3\r\n"; // Not a bulk string
      assert.throws(
        () => parser.parserSerializeString(input),
        /Expected bulk string header, but got: :3/
      );
    });
  });

  describe("handleCommand", () => {
    it("should handle PING command", () => {
      assert.strictEqual(parser.handleCommand(["PING"]), "+PONG\r\n");
    });

    it("should handle ECHO command", () => {
      assert.strictEqual(parser.handleCommand(["ECHO", "hello"]), "+hello\r\n");
    });

    it("should handle SET and GET commands", () => {
      assert.strictEqual(
        parser.handleCommand(["SET", "mykey", "myvalue"]),
        "+OK\r\n"
      );
      assert.strictEqual(
        parser.handleCommand(["GET", "mykey"]),
        "$7\r\nmyvalue\r\n"
      );
    });

    it("should handle GET for non-existent key", () => {
      assert.strictEqual(
        parser.handleCommand(["GET", "nonexistent"]),
        "$-1\r\n"
      );
    });

    it("should handle SET with EX option and expire", (done) => {
      parser.handleCommand(["SET", "tempkey", "tempvalue", "EX", "1"]);
      assert.strictEqual(
        parser.handleCommand(["GET", "tempkey"]),
        "$9\r\ntempvalue\r\n"
      );
      setTimeout(() => {
        assert.strictEqual(parser.handleCommand(["GET", "tempkey"]), "$-1\r\n");
        done();
      }, 1100); // Wait a bit more than 1 second
    }).timeout(2000); // Increase timeout for this test

    it("should handle SET with PX option and expire", (done) => {
      parser.handleCommand(["SET", "tempkeyPx", "tempvaluePx", "PX", "100"]);
      assert.strictEqual(
        parser.handleCommand(["GET", "tempkeyPx"]),
        "$11\r\ntempvaluePx\r\n"
      );
      setTimeout(() => {
        assert.strictEqual(
          parser.handleCommand(["GET", "tempkeyPx"]),
          "$-1\r\n"
        );
        done();
      }, 150); // Wait a bit more than 100 milliseconds
    }).timeout(1000); // Increase timeout for this test

    it("should handle RPUSH and LRANGE commands", () => {
      assert.strictEqual(
        parser.handleCommand(["RPUSH", "mylist", "a", "b", "c"]),
        ":3\r\n"
      );
      assert.strictEqual(
        parser.handleCommand(["LRANGE", "mylist", "0", "1"]),
        "*2\r\n$1\r\na\r\n$1\r\nb\r\n"
      );
      assert.strictEqual(
        parser.handleCommand(["RPUSH", "mylist", "d"]),
        ":4\r\n"
      );
      assert.strictEqual(
        parser.handleCommand(["LRANGE", "mylist", "0", "3"]),
        "*4\r\n$1\r\na\r\n$1\r\nb\r\n$1\r\nc\r\n$1\r\nd\r\n"
      );
    });

    it("should handle LRANGE for non-existent list", () => {
      assert.strictEqual(
        parser.handleCommand(["LRANGE", "nonlist", "0", "1"]),
        "*0\r\n"
      );
    });

    it("should return error for unknown command", () => {
      assert.strictEqual(
        parser.handleCommand(["UNKNOWN", "arg1"]),
        "-ERR unknown command 'UNKNOWN'\r\n"
      );
    });

    it("should return error for SET with missing arguments", () => {
      assert.strictEqual(
        parser.handleCommand(["SET", "keyonly"]),
        "-ERR wrong number of arguments for 'set' command\r\n"
      );
    });

    it("should return error for SET with invalid EX value", () => {
      assert.strictEqual(
        parser.handleCommand(["SET", "key", "value", "EX", "abc"]),
        "-ERR value is not an integer or out of range\r\n"
      );
    });

    it("should return error for SET with invalid PX value", () => {
      assert.strictEqual(
        parser.handleCommand(["SET", "key", "value", "PX", "abc"]),
        "-ERR value is not an integer or out of range\r\n"
      );
    });

    it("should return error for LRANGE with missing list name", () => {
      assert.strictEqual(
        parser.handleCommand(["LRANGE"]),
        "-ERR wrong number of arguments for LRANGE"
      );
    });

    it("should return error for LRANGE with invalid start/end", () => {
      assert.strictEqual(
        parser.handleCommand(["LRANGE", "mylist", "a", "b"]),
        "-ERR value is not an integer or out of range"
      );
    });
  });
});
