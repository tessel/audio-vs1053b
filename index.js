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
var queue = require('sync-queue');

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
  var self = this;
  // Set the spi port
  self.spi = new hardware.SPI({
    clockSpeed: 1000000,
    dataMode: 0
  });

  self.commandQueue = new queue();

  // Set our register select pins
  self.MP3_XCS = hardware.digital[0].output(true); //Control Chip Select Pin (for accessing SPI Control/Status registers)
  self.MP3_DCS = hardware.digital[1].output(true); //Data Chip Select / BSYNC Pin
  self.MP3_DREQ = hardware.digital[2].input() //Data Request Pin: Player asks for more data

  self.input;
  self.output;

  // Waits for the audio completion event which signifies that a buffer has finished streaming
  process.on('audio_playback_complete', self._handlePlaybackComplete.bind(self));

  // Waits for the audio data event which is recorded data being output from the C shim
  process.on('audio_recording_data', self._handleRecordedData.bind(self));

  // Waits for final flushed buffer of a recording
  process.on('audio_recording_complete', self._handleRecordedData.bind(self));

  // Initialize the module
  self.commandQueue.place(self.initialize.bind(self, callback));
}

util.inherits(Audio, events.EventEmitter);

Audio.prototype.initialize = function(callback) {
  var self = this;

  // Reset the mp3 decoder
  this._softReset(function(err) {
    if (!self._failConnect(err, callback)) {
      // Make sure we can comm and have the right version
      self._checkVersion(function(err) {
        if (!self._failConnect(err, callback)) {
          // Set the clock speed higher
          self._setClockSpeeds(function(err) {
            if (!self._failConnect(err, callback)) {
              // Enabke headphones and lineIn
              self.setDefaultIO(function(err) {
                if (!self._failConnect(err, callback)) {
                  // Call the callback
                  callback && callback(null, self);
                  // Ready the event
                  setImmediate(function() {
                    self.emit('ready');
                  });
                }
              });

              self.commandQueue.next();
            }
          });
        }
      });
    }
  });
}

Audio.prototype._handlePlaybackComplete = function(errBool, completedStream) {

  var self = this;

  // Get the callback if one was saved
  var track = _audioCallbacks[completedStream];

  // If it exists
  if (track) {
    // Remove it from our datastructure
    delete _audioCallbacks[completedStream];

    // Call the callback
    if (track.callback) {
      track.callback();
    }
    
    // Emit the end event
    self.emit('end', err);
  }

  // Get the number of streams still playing
  var remaining = Object.keys(_audioCallbacks).length;
  // If there are not still tracks playing and we have a lock reference
  if (!remaining && self.lock) {
    // Free the lock
    self.lock.release(function(err) {
      if (err) {
        self.emit('error', err);
        return
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

  if (err) {
    if (callback) {
      callback(err);
    }
    else {
      setImmediate(function() {
        this.emit('error', err);
      }.bind(this))
    }

    return true
  }
  else {
    return false;
  }
  
}

Audio.prototype.createPlayStream = function() {
  var audio = this;
  var playStream = new Writable;

  // The Audio Module won't play chunks that are
  // less than ~3425 bytes...
  playStream.bufs = [];
  playStream.bufferedLen = 0;
  playStream.last = 0;

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

  audio.on('queued', function(id) {
    playStream.last = id;
  })

  process.on('audio_playback_complete', function(err, stream_id) {
    if (stream_id === playStream.last) {
      playStream.emit('end');
    }
  })

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


Audio.prototype._softReset = function(callback) {
  this._readSciRegister16(SCI_MODE, function(err, mode) {
    if (err) { return callback && callback(err); }
    else {
      this._writeSciRegister16(SCI_MODE, mode | MODE_SM_RESET, function(err) {
        if (err) { return callback && callback(err); }
        else {
          while (!this.MP3_DREQ.read());
          this._writeSciRegister16(SCI_MODE, 0x4800, callback);
        }
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

  // TODO: Use a GPIO interrupt
  while (!this.MP3_DREQ.read()) ; //Wait for DREQ to go high indicating IC is available
  this.MP3_XCS.low(); //Select control

  //SCI consists of instruction byte, address byte, and 16-bit data word.
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

  self.commandQueue.place(function() { 
    self._enableAudioOutput(function(err) {
      if (!self._failConnect(err, callback)) {
        self.setInput('mic', function(err) {
          if (!self._failConnect(err, callback)) {
            self.setOutput('headphones', function(err) {
              if (!self._failConnect(err, callback)) {
                callback && callback();
              }
            });
          }
        });
        self.commandQueue.next();
      }
    });
  });
}

Audio.prototype.setVolume = function(leftChannelDecibels, rightChannelDecibels, callback) {
  var self = this;

  self.commandQueue.place(function() {

    if(typeof leftChannelDecibels !== 'number'){ // if no volume provided
      return (!typeof leftChannelDecibels === 'function') || leftChannelDecibels(); // call callback if provided
    }

    leftChannelDecibels = self._normalizeVolume(leftChannelDecibels);

    if(typeof rightChannelDecibels !== 'number') {
      if(typeof rightChannelDecibels === 'function') {
        callback = rightChannelDecibels;
      }
      rightChannelDecibels = leftChannelDecibels; // set right channel = left channel
    } else {
      rightChannelDecibels = self._normalizeVolume(rightChannelDecibels);
    }
    // Set VS10xx Volume Register
    self._writeSciRegister(SCI_VOL, leftChannelDecibels, rightChannelDecibels, callback);
    setImmediate(self.commandQueue.next.bind(self));
  });
}

// helper function for setVolume
Audio.prototype._normalizeVolume = function(vol){
  vol = (vol > 1) ? 1 : (vol < 0) ? 0 : vol; // make sure val is in the range 0-1.
  return Math.round((1 - vol) * 0xFE); // 0xFE = min sound level before completely off (0xFF)
}

Audio.prototype.setInput = function(input, callback) {
  var self = this;

  self.commandQueue.place(function() { 
    if (input != 'lineIn' && input != 'mic') {
      callback && callback(new Error("Invalid input requested..."));
      setImmediate(self.commandQueue.next.bind(self));
      return
    }
    else {
      self.input = input;

      self._getChipGpio(function(err, gpio) {
        if (err) { return callback && callback(err); }
        else {
          var newReg = (input === "lineIn" ? (gpio | (1 << inputReg)) : (gpio & ~(1 << inputReg)));
          self._setChipGpio(newReg, callback);
          setImmediate(self.commandQueue.next.bind(self));
        }
      });
    }
  });
}

Audio.prototype.setOutput = function(output, callback) {
  var self = this;

  self.commandQueue.place(function() { 
    if (output != 'lineOut' && output != 'headphones') {
      callback && callback(new Error("Invalid output requested..."));
      setImmediate(self.commandQueue.next.bind(self));
      return;
    }
    else {
      self.output = output;
      self._getChipGpio(function(err, gpio) {
        if (err) { return callback && callback(err); }
        else {
          // Check if it's input or output and set the 7th bit of the gpio reg accordingly
          var newReg = (output === 'lineOut' ? (gpio | (1 << outputReg)) : (gpio & ~(1 << outputReg)));
          self._setChipGpio(newReg, callback);
          setImmediate(self.commandQueue.next.bind(self));
        }
      });
    }
  });
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

  self.commandQueue.place(function() { 

    // If we don't have a lock
    if (!self.lock) {
      // Obtain a lock
      self.spi.lock(function(err, lock) {
        if (err) {
          if (callback) {
            callback(err);
          }
          self.commandQueue.next();
          return;
        }

        // Keep a reference to the lock
        self.lock = lock;

        // Play the track
        _play_helper();
      });
    }
    else {
      // Play the track
      _play_helper();
    }

    function _play_helper() {
      // Send this buffer off to our shim to have it start playing
      var streamID = hw.audio_play_buffer(self.MP3_XCS.pin, self.MP3_DCS.pin, self.MP3_DREQ.pin, buff, buff.length);

      var track = new Track(buff.length, streamID, callback);

      self._handleTrack(track);

      self.emit('play', track);

      self.commandQueue.next();
    }
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

    return;
  }
  // No error occured
  else {
    // Add it to the callbacks dict
    _audioCallbacks[track.id] = track;

    this.emit('queued', track.id);
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

  self.commandQueue.place(function() { 
    // If we don't have a SPI lock
    if (!self.lock) {
      // Initialize SPI to the correct settings
      self.spi._initialize();
      // If there was a lock in place, wait until it's released, and we have it
      self.spi.lock(function(err, lock) {

        if (err) {
          if (callback) {
            callback(err);
          }
          self.commandQueue.next();
          return;
        }
        else {
          self.lock = lock;

          // Queue the data
          _queue_helper();
        }
      });
    }
    else {
      // Queue the data
      _queue_helper();
    }

    function _queue_helper() {
      var streamID = hw.audio_queue_buffer(self.MP3_XCS.pin, self.MP3_DCS.pin, self.MP3_DREQ.pin, buff, buff.length);
      var track = new Track(buf_len, streamID, callback);
      self._handleTrack(track);
      self.commandQueue.next();
    }
  });
}

Audio.prototype.pause = function(callback) {
  var err;
  var ret = hw.audio_pause_buffer();

  if (ret < 0) {
    if (callback) {
      callback(new Error("A buffer is not being played."));
    }
   return;
  }

  self.commandQueue.place(function() { 
    // If we have a lock on the spi bus
    if (this.lock) {
      // Release it
      this.lock.release(function(err) {
        // Call the callback if we have one
        if (callback) {
          callback(err);
        }
        self.commandQueue.next();
        return;
      });
    }
    // If there is no lock, just call the callback
    else {
      if (callback) {
        callback(err);
      }
      self.commandQueue.next();
    }
  });
}

Audio.prototype.stop = function(callback) {
  var err;
  var ret = hw.audio_stop_buffer();

  if (ret < 0) {
    err = new Error("Not in a valid state to call stop.");
  }

  // If we have a lock on the spi bus
  self.commandQueue.place(function() { 
    if (this.lock) {
      // Release it
      this.lock.release(function(err) {
        // Call the callback if we have one
        if (callback) {
          callback(err);
        }
        self.commandQueue.next();
        return;
      });
    }
    // If there is no lock, just call the callback
    else {
      if (callback) {
        callback(err);
      }
      self.commandQueue.next();
    }
  });
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
    return;
  }

  self.commandQueue.place(function() { 

    // Initialize SPI to the correct settings
    self.spi.initialize();

    var pluginDir = __dirname + "/plugins/" + profile + ".img";

    var ret = hw.audio_start_recording(self.MP3_XCS.pin, self.MP3_DREQ.pin, pluginDir, _fillBuff);

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

      return;
    }

    else {
      if (callback) {
        callback();
      }

      self.emit('startRecording');
    }

    self.commandQueue.next();
  });
}


Audio.prototype.stopRecording = function(callback) {
  var self = this;

  self.commandQueue.place(function() { 

    var ret = hw.audio_stop_recording();

    if (ret < 0) {
      var err = new Error("Not in valid state to stop recording.");

      if (callback) {
        callback(err);
      }
    }
    else {

      function recStopped(length) {

        process.unref();

        // If a callback was provided, return it
        if (callback) {
          callback();
        }
        // Stop recording
        self.emit('stopRecording');
      }

      process.once('audio_recording_complete', recStopped);

      process.ref();
    }
    self.commandQueue.next();
  });
}

exports.use = use;
