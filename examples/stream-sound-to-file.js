// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

/*********************************************
This Audio Module demo takes line-in and
writes it to a file using streams.
*********************************************/

var tessel = require('tessel');
var fs = require('fs');
var audio = require('../').use(tessel.port['A']); // Replace '../' with 'audio-vs1053b' in your own code

audio.on('ready', function () {
  // Start recording data for a second into a file
  audio.setInput('lineIn', function(err) {
    // Open a stream to a file
    var file = fs.createWriteStream('lineInData.ogg');
    // Create a readable stream of incoming data
    var soundData = audio.createRecordStream();
    // Pipe data to the file
    soundData.pipe(file);
    // Stop recording after 2 seconds
    setTimeout(audio.stopRecording.bind(audio), 2000);
  });
});
