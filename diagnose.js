// Simple script to read the HTML file and output line 62
const fs = require('fs');
const path = require('path');

// Read the index.html file
const filePath = path.join(__dirname, 'index.html');
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }

  // Split the file into lines
  const lines = data.split('\n');
  
  // Check if line 62 exists
  if (lines.length >= 62) {
    console.log(`Line 62 (${lines[61].length} chars):`);
    console.log(lines[61]);
    
    // Print character at position 106 if it exists
    if (lines[61].length >= 106) {
      console.log(`Character at position 106: "${lines[61][105]}"`);
      console.log(`Substring around position 106: "${lines[61].substring(100, 110)}"`);
    } else {
      console.log('Line is shorter than 106 characters');
    }
  } else {
    console.log('File has fewer than 62 lines');
  }
});
