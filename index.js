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

// VS10xx Reset Command
var MODE_SM_RESET = 0x04;

// VS10xx GPIO Register adddresses
var GPIO_DIR_ADDR = 0xC017
  , GPIO_READ_ADDR = 0xC018
  , GPIO_SET_ADDR = 0xC019;

// VS10xx GPIO for i/o
var inputReg = 0x05,
    outputReg = 0x07;

// Datastructure for storing pending buffers and their allbacks
var _audioCallbacks = {};
// A double buffer for recording data
var _fillBuff = new Buffer(25000);
_fillBuff.fill(0);

// The SPI bus clock speed
var SPIClockSpeed = 4000000;

/*
 * Both use() and Audio() initialize the audio module with a specific piece of hardware.  
 * use() is a common API wrapper around object construction for Tessel modules. Arguments:
 *
 *    hardware       The hardware the module is connected to (Tessel Port)
 *
 *    callback       A callback to be called when initialization completes. Upon
 *                   success, callback is invoked as callback(null, audio),
 *                   where `audio` is an Audio module object.  Upon failure,
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for several reasons:
 *
 *    Error          Created when Tessel cannot communicate with the module or
 *                   it receives a response that doesn't match with what was expected.
 *
 */
function use (hardware, callback) {
  return new Audio(hardware, callback);
}

function Audio(hardware, callback) {
  var self = this;
  // Set the spi port
  self.spi = new hardware.SPI({
    clockSpeed: 1000000,
    dataMode: 0
  });

  // Create a new queue to store commands
  self.commandQueue = new queue();

  // Set our register select pins
  self.MP3_XCS = hardware.digital[0].output(true); //Control Chip Select Pin (for accessing SPI Control/Status registers)
  self.MP3_DCS = hardware.digital[1].output(true); //Data Chip Select / BSYNC Pin
  self.MP3_DREQ = hardware.digital[2].input() //Data Request Pin: Player asks for more data

  // Initializing state variables
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

/*
 * Reset the Audio module and set it into a known, default state
 *
 *    callback       A callback to be called when initialization completes. Upon
 *                   success, callback is invoked as callback(null, audio),
 *                   where `audio` is an Audio module object.  Upon failure,
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for several reasons:
 *
 *    Error          Created when Tessel cannot communicate with the module or
 *                   it receives a response that doesn't match with what was expected.
 *
 */
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

/*
 * (Internal Function) The callback for the event when a stream finishes playing.
 * This method is responsible for calling any callbacks associated with a given stream's
 * completion and releasing the SPI lock if there are no more active streams.
 *
 *    errBool           An indicator of whether there was an error with playback.
 *
 *    completedStream   The track id of the buffer that just completed. This is the key
 *                      stored in the callbacks datastructure for fetching the track information.
 *
 */
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


/*
 * (Internal Function) The callback for when a buffer of recorded data is returned from the C shim.
 * This function is called repeatedly as a recording is made.
 *
 *    length       The number of bytes that that were recorded. 
 *
 */
Audio.prototype._handleRecordedData = function(length) {
  // Copy the recorded data into a new buff for consumption
  var cp = new Buffer(length);
  _fillBuff.copy(cp, 0, 0, length);
  this.emit('data', cp);
}


/*
 * (Internal Function) A helper function to simplify error handling. It checks if an error occured, 
 * calls a callback if one was provided, or emits an error event. 
 *
 *    hardware       The hardware the module is connected to (Tessel Port)
 *
 *    callback       A callback to be called when initialization completes.
 *
 * This function returns a boolean that indicates whether an error was handled (value of true).
 */
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

/*
 * Opens up a writable stream which gets piped to the C shim for playback. Internally,
 * it calls the queue method repeatedly. It continues concatenating piped data until
 * the buffer is equal or greater than 10k bytes to ensure smooth playback.
 */
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


/*
 * Opens up a readable stream where recording data will be emitted on an interval. Arguments:
 *
 *    profile        A string that indicates with recording profile will be used. 
 *                   The recording profile determines the sound quality. Available sound
 *                   qualities can be found by calling availableRecordingProfiles()
 */
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

/*
 * (Internal Function) Performs a soft reset of the Audio module. Arguments:
 *
 *    callback       A callback to be called when resetting completes. Upon
 *                   success, callback is invoked as callback(null). Upon failure,
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
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


/*
 * (Internal Function) Requests the chip version from the Audio Module to 
 * confirm working communication and valid module. Arguments:
 *
 *    callback       A callback to be called when checking completes. Upon
 *                   success, callback is invoked as callback(null). Upon failure,
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. It 
 *                   can also fail if the returned version is not what was expected.  
 */
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

/*
 * (Internal Function) Sets the VS1053B clock speed. Arguments:
 *
 *    callback       A callback to be called when setting completes. Upon
 *                   success, callback is invoked as callback(null). Upon failure,
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype._setClockSpeeds = function(callback) {
  // Set multiplier to 3.0x
  this._writeSciRegister16(SCI_CLOCKF, 0x6000, function(err) {
    if (err) { return callback && callback(err); }
    else {
      this.spi.setClockSpeed(SPIClockSpeed);
      return callback && callback();
    }
  }.bind(this));

}

/*
 * (Internal Function) Transfer a single byte over SPI to the VS1053b. Arguments:
 *
 *    byte           The byte value to be transferred.
 *
 *    callback       A callback to be called when sending completes. Upon
 *                   success, callback is invoked as callback(null). Upon failure,
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype._SPItransferByte = function(byte, callback) {
  this._SPItransferArray([byte], function(err, ret) {
    callback && callback(err, ret[0]);
  });
}

/*
 * (Internal Function) Transfer an array of bytes over SPI to the vs1053b
 * Arguments:
 *
 *    array          An array of bytes to be sent over spi
 *
 *    callback       A callback to be called when setting completes. Upon
 *                   success, callback is invoked as callback(null). Upon failure,
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype._SPItransferArray = function(array, callback) {
  this.spi.transfer(new Buffer(array), function(err, ret) {
    return callback && callback(err, ret);
  });
}

/*
 * (Internal Function) Read the 16-bit value of a VS10xx register
 * Arguments:
 *
 *    addressbyte    The address of the register to read
 *
 *    callback       A callback to be called when setting completes. Upon
 *                   success, callback is invoked as callback(data) where data
 *                   is a 16-bit word. Upon failure, callback is invoked as 
 *                   callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
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

/*
 * (Internal Function) Write two 8-bit values value to a VS10xx register
 * Arguments:
 *
 *    addressbyte    The address of the register to write to
 *
 *    highbyte       The high 8-bit value to write
 *
 *    lowbyte        The low 8-bit value to write
 *
 *    callback       A callback to be called when setting completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
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

/*
 * (Internal Function) Write a 16-bit value to a VS10xx register
 * Arguments:
 *
 *    addressbyte    The address of the register to write to
 *
 *    word           The 16-bit word to write to the register
 *
 *    callback       A callback to be called when setting completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype._writeSciRegister16 = function(addressbyte, word, callback) {
  this._writeSciRegister(addressbyte, (word >> 8) & 0xFF, word & 0xFF, callback);
}

/*
 * (Internal Function) Sets the direction of the VS1053b GPIOs. Arguments:
 *
 *    arg            The value of the direction register that will be written.
 *                   GPIOs to be used as outputs should have a 1 in the x bit
 *                   position where x is the GPIO number.
 *
 *    callback       A callback to be called when setting completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype._setChipGpioDir = function(arg, callback) {
  this._writeSciRegister16(SCI_WRAMADDR, GPIO_DIR_ADDR, function(err) {
    if (err) { return callback && callback(err); }
    else {
      this._writeSciRegister16(SCI_WRAM, arg, callback);
    }
  }.bind(this));
}

/*
 * (Internal Function) Sets the state of the VS1053b GPIO pins. Arguments:
 *
 *    arg            The value of the state register that will be written.
 *                   GPIOs to be set high should have a 1 in the x bit
 *                   position where x is the GPIO number.
 *
 *    callback       A callback to be called when setting completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype._setChipGpio = function(arg, callback) {
  this._writeSciRegister16(SCI_WRAMADDR, GPIO_SET_ADDR, function(err) {
    this._writeSciRegister16(SCI_WRAM, arg, callback);
  }.bind(this));
}

/*
 * (Internal Function) Get the direction of each of the VS1053b GPIO pins. Arguments:
 *
 *    callback       A callback to be called when getting completes. Upon
 *                   success, callback is invoked as callback(state) where
 *                   state is a 16-bit word. The state can be interpreted
 *                   as GPIO outputs having a 1 in their bit position. Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype._getChipGpioDir = function(callback) {
  this._getChipGPIOValue(GPIO_DIR_ADDR, callback);
}

/*
 * (Internal Function) Get the state of each of the VS1053b GPIO pins. Arguments:
 *
 *    callback       A callback to be called when getting completes. Upon
 *                   success, callback is invoked as callback(state) where
 *                   state is a 16-bit word. The state can be interpreted
 *                   as high GPIOs having a 1 in their bit position. Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype._getChipGpio = function(callback) {
  this._getChipGPIOValueFromAddr(GPIO_READ_ADDR, callback);
}

/*
 * (Internal Function) A helper function that fetches the value of a GPIO address. Arguments:
 *
 *    gpioValue      The Address of the GPIO bank to read
 *
 *    callback       A callback to be called when getting completes. Upon
 *                   success, callback is invoked as callback(state) where
 *                   state is a 16-bit word. The state can be interpreted
 *                   as high GPIOs having a 1 in their bit position. Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
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

/*
 * (Internal Function) In order to switch between different Audio inputs and outputs
 * GPIOs on board the VS1053b are used. GPIO 5 toggles between different inputs
 * and GPIO 7 toggles between different outputs. This function sets them both as
 * outputs which is required for setting them high or low (thus, toggling state).
 * Arguments:
 *
 *    callback       A callback to be called when getting completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype._enableAudioOutput = function(callback) {
  this._setChipGpioDir((1 << 7) + (1 << 5), callback);
}

/*
 * Sets the default input/output arrangements for the module. Arguments:
 *
 *    callback       A callback to be called when getting completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
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


/*
 * Sets the output volume for the Module. Arguments:
 *
 *    leftchannel    A float that indicates the level of sound from the left audio.
 *                   channel. Can between 0 and 1, where 1 is the louded possible value.
 *
 *    rightchannel   [Optional] A float that indicates the level of sound from the left audio.
 *                   channel. Can between 0 and 1, where 1 is the louded possible value.
 *                   If this argument is omitted, the leftchannel value will be used.
 *
 *    callback       A callback to be called when getting completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 */
Audio.prototype.setVolume = function(leftChannel, rightChannel, callback) {
  var self = this;

  self.commandQueue.place(function() {

    if(typeof leftChannel !== 'number'){ // if no volume provided
      return (!typeof leftChannel === 'function') || leftChannel(); // call callback if provided
    }

    leftChannel = self._normalizeVolume(leftChannel);

    if(typeof rightChannel !== 'number') {
      if(typeof rightChannel === 'function') {
        callback = rightChannel;
      }
      rightChannel = leftChannel; // set right channel = left channel
    } else {
      rightChannel = self._normalizeVolume(rightChannel);
    }
    // Set VS10xx Volume Register
    self._writeSciRegister(SCI_VOL, leftChannel, rightChannel, callback);
    setImmediate(self.commandQueue.next.bind(self));
  });
}

/*
 * (Internal Function) Converts user input from setVolume into a decibel level
 * that the VS1053b expects. Arguments:
 *
 *    vol    A float from 0-1 that indicates the level of sound.
 *
 */
Audio.prototype._normalizeVolume = function(vol){
  vol = (vol > 1) ? 1 : (vol < 0) ? 0 : vol; // make sure val is in the range 0-1.
  return Math.round((1 - vol) * 0xFE); // 0xFE = min sound level before completely off (0xFF)
}

/*
 * Toggles between line in and the oboard microphone as a recording input. Arguments:
 *
 *    input          A string that is either `mic` or `lineIn`.
 *
 *    callback       A callback to be called when getting completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 *                   It may also be created if the provided input is invalid.
 */
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

/*
 * Toggles between line out and headphones as the output signal. Arguments:
 *
 *    output         A string that is either `headphones` or `lineOut`.
 *
 *    callback       A callback to be called when getting completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for one primary reasons:
 *
 *    Error          Created when the SPI bus is unable or fails to transceive data. 
 *                   It may also be created if the provided input is invalid.
 */
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

/*
 * A helper class to keep track of the state of a provided buffer
 *
 *    _buflen        The length of a buffer
 *
 *    id             The generated ID that is used to distinguish the track from others
 *
 *    callback       A callback to be called when track playback completes
 */
function Track(length, id, callback) {
  this._buflen = length;
  this.id = id;
  this.callback = callback;
}

util.inherits(Track, events.EventEmitter);

/*
 * Stops any currently playing tracks and places a new track at the beginning of the queue.
 * Playback will start immediately. Arguments:
 *
 *    buff           A sound Buffer in a format that is supported by the VS1053b
 *
 *    callback       A callback to be called when playback completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for a number of reasons:
 *
 *    Error          Could be returned if the Audio module can't obtain a lock
 *                   on the SPI bus. It could be returned if the module is currently
 *                   recording. It could be returned if all GPIO interrupts are
 *                   being used elsewhere. It could be returned if there is no more
 *                   available RAM memory for streaming.
 */
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

/*
 * (Internal Function) Checks the callback of the queue or play command for error and 
 * places the created track onto the callbacks datastructure so their callback can
 * be called upon completion. Arguments:
 *
 *    track          A Track Object created with a sound buffer
 */
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

/*
 * Places a sound buffer at the end of the queue. Any currently playing tracks will continue. 
 * Arguments:
 *
 *    buff           A sound Buffer in a format that is supported by the VS1053b
 *
 *    callback       A callback to be called when queueing completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for a number of reasons:
 *
 *    Error          Could be returned if the Audio module can't obtain a lock
 *                   on the SPI bus. It could be returned if the module is currently
 *                   recording. It could be returned if all GPIO interrupts are
 *                   being used elsewhere. It could be returned if there is no more
 *                   available RAM memory for streaming.
 */
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

/*
 * Pauses playback of the first sound buffer in the queue. Can be continued with resume().
 * Arguments
 *
 *    callback       A callback to be called when pausing completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for a number of reasons:
 *
 *    Error          Could be returned if the Audio module can't obtain a lock
 *                   on the SPI bus. It could be returned if the module is currently
 *                   recording.
 */
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

/*
 * Stops the playback of an audio buffer and clears the queue. 
 *
 *    callback       A callback to be called when stopping completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for a number of reasons:
 *
 *    Error          Could be returned if the Audio module can't obtain a lock
 *                   on the SPI bus. It could be returned if the module is currently
 *                   recording.
 */
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

/*
 * Returns an array of the available recording profiles that can be provided to
 * startRecording().  
 * 
 */
Audio.prototype.availableRecordingProfiles = function() {
  return [
          'voice',
          'wideband-voice',
          'wideband-stereo',
          'hifi-voice',
          'stereo-music'
          ];
}

/*
 * Start recording sound through the input. Data can be collected with the `data
 * event.
 *
 *    profile        The recording profile to use (sets the sound quality). By
 *                   default, the best voice recording profile is used.
 *
 *    callback       A callback to be called when recording starts. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for a number of reasons:
 *
 *    Error          Could be returned if memory for the incoming sound data
 *                   couldn't be allocated. An error could be returned if an invalid
 *                   recording profile name is passed in. Or an error could be returned
 *                   if the module is in playback mode.
 */
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

/*
 * Stop recording sound through the input.
 *
 *    callback       A callback to be called when recording completes. Upon
 *                   success, callback is invoked as callback(). Upon failure,  
 *                   callback is invoked as callback(err) instead.
 *
 * This function may fail for a number of reasons:
 *
 *    Error          Could be returned if the module is not in a valid state
 *                   to stop recording (like if it's currently playing audio).
 */
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
