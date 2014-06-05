var tessel = require('tessel');
var fs = require('fs');
var song = fs.readFileSync('/app/sample.mp3');
var audio = require('../').use(tessel.port['A']);
var stream = require('stream');
var http = require('http');



process.debug = true;

function testPlayback() {
  var ret = audio.play(song, function(err) {
    if (err) {
      console.log("error playing song: ", err);
    }
    else {
      console.log("Done playing the song");
    }
  });
}


function testPlayStop() {
  audio.on('play', audio.stop.bind(audio, undefined));
  audio.play(song);
}

function testRecording() {
  audio.setInput('lineIn', function() {
    audio.startRecording('hifi-voice', function() {
      setTimeout(function stopRecording() {
        audio.stopRecording(function stopped() {
          console.log("Stop recording callback called...");
        })
      }, 7000);
    });
  });
}

function testPlayQueue() {
  audio.play(song); 
  audio.queue(song);
  audio.queue(song);
  audio.queue(song);
  audio.queue(song);
}

function testQueue() {
  audio.queue(song);
  audio.queue(song);
  audio.queue(song);
  audio.queue(song);
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

function testSwitchPlayRecord() {
  console.log('playing song.');
  audio.play(song, function(err) {
    if (err) return console.log("err playing..", err);
    else {
      console.log('finished playing...');
      audio.startRecording();
      setTimeout(function() {
        console.log('calling stop recording...');
        audio.stopRecording(function recStopped(err) {
          if (err) return console.log("err stopping recording..", err);
        })
      }, 3000);
    }
  })
}

function testPlayStream() {
  console.log('opening file...');
  var file = fs.createReadStream('./sample.mp3');
  console.log('piping file contents into audio...');
  file.pipe(audio.createPlayStream());
  console.log('done piping');
}

function testRecordStream() {
  audio.setInput('lineIn', function(err) {
    var rec = audio.createRecordStream("stereo-music");
    var file = fs.createWriteStream('rec.ogg');
    console.log('starting pipe...');
    rec.pipe(file);
    console.log('setting timeout');
    setTimeout(function() {
      console.log('stopping recording');
      audio.stopRecording(function() {
        console.log("stop recording callback after stream called...");
        console.log('creating read stream!')

        fs.createReadStream('/app/rec.ogg').pipe(audio.createPlayStream());
      });
    }, 5000);
  });
}

function testPlayStreamSmallChunks(chunkSize) {
  var chunk = chunkSize;
  var incr = Math.floor(song.length/chunk);
  console.log('length', song.length, 'floor', Math.floor(song.length/chunk));
  var rs = new stream.Readable;

  for (var i = 0; i < incr; i++) {
    var pos = chunk * i;
    rs.push(song.slice(pos, pos + chunk));
  }

  if (song.length%chunk) {
    var pos = chunk * incr;
    rs.push(song.slice(pos, pos + song.length%chunk));
  }

  rs.push(null);

  console.log('piping!');
  rs.pipe(audio.createPlayStream())
}

function testInputs() {
  audio.setInput('mic', function(err) {
    console.log('line in is set', err);
    audio.startRecording('voice', function(err) {
      console.log('started recording');
      setTimeout(audio.stopRecording.bind(audio), 12000);
    });
  });
}


function testOutputs() {
  audio.setOutput('lineOut', function(err) {
    console.log('set to line in', err);
    audio.play(song, function(err) {
      console.log('finished playing song', err);
      console.log('finished with line in.');
      audio.setOutput('headphones', function(err) {
        console.log('set to phones', err);
        audio.play(song);
      });
    });
  });
}

function testReadSDCard() {
  var sdcard = require('sdcard').use(tessel.port['C']);

  sdcard.on('ready', function() {
    console.log('attempting to get file systems...');
    sdcard.getFilesystems(function(err, fss) {
      if (err) throw err;
      var fs = fss[0];
      console.log('attempting to read file...');
      var sat = fs.createReadStream('sample.mp3');
      sat.pipe(audio.createPlayStream());
      // var ws = new require('stream').Writable();
      // ws._write = function(chunk, enc, next) {
      //   console.log('got chunk', chunk.length);
      //   next();
      // }
      // sat.pipe(ws);
    })
  })
}

function testWriteSDCard() {
  var sdcard = require('sdcard').use(tessel.port['C']);

  sdcard.on('ready', function() {
    console.log('attempting to get file systems...');
    sdcard.getFilesystems(function(err, fss) {
      if (err) throw err;
      var sd = fss[0];
      console.log('attempting to read file...');
      audio.setInput('lineIn', function() {
        var str = sd.createWriteStream('recording.ogg');
        audio.createRecordStream('voice').pipe(str);
        setTimeout(function() {
          audio.stopRecording();
        }, 5000);
      });
    })
  })
}

function testWebStream() {

  http.get('http://192.168.128.252:3000/music', function(res) {
    console.log('res', res);
    res.on('data', function(data) {
      console.log('got data', data.length);
      audio.play(data);
    })
    // res.pipe(audio.createPlayStream());
  });
}

audio.on('ready', function() {
  console.log("Ready to go!");
  audio.setVolume(20, 20, function(e) {
    testWebStream();
    // testWriteSDCard();
    // testReadSDCard();
    // testOutputs();
    // testInputs();
    // testPlayStreamSmallChunks(5000);
    // testRecordStream();
    // testPlayStream();
    // testSwitchPlayRecord();
    // testSwitchRecordPlay();
    // testQueue();
    // testPlayQueue();
    // testRecording();
    // testPlayStop();
    // testPlayback();
  });
});