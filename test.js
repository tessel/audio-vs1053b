var tessel = require('tessel');
var fs = require('fs');
var audio = require('./').use(tessel.port['A']);
// var song = fs.readFileSync('/app/aud1s.ogg');

function sendFile(buf) {
  console.log('sending', buf);
  process.binding('hw').usb_send(0xFFFF, buf);
}

var datas = [];
audio.on('ready', function() {
  console.log("Ready to go!");
  // testSwitchPlayRecord();
  // testSwitchRecordPlay();
  testRecording();
  // testPlayback();
  // testQueue();
});

audio.on('data', function weRecorded(data) {
  console.log('got this recording data!', data.length);
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
  console.log('playing len', rec);
  sendFile(rec);
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
        // audio.play(rec);
      }
    })
  }, 3000);
}

function testRecording() {
  audio.startRecording('voice', function() {
    setTimeout(function stopRecording() {
      audio.stopRecording(function stopped() {
        console.log("Stop recording callback called...");
      })
    }, 1000);
  });
  audio.play(song);
  audio.queue(song);
  audio.stop();
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

// // var chunk = 100;
// // var incr = Math.floor(song.length/chunk);
// // console.log('length', song.length, 'floor', Math.floor(song.length/chunk));

// // for (var i = 0; i < incr; i++) {
// //   var pos = chunk * i;
// //   console.log('pos', pos);
// //   audio.emit('data', song.slice(pos, pos + chunk));
// // }

// // if (song.length%chunk) {
// //   var pos = chunk * incr;
// //   console.log('last', pos, 'to', song.length%chunk);
// //   audio.emit('data',song.slice(pos, pos + song.length%chunk));
// // }

// // audio.emit('stopRecording');

// // sendFile(Buffer.concat(datas));
