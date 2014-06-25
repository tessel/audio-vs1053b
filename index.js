// Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

var fs = require('fs');
var events = require('events');
var util = require('util');
var hw = process.binding('hw');
var Writable = require('stream').Writable;
var Readable = require('stream').Readable;

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

var inputReg = 0x05,
    outputReg = 0x07;

var _audioCallbacks = {};
var _fillBuff = new Buffer(25000);
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
  this.MP3_XCS = hardware.digital[0].output(true); //Control Chip Select Pin (for accessing SPI Control/Status registers)
  this.MP3_DCS = hardware.digital[1].output(true); //Data Chip Select / BSYNC Pin
  this.MP3_DREQ = hardware.digital[2].input() //Data Request Pin: Player asks for more data

  this.input = "";
  this.output = "";

  // Waits for the audio completion event which signifies that a buffer has finished streaming
  process.on('audio_playback_complete', this._handlePlaybackComplete.bind(this));

  // Waits for the audio data event which is recorded data being output from the C shim
  process.on('audio_recording_data', this._handleRecordedData.bind(this));

  // Waits for final flushed buffer of a recording
  process.on('audio_recording_complete', this._handleRecordedData.bind(this));

  // Initialize the module
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

Audio.prototype._handlePlaybackComplete = function(errBool, completedStream) {

  var self = this;
  if (self.lock) {
    self.lock.release(function(err) {
      if (err) {
        self.emit('error', err);
        return
      }
      else {
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

          self.emit('end', err);
        }
      }
    });
  }
}

Audio.prototype._handleRecordedData = function(length) {
  // Copy the recorded data into a new buff for consumption
  var cp = new Buffer(length);
  _fillBuff.copy(cp, 0, 0, length);
  this.emit('data', cp);
}

Audio.prototype._failConnect = function(err, callback) {
  setImmediate(function() {
    this.emit('error', err);
  }.bind(this))

  return callback && callback(err);
}

Audio.prototype.createPlayStream = function() {
  var audio = this;
  var playStream = new Writable;

  // The Audio Module won't play chunks that are
  // less than ~3425 bytes...
  playStream.bufs = [];
  playStream.bufferedLen = 0;

  playStream._write = function (chunk, enc, next) {
    var err;
    this.bufs.push(chunk);
    this.bufferedLen += chunk.length;
    // Check if this chunk is too small to be played solo
    if (this.bufferedLen >= 10000) {
      var audioData = Buffer.concat(this.bufs);
      this.bufs = []; this.bufferedLen = 0;

      var ret = audio.queue(audioData);
      if (ret < 0) {

        err = new Error("Unable to queue the streamed buffer.");
      }
    }
    next(err);
  };

  playStream.on('finish', function flush() {
    var audioData = Buffer.concat(this.bufs);
    this.bufs = []; this.bufferedLen = 0;
    if (audioData.length) {
      var ret = audio.queue(audioData);
      if (ret < 0) {
        err = new Error("Unable to queue the streamed buffer.");
      }
    }
  });

  return playStream;
}

// Creates a Readable record stream
Audio.prototype.createRecordStream = function(profile) {
  var audio = this;

  var recordStream = new Readable;

  var bufQueue = [];

  audio.on('data', function(data) {
    recordStream.push(data);
  });

  recordStream._read = function(size) {}

  process.once('audio_recording_complete', function() {
    recordStream.push(null)
  });

  recordStream._write = function() {};

  audio.startRecording(profile);

  return recordStream;
}

Audio.prototype._once_dreq_ready = function (fn) {
  // TODO: use GPIO interrupt
  // TODO: timeout to give up
  while (!this.MP3_DREQ.read()) ;   // wait for ready
  fn();
}


Audio.prototype._softReset = function(callback) {
  this._readSciRegister16(SCI_MODE, function(err, mode) {
    if (err) { return callback && callback(err); }
    else {
      this._writeSciRegister16(SCI_MODE, mode | MODE_SM_RESET, function(err) {
        if (err) { return callback && callback(err); }
        else this._once_dreq_ready(function () {
          this._writeSciRegister16(SCI_MODE, 0x4800, callback);
        }.bind(this));
      }.bind(this));
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
  this._once_dreq_ready(function () {
    this.MP3_XCS.low(); //Select control

    //SCI consists of instruction byte, address byte, and 16-bit data word.
    this._SPItransferByte(0x03, function(err) {
      this._SPItransferByte(addressbyte, function(err) {
        this._SPItransferByte(0xFF, function(err, response1) {
          this._once_dreq_ready(function () {
            this._SPItransferByte(0xFF, function(err, response2) {
              this._once_dreq_ready(function () {
                this.MP3_XCS.high(); //Deselect Control
                var result = (response1 << 8) + response2;
                callback && callback(err, result);
              }.bind(this));
            }.bind(this));
          }.bind(this));
        }.bind(this));
      }.bind(this));
    }.bind(this));
  }.bind(this));
}

Audio.prototype._writeSciRegister = function(addressbyte, highbyte, lowbyte, callback) {
  this._once_dreq_ready(function () {
    this.MP3_XCS.low(); //Select control

    //SCI consists of instruction byte, address byte, and 16-bit data word.
    this._SPItransferArray([0x02, addressbyte, highbyte, lowbyte], function(err) {
      if (err) {
        return callback && callback(err);
      }
      else this._once_dreq_ready(function () {
        this.MP3_XCS.high(); //Deselect Control
        callback && callback();
      }.bind(this));
    }.bind(this));
  }.bind(this));
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
      self.setInput('mic', function(err) {
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

  // If no volume was provided
  if (leftChannelDecibels === undefined) {
    // Just callback
    if (callback) {
      callback();
    }

    // and return
    return;
  }
  // If the user passed in one decibel level and a callback
  else if (typeof rightChannelDecibels === 'function' && !callback) {
    // set the callback
    callback = rightChannelDecibels;
    // And make both channels the same
    rightChannelDecibels = leftChannelDecibels;
  }
  // If the user only passed in a decibel level
  else if (rightChannelDecibels === undefined && callback === undefined) { 
    // Make both channels the same
    rightChannelDecibels = leftChannelDecibels;
  }

  // The units are in half decibels
  leftChannelDecibels = leftChannelDecibels/0.5;
  rightChannelDecibels = rightChannelDecibels/0.5
  
  // Set VS10xx Volume Register
  this._writeSciRegister(SCI_VOL, leftChannelDecibels, rightChannelDecibels, callback);
}

Audio.prototype.setInput = function(input, callback) {
  if (input != 'lineIn' && input != 'mic') {
    return callback && callback(new Error("Invalid input requested..."));
  }
  else {
    this.input = input;

    this._getChipGpio(function(err, gpio) {
      if (err) { return callback && callback(err); }
      else {
        var newReg = (input === "lineIn" ? (gpio | (1 << inputReg)) : (gpio & ~(1 << inputReg)));
        this._setChipGpio(newReg, callback);
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
    this._getChipGpio(function(err, gpio) {
      if (err) { return callback && callback(err); }
      else {
        // Check if it's input or output and set the 7th bit of the gpio reg accordingly
        var newReg = (output === 'lineOut' ? (gpio | (1 << outputReg)) : (gpio & ~(1 << outputReg)));
        this._setChipGpio(newReg, callback);
      }
    }.bind(this));
  }
}

function Track(length, id, callback) {
  this._buflen = length;
  this.id = id;
  this.callback = callback;
}

util.inherits(Track, events.EventEmitter);

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

  if (buff.length === 0) {
    if (callback) {
      callback();
    }
    return;
  }

  self.spi.lock(function(err, lock) {
    if (err) {
      if (callback) {
        callback(err);
      }

      return;
    }

    // Save the lock reference so we can free it later
    self.lock = lock;
    // Initialize SPI so it's set to the right settings
    self.spi.initialize();
    // Send this buffer off to our shim to have it start playing
    var streamID = hw.audio_play_buffer(self.MP3_XCS.pin, self.MP3_DCS.pin, self.MP3_DREQ.pin, buff, buff.length);

    var track = new Track(buff.length, streamID, callback);

    self._handleTrack(track);

    self.emit('play', track);
  });
}

Audio.prototype._handleTrack = function(track) {
  // If stream id is less than zero, an error occured
  if (track.id < 0) {
    var err;

    if (track.id == -1) {
      err = new Error("Attempt to move to an invalid state.");
    }
    else if (track.id == -2) {
      err = new Error("Audio playback requires one GPIO Interrupt and none are available.");
    }
    else if (track.id == -3) {
      err = new Error("Unable to allocate memory required for transfer...");
    }

    if (track.callback) {
      track.callback(err);
    }

    this.emit('error', err, track);

    return;
  }
  // No error occured
  else {
    // If a callback was provided
    if (track.callback) {
      // Add it to the callbacks dict
      _audioCallbacks[track.id] = track.callback;
    }
  }
}

Audio.prototype.queue = function(buff, callback) {
  var self = this;

  if (!buff) {
    if (callback) {
      callback(new Error("Must pass valid buffer to queue."));
    }
    return;
  }

  if (buff.length === 0) {
    if (callback) {
      callback();
    }
    return;
  }

  // Initialize SPI to the correct settings
  self.spi.initialize();

  // If there was a lock in place, wait until it's released
  self.spi.lock(function(err, lock) {

    // Release the lock so that we don't wait until complete for next queue
    lock.release();

    self.lock = null;
    
    if (err) {
      if (callback) {
        callback(err);
      }

      return;
    }
    else {

      var streamID = hw.audio_queue_buffer(self.MP3_XCS.pin, self.MP3_DCS.pin, self.MP3_DREQ.pin, buff, buff.length);
      var track = new Track(buf_len, streamID, callback);
      self._handleTrack(track);
    }
  });
}

Audio.prototype.pause = function(callback) {
  var err;
  var ret = hw.audio_pause_buffer();

  if (ret < 0) {
    err = new Error("A buffer is not being played.");
    this.emit('error', err);
  }

  // If we have a lock on the spi bus
  if (this.lock) {
    // Release it
    this.lock.release(function(err) {
      // Call the callback if we have one
      if (callback) {
        callback(err);
      }
      return;
    });
  }
  // If there is no lock, just call the callback
  else {
    if (callback) {
      callback(err);
    }
  }
}

Audio.prototype.stop = function(callback) {
  var err;
  var ret = hw.audio_stop_buffer();

  if (ret < 0) {
    err = new Error("Not in a valid state to call stop.");
    this.emit('error', err);
  }

  // If we have a lock on the spi bus
  if (this.lock) {
    // Release it
    this.lock.release(function(err) {
      // Call the callback if we have one
      if (callback) {
        callback(err);
      }
      return;
    });
  }
  // If there is no lock, just call the callback
  else {
    if (callback) {
      callback(err);
    }
  }
}

Audio.prototype.availableRecordingProfiles = function() {
  return [
          'voice',
          'wideband-voice',
          'wideband-stereo',
          'hifi-voice',
          'stereo-music'
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

  // Initialize SPI to the correct settings
  self.spi.initialize();

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
    if (callback) {
      callback();
    }

    this.emit('startRecording');
  }

}


Audio.prototype.stopRecording = function(callback) {
  var self = this;

  process.once('audio_recording_complete', function recStopped(length) {

    process.unref();

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
  }
  else {
    process.ref();
  }
}

exports.use = use;
