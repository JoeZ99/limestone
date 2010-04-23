/*jslint eqeqeq: true, immed: true, newcap: true, nomen: true, onevar: true, plusplus: true, regexp: true, undef: true, white: true, indent: 2 */

// Converter between javascript values and "raw"
// streams which are encoded as javascript strings
// that only use the first 8 bits of each character.

// exports.Encoder - A binary string builder object.
(function () {

  var chr, proto;

  exports.Encoder = function (ServerCommand, ClientCommand) {
    // if (ServerCommand & ClientCommand) {
        this.header = encode_int16(ServerCommand) + encode_int16(ClientCommand);
    // } else {
    //    this.header = "";
    // }
    this.data = "";
  };

  chr = String.fromCharCode;
  proto = exports.Encoder.prototype;

  // Factor out the encode so it can be shared by add_header and push_int32
  function encode_int32(number) {
    var a, b, c, d, unsigned;
    unsigned = (number < 0) ? (number + 0x100000000) : number;
    a = Math.floor(unsigned / 0xffffff);
    unsigned &= 0xffffff;
    b = Math.floor(unsigned / 0xffff);
    unsigned &= 0xffff;
    c = Math.floor(unsigned / 0xff);
    unsigned &= 0xff;
    d = Math.floor(unsigned);
    return chr(a) + chr(b) + chr(c) + chr(d);
  }

  function encode_int16(number) {
    var a, b, unsigned;
    unsigned = (number < 0) ? (number + 0x10000) : number;
    a = Math.floor(unsigned / 0xff);
    unsigned &= 0xff;
    b = Math.floor(unsigned);
    return chr(a) + chr(b);
  }

  // Add a postgres header to the binary string and return it.
  proto.toString = function (noCount) {
    noCount = noCount | false;

  var out_string = '';
    if (noCount) {
      out_string = this.header + encode_int32(this.data.length) + this.data;
    } else {
      out_string = this.header + encode_int32(this.data.length + 4) + encode_int32(1) + this.data;
    }

    return out_string;
  };

  // Return data without headers (e.g. for negotiating with server about protocol version)
  proto.toRawString = function () {
    return this.data;
  };

  // Encode number as 32 bit 2s compliment
  proto.push_int32 = function (number) {
    this.data += encode_int32(number);
    return this;
  };

  // Encode number as 16 bit 2s compliment
  proto.push_int16 = function (number) {
    var a, b, unsigned;
    unsigned = (number < 0) ? (number + 0x10000) : number;
    a = Math.floor(unsigned / 0xff);
    unsigned &= 0xff;
    b = Math.floor(unsigned);
    this.data += chr(a) + chr(b);
    return this;
  };

  // Encode string without null terminator
  proto.push_raw_string = function (text) {
    this.data += text;
    return this;
  };

  // Encode string and precede it with 32-bit int length
  proto.push_lstring = function (text) {
    this.data += encode_int32(text.length) + text;
    return this;
  };

  // Encode text as null terminated string
  proto.push_cstring = function (text) {
    this.data += text + "\0";
    return this;
  };

  // Encode as a null terminated array of cstrings
  proto.push_multi_cstring = function (fields) {
    this.data += fields.join("\0") + "\0\0";
    return this;
  };

  proto.push_hash = function (hash) {
    for (var key in hash) {
      if (hash.hasOwnProperty(key)) {
        this.data += key + "\0" + hash[key] + "\0";
      }
    }
    this.data += "\0";
    return this;
  };

}());

// exports.Decoder - A binary string consumer object.
// TODO: Convert to use a moving pointer instead of creating a new substring
//       each iteration.  This will help performance a bit on parsing.
(function () {

  var proto;

  exports.Decoder = function (data) {
    this.data = data;
  };

  proto = exports.Decoder.prototype;

  proto.shift_code = function () {
    var code = this.data[0];
    this.data = this.data.substr(1);
    return code;
  };

  // Convert 4 characters to signed 32 bit integer
  proto.shift_int32 = function () {
    var unsigned = this.data.charCodeAt(0) * 0x1000000 + this.data.charCodeAt(1) * 0x10000 + this.data.charCodeAt(2) * 0x100 + this.data.charCodeAt(3);
    this.data = this.data.substr(4);
    return (unsigned & 0x80000000) ? (unsigned - 0x100000000) : unsigned;
  };

  // Convert 2 bytes to signed 16 bit integer
  proto.shift_int16 = function () {
    var unsigned = this.data.charCodeAt(0) * 0x100 + this.data.charCodeAt(1);
    this.data = this.data.substr(2);
    return (unsigned & 0x8000) ? (unsigned - 0x10000) : unsigned;
  };

  // Grab number of bytes as a string
  proto.shift_raw_string = function (len) {
    var string = this.data.substr(0, len);
    this.data = this.data.substr(len);
    return string;
  };

  // Grab number of bytes as a string
  proto.shift_lstring = function () {
    var length = this.shift_int32();
    var string = this.data.substr(0, length);
    this.data = this.data.substr(length);
    return string;
  };

  // Grab a null terminated string
  proto.shift_cstring = function () {
    var pos, string;
    pos = this.data.indexOf("\0");
    string = this.data.substr(0, pos);
    this.data = this.data.substr(pos + 1);
    return string;
  };

  // Grab a null terminated array of null terminated strings
  proto.shift_multi_cstring = function () {
    var pos, string;
    pos = this.data.indexOf("\0\0");
    string = this.data.substr(0, pos).split("\0");
    this.data = this.data.substr(pos + 1);
    return string;
  };


}());


