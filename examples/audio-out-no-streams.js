// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

/*********************************************
This Audio Module demo sends audio from a file
to Headphones/Line out without using streams.
*********************************************/

var tessel = require('tessel');
var fs = require('fs');
var audio = require('../').use(tessel.port['A']); // Replace '../' with 'audio-vs1053b' in your own code

audio.on('ready', function () {  // Start recording data for a second into a file
  audio.setOutput('headphones', function(err) {
    // Open a file
    var audioFile = fs.readFileSync('sample.mp3');
    // Play the file
    audio.play(audioFile);
  });
});
