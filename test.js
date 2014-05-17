var tessel = require('tessel');
var fs = require('fs');
var audio = require('./').use(tessel.port('a'));

audio.on('ready', function() {
  console.log("Ready to go!");
  testRecording();
  // testPlayback();
});

audio.on('data', function weRecorded(data) {
  console.log('got this recording data!', data);
})

audio.on('error', function(err) {
  console.log("Failed to connect", err);
})

audio.on('startRecording', function() {
  console.log('started recording!');
});

audio.on('stopRecording', function() {
  console.log('stopped recording!');
});

function testRecording() {
  audio.startRecording(function() {
    setTimeout(function stopRecording() {
      audio.stopRecording(function stopped() {
        console.log("Stop recording callback called...");
      })
    }, 3000);
  })
}

function testPlayback() {
  console.log('setting volume...');
  audio.setVolume(20, 20, function(err) {
    if (err) return console.log('err setting volume', err);
    console.log('volume set.');
    var song = fs.readFileSync('/app/sample.mp3');
    console.log('file read. Beginning to play...');  
    audio.play(song, function(err) {
      if (err) {
        console.log("error playing song: ", err);
      }
      else {
        console.log("Done playing the song");
      }
    });
  });
}

setInterval(function() {}, 20000);