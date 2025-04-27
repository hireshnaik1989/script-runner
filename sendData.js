const axios = require('axios');

async function sendDataToGoogleSheet() {
  const data = {
    dispatchDate: "2025-04-25",
    dispatchTime: "12:00",
    pickingOTIF: "95%",
    pickingPendingQty: "100",
    pickingMissedFR: "5",
    packingOTIF: "90%",
    packingPendingQty: "120",
    packingMissedFR: "7",
    sortationOTIF: "85%",
    sortationPendingQty: "140"
  };

  try {
    const response = await axios.post('https://script.google.com/macros/s/AKfycbyC1t8wc95DhKhLnJovTWW4XO236zBC_99RvCLE48MFadEG3FR18nsUZfHnbWVEFD3q/exec', data);
    console.log('Data sent successfully:', response.data);
  } catch (error) {
    console.error('Error sending data:', error);
  }
}

sendDataToGoogleSheet();
