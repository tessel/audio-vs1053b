#Audio
Driver for the audio-vs1053b Tessel audio module. The hardware documentation for this module can be found [here](https://github.com/tessel/hardware/blob/master/modules-overview.md#audio).

If you run into any issues you can ask for support on the [Audio Module Forums](http://forums.tessel.io/category/audio).

###Installation
```sh
npm install audio-vs1053b
```

###Limitations
The current version of the Tessel runtime is too slow to play audio files smoothly. That means we wrote a custom C shim that handles most of the playback and recording of data. There are several consequences of the C shim:

* Any other modules that use SPI for communication will be blocked while the Audio Module is playing a buffer.
* You can only have one Audio Module attached to Tessel at a time.
* Updates to the Audio Module driver must be released in both firmware and this npm repo.

It sucks but we're expecting major runtime speed improvements to render the C shim unnecessary within the next couple of months.

###Development Status
Playback and recording to/from the local file system works well. Streams work less well. Interacting with the SDCard, Ambient, and IR doesn't work yet (issues with the SPI bus). This module is currently undergoing heavy development to fix those issues. Please file any bugs you find with this module.

###Example
```js
/*********************************************
This Audio Module demo sets volume, then plays
an audio file out over Headphones/Line out
*********************************************/

var tessel = require('tessel');
var fs = require('fs');
var audio = require('audio-vs1053b').use(tessel.port['A']);

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
```

###Methods

&#x20;<a href="#api-audio-setVolume-leftChannelDb-rightChannelDb-callback-err-Set-the-output-volume-Level-is-a-Number-from-0-0-to-1-0" name="api-audio-setVolume-leftChannelDb-rightChannelDb-callback-err-Set-the-output-volume-Level-is-a-Number-from-0-0-to-1-0">#</a> audio<b>.setVolume</b>( leftChannelDb, [rightChannelDb,] callback(err) )  
 Set the output volume. Level is a Number from 0.0 to 1.0 (-127dB to 0dB)

&#x20;<a href="#api-audio-setInput-input-callback-err-Set-the-input-to-either-lineIn-or-mic-Defaults-to-lineIn" name="api-audio-setInput-input-callback-err-Set-the-input-to-either-lineIn-or-mic-Defaults-to-lineIn">#</a> audio<b>.setInput</b>( input, callback(err) )  
 Set the input to either 'lineIn' or 'mic'. Defaults to 'lineIn'.  

&#x20;<a href="#api-audio-setOutput-output-callback-err-Set-the-output-to-either-lineOut-or-headPhones-Defaults-to-lineOut" name="api-audio-setOutput-output-callback-err-Set-the-output-to-either-lineOut-or-headPhones-Defaults-to-lineOut">#</a> audio<b>.setOutput</b>( output, callback(err) )  
 Set the output to either 'lineOut' or 'headphones'. Defaults to 'lineOut'.  

&#x20;<a href="#api-audio-startRecording-profile-callback-err-Start-recording-sound-from-the-input-Receive-data-in-the-data-event-Callback-called-after-recording-initialized-not-stopped-quality-is-an-optional-argument-that-can-be-voice-wideband-voice-wideband-stereo-hifi-voice-or-stereo-music-Default-is-hifi-voice" name="api-audio-startRecording-profile-callback-err-Start-recording-sound-from-the-input-Receive-data-in-the-data-event-Callback-called-after-recording-initialized-not-stopped-quality-is-an-optional-argument-that-can-be-voice-wideband-voice-wideband-stereo-hifi-voice-or-stereo-music-Default-is-hifi-voice">#</a> audio<b>.startRecording</b>( [profile] callback(err) )  
Start recording sound from the input. (Receive data in the 'data' event) Callback called after recording initialized (not stopped ) .quality is an optional argument that can be 'voice', 'wideband-voice', 'wideband-stereo', 'hifi-voice', or 'stereo-music'. Default is 'hifi-voice'.  

&#x20;<a href="#api-audio-stopRecording-callback-err-Stop-recording-sound-note-that-may-receive-one-more-data-event-before-this-completes-when-the-buffer-is-flushed" name="api-audio-stopRecording-callback-err-Stop-recording-sound-note-that-may-receive-one-more-data-event-before-this-completes-when-the-buffer-is-flushed">#</a> audio<b>.stopRecording</b>( callback(err) )  
Stop recording sound (note that may receive one more 'data' event before this completes when the buffer is flushed. )  

&#x20;<a href="#api-audio-play-audioBuff-callback-err-Play-a-buffer-If-no-buffer-is-passed-in-the-module-will-attempt-to-resume-a-buffer-that-was-paused" name="api-audio-play-audioBuff-callback-err-Play-a-buffer-If-no-buffer-is-passed-in-the-module-will-attempt-to-resume-a-buffer-that-was-paused">#</a> audio<b>.play</b>( [audioBuff], callback(err) )  
 Play a buffer. If no buffer is passed in, the module will attempt to resume a buffer that was paused.  

&#x20;<a href="#api-audio-pause-callback-err-Pause-the-buffer" name="api-audio-pause-callback-err-Pause-the-buffer">#</a> audio<b>.pause</b>( callback(err) )  
 Pause the buffer.  

&#x20;<a href="#api-audio-stop-callback-err-Stop-playing-and-flush-the-buffer" name="api-audio-stop-callback-err-Stop-playing-and-flush-the-buffer">#</a> audio<b>.stop</b>( callback(err) )  
 Stop playing and flush the buffer.  

&#x20;<a href="#api-audio-createPlayStream-Returns-a-stream-that-a-buffer-can-be-piped-into-to-play-audio" name="api-audio-createPlayStream-Returns-a-stream-that-a-buffer-can-be-piped-into-to-play-audio">#</a> audio<b>.createPlayStream</b>()  
 Returns a stream that a buffer can be piped into to play audio.  

&#x20;<a href="#api-audio-createRecordStream-Returns-a-readable-stream-of-mic-data" name="api-audio-createRecordStream-Returns-a-readable-stream-of-mic-data">#</a> audio<b>.createRecordStream</b>()  
 Returns a readable stream of mic data.  

&#x20;<a href="#api-audio-availableRecordingProfiles-Returns-an-array-of-available-profiles" name="api-audio-availableRecordingProfiles-Returns-an-array-of-available-profiles">#</a> audio<b>.availableRecordingProfiles</b>()  
 Returns an array of available profiles.  

###Events

&#x20;<a href="#api-audio-on-ready-callback-The-audio-module-is-ready-to-use" name="api-audio-on-ready-callback-The-audio-module-is-ready-to-use">#</a> audio<b>.on</b>( 'ready', callback() )  
 The audio module is ready to use.  

&#x20;<a href="#api-audio-on-error-callback-err-The-audio-module-had-an-error-on-connection" name="api-audio-on-error-callback-err-The-audio-module-had-an-error-on-connection">#</a> audio<b>.on</b>( 'error', callback(err) )  
 The audio module had an error on connection.  

&#x20;<a href="#api-audio-on-volume-callback-volume-Volume-was-set" name="api-audio-on-volume-callback-volume-Volume-was-set">#</a> audio<b>.on</b>( 'volume', callback(volume) )  
 Volume was set.  

&#x20;<a href="#api-audio-on-input-callback-input-The-input-mode-was-set" name="api-audio-on-input-callback-input-The-input-mode-was-set">#</a> audio<b>.on</b>( 'input', callback(input) )  
 The input mode was set.  

&#x20;<a href="#api-audio-on-output-callback-output-The-output-mode-was-set" name="api-audio-on-output-callback-output-The-output-mode-was-set">#</a> audio<b>.on</b>( 'output', callback(output) )  
 The output mode was set.  

&#x20;<a href="#api-audio-on-startRecording-callback-Started-recording-from-the-input" name="api-audio-on-startRecording-callback-Started-recording-from-the-input">#</a> audio<b>.on</b>( 'startRecording', callback() )  
 Started recording from the input.  

&#x20;<a href="#api-audio-on-data-callback-audioBuff-Received-recorded-data" name="api-audio-on-data-callback-audioBuff-Received-recorded-data">#</a> audio<b>.on</b>( 'data', callback(audioBuff) )  
 Received recorded data.  

&#x20;<a href="#api-audio-on-stopRecording-callback-Stopped-recording-on-the-input" name="api-audio-on-stopRecording-callback-Stopped-recording-on-the-input">#</a> audio<b>.on</b>( 'stopRecording', callback() )  
 Stopped recording on the input.  

&#x20;<a href="#api-audio-on-play-callback-A-buffer-is-beginning-to-be-played" name="api-audio-on-play-callback-A-buffer-is-beginning-to-be-played">#</a> audio<b>.on</b>( play', callback() )  
 A buffer is beginning to be played.  

&#x20;<a href="#api-audio-on-pause-callback-Playback-was-paused" name="api-audio-on-pause-callback-Playback-was-paused">#</a> audio<b>.on</b>( 'pause', callback() )  
 Playback was paused.  

&#x20;<a href="#api-audio-on-stop-callback-Playback-was-stopped" name="api-audio-on-stop-callback-Playback-was-stopped">#</a> audio<b>.on</b>( 'stop', callback() )  
 Playback was stopped.  

&#x20;<a href="#api-audio-on-end-callback-err-The-buffer-finished-playing" name="api-audio-on-end-callback-err-The-buffer-finished-playing">#</a> audio<b>.on</b>( 'end', callback(err) )  
 The buffer finished playing.  

###Further Examples
* [Audio Out No Streams](https://github.com/tessel/audio-vs1053b/blob/master/examples/audio-out-no-streams.js). This Audio Module demo sends audio from a file to Headphones/Line out without using streams..
* [Record Sound](https://github.com/tessel/audio-vs1053b/blob/master/examples/record-sound.js). This Audio Module demo sends audio from the microphone to a file without using streams.
* [Stream Audio Out](https://github.com/tessel/audio-vs1053b/blob/master/examples/stream-audio-out.js). This Audio Module demo sends audio from a file to Headphones/Line out using streams.
* [Stream Sound to File](https://github.com/tessel/audio-vs1053b/blob/master/examples/stream-sound-to-file.js). This Audio Module demo takes line-in and writes it to a file using streams.

###License
MIT or Apache 2.0, at your option
