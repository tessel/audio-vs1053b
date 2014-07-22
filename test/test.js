var test = require('tinytap');
var async = require('async');
var tessel = require('tessel');
var portname = process.argv[2] || 'A';
var audioLib = require('../');
var audio;

console.log('test is', test);
async.series([
  // Test Connecting
  test("Connecting to audio module", function(t) {
    audio = audioLib.use(tessel.port[portname], function(err, audio) {
      t.ok(audio, 'The audio module object was not returned');
      t.equal(err, undefined, 'There was an error connecting');
      t.end();
    });
  }),

  // Test Volume, single arg
  test("Changing the volume with single volume arg", function(t) {
    var testValue = 10;
    audio.setVolume(testValue, function(err) {
      t.equal(err, undefined, "error changing volume");

      // Read the volume register
      audio._readSciRegister16(0x0B, function(err, value) {
        t.equal(testValue, ((value >> 8)/2), 'left channel volume not set correctly'); 
        t.equal(testValue, ((value & 0xFF)/2), 'right channel volume not set correctly'); 
        t.end();
      });
    });
  }),

  // Test Volume, multiple args
  test("Changing the volume with both volume args", function(t) {
    var testValueLeft = 10;
    var testValueRight = 20;
    audio.setVolume(testValueLeft, testValueRight, function(err) {
      t.equal(err, undefined, "error changing volume");

      // Read the volume register
      audio._readSciRegister16(0x0B, function(err, value) {
        t.equal(testValueLeft, ((value >> 8)/2), 'left channel volume not set correctly'); 
        t.equal(testValueRight, ((value & 0xFF)/2), 'right channel volume not set correctly'); 
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

  // test('stopping non-existant recording again', function(t) {
  //   console.log('before we stop recording.');
  //   audio.stopRecording(function(err) {
  //     console.log('just after calling it');
  //     t.ok(err, 'no error was thrown when stopping a recording that wasn\'t started');
  //     t.end();
  //   });
  // }),

//   test('starting recording and checking data event', function(t) {
//     console.log('wtf');
//     t.fail();
//     var interval;
//     var finished;
//     var i = 0;

//     console.log('setting up listener');
//     audio.once('data', function(data) {
//       i++;
//       console.log('got ', data);
//       if (i > 4) {
//         console.log('clearing');
//         clearInterval(interval);
//         finished = true;

//         t.ok(data, 'data was invalid on recording event');
//         t.ok(data.length > 0, 'no data was returned on recording');

//         audio.stopRecording(function(err) {
//           console.log('we got an error', err);
//           t.equal(err, undefined, 'error stopping recording');
//           t.end();
//         });
//       }
//     });

//     console.log('starting recording');
//     audio.startRecording(function(err) {
//       console.log('recording started');
//       if (!finished) {
//         interval = setTimeout(function() {
//           console.log('failing')
//           t.fail();
//         }, 20000);
//       }
//     });
//   }),

  ], function(err) {
    console.log('error running tests', err);
  }
);


