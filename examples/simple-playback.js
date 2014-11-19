// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

/*********************************************
This Audio Module demo sets volume, then plays
an audio file out over Headphones/Line out
*********************************************/

var tessel = require('tessel');
var fs = require('fs');
var audio = require('../').use(tessel.port['A']); // Replace '../' with 'audio-vs1053b' in your own code

var audioFile = 'sample.mp3';

// Wait for the module to connect
audio.on('ready', function() {
  console.log("Audio module connected! Setting volume...");
  // Set the volume in decibels. Around .8 is good; 80% max volume or -25db
  audio.setVolume(.8, function(err) {
    if (err) {
      return console.log(err);
    }
    // Get the song
    console.log('Retrieving file...');
    var song = fs.readFileSync(audioFile);
    // Play the song
    console.log('Playing ' + audioFile + '...');
    audio.play(song, function(err) {
      if (err) {
        console.log(err);
      } else {
        console.log('Done playing', audioFile);
      }
    });
  });
});

// If there is an error, report it
audio.on('error', function(err) {
  console.log(err);
});
