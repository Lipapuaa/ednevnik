const bcrypt = require('bcrypt');

const lozinka = 'admin67';

bcrypt.hash(lozinka, 12).then(hash => {
    console.log('HASH:', hash);
});
