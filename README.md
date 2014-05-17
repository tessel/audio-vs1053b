#Audio Module

##Installation

```npm install audio-vs1053b```

##Example
1. Writing mic data to a file (w/out streams)
```.js
var tessel = require('tessel');
var fs = require('fs');
var audio = require('audio-vs1053b').use(tessel.port('a'), function(err) {
  
  // Start recording data for a second into a file
  audio.setInput('microphone', function(err) {
    
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
  audio.setInput('microphone', function(err) {
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

// Set the input to either 'lineIn' or 'microphone'. Defaults to 'lineIn'.
audio.setInput( input, function(err) {...} );

// Set the output to either 'lineOut' or 'headPhones'. Defaults to 'lineOut'.
audio.setOutput(output, function(err) {...} );

// Start recording sound from the input. (Receive data in the 'data' event)
audio.startRecording( function(err) {...} );

// Stop recording sound
audio.stopRecording( function(err) {...} );

// Play a buffer. If no buffer is passed in, the module
// will attempt to resume a buffer that was paused.
audio.play( [audioBuff], function(err) {...} );

// Pause the buffer
audio.pause( function(err) {...} );

// Stop playing and flush the buffer
audio.stop( function(err) {...} );

// Returns a stream that a buffer can be piped into to play audio
audio.createWriteableStream();

// Returns a readable stream of mic data
audio.createReadableStream()

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
audio.on('play', function() {...} );

// The buffer was paused
audio.on('pause', function() {...} );

// The buffer was stopped
audio.on('stop', function() {...} );

// The buffer finished playing
audio.on('finish', function(err) {...})

```