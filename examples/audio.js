// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

/*********************************************
This Audio Module demo sets volume, then plays
an audio file out over Headphones/Line out
*********************************************/

var tessel = require('tessel');
var fs = require('fs');
var audio = require('../').use(tessel.port('a'));

console.log('trying to connect...');
audio.on('ready', function() {
  console.log("Ready to go!");
  audio.setVolume(20, 20, function(err) {
    if (err) return console.log('err setting volume', err);
    var song = fs.readFileSync('/app/sample.mp3');
    audio.play(song, function(err) {
      if (err) {
        console.log("error playing song: ", err);
      }
      else {
        console.log("Done playing the first song");
      }
    });
  });
});

audio.on('error', function(err) {
  console.log("Failed to connect", err);
});
