// VS1053b module

var fs = require('fs');

// VS10xx SCI Registers

var SCI_MODE = 0x00
  , SCI_STATUS = 0x01
  , SCI_BASS = 0x02
  , SCI_CLOCKF = 0x03
  , SCI_DECODE_TIME = 0x04
  , SCI_AUDATA = 0x05
  , SCI_WRAM = 0x06
  , SCI_WRAMADDR = 0x07
  , SCI_HDAT0 = 0x08
  , SCI_HDAT1 = 0x09
  , SCI_AIADDR = 0x0A
  , SCI_VOL = 0x0B
  , SCI_AICTRL0 = 0x0C
  , SCI_AICTRL1 = 0x0D
  , SCI_AICTRL2 = 0x0E
  , SCI_AICTRL3 = 0x0F

function connect (port)
{
  var MP3_XCS = port.gpio(1).output().high() //Control Chip Select Pin (for accessing SPI Control/Status registers)
  var MP3_DCS = port.gpio(2).output().high() //Data Chip Select / BSYNC Pin
  var MP3_DREQ = port.gpio(3).input() //Data Request Pin: Player asks for more data

  var spi = new port.SPI({
    clockSpeed: 1000000,
    dataMode: 0
  })


  function SPItransfer (byte)
  {
    return spi.transferSync([byte])[0];
  }

  //Read the 16-bit value of a VS10xx register
  function readSciRegister16 (addressbyte)
  {
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

  function writeSciRegister (addressbyte, highbyte, lowbyte)
  {
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

  function writeSciRegister16 (addressbyte, word)
  {
    writeSciRegister (addressbyte, (word >> 8) & 0xFF, word & 0xFF);
  }

  function setVolume (leftchannel, rightchannel)
  {
    // Set VS10xx Volume Register
    writeSciRegister(SCI_VOL, leftchannel, rightchannel);
  }


  // VS1053b generic chip gpio functions

  function setChipGpioDir (arg) {
    writeSciRegister(SCI_WRAMADDR, 0xC0, 0x17);
    writeSciRegister(SCI_WRAM, 0x00, arg);
  }

  function setChipGpio (arg) {
    writeSciRegister(SCI_WRAMADDR, 0xC0, 0x19);
    writeSciRegister(SCI_WRAM, 0x00, arg)
  }


  // Tessel-specific headphones/mic options

  var useLineOut = 0;
  var useLineIn = 0;

  function _setChipGpioDir () {
    setChipGpioDir((1 << 7) + (1 << 5)) // enable GPIO5 (line in) and GPIO7 (headphones/ext amp)
  }

  function _setChipGpio () {
    setChipGpio((useLineOut << 7) + (useLineIn << 5));
  }

  function enableHeadphones () {
    useLineOut = 0;
    _setChipGpio();
  }

  function enableLineOut (on) {
    useLineOut = 1;
    _setChipGpio();
  }

  function enableMicrophone (on) {
    useLineIn = 0;
    _setChipGpio()
  }

  function enableLineIn (on) {
    useLineIn = 1;
    _setChipGpio();
  }


  function initialize ()
  {
    console.log("Tessel Audio Module");
    SPItransfer(0xFF); //Throw a dummy byte at the bus

    // Soft reset
    console.log('Soft reset');
    writeSciRegister16(SCI_MODE, 0x4800 | 2)

    setVolume(40, 40); //Set initial volume (20 = -10dB)
    writeSciRegister(SCI_MODE, 0x48, 0x00);

    //Let's check the status of the VS1053
    var MP3Mode = readSciRegister16(SCI_MODE);
    console.log("SCI_Mode (0x4800) = 0x", MP3Mode.toString(16));

    var MP3Status = readSciRegister16(SCI_STATUS);
    var vsVersion = (MP3Status >> 4) & 0x000F; //Mask out only the four version bits
    console.log("VS Version (VS1053 is 4) = ", vsVersion);
    //The 1053B should respond with 4. VS1001 = 0, VS1011 = 1, VS1002 = 2, VS1003 = 3

    // Toggle GPIOs
    _setChipGpioDir();
    enableHeadphones();
    enableMicrophone();
    writeSciRegister(SCI_WRAMADDR, 0xC0, 0x19);
    console.log('GPIOS = (0)', readSciRegister16(SCI_WRAM));

    // Set multiplier etc

    writeSciRegister(SCI_CLOCKF, 0x60, 0x00); //Set multiplier to 3.0x
    spi.setClockSpeed(4000000); //Set SPI bus speed to 4MHz (16MHz / 4 = 4MHz)

    var MP3Clock = readSciRegister16(SCI_CLOCKF);
    console.log("SCI_ClockF = 0x", MP3Clock.toString(16));
  }

  function playSample ()
  {
    console.log('Loading mp3');
    var hair = fs.readFileSync('/app/twinfalls.mp3');

    console.log('chunking', hair.length, 'bytes.');

    var len = hair.length;
    var chunks = [], clen = 32;
    var p = 0, i = 0;
    while (p < len) {
      chunks[i] = hair.substr(p, clen);
      i = i + 1;
      p = p + clen;
      // console.log(p);
      // tm.pin_write_digital(MP3_DCS, tm.PIN_LOW);
      // spi.transferSync(hair.substr(p, 32));
      // tm.pin_write_digital(MP3_DCS, tm.PIN_HIGH);
    }

    console.log('done chunking:', chunks.length, 'chunks.');

    MP3_DCS.low();
    var i = 0, len = chunks.length;
    while (i < len) {
      // while (!MP3_DREQ.read()) { }
      spi.send(chunks[i]);
      i = i + 1;
    }
    console.log('done playing.');
  }

  function _recordPatch ()
  {
    console.log('Patching...')
    writeSciRegister16(SCI_WRAMADDR, 0x8010);
    writeSciRegister16(SCI_WRAM, 0x3e12);
    writeSciRegister16(SCI_WRAM, 0xb817);
    writeSciRegister16(SCI_WRAM, 0x3e14);
    writeSciRegister16(SCI_WRAM, 0xf812);
    writeSciRegister16(SCI_WRAM, 0x3e01);
    writeSciRegister16(SCI_WRAM, 0xb811);
    writeSciRegister16(SCI_WRAM, 0x0007);
    writeSciRegister16(SCI_WRAM, 0x9717);
    writeSciRegister16(SCI_WRAM, 0x0020);
    writeSciRegister16(SCI_WRAM, 0xffd2);
    writeSciRegister16(SCI_WRAM, 0x0030);
    writeSciRegister16(SCI_WRAM, 0x11d1);
    writeSciRegister16(SCI_WRAM, 0x3111);
    writeSciRegister16(SCI_WRAM, 0x8024);
    writeSciRegister16(SCI_WRAM, 0x3704);
    writeSciRegister16(SCI_WRAM, 0xc024);
    writeSciRegister16(SCI_WRAM, 0x3b81);
    writeSciRegister16(SCI_WRAM, 0x8024);
    writeSciRegister16(SCI_WRAM, 0x3101);
    writeSciRegister16(SCI_WRAM, 0x8024);
    writeSciRegister16(SCI_WRAM, 0x3b81);
    writeSciRegister16(SCI_WRAM, 0x8024);
    writeSciRegister16(SCI_WRAM, 0x3f04);
    writeSciRegister16(SCI_WRAM, 0xc024);
    writeSciRegister16(SCI_WRAM, 0x2808);
    writeSciRegister16(SCI_WRAM, 0x4800);
    writeSciRegister16(SCI_WRAM, 0x36f1);
    writeSciRegister16(SCI_WRAM, 0x9811);
    writeSciRegister16(SCI_WRAMADDR, 0x8028);
    writeSciRegister16(SCI_WRAM, 0x2a00);
    writeSciRegister16(SCI_WRAM, 0x040e);
    console.log('Done patching.')
  }

  function record ()
  {
    writeSciRegister16(SCI_AICTRL0, 8000);
    writeSciRegister16(SCI_AICTRL1, 0);
    writeSciRegister16(SCI_AICTRL2, 4096);
    writeSciRegister16(SCI_AICTRL3, 0, 0);
    writeSciRegister16(SCI_MODE, readSciRegister16(SCI_MODE) | (0 << 14) | (1 << 12) | (1 << 2));

    _recordPatch();

    while (true) {
      console.log(readSciRegister16(SCI_HDAT0), readSciRegister16(SCI_HDAT1));
      // writeSciRegister16(SCI_WRAMADDR, 0xC044);
      // console.log(readSciRegister16(SCI_WRAM))
    }
  }

  // Some fun initialization
  initialize();

  return {
    enableHeadphones: enableHeadphones,
    enableLineOut: enableLineOut,
    enableMicrophone: enableMicrophone,
    enableLineIn: enableLineIn,

    // gross
    playSample: playSample,
    record: record
  }
}

exports.connect = connect;