var test = require('tinytap');
var async = require('async');
var tessel = require('tessel');
var fs = require('fs');
var portName = process.argv[2] || 'A';
var audioLib = require('../');
var audio;

test.count(29);

async.series([
  // Test Connecting
  test("Connecting to audio module", function(t) {
    audio = audioLib.use(tessel.port[portName], function(err, audio) {
      t.ok(audio, 'The audio module object was not returned');
      t.equal(err, undefined, 'There was an error connecting');
      t.end();
    });
  }),

  // Test Volume, single arg
  test("Changing the volume with single volume arg", function(t) {
    var testValue = .9;
    audio.setVolume(testValue, function(err) {
      t.equal(err, undefined, "error changing volume");

      // Read the volume register
      audio._readSciRegister16(0x0B, function(err, value) {
        t.equal(audio._normalizeVolume(testValue), (value >> 8), 'left channel volume not set correctly');
        t.equal(audio._normalizeVolume(testValue), (value & 0xFF), 'right channel volume not set correctly');
        t.end();
      });
    });
  }),

  // Test Volume, multiple args
  test("Changing the volume with both volume args", function(t) {
    var testValueLeft = .9;
    var testValueRight = .8;
    audio.setVolume(testValueLeft, testValueRight, function(err) {
      t.equal(err, undefined, "error changing volume");

      // Read the volume register
      audio._readSciRegister16(0x0B, function(err, value) {
        t.equal(audio._normalizeVolume(testValueLeft), (value >> 8), 'left channel volume not set correctly');
        t.equal(audio._normalizeVolume(testValueRight), (value & 0xFF), 'right channel volume not set correctly');
        t.end();
      });
    });
  }),

  // Input, lineIn
  test("Setting the input to lineIn", function(t) {
    audio.setInput('lineIn', function(err) {
      t.equal(err, undefined, 'error setting input');
      audio._getChipGpio(function(err, gpio) {
        t.equal(err, undefined, 'error checking gpio status on input change');
        t.ok(gpio & (1 << 5), 'correct input set in gpio register');
        t.end();
      });
    });
  }),


  // Input, mic
  test("Setting the input to mic", function(t) {
    audio.setInput('mic', function(err) {
      t.equal(err, undefined, 'error setting input');
      audio._getChipGpio(function(err, gpio) {
        t.equal(err, undefined, 'error checking gpio status on input change');
        t.ok(!(gpio & (1 << 5)), 'correct input set in gpio register');
        t.end();
      });
    });
  }),

  // Input, invalid
  test("Setting invalid input", function(t) {
    audio.setInput('shutit', function(err) {
      t.ok(err, 'error setting input');
      t.end();
    });
  }),

  // Output, lineOut
  test("Setting the output to lineOut", function(t) {
    audio.setOutput('lineOut', function(err) {
      t.equal(err, undefined, 'error setting input');
      audio._getChipGpio(function(err, gpio) {
        t.equal(err, undefined, 'error checking gpio status on input change');
        t.ok(gpio & (1 << 7), 'correct lineOut input set in gpio register');
        t.end();
      });
    });
  }),

  // Output, headphones
  test("Setting the output to headphones", function(t) {
    audio.setOutput('headphones', function(err) {
      t.equal(err, undefined, 'error setting input');
      audio._getChipGpio(function(err, gpio) {
        t.equal(err, undefined, 'error checking gpio status on input change');
        t.ok(!(gpio & (1 << 7)), 'correct headphones input set in gpio register');
        t.end();
      });
    });
  }),

  // Output, invalid
  test("Setting the output to headphones", function(t) {
    audio.setOutput('notathing', function(err) {
      t.ok(err, 'error setting input');
      t.end();
    });
  }),

  test('stopping non-existant recording', function(t) {
    audio.stopRecording(function(err) {
      t.ok(err, 'no error was thrown when stopping a recording that wasn\'t started');
      t.end();
    });
  }),

  test('stopping non-existant recording again', function(t) {
    audio.stopRecording(function(err) {
      t.ok(err, 'no error was thrown when stopping a recording that wasn\'t started');
      t.end();
    });
  }),

  test('starting recording and checking data event', function(t) {

    var timeout;
    var finished;
    var i = 0;

    audio.on('data', function(data) {
      i++;
      // Once we get four data events
      if (i > 4) {

        // Clear the
        clearTimeout(timeout);
        audio.removeAllListeners('data');

        finished = true;

        t.ok(data, 'data was invalid on recording event');
        t.ok(data.length > 0, 'no data was returned on recording');

        audio.once('stopRecording', function(err) {
          t.end();
        });

        audio.stopRecording(function(err) {
          t.equal(err, undefined, 'error stopping recording');
        });
      }
    });

    audio.startRecording(function(err) {
      if (!finished) {
        timeout = setTimeout(function() {
          t.fail();
        }, 10000);
      }
    });
  }),

  test('recording to the file system', function(t) {
    var file = fs.createWriteStream('recordingData.ogg');
    // Create a readable stream of incoming data
    var soundData = audio.createRecordStream();
    // Pipe data to the file
    soundData.pipe(file);
    // Stop recording after 2 seconds
    setTimeout(function stopRecording() {

      audio.stopRecording(function stopped(err) {
        t.equal(err, undefined, 'there was an error stopping recording to the file system');
        t.end();
      });
    }, 2000);
  }),

  test('playing a static audio file', function(t) {
    // Open a file
    var audioFile = fs.readFileSync('sample.mp3');
    var timeout;

    // Play the file
    audio.play(audioFile, function(err) {
      clearTimeout(timeout);
      t.equal(err, undefined, 'Error playing audio file.');
      t.end();
    });

    timeout = setTimeout(function noCallback() {
      t.fail('Callback of play not called.');
    }, 10000);
  }),

  test('streaming an audio file from the flash system', function(t) {
    var playStream = audio.createPlayStream();
    var timeout;

    playStream.on('end', function() {
      clearTimeout(timeout);
      t.end();
    });

    fs.createReadStream('sample.mp3').pipe(playStream);

    timeout = setTimeout(function noCallback() {
      t.fail('End event of play stream not called.');
    }, 10000);
  }),

  ], function(err) {
    console.log('error running tests', err);
  }
);
