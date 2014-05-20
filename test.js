var tessel = require('tessel');
var fs = require('fs');
var audio = require('./').use(tessel.port('a'));
var song = fs.readFileSync('/app/sample.mp3');

audio.on('ready', function() {
  console.log("Ready to go!");
  // testSwitchRecordPlay();
  testRecording();
  // testPlayback();
  // testQueue();
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

function testSwitchPlayRecord() {
  console.log('playing song.');
  audio.play(song, function(err) {
    if (err) return console.log("err playing..", err);
    else {
      console.log('finished playing...');
      audio.startRecording();
    }
  })
}

function testSwitchRecordPlay() {
  console.log('recording song.');
  audio.startRecording(function recStarted(err) {
    if (err) return console.log("err starting recording..", err);
  });
  setTimeout(function() {
    console.log('calling stop recording...');
    audio.stopRecording(function recStopped(err) {
      if (err) return console.log("err stopping recording..", err);
      else {
        audio.queue(song);
      }
    })
  }, 3000);
}

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

function testQueue() {
  console.log('testing queue');
  audio.setVolume(20, 20, function(e) {
    audio.play(song);
    audio.queue(song);
    audio.queue(song);
    audio.queue(song);
    audio.queue(song);
  });
}
