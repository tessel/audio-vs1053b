#Audio
Driver for the audio-vs1053b Tessel audio module

##Installation
```sh
npm install audio-vs1053b
```

##Limitations
The current version of the Tessel runtime is too slow to play audio files smoothly. That means we wrote a custom C shim that handles most of the playback and recording of data. There are several consequences of the C shim:

* Any other modules that use SPI for communication will be blocked while the Audio Module is playing a buffer.
* You can only have one Audio Module attached to Tessel at a time.
* Updates to the Audio Module driver must be released in both firmware and this npm repo.

It sucks but we're expecting major runtime speed improvements to render the C shim unnecessary within the next couple of months.


##Example
```.js
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
```

##Methods

##### * `audio.setVolume(level, callback(err))` Set the output volume. Level is a Number from 0.0 to 1.0

##### * `audio.setInput(input, callback(err))` Set the input to either 'lineIn' or 'mic'. Defaults to 'lineIn'.

##### * `audio.setOutput(output, callback(err))` Set the output to either 'lineOut' or 'headPhones'. Defaults to 'lineOut'.

##### * `audio.startRecording([profile] callback(err))` Start recording sound from the input. (Receive data in the 'data' event) Callback called after recording initialized (not stopped). quality is an optional argument that can be 'voice', 'wideband-voice', 'wideband-stereo', 'hifi-voice', or 'stereo-music'. Default is 'hifi-voice'.

##### * `audio.stopRecording(callback(err))` Stop recording sound (note that may receive one more 'data' event before this completes when the buffer is flushed.)

##### * `audio.play([audioBuff], callback(err))` Play a buffer. If no buffer is passed in, the module will attempt to resume a buffer that was paused.

##### * `audio.pause(callback(err))` Pause the buffer

##### * `audio.stop(callback(err))` Stop playing and flush the buffer

##### * `audio.createPlayStream()` Returns a stream that a buffer can be piped into to play audio

##### * `audio.createRecordStream()` Returns a readable stream of mic data

##### * `audio.availableRecordingProfiles()` Returns an array of available profiles


##Events

##### * `audio.on('ready', callback())` The audio module is ready to use

##### * `audio.on('error', callback(err))` The audio module had an error on connection

##### * `audio.on('volume', callback(volume))` Volume was set

##### * `audio.on('input', callback(input))` The input mode was set

##### * `audio.on('output', callback(output))` The output mode was set

##### * `audio.on('startRecording', callback())` Started recording from the input

##### * `audio.on('data', callback(audioBuff))` Received recorded data

##### * `audio.on('stopRecording', callback())` Stopped recording on the input

##### * `audio.on('play', callback())` A buffer is beginning to be played

##### * `audio.on('pause', callback())` Playback was paused

##### * `audio.on('stop', callback())` Playback was stopped

##### * `audio.on('end', callback(err)` The buffer finished playing


##Further Examples
See the examples folder for code.

* audio-out-no-streams: Listen to audio without using streams.

* record-sound: Record sound from the microphone without using streams.

* stream-audio-out: Stream audio from a file to Headphones/Line out

* stream-sound-to-file: Stream audio input from line in to a file.


##License

MIT
APACHE
