const bcrypt = require('bcrypt');
Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('viewer123', 10),
]).then(([adminHash, viewerHash]) => {
    const fs = require('fs');
    fs.writeFileSync('./scripts/hashes.txt', `admin:${adminHash}\nviewer:${viewerHash}\n`);
    console.log('Done');
});
