var tessel = require('tessel');
var fs = require('fs');


//VS10xx SCI Registers
var SCI_MODE = 0x00
var SCI_STATUS = 0x01
var SCI_BASS = 0x02
var SCI_CLOCKF = 0x03
var SCI_DECODE_TIME = 0x04
var SCI_AUDATA = 0x05
var SCI_WRAM = 0x06
var SCI_WRAMADDR = 0x07
var SCI_HDAT0 = 0x08
var SCI_HDAT1 = 0x09
var SCI_AIADDR = 0x0A
var SCI_VOL = 0x0B
var SCI_AICTRL0 = 0x0C
var SCI_AICTRL1 = 0x0D
var SCI_AICTRL2 = 0x0E
var SCI_AICTRL3 = 0x0F


var hair = fs.readFileSync('/app/twinfalls.mp3');

var port = tessel.port('a');


var MP3_XCS = port.gpio(1).input() //Control Chip Select Pin (for accessing SPI Control/Status registers)
var MP3_DCS = port.gpio(2).output().high() //Data Chip Select / BSYNC Pin
var MP3_DREQ = port.gpio(3).output().high() //Data Request Pin: Player asks for more data

var spi = new port.SPI({
  clockSpeed: 1000000,
  dataMode: tessel.SPIDataMode.Mode0
})


function SPItransfer (byte) {
  return spi.transferSync([byte])[0];
}

//Read the 16-bit value of a VS10xx register
function Mp3ReadRegister (addressbyte){
  while (!MP3_DREQ.read()) ; //Wait for DREQ to go high indicating IC is available
  MP3_XCS.low(); //Select control

  //SCI consists of instruction byte, address byte, and 16-bit data word.
  SPItransfer(0x03); //Read instruction
  SPItransfer(addressbyte);

  var response1 = SPItransfer(0xFF);
  while (!MP3_DREQ.read()) ; //Wait for DREQ to go high indicating command is complete
  var response2 = SPItransfer(0xFF); //Read the second byte
  while (!MP3_DREQ.read()) ; //Wait for DREQ to go high indicating command is complete

  MP3_XCS.high(); //Deselect Control

  var resultvalue = response1 << 8;
  resultvalue = resultvalue + response2;
  return resultvalue;
}

function Mp3WriteRegister(addressbyte, highbyte, lowbyte){
  while(!MP3_DREQ.read()) ; //Wait for DREQ to go high indicating IC is available
  MP3_XCS.low(); //Select control

  //SCI consists of instruction byte, address byte, and 16-bit data word.
  SPItransfer(0x02); //Write instruction
  SPItransfer(addressbyte);
  SPItransfer(highbyte);
  SPItransfer(lowbyte);
  while(!MP3_DREQ.read()) ; //Wait for DREQ to go high indicating command is complete
  MP3_XCS.high(); //Deselect Control
}

//Set VS10xx Volume Register
function Mp3SetVolume (leftchannel, rightchannel){
  Mp3WriteRegister(SCI_VOL, leftchannel, rightchannel);
}

console.log("MP3 Shield Example");
SPItransfer(0xFF); //Throw a dummy byte at the bus

Mp3SetVolume(40, 40); //Set initial volume (20 = -10dB)
Mp3WriteRegister(SCI_MODE, 0x48, 0x00);

//Let's check the status of the VS1053
var MP3Mode = Mp3ReadRegister(SCI_MODE);
console.log("SCI_Mode (0x4800) = 0x", MP3Mode.toString(16));

var MP3Status = Mp3ReadRegister(SCI_STATUS);
var vsVersion = (MP3Status >> 4) & 0x000F; //Mask out only the four version bits
console.log("VS Version (VS1053 is 4) = ", vsVersion);
//The 1053B should respond with 4. VS1001 = 0, VS1011 = 1, VS1002 = 2, VS1003 = 3


Mp3WriteRegister(SCI_CLOCKF, 0x60, 0x00); //Set multiplier to 3.0x
spi.setClockSpeed(4000000); //Set SPI bus speed to 4MHz (16MHz / 4 = 4MHz)

var MP3Clock = Mp3ReadRegister(SCI_CLOCKF);
console.log("SCI_ClockF = 0x", MP3Clock.toString(16));

console.log('chunking.');

var len = hair.length;
var chunks = [], clen = 2048;
for (var p = 0; p < len; p = p + clen) {
  chunks.push(hair.substr(p, clen));
  // console.log(p);
  // tm.pin_write_digital(MP3_DCS, tm.PIN_LOW);
  // spi.transferSync(hair.substr(p, 32));
  // tm.pin_write_digital(MP3_DCS, tm.PIN_HIGH);
}

console.log('done chunking.');

MP3_DCS.low();
var i = 0, len = chunks.length;
while (i < len) {
  // while (!MP3_DREQ.read()) { }
  spi.send(chunks[i]);
  i = i + 1;
}
console.log('done playing.');