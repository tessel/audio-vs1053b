// VS1053b module

var fs = require('fs');
var events = require('events');
var util = require('util');
var async = require('async');

// VS10xx SCI Registers
var SCI_MODE = 0x00
  , SCI_STATUS = 0x01
  , SCI_BASS = 0x02
  , SCI_CLOCKF = 0x03
  , SCI_DECODE_TIME = 0x04
  , SCI_AUDATA = 0x05
  , SCI_WRAM = 0x06
  , SCI_WRAMADDR = 0x07
  , SCI_HDAT0 = 0x08
  , SCI_HDAT1 = 0x09
  , SCI_AIADDR = 0x0A
  , SCI_VOL = 0x0B
  , SCI_AICTRL0 = 0x0C
  , SCI_AICTRL1 = 0x0D
  , SCI_AICTRL2 = 0x0E
  , SCI_AICTRL3 = 0x0F;


var GPIO_DIR_ADDR = 0xC017
  , GPIO_READ_ADDR = 0xC018
  , GPIO_SET_ADDR = 0xC019;

function use (hardware, next) {
  return new Audio(hardware, next);
}


function Audio(hardware, callback) {
  // Set the spi port
  this.spi = new hardware.SPI({
    clockSpeed: 1000000,
    dataMode: 0
  });

  // Set our register select pins
  this.MP3_XCS = hardware.gpio(1).output().high() //Control Chip Select Pin (for accessing SPI Control/Status registers)
  this.MP3_DCS = hardware.gpio(2).output().high() //Data Chip Select / BSYNC Pin
  this.MP3_DREQ = hardware.gpio(3).input() //Data Request Pin: Player asks for more data

  this.input = "";
  this.output = "";
  this.initialize(callback);
}

util.inherits(Audio, events.EventEmitter);

Audio.prototype.initialize = function(callback) {
  var self = this;

  // Reset the mp3 decoder
  this._softReset(function(err) {
    if (err) { self._failConnect(err, callback); }
    else {
      // Make sure we can comm and have the right version
      self._checkVersion(function(err) { 
        if (err) { self._failConnect(err, callback); }
        else {
          // Set the clock speed higher
          self._setClockSpeeds(function(err) {
            if (err) { self._failConnect(err, callback); }
            else {
              // Enabke headphones and lineIn 
              self.setDefaultIO(function(err) {
                if (err) { self._failConnect(err, callback); }
                else {
                  // Call the callback
                  callback && callback(null, self);
                  // Ready the event
                  setImmediate(function() {
                    self.emit('ready');
                  });
                } 
              });
            }
          });
        }
      });
    }
  });
}

Audio.prototype._failConnect = function(err, callback) {
  setImmediate(function() {
    this.emit('error', err);
  }.bind(this))

  return callback && callback(err);
}

Audio.prototype._softReset = function(callback) {
  this._readSciRegister16(SCI_MODE, function(err, mode) {
    if (err) { return callback && callback(err); }
    else {
      this._writeSciRegister16(SCI_MODE, mode | 2, function(err) {
        if (err) { return callback && callback(err); }
        else {
          while (!this.MP3_DREQ);
          this._writeSciRegister16(SCI_MODE, 0x4800, callback);
        }
      });
    }
  }.bind(this))
}

Audio.prototype._checkVersion = function(callback) {
  this._readSciRegister16(SCI_STATUS, function(err, MP3Status) { 
    if (err) { return callback && callback(err); }
    else if ((MP3Status >> 4) & 0x000F != 4){
      return callback && callback(new Error("Invalid version returned from module."));
    }
    else {
      return callback && callback();
    }
  }.bind(this));
}

Audio.prototype._setClockSpeeds = function(callback) {
  // Set multiplier to 3.0x
  this._writeSciRegister16(SCI_CLOCKF, 0x6000, function(err) { 
    if (err) { return callback && callback(err); }
    else {
      this.spi.setClockSpeed(4000000);
      return callback && callback();
    }
  }.bind(this)); 

}

Audio.prototype._SPItransferByte = function(byte, callback) {
  this._SPItransferArray([byte], function(err, ret) {
    callback && callback(err, ret[0]);
  });
}

Audio.prototype._SPItransferArray = function(array, callback) {
  this.spi.transfer(new Buffer(array), function(err, ret) {
    return callback && callback(err, ret);
  });
}

//Read the 16-bit value of a VS10xx register
Audio.prototype._readSciRegister16 = function(addressbyte, callback) {

  // TODO: Use a GPIO interrupt
  while (!this.MP3_DREQ.read()) ; //Wait for DREQ to go high indicating IC is available
  this.MP3_XCS.low(); //Select control

  //SCI consists of instruction byte, address byte, and 16-bit data word.
  // TODO: Error handling
  this._SPItransferByte(0x03, function(err) {
    this._SPItransferByte(addressbyte, function(err) {
      this._SPItransferByte(0xFF, function(err, response1) {
        // TODO: Use a GPIO interrupt
        while (!this.MP3_DREQ.read()) ; //Wait for DREQ to go high indicating command is complete
        this._SPItransferByte(0xFF, function(err, response2) {
          while (!this.MP3_DREQ.read()) ; //Wait for DREQ to go high indicating command is complete

          this.MP3_XCS.high(); //Deselect Control

          var result = (response1 << 8) + response2;

          callback && callback(err, result)

        }.bind(this));
      }.bind(this));
    }.bind(this));
  }.bind(this));
}

Audio.prototype._writeSciRegister = function(addressbyte, highbyte, lowbyte, callback) {

  while(!this.MP3_DREQ.read()) ; //Wait for DREQ to go high indicating IC is available
  this.MP3_XCS.low(); //Select control

  //SCI consists of instruction byte, address byte, and 16-bit data word.
  this._SPItransferArray([0x02, addressbyte, highbyte, lowbyte], function(err) {
    if (err) {
      return callback && callback(err);
    }
    else {
      // TODO: GPIO Interrupt
      while(!this.MP3_DREQ.read()) ; //Wait for DREQ to go high indicating command is complete
      this.MP3_XCS.high(); //Deselect Control
      callback && callback();
    }
  }.bind(this))
}

Audio.prototype._writeSciRegister16 = function(addressbyte, word, callback) {
  this._writeSciRegister(addressbyte, (word >> 8) & 0xFF, word & 0xFF, callback);
}

Audio.prototype._setChipGpioDir = function(arg, callback) {
  this._writeSciRegister16(SCI_WRAMADDR, GPIO_DIR_ADDR, function(err) {
    if (err) { return callback && callback(err); }
    else {
      this._writeSciRegister16(SCI_WRAM, arg, callback);
    }
  }.bind(this));
}

Audio.prototype._setChipGpio = function(arg, callback) {
  this._writeSciRegister16(SCI_WRAMADDR, GPIO_SET_ADDR, function(err) {
    this._writeSciRegister16(SCI_WRAM, arg, callback);
  }.bind(this));
}

Audio.prototype._getChipGpioDir = function(callback) {
  this._getChipGPIOValue(GPIO_DIR_ADDR, callback);
}

Audio.prototype._getChipGpio = function(callback) {
  this._getChipGPIOValueFromAddr(GPIO_READ_ADDR, callback);
}

Audio.prototype._getChipGPIOValueFromAddr = function(gpioValue, callback) {
  this._writeSciRegister16(SCI_WRAMADDR, gpioValue, function(err) {
    if (err) { return callback && callback(err); }
    else {
      this._readSciRegister16(SCI_WRAM, function(err, result) {
        if (err) { return callback && callback(err); }
        else {
          return callback && callback(null, result);
        }
      });
    }
  }.bind(this));
}

Audio.prototype._enableAudioOutput = function(callback) {
  this._setChipGpioDir((1 << 7) + (1 << 5), callback);
}

Audio.prototype.setDefaultIO = function(callback) {
  var self = this;
  self._enableAudioOutput(function(err) {
    if (err) { self._failConnect(err, callback); }
    else {
      self.setInput('microphone', function(err) {
        if (err) { self._failConnect(err, callback); }
        else {
          self.setOutput('headphones', function(err) {
            if (err) { self._failConnect(err, callback); }
            else {
              callback && callback();
            }
          });
        }
      });
    }
  });
}

Audio.prototype.setVolume = function(leftChannel, rightChannel) {
  // Set VS10xx Volume Register
  this._writeSciRegister(SCI_VOL, leftChannel, rightChannel, callback);
}

Audio.prototype.setInput = function(input, callback) {
  if (input != 'lineIn' && input != 'microphone') {
    return callback && callback(new Error("Invalid input requested..."));
  }
  else {
    this.input = input;

    var bit = (input == 'microphone' ? 1 : 0);

    this._getChipGpio(function(err, gpio) {
      if (err) { return callback && callback(err); }
      else {
        this._setChipGpio(gpio & (bit << 5), callback);
      }
    }.bind(this));
  }
}

Audio.prototype.setOutput = function(output, callback) {
  if (output != 'lineOut' && output != 'headphones') {
    return callback && callback(new Error("Invalid output requested..."));
  }
  else {
    this.output = output;

    var bit = (output == 'lineOut' ? 1 : 0);

    this._getChipGpio(function(err, gpio) {
      if (err) { return callback && callback(err); }
      else {
        this._setChipGpio(gpio & (bit << 7), callback);
      }
    }.bind(this));
  }
}

Audio.prototype.play = function(buff, callback) {
  console.log('Loading mp3');

  console.log('chunking', buff.length, 'bytes.');


  var len = buff.length;
  var chunks = [], clen =  32;
  var p = 0, i = 0;
  while (p < len) {
    chunks[i] = buff.slice(p, p + clen);
    i = i + 1;
    p = p + clen;
  }

  console.log('done chunking:', chunks.length, 'chunks.');

  this.MP3_DCS.low();
  async.eachSeries(
    chunks, 
    function playChunk(chunk, callback) {
      this.spi.transfer(chunk, callback);
    }.bind(this),
    function playComplete(err) {
      callback && callback(err);
    }
  );

  console.log('done playing.');
}
exports.use = use;