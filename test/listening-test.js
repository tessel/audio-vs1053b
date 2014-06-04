var tessel = require('tessel');
var fs = require('fs');
var song = fs.readFileSync('/app/sample.mp3');
var audio = require('../').use(tessel.port['A']);
var stream = require('stream');
var filename = 'ogg3.ogg';
console.log("Saving to filename:", filename);
var datas = [];

audio.on('data', function weRecorded(data) {
  console.log('got this', data);
  console.log('of length', data.length);
  datas.push(data);
})

audio.on('stopRecording', function() {
  var rec = Buffer.concat(datas);
  console.log('playing len', rec.length);
  console.log('saving to', filename);
  process.sendfile(filename, rec);
  fs.writeFileSync(filename, rec);
  fs.createReadStream(filename).pipe(audio.createPlayStream());
});

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

function testQueue() {
  audio.queue(song);
  audio.queue(song);
  audio.queue(song);
  audio.queue(song);
}

function testPlayStop() {
  audio.on('play', audio.stop.bind(audio, undefined));
  audio.play(song);
}

function testPlayQueue() {
  audio.play(song); 
  audio.queue(song);
  audio.queue(song);
  audio.queue(song);
  audio.queue(song);
}

function testPlayStream() {
  var file = fs.createReadStream('/app/sample.mp3');
  file.pipe(audio.createPlayStream());
}

function testRecordStream() {
  var rec = audio.createRecordStream("voice");
  var file = fs.createWriteStream('rec.ogg');
  console.log('starting pipe...');
  rec.pipe(file);
  var interval;
  setTimeout(function() {
    clearInterval(interval)
    audio.stopRecording(function() {
      console.log("STOP RECORDING DAMMIT recording callback after stream called...");
      // rec.unpipe(file);
      console.log('creating read stream!')
      // fs.createReadStream('/app/rec.ogg').pipe(audio.createPlayStream());
      // console.log('beginning to pipe.');
    });
  }, 5000);

  console.log('what?');
  interval = setInterval(function() {
    console.log("TICK");
  }, 1000);
  console.log('INTERVAL SET');
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

  rs.pipe(audio.createPlayStream())
}

audio.on('ready', function() {
  console.log("Ready to go!");
  // audio.setVolume(20, 20, function(e) {
    // testOutputs();
    // testInputs();
    // testPlayStreamSmallChunks(5000);
    // testRecordStream();
    // testPlayStream();
    // testSwitchPlayRecord();
    // testSwitchRecordPlay();
    // testQueue();
    // testPlayQueue();
    testRecording();
    // testPlayStop();
    // testPlayback();
  // });
});