const bcrypt = require('bcrypt');

const lozinka = 'lozinka123
    ';

bcrypt.hash(lozinka, 12).then(hash => {
    console.log('HASH:', hash);
});
