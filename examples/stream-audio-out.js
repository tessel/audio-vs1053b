// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

/*********************************************
This Audio Module demo sends audio from a file
to Headphones/Line out using streams.
*********************************************/

var tessel = require('tessel');
var fs = require('fs');
var audio = require('audio-vs1053b').use(tessel.port['A']);

audio.on('ready', function () {
  // Start recording data for a second into a file
  audio.setOutput('headphone', function(err) {
    // Open a file
    fs.createReadStream('rayman.ogg').pipe(audio.createPlayStream());
  });
});
