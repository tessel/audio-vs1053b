// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

/*********************************************
This Audio Module demo will record audio through
the mic while the CONFIG button is held down.
When the CONFIG button is released, the recorded
audio will be played back through the audio
out jack.
*********************************************/

var tessel = require('tessel');
var audio = require('../').use(tessel.port['A']); // Replace '../' with 'audio-vs1053b' in your own code

var chunks = [];

// When we get data, throw it in our array
audio.on('data', chunks.push.bind(chunks));

// Wait for the module to connect
audio.on('ready', function() {
  console.log('Hold the config button to record...');
  // When the config button is pressed, start recording
  tessel.button.once('press', audio.startRecording.bind(audio, 'voice', null));

  // When the config button is released
  tessel.button.on('release', function() {
    console.log('stopping recording');
    // Stop recording
    audio.stopRecording(function() {
      console.log('Playing it back...');
      // Concat the data and play it
      audio.play(Buffer.concat(chunks), function(err) {
        // When we're done playing, clear recordings
        chunks = [];
        console.log('Hold the config button to record...');
        // Wait for a button press again
        tessel.button.once('press', audio.startRecording.bind(audio, 'voice', null));
      });
    });
  })
});


// If there is an error, report it
audio.on('error', function(err) {
  throw err;
});
