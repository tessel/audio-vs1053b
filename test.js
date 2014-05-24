var tessel = require('tessel');
var fs = require('fs');
var song = fs.readFileSync('/app/playback/sample.mp3');
var audio = require('./').use(tessel.port['A']);
var Readable = require('stream').Readable;
var filename = process.argv[2] || 'audio-recording.ogg';
var datas = [];

audio.on('data', function weRecorded(data) {
  console.log('got this recording data!', data.length);;
  datas.push(data);
})

audio.on('error', function(err) {
  console.log("ERROR:", err);
})

audio.on('startRecording', function() {
  console.log('started recording!');
});


audio.on('stopRecording', function() {
  console.log('stopped recording!');
  var rec = Buffer.concat(datas);
  console.log('playing len', rec.length);
  process.sendfile(filename, rec);
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
        audio.play(song);
      }
    })
  }, 3000);
}

function testRecording() {
  audio.startRecording('hifi-voice', function() {
    setTimeout(function stopRecording() {
      audio.stopRecording(function stopped() {
        console.log("Stop recording callback called...");
      })
    }, 4000);
  });
}

function testPlayback() {
  console.log('setting volume...');
  audio.setVolume(20, 20, function(err) {
    if (err) return console.log('err setting volume', err);
    console.log('volume set.');
    
    console.log('file read. Beginning to play...', song.length);  
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

function testPlayStream() {
  var file = fs.createReadStream('/app/playback/sample.mp3');
  file.pipe(audio.createPlayStream());
}

function testRecordStream() {
  audio.createRecordStream().pipe(fs.createWriteStream('rec.ogg'));

  setTimeout(function() {
    console.log('STOPPING');
    audio.stopRecording();
  }, 2000);
}


audio.on('ready', function() {
  console.log("Ready to go!");
  // testRecordStream();
  // testPlayStream();
  // testSwitchPlayRecord();
  // testSwitchRecordPlay();
  // testRecording();
  // setInterval(testPlayback, 3000);
  testPlayback();
  // testPlayback();
  // testQueue();
  
});
