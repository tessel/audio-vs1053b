// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

/*********************************************
This Audio Module demo sends audio from the
microphone to a file without using streams.
*********************************************/

var tessel = require('tessel');
var fs = require('fs');
var audio = require('../').use(tessel.port['A']); // Replace '../' with 'audio-vs1053b' in your own code

audio.on('ready', function () {
  // Start recording data for a second into a file
  audio.setInput('mic', function(err) {

    var chunks = [];

    audio.on('data', function(data) {
      chunks.push(data);
    });

    // Start the recording
    audio.startRecording(function(err) {
      // In one second
      setTimeout(function() {
        // Stop recording
        audio.stopRecording(function(err) {
          // Write the buffer to a file
          fs.writeFile("micdata", Buffer.concat(chunks), function(err) {
            console.log("Wrote to a file");
          });
        });
      }, 1000);
    });
  });
});
