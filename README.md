#Audio Module

##Installation

```npm install audio-vs1053b```

## Limitations
The current version of the Tessel runtime is too slow to play audio files smoothly. That means we wrote a custom C shim that handles most of the playback and recording of data. There are several consequences of the C shim:

* Any other modules that use SPI for communication will be blocked while the audio module is playing a buffer.
* You can only have one audio module attached to Tessel at a time. 
* Updates to the Audio Module driver must be released in both firmware and this npm repo.

It sucks but we're expecting major runtime speed improvements to render the C shim uncessesary within the next couple months.


##Example
1. Writing mic data to a file (w/out streams)
```.js
var tessel = require('tessel');
var fs = require('fs');
var audio = require('audio-vs1053b').use(tessel.port('a'), function(err) {
  
  // Start recording data for a second into a file
  audio.setInput('mic', function(err) {
    
    // Start the recording
    audio.startRecording(function(err) {
      // In one second
      setTimeout(function() {
        // Stop recording
        audio.stopRecording(function(err, oggBuffer) {
          // Write the buffer to a file
          fs.writeFile("micdata", oggBuffer, function(err) {
            console.log("Wrote to a file");
          });
        })
      }, 1000);
    });
  });
});
```

2. Writing line-in to a file (w/ streams)
```.js
var tessel = require('tessel');
var fs = require('fs');
var audio = require('audio-vs1053b').use(tessel.port('a'), function(err) {
  
  // Start recording data for a second into a file
  audio.setInput('mic', function(err) {
    // Open a stream to a file
    var file = fs.createWriteStream('lineInData.ogg');
    // Create a readable stream of incoming data
    var soundData = audio.createReadStream();
    // Pipe data to the file
    soundData.pipe(file);
  
    // Enable sound input
    audio.startRecording();
  });
});

```
3. Output audio on the headphone Jack
```.js
var tessel = require('tessel');
var fs = require('fs');
var audio = require('audio-vs1053b').use(tessel.port('a'), function(err) {
  
  // Start recording data for a second into a file
  audio.setOutput('headphone', function(err) {
    // Open a file
    var audioFile = fs.readFileSync('Oops... I did it again.mp3');
    // Play the file
    audio.play(audioFile);
  });
});

```

##API

###Commands

```.js
// Set the output volume. Level is a Number from 0.0 to 1.0
audio.setVolume( level, function(err) {...} );

// Set the input to either 'lineIn' or 'mic'. Defaults to 'lineIn'.
audio.setInput( input, function(err) {...} );

// Set the output to either 'lineOut' or 'headPhones'. Defaults to 'lineOut'.
audio.setOutput(output, function(err) {...} );

// Start recording sound from the input. (Receive data in the 'data' event) Callback called after recording initialized (not stopped.)
quality is an optional argument that can be 'voice', 'wideband-voice', 'wideband-stereo', 'hifi-voice', or 'stereo-music'. Default is 'hifi-voice'.
audio.startRecording([profile] function(err) {...} );

// Stop recording sound (note that may receive one more 'data' event before this completes when the buffer is flushed.)
audio.stopRecording( function(err) {...} );

// Play a buffer. If no buffer is passed in, the module
// will attempt to resume a buffer that was paused.
audio.play( [audioBuff], function(err) {...} );

// Pause the buffer
audio.pause( function(err) {...} );

// Stop playing and flush the buffer
audio.stop( function(err) {...} );

// Returns a stream that a buffer can be piped into to play audio
audio.createPlayStream();

// Returns a readable stream of mic data
audio.createRecordStream()

// Returns an array of available profiles
audio.availableRecordingProfiles();

```

###Events

```.js

// The audio module is ready to use 
audio.on( 'ready', function() {...} );

// The audio module had an error on connection
audio.on( 'error', function(err) {...} );

// Volume was set
audio.on( 'volume', function(volume) {...} );

// The input mode was set
audio.on('input', function(input) {...} );

// The output mode was set
audio.on('output', function(output) {...} );

// Started recording from the input
audio.on('startRecording', function() {...} );

// Received recorded data
audio.on('data', function(audioBuff) {...} );

// Stopped recording on the input
audio.on('stopRecording', function() {...} );

// A buffer is beginning to be played
// Returns a streamID
audio.on('play', function() {...} );

audio.on('played', function(streamID) {...})

// Playback was paused
audio.on('pause', function() {...} );

// Playback was stopped
audio.on('stop', function() {...} );

// The buffer finished playing
audio.on('finish', function(err) {...})

```