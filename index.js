// VS1053b module

var fs = require('fs');
var events = require('events');
var util = require('util');
var hw = process.binding('hw')

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

var MODE_SM_RESET = 0x04;

var GPIO_DIR_ADDR = 0xC017
  , GPIO_READ_ADDR = 0xC018
  , GPIO_SET_ADDR = 0xC019;

var _audioCallbacks = {};
var _fillBuff = new Buffer(5000);
_fillBuff.fill(0);


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
  this.MP3_XCS = hardware.digital[1].output(true); //Control Chip Select Pin (for accessing SPI Control/Status registers)
  this.MP3_DCS = hardware.digital[2].output(true); //Data Chip Select / BSYNC Pin
  this.MP3_DREQ = hardware.digital[3].input() //Data Request Pin: Player asks for more data

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

  // Waits for the audio completion event which signifies that a buffer has finished streaming
  process.on('audio_complete', function playComplete(errBool, completedStream) {
    // Get the callback if one was saved
    var callback = _audioCallbacks[completedStream];

    // If it exists
    if (callback) {
      // Remove it from our datastructure
      delete _audioCallbacks[completedStream];

      var err;
      // Generate an error message if there was an error
      if (errBool) {
        err = new Error("Error sending buffer over SPI");
      }
      // Call the callback
      callback(err);

      self.emit('finish', err);
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
      this._writeSciRegister16(SCI_MODE, mode | MODE_SM_RESET, function(err) {
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
      var err = new Error("Invalid version returned from module.");

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

Audio.prototype.setVolume = function(leftChannelDecibels, rightChannelDecibels, callback) {
  if (rightChannelDecibels === undefined) {
    rightChannelDecibels = leftChannelDecibels;
  }

  // The units are in half decibels
  leftChannelDecibels = leftChannelDecibels/0.5;
  rightChannelDecibels = rightChannelDecibels/0.5
  // Set VS10xx Volume Register
  this._writeSciRegister(SCI_VOL, leftChannelDecibels, rightChannelDecibels, callback);
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
  // Check if no buffer was passed in but a callback was
  // (the user would like to resume playback)
  var self = this;

  if (!callback && typeof buff == "function") {
    callback = buff;
    buff = new Buffer(0);
  }
  // Check if there was no buffer or callback passed in
  else if (!buff && !callback) {
    buff = new Buffer(0);
  }

  // Send this buffer off to our shim to have it start playing
  var streamID = hw.audio_play_buffer(this.MP3_XCS.pin, this.MP3_DCS.pin, this.MP3_DREQ.pin, buff, buff.length);

  this._handleStreamID(streamID, callback);

  this.emit('play');

  return streamID;
}

Audio.prototype._handleStreamID = function(streamID, callback) {
  // If stream id is less than zero, an error occured
  if (streamID < 0) {
    var err;

    if (streamID == -1) {
      err = new Error("Attempt to move to an invalid state.");
    }
    else if (streamID == -2) {
      err = new Error("Audio playback requires one GPIO Interrupt and none are available.");
    }
    else if (streamID == -3) {
      err = new Error("Unable to allocate memory required for transfer...");
    }

    if (callback) {
      callback(err);
    }

    this.emit('error', err, streamID);

    return;
  }
  // No error occured
  else {
    // If a callback was provided
    if (callback) {
      // Add it to the callbacks dict
      _audioCallbacks[streamID] = callback;
    }
  }
}

Audio.prototype.queue = function(buff, callback) {
  if (!buffer) {
    if (callback) {
      callback(new Error("Must pass valid buffer to queue."));
    }
    return;
  }
  var streamID = hw.audio_queue_buffer(this.MP3_XCS.pin, this.MP3_DCS.pin, this.MP3_DREQ.pin, buff, buff.length);

  this._handleStreamID(streamID, callback);

  return streamID;
}

Audio.prototype.pause = function(callback) {
  var err;
  var ret = hw.audio_pause_buffer();

  if (ret < 0) {
    err = new Error("A buffer is not being played.");
    this.emit('error', err);
  }

  if (callback) {
    callback(err);
  }
}

Audio.prototype.stop = function(callback) {
  var err;
  var ret = hw.audio_stop_buffer();

  if (ret < 0) {
    err = new Error("You must stopRecording before calling stop.");
    this.emit('error', err);
  }

  if (callback) {
    callback(err);
  }
}

Audio.prototype.availableRecordingProfiles = function() {
  return [
          'voice',
          'wideband-voice',
          'wideband-stereo',
          'hifi-voice',
          'stero-music'
          ];
}

Audio.prototype.startRecording = function(profile, callback) {
  var self = this;

  if (!callback && typeof profile == "function") {
    callback = profile;
    profile = "hifi-voice";
  }
  else if (!profile && !callback) {
    profile = "hifi-voice";
  }

  if (self.availableRecordingProfiles().indexOf(profile) == -1) {
    var err = new Error("Invalid profile name. See audio.availableRecordingProfiles()");
    if (callback) {
      callback(err);
    }
    self.emit('error', err);
    return;
  }

  var pluginDir = __dirname + "/plugins/" + profile + ".img";

  var ret = hw.audio_start_recording(this.MP3_XCS.pin, this.MP3_DREQ.pin, pluginDir, _fillBuff);

  if (ret < 0) {
    var err; 

    if (ret == -1) {
      err = new Error("Not able to allocate recording memory...");
    }
    else if (ret == -2) {
      err = new Error("Invalid plugin file.");
    }
    else if (ret == -3) {
      err = new Error("Module must be in an idle state to start recording.");
    }
    if (callback) {
      callback(err);
    }

    this.emit('error', err);

    return;
  }

  else {

    function recordedData(length) {
      var newData = _fillBuff.slice(0, length);
      console.log('first byte received is', newData[0]);
      console.log('last byte received is', newData[newData.length-1]);
      self.emit('data', newData);
    }

    process.on('audio_data', recordedData);

    process.once('audio_complete', function removeEvent() {
      self.removeListener('audio_data', recordedData);
    });

    if (callback) {
      callback();
    }

    this.emit('startRecording');
  }
}


Audio.prototype.stopRecording = function(callback) {
  var self = this;

  process.once('audio_complete', function recordedData(length) {
    // Stop listening for more data
    self.removeAllListeners('audio_data');
    // Grab what's left in the buffer
    console.log('final length', length);
    var newData = _fillBuff.slice(0, length);
    console.log('first byte received is', newData[0]);
    console.log('last byte received is', newData[newData.length-1]);
    // Emit it
    self.emit('data', newData);

    // If a callback was provided, return it
    if (callback) {
      callback();
    }
    
    // Stop recording
    self.emit('stopRecording');
  });

  var ret = hw.audio_stop_recording();

  if (ret < 0) {
    var err = new Error("Not in valid state to stop recording.");

    if (callback) {
      callback(err);
    }

    this.emit('error', err);

    return;
  }
}

exports.use = use;