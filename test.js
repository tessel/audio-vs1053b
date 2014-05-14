var tessel = require('tessel');
var fs = require('fs');
var audio = require('./').use(tessel.port('a'));

audio.on('ready', function() {
  console.log("Ready to go!");
  audio.setVolume(2, 2, function(err) {
    if (err) return console.log('err setting volume', err);
    var song = fs.readFileSync('/app/sample.mp3');
    audio.play(song, function(err) {
      if (err) {
        console.log("error playing song: ", err);
      }
      else {
        console.log("Done playing the song");
      }
    });
  })
});

audio.on('error', function(err) {
  console.log("Failed to connect", err);
})

setInterval(function(){}, 20000);